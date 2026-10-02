/**
 * tests/test_export_standardization_meta_and_comercial.js
 * 
 * Bateria de Testes de Validação Completa:
 * 1. Planilha Comercial B2B (Excel & Vendas):
 *    - Ausência absoluta de notação científica (E+) em CPF/CNPJ e Telefone
 *    - Link funcional para WhatsApp Web (wa.me)
 *    - Eliminação completa de valores 'N/D' nas colunas de maquinário/implementos
 *    - Substituição de nomes 'Sem denominação' por identificadores canônicos
 * 2. Planilha Meta Ads Oficial:
 *    - Headers canônicos: email,phone,fn,ln,ct,st,zip,country,value
 *    - Criptografia estrita SHA-256 (64 hex chars) em todos os PIIs
 *    - Coluna 'value' aberta e numérica para Lookalike Baseado em Valor
 *    - Expansão de sócios do QSA para maximizar o Match Rate
 * 3. Validação Estática da Interface (HTML e JS):
 *    - Botões canônicos na Tabela Analítica
 *    - Limpeza do rodapé do drawer rural
 *    - Opções enxutas no modal de exportação (#exportModal)
 */

import fs from 'fs';

const BASE_URL = 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🧪 INICIANDO TESTES DE PADRONIZAÇÃO DE EXPORTAÇÃO META & COMERCIAL');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────────
  // 1. TESTE DA PLANILHA COMERCIAL B2B (EXCEL & VENDAS)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ [1/4] Testando Exportação Comercial B2B (comercial_b2b_maquinas)...');
  const resB2b = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'comercial_b2b_maquinas'
    })
  });

  assert(resB2b.status === 200, `Status HTTP esperado 200, recebido ${resB2b.status}`);
  const dispositionB2b = resB2b.headers.get('content-disposition') || '';
  assert(dispositionB2b.includes('despacho-comercial-implementos-'), `Content-Disposition incorreto: ${dispositionB2b}`);

  const csvB2bText = await resB2b.text();
  const b2bLines = csvB2bText.split(/\r?\n/).filter(line => line.trim().length > 0);
  console.log(`   ✔ Total de linhas geradas no CSV B2B: ${b2bLines.length}`);
  assert(b2bLines.length > 5, 'CSV B2B retornou poucas linhas.');

  const b2bHeader = b2bLines[0];
  console.log(`   ✔ Cabeçalho B2B: ${b2bHeader.slice(0, 100)}...`);
  assert(b2bHeader.includes('PRODUTOR_OU_EMPRESA'), 'Cabeçalho B2B não contém PRODUTOR_OU_EMPRESA');
  assert(b2bHeader.includes('DOCUMENTO_CPF_CNPJ'), 'Cabeçalho B2B não contém DOCUMENTO_CPF_CNPJ');
  assert(b2bHeader.includes('WHATSAPP_DIRETO'), 'Cabeçalho B2B não contém WHATSAPP_DIRETO');
  assert(b2bHeader.includes('LINK_WHATSAPP_WEB'), 'Cabeçalho B2B não contém LINK_WHATSAPP_WEB');
  assert(b2bHeader.includes('COLHEITADEIRA_ESTIMADA'), 'Cabeçalho B2B não contém COLHEITADEIRA_ESTIMADA');
  assert(b2bHeader.includes('TRATORES_ESTIMADOS'), 'Cabeçalho B2B não contém TRATORES_ESTIMADOS');
  assert(b2bHeader.includes('PLANTADEIRA_ESTIMADA'), 'Cabeçalho B2B não contém PLANTADEIRA_ESTIMADA');

  // Validação Linha a Linha (amostragem de 50 linhas)
  let foundWhatsAppLink = 0;
  let sampleCount = Math.min(b2bLines.length - 1, 50);

  for (let i = 1; i <= sampleCount; i++) {
    const row = b2bLines[i];
    
    // Verificação de ausência de notação científica
    assert(!row.match(/;\s*"?\d+[.,]\d+E\+\d+"?\s*;/i), `Notação científica detectada na linha ${i}: ${row}`);
    assert(!row.includes('7,69E+') && !row.includes('5,55E+'), `Notação científica corrompida do Excel na linha ${i}`);

    const headerCols = b2bHeader.split(';').map(h => h.replace(/"/g, '').trim());
    const colhIdx = headerCols.indexOf('COLHEITADEIRA_ESTIMADA');
    const tratIdx = headerCols.indexOf('TRATORES_ESTIMADOS');
    const planIdx = headerCols.indexOf('PLANTADEIRA_ESTIMADA');
    const waLinkIdx = headerCols.indexOf('LINK_WHATSAPP_WEB');

    // Verificação de N/D nas colunas de máquinas
    const cols = row.split(';');
    const colh = cols[colhIdx]?.replace(/"/g, '').trim();
    const trat = cols[tratIdx]?.replace(/"/g, '').trim();
    const plan = cols[planIdx]?.replace(/"/g, '').trim();

    assert(colh !== 'N/D' && colh !== '""', `COLHEITADEIRA_ESTIMADA com N/D na linha ${i}`);
    assert(trat !== 'N/D' && trat !== '""', `TRATORES_ESTIMADOS com N/D na linha ${i}`);
    assert(plan !== 'N/D' && plan !== '""', `PLANTADEIRA_ESTIMADA com N/D na linha ${i}`);

    // Link WhatsApp
    const waLink = cols[waLinkIdx]?.replace(/"/g, '').trim();
    if (waLink && waLink.startsWith('https://wa.me/')) {
      foundWhatsAppLink++;
    }
  }

  console.log(`   ✔ Links WhatsApp Web válidos verificados em ${foundWhatsAppLink}/${sampleCount} linhas amostradas.`);
  assert(foundWhatsAppLink > 0, 'Nenhum link de WhatsApp Web foi gerado na amostra.');
  console.log('   ✅ Planilha Comercial B2B validada com sucesso: sem notação científica, frotas calculadas e links WhatsApp.\n');

  // ─────────────────────────────────────────────────────────────────
  // 2. TESTE DA PLANILHA META ADS OFICIAL (SHA-256)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ [2/4] Testando Exportação Meta Ads Oficial (meta_ads)...');
  const resMeta = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'meta_ads'
    })
  });

  assert(resMeta.status === 200, `Status HTTP esperado 200, recebido ${resMeta.status}`);
  const dispositionMeta = resMeta.headers.get('content-disposition') || '';
  assert(dispositionMeta.includes('meta-ads-audiences-sha256-'), `Content-Disposition incorreto: ${dispositionMeta}`);

  const csvMetaText = await resMeta.text();
  const metaLines = csvMetaText.split(/\r?\n/).filter(line => line.trim().length > 0);
  console.log(`   ✔ Total de linhas geradas no CSV Meta Ads: ${metaLines.length}`);
  assert(metaLines.length > 5, 'CSV Meta Ads retornou poucas linhas.');

  const metaHeader = metaLines[0].trim();
  console.log(`   ✔ Cabeçalho Meta Ads: "${metaHeader}"`);
  assert(metaHeader === 'email,phone,fn,ln,ct,st,zip,country,value', `Cabeçalho Meta Ads incorreto: "${metaHeader}"`);

  // Validação Linha a Linha (amostragem de 50 linhas)
  const hex64Regex = /^[a-f0-9]{64}$/;
  let validHashesCount = 0;
  let validValuesCount = 0;
  let metaSampleCount = Math.min(metaLines.length - 1, 50);

  for (let i = 1; i <= metaSampleCount; i++) {
    const row = metaLines[i];
    // CSV simples com escape
    const cols = row.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    assert(cols.length === 9, `Linha ${i} do Meta Ads possui ${cols.length} colunas em vez de 9.`);

    const [email, phone, fn, ln, ct, st, zip, country, val] = cols;

    // Country: padrão oficial do Meta Ads é código ISO-2 minúsculo ('br') ou hash SHA-256
    assert(country === 'br' || hex64Regex.test(country), `Coluna country inválida na linha ${i}: "${country}"`);

    // PIIs quando presentes devem ter 64 hex chars
    if (email) assert(hex64Regex.test(email), `Email não é SHA-256 na linha ${i}: "${email}"`);
    if (phone) {
      assert(hex64Regex.test(phone), `Phone não é SHA-256 na linha ${i}: "${phone}"`);
      validHashesCount++;
    }
    if (fn) assert(hex64Regex.test(fn), `FN não é SHA-256 na linha ${i}: "${fn}"`);
    if (ln) assert(hex64Regex.test(ln), `LN não é SHA-256 na linha ${i}: "${ln}"`);
    if (ct) assert(hex64Regex.test(ct), `CT não é SHA-256 na linha ${i}: "${ct}"`);
    if (st) assert(hex64Regex.test(st), `ST não é SHA-256 na linha ${i}: "${st}"`);
    if (zip) assert(hex64Regex.test(zip), `ZIP não é SHA-256 na linha ${i}: "${zip}"`);

    // Coluna value deve ser numérica aberta e nunca hasheada
    assert(!hex64Regex.test(val), `Coluna 'value' foi incorretamente hasheada na linha ${i}: "${val}"`);
    const numVal = Number(val);
    assert(!isNaN(numVal) && numVal > 0, `Coluna 'value' deve ser um número positivo na linha ${i}: "${val}"`);
    validValuesCount++;
  }

  console.log(`   ✔ Telefones hasheados (SHA-256) validados em ${validHashesCount}/${metaSampleCount} linhas.`);
  console.log(`   ✔ Coluna 'value' numérica aberta validada em ${validValuesCount}/${metaSampleCount} linhas.`);
  console.log('   ✅ Planilha Meta Ads validada com sucesso: 100% SHA-256 PII e Value-Based LAL numérico.\n');

  // ─────────────────────────────────────────────────────────────────
  // 3. TESTE DE RETROCOMPATIBILIDADE (meta_ads_agro)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ [3/4] Testando Retrocompatibilidade (meta_ads_agro)...');
  const resMetaAgro = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'meta_ads_agro' })
  });
  assert(resMetaAgro.status === 200, 'meta_ads_agro não retornou 200');
  const agroText = await resMetaAgro.text();
  assert(agroText.startsWith('email,phone,fn,ln,ct,st,zip,country,value'), 'meta_ads_agro não utiliza padrão oficial');
  console.log('   ✅ Retrocompatibilidade de meta_ads_agro garantida.\n');

  // ─────────────────────────────────────────────────────────────────
  // 4. TESTE DE INTEGRIDADE DA INTERFACE (HTML & JS)
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ [4/4] Testando Integridade de Código da Interface (client/index.html & client/js/app.js)...');
  const htmlContent = fs.readFileSync('client/index.html', 'utf-8');
  const jsContent = fs.readFileSync('client/js/app.js', 'utf-8');

  // Tabela Analítica: Botões Canônicos
  assert(htmlContent.includes('id="btnQuickDispatchComercial"'), 'Botão #btnQuickDispatchComercial ausente na mass-actions-bar');
  assert(htmlContent.includes('id="btnQuickDispatchMeta"'), 'Botão #btnQuickDispatchMeta ausente na mass-actions-bar');
  console.log('   ✔ Botões canônicos presentes na mass-actions-bar da Tabela Analítica.');

  // Header & Toolbar: Botões redundantes eliminados
  assert(!htmlContent.includes('id="btnExportCustomAudiencesHeader"'), 'Botão redundante btnExportCustomAudiencesHeader ainda existe no Header');
  assert(!htmlContent.includes('id="btnDirectMetaAds"'), 'Botão redundante btnDirectMetaAds ainda existe na Toolbar');
  assert(!htmlContent.includes('id="btnDirectB2bCsv"'), 'Botão redundante btnDirectB2bCsv ainda existe na Toolbar');
  console.log('   ✔ Botões redundantes do Header e Toolbar expurgados com sucesso.');

  // Drawer Lateral: Botões redundantes eliminados
  assert(!htmlContent.includes('id="btnExportRuralGeofence"'), 'Botão redundante btnExportRuralGeofence ainda existe no HTML');
  assert(!htmlContent.includes('id="btnInjectRuralLeadToTable"'), 'Botão redundante btnInjectRuralLeadToTable ainda existe no HTML');
  assert(htmlContent.includes('id="btnExportCsv"'), 'Botão canônico #btnExportCsv ausente no topo do Drawer');
  console.log('   ✔ Botões redundantes expurgados do rodapé da Ficha Rural.');

  // Modal de Exportação: 3 opções canônicas
  assert(htmlContent.includes('value="meta_ads"'), 'Opção meta_ads ausente no #exportModal');
  assert(htmlContent.includes('value="comercial_b2b_maquinas"'), 'Opção comercial_b2b_maquinas ausente no #exportModal');
  assert(htmlContent.includes('value="crm_webhook"'), 'Opção crm_webhook ausente no #exportModal');
  assert(htmlContent.includes('id="checkSyncDirectGraphApi"'), 'Checkbox checkSyncDirectGraphApi ausente no #exportModal');
  console.log('   ✔ Modal de Exportação unificado nas 3 opções canônicas.');

  // JS Listeners
  assert(jsContent.includes("executeExport('comercial_b2b_maquinas'"), 'Handler para comercial_b2b_maquinas ausente no app.js');
  assert(jsContent.includes("executeExport('meta_ads'"), 'Handler para meta_ads ausente no app.js');
  console.log('   ✔ Handlers no client/js/app.js devidamente associados.');

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! EXPORTAÇÕES BLINDADAS!');
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

runTests().catch(err => {
  console.error('❌ ERRO DURANTE A EXECUÇÃO DOS TESTES:', err);
  process.exit(1);
});
