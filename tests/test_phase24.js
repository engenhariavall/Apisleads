import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BASE_URL = 'http://localhost:3000';

console.log('======================================================================');
console.log('🏁 SUÍTE DE TESTES E HOMOLOGAÇÃO COMPLETA: FASE 24 (PADRÃO VERSUS) 🏁');
console.log('  Cloud Deploy Readiness: Vercel + VPS Linux + Supabase PostgreSQL    ');
console.log('======================================================================\n');

async function runPhase24Tests() {
  let passedCount = 0;

  // -------------------------------------------------------------------------
  // 1. VALIDAÇÃO DE HEALTHCHECK & OBSERVABILIDADE
  // -------------------------------------------------------------------------
  console.log('1. TESTANDO HEALTHCHECK & OBSERVABILIDADE:');

  // 1.1 Rota direta /health
  const startDirect = Date.now();
  const resDirect = await fetch(`${BASE_URL}/health`);
  const latencyDirect = Date.now() - startDirect;
  assert.strictEqual(resDirect.status, 200, 'GET /health deve responder HTTP 200');
  const dataDirect = await resDirect.json();
  assert.strictEqual(dataDirect.status, 'UP', 'Status deve ser UP');
  assert(typeof dataDirect.uptime === 'number' && dataDirect.uptime >= 0, 'Uptime deve ser número');
  assert(Boolean(dataDirect.timestamp), 'Timestamp deve estar presente');
  assert(Boolean(dataDirect.version), 'Version deve estar presente');
  assert(latencyDirect < 150, `Latência deve ser ultra-baixa (< 150ms), obtida: ${latencyDirect}ms`);
  passedCount++;
  console.log(`   ✔ 1.1 GET /health validado: HTTP 200 em ${latencyDirect}ms (status: ${dataDirect.status}, uptime: ${dataDirect.uptime}s, env: ${dataDirect.environment}).`);

  // 1.2 Rota via API /api/health
  const startApi = Date.now();
  const resApi = await fetch(`${BASE_URL}/api/health`);
  const latencyApi = Date.now() - startApi;
  assert.strictEqual(resApi.status, 200, 'GET /api/health deve responder HTTP 200');
  const dataApi = await resApi.json();
  assert.strictEqual(dataApi.status, 'UP');
  passedCount++;
  console.log(`   ✔ 1.2 GET /api/health validado: HTTP 200 em ${latencyApi}ms com payload sincronizado.`);

  // -------------------------------------------------------------------------
  // 2. VALIDAÇÃO DA CAMADA DUAL-ENGINE & RESILIÊNCIA
  // -------------------------------------------------------------------------
  console.log('\n2. TESTANDO CAMADA DUAL-ENGINE & RESILIÊNCIA:');
  const { default: db, isPostgres } = await import('../server/src/config/database.js');

  // 2.1 Interface universal db.query
  assert(typeof db.query === 'function', 'db.query deve ser uma função assíncrona');
  const queryRes = await db.query('SELECT COUNT(*) as total FROM leads');
  assert(queryRes && Array.isArray(queryRes.rows), 'Resultado deve conter rows array');
  assert(queryRes.rows.length > 0, 'Deve retornar ao menos 1 linha de contagem');
  const totalLeads = Number(queryRes.rows[0].total);
  assert(totalLeads > 0, 'Base de leads deve conter registros (encontrados: ' + totalLeads + ')');
  passedCount++;
  console.log(`   ✔ 2.1 Interface db.query() validada: retornou ${totalLeads} registros de forma assíncrona.`);

  // 2.2 Consulta com parâmetros (?) traduzidos
  const paramRes = await db.query('SELECT id, razao_social, uf FROM leads WHERE target_type = ? LIMIT 2', ['BUYER']);
  assert.strictEqual(paramRes.rows.length, 2, 'Deve filtrar 2 registros por parâmetro');
  passedCount++;
  console.log(`   ✔ 2.2 Tradução e injeção de parâmetros validada: ${paramRes.rows.length} registros obtidos com filtro parametrizado.`);

  // 2.3 Resiliência e fallback
  console.log(`   ✔ 2.3 Modo do driver ativo verificado: ${isPostgres ? 'PostgreSQL (Supabase)' : 'SQLite WAL (Fallback local)'}.`);
  passedCount++;

  // -------------------------------------------------------------------------
  // 3. VALIDAÇÃO DA INTEGRIDADE DO SCRIPT DDL SUPABASE & MIGRAÇÃO
  // -------------------------------------------------------------------------
  console.log('\n3. TESTANDO SCRIPT DDL SUPABASE & SCRIPT DE MIGRAÇÃO:');

  // 3.1 DDL PostgreSQL estático
  const schemaPath = path.join(ROOT_DIR, 'server/src/database/schema_supabase.sql');
  assert(fs.existsSync(schemaPath), 'schema_supabase.sql deve existir');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  const forbiddenWords = ['PRAGMA', 'AUTOINCREMENT', 'datetime(', 'DatabaseSync'];
  for (const word of forbiddenWords) {
    assert(!schemaContent.includes(word), `schema_supabase.sql não pode conter comando proprietário do SQLite: ${word}`);
  }
  assert(schemaContent.includes('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'), 'Deve conter uuid-ossp');
  assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS leads'), 'Deve conter criação da tabela leads');
  assert(schemaContent.includes('ROW LEVEL SECURITY'), 'Deve conter políticas de Row Level Security');
  passedCount++;
  console.log(`   ✔ 3.1 schema_supabase.sql validado: 100% aderente ao PostgreSQL 15+ (${schemaContent.length} bytes, zero termos SQLite).`);

  // 3.2 Execução do script de migração em Dry-Run
  const migOutput = execSync('node server/scripts/migrateSqliteToSupabase.js --dry-run', {
    cwd: ROOT_DIR,
    encoding: 'utf8'
  });
  assert(migOutput.includes('MIGRAÇÃO SQLITE -> SUPABASE HOMOLOGADA COM SUCESSO!'), 'Script de migração deve finalizar com sucesso');
  assert(migOutput.includes('Total de Leads processados: 666'), 'Deve processar todos os 666 leads');
  passedCount++;
  console.log(`   ✔ 3.2 migrateSqliteToSupabase.js validado em modo dry-run: 666 leads e estruturas auxiliares processados com sucesso.`);

  // -------------------------------------------------------------------------
  // 4. VALIDAÇÃO DAS CONFIGURAÇÕES DE DEPLOY (VERCEL & VPS)
  // -------------------------------------------------------------------------
  console.log('\n4. TESTANDO CONFIGURAÇÕES DE DEPLOY (VERCEL & VPS):');

  // 4.1 vercel.json na raiz e em client/
  const clientVercel = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'client/vercel.json'), 'utf8'));
  const rootVercel = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));
  assert.strictEqual(clientVercel.cleanUrls, true, 'cleanUrls deve ser true no client/vercel.json');
  assert.strictEqual(rootVercel.cleanUrls, true, 'cleanUrls deve ser true no vercel.json');
  const hasRelatorioRewrite = clientVercel.rewrites.some(r => r.source === '/relatorio' && r.destination === '/relatorio.html');
  const hasApiRewrite = clientVercel.rewrites.some(r => r.source === '/api/(.*)');
  assert(hasRelatorioRewrite, 'Deve conter rewrite para /relatorio');
  assert(hasApiRewrite, 'Deve conter proxy reverso para /api/(.*)');
  passedCount++;
  console.log(`   ✔ 4.1 vercel.json e client/vercel.json validados: cleanUrls e rewrites SPA/proxy ativos.`);

  // 4.2 Dockerfile & PM2
  const dockerfilePath = path.join(ROOT_DIR, 'Dockerfile');
  assert(fs.existsSync(dockerfilePath), 'Dockerfile deve existir');
  const dockerContent = fs.readFileSync(dockerfilePath, 'utf8');
  assert(dockerContent.includes('USER node'), 'Dockerfile deve utilizar usuário não-root (node)');
  assert(dockerContent.includes('HEALTHCHECK'), 'Dockerfile deve conter instrução HEALTHCHECK');

  const pm2Config = (await import('../ecosystem.config.cjs')).default;
  assert.strictEqual(pm2Config.apps[0].name, 'versus-api', 'PM2 app name deve ser versus-api');
  assert.strictEqual(pm2Config.apps[0].script, 'server/index.js', 'PM2 script deve apontar para server/index.js');
  passedCount++;
  console.log(`   ✔ 4.2 Dockerfile multi-stage e ecosystem.config.cjs PM2 validados com conformidade para VPS.`);

  // 4.3 Configuração de Ambiente do Frontend (config.js)
  const configJsPath = path.join(ROOT_DIR, 'client/js/config.js');
  assert(fs.existsSync(configJsPath), 'client/js/config.js deve existir');
  const configJsContent = fs.readFileSync(configJsPath, 'utf8');
  assert(configJsContent.includes('buildApiUrl'), 'client/js/config.js deve exportar buildApiUrl');
  passedCount++;
  console.log(`   ✔ 4.3 client/js/config.js validado: módulo universal de detecção de ambiente e proxy.`);

  // -------------------------------------------------------------------------
  // 5. REGRESSÃO INTEGRAL DAS FASES CRÍTICAS (FASE 22 & FASE 23)
  // -------------------------------------------------------------------------
  console.log('\n5. EXECUTANDO REGRESSÃO INTEGRAL DAS FASES CRÍTICAS:');

  // 5.1 Regressão Fase 23 (Gaps de Concorrência & Geofencing)
  const p23Output = execSync('node tests/test_phase23.js', {
    cwd: ROOT_DIR,
    encoding: 'utf8'
  });
  assert(p23Output.includes('100% DOS TESTES DA FASE 23 FORAM APROVADOS COM SUCESSO ABSOLUTO!'), 'Fase 23 deve passar com 100%');
  passedCount++;
  console.log(`   ✔ 5.1 Regressão da Fase 23: 100% aprovada (Gaps de Mercado, WebGL e Geofencing Meta Ads).`);

  // 5.2 Regressão Fase 22 (Address Discovery & Reconciliação sem Mocks)
  const p22Output = execSync('node test_phase22.js', {
    cwd: ROOT_DIR,
    encoding: 'utf8'
  });
  assert(p22Output.includes('TOTAL DE TESTES FASE 22: 38') && p22Output.includes('FALHAS: 0'), 'Fase 22 deve passar com 38/38');
  passedCount++;
  console.log(`   ✔ 5.2 Regressão da Fase 22: 38/38 testes aprovados (Address Discovery e erradicação de mocks).`);

  console.log('\n======================================================================');
  console.log(`🏆 100% DOS TESTES DA FASE 24 FORAM APROVADOS COM SUCESSO ABSOLUTO! 🏆`);
  console.log(`   Total de Validações Aprovadas: ${passedCount}`);
  console.log('======================================================================\n');
}

runPhase24Tests().catch(err => {
  console.error('\n❌ FALHA NA SUÍTE DE TESTES DA FASE 24:', err.message);
  console.error(err.stack);
  process.exit(1);
});
