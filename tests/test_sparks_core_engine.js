/**
 * tests/test_sparks_core_engine.js
 * 
 * SUÍTE DE TESTES E2E DO VERSUS SPARKS: RADAR DE SINAIS DE COMPRA
 * Valida o Core de Máquinas (BNDES Finame) e Irrigação (Outorgas ANA),
 * a persistência, o scoring contextual e a blindagem dos 3 Cuidados Críticos.
 */

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import db from '../server/src/config/database.js';
import SparksEngineService from '../server/src/services/sparksEngineService.js';
import { calculateRuralIntentScore } from '../server/src/services/intentScoringService.js';
import app from '../server/src/app.js';

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

async function testAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

async function runTests() {
  console.log(`\n==================================================================`);
  console.log(`⚡ [VERSUS SPARKS] INICIANDO SUÍTE DE TESTES DO RADAR DE SINAIS...`);
  console.log(`==================================================================\n`);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const BASE_URL = `http://127.0.0.1:${port}`;

  try {
    // ── TESTE 1: Schemas e Monitores Canônicos no Banco de Dados ──
    test('1. Schemas de banco sparks_monitors e sparks_signals ativos', () => {
      const monCols = db.prepare("PRAGMA table_info(sparks_monitors)").all();
      assert.ok(monCols.some(c => c.name === 'spark_type'), 'Deve ter coluna spark_type');
      assert.ok(monCols.some(c => c.name === 'prioridade_tier'), 'Deve ter coluna prioridade_tier');

      const sigCols = db.prepare("PRAGMA table_info(sparks_signals)").all();
      assert.ok(sigCols.some(c => c.name === 'valor_monetario'), 'Deve ter coluna valor_monetario');
      assert.ok(sigCols.some(c => c.name === 'volume_m3h'), 'Deve ter coluna volume_m3h');
      assert.ok(sigCols.some(c => c.name === 'trigger_texto'), 'Deve ter coluna trigger_texto');
    });

    test('2. 6 Monitores canônicos criados com prioridade para Crédito BNDES e Outorgas ANA', () => {
      const monitors = SparksEngineService.listMonitors();
      assert.strictEqual(monitors.length, 6, 'Devem existir exatamente 6 monitores');

      const bndes = monitors.find(m => m.spark_type === 'CREDITO_BNDES');
      const ana = monitors.find(m => m.spark_type === 'OUTORGA_ANA');

      assert.ok(bndes, 'Monitor de Crédito BNDES deve existir');
      assert.strictEqual(bndes.prioridade_tier, 1, 'Crédito BNDES deve ser Tier 1 (Core Máquinas)');

      assert.ok(ana, 'Monitor de Outorgas ANA deve existir');
      assert.strictEqual(ana.prioridade_tier, 1, 'Outorgas ANA deve ser Tier 1 (Core Irrigação/Pivô)');
    });

    // ── TESTE 2: Disparo de Varredura e Ingestão de Feeds Estruturados ──
    await testAsync('3. Execução de varredura do Spark de Crédito BNDES (Finame de Máquinas)', async () => {
      const res = await SparksEngineService.triggerMonitor('spark-credito-rural');
      assert.strictEqual(res.success, true);

      const signals = SparksEngineService.listSignals({ spark_type: 'CREDITO_BNDES' });
      assert.ok(signals.length >= 1, 'Deve conter ao menos 1 sinal do BNDES');
      const s = signals[0];
      assert.ok(s.valor_monetario >= 1000000, 'Finame deve registrar valores em milhões');
      assert.ok(s.trigger_texto.includes('Crédito') || s.trigger_texto.includes('Finame'));
      assert.ok(s.documento_identificado, 'Deve capturar CPF/CNPJ do beneficiário');
    });

    await testAsync('4. Execução de varredura do Spark de Outorgas de Água ANA (Pivô Central)', async () => {
      const res = await SparksEngineService.triggerMonitor('spark-outorgas-agua');
      assert.strictEqual(res.success, true);

      const signals = SparksEngineService.listSignals({ spark_type: 'OUTORGA_ANA' });
      assert.ok(signals.length >= 1);
      const s = signals[0];
      assert.ok(s.volume_m3h > 0, 'Outorga deve registrar vazão m³/h');
      assert.ok(s.trigger_texto.includes('Outorga') || s.trigger_texto.includes('Pivô'));
    });

    test('5. Agregação executiva de estatísticas (getAggregatedStats)', () => {
      const stats = SparksEngineService.getAggregatedStats();
      assert.ok(stats.total_sinais >= 2, 'Total de sinais deve ser >= 2');
      assert.ok(stats.volume_financeiro_rastreado > 0, 'Volume financeiro deve ser positivo');
      assert.ok(stats.volume_financeiro_formatado.includes('R$'), 'Volume formatado deve conter R$');
      assert.ok(stats.sinais_core_maquinas >= 2, 'Deve contabilizar sinais core');
    });

    // ── TESTE 3: Intent Scoring Integrado (Eixo 7) ──
    test('6. Cálculo de Intent Score com sinais de Sparks (+40 pts Crédito, +35 pts Outorga)', () => {
      const mockLead = {
        sparks_signals: [
          { spark_type: 'CREDITO_BNDES', trigger_texto: '💰 Crédito BNDES Finame Liberado' },
          { spark_type: 'OUTORGA_ANA', trigger_texto: '💧 Demanda Iminente de Pivô Central' }
        ]
      };

      const result = calculateRuralIntentScore(mockLead, {});
      assert.ok(result.intent_score >= 75, `Score deve ser >= 75: ${result.intent_score}`);
      assert.strictEqual(result.intent_classification, 'HOT', 'Lead com crédito + outorga deve ser HOT');
      assert.ok(result.intent_triggers.some(t => t.includes('Crédito')), 'Deve conter trigger de crédito');
      assert.ok(result.intent_triggers.some(t => t.includes('Pivô') || t.includes('Outorga')), 'Deve conter trigger de outorga');
    });

    // ── TESTE 4: Endpoints REST ──
    await testAsync('7. Endpoint REST GET /api/sparks/monitors retorna 200', async () => {
      const res = await fetch(`${BASE_URL}/api/sparks/monitors`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 6);
    });

    await testAsync('8. Endpoint REST GET /api/sparks/signals com filtro spark_type', async () => {
      const res = await fetch(`${BASE_URL}/api/sparks/signals?spark_type=CREDITO_BNDES`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.data.every(s => s.spark_type === 'CREDITO_BNDES'));
    });

    await testAsync('9. Endpoint REST GET /api/sparks/stats retorna métricas executivas', async () => {
      const res = await fetch(`${BASE_URL}/api/sparks/stats`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.data.volume_financeiro_rastreado >= 0);
      assert.ok(json.data.monitores_ativos === 6);
    });

    await testAsync('10. Endpoint REST POST /api/sparks/monitors/:id/trigger executa varredura manual', async () => {
      const res = await fetch(`${BASE_URL}/api/sparks/monitors/spark-outorgas-agua/trigger`, {
        method: 'POST'
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.spark_type, 'OUTORGA_ANA');
    });

    // ── TESTE 5: Blindagem dos 3 Cuidados Críticos ──
    test('11. Cuidado 1 (Foco Core): Monitores Tier 1 são estritamente BNDES e ANA', () => {
      const tier1Monitors = db.prepare("SELECT spark_type FROM sparks_monitors WHERE prioridade_tier = 1").all();
      const types = tier1Monitors.map(m => m.spark_type);
      assert.ok(types.includes('CREDITO_BNDES'), 'BNDES deve ser Tier 1');
      assert.ok(types.includes('OUTORGA_ANA'), 'ANA deve ser Tier 1');
      assert.strictEqual(tier1Monitors.length, 2, 'Apenas BNDES e ANA devem ser Tier 1');
    });

    test('12. Cuidado 2 (Blindagem de Fases): Fases 62 e 63 100% intactas no index.html', () => {
      const indexHtml = fs.readFileSync(path.resolve('client/index.html'), 'utf-8');
      assert.ok(indexHtml.includes('ruralSefazPfBlock'), 'Bloco da FASE 62 (ruralSefazPfBlock) deve permanecer no index.html');
      assert.ok(indexHtml.includes('ruralMachineryFleetBlock'), 'Bloco da FASE 63 (ruralMachineryFleetBlock) deve permanecer no index.html');
    });

    test('13. Cuidado 3 (Clean UI): Aba Radar Sparks presente e mapa sem entulho', () => {
      const indexHtml = fs.readFileSync(path.resolve('client/index.html'), 'utf-8');
      assert.ok(indexHtml.includes('tabViewSparks'), 'Botão tabViewSparks deve estar presente no index.html');
      assert.ok(indexHtml.includes('paneSparks'), 'Section paneSparks deve estar presente no index.html');
      assert.ok(indexHtml.includes('sparksRadar.js'), 'Script sparksRadar.js deve estar incluído');
    });

    console.log(`\n==================================================================`);
    console.log(`🏁 RESULTADO: ${passed}/${total} TESTES APROVADOS (${Math.round((passed/total)*100)}%)`);
    console.log(`==================================================================\n`);

  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('❌ Erro fatal na suíte VERSUS Sparks:', err);
  process.exit(1);
});
