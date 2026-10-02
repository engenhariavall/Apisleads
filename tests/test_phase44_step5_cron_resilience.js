/**
 * tests/test_phase44_step5_cron_resilience.js
 * 
 * Bateria de Testes Automatizados para a Fase 44/45 - Etapa 5
 * Masterplan Motor Fundiário B2B: Cron Sync, Detecção de Mudança de Titularidade,
 * Reprocessamento Atômico de Intent Scoring & OSINT e Resiliência de Webhook/Catch-Up.
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import { 
  saveOrUpdateRuralProperty, 
  generateSyntheticRuralPolygon 
} from '../server/src/services/geoFundiarioService.js';
import { 
  fundiarioCronService, 
  WhatsAppInboundResilienceService 
} from '../server/src/services/fundiarioCronService.js';

const TEST_TENANT_ID = `tenant-step5-test-${Date.now()}`;
let testPassed = 0;
let testFailed = 0;

function pass(msg) {
  console.log(`  ✅ [PASS] ${msg}`);
  testPassed++;
}

function fail(msg, err) {
  console.error(`  ❌ [FAIL] ${msg}`);
  if (err) console.error(err);
  testFailed++;
}

async function runStep5Tests() {
  console.log('🚀 Iniciando Bateria de Testes da Fase 44/45 - Etapa 5 (Cron Sync & Resiliência Catch-Up)...\n');

  // Garante que o tenant exista para integridade referencial
  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit)
    VALUES (?, 'Tenant Test Step 5 Agro', '11.222.333/0001-99', 'ENTERPRISE', 'ACTIVE', 10, 1000, 10000)
  `).run(TEST_TENANT_ID);

  try {
    // -------------------------------------------------------------------------
    // 1. Criação Inicial de Fazenda com Titular Original
    // -------------------------------------------------------------------------
    console.log('--- 1. Cadastro Inicial de Fazenda com Titular Original ---');
    const polyFarm = generateSyntheticRuralPolygon(-13.0600, -55.9200, 3.5);
    const idSigef = `SIGEF-TEST-SYNC-${Date.now()}`;

    const originalProp = await saveOrUpdateRuralProperty({
      id_sigef: idSigef,
      codigo_imovel: 'MT-009988-STEP5',
      nome_imovel: 'Fazenda Rio Manso do Norte',
      municipio: 'LUCAS DO RIO VERDE',
      uf: 'MT',
      area_hectares: 3200.0,
      geometria_poligono: polyFarm,
      nome_titular: 'Antônio Carlos Beltrão',
      cpf_cnpj_titular: '312.445.678-01',
      status_geo: 'CERTIFICADO',
      titularData: { aumento_capital_recente: false, nova_filial_recente: false },
      whatsapp_validado: '+5565999881122',
      linkedin_url_real: 'https://www.linkedin.com/in/antonio-carlos-beltrao',
      email_validado: 'antonio@riomanso.com.br',
      osint_status: 'ENRICHED'
    }, TEST_TENANT_ID);

    assert.strictEqual(originalProp.action, 'CREATED');
    assert.strictEqual(originalProp.intent_score, 0); // Sem triggers
    assert.strictEqual(originalProp.intent_classification, 'COLD');
    assert.strictEqual(originalProp.whatsapp_validado, '+5565999881122');
    pass('Propriedade original cadastrada com titular "Antônio Carlos Beltrão" e contatos OSINT');

    // -------------------------------------------------------------------------
    // 2. Simulação de Varredura Cron: Mesmos Dados (Sem Alteração de Titular)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Varredura de Malha sem Alteração de Titular ---');
    const syncNoChange = await fundiarioCronService.runMeshSync({
      updatedRegistries: [
        {
          id_sigef: idSigef,
          nome_imovel: 'Fazenda Rio Manso do Norte',
          municipio: 'LUCAS DO RIO VERDE',
          uf: 'MT',
          area_hectares: 3200.0,
          nome_titular: 'Antônio Carlos Beltrão',
          cpf_cnpj_titular: '312.445.678-01',
          status_geo: 'CERTIFICADO'
        }
      ]
    }, TEST_TENANT_ID);

    assert.strictEqual(syncNoChange.success, true);
    assert.strictEqual(syncNoChange.ownership_changes_detected, 0);
    assert.strictEqual(syncNoChange.up_to_date_count, 1);
    pass('Varredura conclui que malha está em dia e não dispara reprocessamento');

    // -------------------------------------------------------------------------
    // 3. Simulação de Troca de Titularidade (Venda/Sucessão Fundiária)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Detecção de Troca de Titularidade (Mudança de Dono) ---');
    const syncOwnerChange = await fundiarioCronService.runMeshSync({
      updatedRegistries: [
        {
          id_sigef: idSigef,
          codigo_imovel: 'MT-009988-STEP5',
          nome_imovel: 'Fazenda Rio Manso do Norte',
          municipio: 'LUCAS DO RIO VERDE',
          uf: 'MT',
          area_hectares: 3200.0,
          nome_titular: 'Marcos Aurelio Maggi Vilela', // NOVO TITULAR
          cpf_cnpj_titular: '881.992.331-55',          // NOVO CPF
          status_geo: 'SEM_GEO',                       // Dor regulatória no novo registro (+30)
          titularData: { nova_filial_recente: true },  // +40 pts => total 70 (HOT)
          telefone: '(65) 99655-4433'                  // Novo telefone celular
        }
      ]
    }, TEST_TENANT_ID);

    assert.strictEqual(syncOwnerChange.success, true);
    assert.strictEqual(syncOwnerChange.ownership_changes_detected, 1);
    assert.strictEqual(syncOwnerChange.changed_properties.length, 1);
    
    const changed = syncOwnerChange.changed_properties[0];
    assert.strictEqual(changed.previous_owner, 'Antônio Carlos Beltrão');
    assert.strictEqual(changed.new_owner, 'Marcos Aurelio Maggi Vilela');
    assert.strictEqual(changed.new_intent_score, 70); // 30 (SEM_GEO) + 40 (nova_filial)
    assert.strictEqual(changed.new_intent_classification, 'HOT');
    pass('Mudança de proprietário detectada: Score recalculado atomicamente para 70 (HOT)');

    // -------------------------------------------------------------------------
    // 4. Auditoria no Banco: Dados Anteriores do Antigo Titular Expurgados
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Verificação de Isolamento OSINT e Expuração de Dados Antigos ---');
    const updatedInDb = db.prepare(`
      SELECT nome_titular, cpf_cnpj_titular, intent_score, intent_classification,
             whatsapp_validado, linkedin_url_real, email_validado, osint_status, data_ultima_sync
      FROM propriedades_rurais
      WHERE id_sigef = ? AND tenant_id = ?
    `).get(idSigef, TEST_TENANT_ID);

    assert.strictEqual(updatedInDb.nome_titular, 'Marcos Aurelio Maggi Vilela');
    assert.strictEqual(updatedInDb.cpf_cnpj_titular, '881.992.331-55');
    assert.strictEqual(updatedInDb.intent_score, 70);
    assert.strictEqual(updatedInDb.intent_classification, 'HOT');
    // Não pode conter o telefone nem e-mail do antigo dono (+5565999881122 ou antonio@)
    assert.notStrictEqual(updatedInDb.whatsapp_validado, '+5565999881122');
    assert.notStrictEqual(updatedInDb.email_validado, 'antonio@riomanso.com.br');
    // Deve conter o novo celular normalizado E.164 (+5565996554433)
    assert.strictEqual(updatedInDb.whatsapp_validado, '+5565996554433');
    pass('Dados de contato do antigo proprietário foram expurgados e novo titular foi enriquecido');

    // -------------------------------------------------------------------------
    // 5. Governança e Controle do Scheduler em Background
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Controle do Agendador em Background (Scheduler API) ---');
    const schedStart = fundiarioCronService.startScheduler(120);
    assert.strictEqual(schedStart.isRunning, true);
    assert.strictEqual(fundiarioCronService.getStatus().isRunning, true);
    
    const schedStop = fundiarioCronService.stopScheduler();
    assert.strictEqual(schedStop.isRunning, false);
    assert.strictEqual(fundiarioCronService.getStatus().isRunning, false);
    pass('Scheduler de background inicia, consulta status e pausa com estabilidade');

    // -------------------------------------------------------------------------
    // 6. Resiliência do Webhook do WhatsApp (Ingestão Offline Desacoplada)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Resiliência de Webhook WhatsApp (Persistência Offline Direta no SQLite) ---');
    const messageId1 = `wa-msg-offline-1-${Date.now()}`;
    const messageId2 = `wa-msg-offline-2-${Date.now()}`;

    const ingest1 = WhatsAppInboundResilienceService.ingestWebhookMessage({
      message_id: messageId1,
      sender_phone: '(65) 99655-4433',
      recipient_phone: '5565998887766',
      message_text: 'Olá, tenho interesse na regularização do Georreferenciamento da Fazenda Rio Manso.',
      timestamp: new Date(Date.now() - 3600000).toISOString() // 1 hora atrás
    }, TEST_TENANT_ID);

    assert.strictEqual(ingest1.success, true);
    assert.strictEqual(ingest1.action, 'PERSISTED');
    assert.strictEqual(ingest1.sender, '65996554433');

    // Teste de Idempotência (Mensagem duplicada não sobrescreve)
    const ingestDup = WhatsAppInboundResilienceService.ingestWebhookMessage({
      message_id: messageId1,
      sender_phone: '(65) 99655-4433',
      message_text: 'Mensagem repetida'
    }, TEST_TENANT_ID);
    assert.strictEqual(ingestDup.action, 'ALREADY_EXISTS');
    pass('Webhook de entrada persiste mensagem no SQLite com sanitização e idempotência');

    const ingest2 = WhatsAppInboundResilienceService.ingestWebhookMessage({
      message_id: messageId2,
      sender_phone: '(66) 98122-3344',
      message_text: 'Gostaria de agendar uma sessão estratégica para expansão da frota agrícola.',
      timestamp: new Date(Date.now() - 7200000).toISOString() // 2 horas atrás
    }, TEST_TENANT_ID);
    assert.strictEqual(ingest2.success, true);

    // -------------------------------------------------------------------------
    // 7. Rotina de Catch-up: Recuperação de Mensagens Offline das Últimas 24h
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Rotina de Catch-up (Processamento de Mensagens Offline) ---');
    const catchUpResult = WhatsAppInboundResilienceService.runOfflineCatchUp(24, TEST_TENANT_ID);

    assert.strictEqual(catchUpResult.success, true);
    assert.ok(catchUpResult.recovered_count >= 2, `Deveria ter recuperado pelo menos 2 mensagens, recuperou ${catchUpResult.recovered_count}`);
    
    // Confirma que o status no banco mudou para PROCESSED
    const msg1Row = db.prepare('SELECT status, processed_at FROM whatsapp_inbound_messages WHERE id = ?').get(messageId1);
    assert.strictEqual(msg1Row.status, 'PROCESSED');
    assert.ok(msg1Row.processed_at !== null);

    // Executar catch-up novamente não processa duplicado
    const secondCatchUp = WhatsAppInboundResilienceService.runOfflineCatchUp(24, TEST_TENANT_ID);
    assert.strictEqual(secondCatchUp.recovered_count, 0);
    pass('Catch-up recupera mensagens pendentes das últimas 24h e marca PROCESSED sem duplicações');

    // -------------------------------------------------------------------------
    // 8. Teste de Endpoint HTTP do Cron e Catch-up (Simulação via Controller)
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Validação dos Controladores HTTP de Governança ---');
    const { 
      syncMeshCronHandler, 
      getCronStatusHandler, 
      whatsappWebhookInboundHandler, 
      whatsappCatchUpHandler 
    } = await import('../server/src/controllers/geoFundiarioController.js');

    // Simula req e res para getCronStatusHandler
    let statusJsonResult = null;
    await getCronStatusHandler({}, { json: (obj) => { statusJsonResult = obj; return obj; } });
    assert.strictEqual(statusJsonResult.success, true);
    pass('Endpoint GET /api/fundiario/cron/status responde com integridade');

    // Simula req e res para whatsappWebhookInboundHandler
    let waInboundResult = null;
    let waStatusCode = null;
    await whatsappWebhookInboundHandler({
      user: { tenant_id: TEST_TENANT_ID },
      body: {
        sender_phone: '11999998888',
        message_text: 'Teste via controller'
      }
    }, {
      status: (code) => { waStatusCode = code; return { json: (obj) => { waInboundResult = obj; } }; },
      json: (obj) => { waInboundResult = obj; }
    });
    assert.strictEqual(waStatusCode, 200);
    assert.strictEqual(waInboundResult.action, 'PERSISTED');
    pass('Endpoint POST /api/fundiario/whatsapp/inbound persiste via controller HTTP');

  } catch (err) {
    fail('Erro inesperado na execução dos testes da Etapa 5', err);
  } finally {
    // Limpeza de registros de teste
    try {
      db.prepare('DELETE FROM propriedades_rurais WHERE tenant_id = ?').run(TEST_TENANT_ID);
      db.prepare('DELETE FROM whatsapp_inbound_messages WHERE tenant_id = ?').run(TEST_TENANT_ID);
      db.prepare('DELETE FROM tenants WHERE id = ?').run(TEST_TENANT_ID);
    } catch (_) {}
  }

  console.log('\n---------------------------------------------------------');
  console.log(`📊 RESULTADO DA ETAPA 5: ${testPassed} Aprovados | ${testFailed} Falhas`);
  console.log('---------------------------------------------------------\n');

  if (testFailed > 0) {
    process.exit(1);
  }
}

runStep5Tests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
