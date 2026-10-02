/**
 * tests/test_phase47_step2_cpf_qsa_enrichment.js
 * 
 * Bateria de Testes: FASE 47 - ETAPA 2 (ENRIQUECIMENTO DE CPF E MATCH SOCIETÁRIO)
 * Valida:
 * 1. O Salto Societário (QSA Match): findCompanyByCpf encontra CNPJ e contatos atrelados ao titular PF
 * 2. Triangulação OSINT de Pessoa Física: enrichDecisorReal com fallback [Nome] + [Município] + [Estado]
 * 3. Otimização de Payload para Meta Ads: exportRuralGeofencing com madid_clean e meta_custom_audience_doc sem pontuação
 * 4. Endpoint REST POST /api/fundiario/enrich-osint respondendo com telefone WhatsApp E.164 e persistindo
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../server/src/config/database.js';
import { osintService } from '../server/src/services/osintService.js';
import { scraperService } from '../server/src/services/scraperService.js';
import { saveOrUpdateRuralProperty, getRuralGeoJson } from '../server/src/services/geoFundiarioService.js';
import { exportRuralGeofencing } from '../server/src/controllers/geofencingExportController.js';
import { enrichRuralOsintHandler } from '../server/src/controllers/geoFundiarioController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🚀 Iniciando Bateria de Testes da Fase 47 - Etapa 2 (Salto Societário e Triangulação de CPF)...');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

// ------------------------------------------------------------------------------
// Setup de Dados de Teste no Banco de Dados SQLite
// ------------------------------------------------------------------------------
const testTenant = 'tenant-test-phase47-step2';
const now = new Date().toISOString();

db.prepare(`
  INSERT OR IGNORE INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit)
  VALUES (?, 'Tenant Teste Fase 47', '99.888.777/0001-99', 'ENTERPRISE', 'ACTIVE', 10, 1000, 10000)
`).run(testTenant);

// Cria lead corporativo e vincula sócio PF
const testLeadId = 'lead_agro_teste_47';
const testCnpj = '98.765.432/0001-99';
const testCnpjRaw = '98765432000199';
const testSocioCpf = '812.345.678-90';
const testSocioNome = 'ANTÔNIO MARCOS DA COSTA SILVA';
const testTelefone = '(66) 99654-3210';
const testTelefoneSanitized = '66996543210';

db.prepare(`DELETE FROM leads WHERE cnpj_raw = ? OR id = ?`).run(testCnpjRaw, testLeadId);
db.prepare(`DELETE FROM leads_socios WHERE lead_cnpj = ?`).run(testCnpjRaw);

db.prepare(`
  INSERT INTO leads (
    id, cnpj, cnpj_raw, razao_social, nome_fantasia, cnae_principal_codigo, cnae_principal_descricao,
    porte, capital_social, municipio, uf, telefone, telefone_sanitized, email, tenant_id, created_at
  ) VALUES (
    ?, ?, ?, ?, ?, '0111-3/01', 'Cultivo de soja',
    'DEMAIS', 15000000.0, 'SORRISO', 'MT', ?, ?, 'contato@agrocostasilva.com.br', ?, ?
  )
`).run(
  testLeadId, testCnpj, testCnpjRaw, 'Agropecuária Costa Silva & Filhos Ltda',
  'Fazenda Boa Safra', testTelefone, testTelefoneSanitized, testTenant, now
);

db.prepare(`
  INSERT INTO leads_socios (
    id, lead_cnpj, nome, qualificacao, telefone_presumido, email_presumido, created_at, updated_at
  ) VALUES (
    'soc_teste_47', ?, ?, 'Sócio-Administrador', ?, 'antonio.silva@agrocostasilva.com.br', ?, ?
  )
`).run(
  testCnpjRaw, testSocioNome, testTelefoneSanitized, now, now
);

// ------------------------------------------------------------------------------
// 1. O Salto Societário (findCompanyByCpf)
// ------------------------------------------------------------------------------
console.log('\n--- 1. O Salto Societário (findCompanyByCpf) ---');

it('osintService possui o método findCompanyByCpf implementado', () => {
  assert.strictEqual(typeof osintService.findCompanyByCpf, 'function');
});

it('findCompanyByCpf localiza empresa a partir do nome do titular PF', () => {
  const match = osintService.findCompanyByCpf(testSocioCpf, testTenant, testSocioNome);
  assert.ok(match, 'Empresa não encontrada via salto societário');
  assert.strictEqual(match.razao_social, 'Agropecuária Costa Silva & Filhos Ltda');
  assert.ok(match.whatsapp_validado.includes('5566996543210'), `WhatsApp deve conter número E.164 (+55...): ${match.whatsapp_validado}`);
  assert.strictEqual(match.origem, 'QSA_MATCH_SALTO_SOCIETARIO');
});

it('findCompanyByCpf retorna nulo de forma resiliente para documentos sem vínculo', () => {
  const match = osintService.findCompanyByCpf('000.000.000-00', testTenant, 'Nenhum Dono Cadastrado Inexistente');
  assert.strictEqual(match, null);
});

// ------------------------------------------------------------------------------
// 2. Triangulação OSINT de Pessoa Física (enrichDecisorReal com fallback geográfico)
// ------------------------------------------------------------------------------
console.log('\n--- 2. Triangulação OSINT de Pessoa Física ---');

await itAsync('enrichDecisorReal suporta [Nome] + [Município] + [Estado] na ausência de CNPJ corporativo', async () => {
  const res = await scraperService.enrichDecisor({
    nome: 'Valdir Antonio Della Libera',
    empresa: 'Fazenda Teles Pires',
    municipio: 'Sorriso',
    uf: 'MT'
  });

  assert.ok(res, 'Resposta do enrichDecisor não retornou objeto');
  assert.strictEqual(res.nome, 'Valdir Antonio Della Libera');
  assert.strictEqual(res.municipio, 'Sorriso');
  assert.strictEqual(res.uf, 'MT');
});

// ------------------------------------------------------------------------------
// 3. Otimização de Payload para Meta Ads (exportRuralGeofencing)
// ------------------------------------------------------------------------------
console.log('\n--- 3. Otimização de Payload para Meta Ads (CSV) ---');

await itAsync('exportRuralGeofencing gera CSV com cabeçalhos madid_clean e meta_custom_audience_doc sem pontuação', async () => {
  // Cria propriedade com CPF
  await saveOrUpdateRuralProperty({
    id_sigef: 'SIGEF-TESTE-47-CPF',
    codigo_imovel: 'MT-4700-001',
    nome_imovel: 'Estância Alvorada do Sul',
    municipio: 'SORRISO',
    uf: 'MT',
    area_hectares: 2400,
    geometria_poligono: {
      type: 'Polygon',
      coordinates: [[
        [-55.70, -12.50],
        [-55.68, -12.50],
        [-55.68, -12.52],
        [-55.70, -12.52],
        [-55.70, -12.50]
      ]]
    },
    nome_titular: testSocioNome,
    cpf_cnpj_titular: testSocioCpf,
    status_geo: 'CERTIFICADO'
  }, testTenant);

  let responseData = '';
  let responseHeaders = {};
  const mockReq = {
    method: 'GET',
    query: { uf: 'MT', municipio: 'SORRISO', format: 'csv' },
    user: { tenant_id: testTenant }
  };
  const mockRes = {
    status(code) { return this; },
    setHeader(key, val) { responseHeaders[key] = val; },
    send(content) { responseData = content; return this; }
  };

  await exportRuralGeofencing(mockReq, mockRes);

  assert.ok(responseData.includes('madid_clean'), 'Cabeçalho madid_clean ausente no CSV');
  assert.ok(responseData.includes('meta_custom_audience_doc'), 'Cabeçalho meta_custom_audience_doc ausente no CSV');
  
  // Confirma que o CPF foi exportado limpo (somente dígitos 81234567890)
  const cleanDoc = testSocioCpf.replace(/\D/g, '');
  assert.ok(responseData.includes(`"${cleanDoc}"`), `Documento limpo ${cleanDoc} deve estar presente no CSV`);
});

// ------------------------------------------------------------------------------
// 4. Endpoint REST POST /api/fundiario/enrich-osint e Sincronia de Drawer
// ------------------------------------------------------------------------------
console.log('\n--- 4. Endpoint REST POST /api/fundiario/enrich-osint ---');

await itAsync('POST /api/fundiario/enrich-osint cruza CPF -> Empresa -> WhatsApp E.164 com sucesso', async () => {
  let jsonResult = null;
  const mockReq = {
    body: {
      cpf_cnpj_titular: testSocioCpf,
      nome_titular: testSocioNome,
      municipio: 'SORRISO',
      uf: 'MT',
      nome_imovel: 'Fazenda Boa Safra'
    },
    user: { tenant_id: testTenant }
  };
  const mockRes = {
    status(code) { return this; },
    json(data) { jsonResult = data; return this; }
  };

  await enrichRuralOsintHandler(mockReq, mockRes);

  assert.ok(jsonResult, 'Resposta JSON do endpoint enrichRuralOsintHandler vazia');
  assert.strictEqual(jsonResult.success, true);
  assert.ok(jsonResult.whatsapp_validado, 'whatsapp_validado não preenchido');
  assert.ok(jsonResult.whatsapp_validado.startsWith('+55'), `WhatsApp deve começar com +55: ${jsonResult.whatsapp_validado}`);
  assert.strictEqual(jsonResult.company_matched, 'Agropecuária Costa Silva & Filhos Ltda');
});

console.log(`\n====================================================`);
console.log(`🏁 Resultados: ${passed} passaram | ${failed} falharam`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
