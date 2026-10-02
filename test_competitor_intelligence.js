/**
 * test_competitor_intelligence.js
 * Suíte de Testes Automatizados — Módulo de Inteligência Competitiva & Scouting de Mercado
 * Padrão VERSUS
 */

import db from './server/src/config/database.js';
import {
  sanitizeCnpj,
  formatCnpj,
  calculateFragilityIndex,
  mapTerritorialGaps,
  lookupOrRegisterCompetitor,
  listCompetitors
} from './server/src/services/competitorIntelligenceService.js';
import { queryLeads, getAllLeadsMatchingFilter, getLeadsByIds } from './server/src/services/leadsService.js';

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

console.log('\n🕵️ Iniciando testes automatizados do Módulo de Inteligência Competitiva (Padrão VERSUS)...\n');

// ─── 1. Schema & Migration ────────────────────────────────────────────────────
console.log('--- 1. Integridade do Schema SQLite ---');
const tableInfo = db.prepare("PRAGMA table_info(leads)").all();
const cols = tableInfo.map(c => c.name);
test('Coluna is_competitor existe na tabela leads', cols.includes('is_competitor'));

const idxList = db.prepare("PRAGMA index_list(leads)").all();
const idxNames = idxList.map(i => i.name);
test('Índice idx_leads_is_competitor existe na tabela leads', idxNames.includes('idx_leads_is_competitor'));

// ─── 2. Lookup e Registro Isolado de Concorrente ─────────────────────────────
console.log('\n--- 2. Lookup & Registro Isolado de Concorrente ---');
const testCnpj = '99.888.777/0001-66';
const cleanTestCnpj = '99888777000166';

// Limpeza prévia se existir
db.prepare('DELETE FROM leads WHERE cnpj_raw = ?').run(cleanTestCnpj);

const registered = await lookupOrRegisterCompetitor(testCnpj, {
  razao_social: 'CONCORRENTE TESTE TACTICAL LTDA',
  nome_fantasia: 'CONCORRENTE TESTE',
  municipio: 'CAMPINAS',
  uf: 'SP',
  capital_social: 15000 // Subcapitalizada para testar fragilidade
});

test('lookupOrRegisterCompetitor registrou com sucesso', !!registered && !!registered.id);
test('Registro possui is_competitor = 1', registered.is_competitor === 1);
test('CNPJ formatado corretamente', registered.cnpj === testCnpj);
test('CNPJ bruto indexado corretamente', registered.cnpj_raw === cleanTestCnpj);

// ─── 3. Cálculo do Índice de Fragilidade Operacional ──────────────────────────
console.log('\n--- 3. Índice de Fragilidade Operacional & Vulnerabilidades ---');
const fragility = registered.fragility;
test('Índice de fragilidade calculado com sucesso', typeof fragility.fragility_score === 'number');
test('Fragilidade >= 0 e <= 100', fragility.fragility_score >= 0 && fragility.fragility_score <= 100);
test('Possui nível de risco categorizado (ALTO / MODERADO / BAIXO)', ['ALTO', 'MODERADO', 'BAIXO'].includes(fragility.risk_level));
test('Possui lista de vulnerabilidades diagnosticadas', Array.isArray(fragility.vulnerabilities) && fragility.vulnerabilities.length > 0);
test('Detectou vulnerabilidade de subcapitalização (capital < 20k)', fragility.vulnerabilities.some(v => v.type === 'SUBCAPITALIZACAO'));

// ─── 4. Mapeamento de Gaps Territoriais ───────────────────────────────────────
console.log('\n--- 4. Mapeamento de Gaps Territoriais ---');
const gaps = registered.territorial_gaps;
test('Gaps territoriais gerados', !!gaps);
test('Base sede mapeada corretamente', gaps.base_sede.includes('SP'));
test('Possui lista de territórios desassistidos', Array.isArray(gaps.territorios_desassistidos));
test('Resumo executivo do gap formatado', typeof gaps.resumo_gap === 'string' && gaps.resumo_gap.length > 10);

// ─── 5. Blindagem Absoluta contra o Funil GTM / Vendas ───────────────────────
console.log('\n--- 5. Blindagem Absoluta contra o Funil GTM e Vendas ---');
const gtmQueryResult = queryLeads({ termo_busca: 'CONCORRENTE TESTE' });
test('Busca padrão do funil GTM NÃO traz o concorrente (WHERE is_competitor = 0)', gtmQueryResult.total_count === 0);
test('Lista de dados paginados do funil GTM está vazia para o concorrente', gtmQueryResult.data.length === 0);

const allLeadsGtm = getAllLeadsMatchingFilter({});
const foundInGtm = allLeadsGtm.some(l => l.cnpj_raw === cleanTestCnpj);
test('getAllLeadsMatchingFilter protege o universo geral contra concorrentes', !foundInGtm);

// ─── 6. Blindagem Absoluta nas Exportações (CSV B2B e Meta Ads) ───────────────
console.log('\n--- 6. Blindagem Absoluta nas Rotas de Exportação ---');

// Tentativa 1: Exportação via filtros gerais
const resExportGeneral = await fetch('http://localhost:3000/api/leads/export', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ filters: { termo_busca: 'CONCORRENTE TESTE' }, format: 'standard' })
});
test('Exportação geral de concorrente rejeita com 400 (Nenhum lead qualificado)', resExportGeneral.status === 400);

// Tentativa 2: Ataque direto passando o ID do concorrente na seleção
const resExportDirectAttack = await fetch('http://localhost:3000/api/leads/export', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ lead_ids: [registered.id], format: 'standard' })
});
test('Exportação direta por ID bloqueia concorrente e retorna 400', resExportDirectAttack.status === 400);

// Tentativa 3: Ataque direto para Meta Ads com ID do concorrente
const resExportMetaAttack = await fetch('http://localhost:3000/api/leads/export', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ lead_ids: [registered.id], format: 'meta_ads' })
});
test('Exportação Meta Ads bloqueia concorrente e retorna 400', resExportMetaAttack.status === 400);

// ─── 7. Teste de Endpoints REST de Concorrência ──────────────────────────────
console.log('\n--- 7. Endpoints REST de Concorrência (/api/competitors/*) ---');
const resApiLookup = await fetch('http://localhost:3000/api/competitors/lookup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cnpj: testCnpj })
});
const jsonApiLookup = await resApiLookup.json();
test('POST /api/competitors/lookup responde 200 OK', resApiLookup.status === 200);
test('Lookup via API retorna success = true', jsonApiLookup.success === true);
test('Lookup via API retorna fragilidade e gaps', !!jsonApiLookup.data?.fragility && !!jsonApiLookup.data?.territorial_gaps);

const resApiList = await fetch('http://localhost:3000/api/competitors/list');
const jsonApiList = await resApiList.json();
test('GET /api/competitors/list responde 200 OK', resApiList.status === 200);
test('Listagem via API contém o concorrente cadastrado', jsonApiList.data.some(c => c.cnpj_raw === cleanTestCnpj));

// Limpeza pós-teste
db.prepare('DELETE FROM leads WHERE cnpj_raw = ?').run(cleanTestCnpj);

console.log(`\n====================================================`);
console.log(`📊 TOTAL DE TESTES INTELIGÊNCIA COMPETITIVA: ${passed + failed}`);
console.log(`✅ APROVADOS: ${passed}`);
console.log(`❌ FALHAS: ${failed}`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
