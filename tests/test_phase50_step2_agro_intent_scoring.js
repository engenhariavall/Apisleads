/**
 * SUÍTE DE TESTES: FASE 50 - ETAPA 2
 * Aprimoramento do Motor de Intenção Agro (Scoring & Visual no Right Drawer)
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SAFRA_TRIGGER = '🌱 Ciclo de Safra Detectado - Alta propensão para maquinário pesado, defensivos e insumos.';
const PASTO_TRIGGER = '🌿 Manejo de Pastagem Detectado - Potencial para correção de solo, cercamento e insumos veterinários.';

async function runTestSuite() {
  console.log('\n=============================================================');
  console.log('🧪 INICIANDO TESTES: FASE 50 - ETAPA 2 (MOTOR DE INTENÇÃO AGRO)');
  console.log('=============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   ${err.message}`);
    }
  }

  // Importa os serviços do backend
  const { calculateRuralIntentScore } = await import('../server/src/services/intentScoringService.js');
  const db = (await import('../server/src/config/database.js')).default;
  const { reverseGeocodeRuralProperty } = await import('../server/src/services/geoFundiarioService.js');

  // TESTE 1: Soja injeta +35 pontos e trigger exata de Ciclo de Safra
  await test('1. Soja detectada adiciona +35 pontos e trigger de Ciclo de Safra', async () => {
    const titular = { nome: 'Produtor Teste Soja' };
    const propSemAgro = { status_geo: 'CERTIFICADO' };
    const resSemAgro = calculateRuralIntentScore(titular, propSemAgro);

    const propComSoja = {
      status_geo: 'CERTIFICADO',
      dados_agronomicos: {
        crop_type: 'Soja',
        confidence: 0.95
      }
    };
    const resComSoja = calculateRuralIntentScore(titular, propComSoja);

    assert.strictEqual(
      resComSoja.intent_score, 
      resSemAgro.intent_score + 35, 
      `Deveria aumentar exatamente 35 pontos. Sem soja: ${resSemAgro.intent_score}, com soja: ${resComSoja.intent_score}`
    );
    assert.ok(
      resComSoja.intent_triggers.includes(SAFRA_TRIGGER),
      `Lista de triggers deve conter a string exata do Ciclo de Safra: "${SAFRA_TRIGGER}"`
    );
  });

  // TESTE 2: Milho injeta +35 pontos e trigger de Ciclo de Safra
  await test('2. Milho detectado adiciona +35 pontos e trigger de Ciclo de Safra', async () => {
    const titular = { nome: 'Produtor Teste Milho' };
    const propComMilho = {
      status_geo: 'CERTIFICADO',
      dados_agronomicos: {
        crop_type: 'Milho Safrinha',
        confidence: 0.91
      }
    };
    const res = calculateRuralIntentScore(titular, propComMilho);

    assert.strictEqual(res.intent_score, 35, 'Score inicial deve ser 35 pontos');
    assert.ok(res.intent_triggers.includes(SAFRA_TRIGGER), 'Deve conter trigger de Safra para Milho');
  });

  // TESTE 3: Pastagem injeta +20 pontos e trigger de Manejo de Pastagem
  await test('3. Pastagem detectada adiciona +20 pontos e trigger de Manejo de Pastagem', async () => {
    const titular = { nome: 'Pecuarista Teste Pasto' };
    const propComPasto = {
      status_geo: 'CERTIFICADO',
      dados_agronomicos: {
        crop_type: 'Pastagem Cultivada',
        confidence: 0.88
      }
    };
    const res = calculateRuralIntentScore(titular, propComPasto);

    assert.strictEqual(res.intent_score, 20, 'Score deve ser exatamente 20 pontos');
    assert.ok(
      res.intent_triggers.includes(PASTO_TRIGGER),
      `Lista de triggers deve conter a string exata de Manejo de Pastagem: "${PASTO_TRIGGER}"`
    );
  });

  // TESTE 4: Pecuária / Pasto como variação semântica injeta +20 pontos
  await test('4. Variações semânticas de pecuária/pasto injetam +20 pontos', async () => {
    const titular = { nome: 'Fazenda Gado de Corte' };
    const propComPecuaria = {
      status_geo: 'CERTIFICADO',
      dados_agronomicos: {
        crop_type: 'Pecuária / Pastagem',
        confidence: 0.82
      }
    };
    const res = calculateRuralIntentScore(titular, propComPecuaria);

    assert.strictEqual(res.intent_score, 20, 'Score deve somar +20 pontos para pecuária');
    assert.ok(res.intent_triggers.includes(PASTO_TRIGGER));
  });

  // TESTE 5: Propriedade sem dados agronômicos mantém pontuação neutra
  await test('5. Ausência de dados agronômicos mantém pontuação neutra (sem bônus de cultura)', async () => {
    const titular = { nome: 'Produtor Sem Agro' };
    const prop = {
      status_geo: 'CERTIFICADO',
      dados_agronomicos: null
    };
    const res = calculateRuralIntentScore(titular, prop);

    assert.strictEqual(res.intent_score, 0, 'Score deve ser 0 para certificado sem outros eixos');
    assert.strictEqual(res.intent_triggers.length, 0, 'Não deve gerar nenhum trigger de safra ou pasto');
  });

  // TESTE 6: Suporte defensivo a dados_agronomicos serializado como string JSON
  await test('6. Suporte defensivo a dados_agronomicos serializado como string JSON', async () => {
    const titular = { nome: 'Produtor String JSON' };
    const prop = {
      status_geo: 'SEM_GEO', // +30 pontos
      dados_agronomicos: JSON.stringify({ crop_type: 'Soja / Milho', confidence: 0.94 }) // +35 pontos
    };
    const res = calculateRuralIntentScore(titular, prop);

    assert.strictEqual(res.intent_score, 65, 'Deve somar 30 (Sem Geo) + 35 (Soja) = 65 pontos');
    assert.strictEqual(res.intent_classification, 'WARM', '65 pontos deve ser classificado como WARM');
    assert.ok(res.intent_triggers.includes(SAFRA_TRIGGER));
    assert.ok(res.intent_triggers.includes('Gap Fundiário Detectado'));
  });

  // TESTE 7: Integração de banco de dados e Reverse-Geocode com Soja e Scoring
  await test('7. Reverse-Geocode em fazenda de Soja eleva score e persiste trigger de safra', async () => {
    // Insere ou atualiza propriedade de teste em Sorriso/MT
    const testSigef = 'TEST-SIGEF-SOJA-FASE50';
    const existingTenant = db.prepare('SELECT id FROM tenants LIMIT 1').get();
    const tenantId = existingTenant ? existingTenant.id : 'tenant-root-default';

    // Cria polígono de teste ao redor de lat -12.54, lng -55.72
    const testPolygon = {
      type: 'Polygon',
      coordinates: [[
        [-55.73, -12.53],
        [-55.71, -12.53],
        [-55.71, -12.55],
        [-55.73, -12.55],
        [-55.73, -12.53]
      ]]
    };

    const agroSoja = {
      crop_type: 'Soja',
      confidence: 0.96,
      biome: 'Cerrado',
      last_update: '2026-03'
    };

    const scored = calculateRuralIntentScore(
      { nome: 'Produtor Agro MT' },
      { status_geo: 'CERTIFICADO', dados_agronomicos: agroSoja }
    );

    // Salva no SQLite
    db.prepare(`
      INSERT OR REPLACE INTO propriedades_rurais (
        id, tenant_id, id_sigef, nome_imovel, nome_titular, municipio, uf, area_hectares,
        status_geo, geometria_poligono, centroide_lat, centroide_lng,
        dados_agronomicos, intent_score, intent_classification, intent_triggers,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run(
      'prop-test-soja-fase50',
      tenantId,
      testSigef,
      'Fazenda Soja Ouro MT',
      'Produtor Agro MT',
      'SORRISO',
      'MT',
      1200,
      'CERTIFICADO',
      JSON.stringify(testPolygon),
      -12.54,
      -55.72,
      JSON.stringify(agroSoja),
      scored.intent_score,
      scored.intent_classification,
      JSON.stringify(scored.intent_triggers)
    );

    // Executa reverse-geocode no ponto interno (-12.54, -55.72)
    const found = await reverseGeocodeRuralProperty(-12.54, -55.72, tenantId);

    assert.ok(found, 'Propriedade deve ser encontrada pelo Point-in-Polygon');
    assert.strictEqual(found.id_sigef, testSigef);
    assert.strictEqual(found.intent_score, 35, 'Score deve ser 35 pontos devido à Soja');
    
    let triggers = [];
    try {
      triggers = typeof found.intent_triggers === 'string' 
        ? JSON.parse(found.intent_triggers) 
        : found.intent_triggers;
    } catch (_) {}

    assert.ok(triggers.includes(SAFRA_TRIGGER), 'Propriedade persistida deve ter a trigger de safra');

    // Limpeza da linha de teste temporária
    db.prepare('DELETE FROM propriedades_rurais WHERE id = ?').run('prop-test-soja-fase50');
  });

  // TESTE 8: Validação de Código no Frontend (app.js)
  await test('8. Frontend app.js implementa renderRuralTriggersUI e hierarquia visual B2B', async () => {
    const appJsPath = path.join(projectRoot, 'client', 'js', 'app.js');
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');

    assert.ok(appJsContent.includes('renderRuralTriggersUI'), 'app.js deve conter renderRuralTriggersUI');
    assert.ok(appJsContent.includes('Ciclo de Safra Detectado'), 'app.js deve tratar Ciclo de Safra');
    assert.ok(appJsContent.includes('Manejo de Pastagem Detectado'), 'app.js deve tratar Manejo de Pastagem');
    assert.ok(appJsContent.includes('+35 pts'), 'app.js deve exibir badge de pontuação +35 pts para safra');
    assert.ok(appJsContent.includes('+20 pts'), 'app.js deve exibir badge de pontuação +20 pts para pastagem');
    assert.ok(appJsContent.includes('ruralTriggersList'), 'app.js deve manipular ruralTriggersList');
    assert.ok(appJsContent.includes('ruralScorePill'), 'app.js deve manipular ruralScorePill');
  });

  console.log('\n-------------------------------------------------------------');
  console.log(`📊 RESULTADO FINAL: ${passed}/${total} TESTES APROVADOS (${Math.round((passed / total) * 100)}%)`);
  console.log('-------------------------------------------------------------\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Erro fatal na execução da suíte:', err);
  process.exit(1);
});
