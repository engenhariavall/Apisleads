import assert from 'assert';
import { carService } from '../server/src/services/carService.js';
import { transformToMetaAds, sha256 } from '../server/src/services/metaHasher.js';
import { whatsappOutboundService } from '../server/src/services/whatsappOutboundService.js';
import { COPILOT_TOOLS, aiCopilotService } from '../server/src/services/aiCopilotService.js';

console.log('🧪 Iniciando Teste de Integração e Pontes: IA #1 ⇄ IA #2 (SICAR + Meta + WhatsApp + Copiloto)...');

async function runBridgeTests() {
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

  // 1. Teste de Ingestão e Fusão no carService
  await testAsync('carService deve buscar e normalizar malha com tags de proveniência', async () => {
    const carResult = await carService.buscarMalhaCarPorMunicipio({ uf: 'SC', municipio: 'Chapecó' });
    assert.strictEqual(carResult.type, 'FeatureCollection');
    assert.ok(Array.isArray(carResult.features));

    if (carResult.features.length > 0) {
      const feat = carResult.features[0];
      assert.ok(feat.properties.tag_fonte, 'Feature do CAR deve possuir tag_fonte');
      assert.ok(['SICAR', 'FUSAO_SIGEF_CAR'].includes(feat.properties.tag_fonte));
      assert.ok(feat.properties.codigo_car || feat.properties.status_car);
    }
  });

  // 2. Teste de Ponte: Imóvel do CAR ➔ Meta Ads Hashing
  test('Propriedade originária do CAR deve ser compatível com Meta Ads Hashing', () => {
    const carProperty = {
      nome_titular: 'Marcos Vinicius Silveira',
      cpf_cnpj_titular: '555.666.777-88',
      whatsapp_validado: '+5549999881122',
      cidade: 'Chapecó',
      estado: 'SC',
      codigo_car: 'SC-4204202-A87F112E',
      status_car: 'PENDENTE',
      tag_fonte: 'SICAR'
    };

    const hashed = transformToMetaAds([carProperty]);
    assert.strictEqual(hashed.length, 1);
    assert.ok(hashed[0].phone, 'Telefone do titular do CAR deve ser hasheado');
    assert.ok(hashed[0].fn, 'Primeiro nome do titular do CAR deve ser hasheado');
    assert.ok(hashed[0].ct, 'Cidade do imóvel deve ser hasheada');
    assert.strictEqual(hashed[0].st, sha256('sc'));
    assert.strictEqual(hashed[0].cnpj, '555.666.777-88');
  });

  // 3. Teste de Ponte: Imóvel do CAR ➔ Abordagem Outbound de WhatsApp
  test('Propriedade do CAR deve gerar abordagem contextualizada de WhatsApp para SDR', () => {
    const carProperty = {
      nome_titular: 'Silvana Oliveira',
      nome_imovel: 'Sítio Bela Vista',
      cidade: 'Concórdia',
      dados_agronomicos: { crop_type: 'Milho' },
      codigo_car: 'SC-4204301-B99C',
      status_car: 'PENDENTE',
      tag_fonte: 'SICAR'
    };

    const copy = whatsappOutboundService.prepareApproach(carProperty);
    assert.ok(copy.includes('Silvana'));
    assert.ok(copy.includes('Sítio Bela Vista'));
    assert.ok(copy.includes('Concórdia'));
    assert.ok(copy.includes('Milho'));
  });

  // 4. Teste de Ponte: Copiloto de IA com todas as 7 ferramentas unificadas
  test('COPILOT_TOOLS deve expor 7 ferramentas oficiais harmonizadas', () => {
    const names = COPILOT_TOOLS.map(t => t.function.name);
    assert.ok(names.length >= 7, 'Deve conter pelo menos 7 tools no Copilot');
    assert.ok(names.includes('exportarMetaAdsAudience'));
    assert.ok(names.includes('sincronizarMetaMarketingApi'));
    assert.ok(names.includes('filtrarMalhaAgro'));
    assert.ok(names.includes('gerarAbordagemSdr'));
    assert.ok(names.includes('agendarVarreduraNoturna'));
    assert.ok(names.includes('filtrarPassivoAmbiental'));
    assert.ok(names.includes('enviarLeadsParaCrm'));
  });

  // 5. Teste de Interceptação Semântica do Copiloto para CAR e Meta Ads
  await testAsync('aiCopilotService deve responder com trigger_car_filter para pedidos ambientais', async () => {
    const res = await aiCopilotService.processChat({
      prompt: 'Filtrar propriedades com passivo ambiental ou CAR pendente em SC',
      context: { properties: [] }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.action, 'trigger_car_filter');
    assert.ok(res.action_payload);
    assert.strictEqual(res.action_payload.uf, 'SC');
  });

  await testAsync('aiCopilotService deve responder com trigger_sync_meta_ads para pedidos de sincronização', async () => {
    const res = await aiCopilotService.processChat({
      prompt: 'Sincronizar no Meta Ads as propriedades rurais agora',
      context: { properties: [{ id: 1, nome_titular: 'Teste' }] }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.action, 'trigger_sync_meta_ads');
  });

  console.log(`\n🎉 Todos os ${passed}/${total} testes de integração IA #1 ⇄ IA #2 passaram com 100% de sucesso!`);
}

runBridgeTests().catch(err => {
  console.error('Falha nos testes de integração:', err);
  process.exit(1);
});
