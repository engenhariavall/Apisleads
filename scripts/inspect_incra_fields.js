async function inspectFields() {
  const featUrl = 'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_rs&service=WFS&version=1.0.0&request=GetFeature&typeName=certificada_sigef_particular_rs&maxFeatures=1';
  const res2 = await fetch(featUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const txt = await res2.text();
  console.log(txt);
}
inspectFields();
