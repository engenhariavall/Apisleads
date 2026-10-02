/**
 * TESTE AUTOMATIZADO E2E: FASE 17 — WEBGIS ANALÍTICO & GESTÃO ESPACIAL
 * (MapLibre GL Dark Matter, Agregação Uber H3 & Cancelas Comerciais Ray-Casting)
 */

import assert from 'assert';
import * as h3 from 'h3-js';

const BASE_URL = 'http://localhost:3000';

// Implementação do algoritmo Ray-Casting usado no client (Point-in-Polygon)
function isPointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > lng) !== (yj > lng))
      && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Implementação de referência da agregação H3 (espelho do client/js/h3Layer.js)
function buildH3GeoJson(features, resolution = 7) {
  const cellMap = new Map();

  features.forEach(f => {
    if (!f.geometry || !Array.isArray(f.geometry.coordinates)) return;
    const [lng, lat] = f.geometry.coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) return;

    try {
      const cell = h3.latLngToCell(lat, lng, resolution);
      if (!cellMap.has(cell)) {
        cellMap.set(cell, {
          cell,
          count: 0,
          totalCapital: 0,
          categories: {}
        });
      }

      const bucket = cellMap.get(cell);
      bucket.count++;
      const cap = parseFloat(f.properties?.capital_social) || 0;
      bucket.totalCapital += cap;

      const cat = f.properties?.categoria_real || 'Geral';
      bucket.categories[cat] = (bucket.categories[cat] || 0) + 1;
    } catch (err) {
      // Ignora erro
    }
  });

  const hexFeatures = [];
  cellMap.forEach(bucket => {
    try {
      const boundary = h3.cellToBoundary(bucket.cell, true);
      const isClosed = boundary.length > 1 && 
        boundary[0][0] === boundary[boundary.length - 1][0] && 
        boundary[0][1] === boundary[boundary.length - 1][1];
      const ring = isClosed ? boundary : [...boundary, boundary[0]];

      let dominantCat = 'Geral';
      let maxCount = 0;
      Object.entries(bucket.categories).forEach(([c, cnt]) => {
        if (cnt > maxCount) {
          maxCount = cnt;
          dominantCat = c;
        }
      });

      hexFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [ring]
        },
        properties: {
          cell: bucket.cell,
          count: bucket.count,
          total_capital: bucket.totalCapital,
          total_capital_formatted: `R$ ${bucket.totalCapital.toLocaleString('pt-BR')}`,
          dominant_category: dominantCat
        }
      });
    } catch (err) {
      // Ignora
    }
  });

  return {
    type: 'FeatureCollection',
    features: hexFeatures
  };
}

