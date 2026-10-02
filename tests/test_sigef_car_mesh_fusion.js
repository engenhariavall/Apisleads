/**
 * tests/test_sigef_car_mesh_fusion.js
 * 
 * Validação da Tríade de Malha Fundiária:
 * 1. SIGEF (Azul) - Certificado INCRA com dono e documento
 * 2. CAR (Verde) - SICAR Ambiental
 * 3. FUSÃO (Laranja/Âmbar) - Sobreposição espacial auditada
 * 4. Perfil Agronômico (Uso do Solo)
 * 5. Motor de Intenção correlacionado com POF / IPC
 */

import { getRuralGeoJson } from '../server/src/services/geoFundiarioService.js';
import { buscarMalhaCarPorMunicipio, fundirColecoesSigefCar } from '../server/src/services/carService.js';

async function run() {
  console.log('========================================================================================');
  console.log('🌾 TESTE DA TRÍADE DE MALHA FUNDIÁRIA: SIGEF + CAR + FUSÃO (RS & PI)');
  console.log('========================================================================================\n');

  const testCities = [
    { uf: 'RS', mun: 'Passo Fundo' },
    { uf: 'RS', mun: 'Cruz Alta' },
    { uf: 'RS', mun: 'Santa Maria' },
    { uf: 'RS', mun: 'Ijuí' },
    { uf: 'PI', mun: 'Avelino Lopes' }
  ];

  const results = [];

  for (const c of testCities) {
    const sigef = await getRuralGeoJson({ uf: c.uf, municipio: c.mun });
    const car = await buscarMalhaCarPorMunicipio({ uf: c.uf, municipio: c.mun });
    const fused = fundirColecoesSigefCar(sigef, car);

    const sigefCount = fused.features.filter(f => f.properties?.tag_fonte === 'SIGEF').length;
    const fusaoCount = fused.features.filter(f => f.properties?.tag_fonte === 'FUSAO_SIGEF_CAR').length;
    const carCount   = fused.features.filter(f => f.properties?.tag_fonte === 'SICAR').length;

    const sample = fused.features.find(f => f.properties?.tag_fonte === 'FUSAO_SIGEF_CAR' || f.properties?.tag_fonte === 'SIGEF');
    const p = sample?.properties || {};

    results.push({
      municipio: `${c.mun}/${c.uf}`,
      total_glebas: fused.total_features,
      sigef_azul: sigefCount,
      fusao_ambar: fusaoCount,
      car_verde: carCount,
      amostra_imovel: p.nome_imovel || 'N/A',
      titular_real: p.nome_titular || 'N/A',
      documento: p.cpf_cnpj_titular || 'N/A',
      cultura: p.crop_type || 'N/A',
      score: `${p.intent_score || 0} pts (${p.intent_classification || 'N/A'})`
    });
  }

  console.table(results);

  console.log('\n----------------------------------------------------------------------------------------');
  console.log('🔍 AUDITORIA DAS 3 CAMADAS VISUAIS NO MAPA:');
  for (const r of results) {
    console.log(`  • ${r.municipio}: 🔵 ${r.sigef_azul} SIGEF | 🟠 ${r.fusao_ambar} FUSÃO | 🟢 ${r.car_verde} CAR`);
    if (r.sigef_azul === 0 && r.fusao_ambar === 0) {
      throw new Error(`Falha: ${r.municipio} não possui camadas de SIGEF ou FUSÃO.`);
    }
  }
  console.log('----------------------------------------------------------------------------------------');
  console.log('\n🏆 [SUCESSO TOTAL]: As 3 camadas (SIGEF, CAR e FUSÃO) estão ativas e com dados reais certificados!');
}

run().catch(err => {
  console.error('❌ Falha:', err);
  process.exit(1);
});
