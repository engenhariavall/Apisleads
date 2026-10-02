import { baitReportService } from '../server/src/services/baitReportService.js';

async function testEtapa4() {
  console.log('--- [TESTE FASE 27 - ETAPA 4: ISCA DINÂMICA (CAVALO DE TROIA) & RASTREAMENTO] ---');

  const testCnpj = '33000167000101';
  const customPixelId = '123456789012345';
  const customGtmId = 'GTM-TEST999';

  console.log(`1. Testando geração de dados do relatório para CNPJ ${testCnpj}...`);
  const reportData = await baitReportService.getReportData(testCnpj, {
    pixel_id: customPixelId,
    gtm_id: customGtmId
  });

  console.log('✅ Dados gerados com sucesso:', {
    empresa: reportData.lead.nome,
    decisor: reportData.decisor,
    total_gaps: reportData.topGaps.length,
    metaPixelId: reportData.metaPixelId,
    gtmId: reportData.gtmId
  });

  console.log('2. Testando renderização HTML e injeção de pixels...');
  const html = baitReportService.renderReportHtml(reportData);

  const checks = [
    { name: 'DOCTYPE e HTML', ok: html.includes('<!DOCTYPE html>') },
    { name: 'Razão Social / Nome da Empresa', ok: html.includes(reportData.lead.nome) },
    { name: 'Destinatário Prioritário / Sócio', ok: html.includes(reportData.decisor) },
    { name: 'Injeção Meta Pixel ID', ok: html.includes(customPixelId) && html.includes('fbq(\'init\'') },
    { name: 'Injeção Google Tag Manager', ok: html.includes(customGtmId) && html.includes('googletagmanager.com') },
    { name: 'CTA WhatsApp de Conversão', ok: html.includes('https://wa.me/?text=') },
    { name: 'Zonas de Gaps de Demanda', ok: html.includes('VAZIO') || html.includes('Oportunidade') }
  ];

  let allOk = true;
  for (const c of checks) {
    if (c.ok) {
      console.log(`✅ ${c.name}: Validado.`);
    } else {
      console.error(`❌ ${c.name}: Falhou!`);
      allOk = false;
    }
  }

  if (allOk) {
    console.log('🎉 ETAPA 4 VALIDADA COM SUCESSO: Isca Dinâmica (Cavalo de Troia) e injeção de Pixel/GTM funcionais!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

testEtapa4().catch(err => {
  console.error('❌ Erro no teste da Etapa 4:', err.message);
  process.exit(1);
});
