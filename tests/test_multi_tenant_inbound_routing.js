/**
 * test_multi_tenant_inbound_routing.js
 * 
 * Bateria de Testes Automatizados para a Fase 35 - Etapa 3:
 * Motor de Roteamento Inbound Multi-Tenant (WhatsApp Inbound & Configurações Globais)
 */

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import db, { sqliteDb } from '../server/src/config/database.js';

const BASE_URL = 'http://localhost:3000';

function getHtml(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${urlPath}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('\n--- Iniciando Testes do Motor de Roteamento Inbound Multi-Tenant (Fase 35 - Etapa 3) ---');

  // 1. Verificação de Colunas Multi-Tenant no Banco SQLite
  console.log('[1/6] Verificando existência de colunas whatsapp_inbound e settings_json na tabela tenants...');
  const tableInfo = db.prepare("PRAGMA table_info(tenants)").all();
  const columnNames = tableInfo.map(c => c.name);
  assert(columnNames.includes('whatsapp_inbound'), 'Coluna whatsapp_inbound deve existir na tabela tenants');
  assert(columnNames.includes('settings_json'), 'Coluna settings_json deve existir na tabela tenants');
  console.log('✔ Colunas de governança multi-tenant verificadas na tabela tenants.');

  // 2. Autenticação Super Admin
  console.log('[2/6] Autenticando Super Admin...');
  const resLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@versus.ai', password: 'VersusAdmin@2026!' })
  });
  const dataLogin = await resLogin.json();
  assert(resLogin.ok && dataLogin.token, 'Super admin deve autenticar');
  const token = dataLogin.token;
  const rootTenantId = dataLogin.user.tenant_id;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  console.log(`✔ Super Admin autenticado no tenant ${rootTenantId}.`);

  // 3. Teste de API: GET e PUT /api/tenant/settings
  console.log('[3/6] Testando API de Configurações do Tenant (GET/PUT /api/tenant/settings)...');
  const testPhoneRoot = '(11) 98765-4321';
  const expectedSanitizedRoot = '5511987654321';

  const resPutSettings = await fetch(`${BASE_URL}/api/tenant/settings`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      whatsapp_inbound: testPhoneRoot,
      settings_json: { report_base_url: 'https://app.versus.ai' }
    })
  });
  assert.strictEqual(resPutSettings.status, 200, 'PUT /api/tenant/settings deve retornar 200');
  const putData = await resPutSettings.json();
  assert(putData.success, 'Resposta de atualização de settings deve ser success: true');
  assert.strictEqual(putData.tenant.whatsapp_inbound, expectedSanitizedRoot, 'Número deve ser sanitizado com prefixo 55');

  // Buscar via GET
  const resGetSettings = await fetch(`${BASE_URL}/api/tenant/settings`, { headers: authHeaders });
  assert.strictEqual(resGetSettings.status, 200, 'GET /api/tenant/settings deve retornar 200');
  const getData = await resGetSettings.json();
  assert.strictEqual(getData.tenant.whatsapp_inbound, expectedSanitizedRoot, 'Número retornado deve coincidir');
  console.log(`✔ Configuração salva e sanitizada com sucesso: ${getData.tenant.whatsapp_inbound}`);

  // 4. Criação e Configuração de Segundo Tenant (Isolamento Multi-Tenant)
  console.log('[4/6] Testando Isolamento Multi-Tenant com segundo tenant...');
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const tenantBetaId = `tenant-beta-${randSuffix}`;
  const phoneBeta = '5521999998888';

  // Inserir tenant secundário diretamente para teste de roteamento
  db.prepare(`
    INSERT INTO tenants (id, name, cnpj, status, plan, whatsapp_inbound)
    VALUES (?, ?, ?, 'ACTIVE', 'ENTERPRISE', ?)
  `).run(tenantBetaId, `Beta Tech Solucoes ${randSuffix}`, `33.444.${randSuffix}/0001-99`, phoneBeta);

  const tenantBeta = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantBetaId);
  assert.strictEqual(tenantBeta.whatsapp_inbound, phoneBeta, 'Tenant Beta deve ter seu próprio WhatsApp inbound');
  console.log(`✔ Tenant secundário ${tenantBetaId} criado com WhatsApp isolado: ${phoneBeta}`);

  // 5. Teste de Roteamento Dinâmico no Relatório Público (/report/:cnpj)
  console.log('[5/6] Testando rota pública /report/:cnpj com roteamento dinâmico de Tenant...');
  
  // 5a. Sem parâmetro ?t= -> deve rotear para o tenant padrão do lead ou tenant root
  const resReportRoot = await getHtml('/report/18737953000100');
  assert.strictEqual(resReportRoot.statusCode, 200, 'Rota sem ?t deve responder 200');
  assert(resReportRoot.body.includes(`https://wa.me/${expectedSanitizedRoot}`), 'Deve conter link wa.me com número do tenant root');
  console.log(`✔ Roteamento padrão gerou wa.me/${expectedSanitizedRoot}`);

  // 5b. Com parâmetro ?t={tenantBetaId} -> deve rotear para o WhatsApp do Tenant Beta
  const resReportBeta = await getHtml(`/report/18737953000100?t=${tenantBetaId}`);
  assert.strictEqual(resReportBeta.statusCode, 200, 'Rota com ?t deve responder 200');
  assert(resReportBeta.body.includes(`https://wa.me/${phoneBeta}`), 'Deve conter link wa.me com número do Tenant Beta');
  assert(!resReportBeta.body.includes(`https://wa.me/${expectedSanitizedRoot}`), 'Não deve misturar o número do tenant root');
  console.log(`✔ Roteamento dinâmico via ?t=${tenantBetaId} gerou wa.me/${phoneBeta}`);

  // 6. Verificação dos Elementos Visuais no Frontend (Client)
  console.log('[6/6] Verificando componentes UI de Configurações Globais no frontend...');
  const htmlIndex = fs.readFileSync(path.resolve('client/index.html'), 'utf-8');
  assert(htmlIndex.includes('id="modalGlobalSettings"'), 'client/index.html deve conter o modal #modalGlobalSettings');
  assert(htmlIndex.includes('id="btnOpenGlobalSettings"'), 'client/index.html deve conter o botão #btnOpenGlobalSettings');
  assert(htmlIndex.includes('id="inputTenantWhatsappInbound"'), 'client/index.html deve conter o input #inputTenantWhatsappInbound');
  assert(htmlIndex.includes('id="inputTenantReportBaseUrl"'), 'client/index.html deve conter o input #inputTenantReportBaseUrl');

  const jsApp = fs.readFileSync(path.resolve('client/js/app.js'), 'utf-8');
  assert(jsApp.includes('openGlobalSettingsModal'), 'client/js/app.js deve conter a função openGlobalSettingsModal');
  assert(jsApp.includes('saveGlobalSettings'), 'client/js/app.js deve conter a função saveGlobalSettings');
  assert(jsApp.includes('?t=') || jsApp.includes('tenantParam'), 'generateCustomSocioScript deve incluir parâmetro de tenant na URL');
  console.log('✔ Componentes UI e funções client-side verificados com sucesso.');

  console.log('\n🏆 ETAPA 3 (MULTI-TENANT INBOUND ROUTING) DA FASE 35 VALIDADA COM 100% DE SUCESSO!\n');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes da Etapa 3:', err);
  process.exit(1);
});
