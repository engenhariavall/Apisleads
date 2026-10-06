/**
 * server/scripts/purgeFakeDataAndRestoreSigef.js
 * 
 * Saneamento completo de geradores fictícios:
 * 1. Restaura data/sigef/RS/*.geojson com os dados 100% autênticos de official_sigef_parcels.json
 * 2. Remove qualquer CNPJ 92.040.002/* ou nomes fabricados (* LTDA)
 * 3. Atualiza propriedades_rurais no banco SQLite com os dados limpos
 */

import fs from 'fs';
import path from 'path';
import db from '../src/config/database.js';

const officialParcelsPath = path.resolve('data/sigef/official_sigef_parcels.json');
const officialParcels = JSON.parse(fs.readFileSync(officialParcelsPath, 'utf8'));

console.log(`📦 Carregados ${officialParcels.length} imóveis autênticos de official_sigef_parcels.json.`);

// 1. Agrupar por município
const byMun = {
  'PASSO FUNDO': [],
  'CRUZ ALTA': [],
  'IJUI': [],
  'SANTA MARIA': []
};

for (const p of officialParcels) {
  const mun = (p.municipio || '').toUpperCase();
  if (byMun[mun]) {
    byMun[mun].push(p);
  }
}

// 2. Regerar GeoJSONs limpos em data/sigef/RS/
const munFileMap = {
  'PASSO FUNDO': 'data/sigef/RS/PASSO_FUNDO.geojson',
  'CRUZ ALTA': 'data/sigef/RS/CRUZ_ALTA.geojson',
  'IJUI': 'data/sigef/RS/IJUI.geojson',
  'SANTA MARIA': 'data/sigef/RS/SANTA_MARIA.geojson'
};

for (const [mun, filePath] of Object.entries(munFileMap)) {
  const parcels = byMun[mun] || [];
  const features = parcels.map(p => ({
    type: 'Feature',
    id: p.id || p.id_sigef,
    geometry: p.geometria_poligono,
    properties: {
      id: p.id || p.id_sigef,
      id_sigef: p.id_sigef || p.id,
      codigo_imovel: p.codigo_imovel,
      nome_imovel: p.nome_imovel,
      nome_titular: p.nome_titular || 'Titularidade sob sigilo (Cartório CRI / SNCR)',
      cpf_cnpj_titular: p.cpf_cnpj_titular || null,
      registro_matricula: p.registro_matricula || null,
      municipio: p.municipio,
      uf: p.uf || 'RS',
      area_hectares: p.area_hectares,
      status_geo: p.status_geo || 'CERTIFICADO',
      tag_fonte: 'SIGEF',
      centroide_lat: p.centroide_lat,
      centroide_lng: p.centroide_lng
    }
  }));

  const geoJson = {
    type: 'FeatureCollection',
    name: `sigef_RS_${mun.replace(/\s+/g, '_')}`,
    total_features: features.length,
    updated_at: new Date().toISOString(),
    features
  };

  fs.writeFileSync(path.resolve(filePath), JSON.stringify(geoJson, null, 2), 'utf8');
  console.log(`✅ [SIGEF SANITIZADO] ${filePath} regerado com ${features.length} parcelas limpas.`);
}

// 3. Atualizar tabela propriedades_rurais no banco SQLite local
console.log('🧹 Limpando dados sintéticos na tabela propriedades_rurais...');

const updateStmt = db.prepare(`
  UPDATE propriedades_rurais
  SET nome_titular = 'Titularidade sob sigilo (Cartório CRI / SNCR)',
      cpf_cnpj_titular = NULL,
      produtor_pf_nome = NULL,
      produtor_pf_cpf = NULL,
      whatsapp_produtor_pf = NULL,
      inscricao_estadual = NULL,
      sefaz_status = 'PENDENTE',
      tag_fonte = 'SIGEF',
      updated_at = CURRENT_TIMESTAMP
  WHERE (cpf_cnpj_titular LIKE '92.040.002/%'
     OR nome_titular LIKE '%.014%'
     OR nome_titular LIKE '%USUCAPIÃO%MARLENE%'
     OR nome_titular LIKE '%SDE SDE%'
     OR nome_titular LIKE '%VISTA ALEGRE .%'
     OR nome_titular LIKE '%FAZENDA PAIQUERE FAZENDA PAIQUERE%'
     OR nome_titular LIKE '%MATRÍCULA 2014 -%'
     OR nome_titular LIKE '%CHÁCARA DAS EDRAS .168%')
`);

const res = updateStmt.run();
console.log(`✅ [BANCO SANITIZADO] ${res.changes} registros na tabela propriedades_rurais limpos com sucesso.`);
