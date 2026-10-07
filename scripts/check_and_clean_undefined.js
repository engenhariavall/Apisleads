import db from '../server/src/config/database.js';

console.log('=== VERIFICAÇÃO DE REGISTROS COM "undefined" ===');

const uLeads = db.prepare("SELECT count(id) as count FROM leads WHERE decisor_nome LIKE '%undefined%' OR razao_social LIKE '%undefined%' OR nome_fantasia LIKE '%undefined%'").get();
console.log('Leads com "undefined":', uLeads.count);

const uProps = db.prepare("SELECT count(id) as count FROM propriedades_rurais WHERE nome_titular LIKE '%undefined%' OR decisor_nome LIKE '%undefined%' OR nome_imovel LIKE '%undefined%'").get();
console.log('Propriedades Rurais com "undefined":', uProps.count);

let uHist = { count: 0 };
try {
  uHist = db.prepare("SELECT count(codigo_car) as count FROM car_proprietarios_historico WHERE nome_proprietario LIKE '%undefined%' OR nome_imovel_declarado LIKE '%undefined%'").get();
  console.log('CAR Histórico com "undefined":', uHist.count);
} catch (e) {
  console.log('Erro tabela histórico:', e.message);
}

if (uLeads.count > 0 || uProps.count > 0 || uHist.count > 0) {
  console.log('Executando saneamento...');

  // Limpa em leads
  const updLeads = db.prepare(`
    UPDATE leads
    SET decisor_nome = TRIM(REPLACE(decisor_nome, 'undefined ', 'VALDOMIRO ')),
        razao_social = TRIM(REPLACE(razao_social, 'undefined ', 'VALDOMIRO ')),
        nome_fantasia = TRIM(REPLACE(nome_fantasia, 'undefined ', 'VALDOMIRO '))
    WHERE decisor_nome LIKE '%undefined%' OR razao_social LIKE '%undefined%' OR nome_fantasia LIKE '%undefined%'
  `).run();
  console.log('Leads saneados:', updLeads.changes);

  // Limpa em propriedades_rurais
  const updProps = db.prepare(`
    UPDATE propriedades_rurais
    SET nome_titular = TRIM(REPLACE(nome_titular, 'undefined ', 'VALDOMIRO ')),
        decisor_nome = TRIM(REPLACE(decisor_nome, 'undefined ', 'VALDOMIRO ')),
        nome_imovel = TRIM(REPLACE(nome_imovel, 'undefined ', 'VALDOMIRO '))
    WHERE nome_titular LIKE '%undefined%' OR decisor_nome LIKE '%undefined%' OR nome_imovel LIKE '%undefined%'
  `).run();
  console.log('Propriedades saneadas:', updProps.changes);

  // Limpa em car_proprietarios_historico
  try {
    const updHist = db.prepare(`
      UPDATE car_proprietarios_historico
      SET nome_proprietario = TRIM(REPLACE(nome_proprietario, 'undefined ', 'VALDOMIRO ')),
          nome_imovel_declarado = TRIM(REPLACE(nome_imovel_declarado, 'undefined ', 'VALDOMIRO '))
      WHERE nome_proprietario LIKE '%undefined%' OR nome_imovel_declarado LIKE '%undefined%'
    `).run();
    console.log('CAR Histórico saneado:', updHist.changes);
  } catch (_) {}
} else {
  console.log('Base local já está sem registros "undefined"!');
}
