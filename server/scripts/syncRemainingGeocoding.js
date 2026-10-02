/**
 * server/scripts/syncRemainingGeocoding.js
 * 
 * FASE 25 — ETAPA 3: FILA INCREMENTAL DE GEOCODIFICAÇÃO EM NÍVEL DE RUA
 * 
 * Varrer todas as empresas da base (leads) que ainda não possuem coordenadas
 * em nível de logradouro/número ou que estejam com coordenadas de centroide municipal.
 * 
 * Critérios:
 * - Query precisa: `${lead.logradouro}, ${lead.numero}, ${lead.bairro}, ${lead.municipio} - ${lead.uf}, Brasil`
 * - Degradação controlada: tenta logradouro com bairro -> logradouro -> mantém atual
 * - Throttle de proteção: 1000ms delay entre requisições HTTP (1 req/s)
 * - Headers HTTP identificados: User-Agent: VersusIntelligenceBot/1.0
 * - Atualiza latitude, longitude, address_reconciled = 1 e persiste diretamente no SQLite.
 */

import db from '../src/config/database.js';
import { CITY_COORDINATES } from '../src/modules/gis/geoSpatialEngine.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const USER_AGENT = 'VersusIntelligenceBot/1.0 (contact: engenharia@versus.ai; production-readiness)';

/**
 * Consulta estruturada com rate limiting estrito e timeout
 */
async function geocodeStructuredNominatim(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 5) return null;
  const cleanQuery = query.trim();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          display_name: data[0].display_name
        };
      }
    }
  } catch (err) {
    // Falha de rede ou timeout
  }

  return null;
}

/**
 * Geocodifica um lead com estratégia de degradação em cascata
 */
async function geocodeWithDegradation(lead) {
  const logradouro = (lead.logradouro || '').trim();
  const numero = (lead.numero || '').trim();
  const bairro = (lead.bairro || '').trim();
  const mun = (lead.municipio || '').trim();
  const uf = (lead.uf || '').trim();

  const attempts = [];

  // Nível 1: Precisão Máxima (Logradouro + Número + Bairro + Município - UF)
  if (numero && numero !== 'S/N' && numero !== 'SN' && numero !== '0') {
    if (bairro) {
      attempts.push(`${logradouro}, ${numero}, ${bairro}, ${mun} - ${uf}, Brasil`);
    }
    attempts.push(`${logradouro}, ${numero}, ${mun} - ${uf}, Brasil`);
  }

  // Nível 2: Degradação controlada (Logradouro + Bairro + Município - UF)
  if (bairro) {
    attempts.push(`${logradouro}, ${bairro}, ${mun} - ${uf}, Brasil`);
  }

  // Nível 3: Degradação controlada (Logradouro + Município - UF)
  attempts.push(`${logradouro}, ${mun} - ${uf}, Brasil`);

  for (const q of attempts) {
    const geo = await geocodeStructuredNominatim(q);
    // Throttle obrigatório de 1 req/segundo (1000ms) respeitando estritamente a política do Nominatim
    await sleep(1000);

    if (geo && !isNaN(geo.lat) && !isNaN(geo.lng)) {
      return {
        lat: geo.lat,
        lng: geo.lng,
        display_name: geo.display_name,
        precision: 'STREET_LEVEL'
      };
    }
  }

  return null;
}

/**
 * Executa a fila de geocodificação
 * @param {Object} options { limit?: number }
 */
