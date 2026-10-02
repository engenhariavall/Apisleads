import fs from 'fs';
import assert from 'assert';

console.log('--- TESTANDO EXPORTAÇÃO & GEOFENCING META ADS (ETAPA 4) ---');

async function testExportEndpoints() {
  const baseUrl = 'http://localhost:3000';

  // 1. Testar GET /api/competitors/export-geofencing em CSV Global
  console.log('1. Testando GET /api/competitors/export-geofencing?format=csv (Modo Global)...');
  const resGlobalCsv = await fetch(`${baseUrl}/api/competitors/export-geofencing?format=csv`);
  assert.strictEqual(resGlobalCsv.status, 200, `Status esperado 200, recebido ${resGlobalCsv.status}`);
  const csvText = await resGlobalCsv.text();
  assert(csvText.includes('ranking;municipio;uf;gap_score;prioridade;latitude;longitude;radius_km'), 'Headers CSV inválidos ou ausentes');
  assert(csvText.includes('meta_ads_target_string'), 'Header meta_ads_target_string ausente no CSV');
  
  // Validar formato de linha e coordenadas decimais
  const lines = csvText.trim().split('\r\n');
  assert(lines.length > 2, 'CSV deve conter cabeçalho + linhas de dados');
  const sampleRow = lines[1].split(';').map(f => f.replace(/^"|"$/g, ''));
  assert(sampleRow.length >= 11, `A linha deve conter 11 colunas, possui ${sampleRow.length}`);
  const lat = parseFloat(sampleRow[5]);
  const lng = parseFloat(sampleRow[6]);
  assert(!isNaN(lat) && lat < 5 && lat > -35, `Latitude fora da faixa do Brasil: ${lat}`);
  assert(!isNaN(lng) && lng < -30 && lng > -75, `Longitude fora da faixa do Brasil: ${lng}`);
  const metaString = sampleRow[10];
  assert(metaString.includes(':+'), `meta_ads_target_string mal formatada: ${metaString}`);
  console.log(`   ✔ CSV Global validado: ${lines.length - 1} zonas de Geofencing geradas.`);
  console.log(`   ✔ Exemplo de alvo Meta Ads: ${metaString}`);

  // 2. Testar GET /api/competitors/export-geofencing em JSON
  console.log('\n2. Testando GET /api/competitors/export-geofencing?format=json (Modo JSON)...');
  const resGlobalJson = await fetch(`${baseUrl}/api/competitors/export-geofencing?format=json`);
  assert.strictEqual(resGlobalJson.status, 200);
  const dataJson = await resGlobalJson.json();
  assert.strictEqual(dataJson.success, true);
  assert.strictEqual(dataJson.mode, 'AGGREGATED_NETWORK');
  assert(Array.isArray(dataJson.data) && dataJson.data.length > 0);
  assert(dataJson.data[0].meta_ads_target_string, 'meta_ads_target_string ausente no JSON');
  console.log(`   ✔ JSON Global validado: ${dataJson.total_zones} zonas retornadas.`);

  // 3. Obter um concorrente para testar o Modo Relativo
  console.log('\n3. Testando Modo Relativo com concorrente específico...');
  const resList = await fetch(`${baseUrl}/api/competitors/list`);
  const listJson = await resList.json();
  assert(listJson.data && listJson.data.length > 0, 'Deve haver ao menos um concorrente na base');
  const testComp = listJson.data[0];

  const resRelativeCsv = await fetch(`${baseUrl}/api/competitors/export-geofencing?competitor_id=${testComp.id}&format=csv`);
  assert.strictEqual(resRelativeCsv.status, 200);
  const relCsvText = await resRelativeCsv.text();
  assert(relCsvText.includes('ranking;municipio'), 'CSV Relativo deve conter cabeçalhos');

  const resRelativeJson = await fetch(`${baseUrl}/api/competitors/export-geofencing?competitor_id=${testComp.id}&format=json`);
  assert.strictEqual(resRelativeJson.status, 200);
  const relJson = await resRelativeJson.json();
  assert.strictEqual(relJson.mode, 'SINGLE_COMPETITOR_RELATIVE');
  assert.strictEqual(relJson.competitor_id, testComp.id);
  console.log(`   ✔ Modo Relativo validado para ${testComp.razao_social} (${testComp.municipio}/${testComp.uf}): ${relJson.total_zones} zonas.`);

  // 4. Validar integração Frontend (app.js e index.html)
  console.log('\n4. Validando integração do Frontend...');
  const appCode = fs.readFileSync('client/js/app.js', 'utf8');
  assert(appCode.includes('/api/competitors/export-geofencing'), 'Rota ausente em app.js');
  assert(appCode.includes('labelExportGeofence'), 'labelExportGeofence referenciado em app.js');
  assert(appCode.includes('showToast'), 'Toast estratégico ausente em app.js');

  const htmlCode = fs.readFileSync('client/index.html', 'utf8');
  assert(htmlCode.includes('id="btnExportGeofence"'), 'Botão btnExportGeofence presente em index.html');
  assert(htmlCode.includes('id="labelExportGeofence"'), 'labelExportGeofence presente em index.html');
  console.log('   ✔ Botão, spinner e feedback tático validados no frontend.');

  console.log('\n=============================================================');
  console.log('🎉 ETAPA 4 (EXPORTAÇÃO & GEOFENCING META ADS) HOMOLOGADA COM SUCESSO! 🎉');
  console.log('=============================================================');
}

testExportEndpoints().catch(err => {
  console.error('❌ Falha nos testes da Etapa 4:', err);
  process.exit(1);
});
