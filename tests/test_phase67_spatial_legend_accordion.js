/**
 * TESTE DE VALIDAÇÃO E2E - FASE 67
 * REDESIGN E ENRIQUECIMENTO DA LEGENDA ESPACIAL (ACCORDION & TAXONOMIA VISUAL)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

console.log('\n================================================================');
console.log('🧪 TEST SUITE FASE 67: REDESIGN DA LEGENDA ESPACIAL ACCORDION');
console.log('================================================================\n');

try {
  // 1. Verificação da Estrutura HTML em client/index.html
  console.log('▶ Teste 1: Estrutura HTML da Legenda Accordion (client/index.html)');
  const htmlPath = path.join(rootDir, 'client', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert(htmlContent.includes('class="legend-accordion-group"'), 'Contém grupos accordion (.legend-accordion-group)');
  assert(htmlContent.includes('data-group="pois"'), 'Contém seção dedicada de Pontos Comerciais (data-group="pois")');
  assert(htmlContent.includes('Revenda Agro & Máquinas') && htmlContent.includes('<svg width="12" height="12" viewBox="0 0 24 24"'), 'Explica visualmente o Pin do Trator com SVG vetorial moderno');
  assert(htmlContent.includes('Comércio B2B Geral') && htmlContent.includes('<rect x="4" y="2" width="16" height="20"'), 'Explica visualmente o Pin de Comércio B2B com SVG vetorial moderno');
  assert(htmlContent.includes('data-group="fundiario"'), 'Contém seção de Malha Fundiária & CAR');
  assert(htmlContent.includes('data-group="orbital"'), 'Contém seção de Sensoriamento Orbital (Satélite IA)');
  assert(htmlContent.includes('Pivô Central Irrigado'), 'Explica o Pivô Central Irrigado com vetor radial');
  assert(htmlContent.includes('Silos de Armazenagem'), 'Explica os Silos de Armazenagem com vetor metálico');
  assert(htmlContent.includes('Açudes & Represas'), 'Explica Corpos d\'Água e Açudes com vetor hídrico');
  assert(htmlContent.includes('leg-ndvi-gradient-wrap'), 'Contém régua de gradiente visual NDVI (Vigor Vegetativo)');
  assert(htmlContent.includes('data-group="cadastral"'), 'Contém seção de Vitalidade Cadastral & Clusters');

  // 2. Verificação de Estilos CSS em client/css/styles.css
  console.log('\n▶ Teste 2: Estilos CSS do Accordion e NDVI (client/css/styles.css)');
  const cssPath = path.join(rootDir, 'client', 'css', 'styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert(cssContent.includes('.legend-accordion-group'), 'Define classe CSS .legend-accordion-group');
  assert(cssContent.includes('.legend-accordion-header'), 'Define classe CSS .legend-accordion-header com cursor pointer');
  assert(cssContent.includes('.legend-accordion-arrow'), 'Define classe CSS .legend-accordion-arrow para setas rotativas');
  assert(cssContent.includes('.legend-accordion-body'), 'Define classe CSS .legend-accordion-body');
  assert(cssContent.includes('.leg-ndvi-bar'), 'Define barra com gradiente linear contínuo do NDVI');
  assert(cssContent.includes('overflow: visible !important'), 'Garante overflow: visible !important para permitir que tooltips flutuem livremente sem corte ou scrollbar');

  // 3. Verificação de Lógica Interativa em client/js/mapEngine.js
  console.log('\n▶ Teste 3: Lógica Interativa no Motor WebGL (client/js/mapEngine.js)');
  const jsPath = path.join(rootDir, 'client', 'js', 'mapEngine.js');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  assert(jsContent.includes('setupLegendAccordion();'), 'Chama setupLegendAccordion() na inicialização do mapa');
  assert(jsContent.includes('function setupLegendAccordion()'), 'Declara a função setupLegendAccordion');
  assert(jsContent.includes('versus_spatial_legend_accordion_v1'), 'Possui chave de persistência de estado no localStorage');
  assert(jsContent.includes('localStorage.setItem'), 'Salva preferências das seções abertas no localStorage');

  // 4. Integridade e Não-Regressão
  console.log('\n▶ Teste 4: Não-Regressão das Funcionalidades Existentes');
  assert(htmlContent.includes('id="btnMinimizeLegend"'), 'Botão de minimizar global permanece intacto');
  assert(htmlContent.includes('id="legendHelpTrigger"'), 'Trigger de ajuda "?" da legenda permanece intacto');
  assert(htmlContent.includes('id="legendH3Section"'), 'Seção de Densidade H3 preservada');
  assert(htmlContent.includes('id="legendCompetitorsSection"'), 'Seção de Concorrência & Gaps preservada');

} catch (err) {
  console.error('❌ Erro inesperado durante os testes:', err);
}

console.log('\n================================================================');
console.log(`📊 RESULTADO FINAL DA HOMOLOGAÇÃO FASE 67: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
