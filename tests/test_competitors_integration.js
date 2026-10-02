async function testCompetitorsApi() {
  console.log('Testing Competitors APIs...');
  
  // 1. Test GET /api/competitors/list
  const resList = await fetch('http://localhost:3000/api/competitors/list');
  const jsonList = await resList.json();
  console.log('1. /api/competitors/list status:', resList.status, 'total_count:', jsonList.total_count);

  // 2. Test POST /api/competitors/seed-reference
  const resSeed = await fetch('http://localhost:3000/api/competitors/seed-reference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const jsonSeed = await resSeed.json();
  console.log('2. /api/competitors/seed-reference status:', resSeed.status, 'count:', jsonSeed.count, 'message:', jsonSeed.message);

  // 3. Test GET /api/competitors/list again
  const resListAfter = await fetch('http://localhost:3000/api/competitors/list');
  const jsonListAfter = await resListAfter.json();
  console.log('3. /api/competitors/list after seed:', jsonListAfter.total_count);
  if (jsonListAfter.data && jsonListAfter.data.length > 0) {
    const first = jsonListAfter.data[0];
    console.log('Sample competitor:', {
      razao_social: first.razao_social,
      municipio: first.municipio,
      uf: first.uf,
      fragility: first.fragility?.fragility_score,
      risk_level: first.fragility?.risk_level
    });
  }

  // 4. Test GET /api/competitors/gaps
  const resGaps = await fetch('http://localhost:3000/api/competitors/gaps?buffer_km=50');
  const jsonGaps = await resGaps.json();
  console.log('4. /api/competitors/gaps status:', resGaps.status, 'total_gaps:', jsonGaps.total_gaps, 'mode:', jsonGaps.mode);
  if (jsonGaps.data && jsonGaps.data.length > 0) {
    console.log('Top gap zone:', {
      municipio: jsonGaps.data[0].municipio,
      uf: jsonGaps.data[0].uf,
      gap_score: jsonGaps.data[0].gap_score,
      min_distance_competitor_km: jsonGaps.data[0].min_distance_competitor_km
    });
  }

  // 5. Test POST /api/competitors/lookup (CNPJ da C.Vale)
  const resLookup = await fetch('http://localhost:3000/api/competitors/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cnpj: '77.858.637/0001-34' })
  });
  const jsonLookup = await resLookup.json();
  console.log('5. /api/competitors/lookup status:', resLookup.status, 'success:', jsonLookup.success, 'empresa:', jsonLookup.data?.razao_social);

  // 6. Test GET /api/competitors/export-geofencing
  const resExport = await fetch('http://localhost:3000/api/competitors/export-geofencing?buffer_km=50');
  console.log('6. /api/competitors/export-geofencing status:', resExport.status, 'Content-Type:', resExport.headers.get('content-type'));
  const exportCsv = await resExport.text();
  console.log('Export CSV preview (first 2 lines):\n', exportCsv.split('\n').slice(0, 3).join('\n'));
}

testCompetitorsApi().catch(err => console.error('Test failed:', err));
