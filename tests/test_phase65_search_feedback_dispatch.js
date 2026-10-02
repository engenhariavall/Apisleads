/**
 * TESTE AUTOMATIZADO - FASE 65
 * Validação de:
 * 1. Busca Universal Multi-Campo (Nome, CNPJ, CPF, Cidade)
 * 2. Feedback Loop Comercial (Vendas & Retroalimentação de Intenção)
 * 3. Despacho Especializado B2B (Comercial Máquinas com WhatsApp Web e Argumentos de Frota)
 * 4. Despacho Meta Ads Custom Audiences (Formato Oficial E.164)
 */

import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 [TEST FASE 65] Iniciando validação completa da Fase 65...\n');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  // 1. Healthcheck
  const healthRes = await fetch(`${BASE_URL}/health`);
  const healthData = await healthRes.json();
  test('1. Servidor e Healthcheck ativos', () => {
    assert.strictEqual(healthData.status, 'UP');
  });

  // 2. Busca Universal por Termo de Texto
  const searchNameRes = await fetch(`${BASE_URL}/api/leads/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ termo_busca: 'AGRO', page_size: 5 })
  });
  const searchNameData = await searchNameRes.json();
  test('2. Busca universal por texto (termo_busca: AGRO) retorna registros válidos', () => {
    assert.strictEqual(searchNameRes.status, 200);
    assert.ok(Array.isArray(searchNameData.data), 'data deve ser array');
    assert.ok(searchNameData.total_count >= 1, 'Deve retornar ao menos 1 lead para o termo AGRO');
  });

  // 3. Busca Universal por Cidade
  const searchCityRes = await fetch(`${BASE_URL}/api/leads/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ termo_busca: 'SORRISO', page_size: 5 })
  });
  const searchCityData = await searchCityRes.json();
  test('3. Busca universal por cidade (termo_busca: SORRISO) encontra registros regionais', () => {
    assert.strictEqual(searchCityRes.status, 200);
    assert.ok(Array.isArray(searchCityData.data));
  });

  // 4. Feedback Loop Comercial (PATCH /api/leads/:id/feedback)
  const targetLead = searchNameData.data[0];
  assert.ok(targetLead, 'Lead alvo necessário para teste de feedback');

  const feedbackPayload = {
    feedback_status: 'INTERESSADO',
    interesse_maquinario: 'COLHEITADEIRA_CLASSE_7_10',
    decisor_nome: 'Valdir Silveira (Proprietário)',
    whatsapp: '(66) 99876-5432',
    notas_comercial: 'Produtor com 3.200 ha em Sorriso. Quer renovar 2 colheitadeiras para próxima safra.'
  };

  const feedbackRes = await fetch(`${BASE_URL}/api/leads/${encodeURIComponent(targetLead.id)}/feedback`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedbackPayload)
  });
  const feedbackData = await feedbackRes.json();

  test('4. Registro de Feedback Comercial grava e retroalimenta o status', () => {
    assert.strictEqual(feedbackRes.status, 200);
    assert.strictEqual(feedbackData.success, true);
    assert.strictEqual(feedbackData.data.feedback_status, 'INTERESSADO');
    assert.strictEqual(feedbackData.data.decisor_nome, 'Valdir Silveira (Proprietário)');
    assert.strictEqual(feedbackData.data.intent_stage, 'HOT'); // Elevação de status no feedback loop
  });

  // 5. Despacho Comercial B2B (Exportação format: comercial_b2b_maquinas)
  const exportB2bRes = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'comercial_b2b_maquinas',
      lead_ids: [targetLead.id]
    })
  });
  const exportB2bText = await exportB2bRes.text();

  test('5. Despacho Comercial B2B gera CSV estruturado com WhatsApp e argumentos de frota', () => {
    assert.strictEqual(exportB2bRes.status, 200);
    assert.ok(exportB2bText.includes('PRODUTOR_OU_EMPRESA'), 'Header PRODUTOR_OU_EMPRESA presente');
    assert.ok(exportB2bText.includes('LINK_WHATSAPP_WEB'), 'Header LINK_WHATSAPP_WEB presente');
    assert.ok(exportB2bText.includes('COLHEITADEIRA_ESTIMADA'), 'Header COLHEITADEIRA_ESTIMADA presente');
    assert.ok(exportB2bText.includes('INTERESSE_DECLARADO'), 'Header INTERESSE_DECLARADO presente');
  });

  // 6. Despacho Meta Ads (Exportação format: meta_ads_agro)
  const exportMetaRes = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'meta_ads_agro',
      lead_ids: [targetLead.id]
    })
  });
  const exportMetaText = await exportMetaRes.text();

  test('6. Despacho Meta Ads gera CSV no formato oficial com telefone internacional E.164', () => {
    assert.strictEqual(exportMetaRes.status, 200);
    assert.ok(exportMetaText.includes('email,phone,fn,ln,ct,st,zip,country,value'), 'Headers Meta Ads presentes');
    assert.ok(exportMetaText.includes('+55') || exportMetaText.includes('br'), 'Formato internacional presente');
  });

  console.log(`\n📊 RESULTADO FASE 65: ${passed}/${total} testes passaram (${Math.round((passed/total)*100)}%)\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro crítico na suíte de testes da Fase 65:', err);
  process.exit(1);
});
