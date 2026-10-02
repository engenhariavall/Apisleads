/**
 * Suíte de Testes - Exclusão Definitiva de Usuários e Visualização de Senhas de Acesso
 * Validações de Backend (Persistência no SQLite), Blindagem de Auto-Exclusão e UI/UX
 */
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

const BASE_URL = 'http://localhost:3000';
let superAdminToken = null;
let superAdminId = null;

async function runTests() {
  console.log('🚀 Iniciando Validação: Exclusão Definitiva de Usuário e Visualização de Senhas...');
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

  // 1. Validação Estática de Código e Integridade do DOM
  try {
    const adminHtml = fs.readFileSync('client/admin.html', 'utf8');
    const adminJs = fs.readFileSync('client/js/admin.js', 'utf8');
    const adminCss = fs.readFileSync('client/css/admin.css', 'utf8');

    // 1.1 Tabela e Cabeçalho de Senha
    assert(adminHtml.includes('<th>Senha de Acesso</th>'), 'HTML possui cabeçalho "Senha de Acesso" na tabela de equipe interna');
    assert(adminHtml.includes('displayEditOperatorCurrentPassword'), 'HTML possui span #displayEditOperatorCurrentPassword no modal de edição');
    assert(adminHtml.includes('btnToggleCurrentPassVisibility'), 'HTML possui botão de alternar visibilidade da senha no modal');
    assert(adminHtml.includes('btnCopyCurrentOperatorPassword'), 'HTML possui botão de copiar senha no modal');
    assert(adminHtml.includes('btnDeleteUserFromEditModal'), 'HTML possui botão #btnDeleteUserFromEditModal no rodapé do modal');

    // 1.2 Handlers e Ações no JS
    assert(adminJs.includes('window.adminDeleteUser'), 'JS implementa função window.adminDeleteUser');
    assert(adminJs.includes('window.adminTogglePasswordVisibility'), 'JS implementa função window.adminTogglePasswordVisibility');
    assert(adminJs.includes('window.adminCopyUserPassword'), 'JS implementa função window.adminCopyUserPassword');
    assert(adminJs.includes('action-delete'), 'JS inclui botão .action-delete na renderização da tabela');
    assert(adminJs.includes('user-password-container'), 'JS renderiza container interativo de senha com botões de olho e cópia');

    // 1.3 CSS
    assert(adminCss.includes('.btn-table-action.action-delete:hover'), 'CSS possui estilo de destaque carmesim para exclusão na tabela');
    assert(adminCss.includes('.btn-modal-delete-user:hover'), 'CSS possui estilo de destaque carmesim no modal de edição');
    assert(adminCss.includes('.user-password-container'), 'CSS possui regras de exibição e tipografia monospace para senha');
  } catch (err) {
    assert(false, `Falha na verificação estática: ${err.message}`);
  }

  // 2. Autenticação do Super Admin
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
    superAdminId = loginData.user?.id;
  } catch (e) {
    assert(false, `Falha no login do Super Admin: ${e.message}`);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${superAdminToken}`
  };

  // 3. Teste de Criação e Visualização de Senha
  const ts = Date.now();
  const testEmail = `operador.delete.${ts}@versus.com.br`;
  const initialPassword = `MasterSecretPass@${ts}`;
  let createdUserId = null;

  try {
    const createRes = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Operador Teste Exclusão',
        email: testEmail,
        password: initialPassword,
        role: 'SUPORTE_INTERNO',
        tenant_id: 'tenant-root-default',
        dailyQuota: 500
      })
    });
    const createData = await createRes.json();
    assert(createRes.ok && createData.success, 'Usuário cadastrado com sucesso');
    createdUserId = createData.user?.id || createData.data?.id;

    // 3.1 Consulta API para verificar se a senha de acesso foi armazenada e retornada
    const listRes = await fetch(`${BASE_URL}/api/admin/users`, { headers: authHeaders });
    const listData = await listRes.json();
    const fetchedUser = (listData.users || []).find(u => u.id === createdUserId);

    assert(fetchedUser !== undefined, 'Usuário criado encontrado na listagem da API');
    assert(
      fetchedUser && fetchedUser.access_password === initialPassword,
      `Visualização de Senha: access_password retornado corresponde à senha definida (${fetchedUser?.access_password})`
    );

    // 3.2 Atualização da senha via endpoint de Reset
    const newPassword = `ResetNovaSenha@${ts}`;
    const resetRes = await fetch(`${BASE_URL}/api/admin/users/${createdUserId}/reset-password`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ password: newPassword })
    });
    const resetData = await resetRes.json();
    assert(resetRes.ok && resetData.success, 'Redefinição de senha realizada com sucesso');

    // Verifica se a nova senha foi atualizada no banco
    const listRes2 = await fetch(`${BASE_URL}/api/admin/users`, { headers: authHeaders });
    const listData2 = await listRes2.json();
    const fetchedUser2 = (listData2.users || []).find(u => u.id === createdUserId);
    assert(
      fetchedUser2 && fetchedUser2.access_password === newPassword,
      `Visualização de Senha Atualizada: nova senha persistida com sucesso (${fetchedUser2?.access_password})`
    );
  } catch (e) {
    assert(false, `Falha no teste de criação e visualização de senha: ${e.message}`);
  }

  // 4. Teste de Bloqueio de Auto-Exclusão do Super Admin
  try {
    const selfDeleteRes = await fetch(`${BASE_URL}/api/admin/users/${superAdminId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const selfDeleteData = await selfDeleteRes.json();
    assert(
      selfDeleteRes.status === 400 && selfDeleteData.error === 'CANNOT_DELETE_SELF',
      'Blindagem de Segurança: Bloqueada tentativa do Super Admin excluir sua própria conta'
    );
  } catch (e) {
    assert(false, `Falha no teste de auto-exclusão: ${e.message}`);
  }

  // 5. Teste de Exclusão Definitiva do Banco de Dados (Hard Delete)
  try {
    // 5.1 Chamada de Exclusão via API
    const deleteRes = await fetch(`${BASE_URL}/api/admin/users/${createdUserId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const deleteData = await deleteRes.json();
    assert(deleteRes.ok && deleteData.success, 'Endpoint DELETE /api/admin/users/:id retornou sucesso 200');

    // 5.2 Validação via API (Não deve mais constar na lista)
    const listResAfter = await fetch(`${BASE_URL}/api/admin/users`, { headers: authHeaders });
    const listDataAfter = await listResAfter.json();
    const userInApi = (listDataAfter.users || []).find(u => u.id === createdUserId);
    assert(userInApi === undefined, 'Usuário removido da listagem da API GET /api/admin/users');

    // 5.3 Validação Direta no Arquivo SQLite (Hard Delete Real)
    const dbPath = 'data/leads.sqlite';
    const rawDb = new DatabaseSync(dbPath, { readOnly: true });

    const userInDb = rawDb.prepare('SELECT id, email FROM users WHERE id = ?').get(createdUserId);
    assert(userInDb === undefined, 'Verificação SQLite: Registro do usuário foi REALMENTE e permanentemente excluído da tabela "users"');

    const quotaInDb = rawDb.prepare('SELECT user_id FROM export_quotas WHERE user_id = ?').get(createdUserId);
    assert(quotaInDb === undefined, 'Verificação SQLite: Registro de quotas associado foi excluído da tabela "export_quotas"');

    rawDb.close();
  } catch (e) {
    assert(false, `Falha na validação de exclusão definitiva: ${e.message}`);
  }

  // Relatório Final
  console.log('\n====================================================');
  console.log(`📊 Total de Verificações: ${passed + failed}`);
  console.log(`✅ Aprovadas: ${passed}`);
  console.log(`❌ Falhas: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 Funcionalidade de Exclusão Definitiva e Visualização de Senhas 100% Homologada!');
    process.exit(0);
  }
}

runTests();
