/**
 * test_niche_cleanup_and_agro_focus.js
 * 
 * Bateria de Testes Automatizados para:
 * 1. Foco Total no Agronegócio: remoção de opções residuais não-agro do seletor de nicho.
 * 2. Limpeza das Verticais de Mercado da Barra Lateral (expurgo de Jurídico, Saúde e Construção Civil).
 * 3. Validação do WorkspaceManager restrito ao Agro por padrão.
 * 4. Verificação de integridade do Plano de Arquitetura Multi-Nicho sob Demanda.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('==================================================================');
console.log('🧪 SUÍTE DE TESTES: LIMPEZA DE NICHOS E FOCO TOTAL NO AGRO');
console.log('==================================================================\n');

// ── Teste 1: Seletor de Nicho no Cabeçalho (index.html) ──
console.log('▶ Teste 1: Validação da Remoção do Seletor Interativo de Nicho...');
const indexPath = path.join(rootDir, 'client', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

assert(!indexHtml.includes('id="workspaceNicheSelectorWrap"'), 'index.html NÃO deve conter o seletor #workspaceNicheSelectorWrap no cabeçalho');
assert(!indexHtml.includes('id="selectActiveWorkspace"'), 'index.html NÃO deve conter o select #selectActiveWorkspace no cabeçalho');
console.log('  ✅ [PASS] Seletor de nicho completamente removido do cabeçalho (foco exclusivo no Tenant)!\n');

// ── Teste 2: Verticais de Mercado na Barra Lateral (index.html) ──
console.log('▶ Teste 2: Validação da Seção Verticais de Mercado na Sidebar...');
assert(indexHtml.includes('id="chipVerticalTodos"'), 'Sidebar deve manter Todas as Verticais');
assert(indexHtml.includes('id="chipVerticalAgro"'), 'Sidebar deve manter Agronegócio');
assert(!indexHtml.includes('id="chipVerticalJuridico"'), 'Sidebar NÃO deve conter botão Jurídico');
assert(!indexHtml.includes('id="chipVerticalSaude"'), 'Sidebar NÃO deve conter botão Saúde');
assert(!indexHtml.includes('id="chipVerticalConstrucao"'), 'Sidebar NÃO deve conter botão Construção Civil');
console.log('  ✅ [PASS] Verticais não-agro expurgadas da barra lateral com sucesso!\n');

// ── Teste 3: WorkspaceManager restrito a Agro ──
console.log('▶ Teste 3: Validação do WorkspaceManager.js...');
const wmPath = path.join(rootDir, 'client', 'js', 'WorkspaceManager.js');
const wmCode = fs.readFileSync(wmPath, 'utf8');

assert(wmCode.includes("DEFAULT_ALLOWED = ['agro']"), "WorkspaceManager deve ter DEFAULT_ALLOWED = ['agro']");
console.log('  ✅ [PASS] WorkspaceManager configurado estritamente para agro por padrão!\n');

// ── Teste 4: Artefato do Plano de Arquitetura Multi-Nicho ──
console.log('▶ Teste 4: Validação do Artefato de Arquitetura sob Demanda...');
const brainDir = path.resolve(rootDir, '..', '..', 'brain');
const artPath = path.join(brainDir, 'a92eaf21-7368-4c07-bff4-0155d9fb5c59', 'plano_arquitetura_multinicho_e_fontes_sob_demanda.md');
assert(fs.existsSync(artPath), 'Artefato plano_arquitetura_multinicho_e_fontes_sob_demanda.md deve existir');
const artContent = fs.readFileSync(artPath, 'utf8');
assert(artContent.includes('Vertical Pluggable Adapters'), 'Artefato deve detalhar os adaptadores plugáveis');
assert(artContent.includes('Jurídico & Advocacia'), 'Artefato deve contemplar nicho jurídico');
assert(artContent.includes('Saúde & Clínicas Médicas'), 'Artefato deve contemplar nicho de saúde');
assert(artContent.includes('Construção Civil & Engenharia'), 'Artefato deve contemplar nicho de construção');
console.log('  ✅ [PASS] Artefato de arquitetura formalizado e disponível para consultas futuras!\n');

console.log('==================================================================');
console.log('🏁 RESULTADO: 4/4 TESTES APROVADOS COM SUCESSO (100%)');
console.log('==================================================================');
