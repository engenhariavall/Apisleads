async function testIncraPassoFundo() {
  // Passo Fundo IBGE: 4314100
  // BBOX Passo Fundo aprox: -52.55, -28.38, -52.32, -28.15
  const urls = [
    'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_rs&service=WFS&version=1.0.0&request=GetFeature&typeName=certificada_sigef_particular_rs&cql_filter=codigo_municipio=\'4314100\'&maxFeatures=5',
    'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_rs&service=WFS&version=1.0.0&request=GetFeature&typeName=certificada_sigef_particular_rs&BBOX=-52.55,-28.38,-52.32,-28.15&maxFeatures=5'
  ];

  for (const u of urls) {
    console.log('Querying:', u.slice(0, 100));
    try {
      const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      console.log('Status:', res.status);
      const txt = await res.text();
      console.log('Length:', txt.length);
      console.log('Snippet:', txt.slice(0, 600));
    } catch(e) {
      console.log('Err:', e.message);
    }
  }
}

testIncraPassoFundo();
