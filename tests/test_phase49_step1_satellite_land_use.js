/**
 * tests/test_phase49_step1_satellite_land_use.js
 * 
 * BATERIA DE TESTES AUTOMATIZADOS: FASE 49 - ETAPA 1
 * Sensoriamento Remoto e Identificação de Cultivos Agrícolas (MapBiomas / Sentinel-2)
 * 
 * Cenários Testados:
 * 1. Teste Unitário: Identificação de Soja em Sorriso/MT (Capital do Agro).
 * 2. Teste Unitário: Identificação de Pastagem/Pecuária na Amazônia (Pará).
 * 3. Teste Unitário: Identificação de Cana-de-Açúcar no Interior de São Paulo (Ribeirão Preto).
 * 4. Teste Geométrico Puro: Extração automática de centróide e inferência de cultivo sem metadados textuais.
 * 5. Formato Padronizado: Validação rigorosa de { crop_type, confidence, last_update }.
 * 6. Integração com Banco e geoFundiarioService: Persistência e listagem com dados_agronomicos.
 * 7. Integração com Busca Reversa (Pin-Drop): Agregação de dados_agronomicos no dossiê espacial.
 * 8. Endpoints HTTP: GET /api/fundiario/properties/:id e POST /api/fundiario/land-use.
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import { satelliteService } from '../server/src/services/satelliteService.js';
import { 
  saveOrUpdateRuralProperty, 
  listRuralProperties, 
  reverseGeocodeRuralProperty 
} from '../server/src/services/geoFundiarioService.js';
import { 
  getRuralPropertyByIdHandler, 
  analyzeLandUseHandler 
} from '../server/src/controllers/geoFundiarioController.js';

console.log('🚀 Iniciando Bateria de Testes da Fase 49 - Etapa 1 (Sensoriamento Remoto de Cultivos)...');

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
// 1. Testes Unitários do Motor de Sensoriamento (satelliteService)
// -----------------------------------------------------------------------------
console.log('\n--- 1. Identificação Agronômica por Satélite (MapBiomas / Sentinel-2) ---');

it('Sorriso/MT: Retorna "Soja" com alta confiança (>= 0.90) e agricultura de larga escala', () => {
  // Polígono fictício no município de Sorriso/MT (Região do Médio-Norte de Mato Grosso)
  const sorrisoPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-55.75, -12.55],
        [-55.65, -12.55],
        [-55.65, -12.45],
        [-55.75, -12.45],
        [-55.75, -12.55]
      ]
    ]
  };

  const result = satelliteService.identifyLandUse(sorrisoPolygon, {
    municipio: 'SORRISO',
    uf: 'MT',
    area_hectares: 4500
  });

  assert.strictEqual(result.crop_type, 'Soja', 'Cultivo principal em Sorriso deve ser Soja');
  assert.ok(result.confidence >= 0.90, `Confiança esperada >= 0.90, obtida: ${result.confidence}`);
  assert.strictEqual(result.last_update, '2025-08', 'Data da última leitura de satélite deve ser 2025-08');
  assert.ok(result.macro_classe.includes('Agricultura') || result.macro_classe.includes('Larga Escala'), 'Deve indicar agricultura de larga escala');
  assert.strictEqual(result.safra_secundaria, 'Milho Safrinha');
});

it('Pará (Marabá/PA): Retorna "Pastagem" e bioma Amazônia', () => {
  const paraPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-49.15, -5.35],
        [-49.05, -5.35],
        [-49.05, -5.25],
        [-49.15, -5.25],
        [-49.15, -5.35]
      ]
    ]
  };

  const result = satelliteService.identifyLandUse(paraPolygon, {
    municipio: 'MARABA',
    uf: 'PA'
  });

  assert.strictEqual(result.crop_type, 'Pastagem', 'Cultivo/Uso principal no Pará tradicional deve ser Pastagem');
  assert.ok(result.confidence >= 0.85, 'Confiança esperada >= 0.85');
  assert.strictEqual(result.bioma, 'Amazônia');
});

it('São Paulo (Ribeirão Preto/SP): Retorna "Cana-de-Açúcar" e bioenergia', () => {
  const spPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-47.85, -21.20],
        [-47.75, -21.20],
        [-47.75, -21.10],
        [-47.85, -21.10],
        [-47.85, -21.20]
      ]
    ]
  };

  const result = satelliteService.identifyLandUse(spPolygon, {
    municipio: 'RIBEIRAO PRETO',
    uf: 'SP'
  });

  assert.strictEqual(result.crop_type, 'Cana-de-Açúcar');
  assert.ok(result.confidence >= 0.90);
  assert.ok(result.macro_classe.includes('Sucroalcooleiro') || result.macro_classe.includes('Bioenergia'));
});

it('Inferência pura por Coordenadas (sem metadados de texto) identifica Soja no MT', () => {
  // Polígono em coordenadas de MT central (Lng -55.70, Lat -12.50) sem passar município ou UF
  const anonymousMTPoly = {
    type: 'Polygon',
    coordinates: [
      [
        [-55.72, -12.52],
        [-55.68, -12.52],
        [-55.68, -12.48],
        [-55.72, -12.48],
        [-55.72, -12.52]
      ]
    ]
  };

  const result = satelliteService.identifyLandUse(anonymousMTPoly, {});
  assert.strictEqual(result.crop_type, 'Soja', 'Deve inferir Soja pelas coordenadas geográficas do cinturão de MT');
  assert.ok(result.confidence >= 0.90);
  assert.strictEqual(result.last_update, '2025-08');
});

// -----------------------------------------------------------------------------
// 2. Integração com geoFundiarioService e Banco de Dados SQLite
// -----------------------------------------------------------------------------
console.log('\n--- 2. Integração no Fluxo de Persistência e Consulta Fundiária ---');

await itAsync('saveOrUpdateRuralProperty agrega e persiste dados_agronomicos automaticamente', async () => {
  const testTenant = 'tenant-test-agronomy';
  const testSigef = 'SIGEF-MT-AGRONOMY-001';

  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name, plan, status)
    VALUES (?, ?, ?, ?)
  `).run(testTenant, 'Empresa Teste Agronomia', 'ENTERPRISE', 'ACTIVE');

  const saved = await saveOrUpdateRuralProperty({
    id_sigef: testSigef,
    codigo_imovel: 'MT-AGRO-001',
    nome_imovel: 'Fazenda Terra Produtiva Sorriso',
    municipio: 'SORRISO',
    uf: 'MT',
    area_hectares: 5200,
    geometria_poligono: {
      type: 'Polygon',
      coordinates: [
        [
          [-55.78, -12.58],
          [-55.68, -12.58],
          [-55.68, -12.48],
          [-55.78, -12.48],
          [-55.78, -12.58]
        ]
      ]
    },
    nome_titular: 'Agropecuária Grãos do Cerrado SA',
    cpf_cnpj_titular: '09.876.543/0001-21',
    status_geo: 'CERTIFICADO'
  }, testTenant);

  assert.ok(saved && saved.id, 'Propriedade rural deve ser criada');
  assert.ok(saved.dados_agronomicos, 'Retorno da criação deve conter dados_agronomicos');
  assert.strictEqual(saved.dados_agronomicos.crop_type, 'Soja');
  assert.ok(saved.dados_agronomicos.confidence >= 0.90);

  // Verificação direta no banco SQLite
  const row = db.prepare(`SELECT dados_agronomicos FROM propriedades_rurais WHERE id = ?`).get(saved.id);
  assert.ok(row && row.dados_agronomicos, 'Coluna dados_agronomicos deve estar persistida no SQLite');
  const parsed = JSON.parse(row.dados_agronomicos);
  assert.strictEqual(parsed.crop_type, 'Soja');
});

await itAsync('listRuralProperties retorna o campo dados_agronomicos preenchido', async () => {
  const result = await listRuralProperties({ municipio: 'SORRISO' }, 'tenant-test-agronomy');
  assert.ok(result.data.length > 0, 'Deve listar propriedades cadastradas');
  const prop = result.data.find(p => p.id_sigef && p.id_sigef.startsWith('SIGEF-MT-AGRONOMY-001'));
  assert.ok(prop, 'Propriedade de teste deve estar na listagem');
  assert.ok(prop.dados_agronomicos, 'Propriedade listada deve possuir dados_agronomicos');
  assert.strictEqual(prop.dados_agronomicos.crop_type, 'Soja');
  assert.strictEqual(prop.dados_agronomicos.last_update, '2025-08');
});

await itAsync('reverseGeocodeRuralProperty (Busca Reversa) inclui dados_agronomicos no dossiê retornado', async () => {
  // Ponto central da Fazenda Terra Produtiva Sorriso: Lat -12.53, Lng -55.73
  const prop = await reverseGeocodeRuralProperty(-12.53, -55.73, 'tenant-test-agronomy');
  assert.ok(prop, 'Busca reversa deve identificar a propriedade no ponto');
  assert.strictEqual(prop.nome_imovel, 'Fazenda Terra Produtiva Sorriso');
  assert.ok(prop.dados_agronomicos, 'Dossiê da busca reversa deve conter dados_agronomicos');
  assert.strictEqual(prop.dados_agronomicos.crop_type, 'Soja');
  assert.ok(prop.dados_agronomicos.confidence >= 0.90);
});

// -----------------------------------------------------------------------------
// 3. Testes dos Handlers REST do Controller
// -----------------------------------------------------------------------------
console.log('\n--- 3. Endpoints REST (Dossiê de Propriedade & Análise de Cultivo) ---');

await itAsync('GET /api/fundiario/properties/:id retorna dados_agronomicos completos', async () => {
  const row = db.prepare("SELECT id FROM propriedades_rurais WHERE id_sigef LIKE 'SIGEF-MT-AGRONOMY-001%'").get();
  assert.ok(row && row.id);

  const req = {
    params: { id: row.id },
    headers: { 'x-tenant-id': 'tenant-test-agronomy' }
  };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; }
  };

  await getRuralPropertyByIdHandler(req, res);

  assert.strictEqual(statusCode, 200);
  assert.strictEqual(responseData.success, true);
  assert.ok(responseData.data.dados_agronomicos);
  assert.strictEqual(responseData.data.dados_agronomicos.crop_type, 'Soja');
  assert.strictEqual(responseData.data.dados_agronomicos.last_update, '2025-08');
});

await itAsync('POST /api/fundiario/land-use avalia satélite para polígono arbitrário', async () => {
  const req = {
    body: {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-50.95, -17.80],
            [-50.85, -17.80],
            [-50.85, -17.70],
            [-50.95, -17.70],
            [-50.95, -17.80]
          ]
        ]
      },
      metadata: { municipio: 'RIO VERDE', uf: 'GO' }
    },
    headers: {}
  };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; }
  };

  await analyzeLandUseHandler(req, res);

  assert.strictEqual(statusCode, 200);
  assert.strictEqual(responseData.success, true);
  assert.ok(responseData.data);
  assert.strictEqual(responseData.data.crop_type, 'Soja');
  assert.strictEqual(responseData.data.last_update, '2025-08');
});

// -----------------------------------------------------------------------------
// Resumo da Bateria de Testes
// -----------------------------------------------------------------------------
console.log(`\n======================================================`);
console.log(`Relatório de Execução - Fase 49 (Etapa 1: Sensoriamento Remoto):`);
console.log(`Total de Testes: ${passed + failed}`);
console.log(`Aprovados: ${passed}`);
console.log(`Falhas: ${failed}`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
