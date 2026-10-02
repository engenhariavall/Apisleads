/**
 * server/scripts/syncAllLeads.js
 * 
 * ROTINA DE ATUALIZAÇÃO EM LOTE: MIGRAÇÃO E RE-SINCRONIZAÇÃO DA BASE DE LEADS
 * 
 * 1. Limpeza de Resíduos e Reset de Mocks:
 *    - Varredura em registros com endereco_operacional contendo "Avenida das Nações Unidas 2778"
 *      ou similares e reset para NULL, com address_reconciled = 0.
 * 2. Geocodificação em Lote dos Endereços Fiscais:
 *    - Itera sobre as empresas da base local;
 *    - Geocodifica endereços com logradouro e número via OpenStreetMap / Nominatim estruturado;
 *    - Atualiza latitude e longitude no SQLite retirando do centróide genérico de praça.
 */

import db from '../src/config/database.js';
import { geocodeFiscalAddress } from '../src/services/addressResolverService.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executa a sincronização e migração em lote de todos os leads
 * @param {Object} options Configurações adicionais
 * @returns {Promise<Object>} Resumo da execução
 */
export async function syncAllLeads(options = {}) {
  const startTime = Date.now();
  console.log('\n============================================================');
  console.log('🚀 INICIANDO ROTINA DE RE-SINCRONIZAÇÃO EM LOTE (BASE REAL)');
  console.log('============================================================\n');

  // 1. Limpeza de resíduos de mocks
  console.log('🧹 [1/3] Executando varredura e purge de resíduos de mocks...');
  const resetStmt = db.prepare(`
    UPDATE leads 
    SET endereco_operacional = NULL,
        lat_operacional = NULL,
        lng_operacional = NULL,
        address_reconciled = 0,
        reconciliation_source = NULL,
        reconciliation_confidence = NULL
    WHERE endereco_operacional LIKE '%Nações Unidas%'
       OR endereco_operacional LIKE '%Nacoes Unidas%'
       OR endereco_operacional LIKE '%Centro Empresarial%'
  `);
  const resetResult = resetStmt.run();
  console.log(`   ✔ Resíduos limpos: ${resetResult.changes} registros redefinidos.`);

  // 2. Seleciona os leads elegíveis para geocodificação
  // Foca nas empresas que possuem endereço cadastral
  const selectQuery = options.all 
    ? 'SELECT id, cnpj, razao_social, nome_fantasia, logradouro, numero, bairro, municipio, uf, cep, latitude, longitude, target_type, porte, is_competitor FROM leads'
    : "SELECT id, cnpj, razao_social, nome_fantasia, logradouro, numero, bairro, municipio, uf, cep, latitude, longitude, target_type, porte, is_competitor FROM leads WHERE (target_type = 'BUYER' AND porte != 'MEI') OR is_competitor = 1";

  const leads = db.prepare(selectQuery).all();
  console.log(`📍 [2/3] Total de empresas selecionadas para re-sincronização: ${leads.length}`);

  let updatedCount = 0;
  let geocodedStreetCount = 0;
  let alreadyPreciseCount = 0;
  let errorsCount = 0;

  const updateCoordStmt = db.prepare(`
    UPDATE leads 
    SET latitude = ?, longitude = ?
    WHERE id = ?
  `);

  // Agrupa chamadas com rate limiting para respeitar a política de uso do Nominatim
  const BATCH_SIZE = 1;
  const DELAY_BETWEEN_REQUESTS_MS = 250; // 4 req/s max, seguro e estável

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const logradouro = (lead.logradouro || '').trim();
    const numero = (lead.numero || '').trim();
    const mun = (lead.municipio || '').trim();
    const uf = (lead.uf || '').trim();

    if (!logradouro || logradouro === 'NÃO INFORMADO' || logradouro === 'SEM LOGRADOURO' || !mun || !uf) {
      continue;
    }

    try {
      // Executa a geocodificação estruturada
      const geo = await geocodeFiscalAddress(lead);

      if (geo && geo.lat && geo.lng) {
        if (geo.precision === 'STREET_LEVEL') {
          // Atualiza coordenadas no banco SQLite
          updateCoordStmt.run(geo.lat, geo.lng, lead.id);
          geocodedStreetCount++;
          updatedCount++;
        } else {
          alreadyPreciseCount++;
        }
      }

      // Pequeno throttle se foi feita consulta HTTP
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    } catch (err) {
      errorsCount++;
      console.warn(`   ⚠️ Erro ao geocodificar ${lead.cnpj} (${mun}/${uf}):`, err.message);
    }

    if ((i + 1) % 25 === 0 || (i + 1) === leads.length) {
      const pct = Math.round(((i + 1) / leads.length) * 100);
      console.log(`   ⏳ Progresso: ${i + 1}/${leads.length} (${pct}%) | Ruas Reais Geocodificadas: ${geocodedStreetCount}`);
    }
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);

  console.log('\n============================================================');
  console.log('✅ RE-SINCRONIZAÇÃO EM LOTE CONCLUÍDA!');
  console.log(`⏱️ Tempo total: ${durationSec}s`);
  console.log(`📊 Mocks purgados: ${resetResult.changes}`);
  console.log(`📍 Coordenadas de rua atualizadas: ${geocodedStreetCount}`);
  console.log(`🏙️ Mantidos no centróide ou já precisos: ${alreadyPreciseCount}`);
  console.log(`⚠️ Falhas: ${errorsCount}`);
  console.log('============================================================\n');

  return {
    success: true,
    total_processed: leads.length,
    mocks_purged: resetResult.changes,
    geocoded_street_level: geocodedStreetCount,
    duration_seconds: durationSec
  };
}

// Execução standalone via CLI
if (process.argv[1]?.endsWith('syncAllLeads.js')) {
  syncAllLeads({ all: process.argv.includes('--all') })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Erro na execução:', err);
      process.exit(1);
    });
}
