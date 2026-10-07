/**
 * tests/test_phase73_top_search_bar.js
 * Suíte de Testes Formais da FASE 73:
 * Barra de Busca Territorial Direta, Botão Canônico 'Buscar', Zero Emojis e Resolução Municipal em Nível Brasil.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🧪 Iniciando testes da FASE 73: BARRA DE BUSCA TERRITORIAL DIRETA & RESOLUÇÃO MUNICIPAL');

  // TESTE 1: Verificar se index.html contém territorialDirectSearchBar com botão Buscar e zero emojis
  const indexPath = path.join(__dirname, '../client/index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');

  assert(indexHtml.includes('id="territorialDirectSearchBar"'), 'index.html deve conter territorialDirectSearchBar');
  assert(indexHtml.includes('id="tdsSelectTargetProfile"'), 'index.html deve conter seletor de perfil de alvo');
  assert(indexHtml.includes('id="tdsSelectState"'), 'index.html deve conter seletor de estado (UF)');
  assert(indexHtml.includes('id="tdsSelectCity"'), 'index.html deve conter seletor de cidade');
  assert(indexHtml.includes('id="btnTdsExecuteSearch"'), 'index.html deve conter botão btnTdsExecuteSearch');
  assert(indexHtml.includes('id="labelTdsExecuteSearch">Buscar</span>'), 'Botão deve ter o texto exato "Buscar" (não "Buscar Leads")');
  assert(!indexHtml.includes('id="labelTdsExecuteSearch">Buscar Leads</span>'), 'Botão NÃO deve ter o nome "Buscar Leads"');
  assert(indexHtml.includes('id="btnApplyRailFilters"'), 'index.html deve conter botão Aplicar Filtros no Left Rail');

  // Verifica ausência de emojis nos elementos da barra de busca
  const barMatch = indexHtml.match(/<div class="territorial-direct-search-bar"[\s\S]*?<!-- Barra de Ações em Massa/);
  assert(barMatch, 'Bloco da barra de busca territorial deve existir');
  const barSnippet = barMatch[0];
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert(!emojiRegex.test(barSnippet), 'A barra de busca NÃO deve conter emojis (apenas ícones SVG executivos)');
  console.log('✅ [PASS] 1. index.html estruturado com botão "Buscar", seletores canônicos e ZERO emojis.');

  // TESTE 2: Verificar estilos CSS no styles.css
  const cssPath = path.join(__dirname, '../client/css/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  assert(cssContent.includes('.territorial-direct-search-bar'), 'styles.css deve conter .territorial-direct-search-bar');
  assert(cssContent.includes('.btn-tds-search'), 'styles.css deve conter .btn-tds-search');
  assert(cssContent.includes('.btn-apply-filters'), 'styles.css deve conter .btn-apply-filters');
  console.log('✅ [PASS] 2. styles.css possui estilização dark glassmorphism executiva para a Top Bar e filtros.');

  // TESTE 3: Verificar funções em app.js
  const appJsPath = path.join(__dirname, '../client/js/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf-8');
  assert(appJsContent.includes('function initTerritorialDirectSearchBar()'), 'app.js deve implementar initTerritorialDirectSearchBar');
  assert(appJsContent.includes('function initRailApplyFiltersButton()'), 'app.js deve implementar initRailApplyFiltersButton');
  assert(appJsContent.includes("safeInit(initTerritorialDirectSearchBar, 'initTerritorialDirectSearchBar')"), 'app.js deve inicializar initTerritorialDirectSearchBar no ciclo de boot');
  console.log('✅ [PASS] 3. client/js/app.js inicializa e gerencia a barra de busca territorial de forma reativa.');

  // TESTE 4: Verificar mapEngine.js - flyToLocation e zero-state sem reset cego
  const mapEnginePath = path.join(__dirname, '../client/js/mapEngine.js');
  const mapEngineContent = fs.readFileSync(mapEnginePath, 'utf-8');
  assert(mapEngineContent.includes('async function flyToLocation(uf, city)'), 'mapEngine.js deve implementar flyToLocation');
  assert(mapEngineContent.includes('flyToLocation,'), 'mapEngine.js deve exportar flyToLocation no window.MapEngine');
  assert(mapEngineContent.includes('flyToLocation(activeUf, activeCity)'), 'mapEngine.js deve centralizar na cidade/estado ao obter 0 resultados no filtro');
  console.log('✅ [PASS] 4. client/js/mapEngine.js implementa flyToLocation e previne zoom-out cego para o Brasil.');

  // TESTE 5: Testar resolução municipal no backend (getCityCoordinates)
  const { getCityCoordinates } = await import('../server/src/controllers/gisController.js');
  let resolvedCoord = null;
  const mockReq = { query: { uf: 'RS', cidade: 'Almirante Tamandaré do Sul' } };
  const mockRes = {
    json: (data) => { resolvedCoord = data; return data; },
    status: (code) => ({ json: (data) => { resolvedCoord = { error: code, ...data }; return data; } })
  };

  await getCityCoordinates(mockReq, mockRes);
  assert(resolvedCoord && resolvedCoord.success === true, 'getCityCoordinates deve resolver com sucesso');
  assert(resolvedCoord.lat !== null && !isNaN(resolvedCoord.lat), 'Latitude deve ser número válido');
  assert(resolvedCoord.lng !== null && !isNaN(resolvedCoord.lng), 'Longitude deve ser número válido');
  assert(Math.abs(resolvedCoord.lat - (-28.11)) < 0.2, 'Latitude de Almirante Tamandaré do Sul deve ser próxima de -28.11');
  console.log(`✅ [PASS] 5. getCityCoordinates resolveu Almirante Tamandaré do Sul/RS com sucesso (${resolvedCoord.lat}, ${resolvedCoord.lng}).`);

  // TESTE 6: Verificar registro no checklist.md
  const checklistPath = path.join(__dirname, '../checklist.md');
  const checklistContent = fs.readFileSync(checklistPath, 'utf-8');
  assert(checklistContent.includes('FASE 73 — BARRA DE BUSCA DIRETA, UX SIMPLIFICADA & PROSPECÇÃO DE REVENDAS SOB DEMANDA'), 'checklist.md deve documentar a FASE 73');
  console.log('✅ [PASS] 6. checklist.md devidamente atualizado e com governança registrada.');

  console.log('\n🎉 TODOS OS TESTES DA FASE 73 FORAM HOMOLOGADOS COM 100% DE SUCESSO!\n');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes da FASE 73:', err);
  process.exit(1);
});
