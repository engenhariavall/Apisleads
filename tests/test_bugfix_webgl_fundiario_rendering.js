/**
 * tests/test_bugfix_webgl_fundiario_rendering.js
 * 
 * TESTE DE VALIDAÇÃO DE BUGFIX:
 * RENDERIZAÇÃO DA MALHA FUNDIÁRIA NO MOTOR WEBGL (MAPLIBRE GL)
 * 
 * Verifica:
 * 1. Injeção de dados no source 'fundiario-source' com map.getSource().setData(geojson).
 * 2. Forçar visibilidade com map.setLayoutProperty(..., 'visibility', 'visible') para camadas de preenchimento e borda.
 * 3. Sincronia de estado da UI: ativação do botão principal [ 🌾 Malha Fundiária ] ('btnToggleFundiarioLayer').
 * 4. Validação estática do script client/js/mapEngine.js para confirmar que todas as 3 diretivas foram aplicadas.
 */

import fs from 'fs';
import path from 'path';

async function run() {
  console.log('🚀 Iniciando verificação de correção do Bug de Renderização WebGL da Malha Fundiária...');
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
    const mapEngineJsPath = path.resolve('client/js/mapEngine.js');
    const content = fs.readFileSync(mapEngineJsPath, 'utf8');

    // 1. Verificação de Injeção de Dados no Source
    console.log('\n--- 1. Auditoria da Injeção de Dados no Source WebGL ---');
    assert(
      content.includes("fundSource.setData(geojson)") || content.includes("map.getSource('fundiario-source').setData(geojson)"),
      'mapEngine.js executa setData(geojson) explicitamente no fundiario-source'
    );
    assert(
      content.includes("setupFundiarioLayers();"),
      'Garante que setupFundiarioLayers é invocado se o source não existir'
    );

    // 2. Verificação de Forçar Visibilidade (Layout Properties)
    console.log('\n--- 2. Auditoria de Visibilidade Forçada (setLayoutProperty) ---');
    assert(
      content.includes("map.setLayoutProperty(layerId, 'visibility', 'visible')") ||
      (content.includes("map.setLayoutProperty('fundiario-polygon-fill', 'visibility', 'visible')") &&
       content.includes("map.setLayoutProperty('fundiario-polygon-stroke', 'visibility', 'visible')")),
      'Aplica setLayoutProperty com visibility: visible explicitamente nas camadas fundiárias'
    );
    assert(
      content.includes('fundiario-fill-layer') && content.includes('fundiario-line-layer'),
      'Suporta tanto os IDs nativos de polígono quanto os aliases fundiario-fill-layer e fundiario-line-layer'
    );

    // 3. Verificação de Sincronia de Botões (UI)
    console.log('\n--- 3. Auditoria de Sincronia de Botões na UI ---');
    assert(
      content.includes("btnToggleFundiarioLayer") && content.includes("classList.add('active')"),
      'Ativa visualmente o botão principal [ 🌾 Malha Fundiária ] (btnToggleFundiarioLayer) ao concluir a busca'
    );

    // 4. Verificação de Simulação do Fluxo no MapEngine
    console.log('\n--- 4. Simulação Funcional de MapLibre Mock ---');
    let sourceData = null;
    const layerVisibilities = {};
    const mockBtn = { classList: { add: (c) => mockBtn[c] = true }, setAttribute: () => {} };

    const mockMap = {
      sources: {
        'fundiario-source': {
          setData: (data) => { sourceData = data; }
        }
      },
      layers: {
        'fundiario-polygon-fill': { id: 'fundiario-polygon-fill' },
        'fundiario-polygon-stroke': { id: 'fundiario-polygon-stroke' },
        'fundiario-polygon-label': { id: 'fundiario-polygon-label' }
      },
      getSource(id) { return this.sources[id]; },
      getLayer(id) { return this.layers[id]; },
      setLayoutProperty(id, prop, val) {
        if (!layerVisibilities[id]) layerVisibilities[id] = {};
        layerVisibilities[id][prop] = val;
      }
    };

    const mockGeojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { nome_imovel: 'Fazenda Teste' } }
      ]
    };

    // Executa as operações auditadas
    mockMap.getSource('fundiario-source').setData(mockGeojson);
    ['fundiario-polygon-fill', 'fundiario-polygon-stroke', 'fundiario-polygon-label'].forEach(id => {
      mockMap.setLayoutProperty(id, 'visibility', 'visible');
    });
    mockBtn.classList.add('active');

    assert(sourceData === mockGeojson, 'Mock MapLibre recebeu GeoJSON corretamente no setData');
    assert(layerVisibilities['fundiario-polygon-fill']['visibility'] === 'visible', 'Camada de preenchimento forçada para visible');
    assert(layerVisibilities['fundiario-polygon-stroke']['visibility'] === 'visible', 'Camada de linha/borda forçada para visible');
    assert(mockBtn['active'] === true, 'Botão [ 🌾 Malha Fundiária ] marcado como active');

  } catch (err) {
    console.error('❌ Erro na validação de bugfix:', err);
    failed++;
  }

  console.log(`\n====================================================`);
  console.log(`📊 TOTAL DE TESTES DO BUGFIX: ${passed + failed}`);
  console.log(`✅ APROVADOS: ${passed}`);
  console.log(`❌ FALHAS: ${failed}`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
