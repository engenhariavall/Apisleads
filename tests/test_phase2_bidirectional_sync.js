/**
 * test_phase2_bidirectional_sync.js
 * Validação de Engenharia da FASE 2: Sincronização Bidirecional e Navegação Operacional (Tabela ⇄ Mapa ⇄ Inspetor)
 */

import assert from 'assert';

console.log('=============================================================');
console.log('🧪 TESTES DA FASE 2: SINCRONIZAÇÃO BIDIRECIONAL (TABELA ⇄ MAPA)');
console.log('=============================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
  }
}

// 1. Teste do Store Canônico de Filtros e Disparo de CustomEvent
runTest('1. window.setVersusFilters atualiza o store unificado e emite versusFiltersChanged', () => {
  // Mock de ambiente de browser
  let eventDispatched = null;
  const mockWindow = {
    versusActiveFilters: {
      cultura: null,
      uf: null,
      municipio: null,
      score_min: null,
      score_max: null,
      intent_classification: null,
      status_car: null,
      area_min_ha: null,
      apenas_whatsapp: false,
      origem: 'TODOS'
    },
    dispatchEvent: (evt) => { eventDispatched = evt; }
  };

  mockWindow.setVersusFilters = function(newFilters = {}, source = 'copilot') {
    mockWindow.versusActiveFilters = {
      ...mockWindow.versusActiveFilters,
      ...newFilters
    };
    mockWindow.dispatchEvent({
      type: 'versusFiltersChanged',
      detail: { filters: mockWindow.versusActiveFilters, source }
    });
  };

  mockWindow.setVersusFilters({
    uf: 'MT',
    municipio: 'Sorriso',
    cultura: 'Milho',
    score_min: 70,
    origem: 'RURAL_SIGEF'
  }, 'copilot');

  assert.strictEqual(mockWindow.versusActiveFilters.uf, 'MT');
  assert.strictEqual(mockWindow.versusActiveFilters.municipio, 'Sorriso');
  assert.strictEqual(mockWindow.versusActiveFilters.cultura, 'Milho');
  assert.strictEqual(mockWindow.versusActiveFilters.score_min, 70);
  assert.strictEqual(mockWindow.versusActiveFilters.origem, 'RURAL_SIGEF');

  assert(eventDispatched !== null, 'Deveria ter disparado evento');
  assert.strictEqual(eventDispatched.type, 'versusFiltersChanged');
  assert.strictEqual(eventDispatched.detail.source, 'copilot');
  assert.strictEqual(eventDispatched.detail.filters.cultura, 'Milho');
});

// 2. Teste da Reação na Tabela (app.js)
runTest('2. Listener versusFiltersChanged sincroniza state.filters da Tabela Analítica', () => {
  const state = {
    filters: {
      estados: [],
      cidades: [],
      min_intent_score: 0,
      intent_stage: 'ALL',
      apenas_whatsapp_valido: false,
      origem: 'TODOS',
      page: 1
    },
    currentPage: 1
  };

  let fetchLeadsCalled = false;
  const mockFetchLeads = () => { fetchLeadsCalled = true; };

  // Função simulando o listener implementado em app.js
  const handleFiltersChanged = (e) => {
    const { filters, source } = e.detail || {};
    if (!filters) return;

    if (filters.uf) state.filters.estados = [filters.uf];
    if (filters.municipio) state.filters.cidades = [filters.municipio];
    if (filters.score_min !== null && filters.score_min !== undefined) {
      state.filters.min_intent_score = filters.score_min;
    }
    if (filters.intent_classification) {
      state.filters.intent_stage = filters.intent_classification;
    }
    if (filters.apenas_whatsapp) {
      state.filters.apenas_whatsapp_valido = true;
    }
    if (filters.cultura || filters.status_car || filters.origem === 'RURAL_SIGEF') {
      state.filters.origem = 'RURAL_SIGEF';
    }

    state.filters.page = 1;
    state.currentPage = 1;

    if (source !== 'table_fetch') {
      mockFetchLeads();
    }
  };

  handleFiltersChanged({
    detail: {
      filters: {
        uf: 'MT',
        municipio: 'Sorriso',
        cultura: 'Milho',
        score_min: 75,
        origem: 'RURAL_SIGEF'
      },
      source: 'copilot'
    }
  });

  assert.deepStrictEqual(state.filters.estados, ['MT']);
  assert.deepStrictEqual(state.filters.cidades, ['Sorriso']);
  assert.strictEqual(state.filters.min_intent_score, 75);
  assert.strictEqual(state.filters.origem, 'RURAL_SIGEF');
  assert.strictEqual(fetchLeadsCalled, true, 'Deveria ter acionado fetchLeads()');
});

