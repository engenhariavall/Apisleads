/**
 * server/scripts/purgeAndIngestAllRealSparks.js
 * 
 * Script de higienização total e ingestão das fontes oficiais de crédito & agronegócio:
 * 1. Remove qualquer sinal que contenha aviso de licitação, pregão ou seja mock antigo.
 * 2. Executa a varredura das fontes primárias:
 *    - BNDES CKAN Datastore API (Crédito & Máquinas)
 *    - ANA / SNIRH (Outorgas de Irrigação)
 *    - Feiras Oficiais do Agro (Agrishow, Show Rural, etc.)
 *    - DOU com filtro anti-licitação
 * 3. Audita todos os registros gravados.
 */

import db from '../src/config/database.js';
import { SparksRealDataIngestionService } from '../src/services/sparksRealDataIngestionService.js';

async function main() {
  console.log('🧹 [PURGE REAL SPARKS] Iniciando limpeza rigorosa...');

  // Remove qualquer sinal de licitação ou mock antigo
  const delProcurement = db.prepare(`
    DELETE FROM sparks_signals 
    WHERE titulo LIKE '%LICITAÇÃO%'
       OR titulo LIKE '%LICITACAO%'
       OR titulo LIKE '%PREGÃO%'
       OR titulo LIKE '%DISPENSA%'
       OR titulo LIKE '%APOSTILAMENTO%'
       OR titulo LIKE '%CONVÊNIO%'
       OR id LIKE 'sig-sim-%'
       OR id LIKE 'sig-bndes-legacy-%'
  `).run();

  console.log(`🗑️ [PURGE REAL SPARKS] ${delProcurement.changes} registros inadequados removidos.`);

  console.log('🚀 [INGESTION] Disparando coleta multi-fonte 100% real...');
  const result = await SparksRealDataIngestionService.ingestRealSignals(null, 'tenant-root-default');

  console.log('\n📊 [INGESTION RESULTADO]:', result);

  // Auditoria detalhada por tipo de sinal
  const stats = db.prepare(`
    SELECT spark_type, count(*) as total, sum(valor_monetario) as total_valor, max(volume_m3h) as max_vazao
    FROM sparks_signals
    GROUP BY spark_type
  `).all();

  console.log('\n📋 [DISTRIBUIÇÃO DE SINAIS REAIS POR CATEGORIA]:');
  console.table(stats);

  const samples = db.prepare(`
    SELECT id, spark_type, titulo, valor_monetario, volume_m3h, data_publicacao, orgao_emissor, url_fonte
    FROM sparks_signals
    ORDER BY created_at DESC
    LIMIT 10
  `).all();

  console.log('\n🔍 [AMOSTRA DOS SINAIS MAIS RECENTES]:');
  console.table(samples);
}

main().catch(err => {
  console.error('❌ Erro no script:', err);
  process.exit(1);
});
