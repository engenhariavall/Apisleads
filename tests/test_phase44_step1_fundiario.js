/**
 * tests/test_phase44_step1_fundiario.js
 * 
 * FASES 44 E 45 - ETAPA 1: INGESTÃO DE DADOS GEORREFERENCIADOS E SCHEMA FUNDIÁRIO
 * 
 * Testes Automatizados:
 * 1. Schema do banco possui tabela `propriedades_rurais` e todos os campos obrigatórios.
 * 2. Cálculo matemático de centroide e raio a partir de anel de coordenadas GeoJSON (`calculatePolygonCentroidAndRadius`).
 * 3. Ingestão e salvamento no banco via `saveOrUpdateRuralProperty`.
 * 4. Isolamento multi-tenant: propriedades salvas por um tenant não vazam para outro tenant.
 * 5. Endpoint POST /api/fundiario/sync consome e persiste malhas fundiárias por município/região (Sorriso/MT, Rio Verde/GO).
 * 6. Endpoint GET /api/fundiario/properties retorna lista paginada e suporta filtros (status_geo, municipio, uf).
 * 7. Endpoint POST /api/fundiario/geojson retorna FeatureCollection GeoJSON válida com todas as propriedades cadastradas.
 */

import db from '../server/src/config/database.js';
import { calculatePolygonCentroidAndRadius, generateSyntheticRuralPolygon } from '../server/src/services/geoFundiarioService.js';

const BASE_URL = 'http://localhost:3000';

