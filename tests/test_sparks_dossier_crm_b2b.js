/**
 * tests/test_sparks_dossier_crm_b2b.js
 * Teste de validação das rotas e serviços de Inteligência Tática do Radar Sparks
 */

import SparksEngineService from '../server/src/services/sparksEngineService.js';
import db from '../server/src/config/database.js';

async function runTests() {
  console.log('🧪 [TEST_SPARKS] Iniciando bateria de testes do Radar Sparks...');

  // 1. Teste de Dossiê com Raio-X
  const signalId = 'sig-dou-5dc5e251';
  const dossier = await SparksEngineService.getSignalDossier(signalId);
  if (!dossier || !dossier.signal || !dossier.lead) {
    throw new Error('Falha ao obter dossiê do sinal.');
  }
  console.log('✅ Teste 1: Dossiê gerado com sucesso para:', dossier.lead.razao_social);
  console.log('   Timestamp:', dossier.signal.timestamp_completo);
  console.log('   Tempo Relativo:', dossier.signal.tempo_relativo);
  console.log('   Score Base / Turbinado:', dossier.score_impact.score_base, '->', dossier.score_impact.score_turbinado);

  // 2. Teste de Exportação para Planilha B2B
  const b2bRows = await SparksEngineService.exportSignalsB2b([signalId]);
  if (!Array.isArray(b2bRows) || b2bRows.length === 0) {
    throw new Error('Falha na formatação da Planilha B2B.');
  }
  console.log('✅ Teste 2: Linha da Planilha B2B exportada com sucesso:', {
    titular: b2bRows[0].titular,
    data: b2bRows[0].data_deteccao,
    hora: b2bRows[0].hora_deteccao,
    gatilho: b2bRows[0].gatilho_comercial,
    valor: b2bRows[0].valor_estimado_brl
  });

  // 3. Teste de Boost de Score no Lead
  const boost = await SparksEngineService.boostSignalLeadScore(signalId);
  if (!boost || !boost.success) {
    throw new Error('Falha ao bonificar score do lead.');
  }
  console.log('✅ Teste 3: Score bonificado no banco SQLite:', boost);

  // 4. Teste de Despacho para CRM (Modo Simulação / Webhook)
  const crmResult = await SparksEngineService.dispatchSignalToCrm(signalId, 'tenant-root-default', { dryRun: true });
  if (!crmResult || !crmResult.success) {
    throw new Error('Falha no despacho para CRM.');
  }
  console.log('✅ Teste 4: Despacho para CRM executado com sucesso:', {
    leadNome: crmResult.lead.nome,
    score: crmResult.lead.score,
    temperatura: crmResult.lead.temperatura
  });

  console.log('\n🎉 [TEST_SPARKS] TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!\n');
}

runTests().catch(err => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
