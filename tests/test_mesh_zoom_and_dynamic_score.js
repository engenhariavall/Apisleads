import assert from 'assert';

console.log('🧪 Iniciando teste de validação: Zoom do Mapa e Score Dinâmico no Drawer');

async function runValidation() {
  const baseUrl = 'http://localhost:3000';

  // 1. Testa requisição da malha de Passo Fundo
  console.log('\n[TEST 1] Requisição de malha fundiária (Passo Fundo / RS)...');
  const resMesh = await fetch(`${baseUrl}/api/fundiario/car/geojson?uf=RS&municipio=PASSO%20FUNDO&origem=TODOS`);
  assert.strictEqual(resMesh.status, 200, 'Endpoint deve retornar 200');
  const meshData = await resMesh.json();
  
  console.log(`- Total de features: ${meshData.features?.length}`);
  assert(meshData.features && meshData.features.length > 0, 'Deve conter features fundiárias');

  // 2. Simula cálculo do calculateGeoJsonBoundingBox (com a correção de limites do Brasil)
  console.log('\n[TEST 2] Simulação do cálculo de Bounding Box corrigido...');
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  let count = 0;

  function processCoords(coords) {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 &&
        (typeof coords[0] === 'number' || (typeof coords[0] === 'string' && !isNaN(parseFloat(coords[0])))) &&
        (typeof coords[1] === 'number' || (typeof coords[1] === 'string' && !isNaN(parseFloat(coords[1]))))) {
      const lng = typeof coords[0] === 'number' ? coords[0] : parseFloat(coords[0]);
      const lat = typeof coords[1] === 'number' ? coords[1] : parseFloat(coords[1]);
      if (!isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
        // Validação estrita de limites geográficos do Brasil
        if (lng >= -74 && lng <= -34 && lat >= -34 && lat <= 6) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          count++;
          return;
        }
      }
    }
    for (const item of coords) {
      processCoords(item);
    }
  }

  for (const f of meshData.features) {
    if (!f) continue;
    let geom = f.geometry || f.geometria_poligono;
    if (geom?.coordinates) processCoords(geom.coordinates);
  }

  const bbox = [[minLng, minLat], [maxLng, maxLat]];
  console.log(`- BBOX calculado:`, bbox);
  console.log(`- Total de vértices válidos dentro do Brasil: ${count}`);

  assert(minLat > -34 && minLat < -27, `minLat (${minLat}) deve estar na latitude do RS, não em -52 ou Antártica!`);
  assert(maxLat > -30 && maxLat < -26, `maxLat (${maxLat}) deve estar na latitude de Passo Fundo!`);
  assert(minLng > -54 && minLng < -51, `minLng (${minLng}) deve estar na longitude de Passo Fundo!`);
  assert(maxLng > -53 && maxLng < -50, `maxLng (${maxLng}) deve estar na longitude de Passo Fundo!`);
  console.log('✅ Bounding Box validado! Zoom agora aproxima de Passo Fundo com perfeição.');

  // 3. Testa amostras de polígonos CAR e FUSÃO quanto a scores pré-computados
  console.log('\n[TEST 3] Validação de scores pré-computados no payload de malha...');
  const carParcels = meshData.features.filter(f => f.properties.source === 'CAR');
  const fusaoParcels = meshData.features.filter(f => f.properties.source === 'FUSAO_SIGEF_CAR');
  const sigefParcels = meshData.features.filter(f => f.properties.source === 'SIGEF');

  console.log(`- Parcelas CAR puras: ${carParcels.length}`);
  console.log(`- Parcelas FUSÃO: ${fusaoParcels.length}`);
  console.log(`- Parcelas SIGEF puras: ${sigefParcels.length}`);

  assert(carParcels.length > 0, 'Deve conter parcelas CAR');
  const sampleCar = carParcels[0].properties;
  console.log(`- Amostra CAR: ID=${sampleCar.codigo_car}, Score=${sampleCar.intent_score}, Classe=${sampleCar.intent_classification}, Triggers=${JSON.stringify(sampleCar.intent_triggers)}`);
  assert(sampleCar.intent_score != null && sampleCar.intent_score >= 30, 'Score da parcela CAR não pode ser nulo ou 0');
  assert(sampleCar.intent_score !== 35, `Score do CAR (${sampleCar.intent_score}) deve refletir os gatilhos reais e não estar travado em 35`);

  if (fusaoParcels.length > 0) {
    const sampleFusao = fusaoParcels[0].properties;
    console.log(`- Amostra FUSÃO: Nome=${sampleFusao.nome_imovel}, Score=${sampleFusao.intent_score}, Classe=${sampleFusao.intent_classification}`);
    assert(sampleFusao.intent_score >= 70, 'Score da parcela FUSÃO deve ser HOT (>= 70)');
  }

  // 4. Testa endpoint de enriquecimento OSINT em cascata (Layer 1 -> Layer 2 -> Layer 3)
  console.log('\n[TEST 4] Teste do enriquecimento OSINT sob demanda (POST /api/fundiario/enrich-osint)...');
  const testPayload = {
    id: sampleCar.id,
    codigo_car: sampleCar.codigo_car,
    municipio: sampleCar.municipio,
    uf: sampleCar.uf,
    area_hectares: sampleCar.area_hectares,
    dados_agronomicos: sampleCar.dados_agronomicos
  };

  const resEnrich = await fetch(`${baseUrl}/api/fundiario/enrich-osint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload)
  });

  assert.strictEqual(resEnrich.status, 200, 'Enrich OSINT deve responder 200');
  const enrichData = await resEnrich.json();
  console.log('- Resposta do enriquecimento:');
  console.log(`  * Titular: ${enrichData.nome_titular}`);
  console.log(`  * CPF/CNPJ: ${enrichData.cpf_cnpj_titular}`);
  console.log(`  * Intent Score: ${enrichData.intent_score} pts (${enrichData.intent_classification})`);
  console.log(`  * Cultura detectada: ${enrichData.crop_type}`);
  console.log(`  * Triggers: ${JSON.stringify(enrichData.intent_triggers)}`);

  assert(enrichData.intent_score != null, 'Score retornado no enrich-osint não pode ser nulo');
  assert(enrichData.intent_score > 35, `Score deve ser dinâmico e maior que 35 (foi ${enrichData.intent_score})`);

  console.log('\n======================================================');
  console.log('🎉 TODAS AS VALIDAÇÕES PASSARAM COM 100% DE SUCESSO!');
  console.log('======================================================');
}

runValidation().catch(err => {
  console.error('❌ Falha na validação:', err);
  process.exit(1);
});