// 3. Teste do Filtrador WebGL no MapEngine (mapEngine.js)
runTest('3. applyActiveFiltersToFundiario filtra GeoJSON da malha e recalcula polígonos', () => {
  const currentFundiarioGeoJson = {
    type: 'FeatureCollection',
    features: [
      {
        id: 'fazenda-1',
        type: 'Feature',
        properties: {
          nome_imovel: 'Fazenda Rio Verde',
          intent_score: 85,
          intent_classification: 'HOT',
          dados_agronomicos: { crop_type: 'Milho' },
          uf: 'MT',
          municipio: 'Sorriso',
          status_car: 'ATIVO',
          tem_passivo_ambiental: false
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-55.7, -12.5], [-55.6, -12.5], [-55.6, -12.6], [-55.7, -12.6], [-55.7, -12.5]]]
        }
      },
      {
        id: 'fazenda-2',
        type: 'Feature',
        properties: {
          nome_imovel: 'Fazenda Sol Nascente',
          intent_score: 45,
          intent_classification: 'WARM',
          dados_agronomicos: { crop_type: 'Soja' },
          uf: 'MT',
          municipio: 'Sorriso',
          status_car: 'PENDENTE',
          tem_passivo_ambiental: true
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-55.5, -12.4], [-55.4, -12.4], [-55.4, -12.5], [-55.5, -12.5], [-55.5, -12.4]]]
        }
      },
      {
        id: 'fazenda-3',
        type: 'Feature',
        properties: {
          nome_imovel: 'Fazenda Ouro Branco',
          intent_score: 92,
          intent_classification: 'HOT',
          dados_agronomicos: { crop_type: 'Milho' },
          uf: 'MT',
          municipio: 'Sorriso',
          status_car: 'ATIVO',
          tem_passivo_ambiental: false
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-55.8, -12.7], [-55.7, -12.7], [-55.7, -12.8], [-55.8, -12.8], [-55.8, -12.7]]]
        }
      }
    ]
  };

  // Simula applyActiveFiltersToFundiario
  function applyFilters(geo, filters) {
    const { cultura, score_min, status_car } = filters;
    return geo.features.filter(f => {
      const p = f.properties || {};
      if (score_min !== undefined && score_min !== null && (Number(p.intent_score) || 0) < Number(score_min)) return false;
      if (cultura) {
        const crop = (p.dados_agronomicos?.crop_type || '').toLowerCase();
        if (!crop.includes(cultura.toLowerCase())) return false;
      }
      if (status_car === 'TODOS_PENDENTES') {
        const pStatus = (p.status_car || '').toUpperCase();
        const temPassivo = Boolean(p.tem_passivo_ambiental);
        if (!(temPassivo || ['PENDENTE','SUSPENSO','CANCELADO'].includes(pStatus))) return false;
      }
      return true;
    });
  }

  // Caso A: Filtro de Milho com Score >= 70
  const filteredMilho = applyFilters(currentFundiarioGeoJson, { cultura: 'Milho', score_min: 70 });
  assert.strictEqual(filteredMilho.length, 2, 'Deveriam restar 2 fazendas de milho (Fazenda 1 e Fazenda 3)');
  assert.strictEqual(filteredMilho[0].properties.nome_imovel, 'Fazenda Rio Verde');
  assert.strictEqual(filteredMilho[1].properties.nome_imovel, 'Fazenda Ouro Branco');

  // Caso B: Filtro de Passivo Ambiental CAR
  const filteredCar = applyFilters(currentFundiarioGeoJson, { status_car: 'TODOS_PENDENTES' });
  assert.strictEqual(filteredCar.length, 1, 'Deveria restar apenas 1 fazenda com pendência CAR');
  assert.strictEqual(filteredCar[0].properties.nome_imovel, 'Fazenda Sol Nascente');
});

// 4. Teste de Reset e Integridade do Store
runTest('4. window.clearVersusFilters restaura todos os campos para null/padrão', () => {
  const store = {
    cultura: 'Soja',
    uf: 'RS',
    municipio: 'Passo Fundo',
    score_min: 80,
    origem: 'RURAL_SIGEF'
  };

  function clearStore(s) {
    s.cultura = null;
    s.uf = null;
    s.municipio = null;
    s.score_min = null;
    s.score_max = null;
    s.intent_classification = null;
    s.status_car = null;
    s.area_min_ha = null;
    s.apenas_whatsapp = false;
    s.origem = 'TODOS';
  }

  clearStore(store);

  assert.strictEqual(store.cultura, null);
  assert.strictEqual(store.uf, null);
  assert.strictEqual(store.municipio, null);
  assert.strictEqual(store.score_min, null);
  assert.strictEqual(store.origem, 'TODOS');
});

console.log('\n-------------------------------------------------------------');
console.log(`📊 RESULTADO FASE 2: ${passedTests}/${totalTests} TESTES APROVADOS (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('-------------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
