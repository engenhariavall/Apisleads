import fs from 'fs';
import assert from 'assert';

console.log('🛰️ === TESTE DE HOMOLOGAÇÃO: ALTERNÂNCIA DE MAPA (VETOR VS. SATÉLITE REAL) ===\n');

// 1. Leitura dos arquivos envolvidos
const html = fs.readFileSync('client/index.html', 'utf8');
const css = fs.readFileSync('client/css/styles.css', 'utf8');
const js = fs.readFileSync('client/js/mapEngine.js', 'utf8');

// -------------------------------------------------------------
// SEÇÃO 1: Validação do HTML da Barra Superior do Mapa
// -------------------------------------------------------------
console.log('📌 1. Verificando Botão na Barra Superior (client/index.html)...');

assert(html.includes('id="btnToggleMapMode"'), 'Botão #btnToggleMapMode ausente no index.html');
assert(html.includes('btn-map-mode-toggle'), 'Classe btn-map-mode-toggle ausente no index.html');
assert(html.includes('Satélite') && html.includes('Vetor'), 'Texto Satélite e Vetor ausente no botão');
assert(html.includes('id="btnToggleMapModeIcon"'), 'Span de ícone btnToggleMapModeIcon ausente no index.html');
assert(html.includes('id="btnToggleMapModeLabel"'), 'Span de label btnToggleMapModeLabel ausente no index.html');
assert(html.includes('id="btnToggleMapMode" data-mode="vector" data-tooltip='), 'Atributos data-mode e data-tooltip ausentes em btnToggleMapMode');

// Valida que o botão está localizado ao lado dos seletores de malha/fontes
const fonteIdx = html.indexOf('id="mapFonteTogglesContainer"');
const btnModeIdx = html.indexOf('id="btnToggleMapMode"');
assert(fonteIdx !== -1, 'mapFonteTogglesContainer ausente');
assert(btnModeIdx !== -1, 'btnToggleMapMode ausente');
assert(btnModeIdx > fonteIdx && btnModeIdx - fonteIdx < 1600, 'Botão de Satélite deve estar imediatamente adjacente aos seletores de fontes/malha');

console.log('  ✅ [PASS] Botão [ 🛰️ Satélite / 🗺️ Vetor ] presente e posicionado perfeitamente na toolbar.');

// -------------------------------------------------------------
// SEÇÃO 2: Validação das Regras CSS
// -------------------------------------------------------------
console.log('\n🎨 2. Verificando Regras CSS (client/css/styles.css)...');

assert(css.includes('.btn-map-control.btn-map-mode-toggle'), 'Regra .btn-map-control.btn-map-mode-toggle ausente no CSS');
assert(css.includes('.btn-map-control.btn-map-mode-toggle:hover'), 'Regra :hover para btn-map-mode-toggle ausente no CSS');
assert(css.includes('.btn-map-control.btn-map-mode-toggle.active'), 'Regra .active para btn-map-mode-toggle ausente no CSS');
assert(css.includes('.btn-map-control.btn-map-mode-toggle .map-mode-icon'), 'Regra para ícone .map-mode-icon ausente no CSS');

// Verificação de balanceamento de chaves no CSS para garantir que nenhuma regra foi corrompida
let openBraceCount = 0;
for (let i = 0; i < css.length; i++) {
  if (css[i] === '{') openBraceCount++;
  if (css[i] === '}') openBraceCount--;
}
assert.strictEqual(openBraceCount, 0, 'O arquivo styles.css deve ter todas as chaves perfeitamente balanceadas (sem blocos abertos)');

console.log('  ✅ [PASS] Estilização visual e integridade estrutural do CSS validadas com sucesso.');

// -------------------------------------------------------------
// SEÇÃO 3: Validação do Motor WebGL (client/js/mapEngine.js)
// -------------------------------------------------------------
console.log('\n🗺️ 3. Verificando Configuração de Camada Raster de Satélite no mapEngine.js...');

