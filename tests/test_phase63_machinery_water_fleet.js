/**
 * tests/test_phase63_machinery_water_fleet.js
 * 
 * FASE 63: VALIDAÇÃO DE INTELIGÊNCIA HIDROGRÁFICA, ÁREA ÚTIL DE LAVOURA
 * E DIMENSIONAMENTO DE FROTAS DE MAQUINÁRIO AGRÍCOLA COM PILOTO AUTOMÁTICO GPS
 */

import assert from 'assert';
import {
  calculateLandUsePartition,
  generateConsolidatedTalhoes,
  resolveHydrographicFeatures,
  calculateMachineryFleet,
  runMachineryAndHydroPipeline
} from '../server/src/services/machineryFleetEngine.js';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚜 [FASE 63] INICIANDO TESTES DO MOTOR DE MAQUINÁRIO, LAVOURA E HIDROGRAFIA...\n');
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

  // ── TESTE 1: Partição de Uso do Solo por Bioma Estadual ──
  test('Partição de Solo: Reserva Legal, APP Hídrica e Área Útil de Lavoura', () => {
    // RS (Pampa / Mata Atlântica): 20% Reserva, 7% APP -> 73% Lavoura Útil
    const rs = calculateLandUsePartition({ uf: 'RS', area_hectares: 1000 });
    assert.strictEqual(rs.area_total_ha, 1000);
    assert.strictEqual(rs.area_reserva_legal_ha, 200);
    assert.strictEqual(rs.area_app_ha, 70);
    assert.strictEqual(rs.area_lavoura_util_ha, 730);
    assert.strictEqual(rs.percentual_lavoura_util, 73);

    // MT (Cerrado / Amazônia Legal): 35% Reserva, 7% APP -> 58% Lavoura Útil
    const mt = calculateLandUsePartition({ uf: 'MT', area_hectares: 4000 });
    assert.strictEqual(mt.area_reserva_legal_ha, 1400);
    assert.strictEqual(mt.area_app_ha, 280);
    assert.strictEqual(mt.area_lavoura_util_ha, 2320);
    assert.strictEqual(mt.percentual_lavoura_util, 58);

    // PA (Amazônia Bioma Floresta): 80% Reserva, 8% APP -> 12% Lavoura Útil
    const pa = calculateLandUsePartition({ uf: 'PA', area_hectares: 10000 });
    assert.strictEqual(pa.area_reserva_legal_ha, 8000);
    assert.strictEqual(pa.area_app_ha, 800);
    assert.strictEqual(pa.area_lavoura_util_ha, 1200);
    assert.strictEqual(pa.percentual_lavoura_util, 12);

    // Propriedade com dados explícitos do CAR preserva as métricas
    const carCustom = calculateLandUsePartition({
      uf: 'GO',
      area_hectares: 1200,
      area_reserva_legal_ha: 250,
      area_app_ha: 80
    });
    assert.strictEqual(carCustom.area_reserva_legal_ha, 250);
    assert.strictEqual(carCustom.area_app_ha, 80);
    assert.strictEqual(carCustom.area_lavoura_util_ha, 870);
  });

  // ── TESTE 2: Geração de Talhões Consolidados ──
  test('Divisão agronômica em Talhões com Rotação Soja/Milho/Trigo', () => {
    const talhoes = generateConsolidatedTalhoes({
      codigo_car: 'RS-4314100-A98B012',
      municipio: 'Passo Fundo'
    }, 730);

    assert.ok(Array.isArray(talhoes), 'Deve ser array de talhões');
    assert.ok(talhoes.length >= 3 && talhoes.length <= 5, `Deveria ter 3 a 5 talhões, tem ${talhoes.length}`);

    const sumHa = talhoes.reduce((acc, t) => acc + t.area_ha, 0);
    assert.ok(Math.abs(sumHa - 730) < 1.0, `Soma dos talhões (${sumHa}) deve bater com a área útil (730 ha)`);

    talhoes.forEach(t => {
      assert.ok(t.nome.startsWith('Talhão'), `Nome incorreto: ${t.nome}`);
      assert.ok(t.cultura_safra_1, 'Deve possuir cultura da Safra 1');
      assert.ok(t.cultura_safra_2, 'Deve possuir cultura da Safra 2');
      assert.ok(t.relevo_topografia, 'Deve possuir relevo');
    });
  });

  // ── TESTE 3: Inteligência Hidrográfica & Aptidão para Pivô Central ──
  test('Inteligência Hidrográfica: Bacias, Rios e Aptidão para Pivôs de Irrigação', () => {
    // RS - Passo Fundo
    const hydroRS = resolveHydrographicFeatures({
      uf: 'RS',
      municipio: 'Passo Fundo',
      area_hectares: 850
    }, 620);

    assert.ok(hydroRS.presenca_recurso_hidrico);
    assert.ok(hydroRS.rio_principal_lindeiro, 'Deve possuir rio lindeiro');
    assert.ok(hydroRS.bacia_hidrografica.includes('Uruguai') || hydroRS.bacia_hidrografica.includes('Jacuí'));
    assert.ok(hydroRS.extensao_margem_hidrica_m > 500, `Margem deve ser > 500m: ${hydroRS.extensao_margem_hidrica_m}`);
    assert.ok(hydroRS.potencial_irrigacao_pivo.includes('ALTO POTENCIAL'), `Aptidão deve ser alta: ${hydroRS.potencial_irrigacao_pivo}`);
    assert.ok(hydroRS.pivos_centrais_capacidade >= 2);

    // MT - Sorriso
    const hydroMT = resolveHydrographicFeatures({
      uf: 'MT',
      municipio: 'Sorriso',
      area_hectares: 3500
    }, 2030);

    assert.ok(hydroMT.bacia_hidrografica.includes('Teles Pires') || hydroMT.bacia_hidrografica.includes('Tapajós'));
    assert.ok(hydroMT.pivos_centrais_capacidade >= 4);
  });

  // ── TESTE 4: Dimensionamento de Frotas de Maquinário Agrícola ──
  test('Dimensionamento Técnico de Frotas (Pequeno, Médio e Grande Porte)', () => {
    // Pequeno Porte: 120 ha úteis
    const fSmall = calculateMachineryFleet(120, 160);
    assert.strictEqual(fSmall.colheitadeiras.quantidade, 1);
    assert.strictEqual(fSmall.colheitadeiras.classe, 'Classe 5');
    assert.strictEqual(fSmall.tratores_alta_potencia.quantidade, 1);
    assert.strictEqual(fSmall.pulverizadores.quantidade, 1);
    assert.ok(fSmall.patrimonio_frota_total_estimado_rs > 3000000);

    // Médio Porte: 650 ha úteis
    const fMed = calculateMachineryFleet(650, 900);
    assert.strictEqual(fMed.colheitadeiras.quantidade, 2);
    assert.strictEqual(fMed.colheitadeiras.classe, 'Classe 7/8');
    assert.strictEqual(fMed.tratores_alta_potencia.quantidade, 2);
    assert.strictEqual(fMed.piloto_automatico_gps.propensao_compra_percentual, 98);
    assert.ok(fMed.piloto_automatico_gps.especificacao_recomendada.includes('RTK Centimétrico'));

    // Grande Porte / Mega-Lavoura: 3.200 ha úteis
    const fMega = calculateMachineryFleet(3200, 5500);
    assert.ok(fMega.colheitadeiras.quantidade >= 7, `Colheitadeiras mega: ${fMega.colheitadeiras.quantidade}`);
    assert.ok(fMega.colheitadeiras.classe.includes('Classe 9/10'));
    assert.ok(fMega.tratores_alta_potencia.quantidade >= 7);
    assert.ok(fMega.tratores_alta_potencia.modelo_referencia.includes('Articulados 4WD / Esteiras'));
    assert.ok(fMega.pulverizadores.quantidade >= 3);
    assert.ok(fMega.consumo_anual_insumos.soja_sementes_sacas >= 6000);
    assert.ok(fMega.consumo_anual_insumos.fertilizante_npk_toneladas >= 900);
    assert.ok(fMega.patrimonio_frota_total_estimado_rs > 30000000, `Patrimônio mega: ${fMega.patrimonio_frota_total_estimado_rs}`);
  });

  // ── TESTE 5: Pipeline Completo Local ──
  await testAsync('Execução Integrada do Pipeline de Maquinário e Hidrografia', async () => {
    const res = await runMachineryAndHydroPipeline({
      id: 'PROP-TEST-63',
      codigo_car: 'MT-5107925-B410AA99887',
      municipio: 'Sorriso',
      uf: 'MT',
      area_hectares: 2500
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.uso_solo.area_total_ha, 2500);
    assert.strictEqual(res.uso_solo.area_lavoura_util_ha, 1450);
    assert.ok(res.talhoes_consolidados.length >= 3);
    assert.ok(res.inteligencia_hidrografica.rio_principal_lindeiro);
    assert.ok(res.dimensionamento_frota.colheitadeiras.quantidade >= 3);
    assert.ok(res.dimensionamento_frota.patrimonio_frota_formatado.includes('R$'));
  });

  // ── TESTE 6: Endpoint REST POST /api/fundiario/machinery-fleet ──
  await testAsync('Endpoint REST POST /api/fundiario/machinery-fleet', async () => {
    const res = await fetch(`${BASE_URL}/api/fundiario/machinery-fleet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uf: 'RS',
        municipio: 'Sarandi',
        area_hectares: 1200,
        codigo_car: 'RS-4319307-F88190B'
      })
    });

    assert.strictEqual(res.status, 200, `Status HTTP deve ser 200: ${res.status}`);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.uso_solo);
    assert.strictEqual(json.data.uso_solo.area_lavoura_util_ha, 876);
    assert.ok(json.data.dimensionamento_frota.colheitadeiras);
    assert.ok(json.data.inteligencia_hidrografica.rio_principal_lindeiro);
    assert.ok(json.data.talhoes_consolidados.length >= 3);
  });

  // ── TESTE 7: Endpoint REST POST /api/fundiario/enrich-osint com Bloco FASE 63 ──
  await testAsync('Endpoint REST /api/fundiario/enrich-osint entrega Maquinário, Hidrografia e Solo', async () => {
    const res = await fetch(`${BASE_URL}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'MT-5107925-B410AA99887',
        municipio: 'Sorriso',
        uf: 'MT',
        area_hectares: 1500
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.dimensionamento_maquinario, 'Deve conter dimensionamento_maquinario');
    assert.ok(json.inteligencia_hidrografica, 'Deve conter inteligencia_hidrografica');
    assert.ok(json.uso_solo, 'Deve conter uso_solo');
    assert.ok(Array.isArray(json.talhoes_consolidados), 'Deve conter talhoes_consolidados');
    assert.ok(json.produtor_rural_pf, 'Deve manter produtor_rural_pf da FASE 62');
  });

  console.log(`\n==================================================`);
  console.log(`🏁 TESTES FASE 63 CONCLUÍDOS: ${passed}/${total} PASSARAM (${Math.round((passed/total)*100)}%)`);
  console.log(`==================================================\n`);

  if (passed < total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes FASE 63:', err);
  process.exit(1);
});
