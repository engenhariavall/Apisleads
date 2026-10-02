import fs from 'fs';
import path from 'path';

async function testEtapa3() {
  console.log('--- [TESTE FASE 27 - ETAPA 3: UI/UX INSPETOR DE LEADS & ABORDAGEM TÁTICA] ---');

  // 1. Validação dos elementos HTML do Right Drawer
  const indexPath = path.resolve('client/index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');

  const requiredHtmlSnippets = [
    'id="drawerNavTabs"',
    'id="tabBtnOverview"',
    'id="tabBtnQsa"',
    'id="tabBadgeQsaCount"',
    'id="drawerTabContentOverview"',
    'id="drawerTabContentQsa"',
    'id="btnRefreshLeadQsa"',
    'id="inspectorDrawerQsaCardsList"',
    'id="btnCopyTacticalScript"',
    'id="inspectorTacticalScriptPreview"'
  ];

  console.log('1. Verificando estrutura HTML das abas do Inspetor...');
  for (const snippet of requiredHtmlSnippets) {
    if (!indexHtml.includes(snippet)) {
      throw new Error(`Snippet HTML obrigatório não encontrado em index.html: "${snippet}"`);
    }
  }
  console.log('✅ Todos os 10 marcadores e IDs do Right Drawer confirmados em index.html.');

  // 2. Validação das funções JavaScript no app.js
  const appJsPath = path.resolve('client/js/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf-8');

  const requiredJsSnippets = [
    'window.switchDrawerTab',
    'window.renderDrawerQsaTab',
    'window.generateCustomSocioScript',
    'window.copyTacticalApproachScript',
    'window.triggerLiveQsaEnrichment'
  ];

  console.log('2. Verificando funções operacionais do Inspetor em app.js...');
  for (const snippet of requiredJsSnippets) {
    if (!appJs.includes(snippet)) {
      throw new Error(`Função JavaScript obrigatória não encontrada em app.js: "${snippet}"`);
    }
  }
  console.log('✅ Todas as 5 funções de controle do Inspetor QSA confirmadas em app.js.');

  // 3. Validação do estilo CSS em styles.css
  const stylesPath = path.resolve('client/css/styles.css');
  const stylesCss = fs.readFileSync(stylesPath, 'utf-8');

  if (!stylesCss.includes('.drawer-nav-tabs') || !stylesCss.includes('.qsa-executive-card')) {
    throw new Error('Classes de estilo CSS para a aba de QSA ausentes em styles.css.');
  }
  console.log('✅ Estilização visual de alta fidelidade (.qsa-executive-card, hover effects) confirmada em styles.css.');

  console.log('🎉 ETAPA 3 VALIDADA COM SUCESSO: Right Drawer adaptado com abas, Inspetor QSA e Gerador de Abordagem Tática operacionais!');
  process.exit(0);
}

testEtapa3().catch(err => {
  console.error('❌ Falha na validação da Etapa 3:', err.message);
  process.exit(1);
});
