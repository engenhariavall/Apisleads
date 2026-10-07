/**
 * server/scripts/syncEnrichedSparksPilots.js
 * 
 * Script de sincronizacao e enriquecimento dos sinais pilotos do Radar Sparks.
 * Executa de forma idempotente em qualquer ambiente (local ou VPS).
 */

import db from '../src/config/database.js';
import { CnpjResolutionService } from '../src/services/cnpjResolutionService.js';
import { SparksEngineService } from '../src/services/sparksEngineService.js';

async function main() {
  console.log('=== INICIANDO SINCRONIZACAO E ENRIQUECIMENTO DE SINAIS PILOTOS ===');

  const targetSignals = [
    'sig-bndes-ca760e99b1', // S S EMPREENDIMENTOS AGRICOLAS LTDA
    'sig-bndes-82913f678a', // GIONGO AGROPECUARIA / PARTICIPACOES LTDA
    'sig-bndes-0525ff6d61'  // V S DRONES LTDA
  ];

  for (const id of targetSignals) {
    const sig = db.prepare('SELECT id, titular_identificado, municipio, uf, documento_identificado FROM sparks_signals WHERE id = ?').get(id);
    if (!sig) {
      console.warn(`Sinal [${id}] nao encontrado na base.`);
      continue;
    }

    console.log(`\nEnriquecendo sinal: [${sig.id}] ${sig.titular_identificado} (${sig.municipio}/${sig.uf})...`);
    try {
      const res = await CnpjResolutionService.resolveAndEnrichSignal(sig.id, 'tenant-root-default');
      console.log('Resultado:', {
        sucesso: res.success,
        cnpj: res.cnpj,
        socios: res.socios ? res.socios.length : 0,
        contato: res.contato_principal,
        coordenadas: res.coordenadas
      });
    } catch (err) {
      console.error(`Erro ao enriquecer sinal [${id}]:`, err.message);
    }
  }

  console.log('\n--- VALIDACAO FINAL DO DOSSIE E META ADS ---');
  const metaRes = await SparksEngineService.exportSignalsMetaAds(targetSignals, 'tenant-root-default');
  console.log(`Total de decisores no Custom Audience: ${metaRes.hashed_rows.length}`);
  console.log(`Total de alfinetes de geofencing: ${metaRes.geofencing_pins.length}`);
  metaRes.geofencing_pins.forEach(p => {
    console.log(`  [Geofencing] ${p.cliente} | CNPJ: ${p.cnpj} | Coords: ${p.coordenadas_meta} | Raio: ${p.raio_sugerido_km} km`);
  });

  console.log('\n=== SINCRONIZACAO E HOMOLOGACAO CONCLUIDA COM SUCESSO ===');
}

main().catch(err => {
  console.error('Falha geral no script de sincronizacao:', err);
  process.exit(1);
});
