/**
 * hard_reset_db.js
 * FASE 55 (HOTFIX DE DADOS) — HARD RESET DO SQLITE
 * 
 * Executa limpeza total (DELETE FROM) de todas as tabelas de dados de leads,
 * propriedades rurais e enriquecimentos cacheados no SQLite local.
 * Executa PRAGMA wal_checkpoint(TRUNCATE) e VACUUM para garantir que nenhum
 * dado residual ou cache persista em disco ou em memória.
 */

import db from '../config/database.js';

export function hardResetDatabase() {
  console.log('\n🧨 ============================================================');
  console.log('🛑 INICIANDO HARD RESET DO BANCO DE DADOS LOCAL (SQLITE)');
  console.log('============================================================\n');

  const tablesToClear = [
    'propriedades_rurais',
    'leads',
    'leads_socios',
    'lead_dossier_views',
    'whatsapp_inbound_messages',
    'scraping_job_queue'
  ];

  const results = {};

  for (const table of tablesToClear) {
    try {
      const checkTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (checkTable) {
        const countBefore = db.prepare(`SELECT count(*) as count FROM ${table}`).get().count;
        db.prepare(`DELETE FROM ${table}`).run();
        const countAfter = db.prepare(`SELECT count(*) as count FROM ${table}`).get().count;
        results[table] = { before: countBefore, after: countAfter, deleted: countBefore - countAfter };
        console.log(`✅ [${table}] ${results[table].deleted} registros deletados. Restantes: ${countAfter}`);
      } else {
        console.log(`ℹ️ [${table}] Tabela inexistente, ignorando.`);
      }
    } catch (err) {
      console.error(`❌ Erro ao limpar tabela ${table}:`, err.message);
    }
  }

  // Checkpoint e truncamento do WAL para expurgar páginas de cache do disco
  try {
    db.exec(`PRAGMA wal_checkpoint(TRUNCATE);`);
    db.exec(`VACUUM;`);
    console.log(`\n🧹 [WAL & VACUUM] WAL truncado e SQLite compactado. Cache em disco 100% purgado.`);
  } catch (vacuumErr) {
    console.warn(`⚠️ Aviso no VACUUM:`, vacuumErr.message);
  }

  console.log('\n📊 ESTADO FINAL DO BANCO DE DADOS APÓS O HARD RESET:');
  let allZero = true;
  for (const table of tablesToClear) {
    try {
      const current = db.prepare(`SELECT count(*) as count FROM ${table}`).get().count;
      console.log(`   ↳ ${table}: ${current} registros ${current === 0 ? '🟢 (100% LIMPO)' : '🔴 (NÃO ZERADO)'}`);
      if (current !== 0) allZero = false;
    } catch (_) {}
  }

  if (allZero) {
    console.log('\n🎉 [HARD RESET HOMOLOGADO COM SUCESSO] Banco de dados local completamente zerado e pronto para dados oficiais.');
  } else {
    console.warn('\n⚠️ [ATENÇÃO] Algumas tabelas não foram zeradas completamente.');
  }

  return { success: allZero, results };
}

if (process.argv[1] && process.argv[1].endsWith('hard_reset_db.js')) {
  hardResetDatabase();
  process.exit(0);
}
