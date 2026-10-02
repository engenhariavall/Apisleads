/**
 * tests/test_hotfix_car_agronomic_profile.js
 *
 * HOMOLOGAÇÃO: HOTFIX - PERFIL AGRONÔMICO PARA IMÓVEIS DO CAR (SICAR)
 *
 * 1. agronomicProfileService aceita imóveis com tag_fonte: 'SICAR' sem exigir id_sigef
 * 2. agronomicProfileService aceita 'FUSAO_SIGEF_CAR' e 'SIGEF'
 * 3. Fallback inteligente opera mesmo sem rede externa e identifica cultura compatível com a região
 * 4. normalizarFeatureCar injeta dados_agronomicos e crop_type automaticamente
 * 5. GET /api/fundiario/properties/:id resolve imóvel do CAR e retorna dados agronômicos de satélite
 */

import assert from 'assert';
import { agronomicProfileService } from '../server/src/services/agronomicProfileService.js';
import { carService } from '../server/src/services/carService.js';

let passed = 0;
let failed = 0;

function test(title, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}: ${err.message}`);
    failed++;
  }
}

async function testAsync(title, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}: ${err.message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🧪 TESTE HOTFIX: PERFIL AGRONÔMICO PARA IMÓVEIS DO CAR (SICAR)');
console.log('================================================================\n');

test('1. agronomicProfileService deve aceitar tag_fonte "SICAR" sem id_sigef', () => {
  const result = agronomicProfileService.getAgronomicProfileForProperty({
    tag_fonte: 'SICAR',
    codigo_car: 'RS-4314100-TESTE-01',
    id_sigef: null,
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    area_hectares: 750,
    geometria_poligono: {
      type: 'Polygon',
      coordinates: [[[-52.41, -28.23], [-52.36, -28.23], [-52.36, -28.26], [-52.41, -28.26], [-52.41, -28.23]]]
    }
  });

  assert.ok(result, 'Resultado deve existir');
  assert.strictEqual(result.crop_type, 'Soja', 'Passo Fundo/RS deve inferir Soja');
  assert.ok(result.confidence >= 0.90, 'Confiança deve ser >= 90%');
  assert.strictEqual(result.source_tag, 'SICAR');
  assert.strictEqual(result.source_validated, true);
});

test('2. agronomicProfileService deve suportar FUSAO_SIGEF_CAR e SIGEF', () => {
  assert.ok(agronomicProfileService.isPropertySourceSupported('SICAR'));
  assert.ok(agronomicProfileService.isPropertySourceSupported('CAR'));
  assert.ok(agronomicProfileService.isPropertySourceSupported('FUSAO_SIGEF_CAR'));
  assert.ok(agronomicProfileService.isPropertySourceSupported('SIGEF'));

  const fusaoRes = agronomicProfileService.getAgronomicProfileForProperty({
    tag_fonte: 'FUSAO_SIGEF_CAR',
    codigo_car: 'MT-5107925-TESTE-02',
    municipio: 'SORRISO',
    uf: 'MT',
    area_hectares: 1200
  });

  assert.strictEqual(fusaoRes.crop_type, 'Soja');
  assert.strictEqual(fusaoRes.source_tag, 'FUSAO_SIGEF_CAR');
});

test('3. Fallback inteligente deve prover perfil agronômico mesmo com polígono arbitrário', () => {
  const resSP = agronomicProfileService.getAgronomicProfileForProperty({
    tag_fonte: 'SICAR',
    codigo_car: 'SP-CAR-999',
    municipio: 'RIBEIRAO PRETO',
    uf: 'SP',
    geometria_poligono: {
      type: 'Polygon',
      coordinates: [[[-47.83, -21.15], [-47.79, -21.15], [-47.79, -21.19], [-47.83, -21.19], [-47.83, -21.15]]]
    }
  });

  assert.strictEqual(resSP.crop_type, 'Cana-de-Açúcar');
  assert.ok(resSP.sensor, 'Sensor deve ser declarado');
});

test('4. normalizarFeatureCar deve injetar dados_agronomicos e crop_type na feature GeoJSON', () => {
  const rawFeat = {
    type: 'Feature',
    properties: {
      cod_imovel: 'RS-4314100-MOCK-NORMALIZACAO',
      nom_imovel: 'Fazenda Rio Passo Fundo',
      nom_proprietario: 'Produtor Gaúcho',
      nom_municipio: 'PASSO FUNDO',
      sig_uf: 'RS',
      num_area: 520,
      ind_status: 'AT'
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[[-52.42, -28.24], [-52.38, -28.24], [-52.38, -28.27], [-52.42, -28.27], [-52.42, -28.24]]]
    }
  };

  const norm = carService.normalizarFeatureCar(rawFeat);
  const p = norm.properties;

  assert.strictEqual(p.source, 'CAR');
  assert.strictEqual(p.tag_fonte, 'SICAR');
  assert.ok(p.dados_agronomicos, 'dados_agronomicos deve estar preenchido');
  assert.strictEqual(p.dados_agronomicos.crop_type, 'Soja');
  assert.strictEqual(p.crop_type, 'Soja');
  assert.ok(p.crop_confidence >= 0.90);
});

async function run() {
  await testAsync('5. GET /api/fundiario/properties/:id deve resolver propriedade do CAR com dados reais', async () => {
    const http = (await import('http')).default;
    const { default: app } = await import('../server/src/app.js');
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    try {
      // Código CAR oficial real do acervo de Passo Fundo
      const realCarCode = 'RS-4314100-2B93327DB4B3495482168519AB8BFF95';
      const res = await fetch(`http://localhost:${port}/api/fundiario/properties/${realCarCode}`);
      assert.strictEqual(res.status, 200, 'HTTP deve ser 200');
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.data.dados_agronomicos, 'dados_agronomicos deve estar presente');
      assert.strictEqual(json.data.dados_agronomicos.crop_type, 'Soja');
      assert.strictEqual(json.data.codigo_car, realCarCode);
    } finally {
      server.close();
    }
  });

  console.log('\n================================================================');
  console.log(`📊 RESULTADO FINAL: ${passed} Passaram | ${failed} Falharam`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
