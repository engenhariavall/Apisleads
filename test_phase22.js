/**
 * test_phase22.js
 * Suíte de Testes Automatizados — Fase 22: Módulo Address Discovery & Dupla Inspeção de Fachada
 * API Leads | Padrão VERSUS
 */

import db from './server/src/config/database.js';
import { resolveRealAddress } from './server/src/services/addressResolverService.js';
import { getLeadByIdOrCnpj, applyDiscoveredAddressToLead, queryLeads } from './server/src/services/leadsService.js';
import { calculateVitalityIndex } from './server/src/modules/intelligence/vitalityEngine.js';

let passed = 0;
let failed = 0;

function test(name, condition, detail = '') {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } else {
    console.log(`❌ [FAIL] ${name}${detail ? ' | ' + detail : ''}`);
    failed++;
  }
}

console.log('\n🚀 Iniciando testes automatizados da Fase 22 (Address Discovery & Dupla Inspeção)...\n');

// 1. Verificação do Schema SQLite
console.log('--- 1. Integridade do Schema SQLite ---');
const tableInfo = db.prepare("PRAGMA table_info(leads)").all();
const cols = tableInfo.map(c => c.name);

test('Coluna endereco_operacional existe na tabela leads', cols.includes('endereco_operacional'));
test('Coluna lat_operacional existe na tabela leads', cols.includes('lat_operacional'));
test('Coluna lng_operacional existe na tabela leads', cols.includes('lng_operacional'));
test('Coluna address_reconciled existe na tabela leads', cols.includes('address_reconciled'));
test('Coluna reconciliation_source existe na tabela leads', cols.includes('reconciliation_source'));
test('Coluna reconciliation_confidence existe na tabela leads', cols.includes('reconciliation_confidence'));

// 2. Teste do Motor de Resolução de Endereço (addressResolverService)
console.log('\n--- 2. Motor addressResolverService ---');
const sampleLead = db.prepare("SELECT * FROM leads WHERE vertical_type = 'SAUDE' LIMIT 1").get();
test('Existe lead de Saúde para teste', !!sampleLead);

if (sampleLead) {
  const resolved = await resolveRealAddress(sampleLead);
  test('resolveRealAddress retornou success = true', resolved.success === true);
  test('Endereço operacional gerado é válido', typeof resolved.endereco_operacional === 'string' && resolved.endereco_operacional.length > 10);
  test('lat_operacional é número válido', typeof resolved.lat_operacional === 'number' && !isNaN(resolved.lat_operacional));
  test('lng_operacional é número válido', typeof resolved.lng_operacional === 'number' && !isNaN(resolved.lng_operacional));
  test('Índice de confiança é >= 80%', resolved.reconciliation_confidence >= 80);
  test('Fonte de reconciliação declarada', typeof resolved.reconciliation_source === 'string' && resolved.reconciliation_source.length > 5);
  test('URL do Street View original formatada', resolved.street_view_original_url.includes('google.com/maps'));
  test('URL do Street View da fachada descoberta formatada', resolved.street_view_discovered_url.includes('google.com/maps') && resolved.street_view_discovered_url.includes('viewpoint='));
}

// 3. Teste com Lead de Agro
console.log('\n--- 3. Resolução para Lead de Agro ---');
const agroLead = db.prepare("SELECT * FROM leads WHERE vertical_type = 'AGRO' LIMIT 1").get();
if (agroLead) {
  const resolvedAgro = await resolveRealAddress(agroLead);
  test('Endereço operacional Agro gerado com sucesso', !!resolvedAgro.endereco_operacional);
  test('Confiança Agro >= 85%', resolvedAgro.reconciliation_confidence >= 85);
}

// 4. Aplicação e Persistência no SQLite
console.log('\n--- 4. Persistência de Reconciliação no SQLite ---');
const testLead = db.prepare("SELECT * FROM leads LIMIT 1").get();
test('Lead selecionado para aplicação', !!testLead);

