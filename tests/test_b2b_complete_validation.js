import assert from 'assert';

console.log('======================================================================');
console.log('🏁 TESTE INTEGRADO: VALIDAÇÃO COMPLETA B2B & SELETORES IBGE 🏁');
console.log('======================================================================\n');

const BASE_URL = 'http://localhost:3000';
const AVALL_TENANT = 'tenant-e6094206';

async function runValidation() {
  // 1. Teste de Localizações (/api/locations) para o Tenant Avall
  console.log('1. TESTANDO ROTA /api/locations PARA O TENANT AVALL:');
  const resLoc = await fetch(`${BASE_URL}/api/locations`, {
    headers: { 'x-tenant-id': AVALL_TENANT }
  });
  assert.strictEqual(resLoc.status, 200, 'GET /api/locations deve retornar 200');
  const locData = await resLoc.json();
  assert(locData.ufs.length >= 27, 'Deve conter todas as 27 UFs do Brasil');
  assert(locData.ufs.includes('RS'), 'Deve conter RS');
  assert(locData.ufs.includes('MT'), 'Deve conter MT');
  assert(locData.citiesByUf['RS'].includes('PASSO FUNDO'), 'RS deve conter PASSO FUNDO');
  assert(locData.citiesByUf['RS'].includes('CRUZ ALTA'), 'RS deve conter CRUZ ALTA');
  assert(locData.citiesByUf['MT'].includes('SORRISO'), 'MT deve conter SORRISO');
  console.log(`   ✔ 1.1 Localizações validadas: ${locData.ufs.length} UFs disponíveis, RS e MT com polos completos.`);

  // 2. Teste da Tabela Analítica (/api/leads/filter) com Fornecedores / Revendas em Passo Fundo
  console.log('\n2. TESTANDO TABELA ANALÍTICA (/api/leads/filter) PARA FORNECEDORES B2B:');
  const resFilter = await fetch(`${BASE_URL}/api/leads/filter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': AVALL_TENANT
    },
    body: JSON.stringify({
      estados: ['RS'],
      cidades: ['PASSO FUNDO'],
      target_type: 'SUPPLIER',
      origem: 'EMPRESAS',
      page: 1,
      page_size: 15
    })
  });
  assert.strictEqual(resFilter.status, 200, 'POST /api/leads/filter deve retornar 200');
  const filterData = await resFilter.json();
  assert.strictEqual(filterData.total_count, 6, 'Deve encontrar exatamente 6 revendas B2B em Passo Fundo');
  assert.strictEqual(filterData.data.length, 6, 'Deve retornar 6 itens na página');

  const names = filterData.data.map(d => d.nome_fantasia || d.razao_social);
  console.log('   Empresas recuperadas na Tabela Analítica:');
  names.forEach(n => console.log(`     • ${n}`));
  assert(names.some(n => n.includes('JOHN DEERE')), 'Deve conter John Deere');
  assert(names.some(n => n.includes('NEW HOLLAND')), 'Deve conter New Holland');
  assert(names.some(n => n.includes('AGROFEL')), 'Deve conter Agrofel');
  console.log('   ✔ 2.1 Concessionárias e revendas recuperadas com êxito para a agência Avall.');

  // 3. Teste do Mapa Espacial (/api/gis/geojson)
  console.log('\n3. TESTANDO MAPA ESPACIAL (/api/gis/geojson) COM PINS COMERCIAIS:');
  const resGeo = await fetch(`${BASE_URL}/api/gis/geojson`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': AVALL_TENANT
    },
    body: JSON.stringify({
      filters: {
        estados: ['RS'],
        cidades: ['PASSO FUNDO'],
        target_type: 'SUPPLIER',
        origem: 'EMPRESAS'
      }
    })
  });
  assert.strictEqual(resGeo.status, 200, 'POST /api/gis/geojson deve retornar 200');
  const geoData = await resGeo.json();
  assert(Array.isArray(geoData.features) && geoData.features.length === 6, 'Deve conter 6 features GeoJSON');

  const firstFeature = geoData.features[0];
  assert(Array.isArray(firstFeature.geometry.coordinates) && firstFeature.geometry.coordinates.length === 2, 'Coordenadas devem ser válidas [lng, lat]');
  assert.strictEqual(typeof firstFeature.geometry.coordinates[0], 'number', 'Longitude deve ser numérica');
  assert.strictEqual(typeof firstFeature.geometry.coordinates[1], 'number', 'Latitude deve ser numérica');
  console.log(`   ✔ 3.1 6 Pins comerciais gerados com coordenadas geográficas em Passo Fundo: [${firstFeature.geometry.coordinates.join(', ')}].`);

  console.log('\n======================================================================');
  console.log('🎉 TODAS AS VALIDAÇÕES FORAM HOMOLOGADAS COM 100% DE SUCESSO! 🎉');
  console.log('======================================================================\n');
}

runValidation().catch(err => {
  console.error('❌ Falha na validação:', err);
  process.exit(1);
});
