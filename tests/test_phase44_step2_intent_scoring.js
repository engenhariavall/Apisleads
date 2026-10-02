/**
 * tests/test_phase44_step2_intent_scoring.js
 * 
 * FASES 44 E 45 - ETAPA 2: MOTOR DE INTENÇÃO DE COMPRA RURAL (INTENT SCORING)
 * 
 * Testes Unitários e de Integração:
 * 1. calculateRuralIntentScore com status_geo = 'SEM_GEO' (+30 pts, 'Gap Fundiário Detectado')
 * 2. calculateRuralIntentScore com nova_filial_recente = true (+40 pts, 'Expansão de Operação (< 12 meses)')
 * 3. calculateRuralIntentScore com aumento_capital_recente = true (+30 pts, 'Injeção de Capital/Crédito')
 * 4. Combinação Mandatória do Usuário: Proprietário "Sem Geo" (+30) e com "Nova Filial" (+40) = 70 pontos ('HOT')
 * 5. Combinação Máxima (Sem Geo + Filial + Capital) = 100 pontos ('HOT')
 * 6. Imóvel regularizado sem expansão e sem capital = 0 pontos ('COLD')
 * 7. Integração no Pipeline: Ao salvar propriedade no banco SQLite com saveOrUpdateRuralProperty, o intent_score é calculado dinamicamente e persistido com 70 pontos e classificação 'HOT'
 * 8. Rota REST POST /api/fundiario/calculate-intent responde com o score e triggers corretos
 * 9. Rota POST /api/fundiario/properties salva e retorna a propriedade classificada como HOT
 */

import db from '../server/src/config/database.js';
import { calculateRuralIntentScore } from '../server/src/services/intentScoringService.js';
import { saveOrUpdateRuralProperty, listRuralProperties } from '../server/src/services/geoFundiarioService.js';

const BASE_URL = 'http://localhost:3000';

