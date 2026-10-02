/**
 * Script de Ingestão e Fusão Multissetorial
 * Executa DataFusionEngine.fuseAllLeads na base local SQLite
 */

import db from '../config/database.js';
import { DataFusionEngine } from '../modules/verticals/dataFusionEngine.js';

console.log('--- INICIANDO FUSÃO MULTISSETORIAL DE DADOS (DATA FUSION ENGINE) ---');

try {
  const result = DataFusionEngine.fuseAllLeads(db);
  console.log('✅ Fusão executada com sucesso!');
  console.log(`Total de registros enriquecidos: ${result.total_processed}`);
  console.log('Distribuição por vertical:', JSON.stringify(result.stats, null, 2));

  // Amostra de validação
  const sample = db.prepare(`
    SELECT id, razao_social, vertical_type, vertical_data 
    FROM leads 
    WHERE vertical_type IN ('AGRO', 'JURIDICO', 'SAUDE', 'CONSTRUCAO') 
    LIMIT 4
  `).all();

  console.log('\n--- AMOSTRA DE DADOS FUNDIDOS ---');
  sample.forEach(s => {
    const vData = JSON.parse(s.vertical_data || '{}');
    console.log(`[${s.vertical_type}] ${s.razao_social}`);
    console.log(` -> Métricas:`, JSON.stringify(vData));
  });

  process.exit(0);
} catch (error) {
  console.error('❌ Erro durante a fusão multissetorial:', error);
  process.exit(1);
}
