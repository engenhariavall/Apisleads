/**
 * tests/test_phase42_step1_isolation.js
 * 
 * FASE 42 - ETAPA 1: VALIDAÇÃO DE ISOLAMENTO E ESTADO ZERO MULTI-TENANT (BACKEND)
 * 
 * Verifica que para uma empresa recém-criada (ou sem dados associados):
 * 1. GET /api/verticals retorna 0 para todos os contadores de verticais e total_leads = 0.
 * 2. GET /api/verticals/:vertical/metrics retorna total_leads = 0 e métricas zeradas.
 * 3. GET /api/locations retorna ufs = [] e citiesByUf = {}.
 * 4. POST /api/gis/map-points retorna total_points = 0 e points = [].
 * 5. POST /api/gis/geojson retorna total_features = 0 e features = [].
 * 6. GET /api/competitors/list retorna total_count = 0 e data = [].
 * 7. GET /api/competitors/gaps retorna total_gaps = 0 e data = [] (Zero State sem gaps fictícios).
 * 8. GET /api/macro/layers/municipal-potential retorna features com leads_count = 0 para a empresa nova.
 * 9. Verifica que o Tenant Raiz (tenant-root-default) continua retornando seus dados volumosos normalmente (Zero Regressão).
 */

import db from '../server/src/config/database.js';

const BASE_URL = 'http://localhost:3000';
let superAdminToken = null;

