/**
 * tests/test_phase60_pj_rural_intelligence.js
 * 
 * BATERIA DE TESTES AUTOMATIZADOS: FASE 60 — DOMÍNIO TOTAL DE PJ RURAL
 * Valida enriquecimento de propriedades rurais PJ com:
 * 1. Razão Social canônica da Receita Federal
 * 2. CNPJ aberto e formatado
 * 3. Quadro Societário (QSA) com sócios e qualificações
 * 4. WhatsApp direto do decisor (+55...)
 * 5. Zero dependência de Bureau pago para dados públicos
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import { leadEnrichmentService, isMaskedTitular } from '../server/src/services/leadEnrichmentService.js';
import seedAgroLeads from '../server/src/config/seedAgroLeads.js';

async function runPhase60Tests() {
  console.log('🌱 ========================================================');
  console.log('🌱 INICIANDO TESTE DA FASE 60: MOTOR INTEGRAL DE PJ RURAL');
  console.log('🌱 ========================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Erro: ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Erro: ${err.message}`);
    }
  }

  // ── TESTE 1: Assegura seed de entidades com QSA e WhatsApp ───────────────
  await asyncTest('1. Catálogo Agro PJ e QSA persistidos em SQLite', async () => {
    await seedAgroLeads();

    const pfLeads = db.prepare(`
      SELECT count(*) as total FROM leads 
      WHERE UPPER(municipio) = 'PASSO FUNDO' AND target_type = 'BUYER'
    `).get();
    assert(pfLeads.total >= 5, `Esperava pelo menos 5 agroempresas em Passo Fundo, obteve ${pfLeads.total}`);

    const qsaRows = db.prepare(`SELECT count(*) as total FROM leads_socios`).get();
    assert(qsaRows.total >= 10, `Esperava sócios em leads_socios, obteve ${qsaRows.total}`);
  });

  // ── TESTE 2: Resolução de imóvel com nome cartorial (Gleba) ───────────────
  await asyncTest('2. Descascamento cartorial e match direto por núcleo de nome', async () => {
    const input = {
      nome_imovel: 'AGROPECUARIA SANTA FE - GLEBA 1.4 (MATRÍCULA 8923)',
      municipio: 'Passo Fundo',
      uf: 'RS',
      area_hectares: 320,
      codigo_car: 'RS-4314100-TESTE-SANTAFE'
    };

    const result = await leadEnrichmentService.enrichPropertyWaterfall(input, { forceRefresh: true });
    assert(result.success, 'Resultado deve indicar sucesso');
    assert.strictEqual(result.titular.razao_social, 'AGROPECUARIA SANTA FE LTDA', 'Deve resolver para AGROPECUARIA SANTA FE LTDA');
    assert.strictEqual(result.titular.tipo_pessoa, 'PJ', 'Tipo de pessoa deve ser PJ');
    assert(!isMaskedTitular(result.titular.nome_titular), 'Nome titular não pode ser mascarado');
    assert(result.titular.qsa && result.titular.qsa.length > 0, 'Deve conter quadro de sócios');
    assert(result.contatos.whatsapp && result.contatos.whatsapp.startsWith('+55'), 'Deve conter WhatsApp no formato E.164');
  });

  // ── TESTE 3: Resolução de imóvel genérico CAR via correlação municipal ────
  await asyncTest('3. Correlação espacial municipal para imóvel genérico do CAR', async () => {
    const input = {
      nome_imovel: 'Imóvel Rural (CAR)',
      municipio: 'Passo Fundo',
      uf: 'RS',
      area_hectares: 450,
      codigo_car: 'RS-4314100-99A82B3C4D5E6F',
      tipo_imovel: 'IRU',
      tag_fonte: 'SICAR'
    };

    const result = await leadEnrichmentService.enrichPropertyWaterfall(input, { forceRefresh: true });
    assert(result.success, 'Resultado deve indicar sucesso');
    assert(result.titular.razao_social, 'Deve atribuir Razão Social da empresa agrícola municipal');
    assert.strictEqual(result.titular.tipo_pessoa, 'PJ', 'Deve classificar como PJ');
    assert(!isMaskedTitular(result.titular.nome_titular), 'Não pode conter sigilo ou pendente');
    assert(result.titular.qsa && result.titular.qsa.length > 0, 'Deve associar tomadores de decisão (QSA)');
    assert(result.contatos.whatsapp, 'Deve associar canal WhatsApp de decisão');
    console.log(`     🏢 Empresa Correlacionada: ${result.titular.razao_social}`);
    console.log(`     📱 WhatsApp Decisor: ${result.contatos.whatsapp}`);
    console.log(`     👥 Sócios: ${result.titular.qsa.map(s => s.nome).join(', ')}`);
  });

  // ── TESTE 4: Validação do Endpoint HTTP /api/fundiario/enrich-osint ───────
  await asyncTest('4. Validação da API HTTP POST /api/fundiario/enrich-osint', async () => {
    const response = await fetch('http://localhost:3000/api/fundiario/enrich-osint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_imovel: 'FAZENDA NOSSA SENHORA APARECIDA - PARTE B',
        municipio: 'Passo Fundo',
        uf: 'RS',
        area_hectares: 510,
        codigo_car: 'RS-4314100-FAZENDA-APARECIDA'
      })
    });

    assert.strictEqual(response.status, 200, 'HTTP status deve ser 200');
    const data = await response.json();
    assert(data.success, 'Payload deve conter success: true');
    assert.strictEqual(data.tipo_pessoa, 'PJ', 'tipo_pessoa deve ser PJ');
    assert.strictEqual(data.razao_social, 'FAZENDA NOSSA SENHORA APARECIDA AGRO LTDA');
    assert(data.qsa && data.qsa.length > 0, 'Deve retornar QSA no payload');
    assert(data.whatsapp_validado, 'Deve retornar whatsapp_validado');
    console.log(`     ✓ API respondeu com dados públicos abertos e WhatsApp: ${data.whatsapp_validado}`);
  });

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO FINAL: ${passed}/${total} TESTES PASSARAM COM SUCESSO!`);
  console.log('========================================================\n');

  if (passed < total) {
    process.exit(1);
  }
}

runPhase60Tests().catch(err => {
  console.error('💥 Erro fatal nos testes:', err);
  process.exit(1);
});
