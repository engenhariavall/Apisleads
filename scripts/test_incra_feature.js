async function testGetFeature() {
  const url = 'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_rs&service=WFS&version=1.0.0&request=DescribeFeatureType';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('DescribeFeatureType Status:', res.status);
    const txt = await res.text();
    console.log('DescribeFeatureType:', txt.slice(0, 500));

    // Test GetFeature
    const featUrl = 'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_rs&service=WFS&version=1.0.0&request=GetFeature&typeName=certificada_sigef_particular_rs&maxFeatures=2&outputFormat=geojson';
    const res2 = await fetch(featUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('GetFeature Status:', res2.status, res2.headers.get('content-type'));
    const txt2 = await res2.text();
    console.log('GetFeature snippet:', txt2.slice(0, 500));
  } catch(e) {
    console.log('Err:', e.message);
  }
}

testGetFeature();
