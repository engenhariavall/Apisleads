/**
 * tests/test_phaseC_rl_reward_loop.js
 * 
 * SUÍTE DE TESTES E HOMOLOGAÇÃO: FASE 66.C
 * Ingestão de Webhooks de CRM & Loop de Recompensa para Aprendizado por Reforço (RL Ingestion)
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import { crmService } from '../server/src/services/crmService.js';
import cognitiveController from '../server/src/controllers/cognitiveController.js';

console.log('🧪 Iniciando Suíte de Testes da FASE 66.C: Loop de Recompensa de RL & Webhooks CRM...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Erro: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(testName, testFn) {
  totalTests++;
  try {
    await testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Erro: ${err.message}`);
    process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Validação de Schemas e Índices da Fase 66.C
// ─────────────────────────────────────────────────────────────────────────────

runTest('1. Schema de Banco: Tabela rl_rewards_log e índices presentes', () => {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rl_rewards_log'").get();
  assert.ok(table, 'Tabela rl_rewards_log deve existir');

  const cols = db.prepare("PRAGMA table_info(rl_rewards_log)").all().map(c => c.name);
  assert.ok(cols.includes('id'), 'Deve conter id');
  assert.ok(cols.includes('event_type'), 'Deve conter event_type');
  assert.ok(cols.includes('reward_score'), 'Deve conter reward_score');
  assert.ok(cols.includes('deal_value'), 'Deve conter deal_value');
  assert.ok(cols.includes('context_state_key'), 'Deve conter context_state_key');
  assert.ok(cols.includes('source_crm'), 'Deve conter source_crm');
  assert.ok(cols.includes('created_at'), 'Deve conter created_at');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Normalização de Eventos de CRM em Sinais de Recompensa (-100 a +100)
// ─────────────────────────────────────────────────────────────────────────────

runTest('2. Normalizador de Eventos: Mapeamento de sinais (+100, +50, +40, +20, +15, -30, -40)', () => {
  assert.strictEqual(crmService.normalizeCrmEvent('DEAL_WON').reward, 100);
  assert.strictEqual(crmService.normalizeCrmEvent('won').reward, 100);
  assert.strictEqual(crmService.normalizeCrmEvent('SALE_CLOSED').reward, 100);
  assert.strictEqual(crmService.normalizeCrmEvent('MEETING_SCHEDULED').reward, 50);
  assert.strictEqual(crmService.normalizeCrmEvent('LEAD_QUALIFIED').reward, 40);
  assert.strictEqual(crmService.normalizeCrmEvent('WHATSAPP_REPLIED').reward, 20);
  assert.strictEqual(crmService.normalizeCrmEvent('ZOMBIE_DISCARDED').reward, 15);
  assert.strictEqual(crmService.normalizeCrmEvent('DEAL_LOST').reward, -30);
  assert.strictEqual(crmService.normalizeCrmEvent('LOST').reward, -30);
  assert.strictEqual(crmService.normalizeCrmEvent('INVALID_CONTACT').reward, -40);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Simulação de 15 Eventos de CRM Diversificados (Vendas, Negociações e Descartes)
// ─────────────────────────────────────────────────────────────────────────────

await runAsyncTest('3. Ingestão de Lote: Processamento de 15 eventos de CRM reais', async () => {
  // Prepara leads canônicos no banco para testar vínculo
  db.prepare(`
    INSERT OR REPLACE INTO leads (
      id, cnpj, cnpj_raw, razao_social, cnae_principal_codigo, cnae_principal_descricao, porte, municipio, uf, visual_audit_tier
    ) VALUES 
      ('lead-crm-agro-won', '01.234.567/0001-89', '01234567000189', 'COOPERATIVA AGRO SOJA SUL', '0111-3/01', 'Cultivo de soja', 'DEMAIS', 'SORRISO', 'MT', 'RURAL_STORAGE'),
      ('lead-crm-agro-lost', '02.234.567/0001-89', '02234567000189', 'FAZENDA PERDIDA SOJA SUL', '0111-3/01', 'Cultivo de soja', 'MEDIO', 'SORRISO', 'MT', 'RURAL_STORAGE'),
      ('lead-crm-ind-02', '12.345.678/0001-90', '12345678000190', 'FABRICA MAQUINAS E PECAS AGRO', '2833-0/00', 'Fabricação de máquinas agrícolas', 'GRANDE', 'CASCAVEL', 'PR', 'PRIME_INDUSTRIAL'),
      ('lead-crm-zombie-03', '99.888.777/0001-11', '99888777000111', 'COMERCIAL INAPTA GHOST LTDA', '4661-9/00', 'Comércio de máquinas', 'MEDIO', 'SAO PAULO', 'SP', 'ABANDONED_ZOMBIE')
  `).run();

  const crmEventsBatch = [
    // Engajamento Prévio (+50, +40, +20, +15)
    { event_type: 'MEETING_SCHEDULED', cnpj: '01234567000189', deal_value: 500000, source_crm: 'HUBSPOT' },
    { event_type: 'LEAD_QUALIFIED', cnpj: '01234567000189', deal_value: 300000, source_crm: 'RD_STATION' },
    { event_type: 'DEMO_BOOKED', cnpj: '12345678000190', deal_value: 700000, source_crm: 'PIPEDRIVE' },
    { event_type: 'CONTACT_CONNECTED', cnpj: '12345678000190', deal_value: 0, source_crm: 'WHATSAPP' },
    { event_type: 'ZOMBIE_DISCARDED', cnpj: '99888777000111', deal_value: 0, source_crm: 'VERSUS_INTERNAL' },

    // Vendas Fechadas (Won: +100)
    { event_type: 'WON', cnpj: '12345678000190', deal_value: 1250000, source_crm: 'RD_STATION' },
    { event_type: 'DEAL_WON', cnpj: '12345678000190', deal_value: 320000, source_crm: 'HUBSPOT' },
    { event_type: 'DEAL_WON', cnpj: '01234567000189', deal_value: 450000, source_crm: 'HUBSPOT' },
    { event_type: 'SALE_CLOSED', cnpj: '01234567000189', deal_value: 820000, source_crm: 'PIPEDRIVE' },
    { event_type: 'FECHADO_GANHO', cnpj: '01234567000189', deal_value: 600000, source_crm: 'WHATSAPP' },

    // 5 Descartes / Contatos Inválidos / Perdas (-30, -40)
    { event_type: 'DEAL_LOST', cnpj: '02234567000189', deal_value: 200000, source_crm: 'HUBSPOT' },
    { event_type: 'LOST', cnpj: '02234567000189', deal_value: 400000, source_crm: 'PIPEDRIVE' },
    { event_type: 'UNQUALIFIED', cnpj: '99888777000111', deal_value: 0, source_crm: 'RD_STATION' },
    { event_type: 'INVALID_CONTACT', cnpj: '99888777000111', deal_value: 0, source_crm: 'WHATSAPP' },
    { event_type: 'WRONG_NUMBER', cnpj: '99888777000111', deal_value: 0, source_crm: 'WHATSAPP' }
  ];

  const results = [];
  for (const ev of crmEventsBatch) {
    const outcome = await crmService.processInboundCrmWebhook(ev);
    assert.strictEqual(outcome.success, true, 'Evento deve ser processado com sucesso');
    assert.ok(outcome.reward_id, 'Deve gerar reward_id');
    results.push(outcome);
  }

  assert.strictEqual(results.length, 15, '15 eventos de CRM devem ser processados');
  console.log(`     📦 15 eventos de CRM processados e gravados em rl_rewards_log`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Verificação de Aprendizado por Reforço (Q-Values e Epsilon)
// ─────────────────────────────────────────────────────────────────────────────

runTest('4. Aprendizado por Reforço: Atualização atômica de Q-Values nas políticas de RL', () => {
  const policies = db.prepare(`SELECT * FROM cognitive_rl_states WHERE policy_type = 'ICP_CONVERGENCE'`).all();
  assert.ok(policies.length > 0, 'Deve ter criado/atualizado políticas de ICP_CONVERGENCE');

  for (const pol of policies) {
    const weights = JSON.parse(pol.weights_json || '{}');
    assert.ok(Object.keys(weights).length > 0, 'Deve conter ações com Q-Values atualizados');
    assert.ok(pol.exploration_rate <= 0.20, 'Epsilon deve ter decaído com o acúmulo de dados');
    console.log(`     🧠 Política [${pol.state_key}]: Q-Values = ${JSON.stringify(weights)} | Epsilon = ${pol.exploration_rate}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Atualização de Feedback Comercial no Lead
// ─────────────────────────────────────────────────────────────────────────────

runTest('5. Retroalimentação do Lead: feedback_status e feedback_comercial gravados', () => {
  const leadAgro = db.prepare(`SELECT * FROM leads WHERE id = 'lead-crm-agro-won'`).get();
  assert.strictEqual(leadAgro.feedback_status, 'CONVERTED', 'Lead com venda fechada deve estar CONVERTED');
  assert.ok(leadAgro.feedback_comercial.includes('Venda Fechada'), 'Nota deve refletir o fechamento');

  const leadLost = db.prepare(`SELECT * FROM leads WHERE id = 'lead-crm-agro-lost'`).get();
  assert.strictEqual(leadLost.feedback_status, 'DISCARDED', 'Lead com venda perdida deve estar DISCARDED');

  const leadZombie = db.prepare(`SELECT * FROM leads WHERE id = 'lead-crm-zombie-03'`).get();
  assert.strictEqual(leadZombie.feedback_status, 'DISCARDED', 'Lead zumbi/inválido deve estar DISCARDED');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Testes dos Endpoints REST HTTP da Fase 66.C
// ─────────────────────────────────────────────────────────────────────────────

await runAsyncTest('6. Endpoints REST: POST /api/webhooks/crm-feedback e GET /api/cognitive/rl/rewards', async () => {
  // Teste POST
  let postStatus = null;
  let postJson = null;
  const mockPostRes = {
    status(c) { postStatus = c; return this; },
    json(j) { postJson = j; return this; }
  };

  await cognitiveController.handleInboundCrmWebhook({
    headers: {},
    body: {
      event_type: 'DEAL_WON',
      cnpj: '01234567000189',
      deal_value: 950000,
      source_crm: 'HUBSPOT_TEST'
    }
  }, mockPostRes);

  assert.strictEqual(postStatus, 200);
  assert.strictEqual(postJson.success, true);
  assert.strictEqual(postJson.data.reward_score, 100);

  // Teste GET
  let getStatus = null;
  let getJson = null;
  const mockGetRes = {
    status(c) { getStatus = c; return this; },
    json(j) { getJson = j; return this; }
  };

  await cognitiveController.getRlRewardsHistory({
    headers: {},
    query: { limit: 10 }
  }, mockGetRes);

  assert.strictEqual(getStatus, 200);
  assert.strictEqual(getJson.success, true);
  assert.ok(getJson.data.total > 0, 'Deve retornar histórico de eventos');
  assert.ok(getJson.data.stats.total_deal_volume > 0, 'Deve acumular o volume transacionado no CRM');
  console.log(`     📊 Telemetria do CRM: ${getJson.data.stats.total_events} eventos | Volume R$ ${Number(getJson.data.stats.total_deal_volume).toLocaleString('pt-BR')}`);
});

console.log(`\n🏁 Resultado: ${passedTests}/${totalTests} testes aprovados.`);
if (passedTests === totalTests) {
  console.log('🎉 FASE 66.C HOMOLOGADA COM 100% DE SUCESSO!\n');
} else {
  console.error('❌ Falha na homologação da FASE 66.C.\n');
  process.exit(1);
}
