async function testPaginationWfs() {
  const uf = 'RS';
  const layer = `sicar:sicar_imoveis_${uf.toLowerCase()}`;
  const cql = "municipio ILIKE '%passo fundo%'";
  const pageSize = 1500;
  const maxLimit = 10000;
  let allFeatures = [];
  let startIndex = 0;
  let hasMore = true;

  console.log(`Iniciando ingestão massiva paginada OGC para ${layer}...`);
  const t0 = Date.now();

  while (hasMore && allFeatures.length < maxLimit) {
    const url = new URL('https://geoserver.car.gov.br/geoserver/sicar/wfs');
    url.searchParams.set('service', 'WFS');
    url.searchParams.set('version', '2.0.0');
    url.searchParams.set('request', 'GetFeature');
    url.searchParams.set('typeNames', layer);
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('count', String(pageSize));
    url.searchParams.set('startIndex', String(startIndex));
    url.searchParams.set('CQL_FILTER', cql);

    const chunkStart = Date.now();
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(60000)
    });

    if (!res.ok) {
      console.warn(`Lote ${startIndex} falhou com status ${res.status}`);
      break;
    }

    const data = await res.json();
    const batch = Array.isArray(data.features) ? data.features : [];
    console.log(`↳ Lote [${startIndex}..${startIndex + batch.length}]: ${batch.length} parcelas recebidas em ${Date.now() - chunkStart}ms`);

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    allFeatures.push(...batch);
    startIndex += batch.length;

    if (batch.length < pageSize) {
      hasMore = false; // Última página
    }
  }

  console.log(`\n🎉 Ingestão concluída com sucesso! Total de parcelas reais: ${allFeatures.length} em ${Date.now() - t0}ms`);
}

testPaginationWfs().catch(e => console.error(e));
