async function testSigefDetail() {
  const url = 'https://sigef.incra.gov.br/consultar/imoveis/detalhe/37663641-4e0c-408c-9379-9969bcb6a3dd';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('Detail Status:', res.status);
    const txt = await res.text();
    console.log('Snippet:', txt.slice(0, 800));
    // Check if there are owners or detentores
    const matches = txt.match(/Detentor|Propriet[aá]rio|Requerente|Titular/gi);
    console.log('Matches:', matches);
  } catch(e) {
    console.log('Err:', e.message);
  }
}

testSigefDetail();
