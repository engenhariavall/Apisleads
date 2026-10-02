/**
 * test_phase54_step1_ai_copilot.js
 * FASE 54 — ETAPA 1: COPILOTO DE IA (AGENT OPENAI)
 * 
 * Validação da infraestrutura do chat, componentes de interface,
 * integração da rota backend POST /api/ai/chat, prompts de sistema e variáveis de ambiente.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
  console.log('\n=============================================================');
  console.log('🧪 TESTES: FASE 54 - ETAPA 1 (COPILOTO DE IA - AGENT OPENAI)');
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

  const { aiCopilotService } = await import('../server/src/services/aiCopilotService.js');
  const routerModule = await import('../server/src/routes/api.js');
  const router = routerModule.default;

  // TESTE 1: Rota POST /api/ai/chat registrada e validação de prompt
  await test('1. Rota POST /api/ai/chat está registrada e rejeita requisições sem prompt', async () => {
    const routeLayer = router.stack.find(layer => layer.route && layer.route.path === '/ai/chat');
    assert(routeLayer, 'Rota /ai/chat deve estar registrada no router');

    const handlers = routeLayer.route.stack.map(s => s.handle);
    const mainHandler = handlers[handlers.length - 1];

    let statusCode = 200;
    let jsonResult = null;
    const req = { body: {} };
    const res = {
      status(c) { statusCode = c; return this; },
      json(data) { jsonResult = data; return data; }
    };

    await mainHandler(req, res);
    assert.strictEqual(statusCode, 400, 'Deve retornar HTTP 400 para body sem prompt');
    assert.strictEqual(jsonResult.success, false);
  });

  // TESTE 2: System prompt instrui a IA sobre seu papel oficial
  await test('2. System Prompt contém a diretriz estrita da Plataforma VERSUS', async () => {
    const systemPrompt = aiCopilotService.buildSystemPrompt({});
    assert(systemPrompt.includes('Você é o Copiloto da Plataforma VERSUS'), 'Deve conter a identidade do Copiloto');
    assert(systemPrompt.includes('Sua missão é ajudar o operador de SDR e Marketing'), 'Deve conter a missão para SDR e Marketing');
    assert(systemPrompt.includes('Você tem acesso à lista de propriedades carregadas na memória'), 'Deve declarar acesso às propriedades na memória');
  });

  // TESTE 3: Injeção de contexto de propriedades em memória no System Prompt
  await test('3. Contexto de propriedades rurais em memória é injetado no System Prompt', async () => {
    const sampleContext = {
      properties: [
        {
          nome_imovel: 'Fazenda Pioneira',
          nome_titular: 'Amaggi Exportação',
          municipio: 'Sorriso',
          uf: 'MT',
          area_hectares: 3200,
          status_geo: 'CERTIFICADO',
          intent_score: 85,
          intent_classification: 'HOT',
          dados_agronomicos: { crop_type: 'Soja' },
          whatsapp_validado: '+5566999991234'
        }
      ],
      activeFilters: { uf: 'MT', municipio: 'Sorriso' }
    };

    const promptWithContext = aiCopilotService.buildSystemPrompt(sampleContext);
    assert(promptWithContext.includes('Propriedades Rurais Carregadas: 1'), 'Deve registrar contagem de propriedades');
    assert(promptWithContext.includes('Fazenda Pioneira'), 'Deve incluir nome do imóvel no contexto');
    assert(promptWithContext.includes('Amaggi Exportação'), 'Deve incluir titular no contexto');
    assert(promptWithContext.includes('Soja'), 'Deve incluir cultura agronômica no contexto');
  });

  // TESTE 4: Processamento do chat gera resposta estruturada para Meta Ads
  await test('4. Copiloto processa comando de formatação de planilha para Meta Ads sob demanda', async () => {
    const context = {
      properties: [
        {
          nome_imovel: 'Fazenda Teste Soja',
          nome_titular: 'Produtor Teste',
          municipio: 'Rio Verde',
          uf: 'GO',
          area_hectares: 1500,
          intent_classification: 'HOT',
          dados_agronomicos: { crop_type: 'Soja' },
          whatsapp_validado: '+5564998881122'
        }
      ]
    };

    const res = await aiCopilotService.processChat({
      prompt: 'Formate uma planilha estruturada para Meta Ads Custom Audiences com as propriedades carregadas.',
      context
    });

    assert.ok(res.success, 'Resposta deve ter success: true');
    assert.ok(res.reply, 'Deve conter reply de resposta');
    assert(res.reply.includes('Meta Ads') || res.reply.includes('Custom Audiences'), 'Deve mencionar Meta Ads');
    assert(res.reply.includes('Telefone') || res.reply.includes('E.164'), 'Deve instruir ou incluir coluna de telefone');
    assert(res.reply.includes('+5564998881122') || res.reply.includes('Produtor Teste') || res.reply.includes('Formatação'), 'Deve contextualizar os dados da propriedade');
  });

  // TESTE 5: Variáveis de ambiente OPENAI_API_KEY no .env e .env.example
  await test('5. Arquivos .env e .env.example contemplam a chave OPENAI_API_KEY', async () => {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf-8');
    const envExampleContent = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf-8');

    assert(envContent.includes('OPENAI_API_KEY='), '.env deve conter OPENAI_API_KEY');
    assert(envContent.includes('OPENAI_MODEL='), '.env deve conter OPENAI_MODEL');
    assert(envExampleContent.includes('OPENAI_API_KEY='), '.env.example deve conter OPENAI_API_KEY');
    assert(envExampleContent.includes('OPENAI_MODEL='), '.env.example deve conter OPENAI_MODEL');
  });

  // TESTE 6: Elementos de Interface no client/index.html (Ponto Único Flutuante)
  await test('6. client/index.html contém o drawer, launcher flutuante único e script do Copiloto (sem redundância de header)', async () => {
    const html = fs.readFileSync(path.join(__dirname, '../client/index.html'), 'utf-8');

    assert(html.includes('id="aiCopilotDrawer"'), 'index.html deve conter #aiCopilotDrawer');
    assert(html.includes('id="btnFloatingCopilot"'), 'index.html deve conter #btnFloatingCopilot');
    assert(!html.includes('id="btnOpenCopilotHeader"'), 'index.html não deve conter #btnOpenCopilotHeader (removido para acesso único)');
    assert(html.includes('id="copilotMessages"'), 'index.html deve conter #copilotMessages');
    assert(html.includes('id="copilotInput"'), 'index.html deve conter #copilotInput');
    assert(html.includes('id="btnCopilotSend"'), 'index.html deve conter #btnCopilotSend');
    assert(html.includes('src="/js/aiCopilot.js'), 'index.html deve carregar o script aiCopilot.js');
  });

  // TESTE 7: Estilização Executiva no client/css/styles.css
  await test('7. client/css/styles.css define a estética corporativa do Copiloto VERSUS (#0B1224 e acentos)', async () => {
    const css = fs.readFileSync(path.join(__dirname, '../client/css/styles.css'), 'utf-8');

    assert(css.includes('.ai-copilot-drawer'), 'styles.css deve conter .ai-copilot-drawer');
    assert(css.includes('.btn-floating-copilot'), 'styles.css deve conter .btn-floating-copilot');
    assert(css.includes('.btn-copilot-header'), 'styles.css deve conter .btn-copilot-header');
    assert(css.includes('.copilot-msg-user'), 'styles.css deve conter .copilot-msg-user');
    assert(css.includes('.copilot-msg-assistant'), 'styles.css deve conter .copilot-msg-assistant');
    assert(css.includes('#0B1224'), 'styles.css deve utilizar a paleta dark #0B1224');
  });

  // TESTE 8: Integridade do script client/js/aiCopilot.js
  await test('8. client/js/aiCopilot.js implementa gestão de estado, eventos e envio de contexto', async () => {
    const js = fs.readFileSync(path.join(__dirname, '../client/js/aiCopilot.js'), 'utf-8');

    assert(js.includes('AiCopilot'), 'aiCopilot.js deve definir objeto AiCopilot');
    assert(js.includes('/api/ai/chat'), 'aiCopilot.js deve chamar /api/ai/chat');
    assert(js.includes('gatherActiveContext'), 'aiCopilot.js deve coletar contexto ativo em memória');
    assert(js.includes('formatMarkdown'), 'aiCopilot.js deve formatar respostas em markdown');
    assert(js.includes('btnFloatingCopilot'), 'aiCopilot.js deve vincular o botão flutuante');
  });

  console.log('\n-------------------------------------------------------------');
  console.log(`📊 RESULTADO FINAL: ${passed}/${total} TESTES APROVADOS (${Math.round((passed / total) * 100)}%)`);
  console.log('-------------------------------------------------------------\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Erro fatal nos testes do Copiloto IA:', err);
  process.exit(1);
});
