/**
 * server/scripts/seedFullCarHistoricoPassoFundoAndHubs.js
 * 
 * Ingestão e Pré-Indexação em Lote de Proprietários Históricos do CAR
 * para 100% dos imóveis de Passo Fundo e polos agrícolas estratégicos
 * (Passo Fundo, Sorriso, Sinop, Dourados, Castro, Sarandi).
 */

import fs from 'fs';
import path from 'path';
import db from '../src/config/database.js';
import { carHistoricalService } from '../src/services/carHistoricalService.js';

console.log('🌾 [CAR BULK SEED] Iniciando pré-indexação completa de proprietários históricos...');

const targetFiles = [
  { p: 'data/sicar/RS/PASSO_FUNDO.geojson', mun: 'PASSO FUNDO', uf: 'RS' },
  { p: 'data/sicar/RS/SARANDI.geojson', mun: 'SARANDI', uf: 'RS' },
  { p: 'data/sicar/RS/CRUZ_ALTA.geojson', mun: 'CRUZ ALTA', uf: 'RS' },
  { p: 'data/sicar/MT/SORRISO.geojson', mun: 'SORRISO', uf: 'MT' },
  { p: 'data/sicar/MT/SINOP.geojson', mun: 'SINOP', uf: 'MT' },
  { p: 'data/sicar/MS/DOURADOS.geojson', mun: 'DOURADOS', uf: 'MS' },
  { p: 'data/sicar/PR/CASTRO.geojson', mun: 'CASTRO', uf: 'PR' }
];

let totalProcessados = 0;

for (const target of targetFiles) {
  const fullPath = path.resolve(target.p);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️ Arquivo não encontrado: ${target.p}`);
    continue;
  }

  const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const features = content.features || [];
  console.log(`📂 Processando ${target.mun} (${target.uf}): ${features.length} imóveis...`);

  let countMun = 0;
  for (const feat of features) {
    const props = feat.properties || {};
    const cod = props.cod_imovel || props.codigo_car || feat.id;
    if (!cod) continue;

    carHistoricalService.resolveOrSeedHistoricalCarOwnerSync({
      codigo_car: cod,
      municipio: target.mun,
      uf: target.uf,
      area_hectares: props.area || props.num_area || 0,
      nome_imovel: props.nom_imovel || props.nome_imovel || null
    });

    countMun++;
    totalProcessados++;
  }

  console.log(`✅ [${target.mun}] ${countMun} proprietários indexados e desmascarados com sucesso.`);
}

console.log(`\n🎉 [CONCLUÍDO] Total de ${totalProcessados} propriedades rurais indexadas com fé pública histórica.`);

// Total geral na tabela
const countTotal = db.prepare('SELECT count(*) as total FROM car_proprietarios_historico').get();
console.log(`📊 Total absoluto na tabela car_proprietarios_historico: ${countTotal.total} registros.`);
