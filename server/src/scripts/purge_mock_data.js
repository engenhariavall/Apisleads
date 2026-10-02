/**
 * purge_mock_data.js
 * FASE 51 (ETAPA 1) — EXPURGAÇÃO DO MOTOR DE MOCKS & CARGA OFICIAL GO-LIVE
 * 
 * Remove 100% dos dados fictícios e mocks (Schneider, Della Libera, etc.) do SQLite
 * e sincroniza os registros fundiários oficiais do acervo SIGEF/INCRA.
 */

import db from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveOrUpdateRuralProperty } from '../services/geoFundiarioService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

export async function purgeMockData() {
  console.log('\n🧹 ============================================================');
  console.log('🛑 FASE 51: EXPURGAÇÃO DE DADOS MOCADOS & LIMPEZA DE PRODUÇÃO');
  console.log('============================================================\n');

  // 1. Remove registros fictícios de propriedades_rurais
  const delRural = db.prepare(`
    DELETE FROM propriedades_rurais 
    WHERE id_sigef NOT LIKE '%-CERT-%'
  `).run();

  console.log(`✅ Propriedades rurais fictícias expurgadas: ${delRural.changes || 0} registros deletados.`);

  // 2. Remove leads fictícios vinculados ao antigo mock rural e empresas fictícias
  const delLeads = db.prepare(`
    DELETE FROM leads 
    WHERE razao_social LIKE '%Schneider%' 
       OR razao_social LIKE '%Della Libera%' 
       OR razao_social LIKE '%Fernando Santos%'
       OR razao_social LIKE '%Santa Tereza%' 
       OR razao_social LIKE '%Gleba Morro Alto%'
       OR (origem = 'RURAL_SIGEF' AND cnpj NOT IN ('89.096.457/0001-55', '03.007.331/0001-41', '02.399.646/0001-08', '08.777.654/0001-22', '03.456.789/0001-33'))
  `).run();

  console.log(`✅ Leads fictícios de origem RURAL_SIGEF e mocks expurgados: ${delLeads.changes || 0} registros deletados.`);

  // 3. Ingestão dos registros cadastrais oficiais do SIGEF/INCRA
  const officialParcelsPath = path.join(projectRoot, 'data', 'sigef', 'official_sigef_parcels.json');
  let ingestedCount = 0;

  if (fs.existsSync(officialParcelsPath)) {
    const rawData = fs.readFileSync(officialParcelsPath, 'utf8');
    const parcels = JSON.parse(rawData);

    console.log(`\n🛰️ Ingerindo ${parcels.length} parcelas fundiárias oficiais certificadas do SIGEF/INCRA...`);

    for (const p of parcels) {
      await saveOrUpdateRuralProperty({
        id_sigef: p.id_sigef,
        codigo_imovel: p.codigo_imovel,
        nome_imovel: p.nome_imovel,
        municipio: p.municipio,
        uf: p.uf,
        area_hectares: p.area_hectares,
        nome_titular: p.nome_titular,
        cpf_cnpj_titular: p.cpf_cnpj_titular,
        status_geo: p.status_geo || 'CERTIFICADO',
        geometria_poligono: p.geometria_poligono,
        dados_agronomicos: p.dados_agronomicos || null
      }, 'tenant-root-default');
      ingestedCount++;
      console.log(`   ↳ Ingerido: [${p.id_sigef}] ${p.nome_imovel} — Titular: ${p.nome_titular}`);
    }
  }

  console.log(`\n🎉 [CONCLUÍDO] Total de parcelas oficiais ativas no sistema: ${ingestedCount}`);
  
  const remainingRural = db.prepare('SELECT count(*) as count FROM propriedades_rurais').get();
  console.log(`📊 Total atual em propriedades_rurais: ${remainingRural.count}`);

  return {
    deleted_rural: delRural.changes || 0,
    deleted_leads: delLeads.changes || 0,
    official_ingested: ingestedCount,
    total_remaining: remainingRural.count
  };
}

if (process.argv[1] && process.argv[1].endsWith('purge_mock_data.js')) {
  purgeMockData().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('❌ Erro na expurgação de dados:', err);
    process.exit(1);
  });
}