async function run() {
  console.log('🚀 Iniciando bateria de testes da Fase 42 - Etapa 1 (Isolamento Multi-Tenant Backend)...');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 0. Autenticação Super Admin para criar empresa de teste limpa
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hajaluzstudio@gmail.com', password: 'sophia11052016' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.ok && loginData.token, 'Super Admin autenticado com sucesso');
    superAdminToken = loginData.token;

    // 1. Criar novo Tenant sem nenhum lead (Estado Zero)
    const testTenantId = `tenant-zero-test-${Date.now()}`;
    db.prepare(`
      INSERT INTO tenants (id, name, cnpj, status, plan, max_users, daily_quota_limit, monthly_quota_limit, created_at)
      VALUES (?, ?, ?, 'ACTIVE', 'PROFESSIONAL', 5, 1000, 10000, datetime('now'))
    `).run(testTenantId, 'Empresa Zero State Teste Ltda', '99.888.777/0001-99');
    console.log(`\n🏢 Tenant de teste criado: ${testTenantId}`);

    const newTenantHeaders = {
      'Content-Type': 'application/json',
      'X-Tenant-ID': testTenantId
    };

    const rootTenantHeaders = {
      'Content-Type': 'application/json',
      'X-Tenant-ID': 'tenant-root-default'
    };

    // -------------------------------------------------------------------------
    // TESTE 1: GET /api/verticals (Agregadores e Contadores Laterais)
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testando /api/verticals (Contadores Laterais) ---');
    const vertRes = await fetch(`${BASE_URL}/api/verticals`, { headers: newTenantHeaders });
    const vertData = await vertRes.json();
    assert(vertRes.ok && vertData.success, 'Resposta de /api/verticals com sucesso');
    
    // Todos os total_leads devem ser 0
    const nonZeroVerts = (vertData.verticals || []).filter(v => v.total_leads > 0);
    assert(nonZeroVerts.length === 0, `Nova empresa possui 0 leads em todas as verticais (retornou ${nonZeroVerts.length} com contagem)`);
    
    // Tenant Raiz deve continuar com leads (> 0)
    const vertRootRes = await fetch(`${BASE_URL}/api/verticals`, { headers: rootTenantHeaders });
    const vertRootData = await vertRootRes.json();
    const rootTotalVert = vertRootData.verticals?.find(v => v.id === 'TODOS')?.total_leads || 0;
    assert(rootTotalVert > 0, `Tenant Raiz continua com dados de verticais preservados (${rootTotalVert} leads)`);

    // -------------------------------------------------------------------------
    // TESTE 2: GET /api/verticals/:vertical/metrics (Métricas da Vertical)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testando /api/verticals/:vertical/metrics ---');
    const vertMetricRes = await fetch(`${BASE_URL}/api/verticals/AGRO/metrics`, { headers: newTenantHeaders });
    const vertMetricData = await vertMetricRes.json();
    assert(vertMetricRes.ok && vertMetricData.success, 'Resposta de métricas da vertical com sucesso');
    assert(vertMetricData.total_leads === 0, 'total_leads da vertical é 0 para a nova empresa');
    assert(vertMetricData.kpis.total_hectares === 0, 'KPI hectares é 0');

    // -------------------------------------------------------------------------
    // TESTE 3: GET /api/locations (UFs e Municípios do Tenant)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testando /api/locations ---');
    const locRes = await fetch(`${BASE_URL}/api/locations`, { headers: newTenantHeaders });
    const locData = await locRes.json();
    assert(Array.isArray(locData.ufs) && locData.ufs.length === 0, 'Nova empresa não possui UFs registradas (array vazio)');
    assert(Object.keys(locData.citiesByUf || {}).length === 0, 'Nova empresa não possui cidades registradas (objeto vazio)');

    // -------------------------------------------------------------------------
    // TESTE 4: POST /api/gis/map-points (Pontos do Mapa)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testando /api/gis/map-points ---');
    const mapPointsRes = await fetch(`${BASE_URL}/api/gis/map-points`, {
      method: 'POST',
      headers: newTenantHeaders,
      body: JSON.stringify({})
    });
    const mapPointsData = await mapPointsRes.json();
    assert(mapPointsRes.ok && mapPointsData.success, 'Resposta de map-points com sucesso');
    assert(mapPointsData.total_points === 0, 'total_points é exatamente 0');
    assert(Array.isArray(mapPointsData.points) && mapPointsData.points.length === 0, 'points é um array vazio []');

    // Tenant Raiz deve retornar pontos normais
    const mapPointsRootRes = await fetch(`${BASE_URL}/api/gis/map-points`, {
      method: 'POST',
      headers: rootTenantHeaders,
      body: JSON.stringify({})
    });
    const mapPointsRootData = await mapPointsRootRes.json();
    assert(mapPointsRootData.total_points > 0, `Tenant Raiz retorna pontos normalmente (${mapPointsRootData.total_points} pontos)`);

    // -------------------------------------------------------------------------
    // TESTE 5: POST /api/gis/geojson (FeatureCollection para WebGL)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testando /api/gis/geojson ---');
    const geoJsonRes = await fetch(`${BASE_URL}/api/gis/geojson`, {
      method: 'POST',
      headers: newTenantHeaders,
      body: JSON.stringify({})
    });
    const geoJsonData = await geoJsonRes.json();
    assert(geoJsonData.type === 'FeatureCollection', 'Retorna FeatureCollection GeoJSON válido');
    assert(geoJsonData.total_features === 0, 'total_features é 0');
    assert(Array.isArray(geoJsonData.features) && geoJsonData.features.length === 0, 'features é um array vazio []');

    // Tenant Raiz deve retornar features normais
    const geoJsonRootRes = await fetch(`${BASE_URL}/api/gis/geojson`, {
      method: 'POST',
      headers: rootTenantHeaders,
      body: JSON.stringify({})
    });
    const geoJsonRootData = await geoJsonRootRes.json();
    assert(geoJsonRootData.total_features > 0, `Tenant Raiz retorna features GeoJSON (${geoJsonRootData.total_features} features)`);

    // -------------------------------------------------------------------------
    // TESTE 6: GET /api/competitors/list (Lista de Concorrentes)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testando /api/competitors/list ---');
    const compRes = await fetch(`${BASE_URL}/api/competitors/list`, { headers: newTenantHeaders });
    const compData = await compRes.json();
    assert(compRes.ok && compData.success, 'Resposta de concorrentes com sucesso');
    assert(compData.total_count === 0, 'total_count de concorrentes é 0 para nova empresa');
    assert(Array.isArray(compData.data) && compData.data.length === 0, 'data é array vazio []');

    // -------------------------------------------------------------------------
    // TESTE 7: GET /api/competitors/gaps (Zonas de Oportunidade / Gaps)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testando /api/competitors/gaps (Zero State de Gaps) ---');
    const gapsRes = await fetch(`${BASE_URL}/api/competitors/gaps`, { headers: newTenantHeaders });
    const gapsData = await gapsRes.json();
    assert(gapsRes.ok && gapsData.success, 'Resposta de gaps com sucesso');
    assert(gapsData.total_gaps === 0, 'total_gaps é 0 quando empresa não tem concorrentes monitorados');
    assert(Array.isArray(gapsData.data) && gapsData.data.length === 0, 'gaps data é array vazio [] (Zero State absoluto)');

    // -------------------------------------------------------------------------
    // TESTE 8: GET /api/macro/layers/municipal-potential (Camada POF)
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Testando /api/macro/layers/municipal-potential ---');
    const pofRes = await fetch(`${BASE_URL}/api/macro/layers/municipal-potential?vertical=AGRO`, { headers: newTenantHeaders });
    const pofData = await pofRes.json();
    assert(pofRes.ok && pofData.type === 'FeatureCollection', 'Camada POF retorna GeoJSON válido');
    const featuresWithLeads = (pofData.features || []).filter(f => f.properties.leads_count > 0);
    assert(featuresWithLeads.length === 0, 'Nenhum município reporta leads para a empresa de teste');

    // Limpeza do Tenant de Teste
    db.prepare('DELETE FROM tenants WHERE id = ?').run(testTenantId);
    console.log(`\n🧹 Tenant de teste ${testTenantId} removido após homologação.`);

    console.log('\n====================================================');
    console.log(`📊 TOTAL DE TESTES DA FASE 42 (ETAPA 1): ${passed + failed}`);
    console.log(`✅ APROVADOS: ${passed}`);
    console.log(`❌ FALHAS: ${failed}`);
    console.log('====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Erro fatal durante a execução dos testes:', err);
    process.exit(1);
  }
}

run();
