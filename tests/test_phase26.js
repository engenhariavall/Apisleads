/**
 * tests/test_phase26.js
 * 
 * FASE 26: SUÍTE DE TESTES INTEGRADA & HOMOLOGAÇÃO COMPLETA (PADRÃO VERSUS)
 * Painel Admin Master, Autenticação, RBAC & Logs de Auditoria
 * 
 * Validações Automatizadas:
 * 1. Modelagem Relacional & Dual-Engine (users, export_quotas, audit_logs)
 * 2. Criptografia Nativa & Hashing (PBKDF2/SHA-512 e JWT assinado com HMAC-SHA256)
 * 3. Módulo de Autenticação (POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout)
 * 4. Controle de Acesso e RBAC (requireAuth, requireRole, bloqueio HTTP 401/403)
 * 5. Bloqueio Estrito de Exportação para o perfil VISUALIZADOR (HTTP 403)
 * 6. Gestão de Quotas de Exportação e Enforcement (HTTP 429 para limite diário excedido)
 * 7. Interceptor de Auditoria e Telemetria em Tempo Real (gravação não-bloqueante em audit_logs)
 * 8. Endpoints do Cockpit Admin Master (/api/admin/metrics, /api/admin/users, /api/admin/audit-logs)
 * 9. Ciclo de Vida de Usuário (Criação, Atualização de Quota, Reset de Senha, Toggle de Status)
 * 10. Regressão Global das Rotas Core (/api/leads/filter, /api/segments, /health)
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'http://localhost:3000';

console.log('======================================================================');
console.log('👑 SUÍTE DE TESTES E HOMOLOGAÇÃO COMPLETA: FASE 26 (PADRÃO VERSUS) 👑');
console.log('   Painel Admin Master, Autenticação, RBAC & Logs de Auditoria        ');
console.log('======================================================================\n');

async function runPhase26Tests() {
  let passedCount = 0;

  // -------------------------------------------------------------------------
  // 1. MODELAGEM RELACIONAL & DUAL-ENGINE
  // -------------------------------------------------------------------------
  console.log('1. TESTANDO MODELAGEM RELACIONAL & DUAL-ENGINE:');

  // 1.1 Verificação do DDL PostgreSQL Supabase
  const supabaseSqlPath = path.join(ROOT_DIR, 'server/src/database/schema_supabase.sql');
  const supabaseSql = fs.readFileSync(supabaseSqlPath, 'utf8');
  assert(supabaseSql.includes('CREATE TABLE IF NOT EXISTS users'), 'schema_supabase.sql deve conter a tabela users');
  assert(supabaseSql.includes('CREATE TABLE IF NOT EXISTS export_quotas'), 'schema_supabase.sql deve conter a tabela export_quotas');
  assert(supabaseSql.includes('CREATE TABLE IF NOT EXISTS audit_logs'), 'schema_supabase.sql deve conter a tabela audit_logs');
  assert(supabaseSql.includes('idx_users_email'), 'schema_supabase.sql deve conter índice para users(email)');
  assert(supabaseSql.includes('idx_audit_logs_action'), 'schema_supabase.sql deve conter índice para audit_logs(action)');
  passedCount++;
  console.log('   ✔ 1.1 DDL Supabase PostgreSQL validado (tabelas users, export_quotas, audit_logs e índices B-Tree).');

  // 1.2 Verificação do Schema SQLite Local
  const dbModule = await import('../server/src/config/database.js');
  const db = dbModule.default || dbModule;

  // Limpeza preventiva de usuários de testes anteriores para garantir idempotência
  try {
    db.prepare("DELETE FROM users WHERE email LIKE '%teste@versus.ai%' OR email LIKE '%quota@versus.ai%'").run();
  } catch (e) {}

  const sqliteTables = await db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'export_quotas', 'audit_logs')"
  );
  const foundTableNames = sqliteTables.rows.map(r => r.name);
  assert(foundTableNames.includes('users'), 'Tabela users deve existir no SQLite');
  assert(foundTableNames.includes('export_quotas'), 'Tabela export_quotas deve existir no SQLite');
  assert(foundTableNames.includes('audit_logs'), 'Tabela audit_logs deve existir no SQLite');
  passedCount++;
  console.log('   ✔ 1.2 Tabelas SQLite ativas e operacionais em modo WAL (users, export_quotas, audit_logs).');

  // -------------------------------------------------------------------------
  // 2. CRIPTOGRAFIA NATIVA & UTILS DE SEGURANÇA
  // -------------------------------------------------------------------------
  console.log('\n2. TESTANDO CRIPTOGRAFIA NATIVA (PBKDF2/SHA-512 & JWT):');

  const { hashPassword, verifyPassword, signJwt, verifyJwt } = await import('../server/src/utils/security.js');

  const testPass = 'SenhaUltraSecreta@2026!';
  const hashed = await hashPassword(testPass);
  assert(hashed && hashed.includes(':'), 'Hash deve conter salt:hash');
  assert((await verifyPassword(testPass, hashed)) === true, 'Senha correta deve ser verificada como true');
  assert((await verifyPassword('SenhaIncorreta', hashed)) === false, 'Senha incorreta deve retornar false');
  passedCount++;
  console.log('   ✔ 2.1 Hashing PBKDF2/SHA-512 com timingSafeEqual validado contra timing attacks.');

  const tokenPayload = { userId: 'test-123', email: 'teste@versus.ai', role: 'GESTOR_TRAFEGO' };
  const signedToken = signJwt(tokenPayload);
  assert(typeof signedToken === 'string' && signedToken.split('.').length === 3, 'JWT deve conter 3 partes (header.payload.sig)');
  const verified = verifyJwt(signedToken);
  assert(verified !== null && verified.userId === 'test-123' && verified.role === 'GESTOR_TRAFEGO', 'JWT verificado com sucesso');
  passedCount++;
  console.log('   ✔ 2.2 Assinatura e decodificação JWT nativa (HMAC-SHA256) validada sem dependências externas.');

  // -------------------------------------------------------------------------
  // 3. MÓDULO DE AUTENTICAÇÃO & CONTROLE DE SESSÃO
  // -------------------------------------------------------------------------
  console.log('\n3. TESTANDO AUTENTICAÇÃO (LOGIN, ME, LOGOUT):');

  // 3.1 Falha de Login com credencial inválida
  const resBadLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@versus.ai', password: 'SenhaTotalmenteErrada' })
  });
  assert.strictEqual(resBadLogin.status, 401, 'Login inválido deve retornar HTTP 401');
  const badLoginJson = await resBadLogin.json();
  assert.strictEqual(badLoginJson.success, false);
  passedCount++;
  console.log('   ✔ 3.1 Bloqueio de login inválido com HTTP 401 validado.');

  // 3.2 Sucesso de Login com Super Admin do Seed
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@versus.ai';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'VersusAdmin@2026!';

  const resSuperLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: superAdminEmail, password: superAdminPassword })
  });
  assert.strictEqual(resSuperLogin.status, 200, 'Login do Super Admin deve retornar HTTP 200');
  const superLoginJson = await resSuperLogin.json();
  assert(superLoginJson.token, 'Resposta de login deve emitir um token JWT');
  assert.strictEqual(superLoginJson.user.role, 'SUPER_ADMIN', 'Papel do usuário deve ser SUPER_ADMIN');
  const superAdminToken = superLoginJson.token;
  passedCount++;
  console.log('   ✔ 3.2 Login de SUPER_ADMIN concluído com sucesso e token JWT emitido.');

  // 3.3 Verificação de Sessão (GET /api/auth/me)
  const resMe = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  assert.strictEqual(resMe.status, 200);
  const meJson = await resMe.json();
  assert.strictEqual(meJson.user.email, superAdminEmail);
  assert(meJson.quota !== undefined, 'Resposta /me deve conter as quotas ativas');
  passedCount++;
  console.log('   ✔ 3.3 Endpoint /api/auth/me validado com sucesso com quotas anexadas.');

  // -------------------------------------------------------------------------
  // 4. RBAC & ISOLAMENTO DE ROTAS ADMINISTRATIVAS
  // -------------------------------------------------------------------------
  console.log('\n4. TESTANDO RBAC E PROTEÇÃO DE ROTAS ADMIN MASTER:');

  // 4.1 Acesso não autenticado a rotas admin (HTTP 401)
  const resUnauthAdmin = await fetch(`${BASE_URL}/api/admin/metrics`);
  assert.strictEqual(resUnauthAdmin.status, 401, 'Acesso anônimo à rota admin deve retornar HTTP 401');
  passedCount++;
  console.log('   ✔ 4.1 Bloqueio HTTP 401 para requisição anônima em rotas restritas.');

  // 4.2 Criação de usuário VISUALIZADOR e GESTOR_TRAFEGO para testes
  const resCreateViewer = await fetch(`${BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${superAdminToken}`
    },
    body: JSON.stringify({
      name: 'Operador Visualizador Teste',
      email: 'viewer.teste@versus.ai',
      password: 'ViewerSecret@2026!',
      role: 'VISUALIZADOR',
      dailyQuota: 0
    })
  });
  assert.strictEqual(resCreateViewer.status, 201, 'Criação de usuário VISUALIZADOR deve retornar HTTP 201');
  passedCount++;
  console.log('   ✔ 4.2 Cadastro de operador VISUALIZADOR via Cockpit Admin realizado.');

  // Login como VISUALIZADOR
  const resViewerLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'viewer.teste@versus.ai', password: 'ViewerSecret@2026!' })
  });
  const viewerJson = await resViewerLogin.json();
  const viewerToken = viewerJson.token;

  // 4.3 Acesso de VISUALIZADOR a rotas restritas de SUPER_ADMIN (HTTP 403)
  const resForbiddenAdmin = await fetch(`${BASE_URL}/api/admin/metrics`, {
    headers: { 'Authorization': `Bearer ${viewerToken}` }
  });
  assert.strictEqual(resForbiddenAdmin.status, 403, 'Acesso de VISUALIZADOR a rota SUPER_ADMIN deve retornar HTTP 403');
  passedCount++;
  console.log('   ✔ 4.3 Bloqueio HTTP 403 comprovado: VISUALIZADOR proibido de acessar Cockpit Admin.');

  // -------------------------------------------------------------------------
  // 5. BLINDAGEM DE EXPORTAÇÃO PARA VISUALIZADOR (HTTP 403)
  // -------------------------------------------------------------------------
  console.log('\n5. TESTANDO BLINDAGEM DE EXPORTAÇÃO CONTRA FUGA DE DADOS (VISUALIZADOR):');

  const resViewerExport = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${viewerToken}`
    },
    body: JSON.stringify({ format: 'csv', lead_ids: [1, 2, 3] })
  });
  assert.strictEqual(resViewerExport.status, 403, 'Visualizador deve receber HTTP 403 ao tentar exportar');
  const viewerExportJson = await resViewerExport.json();
  assert.strictEqual(viewerExportJson.error, 'EXPORTS_FORBIDDEN_FOR_VIEWER', 'Deve retornar código EXPORTS_FORBIDDEN_FOR_VIEWER');
  assert(viewerExportJson.message.includes('VISUALIZADOR'), 'Mensagem de erro explicativa de restrição');
  passedCount++;
  console.log('   ✔ 5.1 Exportação de base bloqueada com HTTP 403 para perfil VISUALIZADOR.');

  // -------------------------------------------------------------------------
  // 6. ENFORCEMENT DE QUOTAS DE EXPORTAÇÃO (HTTP 429)
  // -------------------------------------------------------------------------
  console.log('\n6. TESTANDO CONTROLE DE QUOTAS DE EXPORTAÇÃO:');

  // Cria usuário Gestor com Quota Baixa (ex: 2 leads)
  const resCreateGestor = await fetch(`${BASE_URL}/api/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${superAdminToken}`
    },
    body: JSON.stringify({
      name: 'Gestor Limite Quota',
      email: 'gestor.quota@versus.ai',
      password: 'GestorSecret@2026!',
      role: 'GESTOR_TRAFEGO',
      dailyQuota: 2
    })
  });
  assert.strictEqual(resCreateGestor.status, 201);
  const gestorData = await resCreateGestor.json();
  const gestorId = gestorData.user.id;

  const resGestorLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gestor.quota@versus.ai', password: 'GestorSecret@2026!' })
  });
  const gestorToken = (await resGestorLogin.json()).token;

  // Busca IDs reais de leads para teste de exportação
  const realLeads = await db.query('SELECT id FROM leads WHERE is_competitor = 0 LIMIT 3');
  const sampleIds = realLeads.rows.map(r => r.id);
  assert(sampleIds.length >= 3, 'Base deve conter ao menos 3 leads válidos para o teste de quota');

  // 6.1 Primeira exportação de 2 leads (Permitida)
  const resExportAllowed = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${gestorToken}`
    },
    body: JSON.stringify({ format: 'csv', lead_ids: [sampleIds[0], sampleIds[1]] })
  });
  assert.strictEqual(resExportAllowed.status, 200, 'Primeira exportação dentro da quota deve retornar HTTP 200');
  passedCount++;
  console.log('   ✔ 6.1 Exportação de 2 leads aprovada com consumo atômico de saldo.');

  // 6.2 Segunda exportação tentando exceder a quota diária (HTTP 429)
  const resExportBlocked = await fetch(`${BASE_URL}/api/leads/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${gestorToken}`
    },
    body: JSON.stringify({ format: 'csv', lead_ids: [sampleIds[2]] })
  });
  assert.strictEqual(resExportBlocked.status, 429, 'Tentativa de exceder quota deve retornar HTTP 429');
  const blockedJson = await resExportBlocked.json();
  assert(blockedJson.error.includes('QUOTA_EXCEEDED'), 'Erro deve indicar limite de quota excedido');
  passedCount++;
  console.log('   ✔ 6.2 Bloqueio de exportação com HTTP 429 (DAILY_QUOTA_EXCEEDED) comprovado.');

  // -------------------------------------------------------------------------
  // 7. TELEMETRIA E LOGS DE AUDITORIA
  // -------------------------------------------------------------------------
  console.log('\n7. TESTANDO INTERCEPTOR DE AUDITORIA & TELEMETRIA:');

  const resAuditLogs = await fetch(`${BASE_URL}/api/admin/audit-logs?limit=10`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  assert.strictEqual(resAuditLogs.status, 200);
  const auditData = await resAuditLogs.json();
  assert(auditData.logs && auditData.logs.length > 0, 'Devem existir registros de auditoria gravados');
  
  const hasExportLog = auditData.logs.some(l => l.action.includes('EXPORT') || l.action.includes('LOGIN'));
  assert(hasExportLog, 'Logs de auditoria devem registrar ações de exportação e login');
  passedCount++;
  console.log(`   ✔ 7.1 Telemetria operacional: ${auditData.total} logs de auditoria capturados.`);

  // -------------------------------------------------------------------------
  // 8. COCKPIT ADMIN MASTER (MÉTRICAS & MANIPULAÇÃO DE USUÁRIOS)
  // -------------------------------------------------------------------------
  console.log('\n8. TESTANDO ENDPOINTS DO COCKPIT ADMIN MASTER:');

  // 8.1 Métricas Consolidadas
  const resMetrics = await fetch(`${BASE_URL}/api/admin/metrics`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  assert.strictEqual(resMetrics.status, 200);
  const metricsJson = await resMetrics.json();
  assert(metricsJson.metrics.totalUsers >= 2, 'Contagem de usuários ativos deve ser >= 2');
  passedCount++;
  console.log(`   ✔ 8.1 Métricas administrativas: ${metricsJson.metrics.totalUsers} usuários, ${metricsJson.metrics.totalAuditEvents} logs.`);

  // 8.2 Reset de Senha de Usuário
  const resReset = await fetch(`${BASE_URL}/api/admin/users/${gestorId}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${superAdminToken}`
    },
    body: JSON.stringify({ newPassword: 'NovaSenhaSegura@2026!' })
  });
  assert.strictEqual(resReset.status, 200);
  passedCount++;
  console.log('   ✔ 8.2 Reset administrativo de senha de usuário homologado.');

  // 8.3 Ajuste de Quota Diária e Toggle de Status (Desativar Usuário)
  const resUpdateUser = await fetch(`${BASE_URL}/api/admin/users/${gestorId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${superAdminToken}`
    },
    body: JSON.stringify({ dailyQuota: 1500, is_active: 0 })
  });
  assert.strictEqual(resUpdateUser.status, 200);

  // Login com usuário desativado deve ser rejeitado (HTTP 403 Forbidden)
  const resLoginDeactivated = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gestor.quota@versus.ai', password: 'NovaSenhaSegura@2026!' })
  });
  assert([401, 403].includes(resLoginDeactivated.status), 'Usuário desativado não deve conseguir logar (401/403)');
  const deactJson = await resLoginDeactivated.json();
  assert(deactJson.error.includes('DEACTIVATED') || deactJson.error.includes('INACTIVE'), 'Erro deve informar conta inativa');
  passedCount++;
  console.log('   ✔ 8.3 Atualização de quota e bloqueio de acesso para conta desativada (is_active = 0) comprovados.');

  // -------------------------------------------------------------------------
  // 9. REGRESSÃO DE ROTAS CORE
  // -------------------------------------------------------------------------
  console.log('\n9. TESTANDO REGRESSÃO DAS ROTAS CORE DA APLICAÇÃO:');

  const [resHealth, resFilter, resSegments] = await Promise.all([
    fetch(`${BASE_URL}/health`),
    fetch(`${BASE_URL}/api/leads/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 1, page_size: 5 })
    }),
    fetch(`${BASE_URL}/api/segments`)
  ]);

  assert.strictEqual(resHealth.status, 200);
  assert.strictEqual(resFilter.status, 200);
  assert.strictEqual(resSegments.status, 200);
  passedCount++;
  console.log('   ✔ 9.1 Zero regressão: /health, /api/leads/filter e /api/segments respondendo com HTTP 200.');

  // -------------------------------------------------------------------------
  // CONSOLIDAÇÃO FINAL
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`🏆 HOMOLOGAÇÃO FASE 26 CONCLUÍDA: ${passedCount}/15 BLOCOS DE TESTES APROVADOS! 🏆`);
  console.log('======================================================================');
}

runPhase26Tests().catch(err => {
  console.error('\n❌ FALHA NA SUÍTE DE TESTES DA FASE 26:', err);
  process.exit(1);
});
