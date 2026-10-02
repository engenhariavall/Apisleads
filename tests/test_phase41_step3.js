/**
 * Suíte de Testes - Fase 41 (Etapa 3):
 * Inclusão da Ação de Edição na Tabela (Equipe Interna & Raio-X de Tenants)
 */
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
let superAdminToken = null;

async function runTests() {
  console.log('🚀 Iniciando Validação da Fase 41 - Etapa 3 (Ação de Edição na Tabela)...');
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

  // 1. Validação Estática de Código e Integridade de UI/UX
  try {
    const adminHtml = fs.readFileSync('client/admin.html', 'utf8');
    const adminJs = fs.readFileSync('client/js/admin.js', 'utf8');
    const adminCss = fs.readFileSync('client/css/admin.css', 'utf8');

    // 1.1 Modal de Edição no HTML
    assert(adminHtml.includes('id="modalAdminEditOperator"'), 'HTML possui modal de edição #modalAdminEditOperator');
    assert(adminHtml.includes('id="inputEditOperatorName"'), 'HTML possui input #inputEditOperatorName');
    assert(adminHtml.includes('id="inputEditOperatorEmail"'), 'HTML possui input #inputEditOperatorEmail');
    assert(adminHtml.includes('id="selectEditOperatorRole"'), 'HTML possui select #selectEditOperatorRole');
    assert(adminHtml.includes('id="selectEditOperatorStatus"'), 'HTML possui select #selectEditOperatorStatus');
    assert(adminHtml.includes('id="inputEditOperatorDailyLimit"'), 'HTML possui input #inputEditOperatorDailyLimit');

    // 1.2 Botões e Handlers no JS
    assert(adminJs.includes('allKnownUsersMap'), 'JS declara e utiliza allKnownUsersMap para rastreamento global de usuários');
    assert(adminJs.includes('btn-table-action action-edit'), 'JS inclui botão .action-edit na tabela de usuários internos');
    assert(adminJs.includes('adminEditUser'), 'JS implementa função universal window.adminEditUser');
    assert(adminJs.includes('btn-tenant-edit'), 'JS inclui botão de edição .btn-tenant-edit na tabela do Raio-X');
    assert(adminJs.includes('SUPER_ADMIN') && adminJs.includes('SUPORTE_INTERNO'), 'JS define roles exclusivas internas no modal de edição');
    assert(adminJs.includes('Gestor de Tráfego') && adminJs.includes('Analista de Marketing'), 'JS define roles permitidas de clientes no modal de edição');

    // 1.3 Estilização CSS
    assert(adminCss.includes('.btn-table-action.action-edit'), 'CSS define estilo exclusivo para .btn-table-action.action-edit');
  } catch (err) {
    assert(false, `Falha na verificação estática de código: ${err.message}`);
  }

  // 2. Autenticação Super Admin Master
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

  // 3. Teste de Edição de Usuário Interno (Tenant Raiz)
  let testInternalUserId = null;
  const ts = Date.now();
  const initialInternalEmail = `edit.internal.${ts}@versus.com.br`;
  const updatedInternalEmail = `edit.internal.updated.${ts}@versus.com.br`;

  try {
    // 3.1 Cadastra operador interno para teste
    const createRes = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Operador Interno Teste',
        email: initialInternalEmail,
        password: 'Password@123',
        role: 'SUPER_ADMIN',
        tenant_id: 'tenant-root-default',
        dailyQuota: 600
      })
    });
    const createData = await createRes.json();
    assert(createRes.ok && createData.success, 'Operador interno para teste de edição criado');
    testInternalUserId = createData.user?.id || createData.data?.id;

    // 3.2 Edita nome, e-mail e altera papel para SUPORTE_INTERNO
    const patchRes = await fetch(`${BASE_URL}/api/admin/users/${testInternalUserId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Operador Interno Modificado',
        email: updatedInternalEmail,
        role: 'SUPORTE_INTERNO',
        dailyQuota: 850
      })
    });
    const patchData = await patchRes.json();
    assert(patchRes.ok && patchData.success, 'Edição de operador interno (Nome, E-mail, Role SUPORTE_INTERNO, Cota 850) realizada com sucesso');

    // 3.3 Verifica se os dados foram realmente persistidos
    const verifyRes = await fetch(`${BASE_URL}/api/admin/users`, { headers: authHeaders });
    const verifyData = await verifyRes.json();
    const verifiedUser = (verifyData.users || []).find(u => u.id === testInternalUserId);

    assert(verifiedUser && verifiedUser.name === 'Operador Interno Modificado', 'Nome do operador interno atualizado no banco');
    assert(verifiedUser && verifiedUser.email === updatedInternalEmail, 'E-mail do operador interno atualizado no banco');
    assert(verifiedUser && verifiedUser.role === 'SUPORTE_INTERNO', 'Papel do operador interno atualizado para SUPORTE_INTERNO');
    assert(verifiedUser && verifiedUser.daily_limit === 850, 'Cota do operador interno atualizada para 850');
  } catch (e) {
    assert(false, `Falha no teste de edição de operador interno: ${e.message}`);
  }

  // 4. Teste de Edição de Operador de Cliente (Tenant Externo)
  let testClientUserId = null;
  let clientTenantId = null;

  try {
    // 4.1 Cria um tenant cliente dedicado com capacidade garantida e CNPJ único
    const rCnpj = Math.floor(1000 + Math.random() * 9000);
    const newTenantRes = await fetch(`${BASE_URL}/api/admin/tenants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `Cliente Teste Edicao ${ts}`,
        cnpj: `98.${rCnpj}.000/0001-01`,
        plan: 'ENTERPRISE UNLIMITED',
        max_users: 25
      })
    });
    const newTenantData = await newTenantRes.json();
    assert(newTenantRes.ok && newTenantData.success, 'Tenant cliente dedicado criado com sucesso');
    clientTenantId = newTenantData.tenant?.id || newTenantData.data?.id;

    // 4.2 Cadastra um operador para este tenant cliente
    const clientUserEmail = `operador.cliente.${ts}@empresa.com`;

    const createClientUserRes = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Operador Cliente Teste',
        email: clientUserEmail,
        password: 'Password@123',
        role: 'Gestor de Tráfego',
        tenant_id: clientTenantId,
        dailyQuota: 500
      })
    });
    const createClientUserData = await createClientUserRes.json();
    assert(createClientUserRes.ok && createClientUserData.success, 'Operador de cliente criado para teste de edição');
    testClientUserId = createClientUserData.user?.id || createClientUserData.data?.id;

    // 4.3 Edição Autorizada: Alterar para 'Analista de Marketing'
    const editAnalistaRes = await fetch(`${BASE_URL}/api/admin/users/${testClientUserId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Operador Cliente Analista',
        role: 'Analista de Marketing'
      })
    });
    const editAnalistaData = await editAnalistaRes.json();
    assert(editAnalistaRes.ok && editAnalistaData.success, 'Edição autorizada de operador de cliente para "Analista de Marketing"');

    // 4.4 Edição Autorizada: Alterar para 'Coordenador de Marketing'
    const editCoordRes = await fetch(`${BASE_URL}/api/admin/users/${testClientUserId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        role: 'Coordenador de Marketing'
      })
    });
    const editCoordData = await editCoordRes.json();
    assert(editCoordRes.ok && editCoordData.success, 'Edição autorizada de operador de cliente para "Coordenador de Marketing"');

    // 4.5 Edição Autorizada: Alterar para 'Admin' do Tenant
    const editAdminRes = await fetch(`${BASE_URL}/api/admin/users/${testClientUserId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        role: 'Admin'
      })
    });
    const editAdminData = await editAdminRes.json();
    assert(editAdminRes.ok && editAdminData.success, 'Edição autorizada de operador de cliente para "Admin" do Tenant');

    // 4.6 BLOQUEIO ESTRITO DE RBAC: Tentativa de promover operador de cliente a SUPER_ADMIN via Edição
    const blockSuperAdminRes = await fetch(`${BASE_URL}/api/admin/users/${testClientUserId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        role: 'SUPER_ADMIN'
      })
    });
    const blockSuperAdminData = await blockSuperAdminRes.json();
    assert(
      blockSuperAdminRes.status === 400 && blockSuperAdminData.error === 'FORBIDDEN_ROLE_FOR_TENANT',
      'Blindagem RBAC na Edição: Bloqueada com 400 promoção de operador de cliente para SUPER_ADMIN'
    );

    // 4.7 BLOQUEIO ESTRITO DE RBAC: Tentativa de promover operador de cliente a SUPORTE_INTERNO via Edição
    const blockSuporteRes = await fetch(`${BASE_URL}/api/admin/users/${testClientUserId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        role: 'SUPORTE_INTERNO'
      })
    });
    const blockSuporteData = await blockSuporteRes.json();
    assert(
      blockSuporteRes.status === 400 && blockSuporteData.error === 'FORBIDDEN_ROLE_FOR_TENANT',
      'Blindagem RBAC na Edição: Bloqueada com 400 promoção de operador de cliente para SUPORTE_INTERNO'
    );

    // 4.8 Edição de Senha do operador (mínimo 6 caracteres)
    const editPasswordRes = await fetch(`${BASE_URL}/api/admin/users/${testClientUserId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        password: 'NovaSenhaSegura@2026'
      })
    });
    const editPasswordData = await editPasswordRes.json();
    assert(editPasswordRes.ok && editPasswordData.success, 'Atualização de senha via edição realizada com sucesso');

  } catch (e) {
    assert(false, `Falha no teste de edição de operador de cliente: ${e.message}`);
  }

  // 5. Cleanup dos usuários e tenant criados para teste
  try {
    if (testInternalUserId) {
      await fetch(`${BASE_URL}/api/admin/users/${testInternalUserId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
    }
    if (testClientUserId) {
      await fetch(`${BASE_URL}/api/admin/users/${testClientUserId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
    }
    console.log('  🧹 Limpeza de usuários de teste finalizada.');
  } catch (e) {
    console.warn('  ⚠️ Aviso ao limpar usuários de teste:', e.message);
  }

  // Resultado Final
  console.log('\n====================================================');
  console.log(`📊 Total de Verificações: ${passed + failed}`);
  console.log(`✅ Aprovadas: ${passed}`);
  console.log(`❌ Falhas: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 Fase 41 - Etapa 3 100% Homologada com Sucesso!');
    process.exit(0);
  }
}

runTests();
