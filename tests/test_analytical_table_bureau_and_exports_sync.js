/**
 * test_analytical_table_bureau_and_exports_sync.js
 * 
 * Bateria de Testes Automatizados para:
 * 1. Botão [Enriquecer Bureau (Lote)] na Barra de Ações em Massa.
 * 2. Simetrização B2B / Agro: Tier no Produtor Rural e WhatsApp Direto + Status no B2B.
 * 3. Erradicação de emojis na Tabela Analítica (substituição por SVGs corporativos).
 * 4. Sincronismo das Exportações: comercial_b2b_maquinas e meta_ads_agro.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('==================================================================');
console.log('🧪 INICIANDO SUÍTE DE TESTES: TABELA ANALÍTICA, BUREAU & EXPORTAÇÕES');
console.log('==================================================================\n');

// ── Teste 1: Botão do Bureau em Lote na Barra de Ações em Massa ──
console.log('▶ Teste 1: Validação do Botão #btnBulkEnrichBureau no index.html...');
const indexPath = path.join(rootDir, 'client', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

assert(indexHtml.includes('id="btnBulkEnrichBureau"'), 'Botão #btnBulkEnrichBureau deve existir em index.html');
assert(indexHtml.includes('id="labelBulkEnrichBureau"'), 'Elemento #labelBulkEnrichBureau deve existir para feedback de loading');
assert(indexHtml.includes('btn-dispatch-bureau'), 'Botão de bureau deve ter classe .btn-dispatch-bureau');
console.log('  ✅ [PASS] Botão #btnBulkEnrichBureau posicionado com sucesso ao lado do Meta Ads!\n');

// ── Teste 2: Simetrização da Tabela no app.js (B2B com WhatsApp e Status) ──
console.log('▶ Teste 2: Simetrização de Cabeçalho e Linhas da Tabela B2B...');
const appJsPath = path.join(rootDir, 'client', 'js', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

assert(appJs.includes('<th>WHATSAPP DIRETO</th>'), 'Cabeçalho B2B deve incluir WHATSAPP DIRETO');
assert(appJs.includes('<th>STATUS COMERCIAL</th>'), 'Cabeçalho B2B deve incluir STATUS COMERCIAL');
assert(appJs.includes('cleanB2bPhone'), 'app.js deve computar cleanB2bPhone para link direto de WhatsApp no B2B');
assert(appJs.includes('b2bStatusClass'), 'app.js deve computar b2bStatusClass para pills de status no B2B');
assert(appJs.includes('colspan="13"'), 'app.js deve usar colspan 13 para linhas expandidas B2B');
console.log('  ✅ [PASS] Tabela B2B simetrizada com WhatsApp Direto e Status Comercial!\n');

// ── Teste 3: Tier Agro e Ausência de Emojis de Rede Social ──
console.log('▶ Teste 3: Validação de Tier Agro e Ausência de Emojis em app.js...');
assert(appJs.includes('badge-tier-agro'), 'app.js deve renderizar a classe .badge-tier-agro para Produtores Rurais');
assert(appJs.includes('agroTier'), 'app.js deve calcular a heurística de agroTier (TIER A/B/C)');

// Extrai o escopo da função renderTable para garantir erradicação total de emojis na tabela analítica
const renderTableStart = appJs.indexOf('function renderTable(');
const renderTableEnd = appJs.indexOf('function initTableSorting(') > -1 ? appJs.indexOf('function initTableSorting(') : renderTableStart + 25000;
const renderTableCode = appJs.slice(renderTableStart, renderTableEnd);

const emojiList = ['🌱', '🌾', '🚜', '💧 Pivô Viável', '☁️ Sequeiro', '🔥 Interessado', '⏳ Compra Prevista', '📞 Contato Pronto', '❄️ Sem Contato', '<span>🔍 Bureau</span>'];
for (const emojiItem of emojiList) {
  assert(!renderTableCode.includes(emojiItem), `renderTable não deve conter o emoji textual: "${emojiItem}"`);
}
console.log('  ✅ [PASS] Emojis casuais erradicados da Tabela Analítica e substituídos por SVGs técnicos!\n');

// ── Teste 4: Sincronismo da Planilha Comercial B2B (exportController.js) ──
console.log('▶ Teste 4: Sincronismo e Novas Colunas em exportController.js...');
const exportCtrlPath = path.join(rootDir, 'server', 'src', 'controllers', 'exportController.js');
const exportCtrl = fs.readFileSync(exportCtrlPath, 'utf8');

assert(exportCtrl.includes("'TIPO_CADASTRO'"), 'comercial_b2b_maquinas deve exportar TIPO_CADASTRO');
assert(exportCtrl.includes("'ICP_TIER'"), 'comercial_b2b_maquinas deve exportar ICP_TIER');
assert(exportCtrl.includes("'SCORE_QUALIFICACAO'"), 'comercial_b2b_maquinas deve exportar SCORE_QUALIFICACAO');
assert(exportCtrl.includes('tipoCadastro'), 'exportController deve computar tipoCadastro (PF vs PJ)');
assert(exportCtrl.includes('icpTier'), 'exportController deve computar icpTier e icpScore');
console.log('  ✅ [PASS] Exportação Comercial B2B sincronizada com ICP_TIER, SCORE e TIPO_CADASTRO!\n');

// ── Teste 5: Estilização CSS e Hover do Botão Bureau em Lote ──
console.log('▶ Teste 5: Estilização do Botão de Bureau e Badge de Tier no styles.css...');
const cssPath = path.join(rootDir, 'client', 'css', 'styles.css');
const css = fs.readFileSync(cssPath, 'utf8');

assert(css.includes('.btn-dispatch-bureau:hover'), 'styles.css deve ter estilo para .btn-dispatch-bureau:hover');
assert(css.includes('.badge-tier-agro'), 'styles.css deve ter estilo para .badge-tier-agro');
console.log('  ✅ [PASS] Classes CSS para Bureau em Lote e Tier Agro validadas com sucesso!\n');

console.log('==================================================================');
console.log('🏁 RESULTADO: 5/5 TESTES DE SINCRONISMO E INTERFACE APROVADOS (100%)');
console.log('==================================================================');
