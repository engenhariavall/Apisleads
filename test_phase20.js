/**
 * test_phase20.js
 * Suíte de Validação Automatizada - Fase 20: GTM Metrics & ICP Fit Score Preditivo
 * API Leads | Arquitetura SQLite WAL | Padrão VERSUS
 */
import db from './server/src/config/database.js';
import { calculateGtmMarketFunnel } from './server/src/modules/intelligence/gtmMetricsEngine.js';
import { calculateIcpFitScore } from './server/src/modules/intelligence/icpScoringEngine.js';
import { queryLeads } from './server/src/services/leadsService.js';

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


console.log('\n📦 Banco de dados local SQLite inicializado com Matriz de ICP (Modo WAL ativo).');

console.log('\n🧪 Iniciando Bateria de Testes da Fase 20 (GTM Metrics & ICP Fit Score)...\n');


// ─── TESTES DO MOTOR DE ICP FIT SCORE ──────────────────────────────────────
console.log('--- Testes do Motor de ICP Fit Score (icpScoringEngine) ---');

// Lead com alto capital e vitalidade alta
const leadElite = {
  capital_social: 5500000,
  porte: 'DEMAIS',
  qsa: [{ data_entrada: '10/05/2012' }],
  vitality: { score: 90, status: 'OPERACAO_ATIVA' },
  city_macro_data: { ipc_score: 85 },
  contact_health: { is_mobile: true, is_whatsapp_probable: true },
  email: 'ceo@empresa.com.br',
  telefone: '(66) 99999-1234'
};

const eliteResult = calculateIcpFitScore(leadElite);
test('ICP Score calculado para lead elite', typeof eliteResult.icp_score === 'number');
test('Score elite >= 75 (candidato Tier A ou B)', eliteResult.icp_score >= 75, `Score: ${eliteResult.icp_score}`);
test('Tier atribuído para lead elite', ['TIER A', 'TIER B'].includes(eliteResult.icp_tier), `Tier: ${eliteResult.icp_tier}`);
test('Fatores ICP retornados', eliteResult.icp_factors && typeof eliteResult.icp_factors === 'object');
test('Fator porte_capital presente', typeof eliteResult.icp_factors.porte_capital === 'number');
test('Fator vitalidade presente', typeof eliteResult.icp_factors.vitalidade === 'number');
test('Fator canais presente', typeof eliteResult.icp_factors.canais === 'number');
test('Fator atratividade_territorial presente', typeof eliteResult.icp_factors.atratividade_territorial === 'number');

// Lead MEI — deve ter score muito baixo
const leadMei = {
  capital_social: 2000,
  porte: 'MEI',
  qsa: [{ data_entrada: '01/01/2023' }],
  vitality: { score: 30, status: 'EM_TRANSICAO' },
  city_macro_data: { ipc_score: 20 },
  contact_health: { is_mobile: false, is_whatsapp_probable: false },
  email: null,
  telefone: null
};

const meiResult = calculateIcpFitScore(leadMei);
test('Score MEI <= 30 (baixa aderência)', meiResult.icp_score <= 30, `Score: ${meiResult.icp_score}`);
test('Tier MEI = TIER D', meiResult.icp_tier === 'TIER D', `Tier: ${meiResult.icp_tier}`);
test('porte_capital do MEI = 0', meiResult.icp_factors.porte_capital === 0);

// Verificar que score fica entre 0 e 100
test('Score entre 0 e 100 (elite)', eliteResult.icp_score >= 0 && eliteResult.icp_score <= 100);
test('Score entre 0 e 100 (MEI)', meiResult.icp_score >= 0 && meiResult.icp_score <= 100);

// Relação de Score (elite > MEI)
test('Score elite > score MEI (ordenação consistente)', eliteResult.icp_score > meiResult.icp_score);

// ─── TESTES DO FUNIL GTM (TAM / SAM / SOM) ─────────────────────────────────
console.log('\n--- Testes do Motor de Funil GTM (gtmMetricsEngine) ---');

// Criar leads de teste com propriedades variadas
const leads = [
  // Lead 1: Tier A candidate - ativo, alto capital, WhatsApp, IPC alto
  { capital_social: 3000000, porte: 'DEMAIS', vitality: { status: 'OPERACAO_ATIVA', score: 90 }, contact_health: { is_mobile: true, is_whatsapp_probable: true }, city_macro_data: { ipc_score: 80 }, icp_score: 88, icp_tier: 'TIER A', telefone: '(66) 99000-0001' },
  // Lead 2: Tier B candidate
  { capital_social: 800000, porte: 'DEMAIS', vitality: { status: 'OPERACAO_ATIVA', score: 72 }, contact_health: { is_mobile: true, is_whatsapp_probable: true }, city_macro_data: { ipc_score: 65 }, icp_score: 70, icp_tier: 'TIER B', telefone: '(62) 98000-0002' },
  // Lead 3: Tier C candidate - baixo capital mas ativo
  { capital_social: 120000, porte: 'EPP', vitality: { status: 'OPERACAO_ATIVA', score: 65 }, contact_health: { is_mobile: false, is_whatsapp_probable: false }, city_macro_data: { ipc_score: 50 }, icp_score: 50, icp_tier: 'TIER C', telefone: '(11) 2222-3333' },
  // Lead 4: MEI - excluído do SAM
  { capital_social: 5000, porte: 'MEI', vitality: { status: 'EM_TRANSICAO', score: 30 }, contact_health: { is_mobile: false, is_whatsapp_probable: false }, city_macro_data: { ipc_score: 20 }, icp_score: 10, icp_tier: 'TIER D', telefone: null },
  // Lead 5: Sem contato válido - excluído do SOM
  { capital_social: 250000, porte: 'EPP', vitality: { status: 'EM_TRANSICAO', score: 55 }, contact_health: { is_mobile: false, is_whatsapp_probable: false }, city_macro_data: { ipc_score: 30 }, icp_score: 40, icp_tier: 'TIER C', telefone: null },
];

