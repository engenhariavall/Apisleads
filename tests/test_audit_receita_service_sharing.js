import assert from 'assert';
import http from 'http';
import db from '../server/src/config/database.js';
import { receitaService, sanitizeCnpj, formatCnpj } from '../server/src/services/receitaService.js';
import { fetchOfficialCnpjData } from '../server/src/services/competitorIntelligenceService.js';
import { qsaService } from '../server/src/services/qsaService.js';
import { osintService } from '../server/src/services/osintService.js';
import { leadEnrichmentService } from '../server/src/services/leadEnrichmentService.js';
import app from '../server/src/app.js';

console.log('🧪 Iniciando Auditoria de Compartilhamento de Serviço (Receita Federal)...\n');

let passCount = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

async function runAudit() {
  const testCnpj = '08987654000132';

  // Popula registro de teste autêntico no banco para validação de integridade e cache
  db.prepare(`
    INSERT OR REPLACE INTO leads (
      id, cnpj, cnpj_raw, razao_social, nome_fantasia, cnae_principal_codigo, 
      cnae_principal_descricao, porte, capital_social, situacao_cadastral, 
      logradouro, numero, bairro, cep, municipio, uf, telefone, email, 
      origem, tenant_id, created_at, updated_at
    ) VALUES (
      'lead_audit_test_01', '08.987.654/0001-32', '08987654000132', 
      'AGROPECUARIA TERRA SANTA S/A', 'TERRA SANTA AGRO', '0111-3/01', 
      'Cultivo de soja', 'DEMAIS', 5000000.0, 'ATIVA', 
      'RODOVIA BR 163', 'KM 750', 'ZONA RURAL', '78890000', 'SORRISO', 'MT', 
      '(66) 3544-1234', 'contato@terrasanta.agr.br', 
      'RECEITA_FEDERAL', 'tenant-root-default', datetime('now'), datetime('now')
    )
  `).run();

  db.prepare(`
    INSERT OR REPLACE INTO leads_socios (
      id, lead_cnpj, nome, qualificacao, faixa_etaria, pais, created_at, updated_at
    ) VALUES (
      'soc_audit_01', '08987654000132', 'ANTONIO CARLOS SILVEIRA', 'Presidente', '51 a 60 anos', 'BRASIL', datetime('now'), datetime('now')
    )
  `).run();

  // 1. receitaService é o motor canônico unificado
  await test('1. receitaService.consultarCnpj normaliza, valida e consulta dados canônicos da Receita Federal', async () => {
    const res = await receitaService.consultarCnpj(testCnpj);
    assert.strictEqual(res.cnpj_raw, testCnpj);
    assert.strictEqual(res.razao_social, 'AGROPECUARIA TERRA SANTA S/A');
    assert.strictEqual(res.cnae_principal_codigo, '0111-3/01');
    assert.strictEqual(res.municipio, 'SORRISO');
    assert.strictEqual(res.uf, 'MT');
    assert.ok(Array.isArray(res.qsa), 'QSA deve ser array');
    assert.strictEqual(res.qsa.length, 1);
    assert.strictEqual(res.qsa[0].nome, 'ANTONIO CARLOS SILVEIRA');
  });

  // 2. Módulo de Inteligência Competitiva compartilha a mesma Fonte Única da Verdade
  await test('2. Módulo de Inteligência Competitiva (fetchOfficialCnpjData) delega para receitaService', async () => {
    const res = await fetchOfficialCnpjData(testCnpj);
    assert.ok(res, 'Deve retornar dados oficiais');
    assert.strictEqual(res.cnpj_raw || res.cnpj, testCnpj);
    assert.strictEqual(res.razao_social, 'AGROPECUARIA TERRA SANTA S/A');
    assert.strictEqual(res.municipio, 'SORRISO');
    assert.strictEqual(res.uf, 'MT');
  });

  // 3. Tabela Analítica & Módulo QSA compartilham a mesma Fonte Única da Verdade
  await test('3. Tabela Analítica / QSA (qsaService.enrichLeadQsa) delega para receitaService', async () => {
    const res = await qsaService.enrichLeadQsa(testCnpj);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.cnpj, testCnpj);
    assert.strictEqual(res.razao_social, 'AGROPECUARIA TERRA SANTA S/A');
    assert.strictEqual(res.total_socios, 1);
    assert.strictEqual(res.socios[0].nome, 'ANTONIO CARLOS SILVEIRA');
  });

  // 4. OSINT Service compartilha a mesma Fonte Única da Verdade
  await test('4. osintService.consultarReceitaFederal delega para receitaService', async () => {
    const res = await osintService.consultarReceitaFederal(testCnpj);
    assert.strictEqual(res.cnpj, testCnpj);
    assert.strictEqual(res.razao_social, 'AGROPECUARIA TERRA SANTA S/A');
    assert.strictEqual(res.situacao_cadastral, 'ATIVA');
    assert.strictEqual(res.qsa[0].nome, 'ANTONIO CARLOS SILVEIRA');
  });

  // 5. Motor de Enriquecimento em Cascata (leadEnrichmentService.js) compartilha a mesma Fonte Única da Verdade
  await test('5. leadEnrichmentService (Layer 3) consome receitaService na resolução de CNPJ', async () => {
    const waterfallResult = await leadEnrichmentService.enrichPropertyWaterfall({
      cpf_cnpj_titular: testCnpj,
      municipio: 'Sorriso',
      uf: 'MT'
    }, { forceRefresh: true });

    assert.strictEqual(waterfallResult.success, true);
    assert.strictEqual(waterfallResult.layer_resolved, 3);
    assert.strictEqual(waterfallResult.titular.cpf_cnpj_titular, testCnpj);
    assert.strictEqual(waterfallResult.titular.razao_social, 'AGROPECUARIA TERRA SANTA S/A');
    assert.strictEqual(waterfallResult.titular.tipo_pessoa, 'PJ');
  });

  // 6. Teste de Endpoint HTTP: Rota Direta da Receita (/api/receita/cnpj/:cnpj)
  await test('6. Rota HTTP GET /api/receita/cnpj/:cnpj responde com dados oficiais do serviço unificado', async () => {
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/receita/cnpj/${testCnpj}`, {
        headers: { 'x-tenant-id': 'tenant-root-default' }
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.razao_social, 'AGROPECUARIA TERRA SANTA S/A');
      assert.strictEqual(body.data.cnpj, testCnpj);
    } finally {
      server.close();
    }
  });

  // 7. Teste de Endpoint HTTP: Rota da Tabela Analítica (/api/leads/:cnpj/enrich-qsa)
  await test('7. Rota HTTP POST /api/leads/:cnpj/enrich-qsa aciona o serviço unificado da Receita Federal', async () => {
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/leads/${testCnpj}/enrich-qsa`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-root-default' 
        }
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.razao_social, 'AGROPECUARIA TERRA SANTA S/A');
      assert.strictEqual(body.cnpj, testCnpj);
    } finally {
      server.close();
    }
  });

  // 8. Teste de Endpoint HTTP: Rota do Módulo de Concorrentes (/api/competitors/lookup)
  await test('8. Rota HTTP POST /api/competitors/lookup aciona o serviço unificado da Receita Federal', async () => {
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/api/competitors/lookup`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-root-default' 
        },
        body: JSON.stringify({ cnpj: testCnpj })
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.razao_social, 'AGROPECUARIA TERRA SANTA S/A');
      assert.strictEqual(body.data.is_competitor, 1);
    } finally {
      server.close();
    }
  });

  console.log(`\n========================================`);
  console.log(`📊 Resultado Final da Auditoria: ${passCount}/${totalTests} testes aprovados.`);
  console.log(`========================================\n`);

  if (passCount !== totalTests) {
    process.exit(1);
  }
}

runAudit();
