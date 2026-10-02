async function testIncraEndpoints() {
  const endpoints = [
    'https://geoserver.incra.gov.br/geoserver/wfs?service=WFS&version=1.0.0&request=GetCapabilities',
    'https://sigef.incra.gov.br/geoserver/wfs?service=WFS&version=1.0.0&request=GetCapabilities',
    'https://acervofundiario.incra.gov.br/geoserver/wfs?service=WFS&version=1.0.0&request=GetCapabilities',
    'https://geoserver.car.gov.br/geoserver/sicar/wfs?service=WFS&version=1.0.0&request=GetCapabilities'
  ];

  for (const url of endpoints) {
    console.log(`Testing: ${url.slice(0, 60)}...`);
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      console.log(`Status: ${res.status} ${res.statusText}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`Response length: ${text.length} bytes`);
        // Check for FeatureTypes
        const matches = text.match(/<Name>(.*?)<\/Name>/g) || [];
        console.log(`First 10 FeatureTypes:`, matches.slice(0, 10).map(m => m.replace(/<\/?Name>/g, '')));
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
}

testIncraEndpoints();
