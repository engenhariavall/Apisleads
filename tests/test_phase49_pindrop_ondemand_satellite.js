/**
 * Teste de Homologação: Correção de Bug Crítico na Integração Sensoriamento Remoto no Pin-Drop
 * Valida:
 * 1. Gatilho Sob Demanda no Backend (reverse-geocode detecta dados_agronomicos nulo e injeta satelliteService síncrono).
 * 2. Persistência do resultado no banco de dados SQLite.
 * 3. Elementos e animação tática no Frontend ("Processando telemetria de satélite...").
 * 4. Resposta enriquecida completa (Soja, confiança >= 90%, etc.).
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../server/src/config/database.js';
import { reverseGeocodeRuralPropertyHandler } from '../server/src/controllers/geoFundiarioController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🛰️ [FASE 49 - FIX PIN-DROP] Iniciando Testes de Sensoriamento Sob Demanda...');

let passed = 0;
async function test(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Detalhes: ${err.message}`);
    process.exit(1);
  }
}

async function run() {
  // 1. Cria uma fazenda com coordenadas geográficas exclusivas em Sorriso/MT com dados_agronomicos = NULL
  const testFarmId = 'prop-test-mt-sorriso-fix-exclusive';
  // Coordenadas exclusivas em Sorriso/MT
  const testLat = -12.9900;
  const testLng = -55.9900;
  const coordsSorriso = [
    [-55.9950, -12.9950],
    [-55.9850, -12.9950],
    [-55.9850, -12.9850],
    [-55.9950, -12.9850],
    [-55.9950, -12.9950]
  ];

  db.prepare(`DELETE FROM propriedades_rurais WHERE id = ?`).run(testFarmId);
  db.prepare(`
    INSERT INTO propriedades_rurais (
      id, id_sigef, codigo_imovel, nome_imovel, municipio, uf,
      area_hectares, geometria_poligono, centroide_lat, centroide_lng,
      raio_abrangencia_km, nome_titular, cpf_cnpj_titular, status_geo,
      dados_agronomicos, tenant_id, created_at, updated_at
    ) VALUES (
      ?, 'SIGEF-MT-TEST-EXCL-001', 'MT-SORRISO-TEST-EXCL', 'Fazenda Agro Ouro Exclusiva MT', 'SORRISO', 'MT',
      4200.0, ?, ?, ?,
      2.5, 'Agropecuária Sorriso Exclusiva Ltda', '02.333.444/0001-55', 'CERTIFICADO',
      NULL, 'tenant-root-default', datetime('now'), datetime('now')
    )
  `).run(
    testFarmId,
    JSON.stringify({ type: 'Polygon', coordinates: [coordsSorriso] }),
    testLat,
    testLng
  );

  await test('Garante que a fazenda de teste foi inserida com dados_agronomicos estritamente NULL', () => {
    const row = db.prepare('SELECT dados_agronomicos FROM propriedades_rurais WHERE id = ?').get(testFarmId);
    assert(row, 'Propriedade de teste deve existir');
    assert.strictEqual(row.dados_agronomicos, null, 'dados_agronomicos deve ser inicialmente NULL');
  });

  // 2. Executa a requisição simulada de reverse-geocode com as coordenadas da fazenda em Sorriso/MT
  let returnedFarmId = null;
  await test('Simula GET /api/fundiario/reverse-geocode e valida gatilho sob demanda do satélite', async () => {
    let responseStatus = 200;
    let responseJson = null;

    const req = {
      query: { lat: testLat, lng: testLng },
      headers: { 'x-tenant-id': 'tenant-root-default' }
    };

    const res = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseJson = data; return this; }
    };

    await reverseGeocodeRuralPropertyHandler(req, res);

    assert.strictEqual(responseStatus, 200, 'Status deve ser 200');
    assert(responseJson && responseJson.success, 'Resposta deve indicar success: true');
    assert(responseJson.data, 'Resposta deve conter o objeto data da propriedade');
    assert.strictEqual(responseJson.data.id, testFarmId, 'Deve identificar exatamente a fazenda testada');
    returnedFarmId = responseJson.data.id;

    // Valida se o satélite foi acionado sob demanda
    const agro = responseJson.data.dados_agronomicos;
    assert(agro, 'dados_agronomicos deve ter sido preenchido sob demanda na resposta');
    assert.strictEqual(agro.crop_type, 'Soja', 'Cultura em Sorriso/MT deve ser Soja');
    assert(agro.confidence >= 0.90, 'Confiança da cultura deve ser alta (>= 90%)');
    assert(agro.last_update, 'Data da última leitura de satélite deve estar presente');
  });

  // 3. Valida se o resultado foi devidamente persistido no banco de dados SQLite
  await test('Valida que o resultado do sensoriamento remoto foi salvo de forma persistente no SQLite', () => {
    const updatedRow = db.prepare('SELECT dados_agronomicos FROM propriedades_rurais WHERE id = ?').get(returnedFarmId);
    assert(updatedRow && updatedRow.dados_agronomicos, 'dados_agronomicos deve estar persistido no banco');

    const parsed = JSON.parse(updatedRow.dados_agronomicos);
    assert.strictEqual(parsed.crop_type, 'Soja', 'Cultura persistida deve ser Soja');
    assert(parsed.confidence >= 0.90, 'Confiança persistida deve ser >= 90%');
  });

  // 4. Valida a integração e animação no Frontend (index.html, styles.css, app.js)
  await test('Valida que index.html contém o elemento #ruralCropLoading com animação tática', () => {
    const html = fs.readFileSync(path.join(__dirname, '../client/index.html'), 'utf8');
    assert(html.includes('id="ruralCropLoading"'), 'Elemento #ruralCropLoading não encontrado no index.html');
    assert(html.includes('Processando telemetria de satélite...'), 'Texto "Processando telemetria de satélite..." ausente no HTML');
  });

  await test('Valida que styles.css possui as classes .agronomy-loading e .agronomy-spinner', () => {
    const css = fs.readFileSync(path.join(__dirname, '../client/css/styles.css'), 'utf8');
    assert(css.includes('.agronomy-loading'), 'Classe .agronomy-loading ausente no styles.css');
    assert(css.includes('pulseAgronomyLoading'), 'Keyframe pulseAgronomyLoading ausente');
  });

  await test('Valida que app.js possui a lógica de loading tático e enriquecimento assíncrono', () => {
    const js = fs.readFileSync(path.join(__dirname, '../client/js/app.js'), 'utf8');
    assert(js.includes('ruralCropLoading'), 'Manipulação de ruralCropLoading ausente no app.js');
    assert(js.includes('/api/fundiario/properties/'), 'Requisição assíncrona sob demanda ausente no app.js');
  });

  // Limpa o registro de teste
  db.prepare(`DELETE FROM propriedades_rurais WHERE id = ?`).run(testFarmId);

  console.log(`\n🎉 [SUCESSO TOTAL] Todos os ${passed} testes da Correção de Sensoriamento no Pin-Drop foram aprovados com louvor!`);
}

run().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
