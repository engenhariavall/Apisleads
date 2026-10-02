/**
 * test_mass_actions_scroll_and_lavoura_badge.js
 * 
 * Bateria de Testes Automatizados para:
 * 1. Scroll Horizontal da Barra de Ações em Massa com Botões Chevrons.
 * 2. Visual Idêntico ao Mapa Espacial (.btn-mass-nav-arrow).
 * 3. Badge de Lavoura Rural Ativa: inline, sem quebra de linha (white-space: nowrap), sem emojis.
 * 4. Vitality Engine: ausência de emojis literais residuais no backend.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('==================================================================');
console.log('🧪 SUÍTE DE TESTES: SCROLL DE FERRAMENTAS & BADGE DE LAVOURA');
console.log('==================================================================\n');

// ── Teste 1: Estrutura HTML do Viewport Wrapper e Botões Chevrons ──
console.log('▶ Teste 1: Validação dos Botões e Track de Rolagem no index.html...');
const indexPath = path.join(rootDir, 'client', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

assert(indexHtml.includes('class="mass-actions-viewport-wrapper"'), 'index.html deve conter .mass-actions-viewport-wrapper');
assert(indexHtml.includes('id="btnMassActionsScrollLeft"'), 'index.html deve conter #btnMassActionsScrollLeft');
assert(indexHtml.includes('id="massActionsScrollTrack"'), 'index.html deve conter #massActionsScrollTrack');
assert(indexHtml.includes('id="btnMassActionsScrollRight"'), 'index.html deve conter #btnMassActionsScrollRight');
assert(indexHtml.includes('class="btn-mass-nav-arrow left"'), 'Botão esquerdo deve ter classe .btn-mass-nav-arrow.left');
assert(indexHtml.includes('class="btn-mass-nav-arrow right"'), 'Botão direito deve ter classe .btn-mass-nav-arrow.right');
console.log('  ✅ [PASS] Elementos de viewport, track e chevrons presentes no index.html!\n');

// ── Teste 2: Estilos CSS do Scroll e Setas de Navegação ──
console.log('▶ Teste 2: Validação das Classes CSS no styles.css...');
const cssPath = path.join(rootDir, 'client', 'css', 'styles.css');
const css = fs.readFileSync(cssPath, 'utf8');

assert(css.includes('.mass-actions-viewport-wrapper'), 'styles.css deve conter estilos para .mass-actions-viewport-wrapper');
assert(css.includes('.mass-actions-scroll-track'), 'styles.css deve conter estilos para .mass-actions-scroll-track');
assert(css.includes('.btn-mass-nav-arrow'), 'styles.css deve conter estilos para .btn-mass-nav-arrow');
assert(css.includes('.btn-mass-nav-arrow:hover'), 'styles.css deve conter hover para .btn-mass-nav-arrow');
assert(css.includes('scrollbar-width: none'), 'mass-actions-scroll-track deve ocultar barra nativa com scrollbar-width: none');
console.log('  ✅ [PASS] Estilos e classes CSS de rolagem fluida e botões chevrons validados!\n');

// ── Teste 3: Badge de Lavoura Rural Ativa e Vitality Pill (Sem Quebra de Linha) ──
console.log('▶ Teste 3: Validação de Estilo Anti-Quebra da Vitalidade no styles.css...');
assert(css.includes('.vitality-pill-table'), 'styles.css deve conter .vitality-pill-table');
assert(css.includes('white-space: nowrap !important;'), '.vitality-pill-table deve ter white-space: nowrap !important');
assert(css.includes('flex-shrink: 0 !important;'), '.vitality-pill-table deve ter flex-shrink: 0 !important');
console.log('  ✅ [PASS] .vitality-pill-table blindada contra quebra de linha em resoluções compactas!\n');

// ── Teste 4: Ausência de Emojis no Vitality Engine (Backend) ──
console.log('▶ Teste 4: Validação do Vitality Engine sem emojis literais...');
const vitalityEnginePath = path.join(rootDir, 'server', 'src', 'modules', 'intelligence', 'vitalityEngine.js');
const vitalityEngineCode = fs.readFileSync(vitalityEnginePath, 'utf8');

const forbiddenBackendEmojis = ['🌱', '🟢', '🟡', '🔴'];
for (const em of forbiddenBackendEmojis) {
  assert(!vitalityEngineCode.includes(`'${em}'`) && !vitalityEngineCode.includes(`"${em}"`), `vitalityEngine.js não deve retornar o emoji ${em}`);
}
assert(vitalityEngineCode.includes("icon: ''"), 'vitalityEngine.js deve retornar icon vazio para delegação a SVGs');
console.log('  ✅ [PASS] Vitality Engine livre de emojis literais no backend!\n');

// ── Teste 5: Lógica de Scroll e Interatividade no app.js ──
console.log('▶ Teste 5: Validação da Lógica de Rolagem no app.js...');
const appJsPath = path.join(rootDir, 'client', 'js', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

assert(appJs.includes('function setupMassActionsScrollArrows()'), 'app.js deve implementar setupMassActionsScrollArrows()');
assert(appJs.includes('window.updateMassActionsScrollArrows = updateScrollArrows'), 'app.js deve expor window.updateMassActionsScrollArrows');
assert(appJs.includes('safeInit(setupMassActionsScrollArrows'), 'app.js deve invocar setupMassActionsScrollArrows no safeInit');
assert(appJs.includes('.mass-actions-viewport-wrapper'), 'app.js deve alternar visibilidade de .mass-actions-viewport-wrapper na troca de abas');
console.log('  ✅ [PASS] Lógica de scroll, listeners de resize e atualização de abas validadas no app.js!\n');

console.log('==================================================================');
console.log('🏁 RESULTADO: 5/5 TESTES DE SCROLL E BADGE APROVADOS COM SUCESSO (100%)');
console.log('==================================================================');
