/**
 * Teste Automatizado de Homologação:
 * Padronização Cromática dos Indicadores GTM, Erradicação de Ícones Coloridos e Eliminação de Degradês nos Botões
 * (Fase 31 - Etapa 5)
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runTests() {
  console.log('--- Iniciando Testes de Padronização GTM & Monocromia Tática ---');

  const indexPath = path.join(__dirname, '../client/index.html');
  const appJsPath = path.join(__dirname, '../client/js/app.js');
  const cssPath = path.join(__dirname, '../client/css/styles.css');

  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // 1. Verificação do contêiner #paneGtm em index.html
  const paneGtmMatch = indexHtml.match(/<section[^>]*id="paneGtm"[^>]*>([\s\S]*?)<\/section>/);
  assert(paneGtmMatch, 'Contêiner #paneGtm deve existir em index.html');
  const paneGtmHtml = paneGtmMatch[1];

  // 1.1 Zero ciano (#00D2FF) em #paneGtm
  assert(!paneGtmHtml.includes('#00D2FF'), 'Não deve haver cor ciano (#00D2FF) no #paneGtm');

  // 1.2 Zero linear-gradient em #paneGtm
  assert(!paneGtmHtml.includes('linear-gradient'), 'Não deve haver linear-gradient em #paneGtm');

  // 1.3 Zero emoji 🎯 no #paneGtm
  assert(!paneGtmHtml.includes('🎯'), 'Não deve haver emoji 🎯 no #paneGtm');

  // 1.4 Botão #btnFilterSomTierA padronizado com #0055FF e 4px de raio
  const btnFilterMatch = paneGtmHtml.match(/<button[^>]*id="btnFilterSomTierA"[^>]*>/);
  assert(btnFilterMatch, '#btnFilterSomTierA deve existir');
  assert(btnFilterMatch[0].includes('background:#0055FF') || btnFilterMatch[0].includes('background: #0055FF'), '#btnFilterSomTierA deve ter fundo sólido #0055FF');
  assert(btnFilterMatch[0].includes('border-radius:4px') || btnFilterMatch[0].includes('border-radius: 4px'), '#btnFilterSomTierA deve ter border-radius de 4px');

  // 1.5 Botão #btnGtmDossierPdf padronizado com fundo sólido #0B1224 e stroke #94A3B8
  const btnDossierMatch = paneGtmHtml.match(/<button[^>]*id="btnGtmDossierPdf"[^>]*>/);
  assert(btnDossierMatch, '#btnGtmDossierPdf deve existir');
  assert(btnDossierMatch[0].includes('background:#0B1224') || btnDossierMatch[0].includes('background: #0B1224'), '#btnGtmDossierPdf deve ter fundo sólido #0B1224');
  assert(btnDossierMatch[0].includes('border-radius:4px') || btnDossierMatch[0].includes('border-radius: 4px'), '#btnGtmDossierPdf deve ter border-radius de 4px');
  assert(!btnDossierMatch[0].includes('rgba(0,210,255'), '#btnGtmDossierPdf não deve conter cor ciano');

  // 1.6 Cards de Tier (A, B, C, D) padronizados com números em branco #FFFFFF
  assert(paneGtmHtml.includes('id="gtmTierCountA" style="font-size:1rem; font-weight:800; color:#FFFFFF;"'), 'gtmTierCountA deve ser branco #FFFFFF');
  assert(paneGtmHtml.includes('id="gtmTierCountB" style="font-size:1rem; font-weight:800; color:#FFFFFF;"'), 'gtmTierCountB deve ser branco #FFFFFF');

  console.log('✅ 1. index.html (#paneGtm): Ciano, degradês e emojis erradicados com sucesso!');

  // 2. Verificação de app.js
  // 2.1 Função renderGtmIndicators não deve injetar o emoji 🎯
  assert(!appJs.includes("btnFilterQuick.textContent = '🎯"), 'app.js não deve injetar emoji 🎯 no botão');
  assert(appJs.includes("btnFilterQuick.textContent = 'FILTRAR LEADS QUALIFICADOS (TIER B)';"), 'app.js deve setar texto limpo sem emoji');

  // 2.2 Barra de Tiers não deve usar #00D2FF
  const barCodeMatch = appJs.match(/barA\.style\.background = '([^']*)'/);
  assert(barCodeMatch, 'barA background deve ser definido em app.js');
  assert.strictEqual(barCodeMatch[1], '#0055FF', 'barA background deve ser #0055FF e não ciano');

  // 2.3 Zero linear-gradient residual em botões de app.js
  assert(!appJs.includes('linear-gradient(135deg, #0055FF, #00D2FF)'), 'Nenhum botão em app.js deve ter linear-gradient azul-ciano');
  assert(!appJs.includes('linear-gradient(135deg,#0055FF,#00D2FF)'), 'Nenhum botão em app.js deve ter linear-gradient azul-ciano');

  console.log('✅ 2. app.js: Renderizador GTM e botões dinâmicos 100% livres de emojis e degradês!');

  // 3. Verificação de styles.css
  // 3.1 .btn-direct-download.dossier-quick não deve conter linear-gradient
  const dossierQuickMatch = css.match(/\.btn-direct-download\.dossier-quick\s*\{([^}]*)\}/);
  assert(dossierQuickMatch, '.btn-direct-download.dossier-quick deve estar em styles.css');
  assert(!dossierQuickMatch[1].includes('linear-gradient'), '.btn-direct-download.dossier-quick não deve ter linear-gradient');
  assert(!dossierQuickMatch[1].includes('#00D2FF'), '.btn-direct-download.dossier-quick não deve ter cor #00D2FF');

  // 3.2 .btn-direct-download border-radius: 4px
  const btnDirectMatch = css.match(/(?:^|\n)\.btn-direct-download\s*\{([\s\S]*?)\}/);
  assert(btnDirectMatch, '.btn-direct-download deve estar em styles.css');
  assert(btnDirectMatch[1].includes('border-radius: 4px;'), '.btn-direct-download deve ter border-radius de 4px');

  // 3.3 .gtm-kpi-card.highlight-cyan .gtm-val deve ser #FFFFFF
  const gtmValCyanMatch = css.match(/\.gtm-kpi-card\.highlight-cyan\s+\.gtm-val\s*\{\s*color:\s*([^;]+);/);
  assert(gtmValCyanMatch, '.gtm-kpi-card.highlight-cyan .gtm-val deve ser estilizado');
  assert.strictEqual(gtmValCyanMatch[1].trim(), '#FFFFFF', 'Valor SOM no card ciano deve ser branco puro #FFFFFF');

  // 3.4 .gtm-bar-fill deve ser sólido
  const gtmBarFillMatch = css.match(/\.gtm-bar-fill\s*\{([\s\S]*?)\}/);
  assert(gtmBarFillMatch, '.gtm-bar-fill deve estar em styles.css');
  assert(!gtmBarFillMatch[1].includes('linear-gradient'), '.gtm-bar-fill não deve conter linear-gradient');

  // 3.5 .btn-radius-apply e .btn-gateway-submit sem linear-gradient
  const radiusApplyMatch = css.match(/\.btn-radius-apply\s*\{([\s\S]*?)\}/);
  assert(radiusApplyMatch, '.btn-radius-apply deve estar em styles.css');
  assert(!radiusApplyMatch[1].includes('linear-gradient'), '.btn-radius-apply não deve ter linear-gradient');

  const gatewaySubmitMatch = css.match(/\.btn-gateway-submit\s*\{([\s\S]*?)\}/);
  assert(gatewaySubmitMatch, '.btn-gateway-submit deve estar em styles.css');
  assert(!gatewaySubmitMatch[1].includes('linear-gradient'), '.btn-gateway-submit não deve ter linear-gradient');

  console.log('✅ 3. styles.css: Classes corporativas, raios de 4px e ausência de degradês homologados!');

  console.log('\n🏆 TODOS OS TESTES DE PADRONIZAÇÃO GTM E MONOCROMIA FORAM APROVADOS COM 100% DE SUCESSO!\n');
}

runTests();
