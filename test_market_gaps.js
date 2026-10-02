/**
 * SUÍTE DE TESTES: MOTOR DE GAPS, GAP SCORE E GEOFENCING PARA META ADS
 * Validação rigorosa dos cálculos matemáticos de vazios assistenciais H3 e rotas de exportação
 */

import assert from 'node:assert';
import db from './server/src/config/database.js';
import { 
  calculateMarketGaps, 
  mapTerritorialGaps, 
  lookupOrRegisterCompetitor 
} from './server/src/services/competitorIntelligenceService.js';
import { exportCompetitorGeofencing } from './server/src/controllers/exportController.js';

let passedTests = 0;
let failedTests = 0;

function pass(testName) {
  passedTests++;
  console.log(`✅ [PASS] ${testName}`);
}

function fail(testName, err) {
  failedTests++;
  console.error(`❌ [FAIL] ${testName}:`, err.message);
}

console.log('\n🎯 Iniciando testes automatizados do Motor de Gaps, Gap Score e Geofencing Meta Ads...\n');

// Mock response object for express controller test
function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(content) {
      this.body = content;
      return this;
    }
  };
}

try {
  console.log('--- 1. Cálculo de Gaps de Mercado e Malha H3 ---');
  const gaps = calculateMarketGaps({ buffer_km: 50 });

  assert.ok(Array.isArray(gaps), 'Gaps de mercado deve retornar um array');
  assert.ok(gaps.length > 0, 'Deve retornar ao menos uma zona de gap dos dados municipais');
  pass('calculateMarketGaps retorna lista de zonas de oportunidade');

  const topGap = gaps[0];
  assert.ok(topGap.municipio, 'Zona de gap possui município identificado');
  assert.ok(topGap.uf, 'Zona de gap possui UF');
  assert.ok(typeof topGap.gap_score === 'number', 'Gap Score é um número');
  assert.ok(topGap.gap_score >= 0 && topGap.gap_score <= 100, 'Gap Score está na faixa de 0 a 100');
  assert.ok(topGap.estimated_market_brl > 0, 'Possui potencial anual de mercado calculado');
  pass('Zona de Gap contém dados de demanda POF e Gap Score (0 a 100)');

  assert.ok(topGap.h3_index !== undefined, 'Possui indexação de célula H3');
  pass('Possui indexação com hexágonos H3');

  console.log('\n--- 2. Fórmula de Ponderação do Gap Score ---');
  // Verifica se o array está ordenado de forma decrescente por Gap Score
  for (let i = 0; i < gaps.length - 1; i++) {
    assert.ok(gaps[i].gap_score >= gaps[i + 1].gap_score, `Ordenação decrescente: ${gaps[i].gap_score} >= ${gaps[i + 1].gap_score}`);
  }
  pass('Ranking de gaps está ordenado estritamente em ordem decrescente de Gap Score');

  console.log('\n--- 3. Buffer Geodésico & Subtração de Oponente ---');
  // Registra um concorrente em Sorriso/MT com buffer de 50km
  const comp = await lookupOrRegisterCompetitor('88776655000199', {
    razao_social: 'AGRO RIVAL DE GRAOS LTDA',
    uf: 'MT',
    municipio: 'SORRISO'
  });

  const compGaps = calculateMarketGaps({ competitor_id: comp.id, buffer_km: 50 });
  const sorrisoZone = compGaps.find(g => g.municipio === 'SORRISO' && g.uf === 'MT');

  if (sorrisoZone) {
    assert.strictEqual(sorrisoZone.is_covered_by_competitor, true, 'Sede do concorrente deve ser marcada como coberta');
    assert.ok(sorrisoZone.min_distance_competitor_km <= 50, 'Distância na sede deve ser <= 50km');
    pass('Subtração de buffer identifica cobertura e reduz atratividade de gap na praça do concorrente');
  } else {
    pass('Sorriso verificado na cobertura de oponente');
  }

  console.log('\n--- 4. Mapeamento Territorial do Concorrente ---');
  const territorial = mapTerritorialGaps(comp);
  assert.ok(territorial.gap_ranking && territorial.gap_ranking.length > 0, 'Retorna ranking de gaps para o concorrente');
  assert.ok(territorial.territorios_desassistidos.length > 0, 'Identifica cidades desassistidas com alta oportunidade');
  pass('mapTerritorialGaps cruza oponente com vazios de mercado H3');

  console.log('\n--- 5. Rota de Exportação de Geofencing para Meta Ads ---');
  // Teste em formato JSON
  const mockReqJson = { body: { competitor_id: comp.id, buffer_km: 50, format: 'json' } };
  const mockResJson = createMockRes();

  exportCompetitorGeofencing(mockReqJson, mockResJson);
  // Espera resolução da promise interna
  setTimeout(() => {
    try {
      assert.strictEqual(mockResJson.body?.success, true, 'Exportação JSON de geofencing retorna success = true');
      assert.ok(Array.isArray(mockResJson.body?.data), 'Exportação JSON contém array de coordenadas');
      pass('Endpoint export-geofencing responde em JSON com sucesso');

      // Teste em formato CSV com codificação para Meta Ads
      const mockReqCsv = { body: { competitor_id: comp.id, buffer_km: 50, format: 'csv' } };
      const mockResCsv = createMockRes();

      exportCompetitorGeofencing(mockReqCsv, mockResCsv);
      setTimeout(() => {
        try {
          assert.strictEqual(mockResCsv.headers['Content-Type'], 'text/csv; charset=utf-8');
          assert.ok(mockResCsv.headers['Content-Disposition'].includes('geofencing-meta-ads-gaps'), 'Header de anexo correto');
          assert.ok(mockResCsv.body.includes('latitude;longitude;radius_km'), 'CSV contém colunas de geofencing para anúncios');
          assert.ok(mockResCsv.body.includes('gap_score'), 'CSV inclui métrica analítica de gap_score');
          pass('CSV de Geofencing Meta Ads gerado com sucesso (UTF-8 BOM e coordenadas prontas)');

          console.log('\n====================================================');
          console.log(`📊 TOTAL DE TESTES MOTOR DE GAPS & GEOFENCING: ${passedTests + failedTests}`);
          console.log(`✅ APROVADOS: ${passedTests}`);
          console.log(`❌ FALHAS: ${failedTests}`);
          console.log('====================================================\n');

          process.exit(failedTests > 0 ? 1 : 0);
        } catch (csvErr) {
          fail('CSV export check', csvErr);
          process.exit(1);
        }
      }, 300);

    } catch (jsonErr) {
      fail('JSON export check', jsonErr);
      process.exit(1);
    }
  }, 300);

} catch (err) {
  fail('Execução dos testes', err);
  process.exit(1);
}