async function runPhase17Tests() {
  console.log('🧪 Iniciando Bateria de Testes da Fase 17 (WebGIS Analítico & H3 Gestão Espacial)...\n');
  let testsPassed = 0;
  let testsTotal = 0;

  function pass(desc) {
    testsTotal++;
    testsPassed++;
    console.log(`✅ [PASS] ${desc}`);
  }

  function fail(desc, err) {
    testsTotal++;
    console.error(`❌ [FAIL] ${desc}`, err);
    process.exit(1);
  }

  try {
    // -------------------------------------------------------------------------
    // TESTES 1: Endpoint POST /api/gis/geojson
    // -------------------------------------------------------------------------
    console.log('--- Testes de API: POST /api/gis/geojson ---');

    // 1.1 Resposta padrão sem filtros
    const resAll = await fetch(`${BASE_URL}/api/gis/geojson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(resAll.status, 200, 'Endpoint deve responder com status 200');
    const dataAll = await resAll.json();

    assert.strictEqual(dataAll.type, 'FeatureCollection', 'Root deve ser FeatureCollection GeoJSON');
    assert.ok(Array.isArray(dataAll.features), 'Deve conter array de features');
    assert.ok(dataAll.features.length > 0, 'Deve retornar ao menos 1 lead indexado');
    assert.strictEqual(dataAll.total_features, dataAll.features.length, 'total_features deve bater com o array');
    pass(`Endpoint responde GeoJSON padronizado com ${dataAll.features.length} features`);

    // 1.2 Estrutura e coordenadas das Features GeoJSON
    const sampleFeature = dataAll.features[0];
    assert.strictEqual(sampleFeature.type, 'Feature', 'Elemento deve ser do tipo Feature');
    assert.strictEqual(sampleFeature.geometry.type, 'Point', 'Geometria deve ser Point');
    assert.ok(Array.isArray(sampleFeature.geometry.coordinates), 'Coordinates deve ser um array');
    assert.strictEqual(sampleFeature.geometry.coordinates.length, 2, 'Coordinates deve ter exatamente [lng, lat]');

    const [lng, lat] = sampleFeature.geometry.coordinates;
    assert.ok(typeof lng === 'number' && lng >= -180 && lng <= 180, 'Longitude deve ser float válido [-180, 180]');
    assert.ok(typeof lat === 'number' && lat >= -90 && lat <= 90, 'Latitude deve ser float válido [-90, 90]');
    pass(`Geometria GeoJSON validada com coordenadas [lng, lat]: [${lng}, ${lat}]`);

    // 1.3 Propriedades Analíticas das Features
    const props = sampleFeature.properties;
    assert.ok(props.id, 'Deve conter id');
    assert.ok(props.razao_social, 'Deve conter razao_social');
    assert.ok(props.categoria_real, 'Deve conter categoria_real (Padrão VERSUS)');
    assert.ok(props.vitality_status, 'Deve conter status de vitalidade cadastral');
    assert.ok(props.vertical_type, 'Deve conter vertical_type');
    assert.ok(props.target_type, 'Deve conter target_type (BUYER/SUPPLIER)');
    assert.ok('capital_social' in props, 'Deve conter capital_social');
    assert.ok('whatsapp_capable' in props, 'Deve conter whatsapp_capable');
    pass('Features enriquecidas com taxonomia, vitalidade, ICP e métricas setoriais');

    // 1.4 Filtragem por ICP (BUYER)
    const resBuyer = await fetch(`${BASE_URL}/api/gis/geojson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: { target_type: 'BUYER' } })
    });
    const dataBuyer = await resBuyer.json();
    assert.ok(dataBuyer.features.length > 0, 'Deve retornar compradores');
    assert.ok(dataBuyer.features.every(f => f.properties.target_type === 'BUYER'), 'Todos devem ter target_type BUYER');
    pass(`Filtro ICP no GeoJSON: ${dataBuyer.features.length} compradores isolados com sucesso`);

    // 1.5 Filtragem por Vertical (AGRO)
    const resAgro = await fetch(`${BASE_URL}/api/gis/geojson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: { vertical: 'AGRO' } })
    });
    const dataAgro = await resAgro.json();
    assert.ok(dataAgro.features.length > 0, 'Deve retornar leads Agro');
    assert.ok(dataAgro.features.every(f => f.properties.vertical_type === 'AGRO'), 'Todos devem ser da vertical AGRO');
    pass(`Filtro de Vertical no GeoJSON: ${dataAgro.features.length} empresas agropecuárias isoladas`);

    // 1.6 Filtragem por Vitalidade (OPERACAO_ATIVA)
    const resActive = await fetch(`${BASE_URL}/api/gis/geojson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: { vitality_status: 'OPERACAO_ATIVA' } })
    });
    const dataActive = await resActive.json();
    assert.ok(dataActive.features.length > 0, 'Deve retornar empresas com operação ativa');
    assert.ok(dataActive.features.every(f => f.properties.vitality_status === 'OPERACAO_ATIVA'), 'Todas devem ter status OPERACAO_ATIVA');
    pass(`Filtro de Vitalidade no GeoJSON: ${dataActive.features.length} empresas de alta vitalidade confirmadas`);

    // -------------------------------------------------------------------------
    // TESTES 2: Motor de Agregação Hexagonal Uber H3
    // -------------------------------------------------------------------------
    console.log('\n--- Testes: Agregação Espacial H3 (Resolução 7) ---');

    // 2.1 Indexação de coordenadas pontuais para hexágonos H3
    const h3GeoJson = buildH3GeoJson(dataAll.features, 7);
    assert.strictEqual(h3GeoJson.type, 'FeatureCollection', 'H3 deve retornar FeatureCollection');
    assert.ok(h3GeoJson.features.length > 0, 'Deve gerar hexágonos agrupados');
    assert.ok(h3GeoJson.features.length <= dataAll.features.length, 'Número de hexágonos deve ser menor ou igual ao número de pontos');
    pass(`H3 converteu ${dataAll.features.length} pontos em ${h3GeoJson.features.length} células hexagonais`);

    // 2.2 Geometria dos Polígonos H3
    const hex0 = h3GeoJson.features[0];
    assert.strictEqual(hex0.geometry.type, 'Polygon', 'Geometria do hexágono deve ser Polygon');
    assert.ok(Array.isArray(hex0.geometry.coordinates[0]), 'Anel externo do polígono deve ser array');
    assert.strictEqual(hex0.geometry.coordinates[0].length, 7, 'Hexágono GeoJSON deve ter 7 vértices (6 pontas + 1 para fechar anel)');

    // Valida que o anel é fechado (primeiro vértice === último vértice)
    const firstVertex = hex0.geometry.coordinates[0][0];
    const lastVertex = hex0.geometry.coordinates[0][6];
    assert.strictEqual(firstVertex[0], lastVertex[0], 'Longitude do primeiro e último vértice devem coincidir');
    assert.strictEqual(firstVertex[1], lastVertex[1], 'Latitude do primeiro e último vértice devem coincidir');
    pass('Polígonos H3 possuem anéis fechados rigorosamente conforme a especificação GeoJSON');

    // 2.3 Métricas de Agregação (Densidade & Capital)
    assert.ok(hex0.properties.count >= 1, 'Hexágono deve conter contagem de empresas >= 1');
    assert.ok(typeof hex0.properties.total_capital === 'number', 'Capital total deve ser número');
    assert.ok(hex0.properties.total_capital_formatted.startsWith('R$'), 'Formatação de capital deve seguir padrão monetário brasileiro');
    assert.ok(hex0.properties.dominant_category, 'Deve identificar categoria real dominante do cluster');
    pass(`Hexágono H3 auditado: ${hex0.properties.count} empresas, ${hex0.properties.total_capital_formatted}, dominante: "${hex0.properties.dominant_category}"`);

    // -------------------------------------------------------------------------
    // TESTES 3: Delimitação de Territórios por Polígono Livre (Ray-Casting)
    // -------------------------------------------------------------------------
    console.log('\n--- Testes: Ray-Casting & Cancelas Comerciais ---');

    // 3.1 Polígono delimitador sintético (Região Metropolitana de São Paulo)
    // [ [lat, lng], ... ]
    const spPolygon = [
      [-23.35, -46.85],
      [-23.35, -46.35],
      [-23.75, -46.35],
      [-23.75, -46.85],
      [-23.35, -46.85]
    ];

    // Ponto no centro de SP (Praça da Sé: -23.5505, -46.6333) -> DEVE ESTAR DENTRO
    const spInside = isPointInPolygon(-23.5505, -46.6333, spPolygon);
    assert.strictEqual(spInside, true, 'Praça da Sé deve estar dentro do polígono de SP');

    // Ponto em Brasília (-15.7975, -47.8919) -> DEVE ESTAR FORA
    const bsbOutside = isPointInPolygon(-15.7975, -47.8919, spPolygon);
    assert.strictEqual(bsbOutside, false, 'Brasília deve estar fora do polígono de SP');

    // Ponto em Curitiba (-25.4284, -49.2733) -> DEVE ESTAR FORA
    const cwbOutside = isPointInPolygon(-25.4284, -49.2733, spPolygon);
    assert.strictEqual(cwbOutside, false, 'Curitiba deve estar fora do polígono de SP');
    pass('Algoritmo Ray-Casting discrimina com precisão pontos internos e externos');

    // 3.2 Filtragem real de leads da base dentro do polígono de SP
    const leadsInsideSp = dataAll.features.filter(f => {
      const [lng, lat] = f.geometry.coordinates;
      return isPointInPolygon(lat, lng, spPolygon);
    });

    assert.ok(leadsInsideSp.length > 0, 'Deve encontrar leads localizados na Grande SP');
    assert.ok(leadsInsideSp.length < dataAll.features.length, 'Filtro deve isolar apenas o território sem abranger todo o Brasil');
    pass(`Cancela Comercial SP: ${leadsInsideSp.length} leads isolados com precisão cartográfica`);

    // -------------------------------------------------------------------------
    // SÍNTESE
    // -------------------------------------------------------------------------
    console.log('\n=======================================================');
    console.log(`🎉 TODOS OS ${testsPassed}/${testsTotal} TESTES DA FASE 17 PASSARAM COM SUCESSO!`);
    console.log('=======================================================');
  } catch (err) {
    fail('Erro inesperado durante a execução dos testes da Fase 17:', err);
  }
}

runPhase17Tests();
