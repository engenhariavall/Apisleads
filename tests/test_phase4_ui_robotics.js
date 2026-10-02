import assert from 'assert';
import aiCopilotService from '../server/src/services/aiCopilotService.js';

console.log('🧪 Iniciando Testes da FASE 4: Automação Universal de UI (Full Interface Robotics)...\n');

let passCount = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

async function runTests() {
  // 1. Inspecionar Lead
  await test('1. Inspecionar Lead por nome/ID dispara trigger_inspect_lead', async () => {
    const result = await aiCopilotService.executeLocalRuleFallback('copiloto, abrir a ficha da Fazenda Santa Maria', {});
    assert.ok(result, 'Resultado não deve ser nulo');
    assert.strictEqual(result.action, 'trigger_inspect_lead', 'Deveria retornar a ação trigger_inspect_lead');
    assert.ok(result.action_payload, 'Deveria possuir action_payload');
    assert.ok(result.action_payload.identificador.includes('Santa Maria'), 'Deveria capturar o identificador do lead');
    assert.ok(result.reply.includes('Dossiê') || result.reply.includes('Inspetor'), 'Resposta deve ser amigável e explicativa');
  });

  // 2. Alternar Visualização para Mapa
  await test('2. Alternar Visualização para Mapa dispara trigger_switch_tab', async () => {
    const result = await aiCopilotService.executeLocalRuleFallback('mudar para o mapa espacial', {});
    assert.strictEqual(result.action, 'trigger_switch_tab', 'Deveria retornar trigger_switch_tab');
    assert.strictEqual(result.action_payload.aba, 'map', 'Deveria apontar para a aba map');
    assert.ok(result.reply.includes('Mapa WebGL'), 'Resposta deve confirmar mudança para Mapa');
  });

  // 3. Alternar Visualização para Tabela
  await test('3. Alternar Visualização para Tabela de Leads dispara trigger_switch_tab', async () => {
    const result = await aiCopilotService.executeLocalRuleFallback('alternar para a tabela analítica', {});
    assert.strictEqual(result.action, 'trigger_switch_tab', 'Deveria retornar trigger_switch_tab');
    assert.strictEqual(result.action_payload.aba, 'table', 'Deveria apontar para a aba table');
    assert.ok(result.reply.includes('Tabela Analítica'), 'Resposta deve confirmar mudança para Tabela');
  });

  // 4. Alternar Visualização para Concorrentes
  await test('4. Alternar Visualização para Concorrentes dispara trigger_switch_tab', async () => {
    const result = await aiCopilotService.executeLocalRuleFallback('ir para a aba de concorrentes', {});
    assert.strictEqual(result.action, 'trigger_switch_tab', 'Deveria retornar trigger_switch_tab');
    assert.strictEqual(result.action_payload.aba, 'competitors', 'Deveria apontar para a aba competitors');
    assert.ok(result.reply.includes('Concorrentes'), 'Resposta deve confirmar mudança para Concorrentes');
  });

  // 5. Limpar Filtros
  await test('5. Limpar Filtros dispara trigger_clear_filters', async () => {
    const result = await aiCopilotService.executeLocalRuleFallback('limpar todos os filtros e restaurar base', {});
    assert.strictEqual(result.action, 'trigger_clear_filters', 'Deveria retornar trigger_clear_filters');
    assert.ok(result.action_payload, 'action_payload deve existir');
    assert.ok(result.reply.includes('Filtros Restaurados'), 'Resposta deve confirmar o reset de filtros');
  });

  // 6. Acionar Auditoria Visual por Satélite
  await test('6. Acionar Auditoria Visual dispara trigger_visual_audit', async () => {
    const result = await aiCopilotService.executeLocalRuleFallback('fazer auditoria visual de satélite em alta resolução', {});
    assert.strictEqual(result.action, 'trigger_visual_audit', 'Deveria retornar trigger_visual_audit');
    assert.strictEqual(result.action_payload.tipo_auditoria, 'satelite', 'Tipo de auditoria deve ser satelite');
    assert.ok(result.reply.includes('Auditoria Visual Espacial'), 'Mensagem deve referenciar auditoria visual');
  });

  // 7. Schema das 4 novas ferramentas presentes no COPILOT_TOOLS
  await test('7. Novas ferramentas estão registradas formalmente no catálogo de ferramentas (COPILOT_TOOLS)', async () => {
    const tools = aiCopilotService.getToolsDeclaration();
    assert.ok(Array.isArray(tools), 'Tools declaration deve ser array');
    const functionNames = tools.map(t => t.function.name);

    assert.ok(functionNames.includes('inspecionarLead'), 'inspecionarLead deve estar em COPILOT_TOOLS');
    assert.ok(functionNames.includes('alternarVisualizacao'), 'alternarVisualizacao deve estar em COPILOT_TOOLS');
    assert.ok(functionNames.includes('limparFiltros'), 'limparFiltros deve estar em COPILOT_TOOLS');
    assert.ok(functionNames.includes('acionarAuditoriaVisual'), 'acionarAuditoriaVisual deve estar em COPILOT_TOOLS');
  });

  console.log(`\n========================================`);
  console.log(`📊 Resultado Final FASE 4: ${passCount}/${totalTests} testes aprovados.`);
  console.log(`========================================\n`);

  if (passCount !== totalTests) {
    process.exit(1);
  }
}

runTests();
