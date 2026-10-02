async function checkFormats() {
  const url = 'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_rs&service=WFS&version=1.0.0&request=GetCapabilities';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const txt = await res.text();
    const formats = txt.match(/<ResultFormat>[\s\S]*?<\/ResultFormat>/gi) || txt.match(/<Format>[\s\S]*?<\/Format>/gi);
    console.log('Formats found:', formats);
    
    // Also test GML2 default
    const featUrl = 'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_rs&service=WFS&version=1.0.0&request=GetFeature&typeName=certificada_sigef_particular_rs&maxFeatures=1';
    const res2 = await fetch(featUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('Default GetFeature status:', res2.status);
    const txt2 = await res2.text();
    console.log('Default GetFeature snippet:', txt2.slice(0, 1000));
  } catch(e) {
    console.log('Err:', e.message);
  }
}

checkFormats();
