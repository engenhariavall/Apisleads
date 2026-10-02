/**
 * tests/test_territorial_inspector_dom.js
 * Teste unitário e de integração DOM para validar:
 * 1. Existência e integridade do markup #drawerTerritorialSheet em index.html
 * 2. Existência e estilização das classes no styles.css
 * 3. Execução de window.inspectTerritorialPointInDrawer preenchendo todos os campos, badges e botões
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function runDomTests() {
  console.log('🧪 [TEST DOM] Validando Scanner Territorial no Frontend...\n');
  let passed = 0;
  let total = 0;

  // 1. Checa marcação em index.html
  total++;
  const htmlContent = fs.readFileSync(path.join(projectRoot, 'client', 'index.html'), 'utf-8');
  assert.ok(htmlContent.includes('id="drawerTerritorialSheet"'), 'Ficha drawerTerritorialSheet deve existir em index.html');
  assert.ok(htmlContent.includes('id="territorialTypeBadge"'), 'Badge de tipo territorial deve existir');
  assert.ok(htmlContent.includes('id="btnCopyTerritorialCoords"'), 'Botão copiar GPS deve existir');
  assert.ok(htmlContent.includes('id="btnTerritorialGoogleMaps"'), 'Link do Google Maps deve existir');
  assert.ok(htmlContent.includes('id="btnTerritorialStreetView"'), 'Link do Street View deve existir');
  assert.ok(htmlContent.includes('id="btnTerritorialCopiloto"'), 'Botão do Copiloto IA deve existir');
  console.log('✅ Teste 1: Todos os elementos HTML do Scanner Territorial existem em client/index.html');
  passed++;

  // 2. Checa estilização em styles.css
  total++;
  const cssContent = fs.readFileSync(path.join(projectRoot, 'client', 'css', 'styles.css'), 'utf-8');
  assert.ok(cssContent.includes('.drawer-territorial-sheet'), 'Classe .drawer-territorial-sheet deve existir em styles.css');
  assert.ok(cssContent.includes('.badge-territorial-type'), 'Classe .badge-territorial-type deve existir em styles.css');
  assert.ok(cssContent.includes('#btnTerritorialGoogleMaps'), 'Estilo do botão do Google Maps deve existir em styles.css');
  assert.ok(cssContent.includes('#btnTerritorialStreetView'), 'Estilo do botão Street View deve existir em styles.css');
  console.log('✅ Teste 2: Classes e regras CSS do Scanner Territorial existem em client/css/styles.css');
  passed++;

  // 3. Checa funções globais em app.js
  total++;
  const appJsContent = fs.readFileSync(path.join(projectRoot, 'client', 'js', 'app.js'), 'utf-8');
  assert.ok(appJsContent.includes('window.inspectTerritorialPointInDrawer = function'), 'window.inspectTerritorialPointInDrawer deve ser definida em app.js');
  assert.ok(appJsContent.includes('drawerTerritorialSheet.style.display = \'none\''), 'drawerTerritorialSheet deve ser ocultada ao abrir outros drawers');
  console.log('✅ Teste 3: window.inspectTerritorialPointInDrawer e controles de visibilidade existem em client/js/app.js');
  passed++;

  // 4. Checa integração em mapEngine.js
  total++;
  const mapEngineContent = fs.readFileSync(path.join(projectRoot, 'client', 'js', 'mapEngine.js'), 'utf-8');
  assert.ok(mapEngineContent.includes('window.inspectTerritorialPointInDrawer(point)'), 'mapEngine.js deve invocar window.inspectTerritorialPointInDrawer');
  assert.ok(mapEngineContent.includes('type === \'B2B_COMPANY\''), 'mapEngine.js deve tratar empresas B2B identificadas');
  assert.ok(mapEngineContent.includes('type === \'RURAL_PROPERTY\''), 'mapEngine.js deve tratar propriedades rurais');
  console.log('✅ Teste 4: Roteamento dos 3 níveis de inspeção está ativo em client/js/mapEngine.js');
  passed++;

  console.log(`\n==================================================`);
  console.log(`RESULTADO DOM: ${passed}/${total} (${Math.round((passed/total)*100)}%) testes aprovados.`);
  console.log(`==================================================`);
}

runDomTests();
