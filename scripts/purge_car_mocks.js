import db from '../server/src/config/database.js';

console.log('🧹 [EXPURGO DE MOCKS] Iniciando limpeza rigorosa do banco de dados SQLite...');

// 1. Identificar e Deletar propriedades rurais mockadas
const mockProps = db.prepare(`
  SELECT id, codigo_car, nome_imovel, nome_titular 
  FROM propriedades_rurais 
  WHERE codigo_car LIKE '%TESTE%' 
     OR id_sigef LIKE '%TESTE%'
     OR codigo_car LIKE '%MOCK%'
     OR nome_titular IN (
       'Claudio Roberto Pegoraro', 
       'Fazenda Pampa Verde Agropecuária', 
       'Agropecuária Planalto Médio Ltda', 
       'Valdir Antonio Dal Moro', 
       'Carlos Eduardo Menegaz', 
       'Roberto Silveira Grazziotin', 
       'Sérgio Renato Dornelles',
       'Darci Antonio Basso',
       'Luiz Fernando Fontana',
       'Nelcir Trevisan & Cia',
       'Paulo Afonso Dal Bem',
       'Gilberto Cezar De Marchi',
       'Ademir Scheffer',
       'Mauro Mendes Ferreira'
     )
     OR nome_imovel IN (
       'Fazenda Coxilha Grande',
       'Estância Bela Vista do Jacuí',
       'Fazenda Planalto Verde',
       'Fazenda Três Palmeiras',
       'Estância do Vale Dourado'
     )
`).all();

console.log(`🔍 Encontradas ${mockProps.length} propriedades rurais mockadas.`);
mockProps.forEach(p => console.log(`   - Deletando propriedade: [${p.codigo_car || p.id}] ${p.nome_imovel} (${p.nome_titular})`));

const deletePropsStmt = db.prepare(`
  DELETE FROM propriedades_rurais 
  WHERE codigo_car LIKE '%TESTE%' 
     OR id_sigef LIKE '%TESTE%'
     OR codigo_car LIKE '%MOCK%'
     OR nome_titular IN (
       'Claudio Roberto Pegoraro', 
       'Fazenda Pampa Verde Agropecuária', 
       'Agropecuária Planalto Médio Ltda', 
       'Valdir Antonio Dal Moro', 
       'Carlos Eduardo Menegaz', 
       'Roberto Silveira Grazziotin', 
       'Sérgio Renato Dornelles',
       'Darci Antonio Basso',
       'Luiz Fernando Fontana',
       'Nelcir Trevisan & Cia',
       'Paulo Afonso Dal Bem',
       'Gilberto Cezar De Marchi',
       'Ademir Scheffer',
       'Mauro Mendes Ferreira'
     )
     OR nome_imovel IN (
       'Fazenda Coxilha Grande',
       'Estância Bela Vista do Jacuí',
       'Fazenda Planalto Verde',
       'Fazenda Três Palmeiras',
       'Estância do Vale Dourado'
     )
`);
const resProps = deletePropsStmt.run();
console.log(`✅ ${resProps.changes} registro(s) deletado(s) de propriedades_rurais.`);

// 2. Identificar e Deletar leads mockados originários de CAR/FUSÃO fictícia
const mockLeads = db.prepare(`
  SELECT id, razao_social, origem 
  FROM leads 
  WHERE origem IN ('RURAL_CAR', 'RURAL_FUSAO')
     OR razao_social LIKE '%Valdir Antonio%'
     OR razao_social LIKE '%Grazziotin%'
     OR razao_social LIKE '%Menegaz%'
     OR razao_social LIKE '%Pegoraro%'
     OR razao_social LIKE '%Pampa Verde%'
     OR razao_social LIKE '%Planalto Médio%'
     OR razao_social LIKE '%Bussolaro%'
     OR razao_social LIKE '%Bortoluzzi%'
     OR razao_social LIKE '%Tessaro%'
     OR razao_social LIKE '%Dal Bem%'
     OR razao_social LIKE '%De Marchi%'
     OR razao_social LIKE '%Scheffer%'
     OR cnpj LIKE '%.%-____'
`).all();

console.log(`🔍 Encontrados ${mockLeads.length} leads mockados.`);
mockLeads.forEach(l => console.log(`   - Deletando lead: [${l.id}] ${l.razao_social} (${l.origem})`));

const deleteLeadsStmt = db.prepare(`
  DELETE FROM leads 
  WHERE origem IN ('RURAL_CAR', 'RURAL_FUSAO')
     OR razao_social LIKE '%Valdir Antonio%'
     OR razao_social LIKE '%Grazziotin%'
     OR razao_social LIKE '%Menegaz%'
     OR razao_social LIKE '%Pegoraro%'
     OR razao_social LIKE '%Pampa Verde%'
     OR razao_social LIKE '%Planalto Médio%'
     OR razao_social LIKE '%Bussolaro%'
     OR razao_social LIKE '%Bortoluzzi%'
     OR razao_social LIKE '%Tessaro%'
     OR razao_social LIKE '%Dal Bem%'
     OR razao_social LIKE '%De Marchi%'
     OR razao_social LIKE '%Scheffer%'
     OR cnpj LIKE '%.%-____'
`);
const resLeads = deleteLeadsStmt.run();
console.log(`✅ ${resLeads.changes} lead(s) deletado(s) de leads.`);

// 3. Status restante no banco
const remainingProps = db.prepare("SELECT count(*) as c, tag_fonte FROM propriedades_rurais GROUP BY tag_fonte").all();
console.log('📊 Propriedades rurais restantes:', remainingProps);

const remainingLeads = db.prepare("SELECT count(*) as c, origem FROM leads WHERE origem LIKE 'RURAL%' GROUP BY origem").all();
console.log('📊 Leads rurais restantes:', remainingLeads);

console.log('🎯 [EXPURGO DE MOCKS] Limpeza de banco de dados concluída com sucesso!');
process.exit(0);
