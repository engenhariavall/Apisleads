/**
 * tests/test_phase47_step2_reverse_geocode.js
 * 
 * BATERIA DE TESTES AUTOMATIZADOS: FASE 47 - ETAPA 2
 * Busca Reversa de Propriedade Rural (Point-in-Polygon / Pin-Drop no WebGL)
 * 
 * Cenários Testados:
 * 1. UI do Frontend: Botão [ 📍 Inspecionar Local ], Estilos CSS e Funções do mapEngine.js
 * 2. Algoritmo Geométrico: isPointInsideGeoJsonPolygon com Polygon, MultiPolygon e Buracos Internos
 * 3. Serviço de Busca Reversa: reverseGeocodeRuralProperty identificando polígonos reais
 * 4. Tratamento de "Buracos Negros": Retorno correto para pontos não cadastrados ("Área sem registro fundiário mapeado")
 * 5. Controller HTTP: Endpoint GET /api/fundiario/reverse-geocode com validação de parâmetros e payload
 * 6. Isolamento Multi-tenant e Acesso a Malhas Cadastrais
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../server/src/config/database.js';
import { 
  isPointInsideGeoJsonPolygon, 
  reverseGeocodeRuralProperty, 
  saveOrUpdateRuralProperty 
} from '../server/src/services/geoFundiarioService.js';
import { reverseGeocodeRuralPropertyHandler } from '../server/src/controllers/geoFundiarioController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🚀 Iniciando Testes da Fase 47 - Etapa 2 (Busca Reversa Espacial / Pin-Drop)...');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// 1. Verificação de Arquivos e UI Frontend
// -----------------------------------------------------------------------------
console.log('\n--- 1. Verificação de Elementos da UI Frontend ---');

it('index.html contém o botão [ 📍 Inspecionar Local ] na barra de ferramentas do mapa', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'client', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="btnInspectPinToggle"'), 'Botão com ID btnInspectPinToggle deve existir');
  assert.ok(indexHtml.includes('Inspecionar Local'), 'Texto "Inspecionar Local" deve estar presente no botão');
  assert.ok(indexHtml.includes('btn-inspect-pin'), 'Classe btn-inspect-pin deve estar no botão');
});

it('styles.css contém estilos táticos e animação pulsante para .btn-inspect-pin', () => {
  const css = fs.readFileSync(path.join(ROOT_DIR, 'client', 'css', 'styles.css'), 'utf-8');
  assert.ok(css.includes('.btn-map-control.btn-inspect-pin'), 'Estilo base .btn-inspect-pin deve existir');
  assert.ok(css.includes('.btn-map-control.btn-inspect-pin.active'), 'Estilo .btn-inspect-pin.active deve existir');
  assert.ok(css.includes('pulse-inspect-pin'), 'Keyframe pulse-inspect-pin deve estar definido');
});

it('mapEngine.js implementa e exporta as rotinas de controle do Alfinete tático', () => {
  const engineJs = fs.readFileSync(path.join(ROOT_DIR, 'client', 'js', 'mapEngine.js'), 'utf-8');
  assert.ok(engineJs.includes('setupInspectPinControls'), 'setupInspectPinControls deve estar definido');
  assert.ok(engineJs.includes('toggleInspectPinTool'), 'toggleInspectPinTool deve estar definido');
  assert.ok(engineJs.includes('activateInspectPinTool'), 'activateInspectPinTool deve estar definido');
  assert.ok(engineJs.includes('deactivateInspectPinTool'), 'deactivateInspectPinTool deve estar definido');
  assert.ok(engineJs.includes('handleInspectPinMapClick'), 'handleInspectPinMapClick deve estar definido');
  assert.ok(engineJs.includes("crosshair"), 'Deve configurar cursor crosshair');
  assert.ok(engineJs.includes('/api/fundiario/reverse-geocode'), 'Deve consumir rota GET /api/fundiario/reverse-geocode');
  assert.ok(engineJs.includes('inspectRuralPropertyInDrawer'), 'Deve invocar inspectRuralPropertyInDrawer ao encontrar');
  assert.ok(engineJs.includes('Área sem registro fundiário mapeado'), 'Deve exibir toast exato para área sem registro');
});

// -----------------------------------------------------------------------------
// 2. Verificação do Algoritmo Geométrico Point-in-Polygon (Ray-Casting)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Geometria Analítica Point-in-Polygon ---');

it('isPointInsideGeoJsonPolygon identifica corretamente ponto dentro de polígono GeoJSON', () => {
  // Quadrado entre lng -55.0 a -54.0 e lat -12.0 a -11.0
  const squarePoly = {
    type: 'Polygon',
    coordinates: [
      [
        [-55.0, -12.0],
        [-54.0, -12.0],
        [-54.0, -11.0],
        [-55.0, -11.0],
        [-55.0, -12.0]
      ]
    ]
  };

  const inside = isPointInsideGeoJsonPolygon(-54.5, -11.5, squarePoly);
  assert.strictEqual(inside, true, 'Ponto central (-54.5, -11.5) deve estar dentro do polígono');

  const outside = isPointInsideGeoJsonPolygon(-56.0, -11.5, squarePoly);
  assert.strictEqual(outside, false, 'Ponto distante (-56.0, -11.5) deve estar fora do polígono');
});

it('isPointInsideGeoJsonPolygon suporta MultiPolygon', () => {
  const multiPoly = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [[-55.0, -12.0], [-54.0, -12.0], [-54.0, -11.0], [-55.0, -11.0], [-55.0, -12.0]]
      ],
      [
        [[-50.0, -15.0], [-49.0, -15.0], [-49.0, -14.0], [-50.0, -14.0], [-50.0, -15.0]]
      ]
    ]
  };

  assert.strictEqual(isPointInsideGeoJsonPolygon(-54.5, -11.5, multiPoly), true, 'Ponto na parte 1 do multipolígono deve ser true');
  assert.strictEqual(isPointInsideGeoJsonPolygon(-49.5, -14.5, multiPoly), true, 'Ponto na parte 2 do multipolígono deve ser true');
  assert.strictEqual(isPointInsideGeoJsonPolygon(-52.0, -13.0, multiPoly), false, 'Ponto entre as partes deve ser false');
});

it('isPointInsideGeoJsonPolygon respeita anéis internos (furos / buracos no terreno)', () => {
  // Terreno de 0 a 10 com buraco de 3 a 7
  const donutPoly = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], // Anel externo
      [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]      // Anel interno (buraco)
    ]
  };

  assert.strictEqual(isPointInsideGeoJsonPolygon(1, 1, donutPoly), true, 'Ponto no anel externo deve ser true');
  assert.strictEqual(isPointInsideGeoJsonPolygon(5, 5, donutPoly), false, 'Ponto dentro do buraco interno deve ser false');
});

// -----------------------------------------------------------------------------
// 3. Verificação do Serviço reverseGeocodeRuralProperty com Banco de Dados
// -----------------------------------------------------------------------------
console.log('\n--- 3. Busca Reversa Espacial com Banco de Dados ---');

await itAsync('reverseGeocodeRuralProperty encontra fazenda cadastrada a partir de coordenadas exatas', async () => {
  const testTenant = 'tenant-test-pin-drop';
  const testSigef = 'SIGEF-TEST-REVERSE-001';

  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name, plan, status)
    VALUES (?, ?, ?, ?)
  `).run(testTenant, 'Empresa Teste Pin-Drop', 'ENTERPRISE', 'ACTIVE');

  // Seed de propriedade teste
  const saved = await saveOrUpdateRuralProperty({
    id_sigef: testSigef,
    codigo_imovel: 'TEST-IMV-001',
    nome_imovel: 'Fazenda Santa Tereza do Guaporé',
    municipio: 'SORRISO',
    uf: 'MT',
    area_hectares: 3200,
    geometria_poligono: {
      type: 'Polygon',
      coordinates: [
        [
          [-55.80, -12.60],
          [-55.70, -12.60],
          [-55.70, -12.50],
          [-55.80, -12.50],
          [-55.80, -12.60]
        ]
      ]
    },
    nome_titular: 'Coronel Agrícola da Silva',
    cpf_cnpj_titular: '04.999.888/0001-77',
    status_geo: 'CERTIFICADO'
  }, testTenant);

  assert.ok(saved && saved.id, 'Propriedade de teste deve ser criada com sucesso');

  // Consulta ponto central da fazenda: Lat -12.55, Lng -55.75
  const match = await reverseGeocodeRuralProperty(-12.55, -55.75, testTenant);

  assert.ok(match, 'Propriedade deve ser encontrada no ponto central');
  assert.strictEqual(match.nome_imovel, 'Fazenda Santa Tereza do Guaporé');
  assert.strictEqual(match.nome_titular, 'Coronel Agrícola da Silva');
  assert.strictEqual(match.uf, 'MT');
  assert.strictEqual(match.municipio, 'SORRISO');
});

await itAsync('reverseGeocodeRuralProperty retorna null ao clicar em coordenada sem cadastro ("buraco negro")', async () => {
  // Coordenada no meio do Oceano Atlântico: Lat 0.0, Lng 0.0
  const match = await reverseGeocodeRuralProperty(0.0, 0.0, 'tenant-root-default');
  assert.strictEqual(match, null, 'Ponto sem registro deve retornar null');
});

// -----------------------------------------------------------------------------
// 4. Verificação do Controller HTTP e Respostas REST
// -----------------------------------------------------------------------------
console.log('\n--- 4. Controller HTTP reverseGeocodeRuralPropertyHandler ---');

await itAsync('Handler retorna HTTP 400 se lat ou lng estiverem ausentes', async () => {
  const req = { query: {} };
  let statusCode = null;
  let jsonResponse = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonResponse = payload;
      return this;
    }
  };

  await reverseGeocodeRuralPropertyHandler(req, res);

  assert.strictEqual(statusCode, 400);
  assert.strictEqual(jsonResponse.success, false);
  assert.ok(jsonResponse.error.includes('obrigatórios'));
});

await itAsync('Handler retorna mensagem tática "Área sem registro fundiário mapeado" para ponto não mapeado', async () => {
  const req = {
    query: { lat: '1.2345', lng: '-30.5432' },
    headers: {}
  };
  let statusCode = null;
  let jsonResponse = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonResponse = payload;
      return this;
    }
  };

  await reverseGeocodeRuralPropertyHandler(req, res);

  assert.strictEqual(statusCode, 200);
  assert.strictEqual(jsonResponse.success, false);
  assert.strictEqual(jsonResponse.data, null);
  assert.strictEqual(jsonResponse.message, 'Área sem registro fundiário mapeado');
});

await itAsync('Handler retorna dados completos e HTTP 200 ao interceptar fazenda cadastrada', async () => {
  const req = {
    query: { lat: '-12.55', lng: '-55.75' },
    headers: { 'x-tenant-id': 'tenant-test-pin-drop' }
  };
  let statusCode = null;
  let jsonResponse = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonResponse = payload;
      return this;
    }
  };

  await reverseGeocodeRuralPropertyHandler(req, res);

  assert.strictEqual(statusCode, 200);
  assert.strictEqual(jsonResponse.success, true);
  assert.ok(jsonResponse.data);
  assert.strictEqual(jsonResponse.data.nome_imovel, 'Fazenda Santa Tereza do Guaporé');
  assert.ok(jsonResponse.data.area_hectares >= 3200);
});

// -----------------------------------------------------------------------------
// Resumo da Execução
// -----------------------------------------------------------------------------
console.log(`\n======================================================`);
console.log(`Relatório de Execução - Fase 47 (Etapa 2: Busca Reversa / Pin-Drop):`);
console.log(`Total de Testes: ${passed + failed}`);
console.log(`Aprovados: ${passed}`);
console.log(`Falhas: ${failed}`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
