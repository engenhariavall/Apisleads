import db from '../server/src/config/database.js';

console.log('🧹 [PURGE] Iniciando limpeza definitiva de registros ficticios...');

try {
  const res = db.prepare('DELETE FROM car_proprietarios_historico').run();
  console.log(`✅ Registros fictícios removidos de car_proprietarios_historico: ${res.changes}`);

  // Limpa nomes sintéticos na tabela propriedades_rurais
  const updateProp = db.prepare(`
    UPDATE propriedades_rurais
    SET nome_titular = 'Titularidade sob sigilo (CAR Declaratório)',
        cpf_cnpj_titular = NULL
    WHERE nome_titular LIKE '%SCHIO%'
       OR nome_titular LIKE '%SCORTEGAGNA%'
       OR nome_titular LIKE '%TRENTIN%'
       OR nome_titular LIKE '%ZANCHET%'
       OR nome_titular LIKE '%RIZZOTTO%'
       OR nome_titular LIKE '%GRAZZIOTIN%'
  `).run();
  console.log(`✅ Propriedades rurais restauradas para sigilo legítimo: ${updateProp.changes}`);

} catch (err) {
  console.error('Erro na limpeza:', err.message);
}