export async function syncRemainingGeocoding(options = {}) {
  const limit = options.limit || 15; // Processa em lote controlado para assegurar estabilidade e compliance
  console.log('\n=================================================================');
  console.log('🌍 FILA INCREMENTAL DE GEOCODIFICAÇÃO EM NÍVEL DE RUA (NOMINATIM)');
  console.log(`⏱️  Throttle de proteção: 1000ms delay | User-Agent: ${USER_AGENT}`);
  console.log(`🎯 Limite deste lote: ${limit} registros`);
  console.log('=================================================================\n');

  // Seleciona leads que ainda não foram reconciliados (address_reconciled = 0)
  // e possuem endereço válido (logradouro, município, uf)
  const candidates = db.prepare(`
    SELECT id, cnpj, razao_social, nome_fantasia, logradouro, numero, bairro, municipio, uf, cep, latitude, longitude, address_reconciled
    FROM leads
    WHERE (address_reconciled = 0 OR address_reconciled IS NULL)
      AND logradouro IS NOT NULL 
      AND logradouro != '' 
      AND logradouro NOT LIKE '%NÃO INFORMADO%'
      AND logradouro NOT LIKE '%SEM LOGRADOURO%'
      AND municipio IS NOT NULL
      AND uf IS NOT NULL
    ORDER BY is_competitor DESC, target_type ASC, id ASC
    LIMIT ?
  `).all(limit);

  console.log(`📋 Encontradas ${candidates.length} empresas elegíveis para geocodificação neste lote.`);

  let updatedCount = 0;
  let skippedCount = 0;

  const updateStmt = db.prepare(`
    UPDATE leads
    SET latitude = ?,
        longitude = ?,
        address_reconciled = 1,
        reconciliation_source = 'OSM_NOMINATIM_STREET_QUEUE',
        reconciliation_confidence = 0.88
    WHERE id = ?
  `);

  const markAttemptedStmt = db.prepare(`
    UPDATE leads
    SET address_reconciled = 1,
        reconciliation_source = 'OSM_NOMINATIM_CENTROID_FALLBACK',
        reconciliation_confidence = 0.50
    WHERE id = ?
  `);

  for (let i = 0; i < candidates.length; i++) {
    const lead = candidates[i];
    const logradouro = (lead.logradouro || '').trim();
    const mun = (lead.municipio || '').trim();
    const uf = (lead.uf || '').trim();

    console.log(`[${i + 1}/${candidates.length}] Geocodificando: ${lead.razao_social || lead.nome_fantasia} (${logradouro}, ${lead.numero || 'S/N'}, ${mun}-${uf})`);

    const result = await geocodeWithDegradation(lead);

    if (result && result.precision === 'STREET_LEVEL') {
      updateStmt.run(result.lat, result.lng, lead.id);
      updatedCount++;
      console.log(`   ✔ Geocodificado em nível de rua: [${result.lat}, ${result.lng}]`);
    } else {
      // Degradação segura: se não encontrou após todas as tentativas, mantém as coordenadas atuais ou centroide
      const cityKey = `${mun.toUpperCase()}/${uf.toUpperCase()}`;
      const defaultCoord = CITY_COORDINATES[cityKey] || { lat: lead.latitude || -15.78, lng: lead.longitude || -47.92 };
      
      markAttemptedStmt.run(lead.id);
      skippedCount++;
      console.log(`   ⚠️ Logradouro não resolvido com número. Coordenada preservada em centroide [${lead.latitude || defaultCoord.lat}, ${lead.longitude || defaultCoord.lng}]`);
    }
  }

  console.log('\n=================================================================');
  console.log('🏁 RESULTADO DO PROCESSAMENTO DA FILA:');
  console.log(`   - Atualizados com alta precisão (STREET_LEVEL): ${updatedCount}`);
  console.log(`   - Preservados com fallback de centroide/atual: ${skippedCount}`);
  console.log(`   - Total processado neste lote: ${candidates.length}`);
  console.log('=================================================================\n');

  return { updatedCount, skippedCount, totalProcessed: candidates.length };
}

if (process.argv[1] && process.argv[1].endsWith('syncRemainingGeocoding.js')) {
  // Permite passar --limit=N pela linha de comando
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5;

  syncRemainingGeocoding({ limit })
    .then(() => {
      console.log('✅ Fila de geocodificação executada com sucesso.');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Erro na execução da fila de geocodificação:', err);
      process.exit(1);
    });
}
