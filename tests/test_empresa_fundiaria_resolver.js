/**
 * tests/test_empresa_fundiaria_resolver.js
 * 
 * Validação do Resolvedor Automático de CNPJ por Radical da Denominação e Município (Receita Federal)
 * Conforme Requisitos da Tarefa:
 * 1. Extração de Radical (extrairRadicalEmpresarial) com stop-words rurais, números e letras isoladas.
 * 2. Mecanismo de Busca da Empresa com score >= 80%.
 * 3. População dos dados no Inspetor (CNPJ formatado, Razão Social, QSA e Status [EMPRESA LOCALIZADA (RECEITA FEDERAL)]).
 */

import assert from 'assert';
import { extrairRadicalEmpresarial, calcularScoreEmpresarial, resolverEmpresaPorDenominacao } from '../server/src/services/empresaFundiariaResolver.js';
import { enrichRuralOsintHandler } from '../server/src/controllers/geoFundiarioController.js';
import { leadEnrichmentService } from '../server/src/services/leadEnrichmentService.js';

async function runTests() {
  console.log('🧪 Iniciando Testes do Resolvedor Automático de CNPJ por Radical...\n');

  // =========================================================================
  // TESTE 1: Extração de Radical Empresarial Limpo
  // =========================================================================
  console.log('--- TESTE 1: Extração de Radical Empresarial ---');
  const testCasesRadical = [
    { input: 'Cambará B', expected: 'CAMBARA' },
    { input: 'Fazenda Guajuvira - Parte 1', expected: 'GUAJUVIRA' },
    { input: 'Agropecuária Santa Fé - Gleba 1.4', expected: 'SANTA FE' },
    { input: 'FAZENDA CAMBARÁ - GLEBA B', expected: 'CAMBARA' },
    { input: 'FAZENDA CAMBARÁ - GLEBA A', expected: 'CAMBARA' },
    { input: 'Granja Esperança - Lote 12', expected: 'ESPERANCA' },
    { input: 'SÍTIO BOA VISTA - PARCELA 3', expected: 'BOA VISTA' },
    { input: 'Estância do Pinheiro', expected: 'PINHEIRO' }
  ];

  for (const { input, expected } of testCasesRadical) {
    const output = extrairRadicalEmpresarial(input);
    assert.strictEqual(output, expected, `Falha no radical de "${input}": esperava "${expected}", obteve "${output}"`);
    console.log(`  ✅ "${input}"  ===>  "${output}"`);
  }

  // =========================================================================
  // TESTE 2: Resolução Direta por Radical e Município (Passo Fundo)
  // =========================================================================
  console.log('\n--- TESTE 2: Resolução por Denominação & Município ---');

  // A) Cambará B
  const resCambara = await resolverEmpresaPorDenominacao({
    nome_imovel: 'Cambará B',
    municipio: 'PASSO FUNDO',
    uf: 'RS'
  });

  assert(resCambara, 'Deveria resolver Cambará B');
  assert.strictEqual(resCambara.matched, true, 'Deveria marcar matched=true para Cambará B');
  assert(resCambara.score >= 80, `Score deve ser >= 80 (obteve ${resCambara.score})`);
  assert.strictEqual(resCambara.cnpj, '19.750.885/0001-74', 'CNPJ de Cambará deve ser 19.750.885/0001-74');
  assert.strictEqual(resCambara.razao_social, 'CAMBARA AGROPECUARIA LTDA');
  assert.strictEqual(resCambara.status, '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]');
  assert(Array.isArray(resCambara.socios_qsa) && resCambara.socios_qsa.length > 0, 'Deve conter lista de sócios QSA');
  console.log(`  ✅ "Cambará B" -> ${resCambara.cnpj} (${resCambara.razao_social}) | Score: ${resCambara.score}% | Status: ${resCambara.status}`);
  console.log(`     Sócios: ${resCambara.socios_qsa.map(s => s.nome).join(', ')}`);

  // B) Agropecuária Santa Fé
  const resSantaFe = await resolverEmpresaPorDenominacao({
    nome_imovel: 'Agropecuária Santa Fé',
    municipio: 'PASSO FUNDO',
    uf: 'RS'
  });

  assert(resSantaFe, 'Deveria resolver Agropecuária Santa Fé');
  assert.strictEqual(resSantaFe.matched, true, 'Deveria marcar matched=true para Santa Fé');
  assert(resSantaFe.score >= 80, `Score deve ser >= 80 (obteve ${resSantaFe.score})`);
  assert.strictEqual(resSantaFe.cnpj, '08.319.452/0001-42', 'CNPJ de Santa Fé deve ser 08.319.452/0001-42');
  assert.strictEqual(resSantaFe.razao_social, 'AGROPECUARIA SANTA FE LTDA');
  assert.strictEqual(resSantaFe.status, '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]');
  assert(Array.isArray(resSantaFe.socios_qsa) && resSantaFe.socios_qsa.length >= 2, 'Deve conter sócios Fagundes');
  console.log(`  ✅ "Agropecuária Santa Fé" -> ${resSantaFe.cnpj} (${resSantaFe.razao_social}) | Score: ${resSantaFe.score}% | Status: ${resSantaFe.status}`);
  console.log(`     Sócios: ${resSantaFe.socios_qsa.map(s => s.nome).join(', ')}`);

  // =========================================================================
  // TESTE 3: Waterfall em Cascata (leadEnrichmentService)
  // =========================================================================
  console.log('\n--- TESTE 3: Motor Waterfall em Cascata ---');
  const wfCambara = await leadEnrichmentService.enrichPropertyWaterfall({
    nome_imovel: 'FAZENDA CAMBARÁ - GLEBA B',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    codigo_imovel: 'TEST-CAMBARA-B',
    forceRefresh: true
  });

  assert.strictEqual(wfCambara.titular.tipo_pessoa, 'PJ', 'Tipo de pessoa deve ser PJ');
  assert.strictEqual(wfCambara.cnpj, '19.750.885/0001-74', 'CNPJ deve ser formatado');
  assert.strictEqual(wfCambara.titular.razao_social, 'CAMBARA AGROPECUARIA LTDA');
  assert.strictEqual(wfCambara.status_resolucao, '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]');
  assert.strictEqual(wfCambara.source, 'RECEITA_FEDERAL_RADICAL');
  console.log(`  ✅ Waterfall "FAZENDA CAMBARÁ - GLEBA B" -> CNPJ: ${wfCambara.cnpj} | Razão: ${wfCambara.titular.razao_social} | Fonte: ${wfCambara.source}`);

  // =========================================================================
  // TESTE 4: Endpoint REST /api/fundiario/enrich-osint
  // =========================================================================
  console.log('\n--- TESTE 4: Endpoint REST /api/fundiario/enrich-osint ---');

  let endpointCambaraResult = null;
  const mockReqCambara = {
    body: {
      nome_imovel: 'Cambará B',
      municipio: 'PASSO FUNDO',
      uf: 'RS'
    },
    user: { tenant_id: 'tenant-root-default' },
    headers: {}
  };
  const mockResCambara = {
    json: (payload) => { endpointCambaraResult = payload; },
    status: () => mockResCambara
  };

  await enrichRuralOsintHandler(mockReqCambara, mockResCambara);

  assert(endpointCambaraResult, 'Endpoint deve retornar resposta');
  assert.strictEqual(endpointCambaraResult.success, true);
  assert.strictEqual(endpointCambaraResult.cnpj, '19.750.885/0001-74');
  assert.strictEqual(endpointCambaraResult.razao_social, 'CAMBARA AGROPECUARIA LTDA');
  assert.strictEqual(endpointCambaraResult.status, '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]');
  assert.strictEqual(endpointCambaraResult.status_resolucao, '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]');
  assert(Array.isArray(endpointCambaraResult.socios_qsa) && endpointCambaraResult.socios_qsa.length > 0);
  console.log(`  ✅ Endpoint Cambará B: CNPJ=${endpointCambaraResult.cnpj}, Razão=${endpointCambaraResult.razao_social}, Status=${endpointCambaraResult.status}`);

  let endpointSantaFeResult = null;
  const mockReqSantaFe = {
    body: {
      nome_imovel: 'Agropecuária Santa Fé',
      municipio: 'PASSO FUNDO',
      uf: 'RS'
    },
    user: { tenant_id: 'tenant-root-default' },
    headers: {}
  };
  const mockResSantaFe = {
    json: (payload) => { endpointSantaFeResult = payload; },
    status: () => mockResSantaFe
  };

  await enrichRuralOsintHandler(mockReqSantaFe, mockResSantaFe);

  assert(endpointSantaFeResult, 'Endpoint deve retornar resposta');
  assert.strictEqual(endpointSantaFeResult.success, true);
  assert.strictEqual(endpointSantaFeResult.cnpj, '08.319.452/0001-42');
  assert.strictEqual(endpointSantaFeResult.razao_social, 'AGROPECUARIA SANTA FE LTDA');
  assert.strictEqual(endpointSantaFeResult.status, '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]');
  assert.strictEqual(endpointSantaFeResult.status_resolucao, '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]');
  assert(Array.isArray(endpointSantaFeResult.socios_qsa) && endpointSantaFeResult.socios_qsa.length >= 2);
  console.log(`  ✅ Endpoint Santa Fé: CNPJ=${endpointSantaFeResult.cnpj}, Razão=${endpointSantaFeResult.razao_social}, Status=${endpointSantaFeResult.status}`);

  console.log('\n🎉 TODOS OS 4 TESTES PASSARAM COM 100% DE SUCESSO!');
}

runTests().catch(err => {
  console.error('\n❌ ERRO NO TESTE:', err);
  process.exit(1);
});
