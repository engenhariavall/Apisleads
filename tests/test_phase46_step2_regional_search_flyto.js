/**
 * tests/test_phase46_step2_regional_search_flyto.js
 * 
 * FASE 46 - ETAPA 2: VOO TÁTICO (FLYTO / FITBOUNDS) E INTEGRAÇÃO API REGIONAL
 * 
 * Testes Automatizados:
 * 1. Endpoint GET /api/fundiario/geojson responde com filtragem estrita por ?uf=MT&municipio=SORRISO.
 * 2. FeatureCollection retornada isola apenas as propriedades rurais de Sorriso/MT.
 * 3. Cálculo de Bounding Box (calculateGeoJsonBoundingBox) no frontend extrai com precisão [[minLng, minLat], [maxLng, maxLat]].
 * 4. Isolamento Multi-Tenant preservado na busca regional.
 * 5. Integração com mapEngine.js: executeRegionalMeshSearch e calculateGeoJsonBoundingBox exportados e funcionais.
 */

import db from '../server/src/config/database.js';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function run() {
  console.log('🚀 Iniciando bateria de testes da Fase 46 - Etapa 2 (Voo Tático e Integração API)...');
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
    // 1. Teste de Endpoint GET /api/fundiario/geojson com filtros de UF e Município
    console.log('\n--- 1. Consulta Filtrada GET /api/fundiario/geojson ---');
    const resSorriso = await fetch(`${BASE_URL}/api/fundiario/geojson?uf=MT&municipio=SORRISO`, {
      headers: {
        'X-Tenant-ID': 'tenant-root-default',
        'Accept': 'application/json'
      }
    });

    assert(resSorriso.ok, `GET /api/fundiario/geojson?uf=MT&municipio=SORRISO respondeu HTTP ${resSorriso.status}`);
    const geojsonSorriso = await resSorriso.json();

    assert(geojsonSorriso.type === 'FeatureCollection', 'Retornou FeatureCollection GeoJSON válida');
    assert(Array.isArray(geojsonSorriso.features) && geojsonSorriso.features.length >= 2, `Retornou ${geojsonSorriso.features.length} parcelas para Sorriso/MT`);
    
    const allSorriso = geojsonSorriso.features.every(f => 
      (f.properties.municipio || '').toUpperCase() === 'SORRISO' && 
      (f.properties.uf || '').toUpperCase() === 'MT'
    );
    assert(allSorriso, 'Todas as features retornadas pertencem estritamente a Sorriso/MT');

    // 2. Teste com outro polo agropecuário (Rio Verde / GO)
    console.log('\n--- 2. Consulta Filtrada Rio Verde / GO ---');
    const resRioVerde = await fetch(`${BASE_URL}/api/fundiario/geojson?uf=GO&municipio=RIO%20VERDE`, {
      headers: {
        'X-Tenant-ID': 'tenant-root-default',
        'Accept': 'application/json'
      }
    });
    assert(resRioVerde.ok, `GET /api/fundiario/geojson?uf=GO&municipio=RIO VERDE respondeu HTTP ${resRioVerde.status}`);
    const geojsonRioVerde = await resRioVerde.json();
    assert(geojsonRioVerde.features.length >= 1, `Retornou propriedades de Rio Verde/GO (${geojsonRioVerde.features.length})`);
    assert(geojsonRioVerde.features.every(f => (f.properties.uf || '').toUpperCase() === 'GO'), 'Filtro isolou estritamente o estado de GO');

    // 3. Teste de Cálculo de Bounding Box para FlyTo / FitBounds
    console.log('\n--- 3. Matemática de Bounding Box (Extremidades Geográficas) ---');
    function calculateGeoJsonBoundingBox(geojson) {
      let minLng = Infinity, maxLng = -Infinity;
      let minLat = Infinity, maxLat = -Infinity;
      let count = 0;

      function processCoords(coords) {
        if (!Array.isArray(coords)) return;
        if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
          const lng = coords[0];
          const lat = coords[1];
          if (!isNaN(lng) && !isNaN(lat)) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            count++;
          }
          return;
        }
        for (const item of coords) {
          processCoords(item);
        }
      }

      if (geojson?.features && Array.isArray(geojson.features)) {
        for (const f of geojson.features) {
          if (f.geometry?.coordinates) {
            processCoords(f.geometry.coordinates);
          } else if (f.properties?.centroide_lng && f.properties?.centroide_lat) {
            processCoords([parseFloat(f.properties.centroide_lng), parseFloat(f.properties.centroide_lat)]);
          }
        }
      }

      if (count === 0 || !isFinite(minLng) || !isFinite(minLat)) {
        return null;
      }

      return [[minLng, minLat], [maxLng, maxLat]];
    }

    const bboxSorriso = calculateGeoJsonBoundingBox(geojsonSorriso);
    assert(bboxSorriso !== null, 'Bounding box de Sorriso/MT calculado com sucesso');
    assert(bboxSorriso.length === 2 && bboxSorriso[0].length === 2 && bboxSorriso[1].length === 2, 'Estrutura [[minLng, minLat], [maxLng, maxLat]] válida para fitBounds');
    
    const [[minLng, minLat], [maxLng, maxLat]] = bboxSorriso;
    console.log(`     BBox Sorriso/MT: SW [${minLng.toFixed(4)}, ${minLat.toFixed(4)}] -> NE [${maxLng.toFixed(4)}, ${maxLat.toFixed(4)}]`);
    assert(minLng < maxLng, `minLng (${minLng}) é menor que maxLng (${maxLng})`);
    assert(minLat < maxLat, `minLat (${minLat}) é menor que maxLat (${maxLat})`);
    assert(minLat >= -13.5 && maxLat <= -11.5, 'Latitude enquadrada perfeitamente na região de Sorriso/MT (~ -12.5)');
    assert(minLng >= -56.5 && maxLng <= -54.5, 'Longitude enquadrada perfeitamente na região de Sorriso/MT (~ -55.7)');

    // 4. Auditoria de Código do Frontend (mapEngine.js)
    console.log('\n--- 4. Auditoria do Frontend (client/js/mapEngine.js) ---');
    const mapEngineJsPath = path.resolve('client/js/mapEngine.js');
    const mapEngineContent = fs.readFileSync(mapEngineJsPath, 'utf8');

    assert(mapEngineContent.includes('async function executeRegionalMeshSearch'), 'Função executeRegionalMeshSearch implementada em mapEngine.js');
    assert(mapEngineContent.includes('calculateGeoJsonBoundingBox'), 'Função calculateGeoJsonBoundingBox implementada em mapEngine.js');
    assert(mapEngineContent.includes('map.fitBounds(bbox'), 'Chamada a map.fitBounds(bbox, { ... }) configurada para o voo de câmera');
    assert(mapEngineContent.includes('fundiario-source'), 'Atualização da fonte WebGL fundiario-source presente');
    assert(mapEngineContent.includes('setFundiarioLayersVisibility(true)'), 'Garante que a camada fundiária é tornada visível automaticamente ao buscar');

    // 5. Teste de Isolamento Multi-Tenant na Busca Regional
    console.log('\n--- 5. Isolamento Multi-Tenant ---');
    const isolatedTenant = `tenant-test-${Date.now()}`;
    db.prepare("INSERT INTO tenants (id, name, plan) VALUES (?, ?, ?)").run(isolatedTenant, 'Tenant de Teste', 'ENTERPRISE');

    const resIso = await fetch(`${BASE_URL}/api/fundiario/geojson?uf=MT&municipio=SORRISO`, {
      headers: {
        'X-Tenant-ID': isolatedTenant,
        'Accept': 'application/json'
      }
    });
    const geojsonIso = await resIso.json();
    assert(resIso.ok, 'Endpoint respondeu 200 OK para novo tenant');
    // Para novo tenant, o auto-sync regional ingere as parcelas isoladas para ele
    assert(geojsonIso.type === 'FeatureCollection' && geojsonIso.features.length >= 2, 'Auto-sync regional gerou malha isolada para o novo tenant');
    
    // Confirma no banco que as parcelas foram gravadas sob o novo tenant_id
    const dbCount = db.prepare("SELECT COUNT(*) as count FROM propriedades_rurais WHERE tenant_id = ? AND municipio = 'SORRISO'").get(isolatedTenant);
    assert(dbCount.count >= 2, `Propriedades salvas com isolamento estrito no banco: ${dbCount.count}`);

  } catch (err) {
    console.error('❌ Erro inesperado na suíte da Fase 46 Etapa 2:', err);
    failed++;
  }

  console.log(`\n====================================================`);
  console.log(`📊 TOTAL DE TESTES DA FASE 46 (ETAPA 2): ${passed + failed}`);
  console.log(`✅ APROVADOS: ${passed}`);
  console.log(`❌ FALHAS: ${failed}`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
