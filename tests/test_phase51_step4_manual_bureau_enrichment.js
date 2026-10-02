/**
 * test_phase51_step4_manual_bureau_enrichment.js
 * FASE 51 — ETAPA 4: COST CONTROL E BOTÃO MANUAL DE ENRIQUECIMENTO (BUREAU)
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
  console.log('\n=============================================================');
  console.log('🧪 TESTES: FASE 51 - ETAPA 4 (COST CONTROL & BOTÃO SOB DEMANDA)');
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

  const db = (await import('../server/src/config/database.js')).default;
  const { bureauService } = await import('../server/src/services/bureauService.js');

  // TESTE 1: Validação de ausência de CPF na rota POST /api/osint/enrich-whatsapp-bureau
  await test('1. Rota POST /api/osint/enrich-whatsapp-bureau rejeita requisição sem CPF', async () => {
    // Simula chamada de rota
    const req = { body: {} };
    let statusCode = 200;
    let jsonResult = null;
    const res = {
      status(c) { statusCode = c; return this; },
      json(data) { jsonResult = data; return data; }
    };

    // Obter handler ou invocar lógica de rota
    const routerModule = await import('../server/src/routes/api.js');
    const router = routerModule.default;
    
    // Procura a rota registrada no router stack
    const routeLayer = router.stack.find(layer => layer.route && layer.route.path === '/osint/enrich-whatsapp-bureau');
    assert(routeLayer, 'Rota /osint/enrich-whatsapp-bureau deve estar registrada no router');

    // Executa o handler da rota (último do array de handles)
    const handlers = routeLayer.route.stack.map(s => s.handle);
    const mainHandler = handlers[handlers.length - 1];
    
    await mainHandler(req, res);
    assert.strictEqual(statusCode, 400, 'Deve retornar HTTP 400 quando CPF não for informado');
    assert.strictEqual(jsonResult.success, false);
  });

  // TESTE 2: Comportamento sem chave no .env retorna estritamente whatsapp: null (sem inventar número)
  await test('2. Chamada sob demanda sem chave no .env não inventa números e retorna whatsapp: null', async () => {
    const origKey = process.env.BUREAU_API_KEY;
    delete process.env.BUREAU_API_KEY;

    let statusCode = 200;
    let jsonResult = null;
    const req = { body: { cpf: '52949811069', nome_titular: 'João da Silva Teste' } };
    const res = {
      status(c) { statusCode = c; return this; },
      json(data) { jsonResult = data; return data; }
    };

    const routerModule = await import('../server/src/routes/api.js');
    const routeLayer = routerModule.default.stack.find(layer => layer.route && layer.route.path === '/osint/enrich-whatsapp-bureau');
    const handlers = routeLayer.route.stack.map(s => s.handle);
    const mainHandler = handlers[handlers.length - 1];

    await mainHandler(req, res);

    if (origKey) process.env.BUREAU_API_KEY = origKey;

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonResult.whatsapp, null, 'Sem chave, o WhatsApp deve ser estritamente null');
    assert.strictEqual(jsonResult.success, false);
  });

  // TESTE 3: Enriquecimento com sucesso persiste no SQLite local e formata E.164
  await test('3. Sucesso na consulta ao Bureau persiste no SQLite local em E.164', async () => {
    const testId = 'PROP-TEST-BUREAU-001';
    const testCpf = '81234567890';
    
    // Insere propriedade rural de teste
    db.prepare(`
      INSERT OR REPLACE INTO propriedades_rurais (
        id, id_sigef, nome_imovel, municipio, uf, geometria_poligono, 
        nome_titular, cpf_cnpj_titular, whatsapp_validado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(testId, 'SIGEF-TEST-BUREAU-001', 'Fazenda Teste Bureau', 'Sorriso', 'MT', '{"type":"Point","coordinates":[-55.5,-12.5]}', 'Carlos Mendes', testCpf);

    // Mock temporário da função lookupWhatsAppByCpf
    const origLookup = bureauService.lookupWhatsAppByCpf;
    bureauService.lookupWhatsAppByCpf = async (doc, opts) => {
      return {
        success: true,
        whatsapp: '+5566998881234',
        status: 'ENRICHED',
        message: 'Contato localizado via Mock de Teste Bureau'
      };
    };

    let statusCode = 200;
    let jsonResult = null;
    const req = { body: { cpf: testCpf, id_propriedade: testId } };
    const res = {
      status(c) { statusCode = c; return this; },
      json(data) { jsonResult = data; return data; }
    };

    const routerModule = await import('../server/src/routes/api.js');
    const routeLayer = routerModule.default.stack.find(layer => layer.route && layer.route.path === '/osint/enrich-whatsapp-bureau');
    const handlers = routeLayer.route.stack.map(s => s.handle);
    const mainHandler = handlers[handlers.length - 1];

    await mainHandler(req, res);

    // Restaura mock
    bureauService.lookupWhatsAppByCpf = origLookup;

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonResult.success, true);
    assert.strictEqual(jsonResult.whatsapp, '+5566998881234');
    assert.strictEqual(jsonResult.cached, false);

    // Verifica persistência no SQLite
    const row = db.prepare('SELECT whatsapp_validado, osint_status FROM propriedades_rurais WHERE id = ?').get(testId);
    assert.strictEqual(row.whatsapp_validado, '+5566998881234', 'Deve ter persistido o WhatsApp no SQLite');
    assert.strictEqual(row.osint_status, 'ENRICHED');
  });

  // TESTE 4: Trava de Segurança Financeira (Cost Control) - Segunda consulta usa cache do SQLite
  await test('4. Trava Financeira: Segunda consulta ao mesmo CPF utiliza cache local (cached: true)', async () => {
    const testId = 'PROP-TEST-BUREAU-001';
    const testCpf = '81234567890';

    let bureauCalled = false;
    const origLookup = bureauService.lookupWhatsAppByCpf;
    bureauService.lookupWhatsAppByCpf = async () => {
      bureauCalled = true;
      return { success: true, whatsapp: '+5566998889999' };
    };

    let statusCode = 200;
    let jsonResult = null;
    const req = { body: { cpf: testCpf, id_propriedade: testId } };
    const res = {
      status(c) { statusCode = c; return this; },
      json(data) { jsonResult = data; return data; }
    };

    const routerModule = await import('../server/src/routes/api.js');
    const routeLayer = routerModule.default.stack.find(layer => layer.route && layer.route.path === '/osint/enrich-whatsapp-bureau');
    const handlers = routeLayer.route.stack.map(s => s.handle);
    const mainHandler = handlers[handlers.length - 1];

    await mainHandler(req, res);

    bureauService.lookupWhatsAppByCpf = origLookup;

    // Limpa registro de teste do SQLite
    db.prepare('DELETE FROM propriedades_rurais WHERE id = ?').run(testId);

    assert.strictEqual(bureauCalled, false, 'O Bureau NÃO deve ser cobrado/chamado novamente');
    assert.strictEqual(jsonResult.cached, true, 'Deve indicar resposta via cache local');
    assert.strictEqual(jsonResult.whatsapp, '+5566998881234');
  });

  // TESTE 5: Presença do botão no client/index.html
  await test('5. client/index.html possui o botão #btnRevealBureauWhatsApp com classe .btn-reveal-bureau', async () => {
    const html = fs.readFileSync(path.join(__dirname, '../client/index.html'), 'utf-8');
    assert(html.includes('id="btnRevealBureauWhatsApp"'), 'index.html deve conter id="btnRevealBureauWhatsApp"');
    assert(html.includes('btn-reveal-bureau'), 'index.html deve conter classe btn-reveal-bureau');
    assert(html.includes('Revelar WhatsApp'), 'Texto do botão deve conter "Revelar WhatsApp"');
  });

  // TESTE 6: Estilos do botão em client/css/styles.css
  await test('6. client/css/styles.css estiliza .btn-reveal-bureau com estados hover e disabled', async () => {
    const css = fs.readFileSync(path.join(__dirname, '../client/css/styles.css'), 'utf-8');
    assert(css.includes('.btn-reveal-bureau'), 'styles.css deve conter .btn-reveal-bureau');
    assert(css.includes('.btn-reveal-bureau:hover'), 'styles.css deve conter hover de .btn-reveal-bureau');
    assert(css.includes('.btn-reveal-bureau:disabled'), 'styles.css deve conter disabled de .btn-reveal-bureau');
  });

  // TESTE 7: Lógica no frontend (app.js) detecta CPF, aciona rota síncrona e altera texto para "Consultando Bureau..."
  await test('7. client/js/app.js conecta #btnRevealBureauWhatsApp à rota /api/osint/enrich-whatsapp-bureau', async () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../client/js/app.js'), 'utf-8');
    assert(appJs.includes('btnRevealBureauWhatsApp'), 'app.js deve referenciar btnRevealBureauWhatsApp');
    assert(appJs.includes('/api/osint/enrich-whatsapp-bureau'), 'app.js deve chamar rota /api/osint/enrich-whatsapp-bureau');
    assert(appJs.includes('Consultando Bureau...'), 'app.js deve exibir "Consultando Bureau..." durante a requisição');
    assert(appJs.includes('isCpf'), 'app.js deve verificar se titular é Pessoa Física (CPF)');
  });

  console.log('\n-------------------------------------------------------------');
  console.log(`📊 RESULTADO FINAL: ${passed}/${total} TESTES APROVADOS (${Math.round((passed / total) * 100)}%)`);
  console.log('-------------------------------------------------------------\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Erro fatal na execução dos testes:', err);
  process.exit(1);
});
