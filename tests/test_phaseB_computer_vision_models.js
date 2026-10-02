/**
 * tests/test_phaseB_computer_vision_models.js
 * 
 * SUÍTE DE TESTES E HOMOLOGAÇÃO: FASE 66.B
 * Modelos de Visão Computacional (YOLOv8-Nano Fachada B2B + Satélite Pivôs/Silos/NDVI)
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import cognitiveQueueService from '../server/src/services/cognitiveQueueService.js';
import cognitiveController from '../server/src/controllers/cognitiveController.js';

console.log('🧪 Iniciando Suíte de Testes da FASE 66.B: Modelos de Visão Computacional...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Erro: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(testName, testFn) {
  totalTests++;
  try {
    await testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Erro: ${err.message}`);
    process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Validação de Schemas e Colunas da Fase 66.B
// ─────────────────────────────────────────────────────────────────────────────

runTest('1. Schema de Banco: Colunas de Satélite ativas em propriedades_rurais', () => {
  const propCols = db.prepare("PRAGMA table_info(propriedades_rurais)").all().map(c => c.name);
  assert.ok(propCols.includes('pivots_detected'), 'Deve conter pivots_detected');
  assert.ok(propCols.includes('silos_detected'), 'Deve conter silos_detected');
  assert.ok(propCols.includes('dams_detected'), 'Deve conter dams_detected');
  assert.ok(propCols.includes('vegetative_vigor_index'), 'Deve conter vegetative_vigor_index');
  assert.ok(propCols.includes('satellite_audit_at'), 'Deve conter satellite_audit_at');
});

runTest('2. Schema de Banco: Coluna zombie_risk_score ativa em leads', () => {
  const leadCols = db.prepare("PRAGMA table_info(leads)").all().map(c => c.name);
  assert.ok(leadCols.includes('zombie_risk_score'), 'Deve conter zombie_risk_score');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pipeline de Fachadas B2B (10 Empresas: Indústrias vs Residenciais vs Zumbis)
// ─────────────────────────────────────────────────────────────────────────────

await runAsyncTest('3. Pipeline de Fachadas: Classificação de 10 Empresas com Acurácia >= 85%', async () => {
  const testCompanies = [
    // 5 Grandes Indústrias / Fabricantes
    { id: 'ind-01', lat: -23.5001, lng: -46.6001, cnae: '2833-0/00', name: 'FABRICA TRATORES E IMPLEMENTOS BRASIL', zone: 'INDUSTRIAL', expectedTier: 'PRIME_INDUSTRIAL' },
    { id: 'ind-02', lat: -23.5101, lng: -46.6101, cnae: '2910-7/01', name: 'MONTADORA PESADOS LOGISTICA', zone: 'INDUSTRIAL', expectedTier: 'PRIME_INDUSTRIAL' },
    { id: 'ind-03', lat: -23.5201, lng: -46.6201, cnae: '1061-9/01', name: 'MOINHO INDUSTRIAL E BENEFICIAMENTO', zone: 'INDUSTRIAL', expectedTier: 'PRIME_INDUSTRIAL' },
    { id: 'ind-04', lat: -23.5301, lng: -46.6301, cnae: '2011-8/00', name: 'QUIMICA FERTILIZANTES E DEFENSIVOS', zone: 'INDUSTRIAL', expectedTier: 'PRIME_INDUSTRIAL' },
    { id: 'ind-05', lat: -23.5401, lng: -46.6401, cnae: '2511-0/00', name: 'ESTRUTURAS METALICAS E SILOS', zone: 'INDUSTRIAL', expectedTier: 'PRIME_INDUSTRIAL' },
    
    // 2 Residenciais Irregulares (MEIs ou endereços falsos em bairros residenciais)
    { id: 'res-01', lat: -23.5501, lng: -46.6501, cnae: '4712-1/00', name: 'COMERCIO RESIDENCIAL APARTAMENTO', zone: 'RESIDENTIAL', expectedTier: 'RESIDENTIAL_IRREGULAR' },
    { id: 'res-02', lat: -23.5601, lng: -46.6601, cnae: '4751-2/01', name: 'SERVICOS DOMICILIARES RESIDENCIA', zone: 'RESIDENTIAL', expectedTier: 'RESIDENTIAL_IRREGULAR' },

    // 2 Empresas Zumbis / Galpões Abandonados
    { id: 'zom-01', lat: -23.5701, lng: -46.6701, cnae: '4661-9/00', name: 'COMERCIAL MASSA FALIDA INAPTA', zone: 'INDUSTRIAL', expectedTier: 'ABANDONED_ZOMBIE' },
    { id: 'zom-02', lat: -23.5801, lng: -46.6801, cnae: '4623-1/00', name: 'ARMAZENS GERAIS INAPTA ABANDONADO', zone: 'INDUSTRIAL', expectedTier: 'ABANDONED_ZOMBIE' },

    // 1 Galpão Rural de Apoio
    { id: 'rur-01', lat: -12.5401, lng: -55.7201, cnae: '0111-3/01', name: 'ARMAZEM AGRO GRAOS E SEMENTES', zone: 'RURAL', expectedTier: 'RURAL_STORAGE' }
  ];

  let correctClassifications = 0;

  for (const comp of testCompanies) {
    const res = await cognitiveQueueService.requestAudit({
      entity_type: 'LEAD',
      entity_id: comp.id,
      latitude: comp.lat,
      longitude: comp.lng,
      cnae: comp.cnae,
      company_name: comp.name,
      force_refresh: true
    });

    // Aguarda processamento
    let audit = null;
    for (let retry = 0; retry < 5; retry++) {
      audit = cognitiveQueueService.getCachedAudit(res.coords_hash);
      if (audit) break;
      await new Promise(r => setTimeout(r, 40));
    }

    assert.ok(audit, `Auditoria para ${comp.id} deve ser processada.`);
    
    // Valida se atingiu o tier esperado ou compatível
    if (audit.infrastructure_tier === comp.expectedTier) {
      correctClassifications++;
    } else if (comp.expectedTier === 'PRIME_INDUSTRIAL' && ['PRIME_INDUSTRIAL', 'RURAL_STORAGE'].includes(audit.infrastructure_tier)) {
      correctClassifications++;
    } else if (comp.expectedTier === 'RESIDENTIAL_IRREGULAR' && ['RESIDENTIAL_IRREGULAR', 'STANDARD_COMMERCIAL'].includes(audit.infrastructure_tier)) {
      correctClassifications++;
    } else if (comp.expectedTier === 'ABANDONED_ZOMBIE' && audit.is_zombie_risk === 1) {
      correctClassifications++;
    }
  }

  const accuracy = (correctClassifications / testCompanies.length) * 100;
  console.log(`     🎯 Acurácia na Classificação de Fachadas: ${accuracy.toFixed(1)}% (${correctClassifications}/${testCompanies.length})`);
  assert.ok(accuracy >= 85, `Acurácia (${accuracy}%) deve ser maior ou igual a 85%`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pipeline de Sensoriamento de Satélite (10 Fazendas: Pivôs, Silos, Açudes e NDVI)
// ─────────────────────────────────────────────────────────────────────────────

await runAsyncTest('4. Pipeline de Satélite Orbital: Análise de 10 Fazendas com Detecção de Pivôs e Silos', async () => {
  const testFarms = [
    // 5 Mega Fazendas (> 1500 ha) com Pivôs Centrais e Baterias de Silos
    { id: 'faz-01', lat: -12.501, lng: -55.701, area: 4200, expectedPivotsMin: 2, expectedSilosMin: 3 },
    { id: 'faz-02', lat: -12.511, lng: -55.711, area: 3800, expectedPivotsMin: 2, expectedSilosMin: 3 },
    { id: 'faz-03', lat: -12.521, lng: -55.721, area: 2500, expectedPivotsMin: 2, expectedSilosMin: 2 },
    { id: 'faz-04', lat: -12.531, lng: -55.731, area: 5100, expectedPivotsMin: 2, expectedSilosMin: 3 },
    { id: 'faz-05', lat: -12.541, lng: -55.741, area: 1900, expectedPivotsMin: 2, expectedSilosMin: 2 },

    // 3 Fazendas Médias (500 a 1200 ha)
    { id: 'faz-06', lat: -12.551, lng: -55.751, area: 850, expectedPivotsMin: 0, expectedSilosMin: 1 },
    { id: 'faz-07', lat: -12.561, lng: -55.761, area: 1100, expectedPivotsMin: 0, expectedSilosMin: 1 },
    { id: 'faz-08', lat: -12.571, lng: -55.771, area: 650, expectedPivotsMin: 0, expectedSilosMin: 1 },

    // 2 Pequenas Propriedades de Pastagem (< 300 ha)
    { id: 'faz-09', lat: -12.581, lng: -55.781, area: 180, expectedPivotsMin: 0, expectedSilosMin: 0 },
    { id: 'faz-10', lat: -12.591, lng: -55.791, area: 220, expectedPivotsMin: 0, expectedSilosMin: 0 }
  ];

  let correctDetections = 0;

  for (const farm of testFarms) {
    const res = await cognitiveQueueService.requestSatelliteAudit({
      entity_type: 'RURAL_PROPERTY',
      entity_id: farm.id,
      latitude: farm.lat,
      longitude: farm.lng,
      area_ha: farm.area,
      crop_type: 'Soja',
      force_refresh: true
    });

    assert.ok(['PROCESSING', 'CACHED'].includes(res.status), 'Status de satélite deve ser PROCESSING ou CACHED');

    // Aguarda processamento
    let audit = null;
    for (let retry = 0; retry < 5; retry++) {
      audit = cognitiveQueueService.getCachedAudit(res.coords_hash);
      if (audit) break;
      await new Promise(r => setTimeout(r, 40));
    }

    assert.ok(audit, `Auditoria de satélite para ${farm.id} deve ser concluída.`);

    const inference = audit.raw_inference || {};
    const pivots = inference.pivot_count || 0;
    const silos = inference.silo_count || 0;
    const ndvi = inference.vegetative_vigor_index || 0.0;

    assert.ok(ndvi >= 0.0 && ndvi <= 1.0, `NDVI deve estar entre 0.00 e 1.00 (obtido: ${ndvi})`);

    // Valida consistência de detecção com o porte da fazenda
    if (farm.area > 1500) {
      if (pivots >= farm.expectedPivotsMin && silos >= farm.expectedSilosMin && inference.irrigation_potential === 'ALTO') {
        correctDetections++;
      }
    } else if (farm.area > 400) {
      if (silos >= farm.expectedSilosMin && ['ALTO', 'MEDIO'].includes(inference.irrigation_potential)) {
        correctDetections++;
      }
    } else {
      if (pivots === 0 && silos === 0 && inference.irrigation_potential === 'BAIXO') {
        correctDetections++;
      }
    }
  }

  const satAccuracy = (correctDetections / testFarms.length) * 100;
  console.log(`     🛰️  Acurácia no Sensoriamento de Satélite (Pivôs/Silos): ${satAccuracy.toFixed(1)}% (${correctDetections}/${testFarms.length})`);
  assert.ok(satAccuracy >= 85, `Acurácia de satélite (${satAccuracy}%) deve ser maior ou igual a 85%`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Teste de Cache e Atualização em propriedades_rurais
// ─────────────────────────────────────────────────────────────────────────────

await runAsyncTest('5. Cache de Satélite de 60 Dias & Atualização Direta no Banco', async () => {
  const farmId = 'fazenda-ouro-verde-demo';
  const testLat = -12.4455;
  const testLng = -55.8899;

  // Insere fazenda no banco para testar sincronização
  db.prepare(`
    INSERT OR REPLACE INTO propriedades_rurais (
      id, codigo_imovel, nome_imovel, nome_titular, municipio, uf, geometria_poligono, status_geo, tag_fonte, centroide_lat, centroide_lng, area_hectares, tenant_id
    ) VALUES (?, 'MT-OURO-VERDE-01', 'FAZENDA OURO VERDE', 'PRODUTOR TESTE PIVO', 'SORRISO', 'MT', '{"type":"Polygon","coordinates":[]}', 'CERTIFICADO', 'SIGEF', ?, ?, 3500, 'tenant-root-default')
  `).run(farmId, testLat, testLng);

  // 1ª Requisição de Satélite
  const res1 = await cognitiveQueueService.requestSatelliteAudit({
    entity_id: farmId,
    latitude: testLat,
    longitude: testLng,
    area_ha: 3500
  });

  // Aguarda processamento
  await new Promise(r => setTimeout(r, 120));

  // 2ª Requisição: Deve bater no Cache instantaneamente
  const t0 = performance.now();
  const res2 = await cognitiveQueueService.requestSatelliteAudit({
    entity_id: farmId,
    latitude: testLat,
    longitude: testLng
  });
  const tElapsed = performance.now() - t0;

  assert.strictEqual(res2.status, 'CACHED', 'Segunda requisição de satélite deve vir do CACHED');
  assert.strictEqual(res2.cached, true, 'Flag cached deve ser true');
  assert.ok(tElapsed < 15, `Latência do cache (${tElapsed.toFixed(2)}ms) deve ser < 15ms`);

  // Verifica se o registro da fazenda em propriedades_rurais recebeu os dados atualizados
  const farmRow = db.prepare(`SELECT * FROM propriedades_rurais WHERE id = ?`).get(farmId);
  assert.ok(farmRow, 'Fazenda deve existir no banco');
  assert.ok(farmRow.pivots_detected >= 2, 'Deve ter gravado os pivôs detectados (>= 2)');
  assert.ok(farmRow.silos_detected >= 3, 'Deve ter gravado os silos detectados (>= 3)');
  assert.ok(farmRow.vegetative_vigor_index >= 0.70, 'Deve ter gravado o NDVI');
  assert.ok(farmRow.satellite_audit_at, 'Deve ter gravado o carimbo satellite_audit_at');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Testes dos Endpoints REST HTTP da Fase 66.B
// ─────────────────────────────────────────────────────────────────────────────

await runAsyncTest('6. Endpoints REST da Fase 66.B: POST e GET /api/cognitive/vision/satellite-audit', async () => {
  let postStatus = null;
  let postJson = null;
  const mockPostRes = {
    status(c) { postStatus = c; return this; },
    json(j) { postJson = j; return this; }
  };

  await cognitiveController.requestSatelliteAudit({
    headers: {},
    body: {
      entity_id: 'fazenda-rest-demo',
      latitude: -13.123456,
      longitude: -56.654321,
      area_ha: 2200,
      crop_type: 'Milho'
    }
  }, mockPostRes);

  assert.strictEqual(postStatus, 200);
  assert.strictEqual(postJson.success, true);
  assert.ok(postJson.data.coords_hash, 'Deve conter coords_hash');

  // Aguarda fila
  await new Promise(r => setTimeout(r, 100));

  let getStatus = null;
  let getJson = null;
  const mockGetRes = {
    status(c) { getStatus = c; return this; },
    json(j) { getJson = j; return this; }
  };

  await cognitiveController.getSatelliteAudit({
    headers: {},
    query: {
      entity_id: 'fazenda-rest-demo',
      latitude: -13.123456,
      longitude: -56.654321
    }
  }, mockGetRes);

  assert.strictEqual(getStatus, 200);
  assert.strictEqual(getJson.success, true);
  assert.ok(getJson.data.infrastructure_tier, 'Deve retornar o tier identificado');
});

console.log(`\n🏁 Resultado: ${passedTests}/${totalTests} testes aprovados.`);
if (passedTests === totalTests) {
  console.log('🎉 FASE 66.B HOMOLOGADA COM 100% DE SUCESSO!\n');
} else {
  console.error('❌ Falha na homologação da FASE 66.B.\n');
  process.exit(1);
}
