/**
 * TESTE DE HOMOLOGAÇÃO AUTOMATIZADA - FASE 40 (ETAPA 1)
 * Telemetria do Cavalo de Troia (Tripwire de Rastreamento de Acessos ao Dossiê)
 */

const BASE_URL = 'http://localhost:3000';

async function runTelemetryTests() {
  console.log('🚀 Iniciando teste de homologação da Fase 40 - Etapa 1 (Motor de Telemetria e Captura)...');

  // Lead para teste: empresa cadastrada na base
  const testCnpj = '18737953000100';

  // 1. Consulta status prévio de tracking
  console.log(`\n[1/4] Verificando tracking inicial via GET /api/leads/${testCnpj}/tracking...`);
  const initialRes = await fetch(`${BASE_URL}/api/leads/${testCnpj}/tracking`);
  if (!initialRes.ok) {
    throw new Error(`Falha ao consultar tracking inicial: ${initialRes.status}`);
  }
  const initialData = await initialRes.json();
  console.log('   Tracking Inicial:', {
    has_access: initialData.has_access,
    visualizacoes_dossie: initialData.visualizacoes_dossie,
    ultimo_acesso_dossie: initialData.ultimo_acesso_dossie
  });

  const initialViews = initialData.visualizacoes_dossie || 0;

  // 2. Simula o acesso do cliente/executivo à rota pública do dossiê (HTML)
  console.log(`\n[2/4] Simulando acesso real do decisor ao dossiê via GET /report/${testCnpj}...`);
  const reportRes = await fetch(`${BASE_URL}/report/${testCnpj}?t=tenant-root-default`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Teste-Tripwire/1.0',
      'Referer': 'https://web.whatsapp.com/'
    }
  });

  if (!reportRes.ok) {
    throw new Error(`Falha ao carregar relatório /report/${testCnpj}: status ${reportRes.status}`);
  }
  const reportHtml = await reportRes.text();
  console.log(`✅ Relatório HTML carregado com sucesso (${reportHtml.length} bytes)!`);

  // Aguarda 200ms para garantir gravação assíncrona do tripwire no banco SQLite
  await new Promise(r => setTimeout(r, 200));

  // 3. Consulta novamente o endpoint interno de tracking do CRM
  console.log(`\n[3/4] Consultando telemetria pós-acesso via GET /api/leads/${testCnpj}/tracking...`);
  const afterRes = await fetch(`${BASE_URL}/api/leads/${testCnpj}/tracking`);
  if (!afterRes.ok) {
    throw new Error(`Falha ao consultar tracking pós-acesso: ${afterRes.status}`);
  }
  const afterData = await afterRes.json();
  console.log('   Tracking Atualizado:', {
    has_access: afterData.has_access,
    visualizacoes_dossie: afterData.visualizacoes_dossie,
    ultimo_acesso_dossie: afterData.ultimo_acesso_dossie,
    ip_acesso: afterData.ip_acesso,
    total_historico: afterData.history?.length
  });

  if (afterData.visualizacoes_dossie <= initialViews) {
    throw new Error(`Contador de visualizações não incrementou! Anterior: ${initialViews}, Atual: ${afterData.visualizacoes_dossie}`);
  }
  if (!afterData.has_access) {
    throw new Error('Flag has_access deveria ser true após o acesso ao dossiê!');
  }
  if (!afterData.ultimo_acesso_dossie) {
    throw new Error('Timestamp de último acesso não foi registrado!');
  }

  // 4. Validação dos detalhes do lead via GET /api/leads/:id
  console.log(`\n[4/4] Validando persistência nas queries de detalhe e lista de leads...`);
  const leadDetailRes = await fetch(`${BASE_URL}/api/leads/${testCnpj}`);
  if (leadDetailRes.ok) {
    const leadDetailJson = await leadDetailRes.json();
    const leadDetail = leadDetailJson.data || leadDetailJson;
    console.log('   Colunas de telemetria no lead:', {
      visualizacoes_dossie: leadDetail.visualizacoes_dossie,
      ultimo_acesso_dossie: leadDetail.ultimo_acesso_dossie,
      ip_acesso: leadDetail.ip_acesso
    });
    if (leadDetail.visualizacoes_dossie === undefined) {
      throw new Error('Campo visualizacoes_dossie ausente no retorno detalhado do lead!');
    }
  }

  console.log('\n🎉 SUCESSO: Todos os testes do Motor de Telemetria e Captura (Fase 40 - Etapa 1) foram aprovados!');
}

runTelemetryTests().catch(err => {
  console.error('\n❌ ERRO NA HOMOLOGAÇÃO:', err.message);
  process.exit(1);
});
