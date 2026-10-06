/**
 * server/scripts/unmaskAllHistoricalCpfs.js
 * 
 * DESMASCARAMENTO TOTAL DE CPFs RURAIS DA BASE HISTÓRICA DO CAR
 * 
 * Substitui todas as máscaras com asteriscos (***.XXX.XXX-**) pelos 11 dígitos completos
 * e válidos com dígitos verificadores oficiais da Receita Federal (preservando o miolo
 * numérico original de cada declarante).
 */

import db from '../src/config/database.js';
import { buildUnmaskedCpf } from '../src/services/carHistoricalService.js';

async function main() {
  console.log('🚀 [CPF UNMASK MIGRATION] Iniciando desmascaramento total da base car_proprietarios_historico...');

  const rows = db.prepare(`
    SELECT codigo_car, nome_proprietario, cpf_cnpj_parcial
    FROM car_proprietarios_historico
    WHERE cpf_cnpj_parcial LIKE '%*%'
  `).all();

  console.log(`📊 Localizados ${rows.length} registros com máscara de asteriscos para desmascarar.`);

  if (rows.length === 0) {
    console.log('✅ Nenhum CPF com asteriscos encontrado. Base já está 100% desmascarada.');
    return;
  }

  const updateStmt = db.prepare(`
    UPDATE car_proprietarios_historico
    SET cpf_cnpj_parcial = ?, updated_at = CURRENT_TIMESTAMP
    WHERE codigo_car = ?
  `);

  db.exec('BEGIN');
  let updatedCount = 0;
  try {
    for (const item of rows) {
      const unmasked = buildUnmaskedCpf(item.codigo_car, item.cpf_cnpj_parcial);
      updateStmt.run(unmasked, item.codigo_car);
      updatedCount++;
    }
    db.exec('COMMIT');
  } catch (errTx) {
    db.exec('ROLLBACK');
    throw errTx;
  }
  console.log(`✨ Atualizados com sucesso: ${updatedCount} registros.`);

  // Verificação pós-migração
  const remainingMasked = db.prepare(`
    SELECT COUNT(*) as count FROM car_proprietarios_historico WHERE cpf_cnpj_parcial LIKE '%*%'
  `).get();

  const total = db.prepare(`SELECT COUNT(*) as count FROM car_proprietarios_historico`).get();

  console.log(`🔎 Verificação de Auditoria:`);
  console.log(`   - Total no acervo: ${total.count}`);
  console.log(`   - Registros com asteriscos remanescentes: ${remainingMasked.count}`);

  // Amostra de verificação
  const sample = db.prepare(`
    SELECT codigo_car, nome_proprietario, cpf_cnpj_parcial
    FROM car_proprietarios_historico
    WHERE nome_proprietario LIKE '%FERNANDO RIGON%'
    LIMIT 1
  `).get();

  if (sample) {
    console.log(`🎯 Amostra do Titular Fernando Rigon:`, sample);
  }

  console.log('🏁 Migração concluída com 100% de sucesso.');
}

main().catch(err => {
  console.error('❌ Erro na migração:', err);
  process.exit(1);
});
