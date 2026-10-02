/**
 * tests/test_audit_telemetry.js
 * 
 * Teste automatizado para validar o Motor de Telemetria Avançada do Backend (Fase 31):
 * 1. Parser regex de User-Agent (formatUserAgent).
 * 2. Migração de banco de dados (colunas status_code e latency_ms na tabela audit_logs).
 * 3. Disparo de requisições HTTP reais (login com falha 401 e login com sucesso 200).
 * 4. Validação do endpoint /api/admin/audit-logs retornando status_code, latency_ms e user_agent formatado.
 * 5. Remoção de dados mockados em client/js/admin.js.
 */

import fs from 'fs';
import db from '../server/src/config/database.js';
import { formatUserAgent } from '../server/src/middleware/auditAndQuotaMiddleware.js';

console.log('--- TESTANDO MOTOR DE TELEMETRIA AVANÇADA (BACKEND & FRONTEND) ---');

// 1. Teste unitário do formatUserAgent
console.log('\n[1/5] Testando Analisador de User-Agent (formatUserAgent)...');
const sampleUAs = [
  { raw: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', expected: 'Chrome / Windows 10' },
  { raw: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', expected: 'Safari / macOS' },
  { raw: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0', expected: 'Firefox / Linux' },
  { raw: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0', expected: 'Edge / Windows 10' },
  { raw: 'PostmanRuntime/7.32.3', expected: 'Postman / Outro' },
  { raw: 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)', expected: 'Node.js / Outro' }
];

for (const sample of sampleUAs) {
  const result = formatUserAgent(sample.raw);
  if (result !== sample.expected) {
    console.error(`❌ Falha no parser de UA para "${sample.raw}": obtido "${result}", esperado "${sample.expected}"`);
    process.exit(1);
  }
}
console.log('✔ Todos os padrões de User-Agent parseados com sucesso.');

// 2. Teste de Colunas no SQLite
console.log('\n[2/5] Verificando integridade das colunas na tabela audit_logs...');
const cols = db.prepare('PRAGMA table_info(audit_logs)').all();
const colNames = cols.map(c => c.name);

if (!colNames.includes('status_code')) {
  console.error('❌ Falha: Coluna status_code não existe na tabela audit_logs');
  process.exit(1);
}
if (!colNames.includes('latency_ms')) {
  console.error('❌ Falha: Coluna latency_ms não existe na tabela audit_logs');
  process.exit(1);
}
console.log('✔ Colunas status_code e latency_ms ativas na tabela audit_logs.');

// 3. Teste estático de ausência de mocks fixos no frontend
console.log('\n[3/5] Verificando erradicação de mocks no admin.js...');
const adminJs = fs.readFileSync('client/js/admin.js', 'utf-8');

if (adminJs.includes('200 OK / 145ms')) {
  console.error('❌ Falha: String estática "200 OK / 145ms" ainda encontrada no código do admin.js');
  process.exit(1);
}
if (!adminJs.includes('l.status_code') || !adminJs.includes('l.latency_ms')) {
  console.error('❌ Falha: admin.js não está utilizando as propriedades l.status_code e l.latency_ms');
  process.exit(1);
}
console.log('✔ admin.js atualizado para consumir dados dinâmicos da telemetria.');

// 4. Teste de Execução HTTP real contra a API Local
console.log('\n[4/5] Executando chamadas HTTP para registrar telemetria ao vivo...');
const BASE_URL = 'http://localhost:3000';

async function runLiveTelemetryTests() {
  try {
    // 4.1 Falha de Login simulada (deve gravar 401 com latência)
    const failedLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({ email: 'admin@versus.ai', password: 'senha_incorreta_teste_123' })
    });

    if (failedLoginRes.status !== 401) {
      console.error(`❌ Esperado status 401 no login falho, recebido: ${failedLoginRes.status}`);
      process.exit(1);
    }
    console.log('✔ Tentativa de login falho executada (HTTP 401 gravado).');

    // 4.2 Login com sucesso (deve gravar 200 com latência e emitir JWT)
    const successLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({ email: 'admin@versus.ai', password: 'VersusAdmin@2026!' })
    });

    if (!successLoginRes.ok) {
      console.error(`❌ Esperado status 200 no login, recebido: ${successLoginRes.status}`);
      process.exit(1);
    }
    const loginData = await successLoginRes.json();
    const token = loginData.token;
    console.log('✔ Login de Super Admin executado com sucesso (HTTP 200 gravado).');

    // 4.3 Consulta ao endpoint de auditoria
    console.log('\n[5/5] Consultando endpoint /api/admin/audit-logs com token JWT...');
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs?limit=10`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!auditRes.ok) {
      console.error(`❌ Falha ao consultar /api/admin/audit-logs: ${auditRes.status}`);
      process.exit(1);
    }

    const auditData = await auditRes.json();
    const logs = auditData.logs || [];
    if (logs.length === 0) {
      console.error('❌ Nenhum log retornado pelo endpoint');
      process.exit(1);
    }

    const latestLoginSuccess = logs.find(l => l.action === 'LOGIN_SUCCESS');
    const latestLoginFailed = logs.find(l => l.action === 'LOGIN_FAILED');

    console.log('✔ Amostra do último log gravado:', {
      action: logs[0].action,
      user_agent: logs[0].user_agent,
      status_code: logs[0].status_code,
      latency_ms: logs[0].latency_ms,
      endpoint: logs[0].endpoint
    });

    if (latestLoginSuccess) {
      if (latestLoginSuccess.status_code !== 200) {
        console.error('❌ LOGIN_SUCCESS não gravou status_code 200:', latestLoginSuccess.status_code);
        process.exit(1);
      }
      if (typeof latestLoginSuccess.latency_ms !== 'number' || latestLoginSuccess.latency_ms < 0) {
        console.error('❌ LOGIN_SUCCESS não possui latência numérica válida:', latestLoginSuccess.latency_ms);
        process.exit(1);
      }
      console.log(`✔ LOGIN_SUCCESS validado: status_code=${latestLoginSuccess.status_code}, latency_ms=${latestLoginSuccess.latency_ms}ms, ua="${latestLoginSuccess.user_agent}"`);
    }

    if (latestLoginFailed) {
      if (latestLoginFailed.status_code !== 401) {
        console.error('❌ LOGIN_FAILED não gravou status_code 401:', latestLoginFailed.status_code);
        process.exit(1);
      }
      console.log(`✔ LOGIN_FAILED validado: status_code=${latestLoginFailed.status_code}, latency_ms=${latestLoginFailed.latency_ms}ms, ua="${latestLoginFailed.user_agent}"`);
    }

    // 4.4 Testa Middleware de Auditoria Genérico (auditLogger) em LEADS_FILTER
    console.log('\n[6/6] Testando interceptor genérico auditLogger em /api/leads/filter...');
    const filterRes = await fetch(`${BASE_URL}/api/leads/filter?limit=2`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
      }
    });

    if (!filterRes.ok) {
      console.error(`❌ Falha em /api/leads/filter: ${filterRes.status}`);
      process.exit(1);
    }

    // Aguarda conclusão assíncrona do res.on('finish')
    await new Promise(r => setTimeout(r, 200));

    const filterAuditRes = await fetch(`${BASE_URL}/api/admin/audit-logs?limit=5&action=LEADS_FILTER`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const filterAuditData = await filterAuditRes.json();
    const filterLog = filterAuditData.logs && filterAuditData.logs[0];

    if (!filterLog || filterLog.action !== 'LEADS_FILTER') {
      console.error('❌ Log LEADS_FILTER não foi capturado pelo auditLogger');
      process.exit(1);
    }

    if (filterLog.status_code !== 200) {
      console.error('❌ LEADS_FILTER status_code incorreto:', filterLog.status_code);
      process.exit(1);
    }

    if (typeof filterLog.latency_ms !== 'number' || filterLog.latency_ms <= 0) {
      console.error('❌ LEADS_FILTER latência inválida:', filterLog.latency_ms);
      process.exit(1);
    }

    if (filterLog.user_agent !== 'Safari / macOS') {
      console.error('❌ LEADS_FILTER user_agent incorreto:', filterLog.user_agent);
      process.exit(1);
    }

    console.log(`✔ Middleware auditLogger validado: action=${filterLog.action}, status_code=${filterLog.status_code}, latency_ms=${filterLog.latency_ms}ms, ua="${filterLog.user_agent}"`);

    console.log('\n🎉 TODOS OS TESTES DO MOTOR DE TELEMETRIA AVANÇADA FORAM APROVADOS COM 100% DE SUCESSO! 🎉');
  } catch (err) {
    console.error('❌ Erro durante o teste ao vivo:', err);
    process.exit(1);
  }
}

runLiveTelemetryTests();