// Fontes de satélite
assert(js.includes('esri-satellite-base'), 'Fonte raster esri-satellite-base ausente no mapEngine.js');
assert(js.includes('esri-satellite-labels'), 'Fonte raster esri-satellite-labels ausente no mapEngine.js');
assert(js.includes('World_Imagery/MapServer'), 'URL do serviço Esri World Imagery ausente no mapEngine.js');
assert(js.includes('Reference/World_Boundaries_and_Places/MapServer'), 'URL de referência e limites ausente no mapEngine.js');

// Camadas raster
assert(js.includes('esri-satellite-base-layer'), 'Camada esri-satellite-base-layer ausente no mapEngine.js');
assert(js.includes('esri-satellite-labels-layer'), 'Camada esri-satellite-labels-layer ausente no mapEngine.js');

// Funções de alternância dinâmica
assert(js.includes('function ensureSatelliteSourcesAndLayers'), 'Função ensureSatelliteSourcesAndLayers ausente no mapEngine.js');
assert(js.includes('function applyBaseMapVisibility'), 'Função applyBaseMapVisibility ausente no mapEngine.js');
assert(js.includes('function toggleBaseMapMode'), 'Função toggleBaseMapMode ausente no mapEngine.js');
assert(js.includes('function setBaseMapMode'), 'Função setBaseMapMode ausente no mapEngine.js');
assert(js.includes('function updateMapModeButtonUI'), 'Função updateMapModeButtonUI ausente no mapEngine.js');

// Evento de clique da toolbar
assert(js.includes('btnToggleMapMode'), 'Binding do evento de clique em btnToggleMapMode ausente');

// Exportações da API MapEngine
assert(js.includes('toggleBaseMapMode,'), 'Exportação toggleBaseMapMode ausente');
assert(js.includes('setBaseMapMode,'), 'Exportação setBaseMapMode ausente');
assert(js.includes('getBaseMapMode:'), 'Exportação getBaseMapMode ausente');
assert(js.includes('isSatelliteMode:'), 'Exportação isSatelliteMode ausente');
assert(js.includes('ensureSatelliteSourcesAndLayers,'), 'Exportação ensureSatelliteSourcesAndLayers ausente');

console.log('  ✅ [PASS] Fontes, camadas e métodos de controle do motor WebGL verificados.');

// -------------------------------------------------------------
// SEÇÃO 4: Simulação Funcional com Mock MapLibre GL
// -------------------------------------------------------------
console.log('\n⚙️ 4. Simulação Funcional de Alternância com Mock MapLibre...');

// Cria ambiente DOM e Mock MapLibre para validação dinâmica
const layerVisibilityStore = {
  'esri-dark-base-layer': 'visible',
  'esri-dark-labels-layer': 'visible',
  'esri-satellite-base-layer': 'none',
  'esri-satellite-labels-layer': 'none'
};

const mockSources = {
  'esri-dark-base': {},
  'esri-dark-labels': {},
  'esri-satellite-base': {},
  'esri-satellite-labels': {}
};

const mockLayers = {
  'esri-dark-base-layer': { id: 'esri-dark-base-layer', type: 'raster' },
  'esri-dark-labels-layer': { id: 'esri-dark-labels-layer', type: 'raster' },
  'esri-satellite-base-layer': { id: 'esri-satellite-base-layer', type: 'raster' },
  'esri-satellite-labels-layer': { id: 'esri-satellite-labels-layer', type: 'raster' },
  'fundiario-polygon-fill': { id: 'fundiario-polygon-fill', type: 'fill' },
  'fundiario-polygon-stroke': { id: 'fundiario-polygon-stroke', type: 'line' },
  'fundiario-polygon-label': { id: 'fundiario-polygon-label', type: 'symbol' }
};

const mockMap = {
  isStyleLoaded: () => true,
  loaded: () => true,
  getSource: (id) => mockSources[id],
  addSource: (id, cfg) => { mockSources[id] = cfg; },
  getLayer: (id) => mockLayers[id],
  addLayer: (cfg, beforeId) => { mockLayers[cfg.id] = cfg; },
  setLayoutProperty: (layerId, prop, val) => {
    if (prop === 'visibility') {
      layerVisibilityStore[layerId] = val;
    }
  }
};

