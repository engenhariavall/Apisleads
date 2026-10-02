/**
 * tests/test_phase42_tenants_management.js
 * 
 * FASE 42: REFINAMENTO TÉCNICO DE EMPRESAS & TENANTS
 * (EXCLUSÃO DEFINITIVA NO SQLITE & GESTÃO AUDITÁVEL DE SENHAS)
 * 
 * Validações Automatizadas E2E:
 * 1. Integridade do DOM e componentes da interface (admin.html, admin.js, admin.css)
 * 2. Autenticação e credenciamento do Super Admin Master
 * 3. Criação de Tenant de Teste com Operadores de Clientes vinculados
 * 4. Persistência de senhas em texto puro/auditável e verificação de integridade no SQLite
 * 5. Visualização e consulta de dados no Raio-X com listagem de operadores e senhas
 * 6. Proteção estrita contra a exclusão do Tenant Raiz (tenant-root-default)
 * 7. Exclusão física definitiva em cascata do Tenant (tenants, users, export_quotas, competitors, leads)
 * 8. Preservação da integridade histórica de audit_logs (tenant_id desacoplado para NULL)
 */

import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

const BASE_URL = 'http://localhost:3000';
let superAdminToken = null;
let superAdminId = null;

async function runTests() {
  console.log('🚀 Iniciando Homologação Automatizada: FASE 42 — Gestão e Exclusão Definitiva de Tenants...');
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

  // ---------------------------------------------------------------------------
  // 1. Verificação Estática de Código e Integridade do DOM / UI
  // ---------------------------------------------------------------------------
  console.log('\n📦 [BLOCO 1] Auditoria Estática de UI e Componentes de Governança');
  try {
    const adminHtml = fs.readFileSync('client/admin.html', 'utf8');
    const adminJs = fs.readFileSync('client/js/admin.js', 'utf8');
    const adminCss = fs.readFileSync('client/css/admin.css', 'utf8');

    // 1.1 Botão de Exclusão no Raio-X da Empresa
    assert(adminHtml.includes('id="btnDeleteTenantFromEditModal"'), 'admin.html possui botão #btnDeleteTenantFromEditModal na aba Cadastral do Raio-X');
    assert(adminHtml.includes('Excluir Empresa'), 'admin.html renderiza rótulo "Excluir Empresa" no rodapé do Raio-X');

    // 1.2 Tabela de Operadores no Raio-X com Senha de Acesso
    assert(adminHtml.includes('<th>SENHA DE ACESSO</th>'), 'Tabela de operadores no Raio-X possui cabeçalho "SENHA DE ACESSO"');
    assert(adminHtml.includes('id="xrayTenantUsersTableBody"'), 'admin.html possui tbody #xrayTenantUsersTableBody para operadores vinculados');

    // 1.3 Funções no Javascript
    assert(adminJs.includes('window.adminDeleteTenant'), 'admin.js implementa window.adminDeleteTenant');
    assert(adminJs.includes('CANNOT_DELETE_ROOT_TENANT') || adminJs.includes('tenant-root-default'), 'admin.js protege tenant-root-default contra exclusão');
    assert(adminJs.includes('btnDeleteTenantModal'), 'admin.js vincula handler de clique no botão de exclusão do Raio-X');
    assert(adminJs.includes('pass-display-xray-'), 'admin.js gera container de senha interativo com botões de olho e cópia no Raio-X');
    assert(adminJs.includes('window.adminTogglePasswordVisibility'), 'admin.js expõe alternador de visibilidade de senha');
    assert(adminJs.includes('window.adminCopyUserPassword'), 'admin.js expõe cópia rápida de senha para a área de transferência');

    // 1.4 Estilização e Cores no CSS
    assert(adminCss.includes('.btn-tenant-action.btn-tenant-delete:hover'), 'admin.css possui estilo hover carmesim para exclusão de empresas');
    assert(adminCss.includes('.user-password-container'), 'admin.css estiliza o componente interativo de senha');
  } catch (err) {
    assert(false, `Falha na verificação estática: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // 2. Autenticação e Login do Super Admin Master
  // ---------------------------------------------------------------------------
  console.log('\n🔐 [BLOCO 2] Autenticação e Permissões do Super Admin Master');
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hajaluzstudio@gmail.com',
        password: 'sophia11052016'
      })
    });
    const loginData = await loginRes.json();
    assert(loginRes.ok && loginData.success, 'Login do Super Admin Master realizado com sucesso HTTP 200');
    assert(loginData.token, 'Token JWT recebido na resposta');
    assert(loginData.user?.role === 'SUPER_ADMIN', 'Papel retornado é rigorosamente SUPER_ADMIN');
    superAdminToken = loginData.token;
    superAdminId = loginData.user?.id;
  } catch (err) {
    assert(false, `Falha ao autenticar Super Admin: ${err.message}`);
  }

  const authHeaders = {
    'Authorization': `Bearer ${superAdminToken}`,
    'Content-Type': 'application/json'
  };

  // ---------------------------------------------------------------------------
  // 3. Blindagem de Proteção ao Tenant Raiz (tenant-root-default)
  // ---------------------------------------------------------------------------
  console.log('\n🛡️ [BLOCO 3] Teste de Blindagem: Tentativa de Exclusão do Tenant Raiz');
  try {
    const delRootRes = await fetch(`${BASE_URL}/api/admin/tenants/tenant-root-default`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const delRootData = await delRootRes.json();
    assert(delRootRes.status === 400, 'Tentativa de deletar tenant-root-default rejeitada com HTTP 400');
    assert(delRootData.error === 'CANNOT_DELETE_ROOT_TENANT', 'Código de erro retornado é CANNOT_DELETE_ROOT_TENANT');
    assert(!delRootData.success, 'Flag success é false no bloqueio do tenant raiz');
  } catch (err) {
    assert(false, `Falha no teste de proteção do tenant raiz: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // 4. Criação de Tenant de Teste e Operadores de Clientes com Senha
  // ---------------------------------------------------------------------------
  console.log('\n🏢 [BLOCO 4] Criação de Tenant e Operadores com Senha Auditável');
  let testTenantId = null;
  let testOperator1Id = null;
  let testOperator2Id = null;
  const rawTestPass1 = 'SenhaAlfa@2026';
  const rawTestPass2 = 'GestorBeta#99';

  try {
    // 4.1 Cria Tenant
    const createTenantRes = await fetch(`${BASE_URL}/api/admin/tenants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Alfa Holding Teste S/A',
        cnpj: '77.888.999/0001-55',
        plan: 'ENTERPRISE',
        max_users: 5,
        daily_quota_limit: 10000,
        monthly_quota_limit: 100000
      })
    });
    const createTenantData = await createTenantRes.json();
    assert(createTenantRes.status === 201 && createTenantData.success, 'Tenant de teste criado com sucesso HTTP 201');
    testTenantId = createTenantData.tenant?.id;
    assert(testTenantId && testTenantId.startsWith('tenant-'), `ID do tenant gerado: ${testTenantId}`);

    // 4.2 Cria Operador 1 (Admin do Cliente)
    const op1Res = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Carlos Gestor Alfa',
        email: `carlos.alfa.${Date.now()}@teste.com`,
        password: rawTestPass1,
        role: 'Admin',
        tenant_id: testTenantId,
        dailyQuota: 500
      })
    });
    const op1Data = await op1Res.json();
    assert(op1Res.status === 201 && op1Data.success, 'Operador 1 criado para o tenant de teste HTTP 201');
    testOperator1Id = op1Data.user?.id;
    assert(op1Data.user?.access_password === rawTestPass1, 'Senha do Operador 1 retornada em texto puro/auditável');

    // 4.3 Cria Operador 2 (Gestor de Tráfego)
    const op2Res = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Beatriz Tráfego Alfa',
        email: `beatriz.alfa.${Date.now()}@teste.com`,
        password: rawTestPass2,
        role: 'Gestor de Tráfego',
        tenant_id: testTenantId,
        dailyQuota: 300
      })
    });
    const op2Data = await op2Res.json();
    assert(op2Res.status === 201 && op2Data.success, 'Operador 2 criado para o tenant de teste HTTP 201');
    testOperator2Id = op2Data.user?.id;
    assert(op2Data.user?.access_password === rawTestPass2, 'Senha do Operador 2 retornada em texto puro/auditável');

    // 4.4 Inserção direta de dados vinculados no SQLite (leads e audit_logs) para testar cascata
    const sqlite = new DatabaseSync('data/leads.sqlite');
    sqlite.exec(`
      INSERT OR REPLACE INTO leads (id, cnpj, cnpj_raw, razao_social, cnae_principal_codigo, cnae_principal_descricao, porte, municipio, uf, tenant_id, is_competitor)
      VALUES 
        ('lead-test-cascade-1', '99.111.222/0001-33', '99111222000133', 'EMPRESA TESTE FILHOTE ALFA', '46.12-3-00', 'Comércio', 'ME', 'SÃO PAULO', 'SP', '${testTenantId}', 0),
        ('comp-test-cascade-1', '99.111.222/0001-44', '99111222000144', 'CONCORRENTE TESTE ALFA', '46.12-3-00', 'Comércio', 'EPP', 'SÃO PAULO', 'SP', '${testTenantId}', 1);
      
      INSERT OR REPLACE INTO audit_logs (id, tenant_id, user_id, user_email, action, endpoint, records_count)
      VALUES ('audit-test-cascade-1', '${testTenantId}', '${testOperator1Id}', 'carlos.alfa@teste.com', 'TEST_ACTION', '/api/test', 1);
    `);
    sqlite.close();
    console.log('  ℹ️  Dados adicionais de teste (leads, concorrente e audit_log) injetados para o tenant.');
  } catch (err) {
    assert(false, `Falha no cadastro do tenant e operadores de teste: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // 5. Consulta de Operadores e Senhas por Tenant (Raio-X)
  // ---------------------------------------------------------------------------
  console.log('\n🔍 [BLOCO 5] Consulta de Operadores e Senhas pelo Raio-X');
  try {
    const listTenantUsersRes = await fetch(`${BASE_URL}/api/admin/users?tenant_id=${encodeURIComponent(testTenantId)}`, {
      headers: authHeaders
    });
    const listTenantUsersData = await listTenantUsersRes.json();
    assert(listTenantUsersRes.ok && listTenantUsersData.success, 'Listagem de operadores do tenant retornou HTTP 200');
    assert(Array.isArray(listTenantUsersData.users) && listTenantUsersData.users.length === 2, 'Retornou exatamente 2 operadores vinculados');
    
    const u1 = listTenantUsersData.users.find(u => u.id === testOperator1Id);
    const u2 = listTenantUsersData.users.find(u => u.id === testOperator2Id);
    assert(u1 && u1.access_password === rawTestPass1, 'Operador 1 possui access_password auditável correspondente');
    assert(u2 && u2.access_password === rawTestPass2, 'Operador 2 possui access_password auditável correspondente');
  } catch (err) {
    assert(false, `Falha ao consultar operadores do tenant: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // 6. Execução da Exclusão Definitiva em Cascata do Tenant
  // ---------------------------------------------------------------------------
  console.log('\n🗑️ [BLOCO 6] Execução da Exclusão Definitiva (Hard Cascade Delete)');
  try {
    const delTenantRes = await fetch(`${BASE_URL}/api/admin/tenants/${testTenantId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const delTenantData = await delTenantRes.json();
    assert(delTenantRes.ok && delTenantData.success, 'Exclusão do tenant retornou HTTP 200');
    assert(delTenantData.action === 'DELETED', 'Ação retornada é rigorosamente DELETED');
    assert(delTenantData.deleted_users_count >= 2, `Contador de operadores excluídos reportado: ${delTenantData.deleted_users_count}`);
  } catch (err) {
    assert(false, `Falha ao executar exclusão do tenant: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // 7. Auditoria de Integridade Referencial no Banco de Dados SQLite
  // ---------------------------------------------------------------------------
  console.log('\n🗄️ [BLOCO 7] Auditoria de Integridade e Limpeza no SQLite');
  try {
    const sqlite = new DatabaseSync('data/leads.sqlite');

    // 7.1 Tenant Removido
    const tenantRow = sqlite.prepare('SELECT id FROM tenants WHERE id = ?').get(testTenantId);
    assert(!tenantRow, 'Registro da empresa foi removido fisicamente da tabela tenants');

    // 7.2 Operadores Removidos
    const usersRows = sqlite.prepare('SELECT id FROM users WHERE tenant_id = ?').all(testTenantId);
    assert(usersRows.length === 0, 'Todos os operadores vinculados ao tenant foram purgados da tabela users');

    // 7.3 Cotas Removidas
    const quotasRows = sqlite.prepare('SELECT user_id FROM export_quotas WHERE user_id IN (?, ?)').all(testOperator1Id, testOperator2Id);
    assert(quotasRows.length === 0, 'Todas as cotas dos operadores excluídos foram purgadas da tabela export_quotas');

    // 7.4 Leads e Concorrentes do Tenant Removidos
    const leadsRows = sqlite.prepare('SELECT id FROM leads WHERE tenant_id = ?').all(testTenantId);
    assert(leadsRows.length === 0, 'Todos os leads e concorrentes do tenant foram purgados da tabela leads');

    // 7.5 Integridade de Audit Logs Preservada (tenant_id desacoplado para NULL)
    const auditRow = sqlite.prepare('SELECT id, tenant_id FROM audit_logs WHERE id = ?').get('audit-test-cascade-1');
    assert(auditRow !== undefined, 'Registro histórico de audit_log foi preservado');
    assert(auditRow.tenant_id === null, 'tenant_id no audit_log foi atualizado para NULL (sem orfandade inválida)');

    // Limpeza do log temporário
    sqlite.prepare('DELETE FROM audit_logs WHERE id = ?').run('audit-test-cascade-1');
    sqlite.close();
  } catch (err) {
    assert(false, `Falha na verificação direta do SQLite: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // Relatório Final
  // ---------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`📊 RELATÓRIO FINAL: ${passed} APROVADOS / ${failed} FALHAS`);
  console.log('====================================================');

  if (failed > 0) {
    console.error(`💥 [FALHA] ${failed} testes falharam na homologação da Fase 42.`);
    process.exit(1);
  } else {
    console.log('🎉 [SUCESSO TOTAL] Todas as 22 asserções da FASE 42 foram 100% aprovadas!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('❌ Erro fatal na suíte de testes:', err);
  process.exit(1);
});
