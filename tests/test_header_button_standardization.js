/**
 * TESTE DE VALIDAÇÃO E2E - PADRONIZAÇÃO DE ÍCONES E VETORES (HEADER & TOOLBAR)
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
console.log('🧪 TEST SUITE: PADRONIZAÇÃO DE ÍCONES (HEADER & TOOLBAR VERSUS)');
console.log('================================================================\n');

try {
  const htmlPath = path.join(rootDir, 'client', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // 1. Aba Radar Sparks
  console.log('▶ Teste 1: Padronização da Aba Radar Sparks');
  assert(htmlContent.includes('id="tabViewSparks"'), 'Botão tabViewSparks presente');
  assert(!htmlContent.includes('<span>⚡ Radar Sparks</span>'), 'Emoji ⚡ removido do texto da aba Radar Sparks');
  assert(htmlContent.includes('<span>Radar Sparks</span>'), 'Texto padronizado "Radar Sparks" ativo');
  assert(htmlContent.includes('id="tabViewSparks"') && htmlContent.includes('stroke="currentColor"'), 'SVG da aba Radar Sparks alinhado com stroke="currentColor"');

  // 2. Filtros de Entidade (Todos, Apenas PJ, Apenas PF)
  console.log('\n▶ Teste 2: Filtros de Entidade Táticos (Todos, Apenas PJ, Apenas PF)');
  assert(!htmlContent.includes('<span>🌐 Todos</span>'), 'Emoji 🌐 removido do botão Todos');
  assert(!htmlContent.includes('class="entity-badge-icon"') && !htmlContent.includes('🏢'), 'Emoji removido do botão Apenas PJ');
  assert(!htmlContent.includes('👤</span>\n                    <span>Apenas PF</span>') && !htmlContent.includes('>👤</span>'), 'Emoji 👤 removido do botão Apenas PF');
  
  assert(htmlContent.includes('id="filterEntityAllBtn"') && htmlContent.includes('<span>Todos</span>'), 'Botão Todos com texto limpo');
  assert(htmlContent.includes('id="filterEntityPjBtn"') && htmlContent.includes('<span>Apenas PJ</span>'), 'Botão Apenas PJ com texto limpo');
  assert(htmlContent.includes('id="filterEntityPfBtn"') && htmlContent.includes('<span>Apenas PF</span>'), 'Botão Apenas PF com texto limpo');

  // 3. Botão Injetar Quadrante
  console.log('\n▶ Teste 3: Botão Injetar Quadrante');
  assert(!htmlContent.includes('<span>⚡ Injetar Quadrante'), 'Emoji ⚡ removido do texto do botão Injetar Quadrante');
  assert(htmlContent.includes('<span>Injetar Quadrante (<strong id="countVisibleFarmsBtn">0</strong>)</span>'), 'Botão Injetar Quadrante padronizado');

  // 4. JS toasts
  console.log('\n▶ Teste 4: Limpeza nos Toasts do MapEngine');
  const jsPath = path.join(rootDir, 'client', 'js', 'mapEngine.js');
  const jsContent = fs.readFileSync(jsPath, 'utf8');
  assert(!jsContent.includes('🏢 Filtro ativo:'), 'Emoji 🏢 removido dos toasts do MapEngine');
  assert(!jsContent.includes('👤 Filtro ativo:'), 'Emoji 👤 removido dos toasts do MapEngine');

} catch (err) {
  console.error('❌ Erro inesperado durante os testes:', err);
}

console.log('\n================================================================');
console.log(`📊 RESULTADO FINAL DA PADRONIZAÇÃO: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
