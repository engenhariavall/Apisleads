import db from './server/src/config/database.js';
import { getDemographicAnalysis } from './server/src/modules/intelligence/demographicsEngine.js';

console.log('🧪 Iniciando Bateria de Testes da Fase 19 (Macrodados Demográficos & POF)...\n');

let failed = 0;
let passed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${message}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${message}`);
  }
}

try {
  console.log('--- Testes de Banco de Dados e Seed ---');
  
  const countRow = db.prepare('SELECT COUNT(*) as total FROM municipal_indicators').get();
  assert(countRow.total > 0, `Tabela municipal_indicators preenchida (Total: ${countRow.total})`);

  const sp = db.prepare(`SELECT * FROM municipal_indicators WHERE uf = 'SP' AND municipio = 'SAO PAULO'`).get();
  assert(sp !== undefined, 'Encontrou o município de SÃO PAULO');
  assert(sp.frota_total === 7500000, 'Frota total de SP está correta');
  
  const consumoJson = JSON.parse(sp.consumo_setorial_json);
  assert(consumoJson.alimentacao_gastronomia === 850, 'Consumo setor alimentação de SP correto');

  console.log('\n--- Testes do Motor de Inteligência Demográfica ---');

  // Teste 1: Município existente com vertical Agro
  const rioVerde = getDemographicAnalysis('Rio Verde', 'GO', 'AGRO');
  assert(rioVerde.status === 'SUCCESS', 'Conseguiu analisar Rio Verde - GO');
  assert(rioVerde.populacao === 242200, 'População correta');
  assert(rioVerde.target_sector === 'agro_insumos', 'Setor alvo mapeado para agro_insumos');
  assert(rioVerde.consumo_mensal_per_capita_setor === 900, 'Consumo mensal per capita agro de Rio Verde = 900');
  
  // Market size = pop * consumo * 12
  const expectedMarketSize = 242200 * 900 * 12; // 2.615.760.000
  assert(rioVerde.market_size_estimation_brl === expectedMarketSize, 'Market size calculado corretamente: ' + rioVerde.market_size_estimation_brl);
  assert(rioVerde.classification === 'ALTO_CONSUMO', 'Classificação de alto consumo');

  // Teste 2: Município existente com vertical Saude
  const patosDeMinas = getDemographicAnalysis('uberlandia', 'mg', 'SAUDE');
  assert(patosDeMinas.status === 'SUCCESS', 'Análise case-insensitive funcionou para Uberlandia - MG');
  assert(patosDeMinas.target_sector === 'saude_medicamentos', 'Setor alvo mapeado para saude_medicamentos');
  
  // Teste 3: Município inexistente (Fallback)
  const neverland = getDemographicAnalysis('Neverland', 'SP', 'AGRO');
  assert(neverland.status === 'NOT_FOUND', 'Município inexistente tratou como NOT_FOUND');
  assert(neverland.market_size_estimation_brl === 0, 'Market size 0 para fallback');
  assert(neverland.classification === 'CONSUMO_RESTRITO', 'Classificação restrita para fallback');

  console.log('\n--- Testes de Indicadores de Nicho (Subetapa 19.3) ---');
  const { getSectoralNicheMetrics } = await import('./server/src/modules/intelligence/demographicsEngine.js');
  
  const agroNiche = getSectoralNicheMetrics('Rio Verde', 'GO', 'AGRO');
  assert(agroNiche !== null, 'Retornou métricas de nicho para Rio Verde (AGRO)');
  assert(agroNiche.metrics.frota_caminhoes_tratores !== undefined, 'Métrica frota_caminhoes_tratores existe');
  assert(agroNiche.diagnostic !== '', 'Diagnóstico foi gerado');

  const saudeNiche = getSectoralNicheMetrics('uberlandia', 'mg', 'SAUDE');
  assert(saudeNiche !== null, 'Retornou métricas de nicho para Uberlândia (SAUDE)');
  assert(saudeNiche.metrics.leitos_totais !== undefined, 'Métrica leitos_totais existe');

  console.log('\n--- Testes da API WebGIS (Subetapa 19.2) ---');

  // Fazemos um require do servidor express e testamos via supertest se estiver disponível, 
  // mas como os testes legados geralmente não rodam o servidor, vamos testar o Controller diretamente
  const { getMunicipalPotentialLayer } = await import('./server/src/controllers/macroController.js');

  const reqMock = { query: { vertical: 'SAUDE' } };
  let jsonResponse = null;
  const resMock = {
    status: (code) => resMock,
    json: (data) => { jsonResponse = data; return data; }
  };

  getMunicipalPotentialLayer(reqMock, resMock);

  assert(jsonResponse !== null, 'getMunicipalPotentialLayer retornou resposta');
  assert(jsonResponse.type === 'FeatureCollection', 'Resposta é um FeatureCollection');
  assert(Array.isArray(jsonResponse.features), 'Possui array de features');
  
  const spFeature = jsonResponse.features.find(f => f.properties.municipio === 'SAO PAULO');
  // Se houver SAO PAULO na base de leads com coordenadas (ou pelo fallback)
  if (spFeature) {
    assert(spFeature.properties.municipio === 'SAO PAULO', 'Feature de SAO PAULO encontrada');
    assert(spFeature.properties.consumo_anual_estimado > 0, 'Consumo estimado > 0');
    assert(spFeature.geometry.coordinates.length === 2, 'Coordinates array length = 2');
    assert(spFeature.properties.target_sector === 'saude_medicamentos', 'Setor alvo = saude_medicamentos (via req.query.vertical)');
  }

  console.log('\n========================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed}/${passed + failed} TESTES DA FASE 19 PASSARAM COM SUCESSO!`);
  } else {
    console.log(`⚠️ ${failed} testes falharam.`);
    process.exit(1);
  }
} catch (err) {
  console.error('\n❌ ERRO FATAL DURANTE OS TESTES:', err);
  process.exit(1);
}
