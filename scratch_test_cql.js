async function test() {
  const url = new URL('https://geoserver.car.gov.br/geoserver/sicar/wfs');
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', '2.0.0');
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('typeNames', 'sicar:sicar_imoveis_rs');
  url.searchParams.set('outputFormat', 'application/json');
  url.searchParams.set('count', '10');
  url.searchParams.set('CQL_FILTER', "municipio ILIKE '%CRUZ ALTA%'");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  console.log('Status with CQL_FILTER:', res.status);
  const json = await res.json();
  console.log('Features count:', json.features?.length);
  if (json.features?.[0]) console.log('City of first feature:', json.features[0].properties.municipio);
}
test().catch(e => console.error(e));
