/**
 * tests/test_sparks_realtime_notifications_and_whatsapp.js
 * 
 * BATERIA DE TESTES DE INTEGRAÇÃO:
 * - Gestão de Múltiplos Gestores no Super Admin
 * - Formatação Executiva Sem Emojis
 * - Deep Linking (?tab=sparks&signal_id=...)
 * - Polling de Sinais Recentes (/api/sparks/signals/latest)
 * - Simulação de Sinal e Despacho de WhatsApp Gratuito
 */

import http from 'http';
import app from '../server/src/app.js';
import db from '../server/src/config/database.js';
import SparksAlertDispatcherService from '../server/src/services/sparksAlertDispatcherService.js';

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`[TEST] Servidor de teste iniciado em: ${baseUrl}`);
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ SUCESSO: ${message}`);
}

async function runTests() {
  console.log('=================================================================');
  console.log('⚡ TESTE: NOTIFICAÇÕES EM TEMPO REAL & WHATSAPP RADAR SPARKS');
  console.log('=================================================================');

  await startServer();

  try {
    const tenantId = 'tenant-root-default';

    // 1. Teste de Formatação de Mensagem: RIGOROSAMENTE SEM EMOJIS
    console.log('\n--- 1. Testando Formatação Executiva Sem Emojis ---');
    const mockSignal = {
      id: 'sig-test-maquina-001',
      spark_type: 'CREDITO_BNDES',
      titulo: 'Crédito BNDES Finame Agro Aprovado: R$ 4.250.000,00',
      resumo: 'Liberação de linha Moderfrota/Finame para 2 Colheitadeiras axiais de grande porte.',
      orgao_emissor: 'BNDES / BACEN',
      valor_monetario: 4250000.0,
      documento_identificado: '08.921.442/0001-90',
      titular_identificado: 'ZANELLA AGROPECUÁRIA E CEREAIS LTDA',
      municipio: 'Sorriso',
      uf: 'MT',
      trigger_texto: 'Crédito BNDES Finame Liberado (R$ 4,25M em Maquinário Pesado)'
    };

    const formattedMessage = SparksAlertDispatcherService.formatMessage(mockSignal, 'https://apisleads.vercel.app');
    console.log('Mensagem gerada:\n' + formattedMessage);

    const hasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu.test(formattedMessage);
    assert(!hasEmoji, 'A mensagem do gestor NÃO contém emojis.');
    assert(formattedMessage.includes('[VERSUS SPARKS] ALERTA DE OPORTUNIDADE DETECTADA'), 'Cabeçalho corporativo presente.');
    assert(formattedMessage.includes('4.250.000,00'), 'Valor financeiro formatado presente.');
    assert(formattedMessage.includes('https://apisleads.vercel.app/?tab=sparks&signal_id=sig-test-maquina-001'), 'Deep link exato presente na mensagem.');

    // 2. Teste de Cadastro de Gestor via API
    console.log('\n--- 2. Testando Cadastro de Gestor no Super Admin ---');
    const createRes = await fetch(`${baseUrl}/api/sparks/recipients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Diretor Comercial Agro',
        telefone: '45998214400',
        tipos_alertas: ['CREDITO_BNDES', 'OUTORGA_ANA']
      })
    });

    const createJson = await createRes.json();
    assert(createRes.status === 201 && createJson.success, 'Gestor cadastrado com status 201.');
    assert(createJson.data.telefone.includes('5545998214400'), 'Telefone formatado com código DDI 55.');
    const recipientId = createJson.data.id;

    // 3. Teste de Listagem de Gestores
    console.log('\n--- 3. Testando Listagem de Gestores ---');
    const listRes = await fetch(`${baseUrl}/api/sparks/recipients`);
    const listJson = await listRes.json();
    assert(listRes.status === 200 && Array.isArray(listJson.data), 'Lista de gestores retornou array.');
    const found = listJson.data.find(r => r.id === recipientId);
    assert(found !== undefined, 'Gestor recém-cadastrado encontrado na lista.');
    assert(found.ativo === 1, 'Gestor está ativo por padrão.');

    // 4. Teste de Alternância de Status (Silenciar / Ativar)
    console.log('\n--- 4. Testando Alternância de Status (Toggle) ---');
    const toggleRes = await fetch(`${baseUrl}/api/sparks/recipients/${recipientId}/toggle`, {
      method: 'PATCH'
    });
    const toggleJson = await toggleRes.json();
    assert(toggleRes.status === 200 && toggleJson.data.ativo === 0, 'Status alternado para silenciado (0).');

    // Reativa
    await fetch(`${baseUrl}/api/sparks/recipients/${recipientId}/toggle`, { method: 'PATCH' });

    // 5. Teste de Disparo de Teste para o Gestor
    console.log('\n--- 5. Testando Disparo de Teste para o Gestor ---');
    const testRes = await fetch(`${baseUrl}/api/sparks/recipients/${recipientId}/test`, {
      method: 'POST'
    });
    const testJson = await testRes.json();
    assert(testRes.status === 200 && testJson.success, 'Disparo de teste executado com sucesso.');
    assert(testJson.data.direct_url.includes('https://wa.me/55'), 'Link direto wa.me gerado corretamente.');
    assert(!/[\u{1F300}-\u{1F9FF}]/gu.test(testJson.data.message_text), 'Mensagem de teste sem emojis.');

    // 6. Teste de Polling de Sinais Recentes (/api/sparks/signals/latest)
    console.log('\n--- 6. Testando Polling de Sinais Recentes ---');
    const latestRes = await fetch(`${baseUrl}/api/sparks/signals/latest?limit=5`);
    const latestJson = await latestRes.json();
    assert(latestRes.status === 200 && latestJson.success, 'Endpoint /api/sparks/signals/latest respondeu 200.');
    assert(Array.isArray(latestJson.data), 'Retornou array de sinais.');
    assert(latestJson.server_time !== undefined, 'Timestamp de sincronização retornado para o cliente.');

    // 7. Teste de Simulação de Sinal e Despacho Completo
    console.log('\n--- 7. Testando Simulação de Sinal e Despacho de Alerta ---');
    const simRes = await fetch(`${baseUrl}/api/sparks/signals/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spark_type: 'CREDITO_BNDES',
        titulo: 'Crédito BNDES Finame Agro Aprovado: R$ 5.800.000,00',
        titular: 'AGROPECUARIA VALE VERDE S.A.',
        valor_monetario: 5800000.0
      })
    });
    const simJson = await simRes.json();
    assert(simRes.status === 201 && simJson.success, 'Sinal de teste gerado com sucesso.');
    assert(simJson.alert_dispatch.dispatched === true, 'Alerta despachado com sucesso para os gestores ativos.');
    assert(simJson.alert_dispatch.dispatched_count >= 1, 'Pelo menos 1 gestor recebeu a notificação.');

    // 8. Limpeza do Gestor de Teste
    console.log('\n--- 8. Limpeza de Dados de Teste ---');
    const delRes = await fetch(`${baseUrl}/api/sparks/recipients/${recipientId}`, {
      method: 'DELETE'
    });
    const delJson = await delRes.json();
    assert(delRes.status === 200 && delJson.success, 'Gestor de teste excluído com sucesso.');

    console.log('\n=================================================================');
    console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
    console.log('=================================================================');

  } finally {
    await stopServer();
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
