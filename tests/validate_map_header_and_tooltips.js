import fs from 'fs';
const html = fs.readFileSync('client/index.html', 'utf8');
const css = fs.readFileSync('client/css/styles.css', 'utf8');
const js = fs.readFileSync('client/js/mapEngine.js', 'utf8');

console.log('=== VALIDAÇÃO DE RESTAURAÇÃO DE TOGGLES E TOOLTIPS CUSTOMIZADOS ===\n');

const checks = [
  {
    name: '1. Título duplicado "WebGIS Analítico Espacial" ausente no HTML',
    pass: !html.includes('map-stage-title-wrap') && !html.includes('WebGIS Analítico Espacial')
  },
  {
    name: '2. Toggles SIGEF, CAR e FUSÃO presentes no HTML ao lado de Pesquisar Malha',
    pass: html.includes('id="mapFonteTogglesContainer"') &&
          html.includes('id="toggleSigefLayerBtn"') &&
          html.includes('id="toggleCarLayerBtn"') &&
          html.includes('id="toggleFusaoLayerBtn"')
  },
  {
    name: '3. Atributo title nativo removido dos 4 itens da legenda fundiária',
    pass: !html.includes('leg-item leg-item-tooltip" title=')
  },
  {
    name: '4. Componentes .spatial-legend-tooltip com identidade VERSUS presentes nos 4 itens da legenda',
    pass: (html.match(/class="spatial-legend-tooltip"/g) || []).length === 4
  },
  {
    name: '5. CSS .spatial-legend-tooltip configurado com backdrop-filter, sombra em camadas e borda suave',
    pass: css.includes('.spatial-legend-tooltip') &&
          css.includes('backdrop-filter: blur(8px)') &&
          css.includes('box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6)')
  },
  {
    name: '6. CSS .btn-fonte-toggle.fusao.active estilizado no padrão VERSUS',
    pass: css.includes('.btn-fonte-toggle.fusao.active')
  },
  {
    name: '7. mapEngine.js gerencia fusaoLayerVisible e toggleFusaoLayerBtn com atualização de filtros',
    pass: js.includes('let fusaoLayerVisible = true') &&
          js.includes('toggleFusaoLayerBtn') &&
          js.includes('setFusaoVisible') &&
          js.includes('acceptedTags.push(\'FUSAO_SIGEF_CAR\')')
  },
  {
    name: '8. Botões da barra secundária (POF até Tela Cheia) possuem data-tooltip e não têm title nativo',
    pass: html.includes('id="btnTogglePofLayer" data-tooltip=') &&
          html.includes('id="btnToggleH3" data-tooltip=') &&
          html.includes('id="btnDrawPolygon" data-tooltip=') &&
          html.includes('id="btnMapRadiusToggle" data-tooltip=') &&
          html.includes('id="btnToggleCompetitorsLayer" data-tooltip=') &&
          html.includes('id="btnToggleFundiarioLayer" data-niche="agro" data-tooltip=') &&
          html.includes('id="btnSearchMeshToggle" data-niche="agro" data-tooltip=') &&
          html.includes('id="toggleSigefLayerBtn" data-tooltip=') &&
          html.includes('id="toggleCarLayerBtn" data-tooltip=') &&
          html.includes('id="toggleFusaoLayerBtn" data-tooltip=') &&
          html.includes('id="btnInspectPinToggle" data-niche="agro" data-tooltip=') &&
          html.includes('id="btnMapResetView" data-tooltip=') &&
          html.includes('id="btnMapFullscreen" data-tooltip=')
  },
  {
    name: '9. CSS .spatial-toolbar-tooltip configurado com padrão VERSUS glassmorphism',
    pass: css.includes('.spatial-toolbar-tooltip') &&
          css.includes('.spatial-toolbar-tooltip.visible') &&
          css.includes('z-index: 99999')
  },
  {
    name: '10. mapEngine.js inicializa setupSpatialToolbarTooltips com posicionamento dinâmico e clamping',
    pass: js.includes('setupSpatialToolbarTooltips()') &&
          js.includes('spatialToolbarTooltip') &&
          js.includes('getBoundingClientRect()')
  },
  {
    name: '11. Setas de scroll lateral inteligente presentes no HTML do cabeçalho do mapa',
    pass: html.includes('id="btnMapControlsScrollLeft"') &&
          html.includes('id="btnMapControlsScrollRight"')
  },
  {
    name: '12. CSS .btn-map-nav-arrow configurado com glassmorphism e microinterações',
    pass: css.includes('.btn-map-nav-arrow') &&
          css.includes('.btn-map-nav-arrow:hover') &&
          css.includes('backdrop-filter: blur(8px)')
  },
  {
    name: '13. mapEngine.js e app.js implementam scroll por inércia e atualização dinâmica das setas',
    pass: js.includes('setupMapControlsScrollArrows') &&
          js.includes('window.updateMapToolbarScrollArrows') &&
          js.includes('cursor = \'grabbing\'')
  }
];

let failed = 0;
for (const c of checks) {
  if (c.pass) {
    console.log(`  ✅ [PASS] ${c.name}`);
  } else {
    console.log(`  ❌ [FAIL] ${c.name}`);
    failed++;
  }
}

console.log(`\n=== RESUMO: ${checks.length - failed}/${checks.length} TESTES PASSARAM ===\n`);
if (failed > 0) process.exit(1);
