import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/leads.sqlite');
const count = db.prepare('SELECT count(*) as c FROM propriedades_rurais').get();
console.log('Total propriedades_rurais:', count.c);

const sample = db.prepare('SELECT id, nome_imovel, nome_titular, cpf_cnpj_titular, municipio, uf, tag_fonte, status_geo FROM propriedades_rurais LIMIT 10').all();
console.log('Sample:', JSON.stringify(sample, null, 2));

const fakeMatches = db.prepare("SELECT count(*) as c FROM propriedades_rurais WHERE nome_titular LIKE '%Manoel Messias%' OR cpf_cnpj_titular LIKE '%591.820.310-77%' OR nome_titular LIKE '%João Carlos Silveira%'").get();
console.log('Fake matches in db:', fakeMatches.c);

const allFake = db.prepare("SELECT id, nome_imovel, nome_titular, cpf_cnpj_titular, municipio, uf, tag_fonte FROM propriedades_rurais WHERE nome_titular LIKE '%Manoel Messias%' OR cpf_cnpj_titular LIKE '%591.820.310-77%' OR nome_titular LIKE '%João Carlos Silveira%'").all();
console.log('All fake rows:', JSON.stringify(allFake, null, 2));
