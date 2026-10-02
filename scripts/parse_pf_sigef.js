async function parsePassoFundoParcels() {
  const url = 'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_rs&service=WFS&version=1.0.0&request=GetFeature&typeName=certificada_sigef_particular_rs&cql_filter=codigo_municipio=\'4314100\'&maxFeatures=10';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const xml = await res.text();
  console.log('XML full:\n', xml);
}

parsePassoFundoParcels();
