import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../server/src/config/database.js';
import { createManualLead, queryLeads } from '../server/src/services/leadsService.js';
import { createManualLeadController } from '../server/src/controllers/leadsController.js';
import { exportLeads } from '../server/src/controllers/exportController.js';
import { transformToMetaAds, normalizeAndHashPhone, hashEmail } from '../server/src/services/metaHasher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🚀 Iniciando Bateria de Testes da Fase 47 - Etapa 1 (Injeção Manual de Leads)...');

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
// 1. Auditoria dos Elementos do DOM em client/index.html
// ------------------------------------------------------------------------------
console.log('\n--- 1. Auditoria dos Elementos do DOM em client/index.html ---');

const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'client/index.html'), 'utf-8');

it('Botão [+ Novo Lead Manual] está presente na barra de ações da tabela', () => {
  assert.ok(indexHtml.includes('id="btnOpenManualLeadModal"'), 'Botão btnOpenManualLeadModal não encontrado');
  assert.ok(indexHtml.includes('+ Novo Lead Manual'), 'Texto do botão [+ Novo Lead Manual] não encontrado');
});

it('Modal de Lead Manual (#modalManualLead) possui estrutura e campos completos', () => {
  assert.ok(indexHtml.includes('id="modalManualLead"'), 'Modal modalManualLead não encontrado');
  assert.ok(indexHtml.includes('id="formManualLead"'), 'Formulário formManualLead não encontrado');
  assert.ok(indexHtml.includes('id="manualLeadNome"'), 'Input Nome não encontrado');
  assert.ok(indexHtml.includes('id="manualLeadEmpresa"'), 'Input Empresa não encontrado');
  assert.ok(indexHtml.includes('id="manualLeadWhatsapp"'), 'Input WhatsApp não encontrado');
  assert.ok(indexHtml.includes('id="manualLeadEmail"'), 'Input E-mail não encontrado');
  assert.ok(indexHtml.includes('id="btnSubmitManualLead"'), 'Botão submit não encontrado');
  assert.ok(indexHtml.includes('id="btnCloseManualLeadModal"'), 'Botão fechar não encontrado');
  assert.ok(indexHtml.includes('ORIGEM: MANUAL'), 'Tag informativa ORIGEM: MANUAL não encontrada');
});

// ------------------------------------------------------------------------------
// 2. Auditoria do Frontend em client/js/app.js
// ------------------------------------------------------------------------------
console.log('\n--- 2. Auditoria Lógica em client/js/app.js ---');

const appJs = fs.readFileSync(path.join(ROOT_DIR, 'client/js/app.js'), 'utf-8');

it('Função initManualLeadModal está implementada e chamada no DOMContentLoaded', () => {
  assert.ok(appJs.includes('function initManualLeadModal()'), 'initManualLeadModal não definida');
  assert.ok(appJs.includes('initManualLeadModal();'), 'initManualLeadModal não invocada no DOMContentLoaded');
});

it('Renderização de badge ORIGEM: MANUAL na listagem de leads', () => {
  assert.ok(appJs.includes('badge-manual-origin'), 'Classe badge-manual-origin não encontrada em app.js');
  assert.ok(appJs.includes('ORIGEM: MANUAL'), 'Texto de tag ORIGEM: MANUAL não encontrado na tabela');
});

// ------------------------------------------------------------------------------
// 3. Persistência de Dados e Validação de Schema (Backend)
// ------------------------------------------------------------------------------
console.log('\n--- 3. Persistência no Banco com Tag ORIGEM: MANUAL ---');

const testTenant = `test_tenant_phase47_${Date.now()}`;
const testNome = 'Marcos Vinicius Agropecuarista';
const testEmpresa = 'Fazenda Serra Dourada';
const testWhatsapp = '(66) 99712-3456';
const testEmail = 'marcos.vinicius@serradourada.com.br';

let createdLead = null;

