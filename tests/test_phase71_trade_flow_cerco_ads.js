/**
 * SUÍTE DE TESTES E2E & NÃO-REGRESSÃO - FASE 71
 * MÓDULO DE RADAR DE ESCOAMENTO DE VENDAS & CERCO DE TRÁFEGO PAGO
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  resolveProductMix, 
  resolveDestinationMarkets, 
  getCompetitorTradeFlow, 
  generateCercoAdsPayload 
} from '../server/src/services/competitorTradeFlowService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

console.log('\n================================================================');
console.log('🧪 TEST SUITE FASE 71: RADAR DE ESCOAMENTO & CERCO DE TRÁFEGO PAGO');
console.log('================================================================\n');

try {
  // ---------------------------------------------------------------------------
  // 1. Teste do Motor de Resolução de Mix e Destinos Fiscais
  // ---------------------------------------------------------------------------
  console.log('▶ Teste 1: Classificação do Mix de Produtos e Ticket Médio');
  const mockConcessionaria = {
    cnae_principal_codigo: '4661-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas e equipamentos agrícolas',
    razao_social: 'SLC MAQUINAS E TRATORES AGRICOLAS LTDA',
    nome_fantasia: 'SLC MÁQUINAS'
  };
  const mixMachinery = resolveProductMix(mockConcessionaria);
  assert(mixMachinery.category_label.includes('Máquinas'), 'Concessionária categorizada corretamente');
  assert(mixMachinery.mix_items.length >= 3, 'Mix de máquinas contém 3 ou mais itens ponderados');
  assert(mixMachinery.ticket_medio_estimado > 1000000, 'Ticket médio de máquinas pesadas condizente (> R$ 1M)');

  const mockCooperativa = {
    cnae_principal_codigo: '4623-1/09',
    cnae_principal_descricao: 'Comércio atacadista de café em grão',
    razao_social: 'COOPERALFA - COOPERATIVA AGROINDUSTRIAL ALFA',
    nome_fantasia: 'COOPERALFA'
  };
  const mixCoop = resolveProductMix(mockCooperativa);
  assert(mixCoop.category_label.includes('Cooperativa'), 'Cooperativa agroindustrial categorizada corretamente');

  // ---------------------------------------------------------------------------
  // 2. Teste do Fluxo Geodésico e Cerco de Tráfego Pago
  // ---------------------------------------------------------------------------
  console.log('\n▶ Teste 2: Mapeamento Geodésico de Praças e String de Geofencing Meta Ads');
  const slcId = 'lead-agro-89123456000178';
  const flow = getCompetitorTradeFlow(slcId, 'tenant-root-default');

  assert(flow.trade_flow && flow.trade_flow.destinations.length > 0, 'Praças de escoamento calculadas com sucesso');
  assert(typeof flow.trade_flow.faturamento_estimado_anual === 'number', 'Faturamento anual estimado calculado');

  const cerco = generateCercoAdsPayload(slcId, 'tenant-root-default');
  assert(cerco.geofencing_destinations.length > 0, 'Alfinetes de geofencing gerados');
  
  const samplePin = cerco.geofencing_destinations[0].meta_ads_pin_string;
  assert(/^[-0-9.,:+a-zA-Z]+$/.test(samplePin) && samplePin.includes('km'), `Formato válido de alfinete Meta Ads: ${samplePin}`);

  assert(cerco.counter_attack_copies.length === 3, '3 copies persuasivas de contra-ataque geradas');
  assert(cerco.counter_attack_copies[0].corpo.length > 50, 'Corpo da copy possui densidade de argumentação comercial');

  // ---------------------------------------------------------------------------
  // 3. Teste de Compliance Visual Estrito: ZERO EMOJIS no Código Adicionado
  // ---------------------------------------------------------------------------
  console.log('\n▶ Teste 3: Compliance Visual Estrito (Zero Emojis de Rede Social)');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'client', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(rootDir, 'client', 'js', 'app.js'), 'utf8');

  // Extrai o card de trade flow no index.html
  const cardIdx = indexHtml.indexOf('id="inspectorCompetitorTradeFlowCard"');
  assert(cardIdx !== -1, 'Card inspectorCompetitorTradeFlowCard presente no index.html');
  const modalIdx = indexHtml.indexOf('id="modalCercoAds"');
  assert(modalIdx !== -1, 'Modal modalCercoAds presente no index.html');

  const tradeFlowBlockHtml = indexHtml.substring(cardIdx, cardIdx + 2500);
  const modalBlockHtml = indexHtml.substring(modalIdx, modalIdx + 4500);

  const forbiddenEmojis = ['🎯', '📦', '🌾', '📍', '🚨', '🚜', '🌱', '🛒', '💰', '🔥', '✨', '⚡'];

  for (const emoji of forbiddenEmojis) {
    assert(!tradeFlowBlockHtml.includes(emoji), `Zero emoji "${emoji}" no card do Inspetor`);
    assert(!modalBlockHtml.includes(emoji), `Zero emoji "${emoji}" no modal do Cerco Ads`);
  }

  // ---------------------------------------------------------------------------
  // 4. Teste das Rotas e Handlers HTTP
  // ---------------------------------------------------------------------------
  console.log('\n▶ Teste 4: Integração de Rotas e Handlers de API');
  const apiRoutes = fs.readFileSync(path.join(rootDir, 'server', 'src', 'routes', 'api.js'), 'utf8');
  assert(apiRoutes.includes('/competitors/:id/trade-flow'), 'Rota /competitors/:id/trade-flow registrada');
  assert(apiRoutes.includes('/competitors/:id/cerco-ads'), 'Rota /competitors/:id/cerco-ads registrada');
  assert(apiRoutes.includes('/competitors/:id/export-cerco-csv'), 'Rota /competitors/:id/export-cerco-csv registrada');

  assert(appJs.includes('window.renderCompetitorTradeFlow = async function') || appJs.includes('window.renderCompetitorTradeFlow = function'), 'Função renderCompetitorTradeFlow exposta no app.js');
  assert(appJs.includes('window.openCercoAdsModal = async function') || appJs.includes('window.openCercoAdsModal = function'), 'Função openCercoAdsModal exposta no app.js');
  assert(appJs.includes('window.copyGeofencePins = function'), 'Função copyGeofencePins exposta no app.js');

} catch (err) {
  console.error('❌ Erro inesperado durante os testes:', err);
}

console.log('\n================================================================');
console.log(`📊 RESULTADO FINAL DA FASE 71: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
