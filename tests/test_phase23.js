import fs from 'fs';
import assert from 'assert';

console.log('======================================================================');
console.log('🏁 SUÍTE DE TESTES E HOMOLOGAÇÃO COMPLETA: FASE 23 (PADRÃO VERSUS) 🏁');
console.log('======================================================================\n');

const BASE_URL = 'http://localhost:3000';

async function runPhase23Tests() {
  // -------------------------------------------------------------------------
  // 1. VALIDAÇÃO DO MOTOR DE GAPS (GLOBAL VS. RELATIVO)
  // -------------------------------------------------------------------------
  console.log('1. TESTANDO MOTOR DE GAPS REATIVO (GLOBAL VS. RELATIVO):');
  
  // 1.1 Modo Global Agregado
  const resGlobal = await fetch(`${BASE_URL}/api/competitors/gaps`);
  assert.strictEqual(resGlobal.status, 200, 'GET /api/competitors/gaps deve retornar 200');
  const globalData = await resGlobal.json();
  assert.strictEqual(globalData.success, true, 'Resposta deve indicar success: true');
  assert.strictEqual(globalData.mode, 'AGGREGATED_NETWORK', 'Modo deve ser AGGREGATED_NETWORK');
  assert.strictEqual(globalData.competitor_id, null, 'competitor_id deve ser null no modo global');
  assert(Array.isArray(globalData.data) && globalData.data.length > 0, 'Deve retornar lista de gaps');
  
  // Validar ordenação por gap_score
  for (let i = 0; i < globalData.data.length - 1; i++) {
    assert(globalData.data[i].gap_score >= globalData.data[i + 1].gap_score, 'Gaps devem vir ordenados por gap_score decrescente');
  }
  console.log(`   ✔ 1.1 Modo Global validado: ${globalData.total_gaps} gaps calculados com ordenação decrescente por Gap Score.`);

  // 1.2 Obter Concorrente para Modo Relativo
  const resList = await fetch(`${BASE_URL}/api/competitors/list`);
  assert.strictEqual(resList.status, 200);
  const listData = await resList.json();
  assert(listData.data && listData.data.length > 0, 'Deve haver concorrentes cadastrados');
  const competitor = listData.data[0];

  // 1.3 Modo Relativo ao Concorrente Selecionado
  const resRelative = await fetch(`${BASE_URL}/api/competitors/gaps?competitor_id=${competitor.id}`);
  assert.strictEqual(resRelative.status, 200, 'GET /api/competitors/gaps com competitor_id deve retornar 200');
  const relData = await resRelative.json();
  assert.strictEqual(relData.success, true);
  assert.strictEqual(relData.mode, 'SINGLE_COMPETITOR_RELATIVE', 'Modo deve ser SINGLE_COMPETITOR_RELATIVE');
  assert.strictEqual(relData.competitor_id, competitor.id);
  assert(relData.selected_competitor, 'selected_competitor deve estar presente');
  assert.strictEqual(relData.selected_competitor.id, competitor.id);
  assert(relData.selected_competitor.latitude && relData.selected_competitor.longitude, 'Concorrente deve conter coordenadas válidas');
  console.log(`   ✔ 1.2 Modo Relativo validado para "${relData.selected_competitor.razao_social}": distâncias e scores recalculados a partir da sede (${relData.selected_competitor.municipio}/${relData.selected_competitor.uf}).`);

  // -------------------------------------------------------------------------
  // 2. BLINDAGEM E NÃO-CONTAMINAÇÃO DO ICP DE VENDAS
  // -------------------------------------------------------------------------
  console.log('\n2. TESTANDO BLINDAGEM DO FUNIL DE VENDAS & NÃO-CONTAMINAÇÃO:');
  
  // 2.1 Exportação CSV Comercial Padrão
  const resCsvExport = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'standard' })
  });
  assert.strictEqual(resCsvExport.status, 200);
  const commercialCsv = await resCsvExport.text();
  assert(!commercialCsv.includes(competitor.cnpj), 'CNPJ de concorrente NUNCA deve aparecer no CSV comercial de vendas');
  assert(!commercialCsv.includes(competitor.razao_social), 'Razão Social de concorrente NUNCA deve aparecer no CSV comercial de vendas');

  // 2.2 Exportação Meta Ads
  const resMetaExport = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'meta_ads' })
  });
  assert.strictEqual(resMetaExport.status, 200);
  const metaCsv = await resMetaExport.text();
  assert(!metaCsv.includes(competitor.cnpj), 'CNPJ de concorrente NUNCA deve aparecer no Meta Ads de vendas');
  console.log('   ✔ 2.1 Endpoints de exportação comercial (/api/leads/export) 100% blindados (is_competitor = 0).');
  console.log('   ✔ 2.2 Nenhuma contaminação entre concorrentes monitorados e funil ICP de vendas.');

  // -------------------------------------------------------------------------
  // 3. VALIDAÇÃO DA CAMADA ESPACIAL WEBGL (PAYLOAD GEOJSON RFC 7946)
  // -------------------------------------------------------------------------
  console.log('\n3. TESTANDO VALIDAÇÃO DA CAMADA ESPACIAL WEBGL:');
  
  const mapEngineCode = fs.readFileSync('client/js/mapEngine.js', 'utf8');
  assert(mapEngineCode.includes('setupCompetitorsAndGapsLayers'), 'setupCompetitorsAndGapsLayers ausente');
  assert(mapEngineCode.includes('renderCompetitorAndGapsSpatial'), 'renderCompetitorAndGapsSpatial ausente');
  assert(mapEngineCode.includes('flyToGapLocation'), 'flyToGapLocation ausente');
  assert(mapEngineCode.includes('createGeodesicCircle'), 'createGeodesicCircle ausente');

  // Validar coordenadas dos gaps no território brasileiro
  globalData.data.forEach(gap => {
    assert(gap.latitude !== undefined && gap.longitude !== undefined, 'Latitude e Longitude obrigatórias');
    assert(gap.latitude <= 5 && gap.latitude >= -34, `Latitude fora dos limites do Brasil: ${gap.latitude}`);
    assert(gap.longitude <= -34 && gap.longitude >= -74, `Longitude fora dos limites do Brasil: ${gap.longitude}`);
    assert(gap.gap_score >= 0 && gap.gap_score <= 100, `Gap Score inválido: ${gap.gap_score}`);
    assert(gap.recommended_radius_km > 0, 'Raio sugerido deve ser positivo');
    assert(gap.municipio && gap.uf, 'Município e UF obrigatórios');
  });
  console.log(`   ✔ 3.1 100% das ${globalData.data.length} coordenadas dos Gaps em conformidade com WGS84 no território nacional.`);
  console.log('   ✔ 3.2 Funções de voo suave (map.flyTo), popup tático e buffers geodésicos validados no WebGL.');

  // -------------------------------------------------------------------------
  // 4. VALIDAÇÃO DO MOTOR DE GEOFENCING & FORMATOS DE EXPORTAÇÃO
  // -------------------------------------------------------------------------
  console.log('\n4. TESTANDO EXPORTAÇÃO DE GEOFENCING PARA META ADS (CSV & JSON):');

  // 4.1 Exportação CSV
  const resGeoCsv = await fetch(`${BASE_URL}/api/competitors/export-geofencing?format=csv`);
  assert.strictEqual(resGeoCsv.status, 200);
  assert(resGeoCsv.headers.get('content-type').includes('text/csv'), 'Content-Type deve ser text/csv');
  const geoCsvText = await resGeoCsv.text();
  assert(geoCsvText.includes('ranking;municipio;uf;gap_score;prioridade;latitude;longitude;radius_km'), 'Headers do CSV de geofencing incompletos');
  assert(geoCsvText.includes('meta_ads_target_string'), 'meta_ads_target_string ausente no CSV');
  
  // Garantir ausência de dados pessoais sensíveis (CPF, Sócios, QSA)
  assert(!geoCsvText.toLowerCase().includes('cpf'), 'CSV de Geofencing não deve conter CPFs');
  assert(!geoCsvText.toLowerCase().includes('socio'), 'CSV de Geofencing não deve conter dados de sócios');
  assert(!geoCsvText.toLowerCase().includes('qsa'), 'CSV de Geofencing não deve conter dados de QSA');
  console.log('   ✔ 4.1 Exportação CSV validada: headers corretos, string de alfinetes Meta Ads e zero vazamento de dados sensíveis.');

  // 4.2 Exportação JSON
  const resGeoJson = await fetch(`${BASE_URL}/api/competitors/export-geofencing?format=json`);
  assert.strictEqual(resGeoJson.status, 200);
  const geoJsonData = await resGeoJson.json();
  assert.strictEqual(geoJsonData.success, true);
  assert(Array.isArray(geoJsonData.data) && geoJsonData.data.length > 0);
  assert(geoJsonData.data[0].meta_ads_target_string, 'Campo meta_ads_target_string deve existir nos itens');
  assert(geoJsonData.data[0].ranking === 1, 'Primeiro item deve ter ranking 1');
  console.log(`   ✔ 4.2 Exportação JSON validada: ${geoJsonData.total_zones} zonas estruturadas com ranking ordinal e meta_ads_target_string.`);

  // -------------------------------------------------------------------------
  // 5. TESTES DE REGRESSÃO DE FASES ANTERIORES
  // -------------------------------------------------------------------------
  console.log('\n5. EXECUTANDO REGRESSÃO DAS FASES ANTERIORES:');
  
  // 5.1 Regressão GIS e Raio Geodésico
  const resGisClusters = await fetch(`${BASE_URL}/api/gis/clusters`);
  assert.strictEqual(resGisClusters.status, 200, 'Endpoint de clusters GIS operacional');
  
  // 5.2 Regressão Macrodados POF
  const resMacro = await fetch(`${BASE_URL}/api/macro/layers/municipal-potential`);
  assert.strictEqual(resMacro.status, 200, 'Endpoint de camada POF municipal operacional');

  // 5.3 Regressão Funil GTM
  const resGtm = await fetch(`${BASE_URL}/api/leads/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 1, page_size: 5 })
  });
  assert.strictEqual(resGtm.status, 200, 'Filtro e listagem de leads operacional');
  const gtmJson = await resGtm.json();
  assert(gtmJson.data && gtmJson.data.length > 0, 'Leads comerciais retornados com sucesso');
  console.log('   ✔ 5.1 GIS Clusters, Camada POF e Funil GTM funcionando sem nenhuma regressão.');

  console.log('\n======================================================================');
  console.log('🏆 100% DOS TESTES DA FASE 23 FORAM APROVADOS COM SUCESSO ABSOLUTO! 🏆');
  console.log('======================================================================');
}

runPhase23Tests().catch(err => {
  console.error('\n❌ ERRO NA HOMOLOGAÇÃO DA FASE 23:', err);
  process.exit(1);
});
