/**
 * server/scripts/remoteValidatePhase5.js
 * 
 * Script de validacao e execucao da Fase 5 na VPS:
 * 1. Verifica os sinais do Radar Sparks existentes no banco SQLite.
 * 2. Enriquecimento cadastral de sinais BNDES chave (ex: S S EMPREENDIMENTOS, V S DRONES, GIONGO).
 * 3. Valida coordenadas, geofencing e geracao de Custom Audiences Meta Ads (SHA-256).
 */

import db from '../src/config/database.js';
import { CnpjResolutionService } from '../src/services/cnpjResolutionService.js';
import { SparksEngineService } from '../src/services/sparksEngineService.js';

async function main() {
  console.log('=== VALIDACAO FASE 5: ENRIQUECIMENTO E HOMOLOGACAO NA VPS ===');

  // 1. Busca sinais BNDES prioritarios
  const sparks = db.prepare(`
    SELECT id, titulo, titular_identificado, municipio, uf, valor_monetario, documento_identificado, lat, lng
    FROM sparks_signals
    WHERE spark_type = 'CREDITO_BNDES'
    ORDER BY created_at DESC
    LIMIT 10
  `).all();

  console.log(`Total de sinais BNDES carregados: ${sparks.length}`);

  // Se o sinal piloto S S EMPREENDIMENTOS existir, processa
  const pilot = db.prepare(`SELECT id, titular_identificado, documento_identificado FROM sparks_signals WHERE titular_identificado LIKE '%S S EMPREENDIMENTOS%' OR titular_identificado LIKE '%V S DRONES%' LIMIT 2`).all();

  console.log('Sinais pilotos identificados:', pilot.map(p => `${p.id} - ${p.titular_identificado} (${p.documento_identificado || 'sem cnpj'})`));

  for (const p of pilot) {
    console.log(`\n--- Resolvendo e enriquecendo sinal [${p.id}] ${p.titular_identificado} ---`);
    try {
      const res = await CnpjResolutionService.resolveAndEnrichSignal(p.id, 'tenant-root-default');
      console.log('Resultado resolucao:', {
        success: res.success,
        cnpj: res.cnpj,
        socios_count: res.socios ? res.socios.length : 0,
        socio_decisor: res.socio_decisor?.nome,
        telefone: res.contato_principal,
        coordenadas: res.coordenadas,
        geofencing: res.geofencing
      });
    } catch (err) {
      console.error(`Erro ao resolver sinal ${p.id}:`, err.message);
    }
  }

  // 2. Testa exportacao Meta Ads a partir da base
  if (pilot.length > 0) {
    const testSignalId = pilot[0].id;
    console.log(`\n--- Validando Pipeline Meta Ads (SHA-256) para [${testSignalId}] ---`);
    const metaRes = await SparksEngineService.exportSignalsMetaAds([testSignalId], 'tenant-root-default');
    console.log(`Linhas geradas Custom Audiences: ${metaRes.hashed_rows.length}`);
    console.log(`Alfinetes de Geofencing: ${metaRes.geofencing_pins.length}`);
    metaRes.geofencing_pins.forEach(pin => {
      console.log(`  Alfinete: ${pin.cliente} | Coordenadas: ${pin.coordenadas_meta} | Raio: ${pin.raio_sugerido_km} km`);
    });
  }

  console.log('\n=== FIM DA VALIDACAO FASE 5 ===');
}

main().catch(err => {
  console.error('Falha geral:', err);
  process.exit(1);
});
