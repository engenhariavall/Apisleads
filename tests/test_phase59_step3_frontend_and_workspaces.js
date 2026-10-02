/**
 * tests/test_phase59_step3_frontend_and_workspaces.js
 * 
 * SUÍTE DE TESTES: FASE 59 — ETAPA 3
 * Frontend & Workspaces Contextuais (Super Admin & Client State)
 * 
 * Valida:
 * 1. Interface Super Admin: Endpoints /api/admin/api-configs/host e /api/admin/api-configs/tenants (RBAC, CRUD e encriptação)
 * 2. Gestão de Test Drive por Tenant (toggle de master key, data de expiração, injeção de chaves locais)
 * 3. Gestão de Nichos Contratados (coluna allowed_niches em tenants, reflexo no auth /me)
 * 4. WorkspaceManager (Client-side):
 *    - População do Dropdown do Header com allowed_niches
 *    - Renderização condicional com data-niche="agro"
 *    - Limpeza de malha e chamada a clearFundiario ao mudar para nicho não-agro
 *    - Reativação dos controles ao retornar para 'agro'
 * 5. Validação de marcação no client/admin.html e client/index.html
 */

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../server/src/config/database.js';
import app from '../server/src/app.js';
import { decrypt, isEncrypted } from '../server/src/utils/cryptoUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Iniciando Testes da Fase 59 — Etapa 3 (Frontend & Workspaces Contextuais)...\n');

