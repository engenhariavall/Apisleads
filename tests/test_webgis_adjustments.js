import fs from 'fs';
import assert from 'assert';

console.log('--- TESTANDO AJUSTES ERGONÔMICOS DO WEBGIS ---');

const html = fs.readFileSync('client/index.html', 'utf8');
const css = fs.readFileSync('client/css/styles.css', 'utf8');
const mapJs = fs.readFileSync('client/js/mapEngine.js', 'utf8');
const appJs = fs.readFileSync('client/js/app.js', 'utf8');

// 1. Verificação do HTML
assert(html.includes('id="btnMapFullscreen"'), 'Botão btnMapFullscreen ausente no HTML');
assert(html.includes('btn-outline-cyan'), 'Classe btn-outline-cyan ausente no HTML');
assert(html.includes('id="btnMinimizeLegend"'), 'Botão btnMinimizeLegend ausente no HTML');
assert(html.includes('id="legendMinimizeIcon"'), 'Span legendMinimizeIcon ausente no HTML');
assert(html.includes('id="legendHelpTrigger"'), 'Trigger legendHelpTrigger ausente no HTML');
assert(html.includes('id="legendHelpTooltip"'), 'Tooltip legendHelpTooltip ausente no HTML');
assert(html.includes('Operação Ativa:'), 'Texto Operação Ativa ausente no Tooltip');
assert(html.includes('Em Transição:'), 'Texto Em Transição ausente no Tooltip');
assert(html.includes('Zumbi Presumida:'), 'Texto Zumbi Presumida ausente no Tooltip');
assert(html.includes('Clusters:'), 'Texto Clusters ausente no Tooltip');
console.log('✔ 1. HTML verificado com sucesso');

// 2. Verificação do CSS
assert(css.includes('#paneMap.map-fullscreen-active'), 'Regra #paneMap.map-fullscreen-active ausente no CSS');
assert(css.includes('z-index: 9999 !important'), 'z-index: 9999 ausente no paneMap fullscreen');
assert(css.includes('z-index: 10000 !important'), 'z-index: 10000 ausente para right drawer em fullscreen');
assert(css.includes('.btn-map-control.btn-outline-cyan'), 'Estilo .btn-outline-cyan ausente no CSS');
assert(css.includes('.legend-help-tooltip'), 'Estilo .legend-help-tooltip ausente no CSS');
assert(css.includes('.map-floating-legend.minimized'), 'Estilo .map-floating-legend.minimized ausente no CSS');
assert(css.includes('.btn-legend-minimize'), 'Estilo .btn-legend-minimize ausente no CSS');
console.log('✔ 2. CSS verificado com sucesso');

// 3. Verificação do mapEngine.js
assert(mapJs.includes('esri-dark-base'), 'Fonte esri-dark-base ausente no mapEngine.js');
assert(mapJs.includes('esri-dark-labels'), 'Fonte esri-dark-labels ausente no mapEngine.js');
assert(!mapJs.includes('cartocdn.com'), 'Referência a cartocdn.com não deve existir no mapEngine.js');
assert(mapJs.includes('maxzoom: 16'), 'maxzoom: 16 para esri ausente no mapEngine.js');
assert(mapJs.includes('maxzoom: 22'), 'maxzoom: 22 para overscale nas layers ausente no mapEngine.js');
assert(mapJs.includes('maxZoom: 18.5'), 'maxZoom: 18.5 ausente na instância MapLibre');
assert(mapJs.includes('function toggleFullscreen'), 'Função toggleFullscreen ausente no mapEngine.js');
assert(mapJs.includes('function exitFullscreen'), 'Função exitFullscreen ausente no mapEngine.js');
assert(mapJs.includes('btnMapFullscreen'), 'Binding do btnMapFullscreen ausente no mapEngine.js');
assert(mapJs.includes('btnMinimizeLegend'), 'Binding do btnMinimizeLegend ausente no mapEngine.js');
assert(mapJs.includes('legendHelpTrigger'), 'Binding do legendHelpTrigger ausente no mapEngine.js');
assert(mapJs.includes('Escape'), 'Listener da tecla Escape ausente no mapEngine.js');
console.log('✔ 3. mapEngine.js verificado com sucesso');

// 4. Verificação de sintaxe JS
new Function(mapJs);
console.log('✔ 4. Sintaxe do mapEngine.js válida');
new Function(appJs);
console.log('✔ 5. Sintaxe do app.js válida');

console.log('\nTODAS AS VERIFICAÇÕES DO WEBGIS PASSARAM COM SUCESSO!');
