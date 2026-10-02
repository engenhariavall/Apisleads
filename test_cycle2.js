import http from 'http';

function postJson(urlPath, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: res.headers['content-type']?.includes('json') ? JSON.parse(body) : body });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Iniciando Bateria de Testes do Ciclo 2 (ICP, Travas & Meta Ads)...\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
    }
  }

  try {
    // Teste 1: Filtragem por ICP BUYER (Compradores)
    const buyersRes = await postJson('/api/leads/filter', {
      target_type: 'BUYER',
      page: 1,
      page_size: 50
    });
    assert(buyersRes.status === 200, 'POST /api/leads/filter retornou status 200 para Compradores');
    assert(buyersRes.body.data.length > 0, `Retornou ${buyersRes.body.data.length} compradores`);
    const hasSupplierInBuyerQuery = buyersRes.body.data.some(l => l.target_type !== 'BUYER');
    assert(!hasSupplierInBuyerQuery, 'Nenhum lead retornado possui target_type diferente de BUYER');

    // Teste 2: Filtragem por ICP SUPPLIER (Fornecedores/Revendas)
    const suppliersRes = await postJson('/api/leads/filter', {
      target_type: 'SUPPLIER',
      page: 1,
      page_size: 50
    });
    assert(suppliersRes.status === 200, 'POST /api/leads/filter retornou status 200 para Fornecedores');
    assert(suppliersRes.body.data.length > 0, `Retornou ${suppliersRes.body.data.length} fornecedores`);
    const hasBuyerInSupplierQuery = suppliersRes.body.data.some(l => l.target_type !== 'SUPPLIER');
    assert(!hasBuyerInSupplierQuery, 'Nenhum lead retornado possui target_type diferente de SUPPLIER');

    // Teste 3: Trava de Qualificação - Exclusão de MEI
    const noMeiRes = await postJson('/api/leads/filter', {
      excluir_mei: true,
      page: 1,
      page_size: 50
    });
    assert(noMeiRes.status === 200, 'Filtro com excluir_mei retornou status 200');
    const hasMei = noMeiRes.body.data.some(l => l.porte === 'MEI');
    assert(!hasMei, 'Nenhum lead retornado com excluir_mei é MEI');

    // Teste 4: Trava de Capital Social Mínimo
    const minCapitalRes = await postJson('/api/leads/filter', {
      capital_social_min: 500000,
      page: 1,
      page_size: 50
    });
    assert(minCapitalRes.status === 200, 'Filtro capital_social_min = 500000 retornou 200');
    assert(minCapitalRes.body.data.length > 0, `Retornou ${minCapitalRes.body.data.length} empresas de grande capital`);
    const lowCapital = minCapitalRes.body.data.some(l => l.capital_social < 500000);
    assert(!lowCapital, 'Todas as empresas retornadas possuem capital social >= R$ 500.000');

    // Teste 5: Exportação Meta Ads com Hashing SHA-256 e ZIP (CEP)
    const metaExportRes = await postJson('/api/leads/export', {
      format: 'meta_ads',
      filters: { target_type: 'BUYER', excluir_mei: true }
    });
    assert(metaExportRes.status === 200, 'Exportação Meta Ads retornou status 200');
    assert(metaExportRes.headers['content-disposition'].includes('meta-ads-audiences-'), 'Nome de arquivo correto');
    
    const metaLines = metaExportRes.body.split('\r\n');
    assert(metaLines[0].includes('zip'), 'Cabeçalho Meta Ads inclui coluna "zip"');
    assert(metaLines[0].includes('email,phone,fn,ln,ct,st,zip,country'), 'Ordem estrita do cabeçalho Meta Ads preservada');
    
    // Valida se zip e telefones foram hasheados com SHA-256 (64 hex characters)
    const sampleRow = metaLines[1];
    const columns = sampleRow.split(',');
    // zip é a 7ª coluna (índice 6)
    const zipHashed = columns[6].replace(/"/g, '');
    assert(zipHashed === '' || /^[a-f0-9]{64}$/.test(zipHashed), `Campo zip hasheado com SHA-256 válido (tam: ${zipHashed.length})`);
    
    // Teste 6: Exportação Comercial B2B com Perfil ICP
    const b2bExportRes = await postJson('/api/leads/export', {
      format: 'standard',
      filters: { page: 1, page_size: 10 }
    });
    assert(b2bExportRes.status === 200, 'Exportação B2B retornou status 200');
    const b2bLines = b2bExportRes.body.split('\r\n');
    assert(b2bLines[0].includes('Perfil ICP'), 'Planilha B2B contém a coluna "Perfil ICP"');
    assert(b2bLines[1].includes('Comprador (ICP)') || b2bLines[1].includes('Fornecedor/Revenda'), 'Linha preenchida com ICP descritivo');

    console.log(`\n========================================`);
    console.log(`🎯 RESULTADO FINAL: ${passed}/${total} testes aprovados.`);
    console.log(`========================================\n`);

    if (passed === total) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('Erro na execução dos testes:', error);
    process.exit(1);
  }
}

runTests();
