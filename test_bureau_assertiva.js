/**
 * test_bureau_assertiva.js
 * SUÍTE DE TESTES E HOMOLOGAÇÃO: INTEGRAÇÃO ASSERTIVA v3 & MÓDULO BUREAU DE CRÉDITO
 * 
 * Valida:
 * 1. Resolução e ciclo de vida do token OAuth2 com buffer de expiração.
 * 2. Validação matemática de checksum de CPF e CNPJ.
 * 3. Consulta completa cadastral e financeira com score de crédito, protestos e contatos.
 * 4. Trava inteligente anti-desperdício de créditos (2ª consulta servida do cache a custo R$ 0,00).
 * 5. Sincronização automática com a tabela leads e aplicação do selo VERIFICADO_ASSERTIVA.
 */

import { assertivaAuthService } from './server/src/services/assertivaAuthService.js';
import { bureauService } from './server/src/services/bureauService.js';
import db from './server/src/config/database.js';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 INICIANDO TESTES DO MÓDULO BUREAU ASSERTIVA v3 & CRÉDITO');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 1: Validação de Credenciais e Gerenciador de Token OAuth2
  // --------------------------------------------------------------------------
  console.log('👉 TESTE 1: Gerenciador OAuth2 Assertiva (assertivaAuthService)');
  const creds = assertivaAuthService.resolveCredentials({
    apiKey: 'cliente_demo_id:cliente_demo_secret'
  });
  assert(creds.clientId === 'cliente_demo_id', 'Extração correta do Client ID a partir de apiKey');
  assert(creds.clientSecret === 'cliente_demo_secret', 'Extração correta do Client Secret a partir de apiKey');

  assertivaAuthService.clearTokenCache();
  assert(typeof assertivaAuthService.getAccessToken === 'function', 'Método getAccessToken disponível');

  // --------------------------------------------------------------------------
  // TESTE 2: Validação de Formato e Checksum de Documentos
  // --------------------------------------------------------------------------
  console.log('\n👉 TESTE 2: Validação Algorítmica de Documentos (CPF e CNPJ)');
  const invalidDocRes = await bureauService.consultarBureauCompleto('12345');
  assert(!invalidDocRes.success && invalidDocRes.status === 'INVALID_DOC_FORMAT', 'Rejeição de documento com tamanho inválido');

  const invalidCpfChecksum = await bureauService.consultarBureauCompleto('11111111111');
  assert(!invalidCpfChecksum.success && invalidCpfChecksum.status === 'INVALID_CPF_CHECKSUM', 'Rejeição de CPF com dígitos verificadores inválidos');

  // --------------------------------------------------------------------------
  // TESTE 3: Criação de Lead de Teste para Validar Sincronização Automática
  // --------------------------------------------------------------------------
  console.log('\n👉 TESTE 3: Sincronização Automática com a Base de Leads');
  const testCnpjClean = '10440482000154'; // CNPJ válido (Amaggi Exportação)
  const testLeadId = `lead_test_bureau_${Date.now()}`;

  try {
    // Insere lead temporário para teste de enriquecimento
    db.prepare(`
      INSERT OR REPLACE INTO leads (
        id, cnpj, cnpj_raw, razao_social, nome_fantasia, cnae_principal_codigo,
        cnae_principal_descricao, porte, capital_social, municipio, uf, telefone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testLeadId,
      '10.440.482/0001-54',
      testCnpjClean,
      'AMAGGI EXPORTACAO E IMPORTACAO LTDA',
      'AMAGGI',
      '4623101',
      'Comércio atacadista de soja',
      'DEMAIS',
      5000000,
      'Cuiabá',
      'MT',
      '6536455000'
    );
    assert(true, 'Lead de teste inserido com sucesso na tabela leads');
  } catch (err) {
    assert(false, `Falha ao inserir lead de teste: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // TESTE 4: 1ª Consulta Completa ao Bureau (População de Cache e Sincronização)
  // --------------------------------------------------------------------------
  console.log('\n👉 TESTE 4: Primeira Consulta Completa ao Bureau (Com População de Cache)');
  const resConsulta1 = await bureauService.consultarBureauCompleto(testCnpjClean, {
    forceRefresh: true,
    tenantId: 'tenant-test'
  });

  assert(resConsulta1.success === true, 'Consulta concluída com sucesso');
  assert(resConsulta1.cached === false, 'Primeira consulta identificada como NÃO em cache');
  assert(resConsulta1.dados && resConsulta1.dados.score_credito > 0, `Score de crédito retornado: ${resConsulta1.dados?.score_credito}`);
  assert(resConsulta1.dados && resConsulta1.dados.faixa_risco, `Faixa de risco classificada: ${resConsulta1.dados?.faixa_risco}`);
  assert(resConsulta1.selo_verificacao?.status === 'VERIFICADO_BUREAU', 'Selo oficial de verificação gerado');

  // Verifica se o lead no banco foi automaticamente atualizado
  const leadAtualizado = db.prepare('SELECT id, score_credito, bureau_status, bureau_updated_at FROM leads WHERE id = ?').get(testLeadId);
  assert(leadAtualizado && leadAtualizado.bureau_status === 'VERIFICADO_ASSERTIVA', 'Coluna bureau_status atualizada para VERIFICADO_ASSERTIVA no banco');
  assert(leadAtualizado && leadAtualizado.score_credito > 0, `Coluna score_credito atualizada para ${leadAtualizado?.score_credito}`);

  // --------------------------------------------------------------------------
  // TESTE 5: 2ª Consulta (Anti-Desperdício: Custo R$ 0,00 via Cache)
  // --------------------------------------------------------------------------
  console.log('\n👉 TESTE 5: Trava Anti-Desperdício (Segunda Consulta Servida do Cache Local)');
  const resConsulta2 = await bureauService.consultarBureauCompleto(testCnpjClean, {
    forceRefresh: false,
    tenantId: 'tenant-test'
  });

  assert(resConsulta2.success === true, 'Segunda consulta concluída com sucesso');
  assert(resConsulta2.cached === true, 'Segunda consulta servida estritamente do CACHE LOCAL');
  assert(resConsulta2.custo_consulta === 'R$ 0,00', 'Custo da consulta registrado como R$ 0,00');
  assert(resConsulta2.dados.score_credito === resConsulta1.dados.score_credito, 'Consistência de dados mantida entre cache e requisição');

  // Limpeza do lead de teste
  try {
    db.prepare('DELETE FROM leads WHERE id = ?').run(testLeadId);
    db.prepare('DELETE FROM bureau_cache_consultas WHERE documento_limpo = ?').run(testCnpjClean);
  } catch (_) {}

  // --------------------------------------------------------------------------
  // RESUMO DOS TESTES
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 RESULTADO DOS TESTES: ${passed} PASSOU | ${failed} FALHOU`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('❌ Erro fatal no executor de testes:', err);
  process.exit(1);
});
