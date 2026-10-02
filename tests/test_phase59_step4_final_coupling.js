/**
 * tests/test_phase59_step4_final_coupling.js
 * 
 * FASE 59 — ETAPA 4: ACOPLAMENTO FINAL DO MOTOR MULTI-TENANT & TEST DRIVE
 * 
 * Bateria de testes end-to-end e unitários validando:
 * 1. Acoplamento de Inteligência (OpenAI & Copiloto /ai/chat)
 *    - Consumo dinâmico de chaves via apiRouterService.
 *    - Bloqueio inviolável de Test Drive expirado com HTTP 403 e erro TEST_DRIVE_EXPIRED.
 *    - Resolução de chaves locais do Tenant quando use_master_key = false.
 * 2. Acoplamento de Tráfego (Meta Ads & POST /api/integrations/meta/sync)
 *    - Resolução de meta_token e meta_app_id dinâmicos no metaHasher.js e controller.
 *    - Bloqueio imediato da Graph API com HTTP 403 TEST_DRIVE_EXPIRED quando vencido.
 * 3. Acoplamento de Enriquecimento (Bureau de Dados / WhatsApp & POST /api/osint/enrich-whatsapp-bureau)
 *    - Resolução de bureau_key dinâmica via apiRouterService no bureauService.js.
 *    - Bloqueio temporal inviolável (HTTP 403) travando o gasto indevido do Host.
 *    - Verificação de /api/fundiario/enrich-osint e /api/bureau/lookup.
 * 4. Tratamento UX (Client-Side Interceptors)
 *    - Validação de handleTestDriveExpired e card bloqueador no app.js e aiCopilot.js.
 */

import assert from 'assert';
import http from 'http';
import app from '../server/src/app.js';
import db from '../server/src/config/database.js';
import { updateHostMasterSettings, saveTenantApiConfig } from '../server/src/services/apiConfigService.js';
import { resolveTenantCredentials, ApiRouterError } from '../server/src/services/apiRouterService.js';
import { aiCopilotService } from '../server/src/services/aiCopilotService.js';
import { resolveMetaCredentials } from '../server/src/services/metaHasher.js';
import { bureauService } from '../server/src/services/bureauService.js';
import fs from 'fs';
import path from 'path';

let passedTests = 0;
let totalTests = 0;

function pass(desc) {
  passedTests++;
  console.log(`  ✅ [PASS] ${desc}`);
}