if (testLead) {
  const discoveryData = await resolveRealAddress(testLead);
  const updated = applyDiscoveredAddressToLead(testLead.id, discoveryData, 'TEST_RUNNER');

  test('applyDiscoveredAddressToLead atualizou endereco_operacional', updated.endereco_operacional === discoveryData.endereco_operacional);
  test('applyDiscoveredAddressToLead atualizou lat_operacional', updated.lat_operacional === discoveryData.lat_operacional);
  test('applyDiscoveredAddressToLead atualizou lng_operacional', updated.lng_operacional === discoveryData.lng_operacional);
  test('applyDiscoveredAddressToLead atualizou latitude ativa do mapa', updated.latitude === discoveryData.lat_operacional);
  test('applyDiscoveredAddressToLead atualizou longitude ativa do mapa', updated.longitude === discoveryData.lng_operacional);
  test('applyDiscoveredAddressToLead marcou address_reconciled = 1', updated.address_reconciled === 1);
  test('applyDiscoveredAddressToLead marcou audit_status = CONFIRMED', updated.audit_status === 'CONFIRMED');
  test('applyDiscoveredAddressToLead gravou operador', updated.audited_by === 'TEST_RUNNER');
}

// 5. Reflexo no Índice de Vitalidade Cadastral
console.log('\n--- 5. Reflexo na Vitalidade Cadastral (vitalityEngine) ---');
if (testLead) {
  const leadReconciled = getLeadByIdOrCnpj(testLead.id);
  const vitality = calculateVitalityIndex(leadReconciled);
  const geoFactor = vitality.factors.find(f => f.id === 'GEO_RECONCILED');

  test('Vitality Engine reconheceu GEO_RECONCILED', !!geoFactor);
  test('Fator GEO_RECONCILED atribuiu 20 pontos máximos', geoFactor?.points === 20);
  test('Status de vitalidade é OPERACAO_ATIVA ou compatível', vitality.vitality_score >= 40);
}

// 6. Teste de Endpoints via Fetch Local
console.log('\n--- 6. Teste de Endpoints REST ---');
try {
  const resDisc = await fetch(`http://localhost:3000/api/leads/${testLead.id}/discover-address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const jsonDisc = await resDisc.json();
  test('POST /api/leads/:id/discover-address retornou 200 OK', resDisc.status === 200);
  test('Endpoint retornou endereco_operacional', !!jsonDisc.endereco_operacional);

  const resApply = await fetch(`http://localhost:3000/api/leads/${testLead.id}/apply-discovered-address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ discovery_data: jsonDisc, operator: 'TEST_API' })
  });
  const jsonApply = await resApply.json();
  test('POST /api/leads/:id/apply-discovered-address retornou 200 OK', resApply.status === 200);
  test('Endpoint confirmou sucesso da reconciliação', jsonApply.success === true);
} catch (e) {
  test('Endpoints REST responderam sem erros de rede', false, e.message);
}

// 7. Teste de Exportação CSV com as Novas Colunas
console.log('\n--- 7. Teste de Exportação CSV B2B ---');
try {
  const resExport = await fetch('http://localhost:3000/api/leads/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_ids: [testLead.id], format: 'standard' })
  });
  const csvText = await resExport.text();
  test('POST /api/leads/export retornou 200 OK', resExport.status === 200);
  test('CSV contém cabeçalho "Endereço Operacional Reconciliado"', csvText.includes('Endereço Operacional Reconciliado'));
  test('CSV contém cabeçalho "Status Reconciliação"', csvText.includes('Status Reconciliação'));
  test('CSV contém cabeçalho "Fonte Reconciliação"', csvText.includes('Fonte Reconciliação'));
  test('CSV contém valor "RECONCILIADO"', csvText.includes('RECONCILIADO'));
} catch (e) {
  test('Exportação CSV executada sem erros', false, e.message);
}

console.log(`\n====================================================`);
console.log(`📊 TOTAL DE TESTES FASE 22: ${passed + failed}`);
console.log(`✅ APROVADOS: ${passed}`);
console.log(`❌ FALHAS: ${failed}`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
