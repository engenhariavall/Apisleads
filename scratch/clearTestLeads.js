import db from '../server/src/config/database.js';

console.log('--- ANTES DA LIMPEZA ---');
const before = db.prepare(`SELECT origem, uf, count(*) as total FROM leads GROUP BY origem, uf`).all();
console.table(before);

// Limpa apenas os 2.872 leads de MT injetados pelo CAR no teste anterior
const info = db.prepare(`DELETE FROM leads WHERE origem = 'RURAL_CAR' OR (origem = 'RURAL_SIGEF' AND tag LIKE '%LOTE VISÍVEL DO MAPA%')`).run();

console.log(`\n🧹 Leads rurais do teste anterior removidos: ${info.changes} registros.`);

console.log('\n--- DEPOIS DA LIMPEZA ---');
const after = db.prepare(`SELECT origem, uf, count(*) as total FROM leads GROUP BY origem, uf`).all();
console.table(after);
