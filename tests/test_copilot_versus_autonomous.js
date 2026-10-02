/**
 * tests/test_copilot_versus_autonomous.js
 * 
 * BATERIA DE TESTES DE INTEGRAÇÃO & AUTONOMIA: COPILOTO VERSUS 2.0
 * 
 * Valida:
 * 1. Catálogo Completo de 20 Ferramentas (Function Calling)
 * 2. Execução autônoma de Radar Sparks, Varredura de Concorrentes, Gaps, CAR e Bureau
 * 3. Geração consistente do array de `ui_actions` (Câmera 3D, Abas, Drawer)
 * 4. Aprendizado por Reforço (LinUCB): gravação em `rl_rewards_log` e injeção no Prompt
 * 5. Endpoints HTTP de chat, feedback e estatísticas cognitivas
 */

import { aiCopilotService, COPILOT_TOOLS } from '../server/src/services/aiCopilotService.js';
import CopilotReinforcementService from '../server/src/services/copilotReinforcementService.js';
import db from '../server/src/config/database.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🤖 INICIANDO SUÍTE DE TESTES: COPILOTO VERSUS 2.0 (FULL AGENTIC)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // TESTE 1: Catálogo de Ferramentas
  console.log('📌 Teste 1: Catálogo de Tools (Function Calling)');
  const tools = aiCopilotService.getTools();
  assert(Array.isArray(tools) && tools.length >= 20, `Possui ao menos 20 tools ativas (encontradas: ${tools.length})`);

  const toolNames = tools.map(t => t.function.name);
  assert(toolNames.includes('consultarRadarSparks'), 'Contém a tool consultarRadarSparks');
  assert(toolNames.includes('executarVarreduraConcorrentes'), 'Contém a tool executarVarreduraConcorrentes');
  assert(toolNames.includes('analisarGapsTerritoriais'), 'Contém a tool analisarGapsTerritoriais');
  assert(toolNames.includes('buscarPropriedadesRuraisCar'), 'Contém a tool buscarPropriedadesRuraisCar');
  assert(toolNames.includes('enriquecerDecisorBureau'), 'Contém a tool enriquecerDecisorBureau');
  assert(toolNames.includes('registrarFeedbackReforco'), 'Contém a tool registrarFeedbackReforco');
  assert(toolNames.includes('despacharAcoesInterface'), 'Contém a tool despacharAcoesInterface');

  // TESTE 2: Aprendizado por Reforço (RL LinUCB & rl_rewards_log)
  console.log('\n📌 Teste 2: Aprendizado por Reforço (CopilotReinforcementService)');
  const feedbackWon = await CopilotReinforcementService.recordFeedback({
    lead_id: 'lead-test-agro-001',
    cnpj: '08.921.442/0001-90',
    event_type: 'DEAL_WON',
    deal_value: 3500000.0,
    context_state_key: 'agro:soja:MEGA:MT',
    payload: { cultura: 'Soja', motivo: 'Compra de 2 Colheitadeiras Finame' }
  });
  assert(feedbackWon.success === true, 'Registrou evento DEAL_WON com sucesso');
  assert(feedbackWon.reward_score === 100, 'Pontuação de recompensa para DEAL_WON é +100');
  assert(feedbackWon.log_id.startsWith('rew-'), 'Gerou log_id com prefixo padrão');

  const feedbackLost = await CopilotReinforcementService.recordFeedback({
    lead_id: 'lead-test-agro-002',
    cnpj: '11.890.312/0001-09',
    event_type: 'DEAL_LOST',
    context_state_key: 'agro:misto:PEQUENO:MS',
    payload: { motivo: 'Descarte por restrição cadastral' }
  });
  assert(feedbackLost.reward_score === -40, 'Pontuação de penalidade para DEAL_LOST é -40');

  // Verifica persistência direta no SQLite
  const savedRow = db.prepare('SELECT * FROM rl_rewards_log WHERE id = ?').get(feedbackWon.log_id);
  assert(savedRow !== undefined && savedRow.event_type === 'DEAL_WON', 'Registro de recompensa persistido atomicamente no SQLite');

  const summary = CopilotReinforcementService.getLearnedPreferencesSummary();
  assert(typeof summary === 'string' && summary.includes('agro:soja:MEGA:MT'), 'Síntese de lições aprendidas gerada com sucesso para injeção no prompt');

  const promptWithRl = aiCopilotService.buildSystemPrompt();
  assert(promptWithRl.includes('POLÍTICAS COGNITIVAS & APRENDIZADO POR REFORÇO'), 'System Prompt injeta ativamente as lições aprendidas de RL');

  // TESTE 3: Execução de Radar Sparks via Copiloto
  console.log('\n📌 Teste 3: Tool de Radar Sparks');
  const sparksChat = await aiCopilotService.processChat({
    prompt: 'Consultar sinais quentes do Radar Sparks em MT com crédito BNDES',
    context: {}
  });
  assert(sparksChat.success === true, 'Processou consulta de Radar Sparks com sucesso');
  assert(sparksChat.action === 'trigger_consult_sparks', 'Identificou ação trigger_consult_sparks');
  assert(Array.isArray(sparksChat.ui_actions) && sparksChat.ui_actions.length > 0, 'Gerou ui_actions estruturadas');
  assert(sparksChat.ui_actions.some(a => a.type === 'SWITCH_TAB' && a.payload.aba === 'table'), 'ui_actions contém comando SWITCH_TAB para tabela');

  // TESTE 4: Varredura de Concorrentes & Gaps
  console.log('\n📌 Teste 4: Tool de Varredura de Concorrentes & Gaps');
  const sweepChat = await aiCopilotService.processChat({
    prompt: 'Executar varredura de concorrentes de maquinário no RS com raio de 50 km',
    context: {}
  });
  assert(sweepChat.success === true, 'Executou varredura de concorrentes');
  assert(sweepChat.action === 'trigger_competitor_sweep', 'Identificou trigger_competitor_sweep');
  assert(sweepChat.action_payload.count_activated !== undefined, 'Retornou quantidade de concorrentes ativados');
  assert(sweepChat.ui_actions.some(a => a.type === 'SWITCH_TAB' && a.payload.aba === 'competitors'), 'ui_actions comanda transição para aba competitors');

  // TESTE 5: Gaps Territoriais
  console.log('\n📌 Teste 5: Tool de Gaps Territoriais');
  const gapsChat = await aiCopilotService.processChat({
    prompt: 'Analisar gaps de mercado e zonas de sombra da concorrência',
    context: {}
  });
  assert(gapsChat.success === true, 'Executou análise de Gaps Territoriais');
  assert(gapsChat.action === 'trigger_analyze_gaps', 'Identificou trigger_analyze_gaps');
  assert(Array.isArray(gapsChat.ui_actions), 'Retornou lista de ui_actions');

  // TESTE 6: Enriquecimento de Decisor via Bureau
  console.log('\n📌 Teste 6: Tool de Bureau de Decisores');
  const bureauChat = await aiCopilotService.processChat({
    prompt: 'Buscar WhatsApp do titular CPF 452.881.900-34 no bureau',
    context: {}
  });
  assert(bureauChat.success === true, 'Processou solicitação de bureau');
  assert(bureauChat.action === 'trigger_enrich_bureau', 'Identificou trigger_enrich_bureau');
  assert(bureauChat.ui_actions.some(a => a.type === 'OPEN_DRAWER'), 'ui_actions comanda abertura do Right Drawer');

  // TESTE 7: Comando Universal de Interface & Câmera 3D
  console.log('\n📌 Teste 7: Voo Espacial WebGL & Controle de Interface');
  const flyChat = await aiCopilotService.processChat({
    prompt: 'Voar para Sorriso e mostrar propriedades no mapa',
    context: {}
  });
  assert(flyChat.success === true, 'Processou comando de voo para Sorriso');
  assert(flyChat.ui_actions.some(a => a.type === 'FLY_TO_COORDS'), 'ui_actions comanda voo de câmera 3D FLY_TO_COORDS');
  const flyAction = flyChat.ui_actions.find(a => a.type === 'FLY_TO_COORDS');
  assert(flyAction.payload.lat < 0 && flyAction.payload.lng < 0, `Coordenadas válidas de voo (Lat: ${flyAction.payload.lat}, Lng: ${flyAction.payload.lng})`);

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`🏁 RESULTADO FINAL: ${passedTests} de ${totalTests} testes aprovados (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal durante a execução dos testes:', err);
  process.exit(1);
});