function fail(desc, err) {
  console.error(`  ❌ [FAIL] ${desc}:`, err.message);
  process.exit(1);
}

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOpts = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function run() {
  console.log('🧪 Iniciando Testes da Fase 59 — Etapa 4 (Acoplamento Final Multi-Tenant & Test Drive)...\n');

  // Inicia servidor HTTP em porta aleatória
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // 0. Setup das Chaves Mestre Globais do Host
    await updateHostMasterSettings({
      master_openai_key: 'sk-master-openai-live-key-xyz',
      master_meta_app_id: 'act_999999999',
      master_meta_token: 'EAAB_master_meta_graph_token_live',
      master_bureau_key: 'bureau_master_auth_secret_token'
    });

    // Setup dos Tenants de Teste
    const tenantActive = 'tenant-test-active-e4';
    const tenantExpired = 'tenant-test-expired-e4';
    const tenantLocal = 'tenant-test-local-e4';
    const tenantMissing = 'tenant-test-missing-e4';

    // Garante registros base na tabela tenants
    const insertTenant = db.prepare(`
      INSERT INTO tenants (id, name, cnpj, plan, status)
      VALUES (?, ?, ?, 'ENTERPRISE', 'ACTIVE')
      ON CONFLICT(id) DO NOTHING
    `);
    insertTenant.run(tenantActive, 'Agro Test Drive Ativo', '11111111000101');
    insertTenant.run(tenantExpired, 'Agro Test Drive Expirado', '22222222000102');
    insertTenant.run(tenantLocal, 'Agro Produção Chave Própria', '33333333000103');
    insertTenant.run(tenantMissing, 'Agro Produção Sem Chave', '44444444000104');

    // Configura Tenant com Test Drive Ativo (expira em +7 dias)
    const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
    await saveTenantApiConfig(tenantActive, {
      use_master_key: true,
      test_drive_expires_at: futureDate,
      allowed_niches: ['agro', 'b2b']
    });

    // Configura Tenant com Test Drive EXPIRADO (expirou há 2 dias)
    const pastDate = new Date(Date.now() - 2 * 86400000).toISOString();
    await saveTenantApiConfig(tenantExpired, {
      use_master_key: true,
      test_drive_expires_at: pastDate,
      allowed_niches: ['agro']
    });

    // Configura Tenant com Chaves Locais Válidas (use_master_key = false)
    await saveTenantApiConfig(tenantLocal, {
      use_master_key: false,
      test_drive_expires_at: pastDate, // Mesmo expirado, não deve importar pois use_master_key é false
      openai_key: 'sk-tenant-local-custom-openai-key',
      meta_app_id: 'act_777777777',
      meta_token: 'EAAB_tenant_local_meta_token',
      bureau_key: 'bureau_tenant_local_auth_key',
      allowed_niches: ['agro']
    });

    // Configura Tenant sem chaves locais (use_master_key = false)
    await saveTenantApiConfig(tenantMissing, {
      use_master_key: false,
      test_drive_expires_at: pastDate,
      openai_key: null,
      meta_app_id: null,
      meta_token: null,
      bureau_key: null,
      allowed_niches: ['b2b']
    });

    // Injeta um imóvel rural de teste para cenários de WhatsApp/Bureau
    const ruralPropId = 'prop-rural-test-e4';
    db.prepare(`
      INSERT INTO propriedades_rurais (
        id, id_sigef, nome_imovel, nome_titular, cpf_cnpj_titular,
        municipio, uf, area_hectares, status_geo, geometria_poligono, tenant_id
      ) VALUES (?, 'SIGEF-E4-001', 'Fazenda Santa Cruz', 'Carlos Eduardo Silveira', '12345678909',
        'Sorriso', 'MT', 1250.0, 'TITULADA', '{"type":"Polygon","coordinates":[]}', ?)
      ON CONFLICT(id) DO UPDATE SET tenant_id = excluded.tenant_id
    `).run(ruralPropId, tenantExpired);

    // =========================================================================
    // 1. ACOPLAMENTO DE INTELIGÊNCIA (OPENAI & COPILOTO /api/ai/chat)
    // =========================================================================
    console.log('--- 1. Acoplamento de Inteligência (OpenAI & Copiloto /api/ai/chat) ---');
    totalTests++;
    try {
      // 1.1 Tenant com Test Drive Ativo deve resolver client sem disparar TEST_DRIVE_EXPIRED
      const client = await aiCopilotService.getOpenAIClient(tenantActive);
      assert.ok(client, 'Deve instanciar OpenAI Client para tenant ativo');
      pass('aiCopilotService.getOpenAIClient: instancia com sucesso client OpenAI para Test Drive ativo');
    } catch (e) {
      fail('aiCopilotService.getOpenAIClient com Test Drive ativo falhou', e);
    }

    totalTests++;
    try {
      // 1.2 Tenant com Test Drive Expirado DEVE lançar erro TEST_DRIVE_EXPIRED (HTTP 403)
      let threw = false;
      try {
        await aiCopilotService.getOpenAIClient(tenantExpired);
      } catch (err) {
        threw = true;
        assert.strictEqual(err.code, 'TEST_DRIVE_EXPIRED');
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.statusCode, 403);
        assert.ok(err.friendlyMessage.includes('Test Drive expirou'));
      }
      assert.ok(threw, 'Deveria ter lançado ApiRouterError(TEST_DRIVE_EXPIRED)');
      pass('aiCopilotService.getOpenAIClient: trava acesso da OpenAI e dispara TEST_DRIVE_EXPIRED (403)');
    } catch (e) {
      fail('aiCopilotService.getOpenAIClient com Test Drive expirado falhou', e);
    }

    totalTests++;
    try {
      // 1.3 processChat deve propagar o erro 403 sem cair no motor de fallback heurístico
      let chatThrew = false;
      try {
        await aiCopilotService.processChat({
          prompt: 'Filtrar imóveis de soja no MT',
          tenantId: tenantExpired
        });
      } catch (err) {
        chatThrew = true;
        assert.strictEqual(err.code, 'TEST_DRIVE_EXPIRED');
        assert.strictEqual(err.statusCode, 403);
      }
      assert.ok(chatThrew, 'processChat não pode mascarar expiração com fallback');
      pass('aiCopilotService.processChat: rejeita requisição imediatamente sem mascarar no fallback');
    } catch (e) {
      fail('aiCopilotService.processChat com Test Drive expirado falhou', e);
    }

    totalTests++;
    try {
      // 1.4 Chamada HTTP real no endpoint POST /api/ai/chat para Tenant Expirado
      const res = await makeRequest(server, {
        path: '/api/ai/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantExpired
        }
      }, {
        prompt: 'Exportar público para o Meta Ads'
      });

      assert.strictEqual(res.status, 403, `Esperava status 403, obteve ${res.status}`);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error, 'TEST_DRIVE_EXPIRED');
      assert.strictEqual(res.body.statusCode, 403);
      assert.ok(res.body.message.includes('Test Drive expirou'));
      pass('Endpoint POST /api/ai/chat: responde HTTP 403 estruturado com TEST_DRIVE_EXPIRED');
    } catch (e) {
      fail('Endpoint /api/ai/chat com tenant expirado falhou', e);
    }

    totalTests++;
    try {
      // 1.5 Tenant com chave própria local (use_master_key = false) resolve chave própria
      const localClient = await aiCopilotService.getOpenAIClient(tenantLocal);
      assert.ok(localClient, 'Deve instanciar OpenAI Client usando chave própria do tenant');
      pass('aiCopilotService: resolve chave própria local do tenant em modo de produção');
    } catch (e) {
      fail('aiCopilotService com chave própria local falhou', e);
    }

    // =========================================================================
    // 2. ACOPLAMENTO DE TRÁFEGO (META ADS & POST /api/integrations/meta/sync)
    // =========================================================================
    console.log('\n--- 2. Acoplamento de Tráfego (Meta Ads & POST /api/integrations/meta/sync) ---');
    totalTests++;
    try {
      // 2.1 metaHasher.js resolveMetaCredentials com Test Drive ativo
      const metaCreds = await resolveMetaCredentials(tenantActive);
      assert.strictEqual(metaCreds.meta_token, 'EAAB_master_meta_graph_token_live');
      assert.strictEqual(metaCreds.meta_app_id, 'act_999999999');
      assert.strictEqual(metaCreds.isMasterKey, true);
      assert.strictEqual(metaCreds.isTestDrive, true);
      pass('metaHasher.resolveMetaCredentials: obtém meta_token e meta_app_id dinâmicos do Host');
    } catch (e) {
      fail('metaHasher.resolveMetaCredentials com Test Drive ativo falhou', e);
    }

    totalTests++;
    try {
      // 2.2 metaHasher.js resolveMetaCredentials com Test Drive EXPIRADO
      let threwMeta = false;
      try {
        await resolveMetaCredentials(tenantExpired);
      } catch (err) {
        threwMeta = true;
        assert.strictEqual(err.code, 'TEST_DRIVE_EXPIRED');
        assert.strictEqual(err.statusCode, 403);
      }
      assert.ok(threwMeta, 'Deveria bloquear credenciais do Meta Ads se expirado');
      pass('metaHasher.resolveMetaCredentials: bloqueia geração de tokens Meta Ads se Test Drive expirado');
    } catch (e) {
      fail('metaHasher.resolveMetaCredentials com Test Drive expirado falhou', e);
    }

    totalTests++;
    try {
      // 2.3 POST /api/integrations/meta/sync para Tenant com Test Drive EXPIRADO
      const resMeta = await makeRequest(server, {
        path: '/api/integrations/meta/sync',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantExpired
        }
      }, {
        audience_name: 'Custom Audience Test Expired',
        tipo: 'agro',
        property_ids: [ruralPropId]
      });

      assert.strictEqual(resMeta.status, 403, `Esperava status 403, obteve ${resMeta.status}`);
      assert.strictEqual(resMeta.body.success, false);
      assert.strictEqual(resMeta.body.error, 'TEST_DRIVE_EXPIRED');
      assert.strictEqual(resMeta.body.statusCode, 403);
      assert.strictEqual(resMeta.body.service_type, 'meta');
      assert.ok(resMeta.body.message.includes('Test Drive expirou'));
      pass('Endpoint POST /api/integrations/meta/sync: bloqueia sincronização com HTTP 403');
    } catch (e) {
      fail('Endpoint /api/integrations/meta/sync com tenant expirado falhou', e);
    }

    totalTests++;
    try {
      // 2.4 POST /api/integrations/meta/sync para Tenant com Chave Própria Local
      const resMetaLocal = await makeRequest(server, {
        path: '/api/integrations/meta/sync',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantLocal
        }
      }, {
        audience_name: 'Custom Audience Tenant Local',
        tipo: 'agro',
        property_ids: [ruralPropId]
      });

      assert.strictEqual(resMetaLocal.status, 200);
      assert.strictEqual(resMetaLocal.body.success, true);
      assert.strictEqual(resMetaLocal.body.ad_account_id, 'act_777777777');
      pass('Endpoint POST /api/integrations/meta/sync: injeta credenciais próprias do Tenant');
    } catch (e) {
      fail('Endpoint /api/integrations/meta/sync com tenant local falhou', e);
    }

    // =========================================================================
    // 3. ACOPLAMENTO DE ENRIQUECIMENTO (BUREAU DE DADOS & WHATSAPP)
    // =========================================================================
    console.log('\n--- 3. Acoplamento de Enriquecimento (Bureau de Dados & WhatsApp) ---');
    totalTests++;
    try {
      // 3.1 bureauService.lookupWhatsAppByCpf com Test Drive Ativo
      // (Não tendo chave real em ambiente de teste ou sendo doc fictício, deve resolver credenciais e retornar NOT_FOUND sem 403)
      const resBureauActive = await bureauService.lookupWhatsAppByCpf('12345678909', {
        tenantId: tenantActive
      });
      assert.ok(resBureauActive, 'Deve responder objeto de consulta');
      assert.notStrictEqual(resBureauActive.status, 'TEST_DRIVE_EXPIRED');
      pass('bureauService: resolve credenciais Mestre do Host com sucesso no Test Drive ativo');
    } catch (e) {
      fail('bureauService com Test Drive ativo falhou', e);
    }

    totalTests++;
    try {
      // 3.2 bureauService.lookupWhatsAppByCpf com Test Drive EXPIRADO DEVE lançar TEST_DRIVE_EXPIRED
      let threwBureau = false;
      try {
        await bureauService.lookupWhatsAppByCpf('12345678909', {
          tenantId: tenantExpired
        });
      } catch (err) {
        threwBureau = true;
        assert.strictEqual(err.code, 'TEST_DRIVE_EXPIRED');
        assert.strictEqual(err.statusCode, 403);
      }
      assert.ok(threwBureau, 'bureauService deveria ter lançado TEST_DRIVE_EXPIRED');
      pass('bureauService: bloqueia consulta ao Bureau e dispara TEST_DRIVE_EXPIRED (403)');
    } catch (e) {
      fail('bureauService com Test Drive expirado falhou', e);
    }

    totalTests++;
    try {
      // 3.3 Endpoint POST /api/osint/enrich-whatsapp-bureau para Tenant EXPIRADO
      // Consulta com CPF não em cache para forçar a chamada ao Bureau
      const resEnrich = await makeRequest(server, {
        path: '/api/osint/enrich-whatsapp-bureau',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantExpired
        }
      }, {
        cpf: '98765432100',
        nome_titular: 'Produtor Sem Cache'
      });

      assert.strictEqual(resEnrich.status, 403, `Esperava status 403, obteve ${resEnrich.status}`);
      assert.strictEqual(resEnrich.body.success, false);
      assert.strictEqual(resEnrich.body.error, 'TEST_DRIVE_EXPIRED');
      assert.strictEqual(resEnrich.body.statusCode, 403);
      assert.ok(resEnrich.body.message.includes('Test Drive expirou'));
      pass('Endpoint POST /api/osint/enrich-whatsapp-bureau: bloqueia revelação com HTTP 403');
    } catch (e) {
      fail('Endpoint /api/osint/enrich-whatsapp-bureau com tenant expirado falhou', e);
    }

    totalTests++;
    try {
      // 3.4 Endpoint POST /api/fundiario/enrich-osint para Tenant EXPIRADO
      const resFundiario = await makeRequest(server, {
        path: '/api/fundiario/enrich-osint',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantExpired
        }
      }, {
        cpf_cnpj_titular: '99988877766',
        nome_titular: 'Fazendeiro Expirado MT'
      });

      assert.strictEqual(resFundiario.status, 403, `Esperava status 403, obteve ${resFundiario.status}`);
      assert.strictEqual(resFundiario.body.success, false);
      assert.strictEqual(resFundiario.body.error, 'TEST_DRIVE_EXPIRED');
      pass('Endpoint POST /api/fundiario/enrich-osint: bloqueia enriquecimento com HTTP 403');
    } catch (e) {
      fail('Endpoint /api/fundiario/enrich-osint com tenant expirado falhou', e);
    }

    totalTests++;
    try {
      // 3.5 Endpoint POST /api/bureau/lookup para Tenant EXPIRADO
      const resLookup = await makeRequest(server, {
        path: '/api/bureau/lookup',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantExpired
        }
      }, {
        doc: '12345678909'
      });

      assert.strictEqual(resLookup.status, 403, `Esperava status 403, obteve ${resLookup.status}`);
      assert.strictEqual(resLookup.body.success, false);
      assert.strictEqual(resLookup.body.error, 'TEST_DRIVE_EXPIRED');
      pass('Endpoint POST /api/bureau/lookup: bloqueia consulta com HTTP 403');
    } catch (e) {
      fail('Endpoint /api/bureau/lookup com tenant expirado falhou', e);
    }

    // =========================================================================
    // 4. TRATAMENTO UX (CLIENT-SIDE INTERCEPTORS)
    // =========================================================================
    console.log('\n--- 4. Tratamento UX (Client-Side Interceptors no app.js & aiCopilot.js) ---');
    totalTests++;
    try {
      const appJs = fs.readFileSync(path.resolve('client/js/app.js'), 'utf-8');
      assert.ok(appJs.includes('function handleTestDriveExpired('), 'app.js deve declarar handleTestDriveExpired');
      assert.ok(appJs.includes('window.handleTestDriveExpired = handleTestDriveExpired;'), 'Deve anexar handleTestDriveExpired ao window');
      assert.ok(appJs.includes('testDriveExpiredBlockerModal'), 'Deve renderizar card/modal bloqueador testDriveExpiredBlockerModal');
      assert.ok(appJs.includes('Contatar Suporte'), 'Modal bloqueador deve conter botão Contatar Suporte');
      pass('client/js/app.js: define handleTestDriveExpired e modal bloqueador com link para Suporte');
    } catch (e) {
      fail('Verificação de client/js/app.js falhou', e);
    }

    totalTests++;
    try {
      const appJs = fs.readFileSync(path.resolve('client/js/app.js'), 'utf-8');
      assert.ok(appJs.includes("result.error === 'TEST_DRIVE_EXPIRED'"), 'app.js deve interceptar TEST_DRIVE_EXPIRED em meta_sync');
      assert.ok(appJs.includes("data.error === 'TEST_DRIVE_EXPIRED'"), 'app.js deve interceptar TEST_DRIVE_EXPIRED em btnBureau');
      pass('client/js/app.js: intercepta TEST_DRIVE_EXPIRED (403) no Meta Ads e na revelação de WhatsApp do Bureau');
    } catch (e) {
      fail('Verificação de interceptações no app.js falhou', e);
    }

    totalTests++;
    try {
      const aiCopilotJs = fs.readFileSync(path.resolve('client/js/aiCopilot.js'), 'utf-8');
      assert.ok(aiCopilotJs.includes("res.status === 403 || data.error === 'TEST_DRIVE_EXPIRED'"), 'aiCopilot.js deve interceptar 403/TEST_DRIVE_EXPIRED no handleSend');
      assert.ok(aiCopilotJs.includes('window.handleTestDriveExpired'), 'aiCopilot.js deve acionar handleTestDriveExpired');
      assert.ok(aiCopilotJs.includes('Test Drive Expirado'), 'aiCopilot.js deve renderizar Action Card de Test Drive Expirado');
      pass('client/js/aiCopilot.js: intercepta 403 TEST_DRIVE_EXPIRED no chat e no despacho autônomo do Meta Ads');
    } catch (e) {
      fail('Verificação de client/js/aiCopilot.js falhou', e);
    }

    console.log(`\n🎉 [SUCESSO TOTAL] ${passedTests}/${totalTests} testes da Fase 59 — Etapa 4 aprovados com 100% de sucesso!\n`);
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('💥 Erro fatal nos testes da Fase 59 — Etapa 4:', err);
  process.exit(1);
});
