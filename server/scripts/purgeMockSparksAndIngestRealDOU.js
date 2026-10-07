/**
 * server/scripts/purgeMockSparksAndIngestRealDOU.js
 * 
 * Script de higienização total:
 * 1. Remove 100% dos registros mockados/fictícios da tabela sparks_signals.
 * 2. Executa a ingestão real e ao vivo do Diário Oficial da União (in.gov.br).
 * 3. Garante que todos os registros possuam url_fonte oficial verificável e data de publicação autêntica.
 */

import db from '../src/config/database.js';
import { SparksRealDataIngestionService } from '../src/services/sparksRealDataIngestionService.js';

async function main() {
  console.log('🧹 [PURGE SPARKS] Iniciando limpeza de dados mockados / fictícios...');

  // Remove sinais que não vieram do DOU ou que eram do catálogo simulado anterior
  const delResult = db.prepare(`
    DELETE FROM sparks_signals 
    WHERE url_fonte IS NULL 
       OR url_fonte NOT LIKE 'https://www.in.gov.br%'
       OR id LIKE 'sig-bndes-%'
       OR id LIKE 'sig-ibama-%'
       OR id LIKE 'sig-ana-%'
       OR id LIKE 'sig-feira-%'
  `).run();

  console.log(`🗑️ [PURGE SPARKS] ${delResult.changes} registros mockados removidos com sucesso.`);

  console.log('📡 [LIVE CRAWLER] Disparando captura real do Diário Oficial da União (DOU)...');
  const result = await SparksRealDataIngestionService.ingestRealSignals(null, 'tenant-root-default');

  console.log('📊 [LIVE CRAWLER] Resultado da ingestão oficial:', result);

  // Listagem de verificação dos sinais reais gravados
  const savedSignals = db.prepare(`
    SELECT id, spark_type, titulo, data_publicacao, orgao_emissor, url_fonte 
    FROM sparks_signals 
    ORDER BY data_publicacao DESC, created_at DESC 
    LIMIT 10
  `).all();

  console.log('\n🔍 [AUDITORIA DE DADOS REAIS DO DOU]');
  console.table(savedSignals);
}

main().catch(err => {
  console.error('❌ Erro na execução:', err);
  process.exit(1);
});