async function runTests() {
  it('Validação de campos obrigatórios ao criar lead manual', () => {
    assert.throws(() => createManualLead({ nome: '', whatsapp: testWhatsapp, email: testEmail }), /nome/i);
    assert.throws(() => createManualLead({ nome: testNome, whatsapp: '', email: testEmail }), /whatsapp/i);
    assert.throws(() => createManualLead({ nome: testNome, whatsapp: testWhatsapp, email: '' }), /e-mail/i);
  });

  it('Persistência atômica no banco de dados com tag ORIGEM: MANUAL', () => {
    createdLead = createManualLead({
      nome: testNome,
      empresa: testEmpresa,
      whatsapp: testWhatsapp,
      email: testEmail
    }, testTenant);

    assert.ok(createdLead, 'Lead não foi criado');
    assert.ok(createdLead.id.startsWith('lead_man_'), 'ID deve começar com lead_man_');
    assert.strictEqual(createdLead.origem, 'MANUAL', 'origem deve ser MANUAL');
    assert.strictEqual(createdLead.tag, 'ORIGEM: MANUAL', 'tag deve ser ORIGEM: MANUAL');
    assert.strictEqual(createdLead.contato_nome, testNome, 'contato_nome deve coincidir');
    assert.strictEqual(createdLead.razao_social, testEmpresa, 'razao_social deve ser o nome da empresa');
    assert.strictEqual(createdLead.email, testEmail.toLowerCase(), 'e-mail deve ser sanitizado em minúsculas');
    assert.ok(createdLead.telefone.includes('99712-3456'), 'telefone deve conter número formatado');
    assert.ok(createdLead.telefone_sanitized.startsWith('5566997123456'), 'telefone_sanitized deve ser padrão internacional');
  });

  it('Verificação direta da linha persistida na tabela leads via SQL', () => {
    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(createdLead.id);
    assert.ok(row, 'Registro não encontrado diretamente no SQLite');
    assert.strictEqual(row.tenant_id, testTenant);
    assert.strictEqual(row.origem, 'MANUAL');
    assert.strictEqual(row.tag, 'ORIGEM: MANUAL');
    assert.strictEqual(row.contato_nome, testNome);
  });

  it('Endpoint POST /api/leads/manual via createManualLeadController', () => {
    let statusCode = 200;
    let jsonResponse = null;
    const mockReq = {
      body: {
        nome: 'Dra. Helena Carvalho',
        empresa: 'Clínica Carvalho Agro & Saúde',
        whatsapp: '(11) 98765-4321',
        email: 'helena@carvalho.med.br'
      },
      headers: { 'x-tenant-id': testTenant }
    };
    const mockRes = {
      status: (code) => { statusCode = code; return mockRes; },
      json: (data) => { jsonResponse = data; return mockRes; }
    };

    createManualLeadController(mockReq, mockRes);
    assert.strictEqual(statusCode, 201, 'Status deve ser 201 Created');
    assert.strictEqual(jsonResponse.success, true, 'success deve ser true');
    assert.strictEqual(jsonResponse.data.tag, 'ORIGEM: MANUAL', 'tag deve ser ORIGEM: MANUAL');
    assert.strictEqual(jsonResponse.data.origem, 'MANUAL', 'origem deve ser MANUAL');
    assert.strictEqual(jsonResponse.data.contato_nome, 'Dra. Helena Carvalho');
  });

  // ------------------------------------------------------------------------------
  // 4. Injeção Automática nas Rotas de Exportação de Públicos do Meta Ads (Warm-up)
  // ------------------------------------------------------------------------------
  console.log('\n--- 4. Injeção em Exportação de Públicos (Meta Ads / Custom Audiences) ---');

  await itAsync('Exportação format: custom_audiences_raw inclui lead manual na listagem', async () => {
    let responseCsv = '';
    const mockReq = {
      body: {
        format: 'custom_audiences_raw',
        tenant_id: testTenant
      },
      user: { id: 'test_admin', tenant_id: testTenant },
      headers: { 'x-tenant-id': testTenant }
    };

    const mockRes = {
      setHeader: () => {},
      send: (content) => { responseCsv = content; },
      status: (code) => ({ json: (data) => { throw new Error(`Status ${code}: ${JSON.stringify(data)}`); } })
    };

    exportLeads(mockReq, mockRes);

    assert.ok(responseCsv.length > 0, 'CSV exportado não pode estar vazio');
    assert.ok(responseCsv.includes('marcos.vinicius@serradourada.com.br'), 'E-mail do lead manual deve estar presente no CSV');
    assert.ok(responseCsv.includes('+5566997123456'), 'Telefone internacionalizado deve estar presente no CSV');
    assert.ok(responseCsv.toLowerCase().includes('marcos'), 'Primeiro nome deve constar no CSV');
    assert.ok(responseCsv.includes('Fazenda Serra Dourada'), 'Nome da empresa deve constar no CSV');
  });

  await itAsync('Exportação format: meta_ads gera hashes SHA-256 fiéis do lead manual', async () => {
    let responseCsv = '';
    const mockReq = {
      body: {
        format: 'meta_ads',
        tenant_id: testTenant
      },
      user: { id: 'test_admin', tenant_id: testTenant },
      headers: { 'x-tenant-id': testTenant }
    };

    const mockRes = {
      setHeader: () => {},
      send: (content) => { responseCsv = content; },
      status: (code) => ({ json: (data) => { throw new Error(`Status ${code}: ${JSON.stringify(data)}`); } })
    };

    exportLeads(mockReq, mockRes);

    const expectedEmailHash = hashEmail(testEmail);
    const expectedPhoneHash = normalizeAndHashPhone(testWhatsapp);

    assert.ok(responseCsv.includes(expectedEmailHash), 'Hash SHA-256 do e-mail do lead manual deve constar no CSV');
    assert.ok(responseCsv.includes(expectedPhoneHash), 'Hash SHA-256 do telefone do lead manual deve constar no CSV');
  });

  // Limpeza de massa de teste
  try {
    db.prepare('DELETE FROM leads WHERE tenant_id = ?').run(testTenant);
    db.prepare('DELETE FROM leads_socios WHERE tenant_id = ?').run(testTenant);
  } catch (e) {}

  console.log('\n====================================================');
  console.log(`📊 TOTAL DE TESTES DA FASE 47 (ETAPA 1): ${passed + failed}`);
  console.log(`✅ APROVADOS: ${passed}`);
  console.log(`❌ FALHAS: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
