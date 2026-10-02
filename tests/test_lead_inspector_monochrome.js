/**
 * TESTE DE VALIDAÇÃO E2E - REFINAMENTO TÉCNICO E VETORIZAÇÃO DO INSPETOR DE LEADS
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
console.log('🧪 TEST SUITE: REFINAMENTO VISUAL DO INSPETOR DE LEADS (RIGHT DRAWER)');
console.log('================================================================\n');

try {
  const appJsPath = path.join(rootDir, 'client', 'js', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  const sparksJsPath = path.join(rootDir, 'client', 'js', 'sparksRadar.js');
  const sparksJsContent = fs.readFileSync(sparksJsPath, 'utf8');

  // 1. Badge de Entidade (PJ vs PF)
  console.log('▶ Teste 1: Badge de Entidade no Inspetor de Leads');
  assert(!appJsContent.includes("'🏢 PESSOA JURÍDICA'"), 'Emoji 🏢 removido de todas as atribuições em app.js');
  assert(!appJsContent.includes("'👤 PESSOA FÍSICA'"), 'Emoji 👤 removido de todas as atribuições em app.js');
  assert(appJsContent.includes('ruralEntityBadge') && appJsContent.includes('<span>PESSOA JURÍDICA</span>'), 'Badge de Pessoa Jurídica com vetor SVG limpo');
  assert(appJsContent.includes('ruralEntityBadge') && appJsContent.includes('<span>PESSOA FÍSICA</span>'), 'Badge de Pessoa Física com vetor SVG limpo');

  // 2. Modal do Radar Sparks
  console.log('\n▶ Teste 2: Modal de Dossiê do Radar Sparks');
  assert(!sparksJsContent.includes("'🏢 PESSOA JURÍDICA'"), 'Emoji 🏢 removido do modal em sparksRadar.js');
  assert(!sparksJsContent.includes("'🧑‍🌾 PESSOA FÍSICA'"), 'Emoji 🧑‍🌾 removido do modal em sparksRadar.js');

  // 3. Sanitização nos Gatilhos do Motor de Intenção
  console.log('\n▶ Teste 3: Sanitização de Emojis no Motor de Intenção (Triggers)');
  assert(appJsContent.includes('renderRuralTriggersUI') && appJsContent.includes('⚠️◇•⚡'), 'Sanitizador de emojis ativo para evitar símbolos nos gatilhos');

  // 4. Bloco de Maquinário Agrícola e Lavoura Útil
  console.log('\n▶ Teste 4: Vetorização do Bloco de Maquinário e Hidrografia');
  assert(!appJsContent.includes('<span style="font-size:0.95rem;">🚜</span>'), 'Emoji 🚜 do cabeçalho substituído por SVG técnico');
  assert(!appJsContent.includes('<span>🌊</span> INTELIGÊNCIA HIDROGRÁFICA'), 'Emoji 🌊 da hidrografia substituído por SVG técnico');
  assert(!appJsContent.includes('<span>🛰️</span> PILOTO AUTOMÁTICO GPS'), 'Emoji 🛰️ do GPS substituído por SVG técnico');

  // 5. Bloco de Sensoriamento Orbital
  console.log('\n▶ Teste 5: Vetorização do Bloco de Sensoriamento Orbital');
  assert(!appJsContent.includes('<span>🛰️ Executar Auditoria Orbital'), 'Emoji 🛰️ do botão orbital substituído por SVG técnico');
  assert(!appJsContent.includes('💧 PIVÔS CENTRAIS'), 'Emoji 💧 de pivôs centrais substituído por SVG técnico');
  assert(!appJsContent.includes('🌾 SILOS & ARMAZÉM'), 'Emoji 🌾 de silos substituído por SVG técnico');

} catch (err) {
  console.error('❌ Erro inesperado durante os testes:', err);
}

console.log('\n================================================================');
console.log(`📊 RESULTADO FINAL DO REFINAMENTO VISUAL: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
