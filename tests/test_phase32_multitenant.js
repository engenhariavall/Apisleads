/**
 * TESTE DE HOMOLOGAÇÃO AUTOMATIZADA - FASE 32
 * Arquitetura Multi-Tenant Corporativa & Governança de Empresas com Auditoria Segregada
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Iniciando bateria de testes da Fase 32 (Multi-Tenant & Governança)...');
  let tokenSuperAdmin = '';

  // 1. Autenticação Super Admin
  console.log('\n[1/7] Testando autenticação do Super Admin Master...');
  const resLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hajaluzstudio@gmail.com', password: 'sophia11052016' })
  });
  const dataLogin = await resLogin.json();
  if (!resLogin.ok || !dataLogin.token) {
    throw new Error(`Falha no login do Super Admin: ${JSON.stringify(dataLogin)}`);
  }
  tokenSuperAdmin = dataLogin.token;
  console.log('✅ Super Admin autenticado. Tenant ID:', dataLogin.user.tenant_id);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${tokenSuperAdmin}`
  };

  // 2. Listagem de Tenants (Verificação do Tenant Root)
  console.log('\n[2/7] Listando empresas cadastradas (Verificando Tenant Root Primário)...');
  const resTenants = await fetch(`${BASE_URL}/api/admin/tenants`, { headers: authHeaders });
  const dataTenants = await resTenants.json();
  if (!resTenants.ok || !Array.isArray(dataTenants.tenants)) {
    throw new Error(`Falha ao listar tenants: ${JSON.stringify(dataTenants)}`);
  }
  const rootTenant = dataTenants.tenants.find(t => t.id === 'tenant-root-default');
  if (!rootTenant) {
    throw new Error('Tenant Root (tenant-root-default) não encontrado na base!');
  }
  console.log(`✅ Tenant Root verificado: "${rootTenant.name}" (${rootTenant.active_users} usuários ativos).`);

  // 3. Criação de duas empresas independentes (Empresa Alfa e Empresa Beta)
  console.log('\n[3/7] Criando empresas independentes (Empresa Alfa e Empresa Beta)...');
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const tenantAlfaPayload = {
    name: `Empresa Alfa Inteligência ${randSuffix} Ltda`,
    cnpj: `11.222.${randSuffix}/0001-44`,
    plan: 'PROFESSIONAL',
    max_users: 2, // Limite intencional para testar quota de usuários
    daily_quota_limit: 2500,
    monthly_quota_limit: 50000
  };
  const resAlfa = await fetch(`${BASE_URL}/api/admin/tenants`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(tenantAlfaPayload)
  });
  const dataAlfa = await resAlfa.json();
  if (!resAlfa.ok || !dataAlfa.tenant) {
    throw new Error(`Falha ao criar Empresa Alfa: ${JSON.stringify(dataAlfa)}`);
  }
  const tenantAlfaId = dataAlfa.tenant.id;
  console.log(`✅ Empresa Alfa criada com sucesso! ID: ${tenantAlfaId}`);

  const tenantBetaPayload = {
    name: `Empresa Beta Agronegócios ${randSuffix} S.A.`,
    cnpj: `55.666.${randSuffix}/0001-88`,
    plan: 'ENTERPRISE',
    max_users: 10,
    daily_quota_limit: 10000,
    monthly_quota_limit: 200000
  };
  const resBeta = await fetch(`${BASE_URL}/api/admin/tenants`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(tenantBetaPayload)
  });
  const dataBeta = await resBeta.json();
  if (!resBeta.ok || !dataBeta.tenant) {
    throw new Error(`Falha ao criar Empresa Beta: ${JSON.stringify(dataBeta)}`);
  }
  const tenantBetaId = dataBeta.tenant.id;
  console.log(`✅ Empresa Beta criada com sucesso! ID: ${tenantBetaId}`);

  // 4. Criação de Usuários vinculados a cada empresa
  console.log('\n[4/7] Cadastrando usuários vinculados às respectivas empresas...');
  const userAlfa1 = {
    tenant_id: tenantAlfaId,
    name: 'Operador Alfa 1',
    email: `operador1.alfa.${Date.now()}@alfa.com`,
    password: 'password123',
    role: 'GESTOR_TRAFEGO',
    dailyQuota: 500
  };
  const resUserAlfa1 = await fetch(`${BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(userAlfa1)
  });
  const dataUserAlfa1 = await resUserAlfa1.json();
  if (!resUserAlfa1.ok || !dataUserAlfa1.user) {
    throw new Error(`Falha ao criar Operador 1 da Alfa: ${JSON.stringify(dataUserAlfa1)}`);
  }
  console.log(`✅ Usuário 1 criado para Empresa Alfa: ${userAlfa1.email}`);

  const userAlfa2 = {
    tenant_id: tenantAlfaId,
    name: 'Operador Alfa 2',
    email: `operador2.alfa.${Date.now()}@alfa.com`,
    password: 'password123',
    role: 'VISUALIZADOR',
    dailyQuota: 200
  };
  const resUserAlfa2 = await fetch(`${BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(userAlfa2)
  });
  const dataUserAlfa2 = await resUserAlfa2.json();
  if (!resUserAlfa2.ok || !dataUserAlfa2.user) {
    throw new Error(`Falha ao criar Operador 2 da Alfa: ${JSON.stringify(dataUserAlfa2)}`);
  }
  console.log(`✅ Usuário 2 criado para Empresa Alfa: ${userAlfa2.email}`);

  // 5. Teste da trava contratual de Limite Máximo de Usuários (max_users = 2)
  console.log('\n[5/7] Testando trava contratual max_users na Empresa Alfa (Tentativa de criar 3º usuário)...');
  const userAlfa3 = {
    tenant_id: tenantAlfaId,
    name: 'Operador Alfa 3 (Excedente)',
    email: `operador3.alfa.${Date.now()}@alfa.com`,
    password: 'password123',
    role: 'VISUALIZADOR',
    dailyQuota: 200
  };
  const resUserAlfa3 = await fetch(`${BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(userAlfa3)
  });
  const dataUserAlfa3 = await resUserAlfa3.json();
  if (resUserAlfa3.status === 400 && (dataUserAlfa3.error === 'TENANT_USER_LIMIT_REACHED' || (dataUserAlfa3.message && dataUserAlfa3.message.includes('Limite de operadores excedido')))) {
    console.log(`✅ Trava contratual bloqueou criação com sucesso: "${dataUserAlfa3.message}"`);
  } else {
    throw new Error(`Trava de max_users falhou! Resposta inesperada: ${JSON.stringify(dataUserAlfa3)}`);
  }

  // 6. Login do Operador Alfa e geração de tráfego/auditoria
  console.log('\n[6/7] Autenticando com Operador da Empresa Alfa para gerar telemetria de auditoria...');
  const resLoginAlfa = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAlfa1.email, password: 'password123' })
  });
  const dataLoginAlfa = await resLoginAlfa.json();
  if (!resLoginAlfa.ok || !dataLoginAlfa.token) {
    throw new Error(`Falha no login do Operador Alfa: ${JSON.stringify(dataLoginAlfa)}`);
  }
  if (dataLoginAlfa.user.tenant_id !== tenantAlfaId) {
    throw new Error(`tenant_id incorreto no login: esperado ${tenantAlfaId}, recebido ${dataLoginAlfa.user.tenant_id}`);
  }
  console.log(`✅ Operador Alfa logado com sucesso! Token contém tenant_id: ${dataLoginAlfa.user.tenant_id}`);

  // Faz uma consulta de leads com o token do Operador Alfa para registrar log de auditoria
  await fetch(`${BASE_URL}/api/leads/filter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${dataLoginAlfa.token}`
    },
    body: JSON.stringify({ estado: 'SP', limit: 5 })
  });
  console.log('✅ Consulta de leads executada pelo Operador Alfa.');

  // 7. Auditoria Segregada por Empresa (Multi-Tenant Audit Filter)
  console.log('\n[7/7] Testando filtro individualizado de Auditoria & Logs por Empresa no Super Admin...');
  // A) Filtro por Empresa Alfa
  const resAuditAlfa = await fetch(`${BASE_URL}/api/admin/audit-logs?tenant_id=${tenantAlfaId}`, { headers: authHeaders });
  const dataAuditAlfa = await resAuditAlfa.json();
  if (!resAuditAlfa.ok || !Array.isArray(dataAuditAlfa.logs)) {
    throw new Error(`Falha ao consultar auditoria filtrada da Alfa: ${JSON.stringify(dataAuditAlfa)}`);
  }
  console.log(`📊 Total de logs recuperados para Empresa Alfa: ${dataAuditAlfa.logs.length}`);
  const hasOnlyAlfaLogs = dataAuditAlfa.logs.every(l => l.tenant_id === tenantAlfaId);
  if (!hasOnlyAlfaLogs) {
    throw new Error('Falha na segregação: encontrados logs de outros tenants na consulta da Empresa Alfa!');
  }
  console.log('✅ Todos os logs retornados pertencem exclusivamente à Empresa Alfa!');

  // B) Filtro por Empresa Beta (deve retornar vazio ou apenas logs de criação)
  const resAuditBeta = await fetch(`${BASE_URL}/api/admin/audit-logs?tenant_id=${tenantBetaId}`, { headers: authHeaders });
  const dataAuditBeta = await resAuditBeta.json();
  console.log(`📊 Total de logs recuperados para Empresa Beta: ${dataAuditBeta.logs.length}`);
  const hasOnlyBetaLogs = dataAuditBeta.logs.every(l => l.tenant_id === tenantBetaId);
  if (!hasOnlyBetaLogs) {
    throw new Error('Falha na segregação: encontrados logs incorretos na consulta da Empresa Beta!');
  }
  console.log('✅ Segregação de logs por empresa 100% validada!');

  console.log('\n🎉 TODOS OS TESTES DA FASE 32 FORAM CONCLUÍDOS COM 100% DE SUCESSO!');
}

runTests().catch(err => {
  console.error('\n❌ ERRO NA BATERIA DE TESTES:', err);
  process.exit(1);
});
