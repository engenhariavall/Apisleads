import fs from 'fs';
import path from 'path';

async function testEtapa5() {
  console.log('--- [TESTE FASE 27 - ETAPA 5: EXPORTADOR DE PÚBLICOS PARA TRÁFEGO PAGO] ---');

  // 1. Testa a chamada direta no endpoint de exportação de custom audiences
  console.log('1. Testando rota POST /api/export/custom-audiences...');
  const response = await fetch('http://localhost:3000/api/export/custom-audiences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filters: { limit: 10 }
    })
  });

  if (!response.ok) {
    throw new Error(`Falha na requisição HTTP: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();
  console.log(`✅ CSV gerado com sucesso! Tamanho: ${csvText.length} bytes.`);

  // 2. Validação dos cabeçalhos do CSV mastigado
  const firstLine = csvText.split('\r\n')[0].replace(/^\uFEFF/, '');
  console.log('✅ Cabeçalho do CSV:', firstLine);

  const expectedHeaders = ['fn', 'ln', 'email', 'phone', 'city', 'state', 'country', 'company', 'cnpj'];
  for (const h of expectedHeaders) {
    if (!firstLine.includes(h)) {
      throw new Error(`Coluna obrigatória ausente no cabeçalho do CSV: "${h}"`);
    }
  }
  console.log('✅ Todas as colunas exigidas para upload direto em Custom Audiences (fn, ln, email, phone, city...) estão presentes!');

  // 3. Validação dos botões e funções no Frontend
  const indexHtml = fs.readFileSync(path.resolve('client/index.html'), 'utf-8');
  if (!indexHtml.includes('id="btnExportCustomAudiencesHeader"')) {
    throw new Error('Botão btnExportCustomAudiencesHeader não encontrado no Header em index.html.');
  }
  if (!indexHtml.includes('value="custom_audiences_raw"')) {
    throw new Error('Opção de rádio custom_audiences_raw não encontrada no modal de exportação em index.html.');
  }
  console.log('✅ Botão no Header [🎯 Exportar Públicos (Meta/Google Ads)] e opção no modal confirmados em index.html.');

  const appJs = fs.readFileSync(path.resolve('client/js/app.js'), 'utf-8');
  if (!appJs.includes('window.exportCustomAudiencesAction') || !appJs.includes('custom_audiences_raw')) {
    throw new Error('Lógica de exportação de públicos de tráfego pago não encontrada em app.js.');
  }
  console.log('✅ Função global window.exportCustomAudiencesAction e suporte a custom_audiences_raw confirmados em app.js.');

  console.log('🎉 ETAPA 5 VALIDADA COM SUCESSO: Exportador de públicos mastigados para Meta Ads & Google Ads 100% operacional!');
  process.exit(0);
}

testEtapa5().catch(err => {
  console.error('❌ Falha na validação da Etapa 5:', err.message);
  process.exit(1);
});