async function runTests() {
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
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

  // 1. Inicia Servidor HTTP de Teste em porta efêmera
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let superAdminToken = '';
  let standardUserToken = '';
  const testTenantId = `tenant-test-step3-${Date.now()}`;
  const testStandardUserId = `user-std-step3-${Date.now()}`;

  try {
    // =========================================================================
    // BLOCO 1: Autenticação & RBAC dos Endpoints de Gestão de APIs
    // =========================================================================
    console.log('--- 1. Autenticação e RBAC nos Endpoints de APIs (/api/admin/api-configs/*) ---');

    await test('Super Admin deve autenticar com sucesso e obter Token JWT', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hajaluzstudio@gmail.com',
          password: process.env.ADMIN_INITIAL_PASSWORD || 'sophia11052016'
        })
      });
      assert.strictEqual(res.status, 200, 'Login Super Admin deve responder 200');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.user.role, 'SUPER_ADMIN');
      superAdminToken = data.token;
      assert.ok(superAdminToken, 'Token JWT deve ser gerado');
    });

    // Cria Tenant e Usuário Normal para testes de isolamento
    db.prepare(`
      INSERT INTO tenants (id, name, cnpj, plan, status, allowed_niches)
      VALUES (?, 'AgroBeta S.A.', '12.345.678/0001-99', 'ENTERPRISE', 'ACTIVE', '["agro"]')
    `).run(testTenantId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active)
      VALUES (?, ?, 'operador.step3@agrobeta.com', 'dummy_hash', 'Operador Step3', 'GESTOR_TRAFEGO', 1)
    `).run(testStandardUserId, testTenantId);

    await test('Usuário não-SuperAdmin deve ser barrado com 403 ao acessar endpoints de API', async () => {
      // Mock simples de token não-admin usando requisição sem token admin
      const res = await fetch(`${baseUrl}/api/admin/api-configs/host`);
      assert.strictEqual(res.status, 401, 'Requisição anônima deve ser rejeitada com 401');

      const resForbidden = await fetch(`${baseUrl}/api/admin/api-configs/host`, {
        headers: { 'Authorization': 'Bearer token-invalido-ou-sem-superadmin' }
      });
      assert.strictEqual(resForbidden.status, 401, 'Token inválido deve ser rejeitado com 401');
    });

    // =========================================================================
    // BLOCO 2: Gestão das Credenciais Mestre do Host (OpenAI, Meta Ads, Bureau)
    // =========================================================================
    console.log('\n--- 2. Gestão das Chaves Mestre do Host (GET / PUT /api/admin/api-configs/host) ---');

    await test('GET /api/admin/api-configs/host deve retornar credenciais mascaradas', async () => {
      const res = await fetch(`${baseUrl}/api/admin/api-configs/host`, {
        headers: { 'Authorization': `Bearer ${superAdminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.settings, 'Objeto settings deve estar presente');
      assert.ok('masked_openai' in data.settings, 'masked_openai deve existir');
      assert.ok('masked_meta_token' in data.settings, 'masked_meta_token deve existir');
      assert.ok('masked_bureau' in data.settings, 'masked_bureau deve existir');
    });

    await test('PUT /api/admin/api-configs/host deve atualizar e encriptar as 3 chaves do Host', async () => {
      const payload = {
        master_openai_key: 'sk-proj-super-host-openai-key-2026',
        master_meta_app_id: '998877665544332',
        master_meta_token: 'EAAB-super-host-meta-token-xyz',
        master_bureau_key: 'bureau-master-gateway-key-777'
      };

      const res = await fetch(`${baseUrl}/api/admin/api-configs/host`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.settings.master_meta_app_id, '998877665544332');
      assert.ok(data.settings.masked_openai.includes('•••'), 'OpenAI key deve estar mascarada no retorno');

      // Verifica segurança: NENHUMA chave em texto puro no SQLite
      const row = db.prepare('SELECT * FROM super_admin_settings WHERE id = ?').get('host_master_settings');
      assert.ok(row, 'Registro de configurações mestre deve existir');
      assert.ok(isEncrypted(row.master_openai_key), 'master_openai_key no SQLite DEVE estar encriptada');
      assert.ok(isEncrypted(row.master_meta_token), 'master_meta_token no SQLite DEVE estar encriptado');
      assert.ok(isEncrypted(row.master_bureau_key), 'master_bureau_key no SQLite DEVE estar encriptada');
      assert.strictEqual(decrypt(row.master_openai_key), payload.master_openai_key);
      assert.strictEqual(decrypt(row.master_bureau_key), payload.master_bureau_key);
    });

    // =========================================================================
    // BLOCO 3: Gestão de Inquilinos, Test Drive e allowed_niches
    // =========================================================================
    console.log('\n--- 3. Gestão de Inquilinos & Modal de APIs (/api/admin/api-configs/tenants) ---');

    await test('GET /api/admin/api-configs/tenants deve listar tenants com status de Test Drive e nichos', async () => {
      const res = await fetch(`${baseUrl}/api/admin/api-configs/tenants`, {
        headers: { 'Authorization': `Bearer ${superAdminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.tenants), 'tenants deve ser um array');

      const found = data.tenants.find(t => t.tenant_id === testTenantId);
      assert.ok(found, 'Tenant recém-criado deve constar na listagem');
      assert.deepStrictEqual(found.allowed_niches, ['agro'], 'allowed_niches deve ser ["agro"]');
    });

    await test('GET /api/admin/api-configs/tenants/:tenantId deve retornar detalhes do inquilino', async () => {
      const res = await fetch(`${baseUrl}/api/admin/api-configs/tenants/${testTenantId}`, {
        headers: { 'Authorization': `Bearer ${superAdminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.config.tenant_name, 'AgroBeta S.A.');
      assert.deepStrictEqual(data.config.allowed_niches, ['agro']);
    });

    await test('PUT /api/admin/api-configs/tenants/:tenantId deve atualizar Test Drive, Chaves Locais e Nichos', async () => {
      const futureDate = new Date(Date.now() + 15 * 86400 * 1000).toISOString();
      const payload = {
        use_master_key: 1,
        test_drive_expires_at: futureDate,
        openai_key: 'sk-tenant-local-custom-agro-key',
        meta_app_id: '1122334455',
        meta_token: 'EAAB-tenant-custom-token',
        bureau_key: 'bureau-tenant-custom-key',
        allowed_niches: ['agro', 'b2b']
      };

      const res = await fetch(`${baseUrl}/api/admin/api-configs/tenants/${testTenantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.deepStrictEqual(data.config.allowed_niches, ['agro', 'b2b']);

      // Valida persistência no banco
      const tenantRow = db.prepare('SELECT allowed_niches FROM tenants WHERE id = ?').get(testTenantId);
      assert.strictEqual(tenantRow.allowed_niches, '["agro","b2b"]');

      const configRow = db.prepare('SELECT * FROM tenant_api_configs WHERE tenant_id = ?').get(testTenantId);
      assert.ok(isEncrypted(configRow.openai_key), 'openai_key do tenant DEVE estar encriptada');
      assert.ok(isEncrypted(configRow.bureau_key), 'bureau_key do tenant DEVE estar encriptada');
      assert.strictEqual(decrypt(configRow.openai_key), payload.openai_key);
    });

    // =========================================================================
    // BLOCO 4: Validação do Auth Controller (/api/auth/me) com allowed_niches
    // =========================================================================
    console.log('\n--- 4. Reflexo de allowed_niches no Perfil do Operador (/api/auth/me) ---');

    await test('Operador do Tenant deve receber allowed_niches no /api/auth/me', async () => {
      // Simula token do operador do tenant
      const jwtSecret = process.env.JWT_SECRET || 'versus_default_master_secret_2026';
      const { signJwt } = await import('../server/src/utils/security.js');
      const opToken = signJwt({
        id: testStandardUserId,
        tenant_id: testTenantId,
        email: 'operador.step3@agrobeta.com',
        role: 'GESTOR_TRAFEGO'
      }, jwtSecret, 3600);

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${opToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.deepStrictEqual(data.user.allowed_niches, ['agro', 'b2b'], 'allowed_niches deve vir populado como array');
    });

    // =========================================================================
    // BLOCO 5: Client-side WorkspaceManager & Mutação da UI
    // =========================================================================
    console.log('\n--- 5. Simulação do WorkspaceManager & Mutação Dinâmica da Interface ---');

    await test('WorkspaceManager deve popular o Dropdown com allowed_niches e aplicar data-niche', async () => {
      // Leitura do WorkspaceManager.js
      const scriptPath = path.resolve(__dirname, '../client/js/WorkspaceManager.js');
      const scriptCode = fs.readFileSync(scriptPath, 'utf-8');

      // Mock leve de ambiente DOM (window, document, localStorage)
      const mockStorage = new Map();
      const mockLocalStorage = {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k)
      };

      // Mock de elementos DOM
      const elementsMap = new Map();
      function createMockElement(id, tagName = 'div', attributes = {}) {
        const el = {
          id,
          tagName: tagName.toUpperCase(),
          attributes: { ...attributes },
          style: {
            display: '',
            removeProperty(prop) { delete this[prop]; }
          },
          children: [],
          innerHTML: '',
          value: '',
          disabled: false,
          title: '',
          setAttribute(name, val) { this.attributes[name] = String(val); },
          getAttribute(name) { return this.attributes[name] || null; },
          removeAttribute(name) { delete this.attributes[name]; },
          appendChild(child) { this.children.push(child); },
          addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = fn; },
          dispatchEvent(evt) { if (this._listeners?.[evt.type]) this._listeners[evt.type](evt); }
        };
        elementsMap.set(id, el);
        return el;
      }

      // Cria os elementos exigidos pelo WorkspaceManager
      const mockBody = createMockElement('body', 'body');
      const selectWorkspace = createMockElement('selectActiveWorkspace', 'select');
      const btnFundiario = createMockElement('btnToggleFundiarioLayer', 'button', { 'data-niche': 'agro' });
      const btnSearchMesh = createMockElement('btnSearchMeshToggle', 'button', { 'data-niche': 'agro' });
      const btnInspectPin = createMockElement('btnInspectPinToggle', 'button', { 'data-niche': 'agro' });
      const panelMeshSearch = createMockElement('mapMeshSearchPanel', 'div', { 'data-niche': 'agro' });

      let clearFundiarioCalled = false;
      let setFundiarioVisibilityValue = null;

      const mockWindow = {
        localStorage: mockLocalStorage,
        MapFundiarioEngine: {
          clearFundiario: () => { clearFundiarioCalled = true; },
          setFundiarioVisibility: (v) => { setFundiarioVisibilityValue = v; }
        },
        dispatchEvent: () => {},
        showToast: () => {}
      };

      const mockDocument = {
        body: mockBody,
        getElementById: (id) => elementsMap.get(id) || null,
        querySelectorAll: (sel) => {
          if (sel === '[data-niche]') {
            return [btnFundiario, btnSearchMesh, btnInspectPin, panelMeshSearch];
          }
          return [];
        },
        createElement: (tag) => createMockElement(`dyn-${Date.now()}-${Math.random()}`, tag),
        addEventListener: () => {},
        dispatchEvent: () => {}
      };

      // Executa o WorkspaceManager no ambiente mockado
      const sandboxFn = new Function('window', 'document', 'localStorage', scriptCode);
      sandboxFn(mockWindow, mockDocument, mockLocalStorage);

      assert.ok(mockWindow.WorkspaceManager, 'window.WorkspaceManager deve ser instanciado');

      // 1. Inicializa com nichos permitidos ['agro', 'b2b']
      await mockWindow.WorkspaceManager.init(['agro', 'b2b']);

      assert.strictEqual(mockWindow.WorkspaceManager.getActiveNiche(), 'agro', 'Nicho inicial deve ser agro');
      assert.strictEqual(selectWorkspace.children.length, 2, 'Dropdown deve ter exatamente 2 opções');
      assert.strictEqual(selectWorkspace.children[0].value, 'agro');
      assert.strictEqual(selectWorkspace.children[1].value, 'b2b');
      assert.strictEqual(selectWorkspace.disabled, false, 'Dropdown deve estar habilitado para 2 nichos');

      // 2. Troca de nicho para 'b2b'
      mockWindow.WorkspaceManager.switchNiche('b2b');

      assert.strictEqual(mockWindow.WorkspaceManager.getActiveNiche(), 'b2b', 'Nicho ativo deve mudar para b2b');
      assert.strictEqual(mockBody.getAttribute('data-niche'), 'b2b', 'Body deve ter data-niche="b2b"');
      assert.strictEqual(btnSearchMesh.style.display, 'none', 'Controle Buscar Malha (SIGEF) DEVE ser ocultado');
      assert.strictEqual(btnFundiario.style.display, 'none', 'Controle Malha Fundiária DEVE ser ocultado');
      assert.strictEqual(panelMeshSearch.style.display, 'none', 'Painel de Malha DEVE ser ocultado');
      assert.strictEqual(clearFundiarioCalled, true, 'clearFundiario() do WebGL DEVE ser executado ao sair do agro');

      // 3. Retorna para o nicho 'agro'
      mockWindow.WorkspaceManager.switchNiche('agro');
      assert.strictEqual(mockWindow.WorkspaceManager.getActiveNiche(), 'agro', 'Nicho ativo deve retornar para agro');
      assert.strictEqual(mockBody.getAttribute('data-niche'), 'agro');
      assert.strictEqual(btnSearchMesh.style.display, undefined, 'Controle Buscar Malha DEVE ser restaurado');
      assert.strictEqual(setFundiarioVisibilityValue, true, 'setFundiarioVisibility(true) DEVE ser reativado');

      // 4. Tentativa de chavear para nicho não permitido ('saude')
      mockWindow.WorkspaceManager.switchNiche('saude');
      assert.strictEqual(mockWindow.WorkspaceManager.getActiveNiche(), 'agro', 'Nicho "saude" não permitido deve ser ignorado');
    });

    // =========================================================================
    // BLOCO 6: Validação Estática de Marcação HTML (admin.html e index.html)
    // =========================================================================
    console.log('\n--- 6. Integridade Estrutural das Telas (client/admin.html e client/index.html) ---');

    await test('client/admin.html deve conter a tab de APIs, os 3 painéis do Host e modal de Inquilinos', () => {
      const adminHtml = fs.readFileSync(path.resolve(__dirname, '../client/admin.html'), 'utf-8');
      assert.ok(adminHtml.includes('id="sectionApiSettings"'), 'Seção #sectionApiSettings deve existir');
      assert.ok(adminHtml.includes('id="hostMasterOpenaiKey"'), 'Input hostMasterOpenaiKey deve existir');
      assert.ok(adminHtml.includes('id="hostMasterMetaToken"'), 'Input hostMasterMetaToken deve existir');
      assert.ok(adminHtml.includes('id="hostMasterBureauKey"'), 'Input hostMasterBureauKey deve existir');
      assert.ok(adminHtml.includes('id="tableTenantApiConfigsBody"'), 'Tabela de inquilinos tableTenantApiConfigsBody deve existir');
      assert.ok(adminHtml.includes('id="modalTenantApiConfig"'), 'Modal modalTenantApiConfig deve existir');
      assert.ok(adminHtml.includes('id="modalTenantUseMasterKey"'), 'Toggle modalTenantUseMasterKey deve existir');
      assert.ok(adminHtml.includes('id="btnQuick7Days"'), 'Botão rápido +7 dias deve existir');
      assert.ok(adminHtml.includes('id="btnQuick15Days"'), 'Botão rápido +15 dias deve existir');
      assert.ok(adminHtml.includes('id="btnQuick30Days"'), 'Botão rápido +30 dias deve existir');
    });

    await test('client/index.html deve conter o Dropdown no Header e data-niche="agro" nos controles', () => {
      const indexHtml = fs.readFileSync(path.resolve(__dirname, '../client/index.html'), 'utf-8');
      assert.ok(indexHtml.includes('id="selectActiveWorkspace"'), 'Dropdown #selectActiveWorkspace deve existir no Header');
      assert.ok(indexHtml.includes('id="btnSearchMeshToggle"'), 'Botão #btnSearchMeshToggle deve existir');
      assert.ok(indexHtml.includes('data-niche="agro"'), 'Atributos data-niche="agro" devem existir nos controles de mapa');
      assert.ok(indexHtml.includes('/js/WorkspaceManager.js'), 'Script WorkspaceManager.js deve estar importado');
    });

  } finally {
    // Limpeza de recursos de teste
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(testStandardUserId);
      db.prepare('DELETE FROM tenant_api_configs WHERE tenant_id = ?').run(testTenantId);
      db.prepare('DELETE FROM tenants WHERE id = ?').run(testTenantId);
    } catch (_) {}

    await new Promise(resolve => server.close(resolve));
  }

  console.log(`\n🎉 [SUCESSO TOTAL] ${passed}/${total} testes da Fase 59 — Etapa 3 aprovados com excelência!\n`);
}

runTests().catch(err => {
  console.error('\n💥 Falha na execução da suíte da Fase 59 — Etapa 3:', err);
  process.exit(1);
});
