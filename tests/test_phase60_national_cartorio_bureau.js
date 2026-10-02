/**
 * Teste de Validação da Fase 60 Avançada:
 * 1. Motor Nacional Multi-Município (IBGE / CAR Decoder de 5.570 cidades)
 * 2. Enriquecimento Cadastral com Confiança 85% e QSA Individual
 * 3. Verificação Cartorial 100% Sob Demanda (CRI / SIGEF / Gap Fundiário)
 * 4. Busca de Celular Pessoal do Sócio no Bureau Sob Demanda
 */

import { parseCarCode, resolveMunicipioByIbge, extractLocationFromProperty } from '../server/src/services/ibgeService.js';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 [TEST FASE 60] Iniciando Bateria de Testes Integrados...\n');
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
    }
  }

  // ── TESTE 1: IBGE Service & CAR Decoder Nacional ──
  console.log('--- TESTE 1: Decodificador Universal de CAR (5.570 Municípios) ---');
  const carRS = 'RS-4320107-53444DEF6C0842F5BD7D854F2746C9FD';
  const parsedRS = parseCarCode(carRS);
  assert(parsedRS.uf === 'RS' && parsedRS.ibge === '4320107', `Decodificou UF RS e IBGE 4320107 (${parsedRS.uf}, ${parsedRS.ibge})`);

  const locRS = await extractLocationFromProperty({ codigo_car: carRS });
  assert(locRS && locRS.municipio === 'SARANDI' && locRS.uf === 'RS', `Resolveu município com precisão: ${locRS?.municipio} - ${locRS?.uf}`);

  const carMT = 'MT-5107909-AABBCCDDEEFF11223344556677889900';
  const locMT = await extractLocationFromProperty({ codigo_car: carMT });
  assert(locMT && locMT.municipio === 'SINOP' && locMT.uf === 'MT', `Resolveu MT polo agro: ${locMT?.municipio} - ${locMT?.uf}`);

  // ── TESTE 2: POST /api/fundiario/enrich-osint com CAR sem Município explícito ──
  console.log('\n--- TESTE 2: Enriquecimento OSINT Rural com Estimativa Cadastral 85% ---');
  try {
    const resEnrich = await fetch(`${BASE_URL}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'RS-4320107-53444DEF6C0842F5BD7D854F2746C9FD',
        area_hectares: 350.5
      })
    });
    const enrichData = await resEnrich.json();

    assert(resEnrich.status === 200, `Status HTTP 200 retornado`);
    assert(enrichData.razao_social && !enrichData.razao_social.includes('sigilo'), `Razão Social corporativa revelada: ${enrichData.razao_social}`);
    assert(enrichData.tipo_pessoa === 'PJ', `Classificado como PJ: ${enrichData.tipo_pessoa}`);
    assert(enrichData.correspondencia_cadastral && enrichData.correspondencia_cadastral.confianca === 85, `Badge de Confiança 85% presente: ${enrichData.correspondencia_cadastral?.confianca}%`);
    assert(Array.isArray(enrichData.qsa) && enrichData.qsa.length > 0, `QSA retornado com ${enrichData.qsa?.length} sócios tomadores de decisão`);
    if (enrichData.qsa && enrichData.qsa[0]) {
      console.log(`     Sócio 1 identificado: ${enrichData.qsa[0].nome} (${enrichData.qsa[0].qual})`);
    }
  } catch (err) {
    assert(false, `Falha na requisição de enriquecimento: ${err.message}`);
  }

  // ── TESTE 3: POST /api/fundiario/verify-cartorio (Certificação Cartorial 100% vs Gap Fundiário) ──
  console.log('\n--- TESTE 3: Verificação Cartorial CRI / SIGEF Sob Demanda ---');
  try {
    // 3a. Propriedade com registro SIGEF oficial
    const resCartorioOficial = await fetch(`${BASE_URL}/api/fundiario/verify-cartorio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_sigef: '50838517-ad49-4675-b7e8-c1221fede444',
        codigo_imovel: '8710520320934',
        municipio: 'PASSO FUNDO',
        uf: 'RS'
      })
    });
    const dataCartorioOficial = await resCartorioOficial.json();
    assert(resCartorioOficial.status === 200, `Endpoint de cartório respondeu 200`);
    assert(dataCartorioOficial.certificacao_cartorio && dataCartorioOficial.certificacao_cartorio.status === 'CERTIFICADO_OFICIAL', `Imóvel reconhecido como CERTIFICADO_OFICIAL (100% de Fé Pública)`);
    assert(dataCartorioOficial.certificacao_cartorio && dataCartorioOficial.certificacao_cartorio.matricula, `Matrícula do Cartório revelada: ${dataCartorioOficial.certificacao_cartorio?.matricula}`);

    // 3b. Propriedade típica de Gap Fundiário (Sul do Brasil / RS)
    const resGap = await fetch(`${BASE_URL}/api/fundiario/verify-cartorio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'RS-4320107-53444DEF6C0842F5BD7D854F2746C9FD',
        municipio: 'SARANDI',
        uf: 'RS'
      })
    });
    const dataGap = await resGap.json();
    assert(dataGap.certificacao_cartorio && dataGap.certificacao_cartorio.status === 'GAP_FUNDIARIO', `Propriedade sem SIGEF identificada como GAP_FUNDIARIO (Lead comercial para regularização)`);
    assert(dataGap.certificacao_cartorio && dataGap.certificacao_cartorio.lei === 'Lei Federal 10.267/2001', `Fundamentação jurídica correta (Lei 10.267/2001)`);
  } catch (err) {
    assert(false, `Falha no teste de cartório: ${err.message}`);
  }

  // ── TESTE 4: POST /api/osint/enrich-whatsapp-bureau (Busca de Celular de Sócio no Bureau) ──
  console.log('\n--- TESTE 4: Consulta On-Demand de Contato de Sócio no Bureau ---');
  try {
    const resBureau = await fetch(`${BASE_URL}/api/osint/enrich-whatsapp-bureau`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_titular: 'VALDOMIRO SCORTEGAGNA',
        cpf_cnpj_titular: '92.890.312/0001-44',
        uf: 'RS',
        municipio: 'SARANDI'
      })
    });
    const dataBureau = await resBureau.json();
    assert(resBureau.status === 200, `Bureau respondeu com HTTP 200`);
    assert(dataBureau.success === true && dataBureau.whatsapp, `WhatsApp do sócio retornado: ${dataBureau.whatsapp} (Origem: ${dataBureau.source})`);
  } catch (err) {
    assert(false, `Falha no teste de bureau de sócio: ${err.message}`);
  }

  console.log(`\n====================================================`);
  console.log(`🎯 RESULTADO FASE 60: ${passed}/${total} testes aprovados (${Math.round((passed/total)*100)}%)`);
  console.log(`====================================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
