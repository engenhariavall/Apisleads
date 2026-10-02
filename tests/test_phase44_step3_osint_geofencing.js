/**
 * tests/test_phase44_step3_osint_geofencing.js
 * 
 * Bateria de Testes Automatizados para a Fase 44 - Etapa 3
 * Masterplan Motor Fundiário B2B: Fusão OSINT e Exportador de Geofencing
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import { 
  saveOrUpdateRuralProperty, 
  listRuralProperties, 
  generateSyntheticRuralPolygon 
} from '../server/src/services/geoFundiarioService.js';
import { osintService } from '../server/src/services/osintService.js';

const TEST_TENANT_ID = `tenant-step3-test-${Date.now()}`;
let testPassed = 0;
let testFailed = 0;

function pass(msg) {
  console.log(`  ✅ [PASS] ${msg}`);
  testPassed++;
}

function fail(msg, err) {
  console.error(`  ❌ [FAIL] ${msg}`);
  if (err) console.error(err);
  testFailed++;
}

async function runStep3Tests() {
  console.log('🚀 Iniciando bateria de testes da Fase 44 - Etapa 3 (Fusão OSINT e Exportador de Geofencing)...\n');

  // Garante que o tenant exista no banco de dados para evitar violação de Foreign Key
  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit)
    VALUES (?, 'Tenant Test Step 3', '00.999.888/0001-22', 'ENTERPRISE', 'ACTIVE', 10, 1000, 10000)
  `).run(TEST_TENANT_ID);

  try {
    // -------------------------------------------------------------------------
    // 1. Teste de Fusão OSINT Automática em Imóvel com SEM_GEO e Titular
    // -------------------------------------------------------------------------
    console.log('--- 1. Fusão OSINT Automática em Imóvel Rural SEM_GEO ---');
    const polySemGeo = generateSyntheticRuralPolygon(-12.5800, -55.7500, 3.1);

    const savedProp = await saveOrUpdateRuralProperty({
      id_sigef: `SIGEF-TEST-OSINT-${Date.now()}`,
      codigo_imovel: 'MT-OSINT-TEST-001',
      nome_imovel: 'Fazenda Terra Santa do Parecis',
      municipio: 'SORRISO',
      uf: 'MT',
      area_hectares: 2450.0,
      geometria_poligono: polySemGeo,
      nome_titular: 'Valdir Antonio Della Libera',
      cpf_cnpj_titular: '458.129.831-04',
      status_geo: 'SEM_GEO',
      titularData: { nova_filial_recente: true },
      telefone: '(66) 99841-2233' // Celular válido com DDD 66 para WhatsApp
    }, TEST_TENANT_ID);

    assert(savedProp.id, 'ID da propriedade criada deve existir');
    assert.strictEqual(savedProp.intent_score, 70, `Score esperado 70, obtido ${savedProp.intent_score}`);
    assert.strictEqual(savedProp.intent_classification, 'HOT', 'Classificação deve ser HOT');
    pass('Propriedade SEM_GEO qualificada como HOT com 70 pontos');

    // Valida persistência direta no SQLite dos campos de OSINT
    const dbRow = db.prepare(`
      SELECT id, status_geo, intent_classification, intent_score, whatsapp_validado, linkedin_url_real, osint_status 
      FROM propriedades_rurais WHERE id = ?
    `).get(savedProp.id);

    assert(dbRow, 'Registro deve existir no SQLite');
    assert.strictEqual(dbRow.status_geo, 'SEM_GEO');
    assert.strictEqual(dbRow.intent_classification, 'HOT');
    assert(dbRow.whatsapp_validado && dbRow.whatsapp_validado.includes('5566998412233'), `WhatsApp validado esperado com E.164, obtido: ${dbRow.whatsapp_validado}`);
    pass(`WhatsApp persistido e validado com sucesso: ${dbRow.whatsapp_validado}`);
    assert(dbRow.osint_status === 'ENRICHED' || dbRow.osint_status === 'NOT_FOUND', `Status OSINT: ${dbRow.osint_status}`);
    pass(`Status OSINT gravado no SQLite: ${dbRow.osint_status}`);

    // -------------------------------------------------------------------------
    // 2. Criação de mais propriedades para validar filtros de Geofencing
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Criação de base de dados para testes de exportação ---');
    // Propriedade 2: CERTIFICADO + WARM
    const polyCert = generateSyntheticRuralPolygon(-17.7600, -50.8800, 4.5);
    const propWarm = await saveOrUpdateRuralProperty({
      id_sigef: `SIGEF-TEST-WARM-${Date.now()}`,
      codigo_imovel: 'GO-WARM-002',
      nome_imovel: 'Fazenda Rio Verde Alvorada',
      municipio: 'RIO VERDE',
      uf: 'GO',
      area_hectares: 3200.0,
      geometria_poligono: polyCert,
      nome_titular: 'Grãos do Cerrado Participações S.A.',
      status_geo: 'CERTIFICADO',
      titularData: { aumento_capital_recente: true } // +30 pts (WARM)
    }, TEST_TENANT_ID);
    assert.strictEqual(propWarm.intent_classification, 'WARM');
    pass('Propriedade WARM criada com sucesso');

    // Propriedade 3: CERTIFICADO + COLD
    const polyCold = generateSyntheticRuralPolygon(-11.8300, -55.4800, 6.0);
    const propCold = await saveOrUpdateRuralProperty({
      id_sigef: `SIGEF-TEST-COLD-${Date.now()}`,
      codigo_imovel: 'MT-COLD-003',
      nome_imovel: 'Complexo Agroflorestal Sinopense',
      municipio: 'SINOP',
      uf: 'MT',
      area_hectares: 5100.0,
      geometria_poligono: polyCold,
      nome_titular: 'Agroflorestal Sinopense S.A.',
      status_geo: 'CERTIFICADO' // 0 pts (COLD)
    }, TEST_TENANT_ID);
    assert.strictEqual(propCold.intent_classification, 'COLD');
    pass('Propriedade COLD criada com sucesso');

    // -------------------------------------------------------------------------
    // 3. Teste do Endpoint de Exportação Geofencing em Formato JSON
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Teste do Endpoint GET /api/fundiario/export/geofencing (Formato JSON) ---');
    const baseUrl = 'http://localhost:3000';

    // Filtra exclusivamente por intent=HOT e status_geo=SEM_GEO
    const resHotJson = await fetch(`${baseUrl}/api/fundiario/export/geofencing?intent=HOT&status_geo=SEM_GEO&format=json`, {
      headers: {
        'x-tenant-id': TEST_TENANT_ID
      }
    });

    assert.strictEqual(resHotJson.status, 200, `Status esperado 200, recebido ${resHotJson.status}`);
    const jsonBody = await resHotJson.json();
    assert.strictEqual(jsonBody.success, true);
    assert(jsonBody.data && jsonBody.data.length > 0, 'Deve retornar ao menos 1 registro HOT');
    pass(`Total de alvos HOT retornados: ${jsonBody.total_records}`);

    const hotTarget = jsonBody.data[0];
    assert.strictEqual(hotTarget.intent_classification, 'HOT');
    assert.strictEqual(hotTarget.status_geo, 'SEM_GEO');
    assert(typeof hotTarget.latitude === 'number' && hotTarget.latitude < 0, `Latitude válida: ${hotTarget.latitude}`);
    assert(typeof hotTarget.longitude === 'number' && hotTarget.longitude < 0, `Longitude válida: ${hotTarget.longitude}`);
    assert(typeof hotTarget.raio_abrangencia_km === 'number' && hotTarget.raio_abrangencia_km > 0, `Raio válido: ${hotTarget.raio_abrangencia_km}`);
    pass(`Coordenadas exatas apuradas: (${hotTarget.latitude}, ${hotTarget.longitude}) com raio ${hotTarget.raio_abrangencia_km} km`);

    // Valida Formato Exigido pela API de Públicos de Localização Personalizada do Meta Ads
    assert(hotTarget.meta_ads_target_string, 'meta_ads_target_string deve existir');
    assert(hotTarget.meta_ads_target_string.includes(':+'), `String Meta Ads deve conter raio com prefixo :+ (${hotTarget.meta_ads_target_string})`);
    pass(`Formato Meta Ads Location validado: "${hotTarget.meta_ads_target_string}"`);

    // Valida Formato Google Ads Radius
    assert(hotTarget.google_ads_radius_target, 'google_ads_radius_target deve existir');
    pass(`Formato Google Ads Radius validado: "${hotTarget.google_ads_radius_target}"`);

    // -------------------------------------------------------------------------
    // 4. Teste do Endpoint de Exportação Geofencing em Formato CSV
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Teste do Endpoint GET /api/fundiario/export/geofencing (Formato CSV) ---');
    const resHotCsv = await fetch(`${baseUrl}/api/fundiario/export/geofencing?intent=HOT&format=csv`, {
      headers: {
        'x-tenant-id': TEST_TENANT_ID
      }
    });

    assert.strictEqual(resHotCsv.status, 200, `Status esperado 200, recebido ${resHotCsv.status}`);
    const contentType = resHotCsv.headers.get('content-type');
    assert(contentType.includes('text/csv'), `Content-Type deve ser text/csv, obtido: ${contentType}`);
    pass(`Content-Type validado: ${contentType}`);

    const arrayBuffer = await resHotCsv.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hasBom = (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) || buffer.toString('utf8').charCodeAt(0) === 0xFEFF;
    assert(hasBom, 'CSV deve conter UTF-8 BOM para compatibilidade com Excel');
    pass('BOM UTF-8 presente');

    const csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const csvLines = csvText.trim().split(/\r?\n/);
    assert(csvLines.length >= 2, 'CSV deve conter cabeçalho e pelo menos 1 linha de dados');
    const headerLine = csvLines[0];
    assert(headerLine.includes('latitude;longitude;raio_abrangencia_km;meta_ads_target_string'), 'Headers essenciais de tráfego presentes');
    assert(headerLine.includes('whatsapp_validado;linkedin_url_real;email_validado'), 'Headers de inteligência OSINT presentes');
    pass('Headers do CSV de Geofencing verificados');

    const firstDataRow = csvLines[1];
    assert(firstDataRow.includes('HOT'), 'Linha do CSV deve conter classificação HOT');
    pass(`Linha de dados CSV extraída com sucesso: ${firstDataRow.slice(0, 100)}...`);

    // -------------------------------------------------------------------------
    // 5. Teste de Isolamento Multi-tenant no Exportador
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Teste de Isolamento Multi-tenant no Exportador ---');
    const anotherTenant = `tenant-other-${Date.now()}`;
    db.prepare(`
      INSERT OR IGNORE INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit)
      VALUES (?, 'Tenant Outro', '00.111.222/0001-33', 'BASIC', 'ACTIVE', 5, 100, 1000)
    `).run(anotherTenant);

    const resEmptyTenant = await fetch(`${baseUrl}/api/fundiario/export/geofencing?intent=HOT&format=json`, {
      headers: {
        'x-tenant-id': anotherTenant
      }
    });

    // Como o anotherTenant não possui propriedades, deve retornar 404
    assert.strictEqual(resEmptyTenant.status, 404, `Status esperado 404 para tenant vazio, recebido ${resEmptyTenant.status}`);
    pass('Isolamento Multi-tenant rigorosamente respeitado: tenant estranho não visualiza dados alheios');

  } catch (err) {
    fail('Erro durante execução da suíte de testes da Etapa 3', err);
  } finally {
    // Limpeza de massa de teste
    try {
      db.prepare("DELETE FROM propriedades_rurais WHERE tenant_id LIKE 'tenant-step3-test%'").run();
      db.prepare("DELETE FROM tenants WHERE id LIKE 'tenant-step3-test%' OR id LIKE 'tenant-other%'").run();
      console.log('\n🧹 Massa de testes temporária limpa com sucesso.');
    } catch (_) {}
  }

  console.log('\n====================================================');
  console.log(`📊 TOTAL DE TESTES DA FASE 44 (ETAPA 3): ${testPassed + testFailed}`);
  console.log(`✅ APROVADOS: ${testPassed}`);
  console.log(`❌ FALHAS: ${testFailed}`);
  console.log('====================================================\n');

  if (testFailed > 0) {
    process.exit(1);
  }
}

runStep3Tests();
