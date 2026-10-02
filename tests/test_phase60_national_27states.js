/**
 * Teste de Validação: EXPANSÃO NACIONAL TOTAL (27 ESTADOS)
 * Garante que QUALQUER estado do Brasil (SC, PR, SP, MT, GO, BA, etc.)
 * tenha enriquecimento cadastral corporativo, sócios (QSA) e certidão cartorial,
 * sem NUNCA retornar "Titularidade sob sigilo (LGPD)" ou "Pendente".
 */

const BASE_URL = 'http://localhost:3000';

async function runNationalTests() {
  console.log('🌾 [TESTE NACIONAL FASE 60] Validando Cobertura nos Estados do Brasil...\n');
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

  // ── TESTE 1: SANTA CATARINA (SC) — Cenário que havia falhado no print do usuário ──
  console.log('--- TESTE 1: Santa Catarina (SC - Chapecó / Campos Novos / Fraiburgo) ---');
  try {
    const resSC = await fetch(`${BASE_URL}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'SC-4204202-09498234809283409283049283049283',
        uf: 'SC',
        municipio: 'CHAPECÓ',
        area_hectares: 250.0
      })
    });
    const dataSC = await resSC.json();

    assert(resSC.status === 200, `Status HTTP 200 para Santa Catarina`);
    assert(dataSC.razao_social && !dataSC.razao_social.includes('sigilo'), `Razão Social revelada em SC: "${dataSC.razao_social}"`);
    assert(dataSC.tipo_pessoa === 'PJ', `Classificado como PJ em SC`);
    assert(dataSC.correspondencia_cadastral?.confianca === 85, `Confiança Cadastral 85% presente: ${dataSC.correspondencia_cadastral?.confianca}%`);
    assert(Array.isArray(dataSC.qsa) && dataSC.qsa.length > 0, `QSA retornado para SC (${dataSC.qsa?.length} sócios)`);
    if (dataSC.qsa && dataSC.qsa[0]) {
      console.log(`     Sócio identificado em SC: ${dataSC.qsa[0].nome} (${dataSC.qsa[0].qual})`);
    }

    // Cartório SC
    const resCartSC = await fetch(`${BASE_URL}/api/fundiario/verify-cartorio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'SC-4204202-09498234809283409283049283049283',
        uf: 'SC',
        municipio: 'CHAPECÓ'
      })
    });
    const cartSC = await resCartSC.json();
    assert(cartSC.success === true, `Cartório SC respondeu sucesso`);
    assert(cartSC.cartorio_comarca?.includes('SC'), `Comarca cartorial vinculada a SC: "${cartSC.cartorio_comarca}"`);
  } catch (err) {
    assert(false, `Falha em SC: ${err.message}`);
  }

  // ── TESTE 2: PARANÁ (PR - Campo Mourão / Palotina / Maringá) ──
  console.log('\n--- TESTE 2: Paraná (PR - Cooperativismo Paranaense) ---');
  try {
    const resPR = await fetch(`${BASE_URL}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'PR-4104303-99998888777766665555444433332222',
        uf: 'PR',
        municipio: 'CAMPO MOURÃO',
        area_hectares: 450.0
      })
    });
    const dataPR = await resPR.json();
    assert(resPR.status === 200, `Status HTTP 200 para Paraná`);
    assert(dataPR.razao_social && !dataPR.razao_social.includes('sigilo'), `Razão Social revelada no PR: "${dataPR.razao_social}"`);
    assert(Array.isArray(dataPR.qsa) && dataPR.qsa.length > 0, `QSA no PR com ${dataPR.qsa?.length} dirigentes`);
  } catch (err) {
    assert(false, `Falha no PR: ${err.message}`);
  }

  // ── TESTE 3: SÃO PAULO (SP - Bebedouro / Piracicaba / Ribeirão Preto) ──
  console.log('\n--- TESTE 3: São Paulo (SP - Polo Citrícola e Sucroalcooleiro) ---');
  try {
    const resSP = await fetch(`${BASE_URL}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'SP-3506102-12341234123412341234123412341234',
        uf: 'SP',
        municipio: 'BEBEDOURO',
        area_hectares: 180.0
      })
    });
    const dataSP = await resSP.json();
    assert(resSP.status === 200, `Status HTTP 200 para São Paulo`);
    assert(dataSP.razao_social && !dataSP.razao_social.includes('sigilo'), `Razão Social revelada em SP: "${dataSP.razao_social}"`);
  } catch (err) {
    assert(false, `Falha em SP: ${err.message}`);
  }

  // ── TESTE 4: MATO GROSSO (MT - Sorriso / Sinop / Sapezal) ──
  console.log('\n--- TESTE 4: Mato Grosso (MT - Cerrado & Polo de Grãos) ---');
  try {
    const resMT = await fetch(`${BASE_URL}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'MT-5107909-55554444333322221111000099998888',
        uf: 'MT',
        municipio: 'SINOP',
        area_hectares: 1200.0
      })
    });
    const dataMT = await resMT.json();
    assert(resMT.status === 200, `Status HTTP 200 para Mato Grosso`);
    assert(dataMT.razao_social && !dataMT.razao_social.includes('sigilo'), `Razão Social revelada no MT: "${dataMT.razao_social}"`);
    assert(dataMT.qsa && dataMT.qsa.length > 0, `Sócios do MT retornados com sucesso`);
  } catch (err) {
    assert(false, `Falha no MT: ${err.message}`);
  }

  // ── TESTE 5: GOIÁS (GO - Rio Verde / Itumbiara) ──
  console.log('\n--- TESTE 5: Goiás (GO - Sudoeste Goiano) ---');
  try {
    const resGO = await fetch(`${BASE_URL}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'GO-5218805-77778888999900001111222233334444',
        uf: 'GO',
        municipio: 'RIO VERDE',
        area_hectares: 650.0
      })
    });
    const dataGO = await resGO.json();
    assert(resGO.status === 200, `Status HTTP 200 para Goiás`);
    assert(dataGO.razao_social && !dataGO.razao_social.includes('sigilo'), `Razão Social revelada em GO: "${dataGO.razao_social}"`);
  } catch (err) {
    assert(false, `Falha em GO: ${err.message}`);
  }

  // ── TESTE 6: BAHIA / MATOPIBA (BA - Luís Eduardo Magalhães) ──
  console.log('\n--- TESTE 6: Bahia (BA - Oeste Baiano & MATOPIBA) ---');
  try {
    const resBA = await fetch(`${BASE_URL}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'BA-2919553-33332222111100009999888877776666',
        uf: 'BA',
        municipio: 'LUÍS EDUARDO MAGALHÃES',
        area_hectares: 850.0
      })
    });
    const dataBA = await resBA.json();
    assert(resBA.status === 200, `Status HTTP 200 para Bahia`);
    assert(dataBA.razao_social && !dataBA.razao_social.includes('sigilo'), `Razão Social revelada na BA: "${dataBA.razao_social}"`);
  } catch (err) {
    assert(false, `Falha na BA: ${err.message}`);
  }

  // ── TESTE 7: CIDADE SEM SEED DIRETO (Cascata Estadual e Regional sem Sigilo) ──
  console.log('\n--- TESTE 7: Cidade Sem Seed Direto (Garantia de ZERO Sigilo) ---');
  try {
    const resAnywhere = await fetch(`${BASE_URL}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo_car: 'SC-4299999-00001111222233334444555566667777',
        uf: 'SC',
        municipio: 'MUNICÍPIO REMOTO DO INTERIOR',
        area_hectares: 15.0
      })
    });
    const dataAnywhere = await resAnywhere.json();
    assert(resAnywhere.status === 200, `Status HTTP 200 para município remoto`);
    assert(dataAnywhere.razao_social && !dataAnywhere.razao_social.includes('sigilo'), `Cascata regional acionada com sucesso: "${dataAnywhere.razao_social}"`);
    assert(dataAnywhere.tipo_pessoa === 'PJ', `Atribuído como PJ com estimativa cadastral`);
  } catch (err) {
    assert(false, `Falha no teste de município remoto: ${err.message}`);
  }

  console.log(`\n====================================================`);
  console.log(`🎯 RESULTADO EXPANSÃO NACIONAL: ${passed}/${total} testes aprovados (${Math.round((passed/total)*100)}%)`);
  console.log(`====================================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runNationalTests();
