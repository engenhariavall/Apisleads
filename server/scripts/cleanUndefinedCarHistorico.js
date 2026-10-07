import db from '../src/config/database.js';

console.log('Iniciando saneamento de nomes com "undefined" no banco de dados SQLite...');

try {
  // 1. Tabela car_proprietarios_historico
  const histRows = db.prepare("SELECT codigo_car, nome_proprietario FROM car_proprietarios_historico WHERE nome_proprietario LIKE '%undefined%'").all();
  console.log(`Encontrados ${histRows.length} registros com "undefined" em car_proprietarios_historico.`);
  
  const updateHist = db.prepare(`
    UPDATE car_proprietarios_historico 
    SET nome_proprietario = REPLACE(nome_proprietario, 'undefined ', 'VALDOMIRO ')
    WHERE codigo_car = ?
  `);
  
  for (const row of histRows) {
    updateHist.run(row.codigo_car);
  }

  // 2. Tabela propriedades_rurais
  const ruralRows = db.prepare("SELECT id, nome_titular, produtor_pf_nome FROM propriedades_rurais WHERE nome_titular LIKE '%undefined%' OR produtor_pf_nome LIKE '%undefined%'").all();
  console.log(`Encontrados ${ruralRows.length} registros com "undefined" em propriedades_rurais.`);

  const updateRural = db.prepare(`
    UPDATE propriedades_rurais
    SET nome_titular = REPLACE(COALESCE(nome_titular, ''), 'undefined ', 'VALDOMIRO '),
        produtor_pf_nome = REPLACE(COALESCE(produtor_pf_nome, ''), 'undefined ', 'VALDOMIRO ')
    WHERE id = ?
  `);

  for (const row of ruralRows) {
    updateRural.run(row.id);
  }

  // 3. Tabela leads
  const leadRows = db.prepare(`
    SELECT id FROM leads 
    WHERE razao_social LIKE '%undefined%' 
       OR nome_fantasia LIKE '%undefined%'
       OR decisor_nome LIKE '%undefined%'
       OR contato_nome LIKE '%undefined%'
  `).all();
  console.log(`Encontrados ${leadRows.length} registros com "undefined" em leads.`);

  const updateLead = db.prepare(`
    UPDATE leads
    SET razao_social = REPLACE(COALESCE(razao_social, ''), 'undefined ', 'VALDOMIRO '),
        nome_fantasia = REPLACE(COALESCE(nome_fantasia, ''), 'undefined ', 'VALDOMIRO '),
        decisor_nome = REPLACE(COALESCE(decisor_nome, ''), 'undefined ', 'VALDOMIRO '),
        contato_nome = REPLACE(COALESCE(contato_nome, ''), 'undefined ', 'VALDOMIRO ')
    WHERE id = ?
  `);

  for (const row of leadRows) {
    updateLead.run(row.id);
  }

  console.log('Saneamento concluído com sucesso!');
} catch (error) {
  console.error('Erro no saneamento:', error);
}

process.exit(0);
