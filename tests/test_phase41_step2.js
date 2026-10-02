/**
 * Suíte de Testes - Fase 41 (Etapa 2):
 * Refatoração do Módulo Global (Equipe Interna)
 */
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
let superAdminToken = null;

async function runTests() {
  console.log('🚀 Iniciando Validação da Fase 41 - Etapa 2 (Equipe Interna)...');
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

  // 1. Autenticação Super Admin Master
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
    assert(loginRes.ok && loginData.success, 'Super Admin Master autenticado com sucesso');
    superAdminToken = loginData.token;
  } catch (e) {
    assert(false, `Falha no login do Super Admin: ${e.message}`);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${superAdminToken}`
  };

  // 2. Validação da consulta da API global GET /api/admin/users
  // Deve retornar EXCLUSIVAMENTE operadores internos (Tenant Raiz: tenant-root-default)
  let internalUsers = [];
  try {
    const res = await fetch(`${BASE_URL}/api/admin/users`, { headers: authHeaders });
    const data = await res.json();
    assert(res.ok && data.success, 'Endpoint GET /api/admin/users respondeu com sucesso 200');
    internalUsers = data.users || [];

    const nonRootUsers = internalUsers.filter(u => {
      const tid = String(u.tenant_id || '').trim();
      return tid !== '' && tid !== 'null' && tid !== 'tenant-root-default';
    });

    assert(
      nonRootUsers.length === 0,
      `Segregação da Equipe Interna: 0 usuários de clientes vazando na consulta global (${nonRootUsers.length} encontrados)`
    );
    assert(
      internalUsers.length > 0,
      `Usuários do Tenant Raiz encontrados na equipe interna: ${internalUsers.length}`
    );
  } catch (e) {
    assert(false, `Erro ao validar consulta da equipe interna: ${e.message}`);
  }

  // 3. Validação da consulta isolada de Tenants por query param (?tenant_id=...)
  try {
    // Busca um tenant cliente
    const tenantsRes = await fetch(`${BASE_URL}/api/admin/tenants`, { headers: authHeaders });
    const tenantsData = await tenantsRes.json();
    const clientTenant = (tenantsData.tenants || []).find(t => t.id !== 'tenant-root-default');

    if (clientTenant) {
      const clientUsersRes = await fetch(`${BASE_URL}/api/admin/users?tenant_id=${clientTenant.id}`, { headers: authHeaders });
      const clientUsersData = await clientUsersRes.json();
      assert(clientUsersRes.ok, `Consulta isolada do tenant ${clientTenant.id} executada com sucesso`);
      const wrongTenants = (clientUsersData.users || []).filter(u => u.tenant_id !== clientTenant.id);
      assert(wrongTenants.length === 0, `Nenhum usuário de outro tenant vazou na query do tenant ${clientTenant.id}`);
    } else {
      console.log('  ⚠️ Nenhum tenant cliente existente para teste comparativo (ignorado).');
    }
  } catch (e) {
    assert(false, `Erro na consulta filtrada por tenant: ${e.message}`);
  }

  // 4. Cadastro de Operadores Internos: SUPER_ADMIN e SUPORTE_INTERNO
  const ts = Date.now();
  const superAdminEmail = `master.dev.${ts}@versus.com.br`;
  const suporteEmail = `suporte.dev.${ts}@versus.com.br`;

  // 4.1 Cadastro de novo SUPER_ADMIN interno
  try {
    const resCreateSuper = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tenant_id: 'tenant-root-default',
        name: 'Operador Dev Super Admin',
        email: superAdminEmail,
        password: 'Password@123',
        role: 'SUPER_ADMIN',
        dailyQuota: 99999
      })
    });
    const dataCreateSuper = await resCreateSuper.json();
    assert(
      resCreateSuper.status === 201 && dataCreateSuper.success && dataCreateSuper.user.role === 'SUPER_ADMIN',
      'Cadastro de novo SUPER_ADMIN interno no Tenant Raiz concluído com sucesso'
    );
  } catch (e) {
    assert(false, `Erro ao criar SUPER_ADMIN interno: ${e.message}`);
  }

  // 4.2 Cadastro de novo SUPORTE_INTERNO
  try {
    const resCreateSuporte = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tenant_id: 'tenant-root-default',
        name: 'Analista Suporte N2',
        email: suporteEmail,
        password: 'Password@123',
        role: 'SUPORTE_INTERNO',
        dailyQuota: 50000
      })
    });
    const dataCreateSuporte = await resCreateSuporte.json();
    assert(
      resCreateSuporte.status === 201 && dataCreateSuporte.success && dataCreateSuporte.user.role === 'SUPORTE_INTERNO',
      'Cadastro de novo SUPORTE_INTERNO no Tenant Raiz concluído com sucesso'
    );
  } catch (e) {
    assert(false, `Erro ao criar SUPORTE_INTERNO: ${e.message}`);
  }

  // 5. Auditoria de UI/UX em client/admin.html
  try {
    const html = fs.readFileSync(path.resolve('client/admin.html'), 'utf-8');

    // Menu lateral
    const hasNavEquipe = html.includes('Equipe & Operadores Internos</span>');
    assert(hasNavEquipe, 'Menu lateral atualizado para "Equipe & Operadores Internos"');

    // Título da seção
    const hasSectionHeader = html.includes('<h1>EQUIPE & OPERADORES INTERNOS</h1>');
    assert(hasSectionHeader, 'Título da seção de gestão atualizado para "EQUIPE & OPERADORES INTERNOS"');

    // Botão Adicionar Operador Interno
    const hasBtnAddInternal = html.includes('id="btnOpenInternalUserModal"');
    assert(hasBtnAddInternal, 'Botão #btnOpenInternalUserModal presente na barra de ações da seção');

    // Modal de Operador Interno
    const hasInternalModal = html.includes('id="modalAdminNewInternalUser"');
    assert(hasInternalModal, 'Modal dedicado #modalAdminNewInternalUser presente no DOM');

    // Input hidden de Tenant Raiz
    const hasHiddenRootTenant = html.includes('id="inputInternalUserTenantId" value="tenant-root-default"');
    assert(hasHiddenRootTenant, 'Tenant fixado em "tenant-root-default" no formulário interno');

    // Select de Roles restrito a SUPER_ADMIN e SUPORTE_INTERNO
    const hasSuperAdminRole = html.includes('value="SUPER_ADMIN"');
    const hasSuporteRole = html.includes('value="SUPORTE_INTERNO"');
    const hasClientRoleInInternalModal = html.includes('selectInternalUserRole') && 
      (html.includes('<select id="selectInternalUserRole"') && html.split('selectInternalUserRole')[1].split('</select>')[0].includes('Gestor de Tráfego'));

    assert(hasSuperAdminRole, 'Opção SUPER_ADMIN presente no select de operadores internos');
    assert(hasSuporteRole, 'Opção SUPORTE_INTERNO presente no select de operadores internos');
    assert(!hasClientRoleInInternalModal, 'Roles de clientes (ex: Gestor de Tráfego) NÃO existem no modal de operadores internos');
  } catch (e) {
    assert(false, `Erro na auditoria do admin.html: ${e.message}`);
  }

  // 6. Auditoria de Lógica em client/js/admin.js
  try {
    const js = fs.readFileSync(path.resolve('client/js/admin.js'), 'utf-8');

    const hasBtnOpenInternalListener = js.includes('btnOpenInternalUserModal?.addEventListener');
    const hasFormInternalListener = js.includes('formAdminNewInternalUser?.addEventListener');
    const hasTenantQueryInXray = js.includes('/api/admin/users?tenant_id=');

    assert(hasBtnOpenInternalListener, 'Evento de abertura do modal interno registrado');
    assert(hasFormInternalListener, 'Evento de submissão do formulário interno registrado');
    assert(hasTenantQueryInXray, 'renderTenantOperators consome a API com isolamento por query param (?tenant_id=)');
  } catch (e) {
    assert(false, `Erro na auditoria do admin.js: ${e.message}`);
  }

  console.log(`\n🏁 Resultado: ${passed} passaram, ${failed} falharam.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