// Simulação dos nós DOM
let buttonClassList = new Set();
let buttonDataset = { mode: 'vector' };
let buttonIconText = '🛰️';
let buttonLabelText = 'Satélite / 🗺️ Vetor';

const mockDoc = {
  getElementById: (id) => {
    if (id === 'btnToggleMapMode' || id === 'btnToggleSatellite') {
      return {
        classList: {
          toggle: (cls, force) => {
            if (force) buttonClassList.add(cls);
            else buttonClassList.delete(cls);
          },
          add: (cls) => buttonClassList.add(cls),
          remove: (cls) => buttonClassList.delete(cls),
          contains: (cls) => buttonClassList.has(cls)
        },
        setAttribute: (attr, val) => {
          if (attr === 'data-mode') buttonDataset.mode = val;
        }
      };
    }
    if (id === 'btnToggleMapModeIcon') {
      return {
        set textContent(val) { buttonIconText = val; },
        get textContent() { return buttonIconText; },
        set innerHTML(val) { buttonIconText = val; },
        get innerHTML() { return buttonIconText; }
      };
    }
    if (id === 'btnToggleMapModeLabel') {
      return {
        set textContent(val) { buttonLabelText = val; },
        get textContent() { return buttonLabelText; }
      };
    }
    return null;
  }
};

// Mock de ambiente global e instanciação
global.window = {
  document: mockDoc,
  addEventListener: () => {}
};
global.document = mockDoc;
global.maplibregl = {
  Map: function() { return mockMap; },
  AttributionControl: function() {},
  NavigationControl: function() {},
  Popup: function() {}
};

// Executa código do mapEngine
new Function(js)();

assert(window.MapEngine, 'window.MapEngine deve estar instanciado');
assert(typeof window.MapEngine.toggleBaseMapMode === 'function', 'toggleBaseMapMode deve ser função');
assert(typeof window.MapEngine.setBaseMapMode === 'function', 'setBaseMapMode deve ser função');
assert.strictEqual(window.MapEngine.getBaseMapMode(), 'vector', 'Modo inicial deve ser vector');
assert.strictEqual(window.MapEngine.isSatelliteMode(), false, 'isSatelliteMode deve ser false inicialmente');

// Teste de alternância para satélite
console.log('  🔄 Alternando para Satélite Real...');
window.MapEngine.setBaseMapMode('satellite');

assert.strictEqual(window.MapEngine.getBaseMapMode(), 'satellite', 'Modo deve ser satellite');
assert.strictEqual(window.MapEngine.isSatelliteMode(), true, 'isSatelliteMode deve ser true');
assert.strictEqual(buttonDataset.mode, 'satellite', 'data-mode no botão deve ser satellite');
assert.strictEqual(buttonClassList.has('active'), true, 'Botão deve receber classe .active ao ativar satélite');
assert(buttonIconText.includes('<svg'), 'Ícone do botão deve alternar para SVG de Mapa/Vetor');

// Teste de alternância via toggle de volta para vetor
console.log('  🔄 Alternando de volta para Vetor via toggleBaseMapMode...');
window.MapEngine.toggleBaseMapMode();

assert.strictEqual(window.MapEngine.getBaseMapMode(), 'vector', 'Modo deve retornar para vector');
assert.strictEqual(window.MapEngine.isSatelliteMode(), false, 'isSatelliteMode deve retornar para false');
assert.strictEqual(buttonDataset.mode, 'vector', 'data-mode deve retornar para vector');
assert.strictEqual(buttonClassList.has('active'), false, 'Botão não deve ter classe .active no modo vetor');
assert(buttonIconText.includes('<svg'), 'Ícone do botão deve retornar para SVG de Satélite');

console.log('  ✅ [PASS] Comportamento dinâmico e transição de ícones vetoriais SVG executados com precisão.');

console.log('\n======================================================');
console.log('🎉 TODOS OS TESTES DO BOTÃO DE SATÉLITE PASSARAM COM SUCESSO!');
console.log('======================================================');
