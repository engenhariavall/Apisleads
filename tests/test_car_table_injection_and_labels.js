/**
 * test_car_table_injection_and_labels.js
 * 
 * Validação da Diretriz de Engenharia:
 * CORREÇÃO DE ETIQUETAS E HIDRATAÇÃO DA TABELA ANALÍTICA
 */

import assert from 'assert';
import http from 'http';
import app from '../server/src/app.js';
import db from '../server/src/config/database.js';
import { createRuralPropertyLead, getLeadByIdOrCnpj } from '../server/src/services/leadsService.js';

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
  }
}

async function itAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
  }
}

console.log('\n=== INICIANDO TESTES DE ETIQUETAS E HIDRATAÇÃO DA TABELA ===\n');

// 1. Testes de Injeção Multi-Fonte (CAR, FUSÃO, SIGEF)
await itAsync('Injeção de Imóvel SICAR/CAR deve atribuir origem RURAL_CAR e tag ORIGEM: RURAL / CAR', async () => {
  const leadCar = await createRuralPropertyLead({
    codigo_car: 'RS-4314100-TESTE-CAR-TAG-01',
    tag_fonte: 'SICAR',
    nome_imovel: 'Fazenda Planalto Verde',
    nome_titular: 'Valdir Antonio Dal Moro',
    cpf_cnpj_titular: '631.984.644-55',
    municipio: 'Passo Fundo',
    uf: 'RS',
    area_hectares: 480,
    whatsapp_validado: '+5554999445566',
    email_validado: 'valdir@planaltoverde.agr.br',
    linkedin_url_real: 'https://linkedin.com/in/valdir-dal-moro',
    dados_agronomicos: JSON.stringify({ bioma: 'Mata Atlântica', safra: '2025/2026' }),
    crop_type: 'SOJA_VERAO',
    crop_confidence: 0.94
  }, 'tenant-test-labels');

  assert.strictEqual(leadCar.origem, 'RURAL_CAR');
  assert.strictEqual(leadCar.tag, 'ORIGEM: RURAL / CAR');
  assert.strictEqual(leadCar.contato_nome, 'Valdir Antonio Dal Moro');
  assert.strictEqual(leadCar.telefone, '+5554999445566');
  assert.strictEqual(leadCar.email, 'valdir@planaltoverde.agr.br');

  // Verifica que o QSA foi hidratado com o titular real
  assert.ok(Array.isArray(leadCar.qsa), 'QSA deve ser um array');
  assert.strictEqual(leadCar.qsa.length, 1);
  assert.strictEqual(leadCar.qsa[0].nome, 'Valdir Antonio Dal Moro');
  assert.strictEqual(leadCar.qsa[0].cpf_cnpj, '631.984.644-55');
  assert.strictEqual(leadCar.qsa[0].whatsapp_validado, '+5554999445566');
  assert.strictEqual(leadCar.qsa[0].email_validado, 'valdir@planaltoverde.agr.br');

  // Verifica que os dados verticais contêm dados agronômicos e código CAR
  const v = leadCar.vertical_data;
  assert.strictEqual(v.codigo_car, 'RS-4314100-TESTE-CAR-TAG-01');
  assert.strictEqual(v.tag_fonte, 'SICAR');
  assert.strictEqual(v.cultura_principal, 'SOJA_VERAO');
});

await itAsync('Injeção de Imóvel com Fusão SIGEF+CAR deve atribuir RURAL_FUSAO', async () => {
  const leadFusao = await createRuralPropertyLead({
    id_sigef: 'BR-RS-FUSAO-9988',
    codigo_car: 'RS-4314100-FUSAO-9988',
    tag_fonte: 'FUSAO_SIGEF_CAR',
    nome_imovel: 'Estância do Vale Dourado',
    nome_titular: 'Carlos Eduardo Menegaz',
    cpf_cnpj_titular: '512.847.211-67',
    municipio: 'Passo Fundo',
    uf: 'RS',
    area_hectares: 1200
  }, 'tenant-test-labels');

  assert.strictEqual(leadFusao.origem, 'RURAL_FUSAO');
  assert.strictEqual(leadFusao.tag, 'ORIGEM: RURAL / FUSÃO (SIGEF+CAR)');
});

await itAsync('Injeção de Imóvel exclusivo SIGEF deve manter RURAL_SIGEF', async () => {
  const leadSigef = await createRuralPropertyLead({
    id_sigef: 'BR-RS-SIGEF-7766',
    tag_fonte: 'SIGEF',
    nome_imovel: 'Gleba Esperança',
    nome_titular: 'Paulo Afonso Dal Bem',
    cpf_cnpj_titular: '584.719.260-12',
    municipio: 'Passo Fundo',
    uf: 'RS',
    area_hectares: 300
  }, 'tenant-test-labels');

  assert.strictEqual(leadSigef.origem, 'RURAL_SIGEF');
  assert.strictEqual(leadSigef.tag, 'ORIGEM: RURAL / SIGEF');
});

// 2. Testes de Endpoints HTTP e Hidratação de Detalhes
await itAsync('Endpoint GET /api/leads/:id deve retornar detalhes completos de lead rural sem erro', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // Cria lead no tenant
    const created = await createRuralPropertyLead({
      codigo_car: 'RS-4314100-TESTE-DRAWER-01',
      tag_fonte: 'SICAR',
      nome_imovel: 'Fazenda Três Palmeiras',
      nome_titular: 'Roberto Silveira Grazziotin',
      cpf_cnpj_titular: '487.192.630-88',
      municipio: 'Passo Fundo',
      uf: 'RS',
      whatsapp_validado: '+5554999881122',
      email_validado: 'roberto@grazziotin.com'
    }, 'tenant-test-labels');

    const res = await fetch(`http://localhost:${port}/api/leads/${created.id}`, {
      headers: {
        'x-tenant-id': 'tenant-test-labels'
      }
    });

    assert.strictEqual(res.status, 200, `Esperava status 200, obteve ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data, 'Data deve estar presente');
    assert.strictEqual(body.data.nome_fantasia, 'Fazenda Três Palmeiras');
    assert.strictEqual(body.data.telefone, '+5554999881122');
    assert.strictEqual(body.data.email, 'roberto@grazziotin.com');
    assert.ok(Array.isArray(body.data.qsa) && body.data.qsa.length > 0, 'QSA não pode estar vazio');
    assert.strictEqual(body.data.qsa[0].nome, 'Roberto Silveira Grazziotin');

    // Valida também endpoint /group
    const resGroup = await fetch(`http://localhost:${port}/api/leads/${created.id}/group`, {
      headers: {
        'x-tenant-id': 'tenant-test-labels'
      }
    });
    assert.strictEqual(resGroup.status, 200);
    const groupBody = await resGroup.json();
    assert.strictEqual(groupBody.has_group, false);
  } finally {
    server.close();
    db.prepare("DELETE FROM leads WHERE tenant_id = 'tenant-test-labels'").run();
  }
});

console.log(`\n=== RESUMO: ${passed}/${total} TESTES PASSARAM ===\n`);
if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
