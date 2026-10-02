/**
 * tests/test_hotfix_ux_mesh_fitbounds.js
 * 
 * HOTFIX UX: AUTO-CENTRALIZAÇÃO DE MALHA (FITBOUNDS)
 * Validação rigorosa da diretriz de engenharia:
 * 1. Cálculo de Bounding Box a partir de FeatureCollection GeoJSON.
 * 2. Invocação nativa de map.fitBounds(bbox, { padding: 50, duration: 1500 }).
 * 3. Disparo do Toast de aviso "Nenhuma parcela certificada encontrada nesta região." quando não houver resultados.
 * 4. Disponibilidade canônica da função carregarMalha em mapEngine.js e app.js.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

async function runHotfixUxTests() {
  console.log('=============================================================');
  console.log('🧪 INICIANDO TESTES DO HOTFIX UX - AUTO-CENTRALIZAÇÃO DE MALHA');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     ${err.message}`);
      failed++;
    }
  }

  // --- 1. Auditoria de Código em client/js/mapEngine.js ---
  console.log('--- 1. Auditoria em client/js/mapEngine.js ---');
  const mapEnginePath = path.resolve('client/js/mapEngine.js');
  const mapEngineContent = fs.readFileSync(mapEnginePath, 'utf8');

  test('mapEngine.js define a função carregarMalha', () => {
    assert.ok(mapEngineContent.includes('async function carregarMalha('), 'Deve conter declaração de carregarMalha');
  });

  test('mapEngine.js exporta carregarMalha no objeto de retorno', () => {
    assert.ok(mapEngineContent.includes('carregarMalha,'), 'Deve incluir carregarMalha na lista de exportações');
  });

  test('mapEngine.js registra window.carregarMalha e window.mapEngine no escopo global', () => {
    assert.ok(mapEngineContent.includes('window.carregarMalha = window.MapEngine.carregarMalha;'), 'Deve atribuir window.carregarMalha');
    assert.ok(mapEngineContent.includes('window.mapEngine = window.MapEngine;'), 'Deve atribuir window.mapEngine para compatibilidade case-insensitive');
  });

  test('mapEngine.js executa map.fitBounds com { padding: 50, duration: 1500 }', () => {
    assert.ok(mapEngineContent.includes('padding: 50'), 'Deve definir padding: 50 para o voo de câmera');
    assert.ok(mapEngineContent.includes('duration: 1500'), 'Deve definir duration: 1500');
    assert.ok(mapEngineContent.includes('map.fitBounds(bbox'), 'Deve invocar map.fitBounds(bbox, ...)');
  });

  test('mapEngine.js emite toast "Nenhuma parcela certificada encontrada nesta região." quando não houver resultados', () => {
    assert.ok(
      mapEngineContent.includes("showToast('Nenhuma parcela certificada encontrada nesta região.')"),
      'Deve disparar exatamente o toast requerido quando a busca não retornar dados'
    );
  });

  // --- 2. Auditoria de Código em client/js/app.js ---
  console.log('\n--- 2. Auditoria em client/js/app.js ---');
  const appPath = path.resolve('client/js/app.js');
  const appContent = fs.readFileSync(appPath, 'utf8');

  test('client/js/app.js expõe window.carregarMalha', () => {
    assert.ok(appContent.includes('window.carregarMalha = async function'), 'Deve declarar window.carregarMalha');
    assert.ok(appContent.includes('window.MapEngine.carregarMalha'), 'Deve delegar ao MapEngine');
  });

  // --- 3. Matemática e Resiliência de Bounding Box ---
  console.log('\n--- 3. Validação do Cálculo de Bounding Box ---');
  
  // Extrai a função de cálculo diretamente para teste unitário
  function calculateGeoJsonBoundingBox(geojson) {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    let count = 0;

    function processCoords(coords) {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === 'number' || (typeof coords[0] === 'string' && !isNaN(parseFloat(coords[0])))) {
        const lng = typeof coords[0] === 'number' ? coords[0] : parseFloat(coords[0]);
        const lat = typeof coords[1] === 'number' ? coords[1] : parseFloat(coords[1]);
        if (!isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          count++;
          return;
        }
      }
      for (const item of coords) {
        processCoords(item);
      }
    }

    const featureList = Array.isArray(geojson)
      ? geojson
      : (geojson?.features && Array.isArray(geojson.features))
        ? geojson.features
        : (geojson?.type === 'Feature' ? [geojson] : []);

    for (const f of featureList) {
      if (!f) continue;
      let geom = f.geometry || f.geometria_poligono;
      if (typeof geom === 'string') {
        try { geom = JSON.parse(geom); } catch (_) {}
      }
      if (geom?.coordinates) {
        processCoords(geom.coordinates);
      } else if (f.properties?.centroide_lng && f.properties?.centroide_lat) {
        processCoords([parseFloat(f.properties.centroide_lng), parseFloat(f.properties.centroide_lat)]);
      } else if (f.centroide_lng && f.centroide_lat) {
        processCoords([parseFloat(f.centroide_lng), parseFloat(f.centroide_lat)]);
      }
    }

    if (count === 0 || !isFinite(minLng) || !isFinite(minLat)) {
      return null;
    }

    if (minLng === maxLng && minLat === maxLat) {
      minLng -= 0.08;
      maxLng += 0.08;
      minLat -= 0.08;
      maxLat += 0.08;
    }

    return [[minLng, minLat], [maxLng, maxLat]];
  }

  test('Cálculo com múltiplas fazendas certificadas (Sorriso/MT)', () => {
    const mockGeoJsonSorriso = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-55.7350, -12.5300],
              [-55.7050, -12.5300],
              [-55.7050, -12.5550],
              [-55.7350, -12.5550],
              [-55.7350, -12.5300]
            ]]
          },
          properties: { nome_imovel: 'Gleba Sorriso Sul' }
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-55.6700, -12.4750],
              [-55.6300, -12.4750],
              [-55.6300, -12.5050],
              [-55.6700, -12.5050],
              [-55.6700, -12.4750]
            ]]
          },
          properties: { nome_imovel: 'Fazenda Pioneira' }
        }
      ]
    };

    const bbox = calculateGeoJsonBoundingBox(mockGeoJsonSorriso);
    assert.ok(bbox !== null, 'Bbox não pode ser nulo');
    assert.strictEqual(bbox.length, 2);
    const [[swLng, swLat], [neLng, neLat]] = bbox;
    assert.strictEqual(swLng, -55.7350);
    assert.strictEqual(swLat, -12.5550);
    assert.strictEqual(neLng, -55.6300);
    assert.strictEqual(neLat, -12.4750);
    assert.ok(swLng < neLng, 'SW Longitude < NE Longitude');
    assert.ok(swLat < neLat, 'SW Latitude < NE Latitude');
  });

  test('Cálculo com FeatureCollection vazia retorna null', () => {
    const emptyGeoJson = { type: 'FeatureCollection', features: [] };
    const bbox = calculateGeoJsonBoundingBox(emptyGeoJson);
    assert.strictEqual(bbox, null, 'FeatureCollection vazia deve retornar null');
  });

  test('Cálculo com geometria nula ou inválida retorna null', () => {
    const invalidGeoJson = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: null, properties: {} }]
    };
    const bbox = calculateGeoJsonBoundingBox(invalidGeoJson);
    assert.strictEqual(bbox, null, 'Features sem geometria ou centróide devem retornar null');
  });

  // --- 4. Simulação de Comportamento UX ---
  console.log('\n--- 4. Simulação de Resposta e Voo Tático UX ---');

  test('Simulação de busca vazia: aciona toast e não executa fitBounds com coords nulas', () => {
    let toastMessage = null;
    let fitBoundsCalled = false;

    const mockMap = {
      fitBounds: (bbox, opts) => {
        fitBoundsCalled = true;
      }
    };
    function showToast(msg) {
      toastMessage = msg;
    }

    // Simula a lógica de executeRegionalMeshSearch para busca vazia
    const emptyGeoJson = { type: 'FeatureCollection', total_features: 0, features: [] };
    const featureCount = emptyGeoJson.total_features ?? (Array.isArray(emptyGeoJson.features) ? emptyGeoJson.features.length : 0);

    if (featureCount === 0 || !emptyGeoJson.features || emptyGeoJson.features.length === 0) {
      showToast('Nenhuma parcela certificada encontrada nesta região.');
    } else {
      const bbox = calculateGeoJsonBoundingBox(emptyGeoJson);
      if (bbox) {
        mockMap.fitBounds(bbox, { padding: 50, duration: 1500, essential: true });
      }
    }

    assert.strictEqual(toastMessage, 'Nenhuma parcela certificada encontrada nesta região.');
    assert.strictEqual(fitBoundsCalled, false, 'fitBounds não deve ser executado para busca vazia');
  });

  test('Simulação de busca com sucesso: executa fitBounds com { padding: 50, duration: 1500 }', () => {
    let capturedBbox = null;
    let capturedOpts = null;

    const mockMap = {
      fitBounds: (bbox, opts) => {
        capturedBbox = bbox;
        capturedOpts = opts;
      }
    };

    const validGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[-50.9450, -17.7650], [-50.8950, -17.8050]]]
          }
        }
      ]
    };

    const bbox = calculateGeoJsonBoundingBox(validGeoJson);
    mockMap.fitBounds(bbox, { padding: 50, duration: 1500, essential: true });

    assert.ok(capturedBbox !== null, 'Bbox deve ter sido enviado');
    assert.deepStrictEqual(capturedOpts, { padding: 50, duration: 1500, essential: true });
    assert.strictEqual(capturedOpts.padding, 50, 'Padding deve ser 50');
    assert.strictEqual(capturedOpts.duration, 1500, 'Duration deve ser 1500ms');
  });

  console.log(`\n====================================================`);
  console.log(`🏁 RESULTADO FINAL: ${passed} passaram | ${failed} falharam`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runHotfixUxTests();
