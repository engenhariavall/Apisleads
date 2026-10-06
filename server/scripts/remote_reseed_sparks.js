/**
 * server/scripts/remote_reseed_sparks.js
 * 
 * Limpa sinais sintéticos anteriores e ingere sinais 100% auditados na Receita Federal.
 */
import db from '../src/config/database.js';
import { SparksRealDataIngestionService } from '../src/services/sparksRealDataIngestionService.js';

async function main() {
  console.log('[SPARKS RE-SEED] Limpando tabela sparks_signals...');
  const deleted = db.prepare('DELETE FROM sparks_signals').run();
  console.log(`[SPARKS RE-SEED] ${deleted.changes} registros antigos removidos.`);

  console.log('[SPARKS RE-SEED] Ingerindo sinais oficiais e auditados...');
  const result = await SparksRealDataIngestionService.ingestRealSignals();
  console.log('[SPARKS RE-SEED] Resultado da ingestão:', JSON.stringify(result));

  const total = db.prepare('SELECT count(*) as total FROM sparks_signals').get();
  console.log(`[SPARKS RE-SEED] Total de sinais ativos no feed: ${total.total}`);

  const activeSignals = db.prepare('SELECT spark_type, documento_identificado, titular_identificado FROM sparks_signals').all();
  console.log('[SPARKS RE-SEED] Sinais em produção:', activeSignals);

  process.exit(0);
}

main().catch(err => {
  console.error('[SPARKS RE-SEED] Erro:', err);
  process.exit(1);
});
