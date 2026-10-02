/**
 * TESTE DE VALIDAÇÃO E2E - INTELIGÊNCIA COMPETITIVA & VARREDURA MULTI-TENANT (AVALL MARKETING)
 */

import { listCompetitors, calculateMarketGaps, runRegionalCompetitorSweep } from '../server/src/services/competitorIntelligenceService.js';

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
console.log('🧪 TEST SUITE: INTELIGÊNCIA COMPETITIVA & VARREDURA MULTI-TENANT');
console.log('================================================================\n');

try {
  const avallTenantId = 'tenant-e6094206';

  // 1. Listagem de Concorrentes para o Tenant Avall
  console.log('▶ Teste 1: Listagem de Concorrentes Monitorados com Herança de Base Raiz');
  const competitors = listCompetitors(avallTenantId);
  assert(competitors.length > 0, `Tenant Avall recupera ${competitors.length} concorrentes monitorados`);
  
  const hasFragility = competitors.every(c => c.fragility && typeof c.fragility.fragility_score === 'number');
  assert(hasFragility, 'Todos os concorrentes retornam com Índice de Fragilidade Operacional calculado');

  // 2. Cálculo de Zonas de Brecha (Gaps de Mercado) para o Tenant Avall
  console.log('\n▶ Teste 2: Zonas de Brecha e Vazios Territoriais (Gaps)');
  const gaps = calculateMarketGaps({ tenant_id: avallTenantId, buffer_km: 50 });
  assert(gaps.length > 0, `Tenant Avall recupera ${gaps.length} zonas de oportunidade e gaps calculados`);

  const hasScore = gaps.every(g => typeof g.gap_score === 'number' && g.gap_score >= 0);
  assert(hasScore, 'Todas as zonas de brecha contêm Gap Score de mercado válido');

  // 3. Execução da Varredura Regional por Estado (RS)
  console.log('\n▶ Teste 3: Disparo de Varredura Regional por Estado (RS)');
  const sweepResult = runRegionalCompetitorSweep({
    uf: 'RS',
    segmento: 'TODOS',
    buffer_km: 50,
    tenant_id: avallTenantId
  });

  assert(sweepResult.success === true, 'Varredura regional executada com sucesso');
  assert(sweepResult.total_competitors > 0, `Varredura retorna ${sweepResult.total_competitors} concorrentes totais`);
  assert(sweepResult.total_gaps > 0, `Varredura recalcula e retorna ${sweepResult.total_gaps} zonas de brecha imediatas`);

} catch (err) {
  console.error('❌ Erro inesperado durante os testes:', err);
}

console.log('\n================================================================');
console.log(`📊 RESULTADO FINAL MULTI-TENANT: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
