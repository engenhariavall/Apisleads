import assert from 'assert';
import db from '../server/src/config/database.js';
import { whatsappOutboundService } from '../server/src/services/whatsappOutboundService.js';
import { scopeAuditService } from '../server/src/services/scopeAuditService.js';

console.log('🧪 Iniciando Suíte de Testes: WhatsApp B2B Validator/Outbound & AI Scope Deviation Auditor...');

async function runTests() {
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
      throw err;
    }
  }

  // 1. Testes de Validação de Telefones e 67 DDDs (WhatsApp Validator)
  test('Deve validar celular com 9º dígito e DDD 65 (MT) como EXCELLENT', () => {
    const res = whatsappOutboundService.validate('(65) 99988-7766');
    assert.strictEqual(res.is_valid, true);
    assert.strictEqual(res.type, 'MOBILE');
    assert.strictEqual(res.ddd, '65');
    assert.strictEqual(res.e164, '+5565999887766');
    assert.strictEqual(res.quality_tier, 'EXCELLENT');
    assert.ok(res.direct_whatsapp_url.includes('wa.me/5565999887766'));
  });

  test('Deve identificar linha fixa com DDD 41 (PR) como LANDLINE', () => {
    const res = whatsappOutboundService.validate('(41) 3220-4100');
    assert.strictEqual(res.is_valid, true);
    assert.strictEqual(res.type, 'LANDLINE');
    assert.strictEqual(res.quality_tier, 'GOOD');
    assert.strictEqual(res.e164, '+554132204100');
  });

  test('Deve rejeitar número com DDD inexistente no Brasil (ex: 29)', () => {
    const res = whatsappOutboundService.validate('29999887766');
    assert.strictEqual(res.is_valid, false);
    assert.strictEqual(res.type, 'INVALID_DDD');
    assert.strictEqual(res.quality_tier, 'REJECTED');
  });

  test('Deve validar em lote telefones mistos', () => {
    const batch = whatsappOutboundService.validateBatch(['(11) 98877-6655', 'invalido', '(54) 99911-2233']);
    assert.strictEqual(batch.length, 3);
    assert.strictEqual(batch[0].validation.is_valid, true);
    assert.strictEqual(batch[1].validation.is_valid, false);
    assert.strictEqual(batch[2].validation.is_valid, true);
  });

  // 2. Testes de Disparo e Geração Contextual Outbound
  test('Deve preparar abordagem persuasiva para produtor rural', () => {
    const copy = whatsappOutboundService.prepareApproach({
      nome_titular: 'Renato Della Libera',
      nome_imovel: 'Fazenda Planalto',
      cidade: 'Passo Fundo',
      dados_agronomicos: { crop_type: 'Soja' }
    });
    assert.ok(copy.includes('Renato'));
    assert.ok(copy.includes('Fazenda Planalto'));
    assert.ok(copy.includes('Passo Fundo'));
    assert.ok(copy.includes('Soja'));
  });

  test('Deve disparar outbound, gerar URL wa.me e persistir auditoria no SQLite', () => {
    try {
      db.prepare("INSERT OR REPLACE INTO tenants (id, name, cnpj) VALUES ('tenant-test-audit', 'Audit Tenant Test', '22222222000100')").run();
    } catch {}

    const dispatchRes = whatsappOutboundService.dispatch({
      tenant_id: 'tenant-test-audit',
      phone: '65999887766',
      lead: { nome_titular: 'Carlos Agro', nome_imovel: 'Fazenda Sol' }
    });

    assert.strictEqual(dispatchRes.success, true);
    assert.strictEqual(dispatchRes.status, 'DISPATCHED');
    assert.strictEqual(dispatchRes.e164, '+5565999887766');
    assert.ok(dispatchRes.direct_url.startsWith('https://wa.me/5565999887766?text='));

    // Verifica persistência no SQLite
    const history = whatsappOutboundService.getHistory('tenant-test-audit');
    assert.ok(history.length >= 1);
    assert.strictEqual(history[0].id, dispatchRes.message_id);
    assert.strictEqual(history[0].e164, '+5565999887766');
  });

  // 3. Testes de Auditoria Semântica e Detecção de Desvio de Escopo
  test('Deve registrar score NORMAL para consulta perfeitamente alinhada', () => {
    const evalRes = scopeAuditService.evaluateQuery({
      tenant_id: 'tenant-root-default',
      query_text: 'produtores de soja e milho em sorriso mt'
    });

    assert.strictEqual(evalRes.deviation_score, 0);
    assert.strictEqual(evalRes.deviation_level, 'NORMAL');
    assert.strictEqual(evalRes.is_flagged, false);
  });

  test('Deve detectar CRITICAL para desvio de escopo setorial', () => {
    // Insere tenant de teste com perfil Agro
    try {
      db.prepare("INSERT OR REPLACE INTO tenants (id, name, cnpj) VALUES ('tenant-agro-strict', 'Agro Forte Solucoes', '11111111000100')").run();
    } catch {}

    const evalDeviated = scopeAuditService.evaluateQuery({
      tenant_id: 'tenant-agro-strict',
      query_text: 'clinica cirurgia plastica estetica odontologia'
    });

    assert.ok(evalDeviated.deviation_score >= 60, 'Score de desvio deve ser alto');
    assert.strictEqual(evalDeviated.deviation_level, 'CRITICAL');
    assert.strictEqual(evalDeviated.is_flagged, true);
    assert.ok(evalDeviated.anomalies.some(a => a.includes('Desvio de Nicho')));

    // Verifica listagem de desvios para o Super Admin
    const deviations = scopeAuditService.listDeviations(10);
    assert.ok(deviations.some(d => d.tenant_id === 'tenant-agro-strict' && d.deviation_level === 'CRITICAL'));
  });

  test('Deve sinalizar consulta com padrão suspeito de dump ou extração', () => {
    const evalDump = scopeAuditService.evaluateQuery({
      tenant_id: 'tenant-root-default',
      query_text: 'tentativa de raspagem ilimitada para vazar base'
    });

    assert.ok(evalDump.deviation_score >= 35);
    assert.ok(evalDump.anomalies.some(a => a.includes('alto risco')));
  });

  console.log(`\n🎉 Todos os ${passed}/${total} testes de WhatsApp B2B e Scope Deviation passaram com 100% de sucesso!`);
}

runTests().catch(err => {
  console.error('Falha geral nos testes:', err);
  process.exit(1);
});