async function run() {
  console.log('🚀 Iniciando bateria de testes da Fase 44 - Etapa 1 (Motor Fundiário B2B & Schema GIS)...');
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
    // 1. Auditoria do Schema do Banco de Dados
    console.log('\n--- 1. Auditoria do Schema de propriedades_rurais ---');
    const cols = db.prepare("PRAGMA table_info(propriedades_rurais)").all();
    const colNames = cols.map(c => c.name);

    assert(colNames.includes('id'), 'Tabela possui coluna id');
    assert(colNames.includes('id_sigef'), 'Tabela possui coluna id_sigef');
    assert(colNames.includes('codigo_imovel'), 'Tabela possui coluna codigo_imovel');
    assert(colNames.includes('nome_imovel'), 'Tabela possui coluna nome_imovel');
    assert(colNames.includes('municipio'), 'Tabela possui coluna municipio');
    assert(colNames.includes('uf'), 'Tabela possui coluna uf');
    assert(colNames.includes('area_hectares'), 'Tabela possui coluna area_hectares');
    assert(colNames.includes('geometria_poligono'), 'Tabela possui coluna geometria_poligono');
    assert(colNames.includes('centroide_lat'), 'Tabela possui coluna centroide_lat');
    assert(colNames.includes('centroide_lng'), 'Tabela possui coluna centroide_lng');
    assert(colNames.includes('raio_abrangencia_km'), 'Tabela possui coluna raio_abrangencia_km');
    assert(colNames.includes('nome_titular'), 'Tabela possui coluna nome_titular');
    assert(colNames.includes('status_geo'), 'Tabela possui coluna status_geo');
    assert(colNames.includes('tenant_id'), 'Tabela possui coluna tenant_id');
    assert(colNames.includes('data_ultima_sync'), 'Tabela possui coluna data_ultima_sync');

    // 2. Teste da função matemática de centróide e raio
    console.log('\n--- 2. Cálculo Geodésico de Centróide e Raio ---');
    const mockPoly = generateSyntheticRuralPolygon(-12.5425, -55.7114, 5.0);
    assert(mockPoly.type === 'Polygon', 'Gerador de polígono retorna tipo Polygon');
    assert(mockPoly.coordinates[0].length >= 10, 'Polígono contém vértices adequados');

    const geomCalc = calculatePolygonCentroidAndRadius(mockPoly.coordinates);
    assert(Math.abs(geomCalc.centroide_lat - (-12.5425)) < 0.05, `Centróide Latitude calculado com precisão (${geomCalc.centroide_lat})`);
    assert(Math.abs(geomCalc.centroide_lng - (-55.7114)) < 0.05, `Centróide Longitude calculado com precisão (${geomCalc.centroide_lng})`);
    assert(geomCalc.raio_km >= 3.0 && geomCalc.raio_km <= 7.0, `Raio de abrangência calculado coerente (${geomCalc.raio_km} km)`);

    // 3. Teste de Endpoint POST /api/fundiario/sync
    console.log('\n--- 3. Ingestão e Sincronização via API ---');
    const syncRes = await fetch(`${BASE_URL}/api/fundiario/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': 'tenant-root-default'
      },
      body: JSON.stringify({ municipio: 'SORRISO', uf: 'MT' })
    });
    const syncData = await syncRes.json();
    assert(syncRes.ok && syncData.success, 'POST /api/fundiario/sync respondeu 200 OK');
    assert(syncData.total_ingested >= 2, `Total de propriedades ingeridas para Sorriso/MT: ${syncData.total_ingested}`);

    // 4. Teste de Consulta GET /api/fundiario/properties
    console.log('\n--- 4. Listagem e Filtros de Propriedades Rurais ---');
    const listRes = await fetch(`${BASE_URL}/api/fundiario/properties?municipio=SORRISO&uf=MT`, {
      headers: { 'X-Tenant-ID': 'tenant-root-default' }
    });
    const listData = await listRes.json();
    assert(listRes.ok && listData.success, 'GET /api/fundiario/properties respondeu 200 OK');
    assert(listData.total >= 2, `Propriedades retornadas na busca por Sorriso: ${listData.total}`);
    
    // Verifica se os campos calculados foram preenchidos
    const firstProp = listData.data[0];
    assert(firstProp && firstProp.centroide_lat && firstProp.centroide_lng, 'Propriedade possui centróide persistido');
    assert(firstProp.status_geo === 'CERTIFICADO' || firstProp.status_geo === 'SEM_GEO', `Status Geo válido: ${firstProp.status_geo}`);

    // Filtro por status_geo = SEM_GEO
    const semGeoRes = await fetch(`${BASE_URL}/api/fundiario/properties?status_geo=SEM_GEO`, {
      headers: { 'X-Tenant-ID': 'tenant-root-default' }
    });
    const semGeoData = await semGeoRes.json();
    assert(semGeoRes.ok && semGeoData.data.every(p => p.status_geo === 'SEM_GEO'), 'Filtro por status_geo=SEM_GEO isolou exclusivamente terras sem certificação');

    // 5. Teste de Endpoint GeoJSON para WebGL
    console.log('\n--- 5. Exportação e Renderização GeoJSON ---');
    const geojsonRes = await fetch(`${BASE_URL}/api/fundiario/geojson`, {
      headers: { 'X-Tenant-ID': 'tenant-root-default' }
    });
    const geojsonData = await geojsonRes.json();
    assert(geojsonData.type === 'FeatureCollection', 'Retorna FeatureCollection válida');
    assert(Array.isArray(geojsonData.features) && geojsonData.features.length >= 2, `Features GeoJSON presentes (${geojsonData.features.length})`);
    assert(geojsonData.features[0].geometry.type === 'Polygon', 'Geometria da feature é Polygon GeoJSON');
    assert(geojsonData.features[0].properties.nome_imovel, 'Propriedades contêm metadados cadastrais');

    // 6. Teste de Isolamento Multi-Tenant
    console.log('\n--- 6. Isolamento Rigoroso Multi-Tenant ---');
    const tenantZeroHeaders = { 'X-Tenant-ID': `tenant-isolated-${Date.now()}` };
    const tenantZeroRes = await fetch(`${BASE_URL}/api/fundiario/properties`, {
      headers: tenantZeroHeaders
    });
    const tenantZeroData = await tenantZeroRes.json();
    assert(tenantZeroData.total === 0, 'Novo tenant possui exatamente 0 propriedades rurais (Zero State blindado)');

    const tenantZeroGeoRes = await fetch(`${BASE_URL}/api/fundiario/geojson`, {
      headers: tenantZeroHeaders
    });
    const tenantZeroGeo = await tenantZeroGeoRes.json();
    assert(tenantZeroGeo.total_features === 0 && tenantZeroGeo.features.length === 0, 'GeoJSON para novo tenant é rigorosamente vazio');

  } catch (err) {
    console.error('❌ Erro inesperado na suíte da Fase 44 Etapa 1:', err);
    failed++;
  }

  console.log(`\n====================================================`);
  console.log(`📊 TOTAL DE TESTES DA FASE 44 (ETAPA 1): ${passed + failed}`);
  console.log(`✅ APROVADOS: ${passed}`);
  console.log(`❌ FALHAS: ${failed}`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
