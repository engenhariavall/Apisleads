/**
 * Teste de Validação Técnica: Refinamento da Tabela Analítica & Filtros Dinâmicos Agro
 * Executa testes end-to-end nas APIs de Leads Rurais, Filtros de Lavoura e Bulk Injection.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

function postJson(urlPath, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Tenant-ID': 'tenant-test-agro-refine'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('🌾 [TESTE] Iniciando validação do Refinamento da Tabela Analítica & Filtros Agro...');
  let passed = 0;
  let total = 0;

  function assert(desc, condition) {
    total++;
    if (condition) {
      console.log(`  ✅ PASSED: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${desc}`);
    }
  }

  try {
    // 1. Validação de Elementos no HTML
    const htmlPath = path.resolve('client/index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    assert('index.html contém thead id="leadsTableHead"', htmlContent.includes('id="leadsTableHead"'));
    assert('index.html contém seção de filtros agro #railAgroMachinerySection', htmlContent.includes('id="railAgroMachinerySection"'));
    assert('index.html contém seletor de porte da lavoura #selectLavouraPorte', htmlContent.includes('id="selectLavouraPorte"'));
    assert('index.html contém seletor de implemento alvo #selectImplementoAlvo', htmlContent.includes('id="selectImplementoAlvo"'));
    assert('index.html contém toggle de IE ativa #btnToggleIeOnly', htmlContent.includes('id="btnToggleIeOnly"'));
    assert('index.html contém toggle de WhatsApp agro #btnToggleAgroWaOnly', htmlContent.includes('id="btnToggleAgroWaOnly"'));
    assert('index.html contém botão de injeção em massa #btnInjectAllVisibleFarms', htmlContent.includes('id="btnInjectAllVisibleFarms"'));

    // 2. Injeção em Massa de Propriedades Rurais (POST /api/leads/rural/bulk)
    const testFarms = [
      {
        id: 'SIGEF-TEST-001',
        id_sigef: 'SIGEF-TEST-001',
        nome_imovel: 'Fazenda Santa Tereza do Guaporé',
        nome_titular: 'Sebastião Antunes Bezerra',
        municipio: 'Sorriso',
        uf: 'MT',
        area_calculada_ha: 2450.5,
        area_lavoura_util_ha: 1950.0,
        cpf_cnpj: '***.456.789-**',
        telefone: '(66) 99876-5432',
        whatsapp: '(66) 99876-5432',
        sefaz_ie: '13.456.789-1',
        situacao_ie: 'HABILITADO',
        dados_hidrograficos: { aptidao_pivo_irrigacao: 'VIAVEL', tem_outorga: true },
        dados_maquinario: { classe_colheitadeira: 'CLASSE_8', trator_potencia_cv: 320 }
      },
      {
        id: 'SIGEF-TEST-002',
        id_sigef: 'SIGEF-TEST-002',
        nome_imovel: 'Estância Bela Vista do Araguaia',
        nome_titular: 'Geraldo Magela Fontes',
        municipio: 'Querência',
        uf: 'MT',
        area_calculada_ha: 6800.0,
        area_lavoura_util_ha: 5400.0,
        cpf_cnpj: '***.123.456-**',
        telefone: '(66) 99654-3210',
        whatsapp: '(66) 99654-3210',
        sefaz_ie: '13.987.654-2',
        situacao_ie: 'HABILITADO',
        dados_hidrograficos: { aptidao_pivo_irrigacao: 'VIAVEL', rios_proximos: ['Rio Araguaia'] },
        dados_maquinario: { classe_colheitadeira: 'CLASSE_9', trator_potencia_cv: 450 }
      },
      {
        id: 'SIGEF-TEST-003',
        id_sigef: 'SIGEF-TEST-003',
        nome_imovel: 'Sítio Recanto dos Ipês',
        nome_titular: 'Valdir dos Santos',
        municipio: 'Sinop',
        uf: 'MT',
        area_calculada_ha: 380.0,
        area_lavoura_util_ha: 310.0,
        cpf_cnpj: '***.999.888-**',
        telefone: '',
        whatsapp: '',
        sefaz_ie: 'ISENTO',
        situacao_ie: 'ISENTO'
      }
    ];

    const bulkRes = await postJson('/api/leads/rural/bulk', { properties: testFarms });
    assert('POST /api/leads/rural/bulk retorna status 201', bulkRes.status === 201);
    assert('POST /api/leads/rural/bulk processa fazendas', bulkRes.data && bulkRes.data.count >= 3);

    // 3. Consulta de Leads com Origem RURAL_SIGEF
    const filterRural = await postJson('/api/leads/filter', {
      origem: 'RURAL_SIGEF',
      page: 1,
      page_size: 20
    });
    assert('POST /api/leads/filter com origem=RURAL_SIGEF retorna registros', filterRural.status === 200 && filterRural.data.data.length > 0);
    const hasSantaTereza = filterRural.data.data.some(l => (l.razao_social || '').includes('Santa Tereza') || (l.nome_fantasia || '').includes('Santa Tereza'));
    assert('Lead rural persistido contém Razão Social/Fazenda correta', hasSantaTereza);

    // 4. Teste de Filtro por Porte de Lavoura: MEDIA (500 a 2.000 ha)
    const filterMedia = await postJson('/api/leads/filter', {
      origem: 'RURAL_SIGEF',
      porte_lavoura: 'MEDIA',
      page: 1,
      page_size: 20
    });
    assert('Filtro porte_lavoura=MEDIA retorna dados', filterMedia.status === 200 && filterMedia.data.data.length > 0);
    const mediaHas1950 = filterMedia.data.data.some(l => l.area_lavoura_util_ha === 1950 || (l.nome_fantasia || '').includes('Santa Tereza'));
    assert('Fazenda de 1950 ha está presente no porte MEDIA', mediaHas1950);

    // 5. Teste de Filtro por Porte de Lavoura: MEGA (> 5.000 ha)
    const filterMega = await postJson('/api/leads/filter', {
      origem: 'RURAL_SIGEF',
      porte_lavoura: 'MEGA',
      page: 1,
      page_size: 20
    });
    assert('Filtro porte_lavoura=MEGA retorna dados', filterMega.status === 200 && filterMega.data.data.length > 0);
    const megaHas5400 = filterMega.data.data.some(l => l.area_lavoura_util_ha === 5400 || (l.nome_fantasia || '').includes('Bela Vista'));
    assert('Fazenda de 5400 ha está presente no porte MEGA', megaHas5400);

    // 6. Teste de Filtro: Apenas IE Ativa
    const filterIe = await postJson('/api/leads/filter', {
      origem: 'RURAL_SIGEF',
      apenas_ie_ativa: true,
      page: 1,
      page_size: 20
    });
    assert('Filtro apenas_ie_ativa=true retorna dados com IE ativa', filterIe.status === 200);
    const noIsentoInIe = filterIe.data.data.every(l => l.sefaz_ie_pf !== 'ISENTO' && l.sefaz_ie_pf !== null);
    assert('Nenhum registro ISENTO retornado quando apenas_ie_ativa=true', noIsentoInIe);

    // 7. Teste de Filtro: Apenas com WhatsApp
    const filterWa = await postJson('/api/leads/filter', {
      origem: 'RURAL_SIGEF',
      apenas_agro_whatsapp: true,
      page: 1,
      page_size: 20
    });
    assert('Filtro apenas_agro_whatsapp=true retorna dados com telefone/wa', filterWa.status === 200);
    const allHaveWa = filterWa.data.data.every(l => (l.whatsapp && l.whatsapp.length >= 10) || (l.telefone && l.telefone.length >= 10));
    assert('Todos os leads possuem WhatsApp/Telefone preenchido', allHaveWa);

    // 8. Teste de Filtro: Implemento Alvo = PIVO_IRRIGACAO
    const filterPivo = await postJson('/api/leads/filter', {
      origem: 'RURAL_SIGEF',
      implemento_alvo: 'PIVO_IRRIGACAO',
      page: 1,
      page_size: 20
    });
    assert('Filtro implemento_alvo=PIVO_IRRIGACAO filtra aptidão hídrica', filterPivo.status === 200 && filterPivo.data.data.length > 0);

    console.log(`\n🎉 RESULTADO FINAL: ${passed}/${total} asserções passaram com sucesso!`);
    if (passed === total) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Erro fatal durante a execução dos testes:', err);
    process.exit(1);
  }
}

runTests();
