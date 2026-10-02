/**
 * FASE 18: SUÍTE DE TESTES — GRAFO DE GRUPOS ECONÔMICOS & HIERARQUIA CRM
 * Execução: node test_phase18.js
 */

const BASE = 'http://localhost:3000/api';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function req(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function getFirstLead() {
  const r = await req('POST', '/leads/filter', { page: 1, page_size: 1, target_type: 'all' });
  return r.body?.data?.[0] || null;
}

// GRUPO 1: Motor de Grafos
async function testGroupEngine() {
  console.log('\n🔬 GRUPO 1: Motor de Grafos Societários');
  const r1 = await req('POST', '/leads/filter', { page: 1, page_size: 5, target_type: 'all' });
  assert(r1.status === 200, 'T1: GET /leads/filter retorna 200');
  assert(Array.isArray(r1.body?.data), 'T1.1: Resposta possui array de leads');
}

// GRUPO 2: Endpoint GET /api/leads/:id/group
async function testGroupEndpoint() {
  console.log('\n📡 GRUPO 2: Endpoint GET /api/leads/:id/group');
  const lead = await getFirstLead();
  if (!lead) { console.log('  ⚠️  Nenhum lead disponível'); return; }

  const r3 = await req('GET', `/leads/${lead.id}/group`);
  assert(r3.status === 200, `T3: GET /leads/${lead.id}/group retorna 200`);

  const body = r3.body;
  assert(typeof body.success === 'boolean', 'T4: Resposta possui campo success');
  assert(typeof body.has_group === 'boolean', 'T4.1: Resposta possui campo has_group');

  if (body.has_group) {
    const g = body.group;
    assert(typeof g.id === 'string', 'T5: group.id é string');
    assert(typeof g.name === 'string' && g.name.startsWith('GRUPO'), 'T5.1: group.name começa com GRUPO');
    assert(typeof g.total_capital === 'number', 'T5.2: group.total_capital é número');
    assert(typeof g.total_capital_formatted === 'string', 'T5.3: group.total_capital_formatted é string');
    assert(typeof g.members_count === 'number' && g.members_count >= 2, 'T5.4: members_count >= 2');
    assert(typeof g.current_lead_is_parent === 'boolean', 'T5.5: current_lead_is_parent é boolean');
    assert(typeof g.parent_company === 'object', 'T5.6: parent_company é objeto');
    assert(Array.isArray(g.shared_decision_makers), 'T5.7: shared_decision_makers é array');
    assert(Array.isArray(g.members) && g.members.length >= 2, 'T5.8: members com >= 2 elementos');

    const pc = g.parent_company;
    assert(typeof pc.cnpj === 'string', 'T6: parent_company.cnpj é string');
    assert(typeof pc.razao_social === 'string', 'T6.1: parent_company.razao_social é string');

    const parentMember = g.members.find(m => m.is_parent);
    assert(!!parentMember, 'T7: Existe membro com is_parent=true');
    assert(g.members.every(m => ['MATRIZ / HOLDING', 'FILIAL / OPERACIONAL'].includes(m.role)), 'T7.1: Todos os membros possuem role válido');

    console.log(`     → ${g.name} | ${g.members_count} empresas | Capital: ${g.total_capital_formatted}`);
  } else {
    assert(typeof body.message === 'string', 'T5: Empresa independente possui message');
    console.log(`     → Lead independente. message: "${body.message}"`);
  }

  const r8 = await req('GET', '/leads/id-inexistente-xpto-9999/group');
  assert(r8.status === 404, 'T8: ID inexistente retorna 404');
}

// GRUPO 3: Exportação B2B com Hierarquia
async function testB2BExport() {
  console.log('\n📤 GRUPO 3: Exportação B2B com Colunas de Hierarquia');
  const r9 = await fetch(`${BASE}/leads/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters: { target_type: 'all' }, format: 'standard' })
  });
  assert(r9.status === 200, 'T9: POST /leads/export retorna 200');

  if (r9.status === 200) {
    const text = await r9.text();
    const firstLine = text.split('\n')[0];
    assert(firstLine.includes('Grupo Econ'), 'T9.1: CSV contém "Grupo Econômico"');
    assert(firstLine.includes('Papel no Grupo'), 'T9.2: CSV contém "Papel no Grupo"');
    assert(firstLine.includes('Capital Consolidado'), 'T9.3: CSV contém "Capital Consolidado"');
    assert(firstLine.includes('Conta-M'), 'T9.4: CSV contém colunas de Conta-Mãe');
    const lines = text.trim().split('\n');
    assert(lines.length >= 2, 'T10: CSV possui dados além do cabeçalho');
    if (lines.length >= 2) {
      const dataLine = lines[1];
      assert(dataLine.includes('Independente') || /GRUPO/i.test(dataLine),
        'T11: Linha de dados tem grupo ou "Independente"');
    }
  }
}

// GRUPO 4: Regressão
async function testRegression() {
  console.log('\n🔄 GRUPO 4: Regressão — Integridade das Rotas Anteriores');
  const lead = await getFirstLead();

  const r12 = await req('POST', '/leads/filter', { page: 1, page_size: 3, target_type: 'all' });
  assert(r12.status === 200 && Array.isArray(r12.body?.data), 'T12: /leads/filter sem quebra');

  if (lead) {
    const r13 = await req('GET', `/leads/${lead.id}`);
    assert(r13.status === 200 && r13.body?.success === true, 'T13: /leads/:id sem quebra');
  }

  const r14 = await req('POST', '/gis/geojson', { target_type: 'all' });
  assert(r14.status === 200 && r14.body?.type === 'FeatureCollection', 'T14: /gis/geojson sem quebra');

  if (lead) {
    const r15 = await req('GET', `/ai/predictive-score/${lead.id}`);
    assert(r15.status === 200, 'T15: /ai/predictive-score/:id sem quebra');
  }

  const r16 = await req('GET', '/segments');
  assert(r16.status === 200, 'T16: /segments sem quebra');
}

async function runAll() {
  console.log('============================================================');
  console.log('🏛  FASE 18 — SUÍTE DE TESTES: GRAFO DE GRUPOS ECONÔMICOS');
  console.log('============================================================');
  try {
    await testGroupEngine();
    await testGroupEndpoint();
    await testB2BExport();
    await testRegression();
  } catch (err) {
    console.error('\n💥 Erro crítico:', err.message);
    process.exit(1);
  }
  console.log('\n============================================================');
  console.log(`RESULTADO FINAL: ${passed + failed} testes`);
  console.log(`  ✅ APROVADOS : ${passed}`);
  console.log(`  ❌ REPROVADOS: ${failed}`);
  console.log('============================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runAll();
