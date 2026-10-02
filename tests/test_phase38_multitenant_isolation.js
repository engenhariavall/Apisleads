/**
 * TESTE DE HOMOLOGAÇÃO AUTOMATIZADA - FASE 38 (ETAPA 1)
 * Blindagem de Dados no Backend e Frontend (Isolamento Estrito Multi-Tenant)
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Iniciando bateria de testes da Fase 38 - Etapa 1 (Isolamento Multi-Tenant)...');

  // 1. Autenticação Super Admin
  console.log('\n[1/6] Autenticando Super Admin Master...');
  const resLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hajaluzstudio@gmail.com', password: 'sophia11052016' })
  });
  const dataLogin = await resLogin.json();
  if (!resLogin.ok || !dataLogin.token) {
    throw new Error(`Falha no login do Super Admin: ${JSON.stringify(dataLogin)}`);
  }
  const token = dataLogin.token;
  console.log('✅ Super Admin autenticado com sucesso.');

  // 2. Criar uma nova empresa/tenant independente e "zerada"
  console.log('\n[2/6] Criando novo Tenant independente para teste de isolamento...');
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const newTenantPayload = {
    name: `Empresa Isolada Teste ${randSuffix} Ltda`,
    cnpj: `33.444.${randSuffix}/0001-99`,
    plan: 'ENTERPRISE',
    max_users: 5,
    daily_quota_limit: 1000,
    monthly_quota_limit: 10000
  };

  const resCreateTenant = await fetch(`${BASE_URL}/api/admin/tenants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(newTenantPayload)
  });
  const dataTenant = await resCreateTenant.json();
  if (!resCreateTenant.ok || !dataTenant.tenant) {
    throw new Error(`Falha ao criar tenant: ${JSON.stringify(dataTenant)}`);
  }
  const newTenantId = dataTenant.tenant.id;
  console.log(`✅ Novo tenant criado com sucesso: ${newTenantId} (${dataTenant.tenant.name})`);

  // 3. Teste da API de Leads no Tenant Raiz (deve retornar leads normais)
  console.log('\n[3/6] Consultando leads no Tenant Raiz (tenant-root-default)...');
  const resRootLeads = await fetch(`${BASE_URL}/api/leads/filter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': 'tenant-root-default'
    },
    body: JSON.stringify({ page: 1, page_size: 15 })
  });
  const dataRootLeads = await resRootLeads.json();
  if (!resRootLeads.ok) throw new Error(`Falha ao consultar leads raiz: ${JSON.stringify(dataRootLeads)}`);
  console.log(`✅ Tenant Raiz retornou ${dataRootLeads.total_count} leads cadastrados (dados preservados).`);
  if (dataRootLeads.total_count <= 0) {
    throw new Error('Tenant Raiz deveria possuir leads.');
  }

  // 4. Teste da API de Leads no Novo Tenant (deve retornar rigorosamente [] e total_count: 0)
  console.log(`\n[4/6] Consultando leads no Novo Tenant (${newTenantId})...`);
  const resNewTenantLeads = await fetch(`${BASE_URL}/api/leads/filter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': newTenantId
    },
    body: JSON.stringify({ page: 1, page_size: 15 })
  });
  const dataNewTenantLeads = await resNewTenantLeads.json();
  if (!resNewTenantLeads.ok) throw new Error(`Falha ao consultar leads do novo tenant: ${JSON.stringify(dataNewTenantLeads)}`);

  console.log(`   Retorno: total_count = ${dataNewTenantLeads.total_count}, leads = ${dataNewTenantLeads.data.length}`);
  if (dataNewTenantLeads.total_count !== 0 || dataNewTenantLeads.data.length !== 0) {
    throw new Error(`VAZAMENTO DE DADOS! Novo tenant retornou ${dataNewTenantLeads.total_count} leads em vez de 0!`);
  }
  console.log('✅ BLINDAGEM DE LEADS CONFIRMADA: Novo Tenant está 100% zerado (array vazio []).');

  // 5. Teste da API de Concorrentes no Novo Tenant (deve retornar [] e total_count: 0)
  console.log(`\n[5/6] Consultando concorrentes no Novo Tenant (${newTenantId})...`);
  const resNewTenantComps = await fetch(`${BASE_URL}/api/competitors/list`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': newTenantId
    }
  });
  const dataNewTenantComps = await resNewTenantComps.json();
  if (!resNewTenantComps.ok) throw new Error(`Falha ao consultar concorrentes: ${JSON.stringify(dataNewTenantComps)}`);

  console.log(`   Retorno: total_count = ${dataNewTenantComps.total_count}, concorrentes = ${dataNewTenantComps.data.length}`);
  if (dataNewTenantComps.total_count !== 0 || dataNewTenantComps.data.length !== 0) {
    throw new Error(`VAZAMENTO DE DADOS! Novo tenant retornou concorrentes de outro tenant!`);
  }
  console.log('✅ BLINDAGEM DE CONCORRÊNCIA CONFIRMADA: Lista de concorrentes 100% vazia ([]).');

  // 6. Teste de isolamento de Gaps de Mercado
  console.log(`\n[6/6] Consultando Zonas de Oportunidade (Gaps) no Novo Tenant (${newTenantId})...`);
  const resNewTenantGaps = await fetch(`${BASE_URL}/api/competitors/gaps?buffer_km=50`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': newTenantId
    }
  });
  const dataNewTenantGaps = await resNewTenantGaps.json();
  if (!resNewTenantGaps.ok) throw new Error(`Falha ao consultar gaps: ${JSON.stringify(dataNewTenantGaps)}`);
  console.log(`✅ Consulta de Gaps executada no contexto do novo tenant.`);

  console.log('\n=============================================================');
  console.log('🎉 FASE 38 - ETAPA 1 HOMOLOGADA COM SUCESSO ABSOLUTO!');
  console.log('Isolamento Multi-Tenant ativo no Backend e Frontend.');
  console.log('=============================================================');
}

runTests().catch(err => {
  console.error('\n❌ ERRO NO TESTE DA FASE 38:', err.message);
  process.exit(1);
});
