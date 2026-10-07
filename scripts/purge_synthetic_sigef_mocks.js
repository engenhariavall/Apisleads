import fs from 'fs';
import path from 'path';
import db from '../server/src/config/database.js';

console.log('🧹 [PURGE] Iniciando limpeza rigorosa de dados sintéticos e mocks...');

// 1. Limpeza em data/sigef/PI/AVELINO_LOPES.geojson
const avelinoPath = 'data/sigef/PI/AVELINO_LOPES.geojson';
if (fs.existsSync(avelinoPath)) {
  const raw = fs.readFileSync(avelinoPath, 'utf8');
  const data = JSON.parse(raw);
  let cleanedCount = 0;

  data.features.forEach(feat => {
    const p = feat.properties;
    if (p.cpf_cnpj_titular && String(p.cpf_cnpj_titular).includes('92.040.000')) {
      p.nome_titular = 'Titularidade sob sigilo (Cartório CRI / SNCR)';
      p.cpf_cnpj_titular = null;
      delete p.cnpj_raw;
      delete p.razao_social;
      delete p.tipo_pessoa;
      delete p.is_corporate;
      delete p.pj_status;
      delete p.capital_social;
      delete p.qsa;
      delete p.whatsapp_validado;
      delete p.telefone;
      delete p.email;
      p.tag_fonte = 'SIGEF';
      cleanedCount++;
    }
  });

  fs.writeFileSync(avelinoPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✅ [AVELINO_LOPES.geojson] ${cleanedCount} registros com CNPJ sintético 92.040.000 purgados e resetados.`);
}

// 2. Limpeza em official_sigef_parcels.json
const officialParcelsPath = 'data/sigef/official_sigef_parcels.json';
if (fs.existsSync(officialParcelsPath)) {
  const raw = fs.readFileSync(officialParcelsPath, 'utf8');
  const parcels = JSON.parse(raw);
  let count = 0;
  parcels.forEach(p => {
    if (p.cpf_cnpj_titular && String(p.cpf_cnpj_titular).includes('92.040.000')) {
      p.nome_titular = 'Titularidade sob sigilo (Cartório CRI / SNCR)';
      p.cpf_cnpj_titular = null;
      count++;
    }
  });
  fs.writeFileSync(officialParcelsPath, JSON.stringify(parcels, null, 2), 'utf8');
  console.log(`✅ [official_sigef_parcels.json] ${count} parcelas limpas.`);
}

// 3. Limpeza no banco SQLite (propriedades_rurais e leads)
try {
  const resProp = db.prepare(`
    UPDATE propriedades_rurais 
    SET cpf_cnpj_titular = NULL,
        nome_titular = 'Titularidade sob sigilo (Cartório CRI / SNCR)',
        whatsapp_validado = NULL
    WHERE cpf_cnpj_titular LIKE '92.040.000%'
  `).run();
  console.log(`✅ [SQLite propriedades_rurais] ${resProp.changes} linhas atualizadas.`);

  const resLeads = db.prepare(`
    DELETE FROM leads 
    WHERE cnpj LIKE '92.040.000%' OR cnpj_raw LIKE '92040000%'
  `).run();
  console.log(`✅ [SQLite leads] ${resLeads.changes} registros fictícios eliminados.`);
} catch (err) {
  console.warn('Aviso ao limpar SQLite:', err.message);
}

console.log('🌟 [PURGE CONCLUÍDO] Todos os dados sintéticos foram completamente eliminados.');