const funnel = calculateGtmMarketFunnel(leads, 1000);

test('Funil retornado corretamente', funnel && typeof funnel === 'object');
test('TAM count = total de leads', funnel.tam.count === leads.length, `TAM: ${funnel.tam.count}`);
test('TAM capital > 0', funnel.tam.total_capital > 0, `Capital: ${funnel.tam.total_capital}`);
test('TAM formatted retornado', typeof funnel.tam.total_capital_formatted === 'string');

test('SAM count < TAM (MEI excluído)', funnel.sam.count < funnel.tam.count, `SAM: ${funnel.sam.count} / TAM: ${funnel.tam.count}`);
test('SAM count > 0', funnel.sam.count > 0);
test('SAM % do TAM calculado', typeof funnel.sam.pct_of_tam === 'number');

test('SOM count <= SAM count (relação estrita)', funnel.som.count <= funnel.sam.count, `SOM: ${funnel.som.count} / SAM: ${funnel.sam.count}`);
test('TAM >= SAM >= SOM (funil decrescente)', funnel.tam.count >= funnel.sam.count && funnel.sam.count >= funnel.som.count);

test('Distribuição de Tiers presente', funnel.tier_distribution && typeof funnel.tier_distribution === 'object');
test('Tier A no distribution', typeof funnel.tier_distribution.TIER_A === 'number');
test('Soma dos tiers = TAM count', 
  (funnel.tier_distribution.TIER_A + funnel.tier_distribution.TIER_B + funnel.tier_distribution.TIER_C + funnel.tier_distribution.TIER_D) === funnel.tam.count,
  `Sum: ${funnel.tier_distribution.TIER_A + funnel.tier_distribution.TIER_B + funnel.tier_distribution.TIER_C + funnel.tier_distribution.TIER_D}`
);
test('universe_count presente', typeof funnel.universe_count === 'number');

// Funil vazio
const emptyFunnel = calculateGtmMarketFunnel([], 0);
test('Funil vazio tem TAM=0', emptyFunnel.tam.count === 0);
test('Funil vazio tem SAM=0', emptyFunnel.sam.count === 0);
test('Funil vazio tem SOM=0', emptyFunnel.som.count === 0);

// ─── TESTES DE INTEGRAÇÃO COM LEADSSERVICE ──────────────────────────────────
console.log('\n--- Testes de Integração com leadsService (ICP Fit & GTM Funnel) ---');

const result = queryLeads({ page: 1, page_size: 15 });
test('queryLeads retornou dados', Array.isArray(result.data));
test('gtm_funnel presente na resposta', result.gtm_funnel !== undefined);
test('gtm_funnel.tam presente', result.gtm_funnel?.tam !== undefined);
test('gtm_funnel.sam <= gtm_funnel.tam', result.gtm_funnel?.sam?.count <= result.gtm_funnel?.tam?.count);
test('gtm_funnel.som <= gtm_funnel.sam', result.gtm_funnel?.som?.count <= result.gtm_funnel?.sam?.count);
test('Leads possuem icp_score', result.data.every(l => typeof l.icp_score === 'number'), 'Algum lead sem icp_score');
test('Leads possuem icp_tier', result.data.every(l => typeof l.icp_tier === 'string'), 'Algum lead sem icp_tier');
test('Leads possuem icp_factors', result.data.every(l => l.icp_factors !== undefined), 'Algum lead sem icp_factors');

// Filtro por ICP Tier A
const tierAResult = queryLeads({ page: 1, page_size: 50, icp_tier: 'TIER A' });
test('Filtro por TIER A retornou resultado', Array.isArray(tierAResult.data));
if (tierAResult.data.length > 0) {
  test('Todos os leads filtrados são TIER A', tierAResult.data.every(l => l.icp_tier === 'TIER A'));
}

// Filtro por ICP Tier A + B
const tierABResult = queryLeads({ page: 1, page_size: 50, icp_tier: 'TIER A,TIER B' });
test('Filtro por TIER A,TIER B retornou resultado', Array.isArray(tierABResult.data));
if (tierABResult.data.length > 0) {
  test('Todos os leads de TIER A+B são válidos', tierABResult.data.every(l => ['TIER A', 'TIER B'].includes(l.icp_tier)));
}

// ─── RESUMO ─────────────────────────────────────────────────────────────────
console.log('\n========================================');
const total = passed + failed;
if (failed === 0) {
  console.log(`🎉 TODOS OS ${total}/${total} TESTES DA FASE 20 PASSARAM COM SUCESSO!\n`);
} else {
  console.log(`⚠️  RESULTADO: ${passed}/${total} testes passaram. ${failed} falharam.\n`);
  process.exit(1);
}
