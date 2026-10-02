/**
 * tests/test_phase44_step4_frontend_ui.js
 * 
 * Validação Funcional e Estrutural do Frontend WebGL e Dossiê Fundiário (Etapa 4)
 */

import assert from 'assert';
import fs from 'fs';

console.log('🚀 Iniciando validação do Frontend WebGL e Dossiê Fundiário (Etapa 4)...\n');

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

try {
  // 1. Validar Client index.html
  console.log('--- 1. Estrutura HTML do Cockpit (client/index.html) ---');
  const indexHtml = fs.readFileSync('client/index.html', 'utf8');

  assert(indexHtml.includes('id="btnToggleFundiarioLayer"'), 'Botão btnToggleFundiarioLayer deve existir no mapa');
  pass('Botão "🌾 Malha Fundiária" presente na barra de ferramentas do mapa');

  assert(indexHtml.includes('id="legendFundiarioSection"'), 'Seção de legenda fundiária deve existir');
  assert(indexHtml.includes('Sem Geo / Gap Fundiário'), 'Legenda de Sem Geo / Gap Fundiário deve existir');
  assert(indexHtml.includes('Certificado / Regular'), 'Legenda de Certificado / Regular deve existir');
  pass('Legenda espacial atualizada com identificação de Gap Fundiário (vermelho) e Regular (azul)');

  assert(indexHtml.includes('id="drawerRuralPropertySheet"'), 'Container drawerRuralPropertySheet deve existir no Right Drawer');
  assert(indexHtml.includes('id="ruralIntentBadge"'), 'Badge de intenção rural deve existir');
  assert(indexHtml.includes('id="ruralGeoStatusBadge"'), 'Badge de status geo deve existir');
  assert(indexHtml.includes('id="ruralNomeImovel"'), 'Título do imóvel deve existir');
  assert(indexHtml.includes('id="ruralTriggersList"'), 'Lista de gatilhos analíticos deve existir');
  assert(indexHtml.includes('id="ruralNomeTitular"'), 'Nome do titular deve existir');
  assert(indexHtml.includes('id="ruralWhatsappText"'), 'Campo de WhatsApp validado deve existir');
  assert(indexHtml.includes('id="ruralLinkedinLink"'), 'Link do LinkedIn deve existir');
  assert(indexHtml.includes('id="ruralCentroideCoords"'), 'Coordenadas do centróide devem existir');
  assert(indexHtml.includes('id="btnExportRuralGeofence"'), 'Botão de exportar geofencing deve existir');
  pass('Dossiê Tático da Fazenda no Right Drawer completamente modelado com todos os componentes');

  // 2. Validar Map Engine (client/js/mapEngine.js)
  console.log('\n--- 2. Motor WebGL de Polígonos (client/js/mapEngine.js) ---');
  const mapEngineCode = fs.readFileSync('client/js/mapEngine.js', 'utf8');

  assert(mapEngineCode.includes("id: 'fundiario-polygon-fill'"), 'Camada fundiario-polygon-fill deve estar declarada');
  assert(mapEngineCode.includes("id: 'fundiario-polygon-stroke'"), 'Camada fundiario-polygon-stroke deve estar declarada');
  assert(mapEngineCode.includes("id: 'fundiario-polygon-label'"), 'Camada fundiario-polygon-label deve estar declarada');
  pass('Camadas de preenchimento, contorno tático e rótulos do MapLibre configuradas');

  // Validação da regra estrita de cores:
  // SEM_GEO: Vermelho translúcido rgba(239, 68, 68, 0.42) e borda #EF4444
  // REGULAR: Azul translúcido rgba(56, 189, 248, 0.22) e borda #38BDF8
  assert(mapEngineCode.includes('rgba(239, 68, 68, 0.42)'), 'Cor de preenchimento SEM_GEO deve ser vermelho translúcido');
  assert(mapEngineCode.includes('rgba(56, 189, 248, 0.22)'), 'Cor de preenchimento regular deve ser azul translúcido');
  assert(mapEngineCode.includes('#EF4444'), 'Borda SEM_GEO deve ser vermelha sólida');
  assert(mapEngineCode.includes('#38BDF8'), 'Borda regular deve ser azul sólida');
  pass('Coloração Tática baseada em Gap Fundiário validada conforme a diretriz');

  assert(mapEngineCode.includes("map.on('click', 'fundiario-polygon-fill'"), 'Evento onClick no polígono deve estar registrado');
  assert(mapEngineCode.includes('window.inspectRuralPropertyInDrawer(p)'), 'Clique no polígono deve acionar inspectRuralPropertyInDrawer');
  pass('Evento de clique no polígono conecta o mapa diretamente ao Right Drawer');

  assert(mapEngineCode.includes('/api/fundiario/geojson'), 'Deve consumir o endpoint /api/fundiario/geojson');
  assert(mapEngineCode.includes('setupFundiarioLayers'), 'setupFundiarioLayers deve existir e estar exportado');
  assert(mapEngineCode.includes('fetchAndRenderFundiarioGeoJson'), 'fetchAndRenderFundiarioGeoJson deve existir e estar exportado');
  pass('Consumo dinâmico da FeatureCollection e métodos de controle expostos na API MapEngine');

  // 3. Validar Controlador do Frontend (client/js/app.js)
  console.log('\n--- 3. Lógica do Dossiê e Geofencing (client/js/app.js) ---');
  const appJsCode = fs.readFileSync('client/js/app.js', 'utf8');

  assert(appJsCode.includes('window.inspectRuralPropertyInDrawer = function'), 'Função inspectRuralPropertyInDrawer deve estar implementada globalmente');
  assert(appJsCode.includes('drawerRuralPropertySheet'), 'Deve controlar o display de drawerRuralPropertySheet');
  assert(appJsCode.includes('/api/fundiario/export/geofencing'), 'Botão do drawer deve consumir /api/fundiario/export/geofencing');
  pass('Função inspectRuralPropertyInDrawer e gatilho de exportação de Geofencing devidamente implementados');

  // 4. Validar Estilização CSS (client/css/styles.css)
  console.log('\n--- 4. Estilos e Animações (client/css/styles.css) ---');
  const cssCode = fs.readFileSync('client/css/styles.css', 'utf8');

  assert(cssCode.includes('.drawer-rural-sheet'), 'Classe .drawer-rural-sheet deve estar definida');
  assert(cssCode.includes('@keyframes fadeInRuralSheet'), 'Animação fadeInRuralSheet deve estar definida');
  pass('Design System VERSUS preservado com animação suave e tipografia tática');

  // 5. Teste de Integração HTTP com a API em tempo real
  console.log('\n--- 5. Integridade do Endpoint GeoJSON com o Servidor Local ---');
  const resGeoJson = await fetch('http://localhost:3000/api/fundiario/geojson');
  assert.strictEqual(resGeoJson.status, 200, `Status esperado 200, recebido ${resGeoJson.status}`);
  const geojson = await resGeoJson.json();
  assert.strictEqual(geojson.type, 'FeatureCollection');
  assert(geojson.features && geojson.features.length >= 2, 'Deve conter os imóveis sincronizados');
  
  const semGeoFeature = geojson.features.find(f => f.properties.status_geo === 'SEM_GEO');
  assert(semGeoFeature, 'Imóvel com SEM_GEO deve estar presente na FeatureCollection');
  assert.strictEqual(semGeoFeature.properties.intent_classification, 'HOT');
  assert.strictEqual(semGeoFeature.properties.intent_score, 70);
  assert(semGeoFeature.properties.whatsapp_validado, 'WhatsApp validado deve vir nas properties');
  pass(`Imóvel "${semGeoFeature.properties.nome_imovel}" verificado no endpoint: SEM_GEO, HOT (70 pts), WhatsApp: ${semGeoFeature.properties.whatsapp_validado}`);

} catch (err) {
  fail('Erro na validação do Frontend WebGL e Dossiê Fundiário', err);
}

console.log('\n====================================================');
console.log(`📊 TOTAL DE TESTES DA FASE 44 (ETAPA 4): ${testPassed + testFailed}`);
console.log(`✅ APROVADOS: ${testPassed}`);
console.log(`❌ FALHAS: ${testFailed}`);
console.log('====================================================\n');

if (testFailed > 0) {
  process.exit(1);
}
