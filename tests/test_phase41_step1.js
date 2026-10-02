/**
 * Suíte de Testes - Fase 41 (Etapa 1):
 * Correção de Roles e Fluxo de Cadastro (Raio-X)
 */
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
let superAdminToken = null;

async function runTests() {
  console.log('🚀 Iniciando Validação da Fase 41 - Etapa 1...');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Login como Super Admin Master
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hajaluzstudio@gmail.com',
        password: process.env.ADMIN_INITIAL_PASSWORD || 'sophia11052016'
      })
    });
    const loginData = await loginRes.json();
    assert(loginRes.ok && loginData.success, 'Login do Super Admin Master realizado com sucesso');
    superAdminToken = loginData.token;
  } catch (e) {
    assert(false, `Falha no login do Super Admin: ${e.message}`);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${superAdminToken}`
  };

  // 2. Cria um Tenant de teste dedicado para clientes
  let testTenantId = null;
  try {
    const createTenantRes = await fetch(`${BASE_URL}/api/admin/tenants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `Empresa Teste RBAC FASE 41 - ${Date.now()}`,
        plan: 'ENTERPRISE',
        max_users: 50
      })
    });
    const tData = await createTenantRes.json();
    testTenantId = tData.tenant?.id || tData.data?.id;
    assert(!!testTenantId, `Tenant de teste para clientes criado: ${testTenantId}`);
  } catch (e) {
    assert(false, `Falha ao obter tenant de teste: ${e.message}`);
  }

  // 3. Teste de Bloqueio RBAC: Criar usuário SUPER_ADMIN em Tenant de cliente DEVE FALHAR (400)
  try {
    const leakAttemptRes = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tenant_id: testTenantId,
        name: 'Tentativa Invasiva Super Admin',
        email: `hacker.test.${Date.now()}@cliente.com`,
        password: 'Password@123',
        role: 'SUPER_ADMIN'
      })
    });
    const leakData = await leakAttemptRes.json();
    assert(
      leakAttemptRes.status === 400 && leakData.error === 'FORBIDDEN_ROLE_FOR_TENANT',
      `Bloqueio de privilégio: SUPER_ADMIN rejeitado para clientes com 400 (${leakData.error})`
    );
  } catch (e) {
    assert(false, `Falha no teste de bloqueio de SUPER_ADMIN: ${e.message}`);
  }

  // 4. Teste de Bloqueio RBAC: Criar usuário SUPORTE_INTERNO em Tenant de cliente DEVE FALHAR (400)
  try {
    const leakAttempt2Res = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tenant_id: testTenantId,
        name: 'Tentativa Suporte Interno',
        email: `suporte.test.${Date.now()}@cliente.com`,
        password: 'Password@123',
        role: 'SUPORTE_INTERNO'
      })
    });
    const leakData2 = await leakAttempt2Res.json();
    assert(
      leakAttempt2Res.status === 400 && leakData2.error === 'FORBIDDEN_ROLE_FOR_TENANT',
      `Bloqueio de privilégio: SUPORTE_INTERNO rejeitado para clientes com 400 (${leakData2.error})`
    );
  } catch (e) {
    assert(false, `Falha no teste de bloqueio de SUPORTE_INTERNO: ${e.message}`);
  }

  // 5. Teste de Criação com os 4 papéis estritos autorizados para Tenants
  const allowedRoles = [
    'Admin',
    'Gestor de Tráfego',
    'Analista de Marketing',
    'Coordenador de Marketing'
  ];

  for (const targetRole of allowedRoles) {
    try {
      const email = `op.${targetRole.toLowerCase().replace(/[^a-z]/g, '')}.${Date.now()}@empresa.com`;
      const createRes = await fetch(`${BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          tenant_id: testTenantId,
          name: `Operador ${targetRole}`,
          email,
          password: 'Password@123',
          role: targetRole,
          dailyQuota: 600
        })
      });
      const data = await createRes.json();
      assert(
        createRes.ok && data.success && data.user.role === targetRole && data.user.tenant_id === testTenantId,
        `Criação autorizada de operador de cliente com role: "${targetRole}" vinculada ao Tenant`
      );
    } catch (e) {
      assert(false, `Falha ao cadastrar usuário com role ${targetRole}: ${e.message}`);
    }
  }

  // 6. Auditoria Estática do client/admin.html
  try {
    const htmlContent = fs.readFileSync(path.resolve('client/admin.html'), 'utf-8');
    
    // Removido da barra superior global de Super Admin
    const hasTopGlobalBtn = htmlContent.includes('id="btnOpenNewUserModal"');
    assert(!hasTopGlobalBtn, 'Botão #btnOpenNewUserModal removido da barra superior global');

    // Movido para dentro do modal Raio-X
    const hasXrayNewUserBtn = htmlContent.includes('id="btnOpenXrayNewUserModal"');
    assert(hasXrayNewUserBtn, 'Botão #btnOpenXrayNewUserModal presente na aba de Dados Cadastrais do Raio-X');

    // Remoção do select de empresas
    const hasSelectTenant = htmlContent.includes('id="selectNewUserTenant"');
    assert(!hasSelectTenant, 'Campo de seleção de empresa <select id="selectNewUserTenant"> removido do modal');

    // Adição do input hidden para travar o tenant_id
    const hasHiddenTenant = htmlContent.includes('id="inputNewUserTenantId"');
    assert(hasHiddenTenant, 'Campo invisível <input type="hidden" id="inputNewUserTenantId"> presente no formulário');

    // Checagem das opções estritas do select de Role
    const hasAdminOption = htmlContent.includes('<option value="Admin">Admin</option>');
    const hasGestorOption = htmlContent.includes('<option value="Gestor de Tráfego" selected>Gestor de Tráfego</option>');
    const hasAnalistaOption = htmlContent.includes('<option value="Analista de Marketing">Analista de Marketing</option>');
    const hasCoordOption = htmlContent.includes('<option value="Coordenador de Marketing">Coordenador de Marketing</option>');
    const hasSuperAdminOption = htmlContent.includes('<option value="SUPER_ADMIN">');

    assert(hasAdminOption, 'Opção "Admin" presente no select');
    assert(hasGestorOption, 'Opção "Gestor de Tráfego" presente no select');
    assert(hasAnalistaOption, 'Opção "Analista de Marketing" presente no select');
    assert(hasCoordOption, 'Opção "Coordenador de Marketing" presente no select');
    assert(!hasSuperAdminOption, 'Opção "SUPER_ADMIN" completamente removida do select de cadastro');
  } catch (e) {
    assert(false, `Erro na auditoria do admin.html: ${e.message}`);
  }

  // 7. Auditoria do client/js/admin.js
  try {
    const jsContent = fs.readFileSync(path.resolve('client/js/admin.js'), 'utf-8');
    
    const hasXrayClick = jsContent.includes('btnOpenXrayNewUserModal?.addEventListener');
    const hasOpenTenantFunc = jsContent.includes('openNewUserModalForTenant');
    const hasHiddenTenantRef = jsContent.includes("document.getElementById('inputNewUserTenantId')");
    const hasRoleBadgeInfo = jsContent.includes('function getRoleBadgeInfo');

    assert(hasXrayClick, 'Evento de clique no botão do Raio-X devidamente registrado');
    assert(hasOpenTenantFunc, 'Função openNewUserModalForTenant implementada');
    assert(hasHiddenTenantRef, 'Captura do tenant_id pelo input oculto implementada no submit');
    assert(hasRoleBadgeInfo, 'Motor de mapeamento de badges de role integrado');
  } catch (e) {
    assert(false, `Erro na auditoria do admin.js: ${e.message}`);
  }

  console.log(`\n🏁 Resultado: ${passed} passaram, ${failed} falharam.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal no teste:', err);
  process.exit(1);
});
