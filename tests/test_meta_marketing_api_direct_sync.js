import assert from 'assert';
import { MetaMarketingClient } from '../server/src/modules/integrations/metaMarketingApi.js';
import { transformToMetaAds, sha256 } from '../server/src/services/metaHasher.js';
import { aiCopilotService, COPILOT_TOOLS } from '../server/src/services/aiCopilotService.js';

console.log('🧪 Iniciando Suíte de Testes: Meta Marketing API Direct Sync (Custom Audiences)...');

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

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // 1. Testes de Hashing SHA-256 B2B e Agro
  test('transformToMetaAds deve processar leads B2B corporativos com SHA-256', () => {
    const leads = [
      {
        razao_social: 'Agropecuaria Santa Maria LTDA',
        contato_nome: 'Carlos Eduardo Mendes',
        email: 'carlos@santamaria.com.br',
        telefone: '+55 (65) 99988-7766',
        municipio: 'Sorriso',
        uf: 'MT',
        cep: '78890-000',
        cnpj: '12.345.678/0001-90'
      }
    ];

    const hashed = transformToMetaAds(leads);
    assert.strictEqual(hashed.length, 1);
    assert.ok(hashed[0].email, 'Email deve estar hasheado');
    assert.ok(hashed[0].phone, 'Telefone deve estar hasheado');
    assert.ok(hashed[0].fn, 'First name deve estar hasheado');
    assert.ok(hashed[0].ln, 'Last name deve estar hasheado');
    assert.ok(hashed[0].ct, 'Cidade deve estar hasheada');
    assert.ok(hashed[0].st, 'Estado deve estar hasheado');
    assert.strictEqual(hashed[0].country, sha256('br'));
    assert.strictEqual(hashed[0].cnpj, '12.345.678/0001-90');
  });

  test('transformToMetaAds deve suportar propriedades rurais (nome_titular e whatsapp_validado)', () => {
    const agroProps = [
      {
        nome_titular: 'Valdir Antonio Della Libera',
        whatsapp_validado: '+5554999123456',
        cidade: 'Passo Fundo',
        estado: 'RS',
        cpf_cnpj_titular: '123.456.789-00'
      }
    ];

    const hashed = transformToMetaAds(agroProps);
    assert.strictEqual(hashed.length, 1);
    assert.ok(hashed[0].phone, 'Telefone validado do produtor deve estar hasheado');
    assert.ok(hashed[0].fn, 'Nome do titular deve estar hasheado');
    assert.ok(hashed[0].ct, 'Cidade deve ser resolvida via cidade/estado');
    assert.strictEqual(hashed[0].cnpj, '123.456.789-00');
  });

  // 2. Teste do Cliente MetaMarketingClient (Sandbox / Simulação)
  await testAsync('MetaMarketingClient deve criar Custom Audience em modo Sandbox resiliente', async () => {
    const client = new MetaMarketingClient();
    const result = await client.createCustomAudience('Teste B2B Agro', 'Público qualificado');
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.simulated, true);
    assert.ok(result.audience_id.startsWith('sim_aud_'));
    assert.strictEqual(result.status, 'READY_SIMULATED');
  });

  await testAsync('MetaMarketingClient deve sincronizar lista de leads com SHA-256 no Custom Audience', async () => {
    const client = new MetaMarketingClient();
    const leads = [
      {
        contato_nome: 'Joao Silva',
        telefone: '65999881122',
        email: 'joao@fazenda.com',
        municipio: 'Sinop',
        uf: 'MT'
      }
    ];

    const syncRes = await client.syncLeadsToAudience('sim_aud_123', leads);
    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(syncRes.simulated, true);
    assert.strictEqual(syncRes.records_synced, 1);
    assert.ok(syncRes.estimated_match_rate);
    assert.ok(syncRes.synced_at);
  });

  // 3. Teste das Ferramentas do Copiloto de IA
  test('COPILOT_TOOLS deve incluir a ferramenta oficial sincronizarMetaMarketingApi', () => {
    const tool = COPILOT_TOOLS.find(t => t.function?.name === 'sincronizarMetaMarketingApi');
    assert.ok(tool, 'Tool sincronizarMetaMarketingApi deve existir');
    assert.ok(tool.function.description.includes('Meta Ads'));
  });

  await testAsync('aiCopilotService deve disparar trigger_sync_meta_ads via heurística autônoma', async () => {
    const response = await aiCopilotService.processChat({
      prompt: 'Sincronizar no Meta Ads o público de produtores de soja agora',
      context: {
        properties: [
          { id: 101, nome_titular: 'Produtor Teste', whatsapp_validado: '+5565999887766' }
        ]
      }
    });

    assert.strictEqual(response.success, true);
    assert.strictEqual(response.action, 'trigger_sync_meta_ads');
    assert.ok(response.action_payload);
    assert.strictEqual(response.action_payload.tipo_lead, 'agro');
    assert.ok(response.reply.includes('Meta Marketing API'));
  });

  console.log(`\n🎉 Todos os ${passed}/${total} testes de Meta Marketing API Direct Sync passaram com sucesso!`);
}

runTests().catch(err => {
  console.error('Falha geral nos testes:', err);
  process.exit(1);
});
