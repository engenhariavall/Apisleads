/**
 * test_phase54_step2_function_calling.js
 * FASE 54 — ETAPA 2: FUNCTION CALLING / AGENTE AUTÔNOMO
 * 
 * Validação da definição das Tools no backend, schemas JSON,
 * interceptação de tool_calls, Action Dispatcher no frontend e feedback visual.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
  console.log('\n=============================================================');
  console.log('🧪 TESTES: FASE 54 - ETAPA 2 (FUNCTION CALLING / AGENTE EXECUTOR)');
  console.log('=============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   ${err.message}`);
    }
  }

  const { aiCopilotService, COPILOT_TOOLS } = await import('../server/src/services/aiCopilotService.js');

  // TESTE 1: Definição oficial das Tools no backend
  await test('1. COPILOT_TOOLS define exportarMetaAdsAudience, filtrarMalhaAgro e gerarAbordagemSdr', async () => {
    assert(Array.isArray(COPILOT_TOOLS), 'COPILOT_TOOLS deve ser um array');
    assert(COPILOT_TOOLS.length >= 3, 'Deve conter pelo menos as 3 ferramentas principais');

    const names = COPILOT_TOOLS.map(t => t.function.name);
    assert(names.includes('exportarMetaAdsAudience'), 'Deve conter exportarMetaAdsAudience');
    assert(names.includes('filtrarMalhaAgro'), 'Deve conter filtrarMalhaAgro');
    assert(names.includes('gerarAbordagemSdr'), 'Deve conter gerarAbordagemSdr');
  });

  // TESTE 2: Conformidade dos JSON Schemas das Tools
  await test('2. JSON Schemas das Tools possuem propriedades válidas e descrições técnicas', async () => {
    const exportTool = COPILOT_TOOLS.find(t => t.function.name === 'exportarMetaAdsAudience');
    assert.ok(exportTool.function.parameters.properties.only_valid_whatsapp);

    const filterTool = COPILOT_TOOLS.find(t => t.function.name === 'filtrarMalhaAgro');
    assert.ok(filterTool.function.parameters.properties.cultura);
    assert.ok(filterTool.function.parameters.properties.uf);

    const sdrTool = COPILOT_TOOLS.find(t => t.function.name === 'gerarAbordagemSdr');
    assert.ok(sdrTool.function.parameters.properties.id_propriedade);
    assert(sdrTool.function.parameters.required.includes('id_propriedade'));
  });

  // TESTE 3: Disparo autônomo da ação trigger_export_meta_ads
  await test('3. Copiloto intercepta comando de tráfego e aciona trigger_export_meta_ads', async () => {
    const context = {
      properties: [
        {
          id: 'prop-01',
          nome_imovel: 'Fazenda Rio Verde',
          nome_titular: 'Produtor Soja MT',
          municipio: 'Sorriso',
          uf: 'MT',
          whatsapp_validado: '+5566998881234',
          intent_classification: 'HOT'
        }
      ]
    };

    const res = await aiCopilotService.processChat({
      prompt: 'Por favor, exporte a planilha formatada para o Meta Ads com esses dados.',
      context
    });

    assert.ok(res.success);
    assert.strictEqual(res.action, 'trigger_export_meta_ads', 'Deve retornar action trigger_export_meta_ads');
    assert.ok(res.action_payload, 'Deve conter action_payload');
    assert.ok(res.reply.includes('Meta Ads') || res.reply.includes('planilha'));
  });

  // TESTE 4: Disparo autônomo da ação trigger_filter_agro
  await test('4. Copiloto intercepta comando de mapa e aciona trigger_filter_agro com cultura e UF', async () => {
    const res = await aiCopilotService.processChat({
      prompt: 'Filtre a malha fundiária mostrando apenas as fazendas de Soja no MT.',
      context: { properties: [] }
    });

    assert.ok(res.success);
    assert.strictEqual(res.action, 'trigger_filter_agro', 'Deve retornar action trigger_filter_agro');
    assert.strictEqual(res.action_payload.cultura, 'Soja', 'Deve extrair cultura Soja');
    assert.strictEqual(res.action_payload.uf, 'MT', 'Deve extrair UF MT');
  });

  // TESTE 5: Disparo autônomo da ação trigger_sdr_outbound
  await test('5. Copiloto intercepta pedido de abordagem comercial e aciona trigger_sdr_outbound', async () => {
    const context = {
      properties: [
        {
          id: 'prop-hot-01',
          id_sigef: 'SIGEF-MT-001',
          nome_imovel: 'Fazenda Terra Rica',
          nome_titular: 'Carlos Schneider Fagundes',
          municipio: 'Sorriso',
          whatsapp_validado: '+5566997771234',
          intent_classification: 'HOT',
          dados_agronomicos: { crop_type: 'Milho' }
        }
      ]
    };

    const res = await aiCopilotService.processChat({
      prompt: 'Gere uma abordagem comercial persuasiva de SDR no WhatsApp para esse produtor.',
      context
    });

    assert.ok(res.success);
    assert.strictEqual(res.action, 'trigger_sdr_outbound', 'Deve retornar action trigger_sdr_outbound');
    assert.ok(res.action_payload.copy, 'Deve gerar a copy de abordagem');
    assert(res.action_payload.phone.includes('+55'), 'Deve associar o telefone validado');
  });

  // TESTE 6: Implementação do Action Dispatcher no client/js/aiCopilot.js
  await test('6. client/js/aiCopilot.js implementa dispatchAction com as 3 ações táticas', async () => {
    const js = fs.readFileSync(path.join(__dirname, '../client/js/aiCopilot.js'), 'utf-8');

    assert(js.includes('dispatchAction'), 'aiCopilot.js deve conter dispatchAction');
    assert(js.includes('trigger_export_meta_ads'), 'aiCopilot.js deve tratar trigger_export_meta_ads');
    assert(js.includes('trigger_filter_agro'), 'aiCopilot.js deve tratar trigger_filter_agro');
    assert(js.includes('trigger_sdr_outbound'), 'aiCopilot.js deve tratar trigger_sdr_outbound');
    assert(js.includes('downloadMetaAdsCsv'), 'aiCopilot.js deve conter método downloadMetaAdsCsv');
  });

  // TESTE 7: Cards de Ação Tática e Feedback Visual
  await test('7. Feedback Visual: renderActionCard renderiza cards interativos e estilos em styles.css', async () => {
    const js = fs.readFileSync(path.join(__dirname, '../client/js/aiCopilot.js'), 'utf-8');
    const css = fs.readFileSync(path.join(__dirname, '../client/css/styles.css'), 'utf-8');

    assert(js.includes('renderActionCard'), 'aiCopilot.js deve conter renderActionCard');
    assert(js.includes('copilot-action-card'), 'aiCopilot.js deve aplicar classe copilot-action-card');
    assert(css.includes('.copilot-action-card'), 'styles.css deve conter estilização de .copilot-action-card');
    assert(css.includes('.action-card-header'), 'styles.css deve conter .action-card-header');
    assert(css.includes('.btn-action-card'), 'styles.css deve conter .btn-action-card');
  });

  console.log('\n-------------------------------------------------------------');
  console.log(`📊 RESULTADO FINAL: ${passed}/${total} TESTES APROVADOS (${Math.round((passed / total) * 100)}%)`);
  console.log('-------------------------------------------------------------\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Erro fatal nos testes de Function Calling:', err);
  process.exit(1);
});
