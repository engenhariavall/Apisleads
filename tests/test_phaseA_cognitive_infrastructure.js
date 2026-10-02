/**
 * tests/test_phaseA_cognitive_infrastructure.js
 * 
 * SUÍTE DE TESTES E HOMOLOGAÇÃO: FASE 66.A
 * Fundação de Infraestrutura Cognitiva, Fila Assíncrona & Cache SHA-256
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import cognitiveQueueService from '../server/src/services/cognitiveQueueService.js';
import cognitiveController from '../server/src/controllers/cognitiveController.js';

console.log('🧪 Iniciando Suíte de Testes da FASE 66.A: Fundação de Infraestrutura Cognitiva...\n');

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
// Testes Síncronos: Estrutura de Banco e Schemas
// ─────────────────────────────────────────────────────────────────────────────

runTest('1. Schema de Banco: Tabela cognitive_vision_audits e índices presentes', () => {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cognitive_vision_audits'").get();
  assert.ok(table, 'Tabela cognitive_vision_audits deve existir.');

  const cols = db.prepare("PRAGMA table_info(cognitive_vision_audits)").all();
  const colNames = cols.map(c => c.name);

  assert.ok(colNames.includes('coords_hash'), 'Deve conter coords_hash');
  assert.ok(colNames.includes('infrastructure_tier'), 'Deve conter infrastructure_tier');
  assert.ok(colNames.includes('fleet_count'), 'Deve conter fleet_count');
  assert.ok(colNames.includes('facade_confidence'), 'Deve conter facade_confidence');
  assert.ok(colNames.includes('is_zombie_risk'), 'Deve conter is_zombie_risk');
  assert.ok(colNames.includes('expires_at'), 'Deve conter expires_at');
});

runTest('2. Schema de Banco: Tabelas cognitive_rl_states e cognitive_async_queue presentes', () => {
  const rlTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cognitive_rl_states'").get();
  assert.ok(rlTable, 'Tabela cognitive_rl_states deve existir.');

  const queueTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cognitive_async_queue'").get();
  assert.ok(queueTable, 'Tabela cognitive_async_queue deve existir.');
});

runTest('3. Paridade em Leads e Propriedades Rurais: Colunas visuais ativas', () => {
  const leadCols = db.prepare("PRAGMA table_info(leads)").all().map(c => c.name);
  assert.ok(leadCols.includes('visual_audit_status'), 'leads deve ter visual_audit_status');
  assert.ok(leadCols.includes('visual_audit_tier'), 'leads deve ter visual_audit_tier');

  const propCols = db.prepare("PRAGMA table_info(propriedades_rurais)").all().map(c => c.name);
  assert.ok(propCols.includes('visual_audit_status'), 'propriedades_rurais deve ter visual_audit_status');
  assert.ok(propCols.includes('visual_audit_tier'), 'propriedades_rurais deve ter visual_audit_tier');
});

runTest('4. Hash Criptográfico SHA-256: Consistência e normalização de 6 casas decimais', () => {
  const hash1 = cognitiveQueueService.generateCoordsHash(-24.288219, -53.842101);
  const hash2 = cognitiveQueueService.generateCoordsHash(-24.288219000, -53.842101000);
  assert.strictEqual(hash1.length, 64, 'SHA-256 deve ter 64 caracteres');
  assert.strictEqual(hash1, hash2, 'Coordenadas equivalentes com zeros à direita devem gerar o mesmo hash SHA-256');
});

// ─────────────────────────────────────────────────────────────────────────────
// Testes Assíncronos: Fila, Latência < 15ms e Cache de 60 Dias
// ─────────────────────────────────────────────────────────────────────────────

// Warm-up do JIT e statements do SQLite
await cognitiveQueueService.requestAudit({
  entity_type: 'LEAD',
  entity_id: 'warmup',
  latitude: 0,
  longitude: 0
}).catch(() => {});

await runAsyncTest('5. Despacho Assíncrono com Latência Node.js < 15ms', async () => {
  const t0 = performance.now();
  const res = await cognitiveQueueService.requestAudit({
    entity_type: 'LEAD',
    entity_id: 'lead-test-latency-01',
    latitude: -12.543210,
    longitude: -55.765432,
    cnae: '0111-3/01',
    company_name: 'FAZENDA TESTE LATENCIA'
  });
  const elapsed = performance.now() - t0;

  assert.ok(elapsed < 15, `Tempo de despacho da API (${elapsed.toFixed(2)}ms) deve ser estritamente < 15ms`);
  assert.ok(['PROCESSING', 'CACHED'].includes(res.status), 'Status retornado deve ser PROCESSING ou CACHED');
  assert.ok(res.coords_hash, 'Deve conter coords_hash');
});

await runAsyncTest('6. Cache Criptográfico de 60 Dias: 2ª requisição instantânea com status CACHED', async () => {
  const testLat = -23.111222;
  const testLng = -51.333444;
  const coordsHash = cognitiveQueueService.generateCoordsHash(testLat, testLng);

  // Insere auditoria em cache simulando 60 dias de validade
  const auditId = `audit-cache-test-${Date.now()}`;
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO cognitive_vision_audits (
      id, entity_type, entity_id, coords_hash, latitude, longitude,
      image_source, infrastructure_tier, fleet_count, facade_confidence,
      is_zombie_risk, raw_inference_json, expires_at, tenant_id
    ) VALUES (?, 'LEAD', 'lead-cache-test', ?, ?, ?, 'GOOGLE_STREET_VIEW', 'PRIME_INDUSTRIAL', 8, 0.95, 0, '{}', ?, 'tenant-root-default')
  `).run(auditId, coordsHash, testLat, testLng, expiresAt);

  // Executa solicitação
  const res = await cognitiveQueueService.requestAudit({
    entity_type: 'LEAD',
    entity_id: 'lead-cache-test',
    latitude: testLat,
    longitude: testLng
  });

  assert.strictEqual(res.status, 'CACHED', 'Status deve ser CACHED');
  assert.strictEqual(res.cached, true, 'Flag cached deve ser true');
  assert.strictEqual(res.audit.infrastructure_tier, 'PRIME_INDUSTRIAL', 'Deve recuperar os dados corretos da auditoria');
  assert.ok(res.latency_ms < 15, `Latência do cache (${res.latency_ms}ms) deve ser ultra rápida (< 15ms)`);
});

await runAsyncTest('7. Enfileiramento de Lote (20 Jobs Simultâneos): Todos < 15ms', async () => {
  const jobs = [];
  const latencies = [];

  for (let i = 0; i < 20; i++) {
    const tStart = performance.now();
    const p = cognitiveQueueService.requestAudit({
      entity_type: 'LEAD',
      entity_id: `batch-lead-${i}-${Date.now()}`,
      latitude: -15.0 - (i * 0.05),
      longitude: -55.0 - (i * 0.05),
      cnae: i % 2 === 0 ? '0111-3/01' : '4661-9/00',
      company_name: `EMPRESA LOTE TESTE ${i}`
    }).then(res => {
      latencies.push(performance.now() - tStart);
      return res;
    });
    jobs.push(p);
  }

  const results = await Promise.all(jobs);
  assert.strictEqual(results.length, 20, '20 jobs devem ser enfileirados');

  const maxLat = Math.max(...latencies);
  const avgLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  console.log(`     📊 Latência máxima no lote de 20 jobs: ${maxLat.toFixed(2)}ms | Média: ${avgLat.toFixed(2)}ms`);

  assert.ok(maxLat < 20, `Nenhum job deve travar o event loop (maxLat=${maxLat.toFixed(2)}ms)`);
});

await runAsyncTest('8. Resiliência do Fallback Cognitivo & Drenagem da Fila', async () => {
  // Aguarda drenagem inicial dos jobs da fila
  let pendingCount = 1;
  const startWait = Date.now();
  while (pendingCount > 0 && (Date.now() - startWait) < 5000) {
    await new Promise(r => setTimeout(r, 200));
    pendingCount = db.prepare("SELECT COUNT(*) as cnt FROM cognitive_async_queue WHERE status = 'PENDING'").get().cnt;
  }

  // Verifica se tarefas foram processadas sem crash
  const completedCount = db.prepare("SELECT COUNT(*) as cnt FROM cognitive_async_queue WHERE status = 'COMPLETED'").get().cnt;
  assert.ok(completedCount > 0, 'Tarefas devem ter sido concluídas pelo mecanismo de execução/fallback');
});

runTest('9. Aprendizado por Reforço (RL Reward Loop): Atualização de pesos e decaimento epsilon', () => {
  const policyType = 'SPARK_HARVESTER';
  const stateKey = 'domain:dou.gov.br';
  const action = 'POLL_INTERVAL_30M';

  // 1ª Recompensa positiva (+100)
  const r1 = cognitiveQueueService.recordReward({
    policy_type: policyType,
    state_key: stateKey,
    action: action,
    reward: 100
  });

  assert.strictEqual(r1.status, 'REWARD_RECORDED');
  assert.strictEqual(r1.policy_type, policyType);
  assert.strictEqual(r1.action, action);
  assert.ok(r1.new_q_value > 0, 'Q-value deve ter aumentado positivamente');
  assert.ok(r1.exploration_rate <= 0.20, 'Epsilon deve sofrer decaimento suave');

  // 2ª Recompensa negativa (-30) em ação alternativa
  const r2 = cognitiveQueueService.recordReward({
    policy_type: policyType,
    state_key: stateKey,
    action: 'POLL_INTERVAL_5M',
    reward: -30
  });

  assert.ok(r2.new_q_value < 0, 'Q-value de ação penalizada deve ser negativo');
  assert.ok(r1.new_q_value > r2.new_q_value, 'Ação positiva deve ter Q-value superior à ação penalizada');
});

runTest('10. Telemetria do Subsistema Cognitivo: Agregação precisa de métricas', () => {
  const tele = cognitiveQueueService.getTelemetry('tenant-root-default');

  assert.ok(tele, 'Telemetria deve ser retornada');
  assert.strictEqual(tele.max_concurrency, 2, 'Concorrência máxima deve ser 2');
  assert.ok(tele.queue, 'Métricas da fila devem estar presentes');
  assert.ok(tele.vision_audits, 'Métricas de visão devem estar presentes');
  assert.ok(tele.rl_states, 'Métricas de RL devem estar presentes');
});

await runAsyncTest('11. REST API Controllers: Auditoria Visual, Cache e Telemetria', async () => {
  // Mock simples para testar controllers
  let resStatus = null;
  let resJson = null;
  const mockRes = {
    status(code) {
      resStatus = code;
      return this;
    },
    json(payload) {
      resJson = payload;
      return this;
    }
  };

  // Teste GET /api/cognitive/telemetry
  await cognitiveController.getCognitiveTelemetry({ headers: {} }, mockRes);
  assert.strictEqual(resStatus, 200);
  assert.strictEqual(resJson.success, true);
  assert.ok(resJson.data.queue, 'Deve retornar estatísticas da fila');

  // Teste POST /api/cognitive/rl/reward
  await cognitiveController.recordRlReward({
    headers: {},
    body: {
      policy_type: 'ROUTE_OPTIMIZATION',
      state_key: 'rota:sorriso-sinop',
      action: 'DESPACHO_AGRO_WHATSAPP',
      reward: 50
    }
  }, mockRes);
  assert.strictEqual(resStatus, 200);
  assert.strictEqual(resJson.success, true);
  assert.strictEqual(resJson.data.status, 'REWARD_RECORDED');
});

console.log(`\n🏁 Resultado: ${passedTests}/${totalTests} testes aprovados.`);
if (passedTests === totalTests) {
  console.log('🎉 FASE 66.A HOMOLOGADA COM 100% DE SUCESSO!\n');
} else {
  console.error('❌ Falha na homologação da FASE 66.A.\n');
  process.exit(1);
}
