/**
 * test_phase3_zero_hesitation.js
 * Validação de Engenharia da FASE 3: Refinamento de Zero Hesitação e Parser Paramétrico Cirúrgico
 * 
 * Testa 10 comandos táticos de operadores: em 100% dos casos a action é disparada
 * no primeiro turno com extração cirúrgica de parâmetros e zero hesitação.
 */

import assert from 'assert';
import { aiCopilotService } from '../server/src/services/aiCopilotService.js';

console.log('=============================================================');
console.log('🧪 TESTES DA FASE 3: ZERO HESITAÇÃO & PARSER CIRÚRGICO (10 COMANDOS)');
console.log('=============================================================\n');

let passedTests = 0;
let totalTests = 0;

async function runTestCase(index, name, prompt, expectedAction, validatePayload) {
  totalTests++;
  try {
    const res = await aiCopilotService.executeLocalRuleFallback(prompt, { properties: [] });

    // 1. Deve retornar sucesso
    assert.strictEqual(res.success, true, 'Deveria retornar sucesso');

    // 2. Deve disparar a action esperada no primeiro turno
    assert.strictEqual(res.action, expectedAction, `Deveria disparar action ${expectedAction}`);

    // 3. Regra de Zero Hesitação: texto não pode conter perguntas passivas de confirmação
    const replyLower = res.reply.toLowerCase();
    const hesitationPhrases = [
      'deseja que eu',
      'posso aplicar',
      'posso filtrar',
      'quer que eu',
      'gostaria que eu',
      'você gostaria',
      'deseja filtrar'
    ];
    for (const phrase of hesitationPhrases) {
      assert(!replyLower.includes(phrase), `Resposta não deve conter hesitação passiva: "${phrase}"`);
    }

    // 4. Validação customizada do payload
    if (typeof validatePayload === 'function') {
      validatePayload(res.action_payload || {});
    }

    console.log(`✅ [PASS] Comando ${index}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] Comando ${index}: ${name}`);
    console.error(err.message);
  }
}

async function runAll() {
  // 1. Comando: "Mostre fazendas no RS"
  await runTestCase(
    1,
    'Sub-parâmetro parcial: "Mostre fazendas no RS"',
    'Mostre fazendas no RS',
    'trigger_filter_agro',
    (p) => {
      assert.strictEqual(p.uf, 'RS');
    }
  );

  // 2. Comando: "Filtrar milho safrinha com score > 70"
  await runTestCase(
    2,
    'Sinônimo safrinha + score: "Filtrar milho safrinha com score > 70"',
    'Filtrar milho safrinha com score > 70',
    'trigger_filter_agro',
    (p) => {
      assert.strictEqual(p.cultura, 'Milho');
      assert.strictEqual(p.score_minimo, 70);
      assert.strictEqual(p.classificacao_intencao, 'HOT');
    }
  );

  // 3. Comando: "Quais fazendas têm passivo ambiental no MT?"
  await runTestCase(
    3,
    'Filtro ambiental: "Quais fazendas têm passivo ambiental no MT?"',
    'Quais fazendas têm passivo ambiental no MT?',
    'trigger_car_filter',
    (p) => {
      assert.strictEqual(p.uf, 'MT');
      assert.strictEqual(p.status_car, 'TODOS_PENDENTES');
    }
  );

  // 4. Comando: "Exibir fazendas de gado de corte em Passo Fundo"
  await runTestCase(
    4,
    'Sinônimo pecuária + cidade: "Exibir fazendas de gado de corte em Passo Fundo"',
    'Exibir fazendas de gado de corte em Passo Fundo',
    'trigger_filter_agro',
    (p) => {
      assert.strictEqual(p.cultura, 'Pastagem');
      assert.strictEqual(p.municipio, 'Passo Fundo');
      assert.strictEqual(p.uf, 'RS');
    }
  );

  // 5. Comando: "Isolar lavoura de soja em Sorriso com score acima de 80"
  await runTestCase(
    5,
    'Cultura + município + score: "Isolar lavoura de soja em Sorriso com score acima de 80"',
    'Isolar lavoura de soja em Sorriso com score acima de 80',
    'trigger_filter_agro',
    (p) => {
      assert.strictEqual(p.cultura, 'Soja');
      assert.strictEqual(p.municipio, 'Sorriso');
      assert.strictEqual(p.uf, 'MT');
      assert.strictEqual(p.score_minimo, 80);
    }
  );

  // 6. Comando: "Filtrar produtores de algodão na Bahia"
  await runTestCase(
    6,
    'Cultura algodão + UF BA: "Filtrar produtores de algodão na BA"',
    'Filtrar produtores de algodão na BA',
    'trigger_filter_agro',
    (p) => {
      assert.strictEqual(p.cultura, 'Algodão');
      assert.strictEqual(p.uf, 'BA');
    }
  );

  // 7. Comando: "Buscar fazendas de café em MG com WhatsApp"
  await runTestCase(
    7,
    'Café + UF MG + WhatsApp: "Buscar fazendas de café em MG com WhatsApp"',
    'Buscar fazendas de café em MG com WhatsApp',
    'trigger_filter_agro',
    (p) => {
      assert.strictEqual(p.cultura, 'Café');
      assert.strictEqual(p.uf, 'MG');
      assert.strictEqual(p.apenas_whatsapp, true);
    }
  );

  // 8. Comando: "Mostrar propriedades com CAR suspenso em GO"
  await runTestCase(
    8,
    'CAR status específico: "Mostrar propriedades com CAR suspenso em GO"',
    'Mostrar propriedades com CAR suspenso em GO',
    'trigger_car_filter',
    (p) => {
      assert.strictEqual(p.uf, 'GO');
      assert.strictEqual(p.status_car, 'SUSPENSO');
    }
  );

  // 9. Comando: "Filtrar produtores de cana-de-açúcar em SP"
  await runTestCase(
    9,
    'Cana-de-açúcar + UF SP: "Filtrar produtores de cana-de-açúcar em SP"',
    'Filtrar produtores de cana-de-açúcar em SP',
    'trigger_filter_agro',
    (p) => {
      assert.strictEqual(p.cultura, 'Cana-de-açúcar');
      assert.strictEqual(p.uf, 'SP');
    }
  );

  // 10. Comando: "Exportar planilha para Meta Ads das fazendas em memória"
  await runTestCase(
    10,
    'Exportação Meta Ads: "Exportar planilha para Meta Ads das fazendas em memória"',
    'Exportar planilha para Meta Ads das fazendas em memória',
    'trigger_export_meta_ads',
    (p) => {
      assert(p.count !== undefined, 'Payload deve conter contagem de propriedades');
    }
  );

  console.log('\n-------------------------------------------------------------');
  console.log(`📊 RESULTADO FASE 3: ${passedTests}/${totalTests} COMANDOS APROVADOS (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('-------------------------------------------------------------\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAll();
