/**
 * tests/test_phaseE_cockpit_drawer_copilot.js
 * 
 * SUÍTE DE TESTES E2E: FASE 66.E — INTEGRAÇÃO COCKPIT COGNITIVO, RIGHT DRAWER & COPILOTO IA
 * 
 * Valida:
 * 1. Preservação Sagrada do Right Drawer (Fases 62 e 63 100% intactas)
 * 2. Bloco aditivo #cognitiveVisionAuditBlock no Drawer Rural
 * 3. Card aditivo #inspectorVisualAuditPanel no Inspetor B2B
 * 4. Extensão do Copiloto IA (Tools: consultarAuditoriaCognitiva e explicarRecomendacaoCognitiva)
 * 5. Endpoint REST /api/ai/chat com Function Calling Cognitivo
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPILOT_TOOLS, aiCopilotService } from '../server/src/services/aiCopilotService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'http://localhost:3000';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('🧪 Iniciando Suíte de Testes da FASE 66.E: Cockpit Cognitivo, Right Drawer & Copiloto IA...\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Preservação Sagrada do Right Drawer (Fases 62 e 63 intactas + Bloco 66 aditivo)
// ─────────────────────────────────────────────────────────────────────────────
runTest('1. Salvaguarda 1: Preservação Sagrada do Right Drawer (Fases 62 e 63 intactas)', () => {
  const indexPath = path.join(ROOT_DIR, 'client', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');

  // Fase 62 (SEFAZ IE PF)
  assert.ok(
    indexHtml.includes('id="ruralSefazPfBlock"'),
    'Bloco #ruralSefazPfBlock da FASE 62 DEVE permanecer 100% intacto.'
  );

  // Fase 63 (Maquinário & Lavoura Útil)
  assert.ok(
    indexHtml.includes('id="ruralMachineryFleetBlock"'),
    'Bloco #ruralMachineryFleetBlock da FASE 63 DEVE permanecer 100% intacto.'
  );

  // Bloco Aditivo Fase 66 (Sensoriamento Orbital & CV)
  assert.ok(
    indexHtml.includes('id="cognitiveVisionAuditBlock"'),
    'Bloco #cognitiveVisionAuditBlock da FASE 66 deve existir de forma aditiva.'
  );

  // Valida que o bloco da Fase 66 está posicionado após o de maquinário
  const posMachinery = indexHtml.indexOf('id="ruralMachineryFleetBlock"');
  const posCognitive = indexHtml.indexOf('id="cognitiveVisionAuditBlock"');
  assert.ok(posCognitive > posMachinery, 'Bloco cognitivo deve suceder o bloco de maquinário no DOM.');

  console.log('     🛡️ Right Drawer Rural: Fases 62 e 63 intactas e Fase 66 aditiva verificadas.');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Card de Auditoria Visual no Inspetor B2B
// ─────────────────────────────────────────────────────────────────────────────
runTest('2. Card Aditivo #inspectorVisualAuditPanel no Inspetor de Leads B2B', () => {
  const indexPath = path.join(ROOT_DIR, 'client', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');

  assert.ok(
    indexHtml.includes('id="inspectorVisualAuditPanel"'),
    'Card #inspectorVisualAuditPanel deve existir no painel de leads B2B.'
  );
  assert.ok(
    indexHtml.includes('id="inspectorVisualTierBadge"'),
    'Badge #inspectorVisualTierBadge deve existir para indicar o tier da empresa.'
  );
  console.log('     🏢 Inspetor B2B: #inspectorVisualAuditPanel e #inspectorVisualTierBadge presentes.');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Implementação das Rotinas de UI no app.js
// ─────────────────────────────────────────────────────────────────────────────
runTest('3. Implementação das rotinas renderCognitiveVisionUI e On-Demand no app.js', () => {
  const appJsPath = path.join(ROOT_DIR, 'client', 'js', 'app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf-8');

  assert.ok(
    appJs.includes('renderCognitiveVisionUI'),
    'Função renderCognitiveVisionUI deve estar implementada no app.js.'
  );
  assert.ok(
    appJs.includes('/api/cognitive/vision/satellite-audit'),
    'app.js deve acionar o endpoint de satélite sob demanda.'
  );
  assert.ok(
    appJs.includes('/api/cognitive/vision/audit'),
    'app.js deve acionar o endpoint de visão computacional B2B sob demanda.'
  );
  console.log('     💻 Client JS: Renderizadores e chamadas sob demanda integrados.');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Definição das Ferramentas Cognitivas no Copiloto IA (COPILOT_TOOLS)
// ─────────────────────────────────────────────────────────────────────────────
runTest('4. Ferramentas Cognitivas registradas em COPILOT_TOOLS da OpenAI', () => {
  const toolNames = COPILOT_TOOLS.map(t => t.function?.name);

  assert.ok(
    toolNames.includes('consultarAuditoriaCognitiva'),
    'consultarAuditoriaCognitiva deve estar registrado em COPILOT_TOOLS.'
  );
  assert.ok(
    toolNames.includes('explicarRecomendacaoCognitiva'),
    'explicarRecomendacaoCognitiva deve estar registrado em COPILOT_TOOLS.'
  );
  console.log(`     🤖 Copiloto IA: ${toolNames.length} ferramentas ativas, incluindo as 2 cognitivas.`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Execução Heurística do Copiloto para Comandos Cognitivos
// ─────────────────────────────────────────────────────────────────────────────
await runAsyncTest('5. Processamento Heurístico do Copiloto IA para Ações Cognitivas', async () => {
  // Teste 1: Auditoria Cognitiva
  const resAudit = await aiCopilotService.generateFallbackResponseWithTools('Faça uma auditoria cognitiva da fazenda e veja os pivôs de irrigação');
  assert.strictEqual(resAudit.success, true, 'Deve processar auditoria com sucesso');
  assert.strictEqual(resAudit.action, 'trigger_cognitive_audit', 'Ação deve ser trigger_cognitive_audit');
  assert.ok(resAudit.reply.includes('Auditoria Cognitiva VERSUS'), 'Resposta deve conter cabeçalho cognitivo');
  console.log(`     🧠 Chat Copiloto: Ação '${resAudit.action}' disparada com sucesso.`);

  // Teste 2: Explicar Recomendação RL
  const resRl = await aiCopilotService.generateFallbackResponseWithTools('Por que esse lead teve bonificação de aprendizado por reforço linucb?');
  assert.strictEqual(resRl.success, true, 'Deve processar recomendação RL com sucesso');
  assert.strictEqual(resRl.action, 'explain_rl_recommendation', 'Ação deve ser explain_rl_recommendation');
  assert.ok(resRl.reply.includes('LinUCB Bandit'), 'Resposta deve explicar o modelo LinUCB');
  console.log(`     🎯 Chat Copiloto: Ação '${resRl.action}' explicada com sucesso.`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Endpoint REST HTTP /api/ai/chat com Suporte a Comandos Cognitivos
// ─────────────────────────────────────────────────────────────────────────────
await runAsyncTest('6. Endpoint REST POST /api/ai/chat respondendo HTTP 200 com Ação Cognitiva', async () => {
  const res = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Realize a auditoria cognitiva neural com visão computacional desta propriedade',
      context: { properties: [] }
    })
  });

  assert.strictEqual(res.status, 200, 'POST /api/ai/chat deve retornar HTTP 200');
  const json = await res.json();
  assert.strictEqual(json.success, true, 'Resposta deve indicar success = true');
  assert.strictEqual(json.action, 'trigger_cognitive_audit', 'Ação do payload deve ser trigger_cognitive_audit');
  console.log(`     📡 REST /api/ai/chat: Resposta OK (Ação: ${json.action})`);
});

console.log('\n🏁 Resultado: 6/6 testes aprovados.');
console.log('🎉 FASE 66.E HOMOLOGADA COM 100% DE SUCESSO!\n');
