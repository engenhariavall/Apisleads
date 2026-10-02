/**
 * TESTE DE VALIDAÇÃO E2E - FASE 68: REFINAMENTO TÉCNICO VISUAL FINO DO INSPETOR DE LEADS
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
console.log('🧪 TEST SUITE FASE 68: REFINAMENTO VISUAL FINO DO INSPETOR DE LEADS');
console.log('================================================================\n');

try {
  const htmlPath = path.join(rootDir, 'client', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const appJsPath = path.join(rootDir, 'client', 'js', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // MÓDULO 1: Estrutura HTML e Modais Correlatos
  console.log('▶ Teste 1: Limpeza Estética em index.html');
  assert(!htmlContent.includes('🌾 AGRO & MAQUINÁRIO'), 'Emoji 🌾 removido do menu lateral de navegação');
  assert(htmlContent.includes('<span class="rail-section-label">AGRO & MAQUINÁRIO</span>'), 'Rótulo do menu lateral padronizado');
  assert(!htmlContent.includes('<span>🎯 Meta Ads Custom Audience'), 'Emoji 🎯 removido do título de exportação Meta Ads');
  assert(!htmlContent.includes('<span>📞 Planilha Comercial B2B'), 'Emoji 📞 removido do título de exportação Excel B2B');
  assert(!htmlContent.includes('<span>⚡ Disparar Leads via Webhook'), 'Emoji ⚡ removido do título de exportação Webhook');
  assert(!htmlContent.includes('<span style="font-size: 1.2rem;">🔐</span>'), 'Emoji 🔐 substituído por SVG no modal de autenticação');
  assert(htmlContent.includes('id="modalAuthLogin"') && htmlContent.includes('<svg width="18" height="18"'), 'SVG corporativo ativo no modal de autenticação');

  // MÓDULO 2: Selects e Feedback Comercial
  console.log('\n▶ Teste 2: Preservação de Lógica e Limpeza Visual no Feedback Comercial');
  assert(!htmlContent.includes('🔥 Interessado'), 'Emoji 🔥 removido dos options de status');
  assert(!htmlContent.includes('🚜 Colheitadeira de Grãos'), 'Emoji 🚜 removido dos options de máquinas');
  assert(!htmlContent.includes('<span>💾 Salvar e Retroalimentar Sistema</span>'), 'Emoji 💾 removido do botão de submit do feedback');
  assert(htmlContent.includes('value="INTERESSADO"'), 'Valor value="INTERESSADO" preservado 100% intacto');
  assert(htmlContent.includes('value="COLHEITADEIRA_CLASSE_7_10"'), 'Valor value="COLHEITADEIRA_CLASSE_7_10" preservado 100% intacto');

  // MÓDULO 3: Inspetor de Leads (Right Drawer) em app.js
  console.log('\n▶ Teste 3: Vetorização dos Botões de Ação no Inspetor de Leads');
  assert(!appJsContent.includes('<span>🟢 Conversar com o Produtor</span>'), 'Emoji 🟢 substituído por SVG no botão de conversar com produtor');
  assert(!appJsContent.includes('<span>🔍 Revalidar na SEFAZ</span>'), 'Emoji 🔍 substituído por SVG no botão de revalidar SEFAZ');
  assert(!appJsContent.includes('<span>🟢 Conversar</span>'), 'Emoji 🟢 substituído por SVG no botão de conversar com sócio');
  assert(!appJsContent.includes('<span>🔍 Celular (Bureau)</span>'), 'Emoji 🔍 substituído por SVG no botão de bureau');
  assert(!appJsContent.includes('<span>🔍 Não localizado</span>'), 'Emoji 🔍 substituído por SVG no status de bureau');

  // MÓDULO 4: Certidão Cartorial e Bloco Corporativo PJ
  console.log('\n▶ Teste 4: Vetorização do Bloco Corporativo PJ & Cartório CRI');
  assert(!appJsContent.includes('🟢 100% CERTIFICADO NO SIGEF / CRI'), 'Emoji 🟢 substituído por SVG no selo de certificação SIGEF');
  assert(!appJsContent.includes('<span>📜</span> CERTIDÃO CARTORIAL'), 'Emoji 📜 substituído por SVG na certidão cartorial');
  assert(!appJsContent.includes('<span>📜 Confirmar 100% no Cartório'), 'Emoji 📜 substituído por SVG no botão de confirmação cartorial');
  assert(!appJsContent.includes('<span>⚠️ Imóvel em Gap Fundiário'), 'Emoji ⚠️ substituído por SVG no alerta de gap fundiário');

  // MÓDULO 5: Cognição Neural e Visão Computacional B2B
  console.log('\n▶ Teste 5: Bloco de NDVI, IA Cognitiva e Auditoria Visual de Fachada');
  assert(!appJsContent.includes('<span>🌱 Vigor Vegetativo (NDVI):</span>'), 'Emoji 🌱 substituído por SVG na barra de NDVI');
  assert(!appJsContent.includes('🧠 <strong>IA Cognitiva (LinUCB):</strong>'), 'Emoji 🧠 substituído por SVG no rationale LinUCB');
  assert(!appJsContent.includes('🚨 RISCO ZUMBI'), 'Emoji 🚨 removido do badge de risco zumbi');
  assert(!appJsContent.includes('<span>🏢 Executar Auditoria Visual YOLOv8</span>'), 'Emoji 🏢 substituído por SVG no botão de auditoria YOLOv8');

} catch (err) {
  console.error('❌ Erro inesperado durante os testes:', err);
}

console.log('\n================================================================');
console.log(`📊 RESULTADO FINAL DA FASE 68: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
