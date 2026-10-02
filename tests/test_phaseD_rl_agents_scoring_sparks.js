/**
 * tests/test_phaseD_rl_agents_scoring_sparks.js
 * 
 * SUÍTE DE TESTES E2E: FASE 66.D — AGENTES DE APRENDIZADO POR REFORÇO
 * 1. Contextual Bandit LinUCB no Intent Scoring (Adaptação baseada em CRM)
 * 2. Q-Learning nos VERSUS Sparks (Evasão Furtiva, Aceleração Burst e Recuo Anti-429)
 * 3. Endpoints REST da API Node.js para predição e calibração de RL
 */

import assert from 'node:assert';
import db from '../server/src/config/database.js';
import BanditScoringService from '../server/src/services/banditScoringService.js';
import { calculateRuralIntentScore } from '../server/src/services/intentScoringService.js';
import SparksEngineService from '../server/src/services/sparksEngineService.js';
import cognitiveQueueService from '../server/src/services/cognitiveQueueService.js';

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

console.log('🧪 Iniciando Suíte de Testes da FASE 66.D: Agentes de RL (LinUCB Scoring + Q-Learning Sparks)...\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. LinUCB Bandit Scoring: Calibração Positiva por Conversão no CRM
// ─────────────────────────────────────────────────────────────────────────────
runTest('1. LinUCB Bandit: Bonificação dinâmica para perfil com alta taxa de fechamento no CRM', () => {
  const tenantId = 'tenant-test-bandit-pos';

  // Semeia estado de alta conversão para soja em MT de grande porte
  const stateKey = 'agro:soja:MEGA:MT';
  db.prepare(`DELETE FROM cognitive_rl_states WHERE state_key = ? AND tenant_id = ?`).run(stateKey, tenantId);
  db.prepare(`
    INSERT INTO cognitive_rl_states (
      id, policy_type, state_key, weights_json, exploration_rate,
      success_count, failure_count, last_reward, tenant_id
    ) VALUES (?, 'ICP_CONVERGENCE', ?, ?, 0.12, 18, 1, 100.0, ?)
  `).run(
    `rl-pos-${Date.now()}`,
    stateKey,
    JSON.stringify({ PRIORITIZE_SIMILAR_DEALS: 92.5, BOOST_CONTACT: 35.0, PENALIZE_UNFIT: -15.0 }),
    tenantId
  );

  const titular = {
    nome: 'Agropecuária Rio Formoso S.A.',
    capital_social: 45000000,
    tenant_id: tenantId
  };

  const propriedade = {
    nome_imovel: 'Fazenda Rio Formoso',
    municipio: 'Sorriso',
    uf: 'MT',
    area_hectares: 2400,
    crop_type: 'soja',
    status_geo: 'CERTIFICADO',
    tenant_id: tenantId
  };

  const evalResult = BanditScoringService.evaluateBanditAdjustment(
    { ...titular, ...propriedade },
    { infrastructure_tier: 'RURAL_STORAGE' },
    tenantId
  );

  assert.strictEqual(evalResult.chosen_arm, 'BOOST_PRIORITY', 'Deveria escolher o braço BOOST_PRIORITY.');
  assert.ok(evalResult.adjustment >= 15, `Ajuste deveria ser >= +15 pts (obtido: ${evalResult.adjustment})`);
  assert.ok(evalResult.rationale.includes('Aprendizado por Reforço'), 'Deveria conter rationale explicativo');

  // Testa cálculo integrado de score
  const scoreResult = calculateRuralIntentScore(titular, propriedade);
  assert.ok(scoreResult.rl_score_adjustment >= 15, 'calculateRuralIntentScore deve conter ajuste de RL');
  assert.ok(scoreResult.intent_triggers.some(t => t.includes('Aprendizado por Reforço')), 'Gatilho LinUCB deve estar no array de triggers');
  console.log(`     🧠 Bônus LinUCB aplicado: +${scoreResult.rl_score_adjustment} pts | Score Final: ${scoreResult.intent_score} (${scoreResult.intent_classification})`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LinUCB Bandit Scoring: Penalização Dinâmica por Descarte/Perda Comercial
// ─────────────────────────────────────────────────────────────────────────────
runTest('2. LinUCB Bandit: Penalização adaptativa para perfil com alto descarte no CRM ou Zumbi', () => {
  const tenantId = 'tenant-test-bandit-neg';

  // Semeia estado com alto descarte e perdas
  const stateKey = 'cnae:4661:SP:ABANDONED_ZOMBIE';
  db.prepare(`DELETE FROM cognitive_rl_states WHERE state_key = ? AND tenant_id = ?`).run(stateKey, tenantId);
  db.prepare(`
    INSERT INTO cognitive_rl_states (
      id, policy_type, state_key, weights_json, exploration_rate,
      success_count, failure_count, last_reward, tenant_id
    ) VALUES (?, 'ICP_CONVERGENCE', ?, ?, 0.15, 2, 14, -30.0, ?)
  `).run(
    `rl-neg-${Date.now()}`,
    stateKey,
    JSON.stringify({ PRIORITIZE_SIMILAR_DEALS: 2.0, BOOST_CONTACT: 0.0, PENALIZE_UNFIT: 65.0 }),
    tenantId
  );

  const titular = {
    nome: 'Comércio de Maquinários Fantasma LTDA',
    cnae: '4661-3/00',
    uf: 'SP',
    capital_social: 100000,
    tenant_id: tenantId
  };

  const evalResult = BanditScoringService.evaluateBanditAdjustment(
    titular,
    { infrastructure_tier: 'ABANDONED_ZOMBIE', is_zombie_risk: true },
    tenantId
  );

  assert.strictEqual(evalResult.chosen_arm, 'SUPPRESS_UNFIT', 'Deveria escolher o braço SUPPRESS_UNFIT.');
  assert.ok(evalResult.adjustment <= -10, `Ajuste deveria ser <= -10 pts (obtido: ${evalResult.adjustment})`);
  console.log(`     ⚠️ Penalidade LinUCB aplicada: ${evalResult.adjustment} pts | Rationale: ${evalResult.rationale}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Q-Learning Sparks: Navegação Furtiva STEALTH_CRUISE com Jitter Anti-Bot
// ─────────────────────────────────────────────────────────────────────────────
runTest('3. Q-Learning Sparks: Política STEALTH_CRUISE com Jitter temporal anti-fingerprinting', () => {
  const tenantId = 'tenant-test-sparks-stealth';
  const sparkType = 'CREDITO_BNDES';
  const timeWindow = 'BUSINESS_HOURS';

  const policy = SparksEngineService.getSparkRlPolicy(sparkType, timeWindow, 'NORMAL', tenantId);
  assert.ok(['STEALTH_CRUISE', 'BURST_ACCELERATION', 'BACKOFF_DEFENSE'].includes(policy.action), 'Ação deve ser canônica');
  assert.ok(policy.q_values, 'Deve conter dicionário de Q-values');
  console.log(`     🕵️ Spark [${sparkType}]: Ação selecionada = ${policy.action} (Exploration: ${policy.exploration})`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Q-Learning Sparks: Aceleração BURST_ACCELERATION em Janela Fértil
// ─────────────────────────────────────────────────────────────────────────────
await runAsyncTest('4. Q-Learning Sparks: Aceleração BURST_ACCELERATION após convergência positiva', async () => {
  const tenantId = 'tenant-test-sparks-burst';
  const sparkType = 'OUTORGA_ANA';
  const timeWindow = 'BUSINESS_HOURS';
  const stateKey = `spark:${sparkType}:${timeWindow}`;

  // Força Q-Value alto para BURST_ACCELERATION
  db.prepare(`DELETE FROM cognitive_rl_states WHERE state_key = ? AND tenant_id = ?`).run(stateKey, tenantId);
  db.prepare(`
    INSERT INTO cognitive_rl_states (
      id, policy_type, state_key, weights_json, exploration_rate,
      success_count, failure_count, last_reward, tenant_id
    ) VALUES (?, 'SPARK_HARVESTER', ?, ?, 0.05, 25, 0, 25.0, ?)
  `).run(
    `rl-burst-${Date.now()}`,
    stateKey,
    JSON.stringify({ BURST_ACCELERATION: 85.0, STEALTH_CRUISE: 30.0, BACKOFF_DEFENSE: -20.0 }),
    tenantId
  );

  const policy = SparksEngineService.getSparkRlPolicy(sparkType, timeWindow, 'NORMAL', tenantId);
  assert.strictEqual(policy.action, 'BURST_ACCELERATION', 'Deve selecionar BURST_ACCELERATION quando tem maior Q-Value e baixo epsilon');
  console.log(`     ⚡ Spark [${sparkType}]: Modo BURST_ACCELERATION ativado (Q-Value = 85.0)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Q-Learning Sparks: Recuo Defensivo Imediato em Caso de Restrição (429 / WAF)
// ─────────────────────────────────────────────────────────────────────────────
await runAsyncTest('5. Q-Learning Sparks: Recuo tático BACKOFF_DEFENSE e atualização de Q-Value', async () => {
  const tenantId = 'tenant-test-sparks-backoff';
  const sparkType = 'DOU';
  const timeWindow = 'EARLY_MORNING';

  // Simula detecção de status 429
  const throttledPolicy = SparksEngineService.getSparkRlPolicy(sparkType, timeWindow, 'THROTTLED_429', tenantId);
  assert.strictEqual(throttledPolicy.action, 'BACKOFF_DEFENSE', 'Deve selecionar imediatamente BACKOFF_DEFENSE sob 429');

  // Registra o feedback negativo e verifica atualização atômica de Q-Value
  const feedback = await SparksEngineService.recordSparkFeedback(sparkType, timeWindow, 'STEALTH_CRUISE', 'THROTTLED_429', 0, tenantId);
  assert.strictEqual(feedback.status, 'REWARD_RECORDED', 'Deve gravar recompensa com sucesso');
  assert.strictEqual(feedback.last_reward, -35, 'Recompensa deve ser -35 pts sob throttle');

  const updatedState = db.prepare(`
    SELECT * FROM cognitive_rl_states 
    WHERE state_key = ? AND tenant_id = ?
  `).get(`spark:${sparkType}:${timeWindow}`, tenantId);

  assert.ok(updatedState, 'Estado deve existir no banco SQLite');
  const weights = JSON.parse(updatedState.weights_json);
  assert.ok(weights['STEALTH_CRUISE'] < 0, `Q-Value de STEALTH_CRUISE deve ter caído (obtido: ${weights['STEALTH_CRUISE']})`);
  console.log(`     🛡️ Recuo BACKOFF_DEFENSE validado. Q-Value atualizado = ${weights['STEALTH_CRUISE']} | Epsilon decaído`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Endpoints REST da API Node.js para Predição e Inspeção de RL
// ─────────────────────────────────────────────────────────────────────────────
await runAsyncTest('6. Endpoints REST: POST /api/cognitive/rl/predict e GET /api/cognitive/rl/bandit-scoring', async () => {
  // Teste 1: Predição de LinUCB via POST
  const resPredict = await fetch(`${BASE_URL}/api/cognitive/rl/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policy_type: 'ICP_CONVERGENCE',
      entity_data: {
        crop_type: 'soja',
        uf: 'MT',
        area_hectares: 1500,
        capital_social: 20000000
      },
      visual_data: {
        infrastructure_tier: 'PRIME_INDUSTRIAL'
      }
    })
  });

  assert.strictEqual(resPredict.status, 200, 'POST /api/cognitive/rl/predict deve retornar HTTP 200');
  const jsonPredict = await resPredict.json();
  assert.strictEqual(jsonPredict.success, true, 'Resposta deve indicar success = true');
  assert.ok(jsonPredict.data.chosen_arm, 'Deve conter chosen_arm');
  console.log(`     📡 POST /api/cognitive/rl/predict: ${jsonPredict.data.chosen_arm} (Ajuste: ${jsonPredict.data.adjustment} pts)`);

  // Teste 2: Inspeção de Bandit via GET
  const resGet = await fetch(`${BASE_URL}/api/cognitive/rl/bandit-scoring?cnae=0111-3/01&uf=MT&area_ha=800&capital_social=12000000&tier=RURAL_STORAGE`);
  assert.strictEqual(resGet.status, 200, 'GET /api/cognitive/rl/bandit-scoring deve retornar HTTP 200');
  const jsonGet = await resGet.json();
  assert.strictEqual(jsonGet.success, true, 'Resposta deve indicar success = true');
  assert.ok(jsonGet.data.state_key, 'Deve conter state_key');
  console.log(`     📡 GET /api/cognitive/rl/bandit-scoring: state_key = ${jsonGet.data.state_key} | Confiança = ${jsonGet.data.confidence}`);
});

console.log('\n🏁 Resultado: 6/6 testes aprovados.');
console.log('🎉 FASE 66.D HOMOLOGADA COM 100% DE SUCESSO!\n');
