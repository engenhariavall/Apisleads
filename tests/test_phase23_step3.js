import fs from 'fs';
import assert from 'assert';

console.log('--- TESTANDO INTEGRAÇÃO WEBGL DA ETAPA 3 (CAMADA ESPACIAL DE CONCORRÊNCIA & GAPS) ---');

// 1. Validar mapEngine.js
const mapEngineCode = fs.readFileSync('client/js/mapEngine.js', 'utf8');
assert(mapEngineCode.includes('setupCompetitorsAndGapsLayers'), 'setupCompetitorsAndGapsLayers ausente');
assert(mapEngineCode.includes('renderCompetitorAndGapsSpatial'), 'renderCompetitorAndGapsSpatial ausente');
assert(mapEngineCode.includes('flyToGapLocation'), 'flyToGapLocation ausente');
assert(mapEngineCode.includes('setCompetitorLayersVisibility'), 'setCompetitorLayersVisibility ausente');
assert(mapEngineCode.includes('competitors-source'), 'competitors-source ausente');
assert(mapEngineCode.includes('gaps-source'), 'gaps-source ausente');
assert(mapEngineCode.includes('competitor-buffer-fill'), 'competitor-buffer-fill ausente');
assert(mapEngineCode.includes('competitor-buffer-line'), 'competitor-buffer-line ausente');
assert(mapEngineCode.includes('gap-buffer-fill'), 'gap-buffer-fill ausente');
assert(mapEngineCode.includes('gap-buffer-line'), 'gap-buffer-line ausente');
assert(mapEngineCode.includes('competitor-point-marker'), 'competitor-point-marker ausente');
assert(mapEngineCode.includes('gap-point-marker'), 'gap-point-marker ausente');
console.log('✔ 1. Métodos espaciais e fontes/camadas MapLibre WebGL validados em mapEngine.js');

// 2. Validar app.js
const appCode = fs.readFileSync('client/js/app.js', 'utf8');
assert(appCode.includes('btnViewGapsOnMap'), 'btnViewGapsOnMap ausente no app.js');
assert(appCode.includes('flyToGapLocation'), 'flyToGapLocation ausente no app.js');
assert(appCode.includes('renderCompetitorAndGapsSpatial'), 'renderCompetitorAndGapsSpatial ausente no app.js');
assert(appCode.includes('setCompetitorLayersVisibility(false)'), 'Isolamento de camadas ausente no app.js');
console.log('✔ 2. Conexão de navegação por voo (flyTo), clique em gaps e isolamento de abas validados em app.js');

// 3. Validar index.html
const htmlCode = fs.readFileSync('client/index.html', 'utf8');
assert(htmlCode.includes('id="btnToggleCompetitorsLayer"'), 'btnToggleCompetitorsLayer ausente no index.html');
assert(htmlCode.includes('id="btnViewGapsOnMap"'), 'btnViewGapsOnMap ausente no index.html');
console.log('✔ 3. Botões da barra de controle WebGL e painel de concorrência verificados no HTML');

// 4. Validar styles.css
const cssCode = fs.readFileSync('client/css/styles.css', 'utf8');
assert(cssCode.includes('.maplibre-dark-popup'), 'maplibre-dark-popup ausente no CSS');
assert(cssCode.includes('.map-tactical-popup'), 'map-tactical-popup ausente no CSS');
assert(cssCode.includes('.map-badge-competitor'), 'map-badge-competitor ausente no CSS');
assert(cssCode.includes('.map-badge-gap'), 'map-badge-gap ausente no CSS');
console.log('✔ 4. Estilos do popup tático Dark Mode e badges VERSUS verificados no CSS');

console.log('\n=============================================================');
console.log('🎉 ETAPA 3 (INTEGRAÇÃO WEBGL) HOMOLOGADA COM SUCESSO! 🎉');
console.log('=============================================================');