async function run() {
  console.log('🚀 Iniciando bateria de testes da Fase 44 - Etapa 2 (Motor de Intenção de Compra Rural)...');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Teste Unitário: Apenas Dor Regulatória (SEM_GEO)
    console.log('\n--- 1. Teste Unitário: Dor Regulatória (+30) ---');
    const r1 = calculateRuralIntentScore({}, { status_geo: 'SEM_GEO' });
    assert(r1.intent_score === 30, `Score esperado: 30, obtido: ${r1.intent_score}`);
    assert(r1.intent_classification === 'WARM', `Classificação esperada: WARM, obtida: ${r1.intent_classification}`);
    assert(r1.intent_triggers.includes('Gap Fundiário Detectado'), 'Contém trigger "Gap Fundiário Detectado"');

    // 2. Teste Unitário: Apenas Expansão de Operação / Filial (< 12 meses)
    console.log('\n--- 2. Teste Unitário: Expansão de Filial (+40) ---');
    const r2 = calculateRuralIntentScore({ nova_filial_recente: true }, { status_geo: 'CERTIFICADO' });
    assert(r2.intent_score === 40, `Score esperado: 40, obtido: ${r2.intent_score}`);
    assert(r2.intent_classification === 'WARM', `Classificação esperada: WARM, obtida: ${r2.intent_classification}`);
    assert(r2.intent_triggers.includes('Expansão de Operação (< 12 meses)'), 'Contém trigger "Expansão de Operação (< 12 meses)"');

    // 3. Teste Unitário: Apenas Injeção de Capital / Crédito (+30)
    console.log('\n--- 3. Teste Unitário: Injeção de Capital (+30) ---');
    const r3 = calculateRuralIntentScore({ aumento_capital_recente: true }, { status_geo: 'CERTIFICADO' });
    assert(r3.intent_score === 30, `Score esperado: 30, obtido: ${r3.intent_score}`);
    assert(r3.intent_classification === 'WARM', `Classificação esperada: WARM, obtida: ${r3.intent_classification}`);
    assert(r3.intent_triggers.includes('Injeção de Capital/Crédito'), 'Contém trigger "Injeção de Capital/Crédito"');

    // 4. CENÁRIO CRÍTICO MANDATÓRIO: Proprietário "Sem Geo" (+30) + "Nova Filial" (+40)
    console.log('\n--- 4. Teste Crítico Mandatório: Sem Geo + Nova Filial (70 pts, HOT) ---');
    const r4 = calculateRuralIntentScore(
      { nova_filial_recente: true },
      { status_geo: 'SEM_GEO' }
    );
    assert(r4.intent_score === 70, `Score esperado: 70, obtido: ${r4.intent_score}`);
    assert(r4.intent_classification === 'HOT', `Classificação esperada: HOT, obtida: ${r4.intent_classification}`);
    assert(r4.intent_triggers.includes('Gap Fundiário Detectado'), 'Possui trigger regulatório');
    assert(r4.intent_triggers.includes('Expansão de Operação (< 12 meses)'), 'Possui trigger de filial recente');

    // 5. Teste de Combinação Máxima (30 + 40 + 30 = 100 pts)
    console.log('\n--- 5. Teste Combinação Máxima: Sem Geo + Filial + Capital (100 pts, HOT) ---');
    const r5 = calculateRuralIntentScore(
      { nova_filial_recente: true, aumento_capital_recente: true },
      { status_geo: 'SEM_GEO' }
    );
    assert(r5.intent_score === 100, `Score esperado: 100, obtido: ${r5.intent_score}`);
    assert(r5.intent_classification === 'HOT', `Classificação esperada: HOT, obtida: ${r5.intent_classification}`);
    assert(r5.intent_triggers.length === 3, 'Possui os 3 triggers analíticos ativos');

    // 6. Teste Imóvel Regular sem triggers (0 pts, COLD)
    console.log('\n--- 6. Teste Imóvel Regular (0 pts, COLD) ---');
    const r6 = calculateRuralIntentScore({}, { status_geo: 'CERTIFICADO' });
    assert(r6.intent_score === 0, `Score esperado: 0, obtido: ${r6.intent_score}`);
    assert(r6.intent_classification === 'COLD', `Classificação esperada: COLD, obtida: ${r6.intent_classification}`);
    assert(r6.intent_triggers.length === 0, 'Zero triggers');

    // 7. Teste de Integração no Pipeline com SQLite: Persistência Real
    console.log('\n--- 7. Integração no Pipeline: Persistência no SQLite com Score HOT (70 pts) ---');
    const testTenantId = `tenant-intent-test-${Date.now()}`;
    const testPropSigef = `SIGEF-TEST-HOT-${Date.now()}`;

    // Cadastra tenant temporário para satisfazer foreign key
    db.prepare(`
      INSERT INTO tenants (id, name, cnpj, status, plan)
      VALUES (?, 'Tenant Intent Test', '11.222.333/0001-44', 'ACTIVE', 'ENTERPRISE')
    `).run(testTenantId);

    const mockGeoJson = {
      type: 'Polygon',
      coordinates: [[
        [-55.70, -12.50],
        [-55.65, -12.50],
        [-55.65, -12.55],
        [-55.70, -12.55],
        [-55.70, -12.50]
      ]]
    };

    const savedProp = await saveOrUpdateRuralProperty({
      id_sigef: testPropSigef,
      codigo_imovel: 'MT-INTENT-HOT-99',
      nome_imovel: 'Fazenda Agro Oportunidade Hot',
      municipio: 'SORRISO',
      uf: 'MT',
      area_hectares: 3200.0,
      geometria_poligono: mockGeoJson,
      nome_titular: 'Produtor Rural Alvo Alta Intenção',
      cpf_cnpj_titular: '11.222.333/0001-44',
      status_geo: 'SEM_GEO', // +30
      titularData: { nova_filial_recente: true } // +40
    }, testTenantId);

    assert(savedProp.intent_score === 70, `Propriedade retornou intent_score 70 no salvamento (${savedProp.intent_score})`);
    assert(savedProp.intent_classification === 'HOT', `Propriedade retornou classificação HOT (${savedProp.intent_classification})`);

    // Validação direta no banco SQLite via SQL PRAGMA / SELECT
    const dbRow = db.prepare(`
      SELECT intent_score, intent_classification, intent_triggers, status_geo 
      FROM propriedades_rurais 
      WHERE id = ? AND tenant_id = ?
    `).get(savedProp.id, testTenantId);

    assert(dbRow && dbRow.intent_score === 70, `SQLite: intent_score é rigorosamente 70 no banco (${dbRow?.intent_score})`);
    assert(dbRow && dbRow.intent_classification === 'HOT', `SQLite: intent_classification é 'HOT' no banco (${dbRow?.intent_classification})`);
    assert(dbRow && dbRow.status_geo === 'SEM_GEO', `SQLite: status_geo é 'SEM_GEO'`);
    const dbTriggers = JSON.parse(dbRow.intent_triggers || '[]');
    assert(dbTriggers.includes('Gap Fundiário Detectado') && dbTriggers.includes('Expansão de Operação (< 12 meses)'), 'SQLite: Triggers persistidos corretamente como JSON');

    // 8. Teste de Endpoint REST: POST /api/fundiario/calculate-intent
    console.log('\n--- 8. Endpoint REST: POST /api/fundiario/calculate-intent ---');
    const apiCalcRes = await fetch(`${BASE_URL}/api/fundiario/calculate-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titularData: { nova_filial_recente: true },
        propriedadeData: { status_geo: 'SEM_GEO' }
      })
    });
    const apiCalcData = await apiCalcRes.json();
    assert(apiCalcRes.ok && apiCalcData.success, 'POST /api/fundiario/calculate-intent retornou 200 OK');
    assert(apiCalcData.intent_score === 70, `API: Score retornado é 70 (${apiCalcData.intent_score})`);
    assert(apiCalcData.intent_classification === 'HOT', `API: Classificação retornada é HOT (${apiCalcData.intent_classification})`);

    // 9. Teste de Endpoint REST: POST /api/fundiario/properties (Criação pontual com Scoring)
    console.log('\n--- 9. Endpoint REST: POST /api/fundiario/properties com Scoring ---');
    const apiCreateRes = await fetch(`${BASE_URL}/api/fundiario/properties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': testTenantId
      },
      body: JSON.stringify({
        id_sigef: `SIGEF-API-HOT-${Date.now()}`,
        nome_imovel: 'Fazenda API Hot Lead',
        municipio: 'RIO VERDE',
        uf: 'GO',
        area_hectares: 1500,
        geometria_poligono: mockGeoJson,
        nome_titular: 'Agropecuária Rio Verde S.A.',
        cpf_cnpj_titular: '22.333.444/0001-55',
        status_geo: 'SEM_GEO',
        titularData: { nova_filial_recente: true, aumento_capital_recente: true } // 30 + 40 + 30 = 100
      })
    });
    const apiCreateData = await apiCreateRes.json();
    assert(apiCreateRes.ok && apiCreateData.success, 'POST /api/fundiario/properties respondeu 201 Created');
    assert(apiCreateData.intent_score === 100, `API Create: Score retornado é 100 (${apiCreateData.intent_score})`);
    assert(apiCreateData.intent_classification === 'HOT', 'API Create: Classificação é HOT');

    // Limpeza do tenant temporário
    db.prepare("DELETE FROM propriedades_rurais WHERE tenant_id = ?").run(testTenantId);
    console.log(`\n🧹 Dados de teste temporários do tenant ${testTenantId} removidos.`);

  } catch (err) {
    console.error('❌ Erro inesperado na suíte da Fase 44 Etapa 2:', err);
    failed++;
  }

  console.log(`\n====================================================`);
  console.log(`📊 TOTAL DE TESTES DA FASE 44 (ETAPA 2): ${passed + failed}`);
  console.log(`✅ APROVADOS: ${passed}`);
  console.log(`❌ FALHAS: ${failed}`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
