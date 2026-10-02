/**
 * test_hotfix_ux_copilot_refinement.js
 * 
 * Validação do Hotfix de UX:
 * 1. Remoção de Redundância (Exclusividade do Botão Flutuante)
 * 2. Limpeza Estética (Eliminação Total de Emojis de Robô 🤖)
 * 3. Adoção de SVG Minimalista, Monograma "V" e Estética Sóbria (Padrão ChatGPT/OpenAI)
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function run() {
  console.log('\n=============================================================');
  console.log('🧪 TESTES: HOTFIX UX - REFINAMENTO VISUAL DO COPILOTO');
  console.log('=============================================================\n');

  const indexPath = path.join(__dirname, '../client/index.html');
  const cssPath = path.join(__dirname, '../client/css/styles.css');
  const jsPath = path.join(__dirname, '../client/js/aiCopilot.js');
  const serverPath = path.join(__dirname, '../server/src/services/aiCopilotService.js');

  const indexHtml = fs.readFileSync(indexPath, 'utf-8');
  const stylesCss = fs.readFileSync(cssPath, 'utf-8');
  const copilotJs = fs.readFileSync(jsPath, 'utf-8');
  const serverJs = fs.readFileSync(serverPath, 'utf-8');

  // TESTE 1: Remoção de redundância no header e ponto único flutuante
  await test('1. Botão do Copiloto no cabeçalho superior removido; botão flutuante mantido como ponto de acesso único', async () => {
    assert(!indexHtml.includes('id="btnOpenCopilotHeader"'), 'client/index.html não deve conter #btnOpenCopilotHeader');
    assert(indexHtml.includes('id="btnFloatingCopilot"'), 'client/index.html deve conter #btnFloatingCopilot');
    assert(!copilotJs.includes('btnOpenCopilotHeader'), 'client/js/aiCopilot.js não deve referenciar btnOpenCopilotHeader');
  });

  // TESTE 2: Erradicação absoluta de emojis de robô (🤖)
  await test('2. Erradicação de emojis de robô (🤖) em index.html, styles.css, aiCopilot.js e aiCopilotService.js', async () => {
    assert(!indexHtml.includes('🤖'), 'client/index.html não deve conter 🤖');
    assert(!stylesCss.includes('🤖'), 'client/css/styles.css não deve conter 🤖');
    assert(!copilotJs.includes('🤖'), 'client/js/aiCopilot.js não deve conter 🤖');
    assert(!serverJs.includes('🤖'), 'server/src/services/aiCopilotService.js não deve conter 🤖');
  });

  // TESTE 3: Botão flutuante com SVG minimalista e rótulo clean "Copiloto"
  await test('3. Botão flutuante utiliza ícone SVG minimalista (Sparkles) e texto conciso "Copiloto"', async () => {
    assert(indexHtml.includes('<span class="floating-copilot-text">Copiloto</span>'), 'Texto do botão flutuante deve ser exatamente "Copiloto"');
    assert(!indexHtml.includes('Copiloto IA</span>'), 'Texto não deve conter "Copiloto IA"');
    assert(indexHtml.includes('<span class="floating-copilot-icon">'), 'Botão flutuante deve ter span.floating-copilot-icon');
    assert(indexHtml.includes('<svg width="15" height="15" viewBox="0 0 24 24"'), 'Ícone do botão flutuante deve ser um SVG minimalista');
  });

  // TESTE 4: Avatar do assistente com monograma "V" sofisticado
  await test('4. Avatar do assistente utiliza monograma "V" sofisticado no header e nas mensagens', async () => {
    assert(indexHtml.includes('copilot-avatar-monogram">V</span>'), 'Header do drawer deve conter monograma V');
    assert(copilotJs.includes('copilot-avatar-monogram">V</span>'), 'aiCopilot.js deve renderizar monograma V nas respostas do assistente');
    assert(stylesCss.includes('.copilot-avatar-monogram'), 'styles.css deve estilizar o monograma V com gradiente');
  });

  // TESTE 5: Polimento do Chat estilo OpenAI / ChatGPT (Dark Clean, tipografia moderna e paddings sóbrios)
  await test('5. Polimento visual com tipografia moderna sans-serif, paddings equilibrados e fundo escuro sóbrio', async () => {
    assert(stylesCss.includes('BlinkMacSystemFont'), 'styles.css deve adotar tipografia moderna sem serifa');
    assert(stylesCss.includes('.copilot-msg-avatar'), 'styles.css deve estilizar o avatar do assistente no chat');
    assert(stylesCss.includes('.copilot-msg-user .copilot-msg-bubble'), 'styles.css deve conter regras para bolha do usuário');
    assert(stylesCss.includes('.copilot-msg-assistant .copilot-msg-bubble'), 'styles.css deve conter regras para bolha do assistente');
    assert(stylesCss.includes('#101726'), 'Bolha do assistente deve utilizar fundo escuro refinado #101726');
    assert(stylesCss.includes('#1E293B'), 'Bolha do usuário deve utilizar slate escuro #1E293B');
  });

  console.log('\n-------------------------------------------------------------');
  console.log('📊 RESULTADO FINAL: 5/5 TESTES DE HOTFIX APROVADOS (100%)');
  console.log('-------------------------------------------------------------\n');
}

run();
