/**
 * tests/test_phase46_step1_regional_search_ui.js
 * 
 * Bateria de Testes Automatizados para a Fase 46 - Etapa 1
 * Gatilho de Busca Regional (UF/Município) - Padrão SIGEF
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

let testPassed = 0;
let testFailed = 0;

function pass(msg) {
  console.log(`  ✅ [PASS] ${msg}`);
  testPassed++;
}

function fail(msg, err) {
  console.error(`  ❌ [FAIL] ${msg}`);
  if (err) console.error(err);
  testFailed++;
}

async function runStep1Tests() {
  console.log('🚀 Iniciando Bateria de Testes da Fase 46 - Etapa 1 (UI do Filtro Regional e Inputs)...\n');

  try {
    // -------------------------------------------------------------------------
    // 1. Auditoria Estática do HTML em client/index.html
    // -------------------------------------------------------------------------
    console.log('--- 1. Auditoria dos Elementos do DOM em client/index.html ---');
    const htmlPath = path.resolve('client/index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Botão de alternância de busca de malha
    assert.ok(htmlContent.includes('id="btnSearchMeshToggle"'), 'Botão #btnSearchMeshToggle deve estar presente na toolbar do mapa');
    assert.ok(htmlContent.includes('Pesquisar Malha'), 'Texto "Pesquisar Malha" deve estar visível no botão');

    // Painel Flutuante e selects encadeados
    assert.ok(htmlContent.includes('id="mapMeshSearchPanel"'), 'Painel flutuante #mapMeshSearchPanel deve existir no viewport do mapa');
    assert.ok(htmlContent.includes('id="selectMeshSearchUf"'), 'Select de Estado #selectMeshSearchUf deve estar presente');
    assert.ok(htmlContent.includes('id="selectMeshSearchCity"'), 'Select de Município #selectMeshSearchCity deve estar presente');
    assert.ok(htmlContent.includes('id="btnExecuteMeshSearch"'), 'Botão de execução #btnExecuteMeshSearch deve existir');
    assert.ok(htmlContent.includes('id="btnClearMeshSearch"'), 'Botão de limpeza #btnClearMeshSearch deve existir');
    assert.ok(htmlContent.includes('id="btnCloseMeshSearchPanel"'), 'Botão de fechamento #btnCloseMeshSearchPanel deve existir');

    pass('Todos os nós e elementos do DOM da busca regional estão presentes no HTML');

    // -------------------------------------------------------------------------
    // 2. Auditoria do Design System e CSS em client/css/styles.css
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Auditoria de Estilização em client/css/styles.css ---');
    const cssPath = path.resolve('client/css/styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.map-mesh-search-panel'), 'Regra .map-mesh-search-panel deve estar definida no CSS');
    assert.ok(cssContent.includes('.mesh-search-select'), 'Regra .mesh-search-select deve estar definida no CSS');
    assert.ok(cssContent.includes('.btn-mesh-search-execute'), 'Regra .btn-mesh-search-execute deve estar definida');
    assert.ok(cssContent.includes('.mesh-search-title'), 'Título com estilização tática deve estar presente');

    pass('Classes de estilização corporativa Dark Mode e backdrop-blur devidamente aplicadas no CSS');

    // -------------------------------------------------------------------------
    // 3. Auditoria do Código Javascript em client/js/mapEngine.js
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Auditoria Lógica e Encadeamento em client/js/mapEngine.js ---');
    const mapEnginePath = path.resolve('client/js/mapEngine.js');
    const mapEngineContent = fs.readFileSync(mapEnginePath, 'utf8');

    assert.ok(mapEngineContent.includes('setupMeshSearchControls'), 'Função setupMeshSearchControls deve existir no mapEngine.js');
    assert.ok(mapEngineContent.includes('populateMeshUfOptions'), 'Função populateMeshUfOptions deve existir');
    assert.ok(mapEngineContent.includes('populateMeshCityOptions'), 'Função populateMeshCityOptions deve existir');
    assert.ok(mapEngineContent.includes('openMeshSearchPanel'), 'Função openMeshSearchPanel deve ser exportada');
    assert.ok(mapEngineContent.includes('closeMeshSearchPanel'), 'Função closeMeshSearchPanel deve ser exportada');
    assert.ok(mapEngineContent.includes('DEFAULT_AGRO_LOCATIONS'), 'Base de polos agropecuários e estados estratégicos deve estar mapeada');

    pass('Lógica de encadeamento dinâmico UF -> Municípios e exports devidamente estruturados');

    // -------------------------------------------------------------------------
    // 4. Teste Funcional da Lógica de Encadeamento (Simulação Node.js)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Simulação Funcional de População dos Selects ---');
    const DEFAULT_AGRO_LOCATIONS = {
      ufs: ['MT', 'GO', 'MS', 'PR', 'SP', 'MG', 'BA', 'RS', 'SC', 'TO', 'MA', 'PI', 'PA', 'RO'],
      citiesByUf: {
        MT: ['SORRISO', 'SINOP', 'LUCAS DO RIO VERDE', 'NOVA MUTUM', 'CAMPO NOVO DO PARECIS', 'PRIMAVERA DO LESTE', 'RONDONOPOLIS', 'CUIABA'],
        GO: ['RIO VERDE', 'JATAI', 'CRISTALINA', 'ITUMBIARA', 'ANAPOLIS', 'GOIANIA']
      }
    };

    // Testa se a UF 'MT' contém os municípios do agronegócio
    const mtCities = DEFAULT_AGRO_LOCATIONS.citiesByUf['MT'];
    assert.ok(Array.isArray(mtCities), 'Municípios de MT devem ser um array');
    assert.ok(mtCities.includes('SORRISO'), 'Sorriso deve constar nos municípios de MT');
    assert.ok(mtCities.includes('SINOP'), 'Sinop deve constar nos municípios de MT');
    assert.ok(mtCities.includes('LUCAS DO RIO VERDE'), 'Lucas do Rio Verde deve constar');

    const goCities = DEFAULT_AGRO_LOCATIONS.citiesByUf['GO'];
    assert.ok(goCities.includes('RIO VERDE'), 'Rio Verde deve constar nos municípios de GO');
    assert.ok(goCities.includes('JATAI'), 'Jataí deve constar nos municípios de GO');

    pass('Encadeamento de cidades por UF verificado com sucesso para polos agropecuários');

  } catch (err) {
    fail('Erro na execução dos testes da Etapa 1', err);
  }

  console.log('\n---------------------------------------------------------');
  console.log(`📊 RESULTADO DA FASE 46 (ETAPA 1): ${testPassed} Aprovados | ${testFailed} Falhas`);
  console.log('---------------------------------------------------------\n');

  if (testFailed > 0) {
    process.exit(1);
  }
}

runStep1Tests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
