/**
 * FASE 17: WEBGIS ANALÍTICO & GESTÃO ESPACIAL (PADRÃO VERSUS)
 * Módulo: Motor WebGL MapLibre GL JS & Gestão Espacial (mapEngine.js)
 * 
 * Renderiza mapa vetorial interativo de alta performance no tema Dark Matter,
 * clustering inteligente nos tons VERSUS (#0055FF a #00D2FF), pins de vitalidade,
 * camada de hexágonos Uber H3 e delimitação de territórios por desenho livre.
 */

window.MapEngine = (function() {
  let map = null;
  let draw = null;
  let currentGeoJson = { type: 'FeatureCollection', features: [] };
  let hoverPopup = null;
  let tacticalPopup = null;
  let activeDrawnPolygon = null;
  let isMapInitialized = false;
  let pofLayerActive = false;
  let competitorsLayerActive = false;
  let fundiarioLayerActive = true;
  let sigefLayerVisible = true;   // FASE 57: toggle granular SIGEF
  let carLayerVisible = true;     // FASE 57: toggle granular CAR
  let fusaoLayerVisible = true;   // FASE 57: toggle granular FUSÃO (SIGEF+CAR)
  let gapLayerVisible = true;     // FASE 57: toggle granular GAPS FUNDIÁRIOS (Sem Geo / Urgência HOT)
  let tipoPessoaFilter = 'ALL';   // FASE 60: segmentação tática de entidade ('ALL' | 'PJ' | 'PF')
  let currentFundiarioGeoJson = { type: 'FeatureCollection', features: [] };
  let isInspectPinActive = false;
  let currentBaseMapMode = 'vector'; // 'vector' | 'satellite'

  // FASE 66: Ferramenta de Seleção Espacial por Laço (Lasso Tool) e Trava Regional
  let isLassoActive = false;
  let isLassoDrawing = false;
  let lassoCoordinates = [];
  let selectedFarmsByLasso = [];
  let isRegionalGridLocked = false;
  let selectedSearchUf = '';
  let selectedSearchCity = '';

  // Centro padrão do Brasil
  const BRAZIL_CENTER = [-51.9253, -14.2350];
  const BRAZIL_DEFAULT_ZOOM = 4.2;

  // Estilo Base Híbrido: ESRI World Dark Gray & ESRI World Imagery (100% limpo, sem marca d'água)
  const darkMatterStyle = {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'esri-dark-base': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        maxzoom: 16, // CRÍTICO: Informa ao MapLibre que a ESRI só entrega até o zoom 16
        attribution: '© Esri, HERE, Garmin'
      },
      'esri-dark-labels': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        maxzoom: 16
      },
      'esri-satellite-base': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© Esri, Maxar, Earthstar Geographics'
      },
      'esri-satellite-labels': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        maxzoom: 19
      }
    },
    layers: [
      {
        id: 'esri-dark-base-layer',
        type: 'raster',
        source: 'esri-dark-base',
        minzoom: 0,
        maxzoom: 22, // Permite ao MapLibre ampliar a imagem do zoom 16 até o nível de rua sem erro
        layout: {
          visibility: 'visible'
        }
      },
      {
        id: 'esri-satellite-base-layer',
        type: 'raster',
        source: 'esri-satellite-base',
        minzoom: 0,
        maxzoom: 22,
        layout: {
          visibility: 'none'
        }
      },
      {
        id: 'esri-dark-labels-layer',
        type: 'raster',
        source: 'esri-dark-labels',
        minzoom: 0,
        maxzoom: 22,
        layout: {
          visibility: 'visible'
        }
      },
      {
        id: 'esri-satellite-labels-layer',
        type: 'raster',
        source: 'esri-satellite-labels',
        minzoom: 0,
        maxzoom: 22,
        layout: {
          visibility: 'none'
        }
      }
    ]
  };

  /**
   * Inicializa o mapa MapLibre GL JS
   */
  function initMap() {
    const container = document.getElementById('webglMapContainer');
    if (!container) return;

    if (map) {
      setTimeout(() => map.resize(), 100);
      return;
    }

    if (typeof maplibregl === 'undefined') {
      console.warn('MapLibre GL JS não carregado.');
      return;
    }

    try {
      map = new maplibregl.Map({
        container: 'webglMapContainer',
        style: darkMatterStyle,
        center: BRAZIL_CENTER,
        zoom: BRAZIL_DEFAULT_ZOOM,
        minZoom: 3,
        maxZoom: 18.5,
        pitchWithRotate: false,
        attributionControl: false  // Suprime watermark / banner de API key do Mapbox
      });

      // Controle de atribuição limpo (ESRI, sem marca d'água)
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '© Esri · HERE · Garmin · © OpenStreetMap'
        }),
        'bottom-right'
      );


      // Controles nativos de navegação
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      // Ferramenta de Desenho Livre (MapboxDraw) para Cancelas Comerciais
      if (typeof MapboxDraw !== 'undefined') {
        draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: {
            polygon: false,
            trash: false
          },
          styles: [
            // Polígono preenchimento
            {
              'id': 'gl-draw-polygon-fill',
              'type': 'fill',
              'filter': ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
              'paint': {
                'fill-color': '#00D2FF',
                'fill-outline-color': '#0055FF',
                'fill-opacity': 0.2
              }
            },
            // Linha do polígono
            {
              'id': 'gl-draw-polygon-stroke-active',
              'type': 'line',
              'filter': ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
              'layout': {
                'line-cap': 'round',
                'line-join': 'round'
              },
              'paint': {
                'line-color': '#00D2FF',
                'line-dasharray': [0.2, 2],
                'line-width': 2.5
              }
            },
            // Vértices do polígono
            {
              'id': 'gl-draw-polygon-and-line-vertex-active',
              'type': 'circle',
              'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
              'paint': {
                'circle-radius': 6,
                'circle-color': '#FFFFFF',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#0055FF'
              }
            }
          ]
        });
        map.addControl(draw, 'top-left');

        map.on('draw.create', handlePolygonChange);
        map.on('draw.update', handlePolygonChange);
        map.on('draw.delete', handlePolygonCleared);
      }

      // Inicialização das camadas e fontes após carregamento do mapa
      map.on('load', () => {
        isMapInitialized = true;
        ensureSatelliteSourcesAndLayers();
        applyBaseMapVisibility(currentBaseMapMode);
        setupMapLayers();
        setupMapInteractions();
        fetchAndRenderGeoJson();
        setupPofLayer(); // Fase 19.2
        setupRadiusBufferLayer(); // Geomarketing Enterprise
        setupCompetitorsAndGapsLayers(); // Fase 23
        setupFundiarioLayers(); // Fases 44/45: Motor Fundiário B2B
        setupLassoLayers(); // FASE 66: Camadas do Laço de Seleção Espacial
        setupLassoEvents(); // FASE 66: Interação e Card de Seleção por Laço
        fetchAndRenderFundiarioGeoJson();
        setupWmsLayersAndControls();
      });

      // Resize defensivo
      window.addEventListener('resize', () => {
        if (map) map.resize();
      });

      setupToolbarEvents();
    } catch (err) {
      console.error('Erro ao inicializar MapLibre GL:', err);
    }
  }

  /**
   * Configura fontes e camadas de clusters e pins individuais
   */
  function setupMapLayers() {
    if (!map) return;

    // Fonte de dados GeoJSON com suporte a clustering nativo
    map.addSource('leads-source', {
      type: 'geojson',
      data: currentGeoJson,
      cluster: true,
      clusterMaxZoom: 12, // Acima de zoom 12 os clusters se desfazem em pins individuais
      clusterRadius: 50
    });

    // 1. Camada de círculos de clusters com cores do Design System VERSUS
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'leads-source',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#0055FF',   // Azul VERSUS (até 10 empresas)
          10,
          '#0088FF',   // Azul médio (10 a 50 empresas)
          50,
          '#00D2FF'    // Ciano glow (50+ empresas)
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          16,
          10,
          22,
          50,
          28
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
        'circle-opacity': 0.88
      }
    });

    // 2. Rótulo numérico de contagem dos clusters
    try {
      if (!map.getLayer('cluster-count')) {
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'leads-source',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Noto Sans Bold'],
            'text-size': 12
          },
          paint: {
            'text-color': '#FFFFFF'
          }
        });
      }
    } catch (errCluster) {
      console.warn('[MapEngine] Erro ao registrar camada cluster-count:', errCluster);
    }

    // 3. Camada de pins individuais (Zoom alto) nas cores de vitalidade
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'leads-source',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': [
          'match',
          ['get', 'vitality_status'],
          'OPERACAO_ATIVA', '#22C55E',    // Verde
          'EM_TRANSICAO', '#F59E0B',      // Âmbar
          'ZUMBI_PRESUMIDA', '#EF4444',   // Vermelho
          '#00D2FF'                       // Fallback Ciano
        ],
        'circle-radius': 7,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
        'circle-opacity': 0.95
      }
    });

    // Popup flutuante para hover
    hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'map-dark-popup'
    });
  }

  /**
   * Configura eventos de clique, hover e expansão de zoom
   */
  function setupMapInteractions() {
    if (!map) return;

    // Clique em cluster: zoom suave no agrupamento
    map.on('click', 'clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (!features || features.length === 0) return;
      const clusterId = features[0].properties.cluster_id;

      map.getSource('leads-source').getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({
          center: features[0].geometry.coordinates,
          zoom: Math.min(zoom + 0.5, 14),
          duration: 600
        });
      });
    });

    // Clique em pin individual: abre instantaneamente a ficha no Right Drawer!
    map.on('click', 'unclustered-point', (e) => {
      if (isInspectPinActive) return;
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if (props && props.id && window.inspectLeadInDrawer) {
        window.inspectLeadInDrawer(props.id);
      }
    });

    // Hover sobre pin individual
    map.on('mousemove', 'unclustered-point', (e) => {
      if (isInspectPinActive || isLassoActive || isLassoDrawing) return;
      if (!e.features || e.features.length === 0) return;
      map.getCanvas().style.cursor = 'pointer';

      const f = e.features[0];
      const p = f.properties;
      const coords = f.geometry.coordinates.slice();

      const html = `
        <div class="map-tooltip-content">
          <div class="tooltip-top-row">
            <span class="tooltip-badge ${p.target_type === 'BUYER' ? 'buyer' : 'supplier'}">
              ${p.target_type === 'BUYER' ? 'COMPRADOR' : 'FORNECEDOR'}
            </span>
            <span class="tooltip-vitality ${p.vitality_status === 'OPERACAO_ATIVA' ? 'active' : (p.vitality_status === 'EM_TRANSICAO' ? 'transition' : 'zombie')}">
              ${p.vitality_icon || '•'} ${p.vitality_label || 'Vitalidade'}
            </span>
          </div>
          <h4 class="tooltip-title">${p.nome_fantasia || p.razao_social}</h4>
          <div class="tooltip-sub">${p.categoria_real || p.cnae_descricao || 'Geral'}</div>
          <div class="tooltip-meta">
            <span>Capital: <strong>${p.capital_formatted || 'R$ 0'}</strong></span>
            <span>${p.municipio}/${p.uf}</span>
          </div>
          <div class="tooltip-hint">Clique para inspecionar no painel lateral &rarr;</div>
        </div>
      `;

      hoverPopup.setLngLat(coords).setHTML(html).addTo(map);
    });

    map.on('mouseleave', 'unclustered-point', () => {
      if (isInspectPinActive || isLassoActive || isLassoDrawing) {
        map.getCanvas().style.cursor = 'crosshair';
        if (hoverPopup) hoverPopup.remove();
        return;
      }
      map.getCanvas().style.cursor = '';
      if (hoverPopup) hoverPopup.remove();
    });

    map.on('mouseenter', 'clusters', () => {
      if (isInspectPinActive || isLassoActive || isLassoDrawing) return;
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'clusters', () => {
      if (isInspectPinActive || isLassoActive || isLassoDrawing) {
        map.getCanvas().style.cursor = 'crosshair';
        return;
      }
      map.getCanvas().style.cursor = '';
    });

    // FASE 47 ETAPA 2: Clique no mapa com ferramenta de alfinete (Pin-Drop) ativa
    map.on('click', async (e) => {
      if (isInspectPinActive) {
        await handleInspectPinMapClick(e);
      }
    });

    // Auto-sincronização de malha fundiária quando o usuário navega pelo mapa (moveend)
    let moveEndDebounceTimer = null;
    map.on('moveend', () => {
      clearTimeout(moveEndDebounceTimer);
      moveEndDebounceTimer = setTimeout(async () => {
        const zoom = map.getZoom();
        if (zoom < 8) return; // Não recarrega no nível Brasil macro
        if (isRegionalGridLocked) return; // Não sobrescreve malha regional carregada pelo operador (ex: Rio Verde 3.000)

        const hub = detectCurrentMapHub();
        if (!hub) return;

        // Se o polo detectado for diferente do atualmente carregado
        if (hub.city !== selectedSearchCity || hub.uf !== selectedSearchUf) {
          console.log(`[MAP AUTO-DETECT] Navegou para ${hub.city}/${hub.uf}`);
          selectedSearchUf = hub.uf;
          selectedSearchCity = hub.city;
          
          try {
            const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : { 'Content-Type': 'application/json' };
            const res = await fetch(`/api/fundiario/car/geojson?uf=${hub.uf}&municipio=${encodeURIComponent(hub.city)}&origem=TODOS`, { headers });
            if (res.ok) {
              const geojson = await res.json();
              currentFundiarioGeoJson = geojson;
              window.ruralPropertiesData = (geojson.features || []).map(f => ({
                ...(f.properties || {}),
                id: f.id || f.properties?.id,
                geometry: f.geometry
              }));

              const fundSource = map.getSource('fundiario-source');
              if (fundSource && typeof fundSource.setData === 'function') {
                fundSource.setData(geojson);
              }

              window.dispatchEvent(new CustomEvent('ruralDataUpdated', {
                detail: { count: window.ruralPropertiesData.length, hub }
              }));
              
              const countEl = document.getElementById('mapFundiarioCountBadge');
              if (countEl) {
                countEl.textContent = `${window.ruralPropertiesData.length} fazendas (${hub.city}/${hub.uf})`;
                countEl.style.display = 'inline-flex';
              }
            }
          } catch (err) {
            console.warn('[MAP AUTO-DETECT] Erro ao sincronizar malha da região:', err);
          }
        }
      }, 700);
    });
  }

  // Lista de polos agro estratégicos nacionais para detecção geográfica automática do mapa
  const AGRO_HUBS = [
    { uf: 'RS', city: 'PASSO FUNDO', lat: -28.2628, lng: -52.4067, name: 'Passo Fundo / Alto Alegre / Não-Me-Toque' },
    { uf: 'RS', city: 'CRUZ ALTA', lat: -28.6389, lng: -53.6064, name: 'Cruz Alta / Ibirubá' },
    { uf: 'RS', city: 'IJUI', lat: -28.3878, lng: -53.9147, name: 'Ijuí / Panambi' },
    { uf: 'RS', city: 'SANTA MARIA', lat: -29.6842, lng: -53.8069, name: 'Santa Maria / Centro Gaúcho' },
    { uf: 'MT', city: 'SORRISO', lat: -12.5425, lng: -55.7114, name: 'Sorriso / BR-163' },
    { uf: 'MT', city: 'LUCAS DO RIO VERDE', lat: -13.0500, lng: -55.9100, name: 'Lucas do Rio Verde / Nova Mutum' },
    { uf: 'MT', city: 'SINOP', lat: -11.8642, lng: -55.5056, name: 'Sinop / Norte MT' },
    { uf: 'MT', city: 'RONDONOPOLIS', lat: -16.4674, lng: -54.6361, name: 'Rondonópolis' },
    { uf: 'GO', city: 'RIO VERDE', lat: -17.7925, lng: -50.9192, name: 'Rio Verde / Sudoeste Goiano' },
    { uf: 'PR', city: 'CASCAVEL', lat: -24.9578, lng: -53.4595, name: 'Cascavel / Toledo' },
    { uf: 'PR', city: 'LONDRINA', lat: -23.3045, lng: -51.1696, name: 'Londrina / Maringá' },
    { uf: 'PR', city: 'CASTRO', lat: -24.7911, lng: -50.0119, name: 'Campos Gerais / Castro' },
    { uf: 'BA', city: 'LUIS EDUARDO MAGALHAES', lat: -12.0969, lng: -45.7958, name: 'Luís Eduardo Magalhães / MATOPIBA' },
    { uf: 'MS', city: 'DOURADOS', lat: -22.2211, lng: -54.8056, name: 'Dourados / Sul MS' },
    { uf: 'MG', city: 'UBERLANDIA', lat: -18.9186, lng: -48.2772, name: 'Triângulo Mineiro' },
    { uf: 'SP', city: 'RIBEIRAO PRETO', lat: -21.1767, lng: -47.8208, name: 'Ribeirão Preto / Alta Mogiana' }
  ];

  function detectCurrentMapHub() {
    if (!map) return null;
    const center = map.getCenter();
    const lat = center.lat;
    const lng = center.lng;

    let nearest = AGRO_HUBS[0];
    let minDist = Infinity;

    for (const hub of AGRO_HUBS) {
      const d = Math.pow(lat - hub.lat, 2) + Math.pow(lng - hub.lng, 2);
      if (d < minDist) {
        minDist = d;
        nearest = hub;
      }
    }

    return { ...nearest, centerLat: lat, centerLng: lng, zoom: map.getZoom(), dist: Math.sqrt(minDist) };
  }

  /**
   * Configura botões da toolbar da aba de mapa
   */
  function setupToolbarEvents() {
    // 1. Botão Centralizar Brasil
    const btnReset = document.getElementById('btnMapResetView');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (!map) return;
        map.flyTo({
          center: BRAZIL_CENTER,
          zoom: BRAZIL_DEFAULT_ZOOM,
          speed: 1.2
        });
      });
    }

    // 2. Alternador de Hexágonos Uber H3
    const btnH3 = document.getElementById('btnToggleH3');
    if (btnH3) {
      btnH3.addEventListener('click', () => {
        if (!map || !window.H3LayerEngine) return;
        const isActive = window.H3LayerEngine.toggleH3(map, currentGeoJson.features);
        btnH3.classList.toggle('active', isActive);
        if (isActive) {
          btnH3.innerHTML = '<span>Ocultar Hexágonos</span>';
          showToast('Camada de Hexágonos Uber H3 (Resolução 7) ativada.');
        } else {
          btnH3.innerHTML = '<span>Hexágonos H3</span>';
          showToast('Camada de Hexágonos H3 desativada.');
        }
      });
    }

    // 3. Ferramenta de Desenho Livre (Cancela Comercial)
    const btnDraw = document.getElementById('btnDrawPolygon');
    if (btnDraw) {
      btnDraw.addEventListener('click', () => {
        if (!draw) return;
        draw.changeMode('draw_polygon');
        showToast('Clique no mapa para marcar os pontos do polígono e duplo-clique para fechar.');
      });
    }

    // 4. Limpar Território Desenhado
    const btnClear = document.getElementById('btnClearPolygon');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (!draw) return;
        draw.deleteAll();
        handlePolygonCleared();
      });
    }

    // 5. Camada Potencial POF / IPC (Fase 19.2)
    const btnPof = document.getElementById('btnTogglePofLayer');
    if (btnPof) {
      btnPof.addEventListener('click', () => {
        pofLayerActive = !pofLayerActive;
        btnPof.classList.toggle('active', pofLayerActive);
        if (pofLayerActive) {
          fetchAndRenderPofLayer();
          showToast('Camada de Potencial de Consumo (POF) ativada.');
        } else {
          hidePofLayer();
          showToast('Camada de Potencial de Consumo (POF) desativada.');
        }
      });
    }

    // 5.1 Alternador da Camada de Concorrência & Gaps (Fase 23)
    const btnCompLayer = document.getElementById('btnToggleCompetitorsLayer');
    if (btnCompLayer) {
      btnCompLayer.addEventListener('click', () => {
        if (!competitorsLayerActive) {
          renderCompetitorAndGapsSpatial(window.currentCompetitors || [], window.currentMarketGaps || [], true);
          showToast('Camada espacial de Concorrência e Gaps ativada no mapa.');
        } else {
          setCompetitorLayersVisibility(false);
          showToast('Camada de Concorrência e Gaps ocultada.');
        }
      });
    }

    // 5.2 Alternador da Camada de Malha Fundiária (Fases 44/45: SIGEF / INCRA / CAR)
    const btnFundLayer = document.getElementById('btnToggleFundiarioLayer');
    if (btnFundLayer) {
      btnFundLayer.addEventListener('click', () => {
        fundiarioLayerActive = !fundiarioLayerActive;
        btnFundLayer.classList.toggle('active', fundiarioLayerActive);
        setFundiarioLayersVisibility(fundiarioLayerActive);
        if (fundiarioLayerActive) {
          // Se todas as fontes estavam desmarcadas, reativa para o usuário não ter malha invisível
          if (!sigefLayerVisible && !carLayerVisible && !fusaoLayerVisible) {
            sigefLayerVisible = true;
            carLayerVisible = true;
            fusaoLayerVisible = true;
            const btnS = document.getElementById('toggleSigefLayerBtn');
            const btnC = document.getElementById('toggleCarLayerBtn');
            const btnF = document.getElementById('toggleFusaoLayerBtn');
            const chkS = document.getElementById('toggleSigefLayer');
            const chkC = document.getElementById('toggleCarLayer');
            const chkF = document.getElementById('toggleFusaoLayer');
            if (btnS) btnS.classList.add('active');
            if (btnC) btnC.classList.add('active');
            if (btnF) btnF.classList.add('active');
            if (chkS) chkS.checked = true;
            if (chkC) chkC.checked = true;
            if (chkF) chkF.checked = true;
          }
          updateFundiarioSourceFilter();
          fetchAndRenderFundiarioGeoJson({ autoFit: true });
          showToast('Camada da Malha Fundiária ativada.');
        } else {
          showToast('Camada Fundiária ocultada.');
        }
      });
    }

    // FASE 57 + REFINAMENTO UX: Toggles granulares de fonte — SIGEF / SICAR/CAR / FUSÃO
    (function setupSourceToggleListeners() {
      const chkSigef    = document.getElementById('toggleSigefLayer');
      const chkCar      = document.getElementById('toggleCarLayer');
      const chkFusao    = document.getElementById('toggleFusaoLayer');
      const btnSigef    = document.getElementById('toggleSigefLayerBtn');
      const btnCar      = document.getElementById('toggleCarLayerBtn');
      const btnFusao    = document.getElementById('toggleFusaoLayerBtn');

      if (btnSigef) {
        btnSigef.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          sigefLayerVisible = !sigefLayerVisible;
          if (chkSigef) chkSigef.checked = sigefLayerVisible;
          btnSigef.classList.toggle('active', sigefLayerVisible);

          // Se a malha principal estava desligada e o usuário ligou SIGEF, reativa a malha
          if (sigefLayerVisible && !fundiarioLayerActive) {
            fundiarioLayerActive = true;
            if (btnFundLayer) btnFundLayer.classList.add('active');
            setFundiarioLayersVisibility(true);
          }

          if (window.MapFundiarioEngine?.setSigefVisible) {
            window.MapFundiarioEngine.setSigefVisible(sigefLayerVisible);
          } else {
            updateFundiarioSourceFilter();
          }
          if (typeof showToast === 'function') {
            showToast(sigefLayerVisible ? 'Malha SIGEF/INCRA visível.' : 'Malha SIGEF/INCRA ocultada.');
          }
        });
      }

      if (btnCar) {
        btnCar.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          carLayerVisible = !carLayerVisible;
          if (chkCar) chkCar.checked = carLayerVisible;
          btnCar.classList.toggle('active', carLayerVisible);

          // Se a malha principal estava desligada e o usuário ligou CAR, reativa a malha
          if (carLayerVisible && !fundiarioLayerActive) {
            fundiarioLayerActive = true;
            if (btnFundLayer) btnFundLayer.classList.add('active');
            setFundiarioLayersVisibility(true);
          }

          if (window.MapFundiarioEngine?.setCarVisible) {
            window.MapFundiarioEngine.setCarVisible(carLayerVisible);
          } else {
            updateFundiarioSourceFilter();
          }
          if (typeof showToast === 'function') {
            showToast(carLayerVisible ? 'Malha SICAR/CAR visível.' : 'Malha SICAR/CAR ocultada.');
          }
        });
      }

      if (btnFusao) {
        btnFusao.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          fusaoLayerVisible = !fusaoLayerVisible;
          if (chkFusao) chkFusao.checked = fusaoLayerVisible;
          btnFusao.classList.toggle('active', fusaoLayerVisible);

          // Se a malha principal estava desligada e o usuário ligou FUSÃO, reativa a malha
          if (fusaoLayerVisible && !fundiarioLayerActive) {
            fundiarioLayerActive = true;
            if (btnFundLayer) btnFundLayer.classList.add('active');
            setFundiarioLayersVisibility(true);
          }

          if (window.MapFundiarioEngine?.setFusaoVisible) {
            window.MapFundiarioEngine.setFusaoVisible(fusaoLayerVisible);
          } else {
            updateFundiarioSourceFilter();
          }
          if (typeof showToast === 'function') {
            showToast(fusaoLayerVisible ? 'Malha Fusão SIGEF+CAR visível.' : 'Malha Fusão SIGEF+CAR ocultada.');
          }
        });
      }

      const btnGap = document.getElementById('toggleGapLayerBtn');
      if (btnGap) {
        btnGap.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          gapLayerVisible = !gapLayerVisible;
          btnGap.classList.toggle('active', gapLayerVisible);

          // Se a malha principal estava desligada e o usuário ligou GAP, reativa a malha
          if (gapLayerVisible && !fundiarioLayerActive) {
            fundiarioLayerActive = true;
            if (btnFundLayer) btnFundLayer.classList.add('active');
            setFundiarioLayersVisibility(true);
          }

          if (window.MapFundiarioEngine?.setGapVisible) {
            window.MapFundiarioEngine.setGapVisible(gapLayerVisible);
          } else {
            updateFundiarioSourceFilter();
          }
          if (typeof showToast === 'function') {
            showToast(gapLayerVisible ? 'Gaps Fundiários (Sem Geo / Urgência HOT) visíveis.' : 'Gaps Fundiários ocultados.');
          }
        });
      }

      // FASE 60: Segmentação Tática PJ (Empresas/QSA) vs PF (Produtores/LGPD)
      const entityBtns = document.querySelectorAll('.btn-entity-toggle');
      entityBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetEntity = btn.getAttribute('data-entity') || 'ALL';
          tipoPessoaFilter = targetEntity;
          entityBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          updateFundiarioSourceFilter();
          if (typeof showToast === 'function') {
            const labels = {
              ALL: 'Exibindo todos os imóveis (PJ e PF).',
              PJ: 'Filtro ativo: Apenas Empresas / Agropecuárias (PJ / Receita Federal).',
              PF: 'Filtro ativo: Apenas Produtores Rurais Individuais (PF / Sigilo LGPD).'
            };
            showToast(labels[targetEntity] || 'Filtro de entidade atualizado.');
          }
        });
      });
    })();

    // 5.3 FASE 46 (ETAPA 1): Gatilho e Painel de Busca Regional de Malha (Padrão SIGEF)
    setupMeshSearchControls();

    // 5.4 FASE 47 (ETAPA 2): Ferramenta de Alfinete (Busca Reversa de Propriedade - Pin Drop)
    setupInspectPinControls();

    // 5.5 Alternador de Camada Base: Satélite Real vs Vetorial
    const btnMapMode = document.getElementById('btnToggleMapMode') || document.getElementById('btnToggleSatellite');
    if (btnMapMode) {
      btnMapMode.addEventListener('click', (e) => {
        e.preventDefault();
        toggleBaseMapMode();
      });
    }

    // 6. Botão Tela Cheia WebGIS (Fase 22)
    const btnFullscreen = document.getElementById('btnMapFullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        toggleFullscreen();
      });
    }

    // Listener para tecla Escape para restaurar a visão normal ou cancelar ferramentas ativas
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (isInspectPinActive) {
          deactivateInspectPinTool();
          showToast('Inspeção territorial desativada.');
        }
        const paneMap = document.getElementById('paneMap');
        if (paneMap && paneMap.classList.contains('map-fullscreen-active')) {
          exitFullscreen();
        }
      }
    });

    // Sincronização com Fullscreen API nativa
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        const paneMap = document.getElementById('paneMap');
        if (paneMap && paneMap.classList.contains('map-fullscreen-active')) {
          exitFullscreen();
        }
      }
    });

    // 7. Botão Minimizar / Expandir Legenda Espacial (Fase 22)
    const btnMinLegend = document.getElementById('btnMinimizeLegend');
    const legendBox = document.getElementById('mapFloatingLegend');
    const minIcon = document.getElementById('legendMinimizeIcon');

    if (btnMinLegend && legendBox) {
      btnMinLegend.addEventListener('click', (e) => {
        e.stopPropagation();
        const isMin = legendBox.classList.toggle('minimized');
        if (minIcon) {
          minIcon.textContent = isMin ? '+' : '_';
        }
      });
    }

    // 8. Tooltip de Ajuda da Legenda Espacial (Fase 22)
    const helpTrigger = document.getElementById('legendHelpTrigger');
    if (helpTrigger) {
      helpTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        helpTrigger.classList.toggle('active');
      });
      document.addEventListener('click', () => {
        helpTrigger.classList.remove('active');
      });
    }

    // 8.1 Accordion da Legenda Espacial com Persistência (Fase 67)
    setupLegendAccordion();

    // 9. Controle de Raio de Proximidade (Geomarketing Enterprise)
    setupRadiusControls();

    // 10. Scroll horizontal defensivo com a roda do mouse e arraste por inércia na barra de ferramentas
    const stageControls = document.querySelector('.map-stage-controls');
    if (stageControls) {
      stageControls.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0 && stageControls.scrollWidth > stageControls.clientWidth) {
          stageControls.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });

      // Arraste com o mouse (Drag-to-scroll com inércia)
      let isDown = false;
      let startX = 0;
      let scrollLeftPos = 0;
      let hasMoved = false;

      stageControls.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDown = true;
        hasMoved = false;
        startX = e.pageX - stageControls.offsetLeft;
        scrollLeftPos = stageControls.scrollLeft;
        stageControls.style.cursor = 'grabbing';
      });

      window.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        if (stageControls) stageControls.style.cursor = '';
      });

      stageControls.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - stageControls.offsetLeft;
        const walk = (x - startX) * 1.35;
        if (Math.abs(x - startX) > 4) {
          hasMoved = true;
        }
        stageControls.scrollLeft = scrollLeftPos - walk;
      });

      stageControls.addEventListener('click', (e) => {
        if (hasMoved) {
          e.preventDefault();
          e.stopPropagation();
          hasMoved = false;
        }
      }, true);
    }

    // 11. Setas de Navegação Lateral Discretas para Rolagem Inteligente
    setupMapControlsScrollArrows();

    // 12. Padronização Global de Tooltips Corporativos da Barra Superior
    setupSpatialToolbarTooltips();

    // 13. Gestão e Sincronização de Camadas WMS Oficiais (IBAMA, ANA, PRODES)
    setupWmsLayersAndControls();
  }

  /**
   * FASE 67: Accordion da Legenda Espacial com Persistência em LocalStorage
   */
  function setupLegendAccordion() {
    const STORAGE_KEY = 'versus_spatial_legend_accordion_v1';
    let savedState = {};
    try {
      savedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {}

    const headers = document.querySelectorAll('.legend-accordion-header');
    headers.forEach(header => {
      const targetId = header.getAttribute('data-target');
      const body = document.getElementById(targetId);
      const arrow = header.querySelector('.legend-accordion-arrow');
      const groupEl = header.closest('.legend-accordion-group');
      const groupKey = groupEl ? groupEl.getAttribute('data-group') : targetId;

      // Restaura estado se salvo anteriormente no localStorage
      if (savedState[groupKey] !== undefined && body) {
        const isOpen = savedState[groupKey] === true;
        body.style.display = isOpen ? 'flex' : 'none';
        header.classList.toggle('active', isOpen);
        if (arrow) arrow.textContent = isOpen ? '▾' : '▸';
      }

      header.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!body) return;
        const willOpen = body.style.display === 'none';
        body.style.display = willOpen ? 'flex' : 'none';
        header.classList.toggle('active', willOpen);
        if (arrow) arrow.textContent = willOpen ? '▾' : '▸';

        // Salva preferência no storage
        try {
          savedState[groupKey] = willOpen;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
        } catch (_) {}
      });
    });
  }

  /**
   * Setas de Navegação Lateral Discretas para Rolagem Inteligente
   */
  function setupMapControlsScrollArrows() {
    const stageControls = document.querySelector('.map-stage-controls');
    const btnScrollLeft = document.getElementById('btnMapControlsScrollLeft');
    const btnScrollRight = document.getElementById('btnMapControlsScrollRight');

    if (!stageControls) return;

    function updateScrollArrows() {
      const canScrollLeft = stageControls.scrollLeft > 6;
      const canScrollRight = stageControls.scrollLeft < (stageControls.scrollWidth - stageControls.clientWidth - 6);

      if (btnScrollLeft) {
        btnScrollLeft.style.display = canScrollLeft ? 'inline-flex' : 'none';
      }
      if (btnScrollRight) {
        btnScrollRight.style.display = canScrollRight ? 'inline-flex' : 'none';
      }
    }

    stageControls.addEventListener('scroll', updateScrollArrows, { passive: true });
    window.addEventListener('resize', updateScrollArrows);

    btnScrollLeft?.addEventListener('click', () => {
      stageControls.scrollBy({ left: -260, behavior: 'smooth' });
    });

    btnScrollRight?.addEventListener('click', () => {
      stageControls.scrollBy({ left: 260, behavior: 'smooth' });
    });

    updateScrollArrows();
    setTimeout(updateScrollArrows, 150);
    setTimeout(updateScrollArrows, 500);

    window.updateMapToolbarScrollArrows = updateScrollArrows;
  }

  /**
   * Tooltips Corporativos Globais da Barra Superior (Padrão VERSUS Glassmorphism)
   */
  function setupSpatialToolbarTooltips() {
    let tooltipEl = document.getElementById('spatialToolbarTooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'spatialToolbarTooltip';
      tooltipEl.className = 'spatial-toolbar-tooltip';
      document.body.appendChild(tooltipEl);
    }

    const container = document.querySelector('.map-stage-header') || document.querySelector('.map-stage-controls');
    if (!container) return;

    let hideTimeout = null;

    container.addEventListener('mouseenter', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target || !container.contains(target)) return;
      showTooltip(target);
    }, true);

    container.addEventListener('mouseleave', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;
      hideTooltip();
    }, true);

    container.addEventListener('click', () => {
      hideTooltip();
    }, true);

    function showTooltip(el) {
      clearTimeout(hideTimeout);
      const text = el.getAttribute('data-tooltip');
      if (!text) return;

      tooltipEl.textContent = text;
      tooltipEl.style.display = 'block';

      // Posiciona abaixo do botão centralizado
      const rect = el.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();

      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      let top = rect.bottom + 7;

      // Clamping para não sair da tela à esquerda ou à direita
      if (left < 10) left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }

      tooltipEl.style.left = `${Math.round(left)}px`;
      tooltipEl.style.top = `${Math.round(top)}px`;

      // Seta indicativa alinhada com o centro do botão
      const arrowLeft = Math.round(rect.left + (rect.width / 2) - left);
      tooltipEl.style.setProperty('--arrow-left', `${arrowLeft}px`);

      requestAnimationFrame(() => {
        tooltipEl.classList.add('visible');
      });
    }

    function hideTooltip() {
      tooltipEl.classList.remove('visible');
      hideTimeout = setTimeout(() => {
        if (!tooltipEl.classList.contains('visible')) {
          tooltipEl.style.display = 'none';
        }
      }, 160);
    }
  }

  /**
   * Alterna modo tela cheia do WebGIS com sincronização de canvas e controles
   */
  function toggleFullscreen(forceState) {
    const paneMap = document.getElementById('paneMap');
    const btnFullscreen = document.getElementById('btnMapFullscreen');
    const btnIcon = document.getElementById('btnMapFullscreenIcon');
    const btnLabel = document.getElementById('btnMapFullscreenLabel');

    if (!paneMap) return;

    const shouldBeFullscreen = typeof forceState === 'boolean' 
      ? forceState 
      : !paneMap.classList.contains('map-fullscreen-active');

    paneMap.classList.toggle('map-fullscreen-active', shouldBeFullscreen);
    document.body.classList.toggle('map-fullscreen-mode', shouldBeFullscreen);

    if (btnFullscreen) {
      btnFullscreen.classList.toggle('active', shouldBeFullscreen);
      if (shouldBeFullscreen) {
        if (btnIcon) btnIcon.textContent = '✖';
        if (btnLabel) btnLabel.textContent = 'Sair da Tela Cheia';
        btnFullscreen.title = 'Sair do modo tela cheia (ou pressione ESC)';
      } else {
        if (btnIcon) btnIcon.textContent = '⛶';
        if (btnLabel) btnLabel.textContent = 'Tela Cheia';
        btnFullscreen.title = 'Alternar modo tela cheia do mapa (ou pressione ESC)';
      }
    }

    // Suporte opcional à Fullscreen API do navegador
    try {
      if (shouldBeFullscreen) {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.exitFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    } catch (_) {}

    // Dispara resize imediato e com delays graduais para estabilização do WebGL
    if (map) {
      map.resize();
      setTimeout(() => map && map.resize(), 60);
      setTimeout(() => map && map.resize(), 200);
      setTimeout(() => map && map.resize(), 450);
    }
  }

  function exitFullscreen() {
    toggleFullscreen(false);
  }

  // === FASE 19.2: GESTÃO DA CAMADA POF ===

  function setupPofLayer() {
    if (!map) return;

    map.addSource('pof-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // Círculos graduados para a camada POF (buffers translúcidos)
    map.addLayer({
      id: 'pof-layer-circles',
      type: 'circle',
      source: 'pof-source',
      // Inserir antes da camada unclustered-point para não sobrepor os pins
      paint: {
        'circle-color': [
          'match',
          ['get', 'classificacao_consumo'],
          'ALTO_CONSUMO', '#00D2FF',
          'CONSUMO_MEDIO', '#0055FF',
          '#94A3B8' // CONSUMO_RESTRITO
        ],
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['get', 'consumo_anual_estimado'],
          0, 10,
          1000000000, 40
        ],
        'circle-opacity': [
          'match',
          ['get', 'classificacao_consumo'],
          'ALTO_CONSUMO', 0.4,
          'CONSUMO_MEDIO', 0.3,
          0.15
        ],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#FFFFFF'
      }
    }, 'unclustered-point'); // <--- A mágica do ordenamento z-index no MapLibre

    // Interações Hover POF
    map.on('mousemove', 'pof-layer-circles', (e) => {
      // Se houver hover sobre os pins principais (unclustered-point), ignora o hover do POF para não conflitar
      const isOverPin = map.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] }).length > 0;
      if (isOverPin) return;

      if (!e.features || e.features.length === 0) return;
      map.getCanvas().style.cursor = 'pointer';

      const f = e.features[0];
      const p = f.properties;
      const coords = f.geometry.coordinates.slice();

      const formatBRL = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

      const html = `
        <div class="map-tooltip-content" style="border-top: 3px solid ${p.classificacao_consumo === 'ALTO_CONSUMO' ? '#00D2FF' : (p.classificacao_consumo === 'CONSUMO_MEDIO' ? '#0055FF' : '#94A3B8')}">
          <h4 class="tooltip-title" style="margin-bottom:2px;">${p.municipio} / ${p.uf}</h4>
          <div class="tooltip-sub" style="margin-bottom:8px;">${p.classificacao_consumo.replace('_', ' ')}</div>
          <div class="tooltip-meta" style="display:flex; flex-direction:column; gap:4px;">
            <span>População: <strong>${p.populacao_estimada.toLocaleString('pt-BR')}</strong></span>
            <span>PIB Per Capita: <strong>${formatBRL(p.pib_per_capita)}</strong></span>
            <span>Consumo Setorial (Ano): <strong>${formatBRL(p.consumo_anual_estimado)}</strong></span>
            <span>Leads Cadastrados: <strong>${p.leads_count}</strong></span>
            <span>IPC Score: <strong style="color:#00D2FF;">${p.ipc_score}/100</strong></span>
          </div>
        </div>
      `;

      hoverPopup.setLngLat(coords).setHTML(html).addTo(map);
    });

    map.on('mouseleave', 'pof-layer-circles', () => {
      map.getCanvas().style.cursor = '';
      if (hoverPopup) hoverPopup.remove();
    });
  }

  async function fetchAndRenderPofLayer() {
    if (!map || !map.getSource('pof-source')) return;

    // Pega a vertical atual selecionada no sistema (ou usa default)
    let activeVertical = 'GERAL';
    if (window.state && window.state.filters && window.state.filters.vertical) {
      activeVertical = window.state.filters.vertical;
    }

    try {
      const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : { 'Content-Type': 'application/json' };
      const res = await fetch(`/api/macro/layers/municipal-potential?vertical=${activeVertical}`, { headers });
      if (!res.ok) throw new Error('Falha ao carregar camada POF');
      const geojson = await res.json();

      if (pofLayerActive) {
        map.getSource('pof-source').setData(geojson);
        map.setLayoutProperty('pof-layer-circles', 'visibility', 'visible');
      }
    } catch (err) {
      console.error('Erro ao renderizar camada POF:', err);
    }
  }

  function hidePofLayer() {
    if (!map || !map.getLayer('pof-layer-circles')) return;
    map.setLayoutProperty('pof-layer-circles', 'visibility', 'none');
  }

  /**
   * Força atualização da camada POF caso ela esteja ativa
   */
  function refreshPofLayer() {
    if (pofLayerActive) {
      fetchAndRenderPofLayer();
    }
  }

  /**
   * Manipula criação ou edição de polígono desenhado pelo operador
   */
  function handlePolygonChange() {
    if (!draw) return;
    const allDrawn = draw.getAll();
    if (!allDrawn || allDrawn.features.length === 0) return;

    const polygonFeature = allDrawn.features[0];
    const coordsRing = polygonFeature.geometry.coordinates[0]; // [ [lng, lat], ... ]

    if (!Array.isArray(coordsRing) || coordsRing.length < 3) return;

    // Converte para formato [lat, lng] esperado pelo GeoSpatialEngine
    activeDrawnPolygon = coordsRing.map(c => [c[1], c[0]]);

    // Filtra os leads pelo polígono espacial
    filterLeadsByDrawnPolygon(activeDrawnPolygon);

    const btnClear = document.getElementById('btnClearPolygon');
    if (btnClear) btnClear.style.display = 'inline-flex';
  }

  /**
   * Limpa o polígono e restaura a listagem de leads
   */
  function handlePolygonCleared() {
    activeDrawnPolygon = null;
    const btnClear = document.getElementById('btnClearPolygon');
    if (btnClear) btnClear.style.display = 'none';

    // Restaura leads sem filtro de polígono
    if (window.state) {
      window.state.geoPolygonFilter = null;
      if (typeof window.applyFilters === 'function') {
        window.applyFilters(1);
      }
    }

    fetchAndRenderGeoJson();
    showToast('Filtro de território cancelado. Todos os leads restaurados.');
  }

  /**
   * Isola os leads dentro do polígono desenhado usando Ray-Casting
   */
  function filterLeadsByDrawnPolygon(polygon) {
    if (!polygon || !currentGeoJson.features) return;

    const insideFeatures = currentGeoJson.features.filter(f => {
      const [lng, lat] = f.geometry.coordinates;
      return isPointInPolygon(lat, lng, polygon);
    });

    const insideIds = new Set(insideFeatures.map(f => f.properties.id));

    // Atualiza contadores visuais
    const badge = document.getElementById('mapFilteredCountBadge');
    if (badge) {
      badge.textContent = `${insideFeatures.length} no território delimitado`;
      badge.classList.add('highlight');
    }

    // Sincroniza com a tabela e o estado da aplicação
    if (window.state) {
      window.state.geoPolygonFilter = polygon;
      // Atualiza listagem da tabela se a função existir
      if (typeof window.applyPolygonFilterToTable === 'function') {
        window.applyPolygonFilterToTable(insideIds);
      }
    }

    showToast(`Cancela Comercial ativa: ${insideFeatures.length} leads isolados no polígono.`);
  }

  /**
   * Algoritmo Ray-Casting de alta precisão
   */
  function isPointInPolygon(lat, lng, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      const intersect = ((yi > lng) !== (yj > lng))
        && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // ===========================================================================
  // FASE GEOMARKETING ENTERPRISE: RAIO DE PROXIMIDADE GEODÉSICO (PADRÃO VERSUS)
  // ===========================================================================

  let currentRadiusCenter = { lat: -15.6014, lng: -56.0979, name: 'Cuiabá' };
  let currentRadiusKm = 150;
  let isPickingPointOnMap = false;

  /**
   * Configura fonte e camadas vetoriais do buffer geodésico
   */
  function setupRadiusBufferLayer() {
    if (!map) return;
    if (map.getSource('radius-buffer-source')) return;

    map.addSource('radius-buffer-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // 1. Camada de preenchimento translúcido ciano (#00D2FF com opacidade 0.12)
    map.addLayer({
      id: 'radius-buffer-fill',
      type: 'fill',
      source: 'radius-buffer-source',
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'fill-color': '#00D2FF',
        'fill-opacity': 0.12
      }
    }, 'unclustered-point');

    // 2. Camada de contorno do perímetro (#00D2FF, 2px)
    map.addLayer({
      id: 'radius-buffer-line',
      type: 'line',
      source: 'radius-buffer-source',
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'line-color': '#00D2FF',
        'line-width': 2,
        'line-opacity': 0.85
      }
    }, 'unclustered-point');

    // 3. Ponto central (Hub do Raio)
    map.addLayer({
      id: 'radius-center-point',
      type: 'circle',
      source: 'radius-buffer-source',
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': '#00D2FF',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF'
      }
    }, 'unclustered-point');

    // Se já havia filtro no state global ao carregar o mapa, restaura visualmente
    if (window.state && window.state.filters && window.state.filters.geo_radius) {
      const gr = window.state.filters.geo_radius;
      const lat = parseFloat(gr.center_lat !== undefined ? gr.center_lat : gr.lat);
      const lng = parseFloat(gr.center_lng !== undefined ? gr.center_lng : gr.lng);
      const r = parseFloat(gr.radius_km || gr.radius) || 150;
      if (!isNaN(lat) && !isNaN(lng)) {
        currentRadiusCenter = { lat, lng, name: gr.name || 'Ponto Definido' };
        currentRadiusKm = r;
        renderRadiusBuffer(lng, lat, r, false);
      }
    }
  }

  /**
   * Gera um polígono geodésico esférico de 64 vértices cobrindo a curvatura real da Terra
   */
  function createGeodesicCircle(centerLng, centerLat, radiusKm, points = 64) {
    const coords = [];
    const earthRadiusKm = 6371;
    const radCenterLat = (centerLat * Math.PI) / 180;
    const radCenterLng = (centerLng * Math.PI) / 180;
    const angularDist = radiusKm / earthRadiusKm;

    for (let i = 0; i <= points; i++) {
      const bearing = (i * 2 * Math.PI) / points;
      const latRad = Math.asin(
        Math.sin(radCenterLat) * Math.cos(angularDist) +
        Math.cos(radCenterLat) * Math.sin(angularDist) * Math.cos(bearing)
      );
      const lngRad = radCenterLng + Math.atan2(
        Math.sin(bearing) * Math.sin(angularDist) * Math.cos(radCenterLat),
        Math.cos(angularDist) - Math.sin(radCenterLat) * Math.sin(latRad)
      );
      coords.push([(lngRad * 180) / Math.PI, (latRad * 180) / Math.PI]);
    }

    return {
      type: 'Feature',
      properties: { radius_km: radiusKm, center: [centerLng, centerLat] },
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      }
    };
  }

  /**
   * Distância em KM via fórmula de Haversine
   */
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Conta empresas no GeoJSON carregado que residem dentro do raio em KM
   */
  function countLeadsInRadius(centerLat, centerLng, radiusKm) {
    if (!currentGeoJson || !Array.isArray(currentGeoJson.features)) return 0;
    let count = 0;
    for (const f of currentGeoJson.features) {
      if (f.geometry && Array.isArray(f.geometry.coordinates)) {
        const [fLng, fLat] = f.geometry.coordinates;
        if (haversineDistance(centerLat, centerLng, fLat, fLng) <= radiusKm) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Renderiza o buffer vetorial no MapLibre e ajusta a câmera se solicitado
   */
  function renderRadiusBuffer(centerLng, centerLat, radiusKm, fitCamera = false) {
    if (!map || !map.getSource('radius-buffer-source')) return;

    const circleFeature = createGeodesicCircle(centerLng, centerLat, radiusKm, 64);
    const pointFeature = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [centerLng, centerLat]
      },
      properties: { center: true }
    };

    map.getSource('radius-buffer-source').setData({
      type: 'FeatureCollection',
      features: [circleFeature, pointFeature]
    });

    if (fitCamera) {
      const coords = circleFeature.geometry.coordinates[0];
      let minLng = coords[0][0], maxLng = coords[0][0];
      let minLat = coords[0][1], maxLat = coords[0][1];
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: 50,
        maxZoom: 14,
        duration: 900
      });
    }

    updateRadiusPerimeterCount(centerLat, centerLng, radiusKm);
  }

  /**
   * Remove o buffer vetorial do mapa
   */
  function clearRadiusBuffer() {
    if (map && map.getSource('radius-buffer-source')) {
      map.getSource('radius-buffer-source').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    const countVal = document.getElementById('mapRadiusCountVal');
    if (countVal) countVal.textContent = '--';
  }

  function updateRadiusPerimeterCount(centerLat, centerLng, radiusKm) {
    const countVal = document.getElementById('mapRadiusCountVal');
    if (!countVal) return;
    const count = countLeadsInRadius(centerLat, centerLng, radiusKm);
    countVal.textContent = `${count} empresa${count === 1 ? '' : 's'}`;
  }

  /**
   * Configura eventos do painel flutuante de raio e interações
   */
  function setupRadiusControls() {
    const btnToggle = document.getElementById('btnMapRadiusToggle');
    const panel = document.getElementById('mapRadiusControlPanel');
    const btnClose = document.getElementById('btnCloseRadiusPanel');
    const selectCluster = document.getElementById('selectMapRadiusCluster');
    const btnPick = document.getElementById('btnPickPointOnMap');
    const coordsDisplay = document.getElementById('radiusCoordsDisplay');
    const slider = document.getElementById('sliderMapRadius');
    const distValue = document.getElementById('displayMapRadiusDist');
    const btnApply = document.getElementById('btnApplyRadiusFilter');
    const btnClear = document.getElementById('btnClearRadiusFilter');
    const toggleLabel = document.getElementById('btnMapRadiusToggleLabel');

    // 1. Alternância de visibilidade do painel flutuante
    btnToggle?.addEventListener('click', () => {
      if (!panel) return;
      const isVisible = panel.style.display !== 'none';
      panel.style.display = isVisible ? 'none' : 'flex';
      btnToggle.classList.toggle('active', !isVisible || !!window.state?.filters?.geo_radius);
      if (!isVisible && currentRadiusCenter && currentRadiusKm) {
        updateRadiusPerimeterCount(currentRadiusCenter.lat, currentRadiusCenter.lng, currentRadiusKm);
      }
    });

    btnClose?.addEventListener('click', () => {
      if (panel) panel.style.display = 'none';
      if (!window.state?.filters?.geo_radius) {
        btnToggle?.classList.remove('active');
      }
    });

    // 2. Carregar catálogo de pólos estratégicos do agronegócio e indústria
    const DEFAULT_CLUSTERS = [
      { id: 'cuiaba', name: 'Cuiabá / Várzea Grande - MT', lat: -15.6014, lng: -56.0979, default_radius_km: 150 },
      { id: 'ribeirao_preto', name: 'Ribeirão Preto (Agrishow) - SP', lat: -21.1767, lng: -47.8108, default_radius_km: 150 },
      { id: 'uberlandia', name: 'Uberlândia / Triângulo Mineiro - MG', lat: -18.9186, lng: -48.2772, default_radius_km: 150 },
      { id: 'passo_fundo', name: 'Passo Fundo / Planalto Médio - RS', lat: -28.2628, lng: -52.4067, default_radius_km: 150 },
      { id: 'sao_paulo', name: 'São Paulo (Grande SP) - SP', lat: -23.5505, lng: -46.6333, default_radius_km: 100 },
      { id: 'goiania', name: 'Goiânia / Anápolis - GO', lat: -16.6869, lng: -49.2648, default_radius_km: 150 },
      { id: 'londrina', name: 'Londrina / Norte do PR', lat: -23.3045, lng: -51.1696, default_radius_km: 150 },
      { id: 'cascavel', name: 'Cascavel / Oeste Paranaense - PR', lat: -24.9578, lng: -53.4595, default_radius_km: 150 },
      { id: 'rio_verde', name: 'Rio Verde / Sudoeste Goiano - GO', lat: -17.7915, lng: -50.9192, default_radius_km: 180 },
      { id: 'campinas', name: 'Campinas / RMC - SP', lat: -22.9099, lng: -47.0626, default_radius_km: 120 },
      { id: 'sorriso', name: 'Sorriso / BR-163 (Norte MT) - MT', lat: -12.5428, lng: -55.7214, default_radius_km: 250 },
      { id: 'chapeco', name: 'Chapecó / Oeste Catarinense - SC', lat: -27.1004, lng: -52.6152, default_radius_km: 150 },
      { id: 'matopiba', name: 'Luís Eduardo Magalhães (MATOPIBA) - BA', lat: -12.0969, lng: -45.7958, default_radius_km: 200 }
    ];

    fetch('/api/gis/clusters')
      .then(r => r.json())
      .then(data => {
        let list = DEFAULT_CLUSTERS;
        if (data && data.success && Array.isArray(data.clusters)) {
          const apiClusters = data.clusters.map(c => ({
            id: c.id,
            name: `${c.name} (${c.center.city || ''})`,
            lat: c.center.lat,
            lng: c.center.lng,
            default_radius_km: c.default_radius_km || 150
          }));
          list = [...apiClusters, ...DEFAULT_CLUSTERS.filter(dc => !apiClusters.some(ac => ac.name.includes(dc.id)))];
        }
        if (selectCluster) {
          selectCluster.innerHTML = '<option value="">-- Selecione um Pólo Estratégico --</option>' +
            list.map(c => `<option value="${c.id}" data-lat="${c.lat}" data-lng="${c.lng}" data-r="${c.default_radius_km}">${c.name}</option>`).join('');
        }
      })
      .catch(() => {
        if (selectCluster) {
          selectCluster.innerHTML = '<option value="">-- Selecione um Pólo Estratégico --</option>' +
            DEFAULT_CLUSTERS.map(c => `<option value="${c.id}" data-lat="${c.lat}" data-lng="${c.lng}" data-r="${c.default_radius_km}">${c.name}</option>`).join('');
        }
      });

    // 3. Mudança de Pólo Selecionado
    selectCluster?.addEventListener('change', () => {
      const opt = selectCluster.selectedOptions[0];
      if (!opt || !opt.value) return;

      const lat = parseFloat(opt.getAttribute('data-lat'));
      const lng = parseFloat(opt.getAttribute('data-lng'));
      const defR = parseFloat(opt.getAttribute('data-r')) || 150;

      if (!isNaN(lat) && !isNaN(lng)) {
        currentRadiusCenter = { lat, lng, name: opt.textContent };
        currentRadiusKm = defR;

        if (slider) slider.value = defR;
        if (distValue) distValue.textContent = `${defR} km`;
        if (coordsDisplay) coordsDisplay.textContent = `Lat: ${lat.toFixed(2)}, Lng: ${lng.toFixed(2)}`;

        renderRadiusBuffer(lng, lat, defR, true);
      }
    });

    // 4. Mudança de Distância (Slider)
    slider?.addEventListener('input', () => {
      currentRadiusKm = parseFloat(slider.value) || 150;
      if (distValue) distValue.textContent = `${currentRadiusKm} km`;
      if (currentRadiusCenter && !isNaN(currentRadiusCenter.lat)) {
        renderRadiusBuffer(currentRadiusCenter.lng, currentRadiusCenter.lat, currentRadiusKm, false);
      }
    });

    // 5. Clicar no Mapa para definir ponto de origem
    btnPick?.addEventListener('click', () => {
      if (!map) return;
      isPickingPointOnMap = !isPickingPointOnMap;
      btnPick.classList.toggle('active', isPickingPointOnMap);

      if (isPickingPointOnMap) {
        map.getCanvas().style.cursor = 'crosshair';
        showToast('Clique em qualquer local do mapa para posicionar o centro do raio.');

        map.once('click', (e) => {
          if (!isPickingPointOnMap) return;
          const { lng, lat } = e.lngLat;
          currentRadiusCenter = { lat, lng, name: 'Ponto no Mapa' };
          if (coordsDisplay) coordsDisplay.textContent = `Lat: ${lat.toFixed(3)}, Lng: ${lng.toFixed(3)}`;
          if (selectCluster) selectCluster.value = '';

          renderRadiusBuffer(lng, lat, currentRadiusKm, false);

          isPickingPointOnMap = false;
          btnPick.classList.remove('active');
          map.getCanvas().style.cursor = '';
          showToast('Ponto de origem fixado no mapa.');
        });
      } else {
        map.getCanvas().style.cursor = '';
      }
    });

    // 6. Aplicar Filtro no Estado Global e recarregar dados
    btnApply?.addEventListener('click', () => {
      if (!currentRadiusCenter || isNaN(currentRadiusCenter.lat)) {
        showToast('Selecione um pólo ou clique no mapa para definir a origem.');
        return;
      }

      if (window.state && window.state.filters) {
        window.state.filters.geo_radius = {
          lat: currentRadiusCenter.lat,
          lng: currentRadiusCenter.lng,
          center_lat: currentRadiusCenter.lat,
          center_lng: currentRadiusCenter.lng,
          radius_km: currentRadiusKm,
          name: currentRadiusCenter.name || 'Raio Logístico'
        };
        window.state.filters.page = 1;
      }

      if (btnToggle) {
        btnToggle.classList.add('active');
        if (toggleLabel) toggleLabel.textContent = `Raio: ${currentRadiusKm}km`;
      }

      if (panel) panel.style.display = 'none';

      if (window.applyFilters) {
        window.applyFilters();
      }

      showToast(`Filtro de raio de ${currentRadiusKm} km aplicado com sucesso.`);
    });

    // 7. Limpar Raio do Mapa e do Estado Global
    btnClear?.addEventListener('click', () => {
      if (window.state && window.state.filters) {
        window.state.filters.geo_radius = null;
        window.state.filters.page = 1;
      }

      clearRadiusBuffer();

      if (selectCluster) selectCluster.value = '';
      if (coordsDisplay) coordsDisplay.textContent = 'Nenhum ponto fixado';
      if (slider) slider.value = 150;
      if (distValue) distValue.textContent = '150 km';
      currentRadiusKm = 150;

      if (btnToggle) {
        btnToggle.classList.remove('active');
        if (toggleLabel) toggleLabel.textContent = 'Raio de Proximidade';
      }

      if (panel) panel.style.display = 'none';

      if (window.applyFilters) {
        window.applyFilters();
      }

      showToast('Filtro de raio removido. Visão territorial ampla restaurada.');
    });
  }

  /**
   * Busca os dados GeoJSON da API e renderiza no mapa
   */
  async function fetchAndRenderGeoJson(customFilters = null) {
    const filters = customFilters || (window.state ? window.state.filters : {});

    try {
      const fetchFn = typeof window.fetchWithTimeout === 'function' ? window.fetchWithTimeout : fetch;
      const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : { 'Content-Type': 'application/json' };
      const res = await fetchFn('/api/gis/geojson', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ filters })
      }, 10000);

      if (!res.ok) throw new Error('Falha ao carregar dados GeoJSON');
      const geojson = await res.json();
      currentGeoJson = geojson || { type: 'FeatureCollection', features: [] };

      if (map && map.getSource('leads-source')) {
        map.getSource('leads-source').setData(currentGeoJson);
        renderCommercialB2bPins(currentGeoJson.features);
      }

      const badge = document.getElementById('mapFilteredCountBadge');
      if (badge) {
        const featCount = currentGeoJson.total_features !== undefined ? currentGeoJson.total_features : (currentGeoJson.features ? currentGeoJson.features.length : 0);
        const tType = String(filters.target_type || '').toUpperCase();
        const typeNoun = tType === 'SUPPLIER' ? 'revendas / fornecedores' : (tType === 'BUYER' ? 'compradores / fazendas' : 'empresas');
        badge.textContent = `${featCount} ${typeNoun}`;
        badge.classList.remove('highlight');
      }

      // Se estado zero (sem empresas no filtro), centraliza na cidade ou estado selecionado (sem reset cego para o Brasil)
      const count = currentGeoJson.total_features !== undefined ? currentGeoJson.total_features : (currentGeoJson.features ? currentGeoJson.features.length : 0);
      if (count === 0 && map) {
        const activeCity = (filters.cidades && filters.cidades[0]) ? filters.cidades[0] : '';
        const activeUf = (filters.estados && filters.estados[0]) ? filters.estados[0] : '';
        if (activeCity || activeUf) {
          flyToLocation(activeUf, activeCity);
        } else {
          map.flyTo({
            center: BRAZIL_CENTER,
            zoom: BRAZIL_DEFAULT_ZOOM,
            speed: 1.2
          });
        }
      }

      // Se a camada H3 estiver ativa, atualiza com os novos dados
      if (window.H3LayerEngine && window.H3LayerEngine.isActive() && currentGeoJson.features) {
        window.H3LayerEngine.applyH3Layer(map, currentGeoJson.features);
      }

      // Atualiza o contador de perímetro caso o raio esteja ativo
      if (currentRadiusCenter && !isNaN(currentRadiusCenter.lat) && currentRadiusKm) {
        updateRadiusPerimeterCount(currentRadiusCenter.lat, currentRadiusCenter.lng, currentRadiusKm);
      }
    } catch (err) {
      console.warn('⚠️ GeoJSON temporariamente indisponível no mapa (mantendo camada base):', err.message);
      clearCommercialB2bMarkers();
      // Mantém a fonte vazia sem quebrar o canvas MapLibre
      if (map && map.getSource('leads-source')) {
        map.getSource('leads-source').setData({ type: 'FeatureCollection', features: [] });
      }
    }

  }

  // ===========================================================================
  // PINS COMERCIAIS ESTILO GOOGLE MAPS PARA FORNECEDORES & REVENDAS B2B
  // ===========================================================================
  let commercialB2bMarkers = [];

  function clearCommercialB2bMarkers() {
    if (commercialB2bMarkers && commercialB2bMarkers.length > 0) {
      commercialB2bMarkers.forEach(m => m.remove());
      commercialB2bMarkers = [];
    }
  }

  function renderCommercialB2bPins(features) {
    clearCommercialB2bMarkers();
    if (!map || !Array.isArray(features)) return;

    // Filtra empresas comerciais / fornecedores / revendas
    const suppliers = features.filter(f => {
      const p = f.properties || {};
      const targetType = String(p.target_type || '').toUpperCase();
      const desc = String(p.cnae_descricao || '').toLowerCase();
      const tag = String(p.tag || '').toLowerCase();
      return targetType === 'SUPPLIER' || desc.includes('comércio') || desc.includes('comercio') || desc.includes('atacad') || tag.includes('revenda');
    });

    suppliers.forEach(f => {
      const coords = f.geometry?.coordinates;
      if (!coords || isNaN(coords[0]) || isNaN(coords[1])) return;
      const p = f.properties || {};

      const el = document.createElement('div');
      const isAgro = String(p.cnae_descricao || '').match(/(máquinas|trator|defensivos|fertilizantes|adubo|sementes|agrícola|agricola)/i) || 
                     String(p.razao_social || '').match(/(agro|máquinas|tratores|insumos|slc|macponta|agrofel)/i);
      el.className = `google-maps-company-pin ${isAgro ? 'agro-revenda' : ''}`;
      el.setAttribute('data-id', p.id);
      if (window.state && window.state.selectedLeadIds && window.state.selectedLeadIds.has(p.id)) {
        el.classList.add('selected-highlight');
      }

      const icon = isAgro 
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="7" cy="17" r="3.5"></circle><circle cx="18" cy="18" r="2"></circle><path d="M10.5 17h5.5"></path><path d="M3.5 17H2v-5l4-2h5l3 7"></path><path d="M10 10V5h4"></path><path d="M14 7h4l2 5v3"></path></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="9" y1="22" x2="9" y2="18"></line><line x1="15" y1="22" x2="15" y2="18"></line></svg>`;
      const label = p.nome_fantasia || p.razao_social || 'Revenda';

      el.innerHTML = `
        <div class="gm-pin-bubble" title="${p.razao_social} (${p.cnae_descricao || 'Comércio / B2B'})">
          <div class="gm-pin-icon-wrap" style="display:inline-flex;align-items:center;justify-content:center;">${icon}</div>
          <span class="gm-pin-title">${label}</span>
        </div>
        <div class="gm-pin-arrow"></div>
        <div class="gm-pin-pulse-ring"></div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.google-maps-company-pin').forEach(pEl => pEl.classList.remove('selected-highlight'));
        el.classList.add('selected-highlight');
        if (p.id && window.inspectLeadInDrawer) {
          window.inspectLeadInDrawer(p.id);
        } else if (p.id && window.openLeadModal) {
          window.openLeadModal(p.id);
        }
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(coords)
        .addTo(map);

      commercialB2bMarkers.push(marker);
    });

    // Se houver revendas na visualização, enquadra suavemente se o zoom estiver muito distante
    if (suppliers.length > 0 && suppliers.length <= 25 && map.getZoom() < 10) {
      try {
        const bounds = new maplibregl.LngLatBounds();
        suppliers.forEach(s => bounds.extend(s.geometry.coordinates));
        map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 800 });
      } catch(_) {}
    }
  }

  /**
   * Força redimensionamento do canvas WebGL
   */
  function resize() {
    if (map) {
      map.resize();
    }
  }

  // ===========================================================================
  // FASE 23: CAMADA ESPACIAL DEDICADA DE CONCORRÊNCIA & GAPS (PADRÃO VERSUS)
  // ===========================================================================

  /**
   * Configura fontes e camadas isoladas para Concorrentes e Zonas de Gaps
   */
  function setupCompetitorsAndGapsLayers() {
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once('style.load', () => setupCompetitorsAndGapsLayers());
      return;
    }
    if (map.getSource('competitors-source')) return;

    // Inicializa popup tático interativo
    tacticalPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      className: 'maplibre-dark-popup'
    });

    // 1. Fonte GeoJSON para Concorrentes (Buffer 50km + Marcadores)
    map.addSource('competitors-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // 2. Fonte GeoJSON para Zonas de Oportunidade (Gaps)
    map.addSource('gaps-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // 1.1 Buffer geodésico de 50km do concorrente: preenchimento translúcido vermelho (#EF4444 com 0.15)
    map.addLayer({
      id: 'competitor-buffer-fill',
      type: 'fill',
      source: 'competitors-source',
      filter: ['==', '$type', 'Polygon'],
      layout: { visibility: 'none' },
      paint: {
        'fill-color': '#EF4444',
        'fill-opacity': 0.14
      }
    }, 'unclustered-point');

    // 1.2 Borda do buffer do concorrente: linha tracejada em vermelho alerta (#EF4444)
    map.addLayer({
      id: 'competitor-buffer-line',
      type: 'line',
      source: 'competitors-source',
      filter: ['==', '$type', 'Polygon'],
      layout: { 
        visibility: 'none',
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#EF4444',
        'line-width': 2,
        'line-dasharray': [3, 2],
        'line-opacity': 0.85
      }
    }, 'unclustered-point');

    // 2.1 Círculo/Geofencing do Gap: preenchimento verde/ciano translúcido
    map.addLayer({
      id: 'gap-buffer-fill',
      type: 'fill',
      source: 'gaps-source',
      filter: ['==', '$type', 'Polygon'],
      layout: { visibility: 'none' },
      paint: {
        'fill-color': '#00D2FF',
        'fill-opacity': 0.18
      }
    }, 'unclustered-point');

    // 2.2 Borda do Geofencing do Gap: ciano VERSUS
    map.addLayer({
      id: 'gap-buffer-line',
      type: 'line',
      source: 'gaps-source',
      filter: ['==', '$type', 'Polygon'],
      layout: { visibility: 'none' },
      paint: {
        'line-color': '#00D2FF',
        'line-width': 2,
        'line-opacity': 0.9
      }
    }, 'unclustered-point');

    // 2.3 Marcador central do Gap (Ciano pulsante)
    map.addLayer({
      id: 'gap-point-marker',
      type: 'circle',
      source: 'gaps-source',
      filter: ['==', '$type', 'Point'],
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': 8,
        'circle-color': '#00D2FF',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
        'circle-opacity': 0.95
      }
    });

    // 1.3 Marcador real do Concorrente (Vermelho alerta #EF4444 com badge visual)
    map.addLayer({
      id: 'competitor-point-marker',
      type: 'circle',
      source: 'competitors-source',
      filter: ['==', '$type', 'Point'],
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': 9,
        'circle-color': '#EF4444',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#FFFFFF',
        'circle-opacity': 0.98
      }
    });

    // Interações de clique e hover para Marcadores de Concorrentes
    map.on('click', 'competitor-point-marker', (e) => {
      if (!e.features || e.features.length === 0) return;
      const p = e.features[0].properties;
      const coords = e.features[0].geometry.coordinates.slice();

      const html = `
        <div class="map-tactical-popup">
          <div class="map-tactical-header">
            <span class="map-badge-competitor"><span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:#EF4444; margin-right:4px;"></span>CONCORRENTE</span>
            <span style="font-size: 0.65rem; color: #EF4444; font-weight: 700;">Buffer 50 km</span>
          </div>
          <h4 class="map-tactical-title">${p.nome_fantasia || p.razao_social}</h4>
          <div class="map-tactical-sub">${p.razao_social || ''} • CNPJ: ${p.cnpj || '--'}</div>
          <div class="map-tactical-grid">
            <div class="map-tactical-row">
              <span>Localização:</span>
              <strong>${p.municipio || '--'}/${p.uf || '--'}</strong>
            </div>
            <div class="map-tactical-row">
              <span>Score Fragilidade:</span>
              <strong style="color: ${p.fragility_score >= 60 ? '#EF4444' : '#F59E0B'};">${p.fragility_score || 50}/100</strong>
            </div>
            <div class="map-tactical-row">
              <span>Capital Declarado:</span>
              <strong>${p.capital_formatted || 'R$ 0'}</strong>
            </div>
          </div>
        </div>
      `;

      tacticalPopup.setLngLat(coords).setHTML(html).addTo(map);
    });

    map.on('mouseenter', 'competitor-point-marker', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'competitor-point-marker', () => {
      map.getCanvas().style.cursor = '';
    });

    // Interações de clique e hover para Marcadores de Gaps
    map.on('click', 'gap-point-marker', (e) => {
      if (!e.features || e.features.length === 0) return;
      const p = e.features[0].properties;
      const coords = e.features[0].geometry.coordinates.slice();

      const pColor = p.priority_level === 'ALTA' ? '#22C55E' : (p.priority_level === 'MEDIA' ? '#F59E0B' : '#94A3B8');

      const html = `
        <div class="map-tactical-popup">
          <div class="map-tactical-header">
            <span class="map-badge-gap">🎯 ZONA DE GAP</span>
            <span style="font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 800; background: ${pColor}20; color: ${pColor}; border: 1px solid ${pColor}50;">
              PRIORIDADE ${p.priority_level || 'ALTA'}
            </span>
          </div>
          <h4 class="map-tactical-title">${p.municipio} / ${p.uf}</h4>
          <div class="map-tactical-sub">Vazio Assistencial • IPC ${p.ipc_score || 0}/100</div>
          <div class="map-tactical-grid">
            <div class="map-tactical-row">
              <span>Gap Score:</span>
              <strong style="color: #00D2FF; font-size: 0.8rem;">${p.gap_score} pts</strong>
            </div>
            <div class="map-tactical-row">
              <span>Demanda Estimada:</span>
              <strong>${p.estimated_market_formatted || 'R$ 0'}</strong>
            </div>
            <div class="map-tactical-row">
              <span>Distância Concorrente:</span>
              <strong style="color: #38BDF8;">${p.min_distance_competitor_km || 0} km</strong>
            </div>
            <div class="map-tactical-row">
              <span>Geofencing Sugerido:</span>
              <strong style="color: #22C55E;">Raio ${p.recommended_radius_km || 50} km</strong>
            </div>
          </div>
        </div>
      `;

      tacticalPopup.setLngLat(coords).setHTML(html).addTo(map);
    });

    map.on('mouseenter', 'gap-point-marker', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'gap-point-marker', () => {
      map.getCanvas().style.cursor = '';
    });
  }

  /**
   * Alterna visibilidade das camadas espaciais de concorrência e gaps
   */
  function setCompetitorLayersVisibility(visible) {
    if (!map) return;
    competitorsLayerActive = !!visible;

    if (!map.isStyleLoaded()) {
      map.once('style.load', () => setCompetitorLayersVisibility(visible));
      return;
    }

    const visibility = visible ? 'visible' : 'none';
    const layers = [
      'competitor-buffer-fill',
      'competitor-buffer-line',
      'gap-buffer-fill',
      'gap-buffer-line',
      'gap-point-marker',
      'competitor-point-marker'
    ];

    layers.forEach(layerId => {
      try {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      } catch (_) {}
    });

    const btnToggle = document.getElementById('btnToggleCompetitorsLayer');
    if (btnToggle) {
      btnToggle.classList.toggle('active', visible);
    }

    // Atualiza a Legenda Espacial dedicada de Concorrência & Gaps
    const legendCompSection = document.getElementById('legendCompetitorsSection');
    if (legendCompSection) {
      legendCompSection.style.display = visible ? 'flex' : 'none';
    }

    if (!visible && tacticalPopup) {
      tacticalPopup.remove();
    }
  }

  /**
   * Converte concorrentes e gaps em GeoJSON e projeta no MapLibre WebGL
   */
  function renderCompetitorAndGapsSpatial(competitors = [], gaps = [], fitCamera = true) {
    if (!map) {
      if (typeof initMap === 'function') initMap();
    }
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once('style.load', () => {
        try {
          renderCompetitorAndGapsSpatial(competitors, gaps, fitCamera);
        } catch (e) {
          console.warn('[MapEngine] Erro ao renderizar concorrentes pós style.load:', e);
        }
      });
      return;
    }

    try {
      if (!map.getSource('competitors-source') || !map.getSource('gaps-source')) {
        setupCompetitorsAndGapsLayers();
      }
    } catch (e) {
      console.warn('[MapEngine] Erro ao configurar fontes de concorrentes:', e);
      return;
    }

    const competitorFeatures = [];
    const gapFeatures = [];
    const allCoordinates = [];

    // 1. Processa concorrentes
    (competitors || []).forEach(c => {
      const lat = parseFloat(c.latitude);
      const lng = parseFloat(c.longitude);
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return;

      allCoordinates.push([lng, lat]);

      // Ponto do concorrente
      competitorFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        properties: {
          id: c.id,
          cnpj: c.cnpj,
          razao_social: c.razao_social,
          nome_fantasia: c.nome_fantasia || c.razao_social,
          municipio: c.municipio,
          uf: c.uf,
          fragility_score: c.fragility?.fragility_score || 50,
          capital_formatted: c.capital_social ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.capital_social) : 'R$ 0'
        }
      });

      // Buffer geodésico padrão de 50km
      const bufferCircle = createGeodesicCircle(lng, lat, 50, 64);
      bufferCircle.properties = { competitor_id: c.id, type: 'competitor_buffer' };
      competitorFeatures.push(bufferCircle);
    });

    // 2. Processa zonas de oportunidade (Gaps)
    (gaps || []).forEach(g => {
      const lat = parseFloat(g.latitude);
      const lng = parseFloat(g.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      allCoordinates.push([lng, lat]);

      const radiusKm = parseFloat(g.recommended_radius_km) || 50;

      // Ponto central do Gap
      gapFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        properties: {
          municipio: g.municipio,
          uf: g.uf,
          gap_score: g.gap_score,
          priority_level: g.priority_level,
          estimated_market_formatted: g.estimated_market_formatted,
          min_distance_competitor_km: g.min_distance_competitor_km,
          distancia_concorrente_km: g.min_distance_competitor_km,
          recommended_radius_km: radiusKm,
          radius_km: radiusKm,
          ipc_score: g.ipc_score
        }
      });

      // Polígono do Geofencing sugerido
      const gapCircle = createGeodesicCircle(lng, lat, radiusKm, 48);
      gapCircle.properties = { municipio: g.municipio, uf: g.uf, gap_score: g.gap_score };
      gapFeatures.push(gapCircle);
    });

    // Atualiza as fontes de dados
    if (map.getSource('competitors-source')) {
      map.getSource('competitors-source').setData({
        type: 'FeatureCollection',
        features: competitorFeatures
      });
    }
    if (map.getSource('gaps-source')) {
      map.getSource('gaps-source').setData({
        type: 'FeatureCollection',
        features: gapFeatures
      });
    }

    // Liga a visibilidade da camada
    setCompetitorLayersVisibility(true);

    // Ajusta o enquadramento do mapa se solicitado e houver coordenadas
    if (fitCamera && allCoordinates.length > 0) {
      let minLng = allCoordinates[0][0], maxLng = allCoordinates[0][0];
      let minLat = allCoordinates[0][1], maxLat = allCoordinates[0][1];

      for (const [lng, lat] of allCoordinates) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      // Se for apenas 1 ponto, adiciona margem
      if (minLng === maxLng && minLat === maxLat) {
        minLng -= 0.5;
        maxLng += 0.5;
        minLat -= 0.5;
        maxLat += 0.5;
      }

      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: 70,
        maxZoom: 12,
        duration: 1000
      });
    }
  }

  /**
   * Navega suavemente (flyTo) para um Gap específico e abre o popup tático
   */
  function flyToGapLocation(lat, lng, gapData = {}) {
    if (!map) {
      initMap();
    }

    // Garante que a camada está ligada
    setCompetitorLayersVisibility(true);

    map.flyTo({
      center: [lng, lat],
      zoom: 10,
      speed: 1.2,
      curve: 1.4,
      essential: true
    });

    const pColor = gapData.priority_level === 'ALTA' ? '#22C55E' : (gapData.priority_level === 'MEDIA' ? '#F59E0B' : '#94A3B8');

    const html = `
      <div class="map-tactical-popup">
        <div class="map-tactical-header">
          <span class="map-badge-gap">🎯 ZONA DE GAP</span>
          <span style="font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 800; background: ${pColor}20; color: ${pColor}; border: 1px solid ${pColor}50;">
            PRIORIDADE ${gapData.priority_level || 'ALTA'}
          </span>
        </div>
        <h4 class="map-tactical-title">${gapData.municipio} / ${gapData.uf}</h4>
        <div class="map-tactical-sub">Vazio Assistencial • IPC ${gapData.ipc_score || 0}/100</div>
        <div class="map-tactical-grid">
          <div class="map-tactical-row">
            <span>Gap Score:</span>
            <strong style="color: #00D2FF; font-size: 0.82rem;">${gapData.gap_score} pts</strong>
          </div>
          <div class="map-tactical-row">
            <span>Potencial Demanda:</span>
            <strong>${gapData.estimated_market_formatted || 'R$ 0'}</strong>
          </div>
          <div class="map-tactical-row">
            <span>Distância Concorrente:</span>
            <strong style="color: #38BDF8;">${gapData.min_distance_competitor_km || 0} km</strong>
          </div>
          <div class="map-tactical-row">
            <span>Geofencing Sugerido:</span>
            <strong style="color: #22C55E;">Raio ${gapData.recommended_radius_km || 50} km</strong>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      if (tacticalPopup) {
        tacticalPopup.setLngLat([lng, lat]).setHTML(html).addTo(map);
      }
    }, 500);
  }

  // ===========================================================================
  // MARCADOR TÁTICO & NAVEGAÇÃO RADAR SPARKS (ALTA INTENÇÃO BNDES / OUTORGAS)
  // ===========================================================================
  let activeSparkMarker = null;

  function clearActiveSparkMarker() {
    if (activeSparkMarker) {
      activeSparkMarker.remove();
      activeSparkMarker = null;
    }
  }

  /**
   * Navega diretamente para a sede georreferenciada do Sinal do Radar Sparks
   * e projeta o marcador visual tático com popup e atalhos comerciais.
   */
  function flyToSparkLocation(lat, lng, sparkData = {}) {
    if (!map) {
      if (typeof initMap === 'function') initMap();
    }
    if (!map) return;

    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);

    if (isNaN(numLat) || isNaN(numLng)) {
      console.warn('[MapEngine] flyToSparkLocation: Coordenadas inválidas:', { lat, lng });
      return;
    }

    clearActiveSparkMarker();

    const isBndes = sparkData.spark_type === 'CREDITO_BNDES';
    const isAna = sparkData.spark_type === 'OUTORGA_ANA';
    const pinColor = isBndes ? '#EF4444' : (isAna ? '#00D2FF' : '#F59E0B');
    const badgeLabel = isBndes ? 'BNDES ATIVO' : (isAna ? 'OUTORGA ANA' : 'SINAL SPARK');

    const el = document.createElement('div');
    el.className = 'radar-spark-target-pin';

    const titleText = sparkData.titular_identificado || sparkData.titulo || 'Alvo Spark';
    el.innerHTML = `
      <div class="spark-pin-bubble" style="border-color: ${pinColor}; box-shadow: 0 0 15px ${pinColor}80;">
        <span class="spark-pin-badge" style="background: ${pinColor};">${badgeLabel}</span>
        <span class="spark-pin-title">${titleText}</span>
      </div>
      <div class="spark-pin-core" style="background: ${pinColor};"></div>
      <div class="spark-pin-pulse" style="border-color: ${pinColor};"></div>
    `;

    const formatBrl = (val) => val ? Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;
    const valorTxt = formatBrl(sparkData.valor_monetario) || (sparkData.volume_m3h ? `${sparkData.volume_m3h} m³/h` : 'Alta Intenção');

    const popupHtml = `
      <div class="map-tactical-popup spark-tactical-popup">
        <div class="map-tactical-header">
          <span class="map-badge-spark" style="background: ${pinColor}25; color: ${pinColor}; border: 1px solid ${pinColor}60; font-weight: 800; font-size: 0.65rem; padding: 0.15rem 0.5rem; border-radius: 4px;">
            RADAR SPARKS • ${badgeLabel}
          </span>
          <span style="font-size: 0.68rem; color: #34D399; font-weight: 700;">ALTA INTENÇÃO</span>
        </div>
        <h4 class="map-tactical-title" style="color: #FFFFFF; font-size: 0.9rem; margin: 0.4rem 0 0.15rem 0;">${titleText}</h4>
        <div class="map-tactical-sub" style="font-size: 0.72rem; color: #94A3B8; margin-bottom: 0.5rem;">
          CNPJ: ${sparkData.documento_identificado || '--'} • ${sparkData.municipio || ''}/${sparkData.uf || ''}
        </div>
        <div class="map-tactical-grid">
          <div class="map-tactical-row">
            <span>Operação / Volume:</span>
            <strong style="color: #FBBF24;">${valorTxt}</strong>
          </div>
          ${sparkData.linha_credito ? `
          <div class="map-tactical-row">
            <span>Linha de Crédito:</span>
            <strong>${sparkData.linha_credito}</strong>
          </div>` : ''}
          ${sparkData.banco_repassador ? `
          <div class="map-tactical-row">
            <span>Banco Repassador:</span>
            <strong>${sparkData.banco_repassador}</strong>
          </div>` : ''}
          ${sparkData.socio_decisor ? `
          <div class="map-tactical-row">
            <span>Decisor Principal:</span>
            <strong style="color: #38BDF8;">${sparkData.socio_decisor}</strong>
          </div>` : ''}
          ${sparkData.telefone ? `
          <div class="map-tactical-row">
            <span>Contato Validado:</span>
            <strong style="color: #22C55E;">${sparkData.telefone}</strong>
          </div>` : ''}
        </div>
        <div style="display: flex; gap: 0.4rem; margin-top: 0.6rem;">
          ${sparkData.telefone ? `
          <a href="https://wa.me/${sparkData.telefone.replace(/\D/g, '')}" target="_blank" class="btn-primary" style="flex: 1; font-size: 0.72rem; padding: 0.35rem 0.5rem; text-align: center; text-decoration: none; background: #16A34A; border-radius: 4px; color: #FFF; font-weight: 700;">
            WhatsApp
          </a>` : ''}
          <button type="button" onclick="if(window.SparksRadar && typeof window.SparksRadar.openSignalDossier === 'function') window.SparksRadar.openSignalDossier('${sparkData.id}')" style="flex: 1; font-size: 0.72rem; padding: 0.35rem 0.5rem; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 4px; color: #38BDF8; font-weight: 700; cursor: pointer;">
            Abrir Dossiê
          </button>
        </div>
      </div>
    `;

    activeSparkMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([numLng, numLat])
      .addTo(map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tacticalPopup) {
        tacticalPopup.setLngLat([numLng, numLat]).setHTML(popupHtml).addTo(map);
      }
    });

    map.flyTo({
      center: [numLng, numLat],
      zoom: 14.5,
      speed: 1.3,
      curve: 1.4,
      essential: true
    });

    setTimeout(() => {
      if (tacticalPopup) {
        tacticalPopup.setLngLat([numLng, numLat]).setHTML(popupHtml).addTo(map);
      }
    }, 700);
  }

  /**
   * Navega suavemente a câmera do mapa para qualquer município ou estado do Brasil
   * @param {string} uf Estado (ex: 'RS')
   * @param {string} city Cidade (ex: 'Almirante Tamandaré do Sul')
   */
  async function flyToLocation(uf, city) {
    if (!map) {
      if (typeof initMap === 'function') initMap();
      if (!map) return;
    }
    const cleanUf = (uf || '').trim().toUpperCase();
    const cleanCity = (city || '').trim().toUpperCase();

    if (cleanCity && cleanUf) {
      try {
        const res = await fetch(`/api/gis/city-coordinates?uf=${encodeURIComponent(cleanUf)}&cidade=${encodeURIComponent(cleanCity)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.lat && data.lng) {
            map.flyTo({
              center: [data.lng, data.lat],
              zoom: 12.5,
              speed: 1.3,
              curve: 1.2,
              essential: true
            });
            return;
          }
        }
      } catch (e) {
        console.warn('[MAP ENGINE] Falha ao resolver coordenadas municipais:', e.message);
      }
    }

    if (cleanUf && BRAZIL_UF_BOUNDS && BRAZIL_UF_BOUNDS[cleanUf]) {
      map.fitBounds(BRAZIL_UF_BOUNDS[cleanUf], {
        padding: 40,
        duration: 1500,
        essential: true
      });
      return;
    }

    map.flyTo({
      center: BRAZIL_CENTER,
      zoom: BRAZIL_DEFAULT_ZOOM,
      speed: 1.2
    });
  }

  // =========================================================================
  // FASES 44 E 45: MOTOR FUNDIÁRIO B2B (MALHAS GEOESPACIAIS & INTENT SCORING)
  // =========================================================================

  /**
   * Configura fonte e camadas de polígonos das propriedades rurais (SIGEF/INCRA/CAR)
   */
  function setupFundiarioLayers() {
    if (!map) return;

    if (!map.getSource('fundiario-source')) {
      map.addSource('fundiario-source', {
        type: 'geojson',
        data: currentFundiarioGeoJson || { type: 'FeatureCollection', features: [] }
      });
    }

    const beforeId = map.getLayer('unclustered-point') ? 'unclustered-point' : undefined;

    // ─── FASE 57: Esquema cromático por tag_fonte (proveniência da malha) ───────
    //  SIGEF            → Ciano / Azul-Tech    (#38BDF8)
    //  SICAR            → Verde Mata           (#22C55E)
    //  FUSAO_SIGEF_CAR  → Roxo / Âmbar Dourado (#A855F7 fill / #F59E0B stroke)
    //  SEM_GEO / outros → Vermelho alerta      (#EF4444)

    // 1. Camada de preenchimento — tag_fonte determina a cor
    if (!map.getLayer('fundiario-polygon-fill')) {
      map.addLayer({
        id: 'fundiario-polygon-fill',
        type: 'fill',
        source: 'fundiario-source',
        layout: { 'visibility': 'visible' },
        paint: {
          'fill-color': [
            'match',
            ['get', 'tag_fonte'],
            'SEM_GEO',         'rgba(239, 68, 68, 0.42)',    // Vermelho Alerta Gap Fundiário
            'SIGEF',           'rgba(56, 189, 248, 0.28)',   // Azul-ciano SIGEF
            'SICAR',           'rgba(34, 197, 94, 0.32)',    // Verde CAR Regular
            'FUSAO_SIGEF_CAR', 'rgba(168, 85, 247, 0.30)',   // Roxo fusão
            /* default — SEM_GEO / legado */
            [
              'case',
              ['==', ['get', 'status_geo'], 'SEM_GEO'], 'rgba(239, 68, 68, 0.42)',
              ['==', ['get', 'gap_fundiario'], true], 'rgba(239, 68, 68, 0.42)',
              'rgba(34, 197, 94, 0.32)'
            ]
          ],
          'fill-opacity': 0.85
        }
      }, beforeId);
    }

    // 2. Borda tática — tag_fonte determina a cor e espessura
    if (!map.getLayer('fundiario-polygon-stroke')) {
      map.addLayer({
        id: 'fundiario-polygon-stroke',
        type: 'line',
        source: 'fundiario-source',
        layout: { 'visibility': 'visible' },
        paint: {
          'line-color': [
            'match',
            ['get', 'tag_fonte'],
            'SEM_GEO',         '#EF4444',   // Vermelho Neon Alerta Gap
            'SIGEF',           '#38BDF8',   // Ciano
            'SICAR',           '#4ADE80',   // Verde vibrante
            'FUSAO_SIGEF_CAR', '#F59E0B',   // Âmbar dourado (fusão premium)
            /* default */
            [
              'case',
              ['==', ['get', 'status_geo'], 'SEM_GEO'], '#EF4444',
              ['==', ['get', 'gap_fundiario'], true], '#EF4444',
              '#4ADE80'
            ]
          ],
          'line-width': [
            'match',
            ['get', 'tag_fonte'],
            'SEM_GEO',         2.6,         // Borda mais encorpada para destacar o Gap
            'FUSAO_SIGEF_CAR', 2.4,
            'SICAR',           1.8,
            /* default */ 1.8
          ],
          'line-opacity': 0.95
        }
      }, beforeId);
    }

    // 3. Rótulo tático no centróide
    if (!map.getLayer('fundiario-polygon-label')) {
      try {
        map.addLayer({
          id: 'fundiario-polygon-label',
          type: 'symbol',
          source: 'fundiario-source',
          minzoom: 8,
          layout: {
            'text-field': ['concat', ['get', 'nome_imovel'], ' (', ['get', 'intent_classification'], ')'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 11,
            'text-anchor': 'center'
          },
          paint: {
            'text-color': [
              'match',
              ['get', 'tag_fonte'],
              'SICAR',           '#4ADE80',
              'FUSAO_SIGEF_CAR', '#FBBF24',
              /* default SIGEF / SEM_GEO */
              ['match', ['get', 'status_geo'], 'SEM_GEO', '#F87171', '#E2E8F0']
            ],
            'text-halo-color': '#050814',
            'text-halo-width': 2
          }
        });
      } catch (errLabel) {
        console.warn('[MapEngine] Erro ao registrar rótulo de polígono fundiário:', errLabel);
      }
    }

    // Interações de clique no polígono rural → aciona Right Drawer!
    let lastFundiarioClickTime = 0;
    let lastFundiarioClickKey = null;

    const handleFundiarioPolygonClick = (e) => {
      if (isInspectPinActive || isLassoActive || isLassoDrawing) return;

      let feat = (e.features && e.features.length > 0) ? e.features[0] : null;
      if (!feat && e.point && map) {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['fundiario-polygon-fill', 'fundiario-polygon-stroke'] });
        if (hits && hits.length > 0) feat = hits[0];
      }
      if (!feat) return;

      const pKey = feat.properties?.id || feat.properties?.codigo_car || feat.properties?.id_sigef || (e.lngLat ? `${e.lngLat.lat.toFixed(4)},${e.lngLat.lng.toFixed(4)}` : 'rural');
      const now = Date.now();
      if (now - lastFundiarioClickTime < 350 && lastFundiarioClickKey === pKey) {
        return; // Previne múltiplos disparos redundantes para o mesmo polígono
      }
      lastFundiarioClickTime = now;
      lastFundiarioClickKey = pKey;

      const p = { ...(feat.properties || {}) };

      // Injeta geometria real e coordenadas precisas do clique para enriquecimento em cascata
      p.geometry = feat.geometry;
      p.geometria_poligono = feat.geometry;
      if (e.lngLat) {
        p.lat = e.lngLat.lat;
        p.lng = e.lngLat.lng;
        if (!p.centroide_lat) p.centroide_lat = e.lngLat.lat;
        if (!p.centroide_lng) p.centroide_lng = e.lngLat.lng;
      }

      console.log('🌾 [MapEngine] Clique no polígono rural:', p.nome_imovel || p.codigo_car || p.id_sigef, p);

      // Chama o Right Drawer tático de imóveis rurais
      if (typeof window.inspectRuralPropertyInDrawer === 'function') {
        window.inspectRuralPropertyInDrawer(p);
      }
    };

    map.on('click', 'fundiario-polygon-fill', handleFundiarioPolygonClick);
    map.on('click', 'fundiario-polygon-stroke', handleFundiarioPolygonClick);

    // Fallback defensivo no clique geral do mapa
    map.on('click', (e) => {
      if (isInspectPinActive || isLassoActive || isLassoDrawing) return;
      if (!map) return;
      const hits = map.queryRenderedFeatures(e.point, { layers: ['fundiario-polygon-fill', 'fundiario-polygon-stroke'] });
      if (hits && hits.length > 0) {
        handleFundiarioPolygonClick({ ...e, features: hits });
      }
    });

    // Hover com cursor pointer
    const setPointer = () => {
      if (isInspectPinActive || isLassoActive || isLassoDrawing) return;
      if (map) map.getCanvas().style.cursor = 'pointer';
    };
    const resetPointer = () => {
      if (isInspectPinActive || isLassoActive || isLassoDrawing) {
        if (map) {
          map.getCanvas().style.cursor = 'crosshair';
          if (map.getCanvasContainer()) map.getCanvasContainer().style.cursor = 'crosshair';
        }
        return;
      }
      if (map) {
        map.getCanvas().style.cursor = '';
        if (map.getCanvasContainer()) map.getCanvasContainer().style.cursor = '';
      }
    };

    map.on('mouseenter', 'fundiario-polygon-fill', setPointer);
    map.on('mouseleave', 'fundiario-polygon-fill', resetPointer);
    map.on('mouseenter', 'fundiario-polygon-stroke', setPointer);
    map.on('mouseleave', 'fundiario-polygon-stroke', resetPointer);
  }

  /**
   * FASE 66: Ferramenta de Seleção Espacial por Laço Contínuo (Lasso)
   */
  function setupLassoLayers() {
    if (!map) return;

    // Fonte de traçado do laço desenhado
    if (!map.getSource('lasso-draw-source')) {
      map.addSource('lasso-draw-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'lasso-draw-fill',
        type: 'fill',
        source: 'lasso-draw-source',
        paint: {
          'fill-color': '#00D2FF',
          'fill-opacity': 0.15
        }
      });

      map.addLayer({
        id: 'lasso-draw-line',
        type: 'line',
        source: 'lasso-draw-source',
        paint: {
          'line-color': '#00D2FF',
          'line-width': 2.5,
          'line-dasharray': [2, 2]
        }
      });
    }

    // Fonte e camadas de destaque das fazendas selecionadas pelo laço
    if (!map.getSource('lasso-selected-farms-source')) {
      map.addSource('lasso-selected-farms-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'lasso-selected-farms-fill',
        type: 'fill',
        source: 'lasso-selected-farms-source',
        paint: {
          'fill-color': '#00D2FF',
          'fill-opacity': 0.40
        }
      });

      map.addLayer({
        id: 'lasso-selected-farms-stroke',
        type: 'line',
        source: 'lasso-selected-farms-source',
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 3.0
        }
      });
    }
  }

  let lassoEventsInitialized = false;

  function setupLassoEvents() {
    if (lassoEventsInitialized) return;
    lassoEventsInitialized = true;

    const btnLasso = document.getElementById('btnMapLassoSelect');
    const lassoCard = document.getElementById('mapLassoSelectionCard');
    const btnCloseCard = document.getElementById('btnCloseLassoCard');
    const btnInjectSelected = document.getElementById('btnLassoInjectSelected');
    const btnInjectAll = document.getElementById('btnLassoInjectAll');
    const btnClearLasso = document.getElementById('btnLassoClear');
    const countEl = document.getElementById('lassoSpatialCount');
    const haEl = document.getElementById('lassoSpatialHectares');
    const btnSelectedCountEl = document.getElementById('btnLassoSelectedCount');
    const btnAllCountEl = document.getElementById('btnLassoAllCount');

    if (!btnLasso || !map) return;

    function activateLassoMode() {
      if (!map) return;
      if (isInspectPinActive && typeof deactivateInspectPinTool === 'function') {
        deactivateInspectPinTool();
      }

      isLassoActive = true;
      isLassoDrawing = false;
      btnLasso?.classList.add('active');

      // Trava navegação para que o arraste do mouse seja 100% capturado pelo laço
      map.dragPan.disable();
      map.boxZoom.disable();
      map.doubleClickZoom.disable();

      map.getCanvas().style.cursor = 'crosshair';
      if (map.getCanvasContainer()) map.getCanvasContainer().style.cursor = 'crosshair';
      const container = document.getElementById('webglMapContainer');
      if (container) container.style.cursor = 'crosshair';

      if (typeof showToast === 'function') {
        showToast('Modo Laço Ativo: clique e arraste no mapa para cercar as fazendas que deseja selecionar.');
      }
    }

    function deactivateLassoMode() {
      isLassoActive = false;
      isLassoDrawing = false;
      btnLasso?.classList.remove('active');

      if (map) {
        map.dragPan.enable();
        map.boxZoom.enable();
        map.doubleClickZoom.enable();
        map.getCanvas().style.cursor = '';
        if (map.getCanvasContainer()) map.getCanvasContainer().style.cursor = '';
      }
      const container = document.getElementById('webglMapContainer');
      if (container) container.style.cursor = '';
    }

    function toggleLassoMode() {
      if (isLassoActive) {
        deactivateLassoMode();
        if (typeof showToast === 'function') {
          showToast('Modo Laço desativado.');
        }
      } else {
        activateLassoMode();
      }
    }

    btnLasso.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLassoMode();
    });

    const clearLassoSelection = () => {
      selectedFarmsByLasso = [];
      lassoCoordinates = [];
      if (lassoCard) lassoCard.style.display = 'none';

      if (map) {
        if (map.getSource('lasso-draw-source')) {
          map.getSource('lasso-draw-source').setData({ type: 'FeatureCollection', features: [] });
        }
        if (map.getSource('lasso-selected-farms-source')) {
          map.getSource('lasso-selected-farms-source').setData({ type: 'FeatureCollection', features: [] });
        }
      }
    };

    btnCloseCard?.addEventListener('click', clearLassoSelection);
    btnClearLasso?.addEventListener('click', clearLassoSelection);

    // Eventos de clique e arraste direto no Canvas do MapLibre GL
    const canvas = map.getCanvas();

    const onMouseDown = (e) => {
      if (!isLassoActive || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      isLassoDrawing = true;

      const rect = canvas.getBoundingClientRect();
      const point = [e.clientX - rect.left, e.clientY - rect.top];
      const lngLat = map.unproject(point);

      lassoCoordinates = [[lngLat.lng, lngLat.lat]];

      // Limpa traço anterior no início de um novo desenho
      const drawSrc = map.getSource('lasso-draw-source');
      if (drawSrc) {
        drawSrc.setData({ type: 'FeatureCollection', features: [] });
      }
    };

    const onMouseMove = (e) => {
      if (!isLassoActive || !isLassoDrawing) return;
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const point = [e.clientX - rect.left, e.clientY - rect.top];
      const lngLat = map.unproject(point);

      // Evita acumular pontos idênticos
      const last = lassoCoordinates[lassoCoordinates.length - 1];
      if (last) {
        const dx = Math.abs(lngLat.lng - last[0]);
        const dy = Math.abs(lngLat.lat - last[1]);
        if (dx < 0.00003 && dy < 0.00003) return;
      }

      lassoCoordinates.push([lngLat.lng, lngLat.lat]);

      const drawSrc = map.getSource('lasso-draw-source');
      if (drawSrc) {
        drawSrc.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: lassoCoordinates
            }
          }]
        });
      }
    };

    const onMouseUp = () => {
      if (!isLassoActive || !isLassoDrawing) return;
      isLassoDrawing = false;

      // Se o usuário apenas deu um clique rápido sem arrastar (menos de 4 pontos),
      // mantém o modo laço ativo para que não precise desmarcar e remarcar o botão!
      if (lassoCoordinates.length < 4) {
        lassoCoordinates = [];
        const drawSrc = map.getSource('lasso-draw-source');
        if (drawSrc) {
          drawSrc.setData({ type: 'FeatureCollection', features: [] });
        }
        return;
      }

      const closedRing = [...lassoCoordinates, lassoCoordinates[0]];
      const polygonFeature = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [closedRing]
        }
      };

      const drawSrc = map.getSource('lasso-draw-source');
      if (drawSrc) {
        drawSrc.setData({
          type: 'FeatureCollection',
          features: [polygonFeature]
        });
      }

      const allProperties = Array.isArray(window.ruralPropertiesData) ? window.ruralPropertiesData : [];
      const polygonForRayCast = closedRing.map(c => [c[1], c[0]]); // [lat, lng]

      const insideFarms = allProperties.filter(p => {
        let lat = p.lat || p.centroide_lat;
        let lng = p.lng || p.centroide_lng;

        if ((!lat || !lng) && p.geometry?.coordinates) {
          try {
            const coords = p.geometry.coordinates;
            const flat = Array.isArray(coords[0]) && Array.isArray(coords[0][0]) ? coords[0][0] : coords[0];
            if (Array.isArray(flat) && flat.length >= 2) {
              lng = flat[0];
              lat = flat[1];
            }
          } catch (_) {}
        }

        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
          return isPointInPolygon(Number(lat), Number(lng), polygonForRayCast);
        }
        return false;
      });

      selectedFarmsByLasso = insideFarms;
      window.selectedFarmsByLasso = insideFarms;

      const highlightFeatures = insideFarms.map(f => ({
        type: 'Feature',
        properties: f,
        geometry: f.geometry || {
          type: 'Point',
          coordinates: [Number(f.lng || f.centroide_lng), Number(f.lat || f.centroide_lat)]
        }
      })).filter(f => f.geometry);

      const selSrc = map.getSource('lasso-selected-farms-source');
      if (selSrc) {
        selSrc.setData({
          type: 'FeatureCollection',
          features: highlightFeatures
        });
      }

      let totalHa = 0;
      insideFarms.forEach(f => {
        totalHa += Number(f.area_lavoura_util_ha) || Number(f.area_hectares) || 0;
      });

      if (countEl) countEl.textContent = insideFarms.length;
      if (haEl) haEl.textContent = Math.round(totalHa).toLocaleString('pt-BR');
      if (btnSelectedCountEl) btnSelectedCountEl.textContent = insideFarms.length;
      if (btnAllCountEl) btnAllCountEl.textContent = allProperties.length;

      if (lassoCard) {
        lassoCard.style.display = insideFarms.length > 0 ? 'block' : 'none';
      }

      // Concluiu o laço com sucesso -> devolve o mapa para navegação padrão
      deactivateLassoMode();

      if (insideFarms.length > 0) {
        if (typeof showToast === 'function') {
          showToast(`Área delimitada: ${insideFarms.length} fazendas isoladas (${Math.round(totalHa).toLocaleString('pt-BR')} ha).`);
        }
      } else {
        if (typeof showToast === 'function') {
          showToast('Nenhuma fazenda encontrada dentro da área desenhada.');
        }
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    btnInjectSelected?.addEventListener('click', async () => {
      if (selectedFarmsByLasso.length === 0) {
        if (typeof showToast === 'function') showToast('Nenhuma fazenda selecionada no laço.');
        return;
      }
      if (typeof window.executeFarmInjection === 'function') {
        await window.executeFarmInjection(selectedFarmsByLasso, btnInjectSelected);
        clearLassoSelection();
      }
    });

    btnInjectAll?.addEventListener('click', async () => {
      const allProps = Array.isArray(window.ruralPropertiesData) ? window.ruralPropertiesData : [];
      if (allProps.length === 0) {
        if (typeof showToast === 'function') showToast('Nenhuma fazenda carregada na região.');
        return;
      }
      if (typeof window.executeFarmInjection === 'function') {
        await window.executeFarmInjection(allProps, btnInjectAll);
        clearLassoSelection();
      }
    });
  }

  /**
   * Consome GET /api/fundiario/geojson e plota no WebGL
   * @param {Object} [options] Opções de renderização ({ autoFit: boolean })
   */
  async function fetchAndRenderFundiarioGeoJson(options = {}) {
    if (!map) return;
    try {
      const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : { 'Content-Type': 'application/json' };
      const res = await fetch('/api/fundiario/car/geojson?origem=TODOS', { headers });
      if (!res.ok) return;

      const geojson = await res.json();
      currentFundiarioGeoJson = geojson;

      if (map.getSource('fundiario-source')) {
        map.getSource('fundiario-source').setData(geojson);
      }

      const featureCount = geojson.total_features || geojson.features?.length || 0;

      // Atualiza badge de imóveis se houver
      const countEl = document.getElementById('mapFundiarioCountBadge');
      if (countEl) {
        countEl.textContent = `${featureCount} fazendas mapeadas`;
        countEl.style.display = 'inline-flex';
      }

      // Auto-centralização da malha se solicitado e se houver geometrias
      if (options.autoFit && featureCount > 0) {
        const bbox = calculateGeoJsonBoundingBox(geojson);
        if (bbox && map) {
          map.fitBounds(bbox, { padding: 50, duration: 1500, essential: true });
        }
      }
    } catch (err) {
      console.warn('⚠️ [MAP ENGINE] Falha ao carregar GeoJSON fundiário:', err.message);
    }
  }

  /**
   * Alterna visibilidade da camada fundiária
   */
  function setFundiarioLayersVisibility(visible) {
    if (!map) return;
    fundiarioLayerActive = !!visible;
    const visibility = visible ? 'visible' : 'none';

    const targetLayerIds = [
      'fundiario-polygon-fill',
      'fundiario-polygon-stroke',
      'fundiario-polygon-label',
      'fundiario-fill-layer',
      'fundiario-line-layer'
    ];

    targetLayerIds.forEach(layerId => {
      if (map.getLayer(layerId)) {
        try {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        } catch (e) {
          console.warn(`[MAP ENGINE] Não foi possível atualizar visibilidade da camada ${layerId}:`, e.message);
        }
      }
    });
  }

  /**
   * FASE 57: Filtra a fonte fundiária para exibir apenas features de
   * determinadas origens (SIGEF, SICAR, FUSAO_SIGEF_CAR).
   * Aplica setFilter em vez de setLayoutProperty para manter ambas as
   * camadas carregadas (evita re-fetch ao re-ativar).
   */
  function updateFundiarioSourceFilter() {
    if (!map) return;

    const layerIds = ['fundiario-polygon-fill', 'fundiario-polygon-stroke', 'fundiario-polygon-label'];

    // Se nenhum toggle estiver ativo, oculta todas as camadas
    if (!sigefLayerVisible && !carLayerVisible && !fusaoLayerVisible && !gapLayerVisible) {
      layerIds.forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      });
      return;
    }

    // Constrói cláusulas 'any' independentes para cada fonte selecionada
    const visibleClauses = [];

    // 1. Camada SIGEF (Azul Ciano)
    if (sigefLayerVisible) {
      visibleClauses.push(['==', ['get', 'tag_fonte'], 'SIGEF']);
      visibleClauses.push(['!', ['has', 'tag_fonte']]);
      visibleClauses.push(['==', ['get', 'tag_fonte'], '']);
    }

    // 2. Camada FUSÃO SIGEF + CAR (Âmbar Dourado)
    if (fusaoLayerVisible) {
      visibleClauses.push(['==', ['get', 'tag_fonte'], 'FUSAO_SIGEF_CAR']);
    }

    // 3. Camada SICAR / CAR (Verde) e Camada GAPS (Vermelho)
    if (carLayerVisible && gapLayerVisible) {
      // Ambos ativos: exibe todos os imóveis CAR regulares e todos os Gaps
      visibleClauses.push(['==', ['get', 'tag_fonte'], 'SICAR']);
      visibleClauses.push(['==', ['get', 'tag_fonte'], 'CAR']);
      visibleClauses.push(['==', ['get', 'tag_fonte'], 'SEM_GEO']);
      visibleClauses.push(['==', ['get', 'gap_fundiario'], true]);
      visibleClauses.push(['==', ['get', 'status_geo'], 'SEM_GEO']);
    } else if (carLayerVisible && !gapLayerVisible) {
      // APENAS CAR ativo (GAPs desmarcado): exibe imóveis CAR, mas NÃO filtra como GAP
      visibleClauses.push(['==', ['get', 'tag_fonte'], 'SICAR']);
      visibleClauses.push(['==', ['get', 'tag_fonte'], 'CAR']);
      visibleClauses.push(['==', ['get', 'tag_fonte'], 'SEM_GEO']);
    } else if (!carLayerVisible && gapLayerVisible) {
      // APENAS GAPS ativo (CAR desmarcado): exibe ESTRITAMENTE imóveis com Gap Fundiário / Sem Geo
      visibleClauses.push(['==', ['get', 'tag_fonte'], 'SEM_GEO']);
      visibleClauses.push(['==', ['get', 'gap_fundiario'], true]);
      visibleClauses.push(['==', ['get', 'status_geo'], 'SEM_GEO']);
    }

    if (visibleClauses.length === 0) {
      layerIds.forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      });
      return;
    }

    const provFilter = ['any', ...visibleClauses];

    // Atualiza dinamicamente as cores para que quando GAP estiver desmarcado, CAR não apareça vermelho
    const gapFillColor = gapLayerVisible ? 'rgba(239, 68, 68, 0.42)' : 'rgba(34, 197, 94, 0.32)';
    const gapStrokeColor = gapLayerVisible ? '#EF4444' : '#4ADE80';

    if (map.getLayer('fundiario-polygon-fill')) {
      map.setPaintProperty('fundiario-polygon-fill', 'fill-color', [
        'match',
        ['get', 'tag_fonte'],
        'SEM_GEO',         gapFillColor,
        'SIGEF',           'rgba(56, 189, 248, 0.32)',
        'SICAR',           'rgba(34, 197, 94, 0.32)',
        'FUSAO_SIGEF_CAR', 'rgba(168, 85, 247, 0.30)',
        /* default */
        [
          'case',
          ['==', ['get', 'status_geo'], 'SEM_GEO'], gapFillColor,
          ['==', ['get', 'gap_fundiario'], true], gapFillColor,
          'rgba(34, 197, 94, 0.32)'
        ]
      ]);
    }

    if (map.getLayer('fundiario-polygon-stroke')) {
      map.setPaintProperty('fundiario-polygon-stroke', 'line-color', [
        'match',
        ['get', 'tag_fonte'],
        'SEM_GEO',         gapStrokeColor,
        'SIGEF',           '#38BDF8',
        'SICAR',           '#4ADE80',
        'FUSAO_SIGEF_CAR', '#F59E0B',
        /* default */
        [
          'case',
          ['==', ['get', 'status_geo'], 'SEM_GEO'], gapStrokeColor,
          ['==', ['get', 'gap_fundiario'], true], gapStrokeColor,
          '#4ADE80'
        ]
      ]);
      map.setPaintProperty('fundiario-polygon-stroke', 'line-width', [
        'match',
        ['get', 'tag_fonte'],
        'SIGEF',           3.0,
        'SEM_GEO',         2.6,
        'FUSAO_SIGEF_CAR', 2.4,
        'SICAR',           1.8,
        /* default */ 1.8
      ]);
    }

    let finalProvFilter = provFilter;
    if (tipoPessoaFilter === 'PJ') {
      finalProvFilter = ['all', provFilter, ['==', ['get', 'tipo_pessoa'], 'PJ']];
    } else if (tipoPessoaFilter === 'PF') {
      finalProvFilter = ['all', provFilter, ['!=', ['get', 'tipo_pessoa'], 'PJ']];
    }

    layerIds.forEach(id => {
      if (map.getLayer(id)) {
        try {
          map.setLayoutProperty(id, 'visibility', 'visible');
          map.setFilter(id, finalProvFilter);
        } catch (e) {
          console.warn(`[MAP ENGINE FASE60] Filtro de camada ${id}:`, e.message);
        }
      }
    });

    // Atualiza contador dinâmico de fazendas visíveis
    try {
      const allFeats = currentFundiarioGeoJson?.features || [];
      const visibleCount = allFeats.filter(f => {
        const p = f.properties || {};
        const src = p.tag_fonte || 'SIGEF';
        let srcVis = false;
        if (src === 'SIGEF' && sigefLayerVisible) srcVis = true;
        else if ((src === 'SICAR' || src === 'CAR') && carLayerVisible) srcVis = true;
        else if (src === 'FUSAO_SIGEF_CAR' && fusaoLayerVisible) srcVis = true;
        else if (src === 'SEM_GEO' && gapLayerVisible) srcVis = true;
        else if (!p.tag_fonte && sigefLayerVisible) srcVis = true;

        if (!srcVis) return false;

        if (tipoPessoaFilter === 'PJ') return p.tipo_pessoa === 'PJ';
        if (tipoPessoaFilter === 'PF') return p.tipo_pessoa !== 'PJ';
        return true;
      }).length;

      const badge = document.getElementById('mapFundiarioCountBadge');
      if (badge && allFeats.length > 0) {
        badge.textContent = `${visibleCount} fazendas filtradas`;
      }
    } catch (_) {}
  }

  // Expõe funções para app.js e outros módulos externos
  window.MapFundiarioEngine = window.MapFundiarioEngine || {};
  Object.assign(window.MapFundiarioEngine, {
    setEntityFilter: (f = 'ALL') => {
      tipoPessoaFilter = String(f).toUpperCase();
      document.querySelectorAll('.btn-entity-toggle').forEach(b => {
        b.classList.toggle('active', (b.getAttribute('data-entity') || 'ALL') === tipoPessoaFilter);
      });
      updateFundiarioSourceFilter();
    },
    getEntityFilter: () => tipoPessoaFilter,
    setSigefVisible: (v) => {
      sigefLayerVisible = Boolean(v);
      const btn = document.getElementById('toggleSigefLayerBtn');
      const chk = document.getElementById('toggleSigefLayer');
      if (btn) btn.classList.toggle('active', sigefLayerVisible);
      if (chk) chk.checked = sigefLayerVisible;
      updateFundiarioSourceFilter();
    },
    setCarVisible:   (v) => {
      carLayerVisible = Boolean(v);
      const btn = document.getElementById('toggleCarLayerBtn');
      const chk = document.getElementById('toggleCarLayer');
      if (btn) btn.classList.toggle('active', carLayerVisible);
      if (chk) chk.checked = carLayerVisible;
      updateFundiarioSourceFilter();
    },
    setFusaoVisible: (v) => {
      fusaoLayerVisible = Boolean(v);
      const btn = document.getElementById('toggleFusaoLayerBtn');
      const chk = document.getElementById('toggleFusaoLayer');
      if (btn) btn.classList.toggle('active', fusaoLayerVisible);
      if (chk) chk.checked = fusaoLayerVisible;
      updateFundiarioSourceFilter();
    },
    setGapVisible:   (v) => {
      gapLayerVisible = Boolean(v);
      const btn = document.getElementById('toggleGapLayerBtn');
      if (btn) btn.classList.toggle('active', gapLayerVisible);
      updateFundiarioSourceFilter();
    },
    getSigefVisible: () => sigefLayerVisible,
    getCarVisible:   () => carLayerVisible,
    getFusaoVisible: () => fusaoLayerVisible,
    getGapVisible:   () => gapLayerVisible,
    clearFundiario: () => {
      fundiarioLayerActive = false;
      currentFundiarioGeoJson = { type: 'FeatureCollection', features: [] };
      setFundiarioLayersVisibility(false);
      const btn = document.getElementById('btnToggleFundiarioLayer');
      if (btn) btn.classList.remove('active');
      if (map && map.getSource('fundiario-source')) {
        try {
          map.getSource('fundiario-source').setData({ type: 'FeatureCollection', features: [] });
        } catch (e) {}
      }
    },
    setFundiarioVisibility: (v) => {
      fundiarioLayerActive = Boolean(v);
      setFundiarioLayersVisibility(v);
      const btn = document.getElementById('btnToggleFundiarioLayer');
      if (btn) btn.classList.toggle('active', Boolean(v));
    }
  });

  // =========================================================================
  // FASE 46: GATILHO DE BUSCA REGIONAL (UF/MUNICÍPIO) - PADRÃO SIGEF
  // =========================================================================

  // Lista de polos agropecuários e estados estratégicos padrão
  // Todas as 27 Unidades da Federação do Brasil com polos estratégicos
  const ALL_BRAZIL_UFS = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  // Bounding Boxes oficiais dos 27 Estados brasileiros para enquadramento macro
  const BRAZIL_UF_BOUNDS = {
    AC: [[-73.9904, -11.1452], [-66.6234, -7.1118]],
    AL: [[-38.2373, -10.5015], [-35.1522, -8.8131]],
    AP: [[-54.8761, -1.2357], [-49.8679, 4.4421]],
    AM: [[-73.7956, -9.8180], [-56.0975, 2.2466]],
    BA: [[-46.6171, -18.3484], [-37.3482, -8.5330]],
    CE: [[-41.4235, -7.8582], [-37.2530, -2.7845]],
    DF: [[-48.2871, -16.0500], [-47.3082, -15.5002]],
    ES: [[-41.8797, -21.3018], [-39.6763, -17.8920]],
    GO: [[-53.2515, -19.4990], [-45.9069, -12.3955]],
    MA: [[-48.7551, -10.2614], [-41.7963, -1.0498]],
    MT: [[-61.6332, -18.0416], [-50.2248, -7.3490]],
    MS: [[-58.1743, -24.0683], [-50.9230, -17.1664]],
    MG: [[-51.0461, -22.9230], [-39.8568, -14.2332]],
    PA: [[-58.8983, -9.8411], [-46.0609, 2.5910]],
    PB: [[-38.7656, -8.3028], [-34.7931, -6.0259]],
    PR: [[-54.6193, -26.7171], [-48.0235, -22.5163]],
    PE: [[-41.3583, -9.4829], [-34.7931, -7.1554]],
    PI: [[-45.9942, -10.9287], [-40.3704, -2.7473]],
    RJ: [[-44.8887, -23.3689], [-40.9573, -20.7632]],
    RN: [[-38.5815, -6.9827], [-34.9750, -4.8318]],
    RS: [[-57.6497, -33.7512], [-49.6916, -27.0823]],
    RO: [[-66.6214, -13.6937], [-59.7744, -7.9693]],
    RR: [[-64.8253, -1.5806], [-58.8869, 5.2718]],
    SC: [[-53.8360, -29.3574], [-48.3547, -25.9559]],
    SP: [[-53.1101, -25.3123], [-44.1614, -19.7797]],
    SE: [[-38.2458, -11.5685], [-36.3934, -9.5152]],
    TO: [[-50.7420, -13.4677], [-45.6903, -5.1684]]
  };

  // Cache em memória de cidades por UF para navegação instantânea
  const IBGE_CITIES_CACHE = {};

  const DEFAULT_AGRO_LOCATIONS = {
    ufs: ALL_BRAZIL_UFS,
    citiesByUf: {
      AC: ['RIO BRANCO', 'CRUZEIRO DO SUL', 'SENA MADUREIRA'],
      AL: ['MACEIO', 'ARAPIRACA', 'PALMEIRA DOS INDIOS'],
      AP: ['MACAPA', 'SANTANA', 'LARANJAL DO JARI'],
      AM: ['MANAUS', 'PARINTINS', 'ITACOATIARA'],
      BA: ['LUIS EDUARDO MAGALHAES', 'BARREIRAS', 'FEIRA DE SANTANA', 'VITORIA DA CONQUISTA', 'SALVADOR', 'ILHEUS', 'ITABUNA'],
      CE: ['FORTALEZA', 'SOBRAL', 'JUAZEIRO DO NORTE', 'IGUATU'],
      DF: ['BRASILIA', 'TAGUATINGA', 'CEILANDIA'],
      ES: ['VITORIA', 'VILA VELHA', 'LINHARES', 'COLATINA', 'CACHOEIRO DE ITAPEMIRIM'],
      GO: ['RIO VERDE', 'JATAI', 'CRISTALINA', 'ITUMBIARA', 'ANAPOLIS', 'GOIANIA', 'CATALAO', 'FORMOSA'],
      MA: ['BALSAS', 'IMPERATRIZ', 'SAO LUIS', 'CAXIAS', 'BACABAL'],
      MT: ['SORRISO', 'SINOP', 'LUCAS DO RIO VERDE', 'NOVA MUTUM', 'CAMPO NOVO DO PARECIS', 'PRIMAVERA DO LESTE', 'RONDONOPOLIS', 'CUIABA', 'TANGARA DA SERRA', 'BARRA DO GARCAS'],
      MS: ['DOURADOS', 'MARACAJU', 'SAO GABRIEL DO OESTE', 'PONTA PORA', 'TRES LAGOAS', 'CAMPO GRANDE', 'NAVIRAI', 'CHAPADAO DO SUL'],
      MG: ['UBERLANDIA', 'UBERABA', 'PATOS DE MINAS', 'POUSO ALEGRE', 'VARGINHA', 'BELO HORIZONTE', 'MONTES CLAROS', 'JUIZ DE FORA'],
      PA: ['PARAGOMINAS', 'SANTAREM', 'BELEM', 'MARABA', 'REDENCAO'],
      PB: ['JOAO PESSOA', 'CAMPINA GRANDE', 'PATOS', 'SOUSA'],
      PR: ['CASCAVEL', 'LONDRINA', 'MARINGA', 'TOLEDO', 'PONTA GROSSA', 'CASTRO', 'GUAIRA', 'CURITIBA', 'GUARAPUAVA', 'PATO BRANCO'],
      PE: ['RECIFE', 'PETROLINA', 'CARUARU', 'GARANHUNS'],
      PI: ['AVELINO LOPES', 'URUCUI', 'BOM JESUS', 'TERESINA', 'PARNAIBA', 'FLORIANO'],
      RJ: ['RIO DE JANEIRO', 'CAMPOS DOS GOYTACAZES', 'NITEROI', 'PETROPOLIS'],
      RN: ['NATAL', 'MOSSORO', 'CAICO'],
      RS: ['PASSO FUNDO', 'CRUZ ALTA', 'IJUI', 'SANTA VITORIA DO PALMAR', 'CAXIAS DO SUL', 'PORTO ALEGRE', 'SANTA MARIA', 'PELOTAS', 'BENTO GONCALVES', 'ERECHIM', 'URUGUAIANA'],
      RO: ['VILHENA', 'CACOAL', 'PORTO VELHO', 'ARIQUEMES', 'JI-PARANA'],
      RR: ['BOA VISTA', 'RORAINOPOLIS'],
      SC: ['CHAPECO', 'JOINVILLE', 'CRICIUMA', 'BLUMENAU', 'FLORIANOPOLIS', 'LAGES', 'CONCORDIA'],
      SP: ['RIBEIRAO PRETO', 'ARACATUBA', 'BARRETOS', 'FRANCA', 'PIRACICABA', 'CAMPINAS', 'SAO PAULO', 'SAO JOSE DO RIO PRETO', 'BAURU'],
      SE: ['ARACAJU', 'ITABAIANA', 'LAGARTO'],
      TO: ['PALMAS', 'GURUPI', 'ARAGUAINA', 'PORTO NACIONAL', 'DIANOPOLIS']
    }
  };

  /**
   * Configura os eventos de UI do Painel de Busca Regional
   */
  function setupMeshSearchControls() {
    const btnToggle = document.getElementById('btnSearchMeshToggle');
    const panel = document.getElementById('mapMeshSearchPanel');
    const btnClose = document.getElementById('btnCloseMeshSearchPanel');
    const selectUf = document.getElementById('selectMeshSearchUf');
    const selectCity = document.getElementById('selectMeshSearchCity');
    const btnExecute = document.getElementById('btnExecuteMeshSearch');
    const btnClear = document.getElementById('btnClearMeshSearch');

    if (!btnToggle || !panel) return;

    // Popula Select de Estados (UF)
    populateMeshUfOptions();

    // Toggle de visibilidade do painel
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = panel.style.display !== 'none';
      if (isVisible) {
        closeMeshSearchPanel();
      } else {
        openMeshSearchPanel();
      }
    });

    // Fechar painel no 'X'
    btnClose?.addEventListener('click', () => {
      closeMeshSearchPanel();
    });

    // Encadeamento: Ao mudar a UF, popula municípios correspondentes
    selectUf?.addEventListener('change', (e) => {
      const uf = (e.target.value || '').trim().toUpperCase();
      selectedSearchUf = uf;
      selectedSearchCity = '';
      populateMeshCityOptions(uf);

      if (btnExecute) {
        btnExecute.disabled = !uf;
      }

      updateMeshStatusBar(uf ? `Estado ${uf} selecionado. Selecione o município para refinar ou clique em Carregar.` : '');
    });

    // Seleção de município
    selectCity?.addEventListener('change', (e) => {
      const city = (e.target.value || '').trim().toUpperCase();
      selectedSearchCity = city;
      if (city && selectedSearchUf) {
        updateMeshStatusBar(`Alvo definido: ${city} / ${selectedSearchUf}`);
      } else if (selectedSearchUf) {
        updateMeshStatusBar(`Estado ${selectedSearchUf} selecionado.`);
      }
    });

    // Botão Limpar Seleção
    btnClear?.addEventListener('click', () => {
      resetMeshSearchForm();
      showToast('Filtro de busca regional limpo.');
    });

    // Botão Executar Busca
    btnExecute?.addEventListener('click', async () => {
      const uf = selectUf ? selectUf.value : '';
      const city = selectCity ? selectCity.value : '';

      if (!uf) {
        showToast('Selecione pelo menos um Estado (UF) para pesquisar.');
        return;
      }

      await carregarMalha(uf, city);
    });
  }

  function openMeshSearchPanel() {
    const panel = document.getElementById('mapMeshSearchPanel');
    const btnToggle = document.getElementById('btnSearchMeshToggle');
    if (!panel) return;

    // Fecha outros painéis flutuantes para não colidir
    const radiusPanel = document.getElementById('mapRadiusControlPanel');
    if (radiusPanel) radiusPanel.style.display = 'none';

    panel.style.display = 'flex';
    btnToggle?.classList.add('active');
  }

  function closeMeshSearchPanel() {
    const panel = document.getElementById('mapMeshSearchPanel');
    const btnToggle = document.getElementById('btnSearchMeshToggle');
    if (panel) panel.style.display = 'none';
    btnToggle?.classList.remove('active');
  }

  function populateMeshUfOptions() {
    const selectUf = document.getElementById('selectMeshSearchUf');
    if (!selectUf) return;

    // Garante que todas as 27 UFs do Brasil estejam disponíveis para busca regional
    const ufs = ALL_BRAZIL_UFS;

    const currentVal = selectUf.value;
    selectUf.innerHTML = '<option value="">-- Selecione o Estado --</option>';

    ufs.forEach(uf => {
      const opt = document.createElement('option');
      opt.value = uf;
      opt.textContent = `${uf} - ${getUfDescription(uf)}`;
      if (uf === currentVal) opt.selected = true;
      selectUf.appendChild(opt);
    });
  }

  async function populateMeshCityOptions(uf) {
    const selectCity = document.getElementById('selectMeshSearchCity');
    if (!selectCity) return;

    if (!uf) {
      selectCity.disabled = true;
      selectCity.innerHTML = '<option value="">-- Selecione a UF primeiro --</option>';
      return;
    }

    const globalLocations = (typeof window.state !== 'undefined' && window.state?.locations) ? window.state.locations : DEFAULT_AGRO_LOCATIONS;
    const citiesFromState = globalLocations.citiesByUf?.[uf] || [];
    const fallbackCities = DEFAULT_AGRO_LOCATIONS.citiesByUf?.[uf] || [];
    let initialCities = Array.from(new Set([...citiesFromState, ...fallbackCities])).sort();

    // Se já estiver no cache do IBGE, usa a lista completa
    if (IBGE_CITIES_CACHE[uf] && IBGE_CITIES_CACHE[uf].length > 0) {
      initialCities = IBGE_CITIES_CACHE[uf];
    }

    selectCity.disabled = false;
    selectCity.innerHTML = '<option value="">-- Todos os Municípios de ' + uf + ' --</option>';

    initialCities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      selectCity.appendChild(opt);
    });

    // Se ainda não temos o catálogo completo de municípios do IBGE em cache, busca em background
    if (!IBGE_CITIES_CACHE[uf]) {
      try {
        fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (Array.isArray(data) && data.length > 0) {
              const ibgeCities = data.map(m => m.nome.toUpperCase()).sort();
              IBGE_CITIES_CACHE[uf] = ibgeCities;

              // Se o select ainda estiver com este estado selecionado, atualiza as opções preservando a seleção atual
              if (selectedSearchUf === uf && selectCity) {
                const currentSelectedCity = selectCity.value;
                selectCity.innerHTML = '<option value="">-- Todos os Municípios de ' + uf + ' (' + ibgeCities.length + ') --</option>';
                ibgeCities.forEach(city => {
                  const opt = document.createElement('option');
                  opt.value = city;
                  opt.textContent = city;
                  if (city === currentSelectedCity) opt.selected = true;
                  selectCity.appendChild(opt);
                });
              }
            }
          })
          .catch(err => {
            console.warn('[MAP ENGINE] Busca online do IBGE não respondeu. Mantendo pólos estratégicos locais:', err.message);
          });
      } catch (_) {}
    }
  }

  function resetMeshSearchForm() {
    const selectUf = document.getElementById('selectMeshSearchUf');
    const selectCity = document.getElementById('selectMeshSearchCity');
    const btnExecute = document.getElementById('btnExecuteMeshSearch');
    const statusBar = document.getElementById('meshSearchStatusBar');

    selectedSearchUf = '';
    selectedSearchCity = '';

    if (selectUf) selectUf.value = '';
    if (selectCity) {
      selectCity.value = '';
      selectCity.disabled = true;
      selectCity.innerHTML = '<option value="">-- Selecione a UF primeiro --</option>';
    }
    if (btnExecute) btnExecute.disabled = true;
    if (statusBar) statusBar.style.display = 'none';
  }

  function updateMeshStatusBar(text) {
    const bar = document.getElementById('meshSearchStatusBar');
    const label = document.getElementById('meshSearchStatusText');
    if (!bar || !label) return;

    if (text) {
      label.textContent = text;
      bar.style.display = 'flex';
    } else {
      bar.style.display = 'none';
    }
  }

  /**
   * Extrai Bounding Box [[minLng, minLat], [maxLng, maxLat]] a partir de GeoJSON FeatureCollection
   * Suporta polígonos, multipolígonos, coleções de geometria e pontos
   */
  function calculateGeoJsonBoundingBox(geojson) {
    if (typeof turf !== 'undefined' && typeof turf.bbox === 'function') {
      try {
        const b = turf.bbox(geojson);
        if (b && b.length === 4 && !b.some(isNaN)) {
          if (b[0] >= -74 && b[2] <= -34 && b[1] >= -34 && b[3] <= 6) {
            return [[b[0], b[1]], [b[2], b[3]]];
          }
        }
      } catch (_) {}
    }

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    let count = 0;

    function processCoords(coords) {
      if (!Array.isArray(coords)) return;
      if (coords.length >= 2 &&
          (typeof coords[0] === 'number' || (typeof coords[0] === 'string' && !isNaN(parseFloat(coords[0])))) &&
          (typeof coords[1] === 'number' || (typeof coords[1] === 'string' && !isNaN(parseFloat(coords[1]))))) {
        const lng = typeof coords[0] === 'number' ? coords[0] : parseFloat(coords[0]);
        const lat = typeof coords[1] === 'number' ? coords[1] : parseFloat(coords[1]);
        if (!isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
          // Bounding Box sanity: coordinates must be strictly within Brazil limits!
          // Longitude: -74° a -34°, Latitude: -34° a +6°
          if (lng >= -74 && lng <= -34 && lat >= -34 && lat <= 6) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            count++;
            return;
          }
        }
      }
      for (const item of coords) {
        processCoords(item);
      }
    }

    const featureList = Array.isArray(geojson)
      ? geojson
      : (geojson?.features && Array.isArray(geojson.features))
        ? geojson.features
        : (geojson?.type === 'Feature' ? [geojson] : []);

    for (const f of featureList) {
      if (!f) continue;
      let geom = f.geometry || f.geometria_poligono;
      if (typeof geom === 'string') {
        try { geom = JSON.parse(geom); } catch (_) {}
      }
      if (geom?.coordinates) {
        processCoords(geom.coordinates);
      } else if (f.properties?.centroide_lng && f.properties?.centroide_lat) {
        processCoords([parseFloat(f.properties.centroide_lng), parseFloat(f.properties.centroide_lat)]);
      } else if (f.centroide_lng && f.centroide_lat) {
        processCoords([parseFloat(f.centroide_lng), parseFloat(f.centroide_lat)]);
      }
    }

    if (count === 0 || !isFinite(minLng) || !isFinite(minLat)) {
      return null;
    }

    // Se for uma única coordenada, expande uma margem de segurança de ~0.08 graus (~8km)
    if (minLng === maxLng && minLat === maxLat) {
      minLng -= 0.08;
      maxLng += 0.08;
      minLat -= 0.08;
      maxLat += 0.08;
    }

    return [[minLng, minLat], [maxLng, maxLat]];
  }

  /**
   * HOTFIX UX: Função canônica de carregamento e auto-centralização de malha fundiária (fitBounds)
   * 
   * @param {string|Object} arg1 UF ou objeto { uf, municipio }
   * @param {string} [arg2] Município (quando arg1 for UF string)
   * @param {Object} [options] Opções adicionais de busca e voo
   */
  async function carregarMalha(arg1, arg2, options = {}) {
    let uf = '';
    let city = '';

    if (typeof arg1 === 'string') {
      uf = arg1;
      city = typeof arg2 === 'string' ? arg2 : '';
    } else if (arg1 && typeof arg1 === 'object') {
      uf = arg1.uf || arg1.state || '';
      city = arg1.municipio || arg1.city || arg1.cidade || '';
    } else {
      const selectUf = document.getElementById('selectMeshSearchUf');
      const selectCity = document.getElementById('selectMeshSearchCity');
      uf = selectUf ? selectUf.value : '';
      city = selectCity ? selectCity.value : '';
    }

    return await executeRegionalMeshSearch(uf, city, options);
  }

  /**
   * Executa a busca regional de malha fundiária (Fase 46 - Padrão SIGEF)
   * 1. Atualiza status e bloqueia botão (loading state)
   * 2. Faz GET /api/fundiario/geojson?uf=...&municipio=...
   * 3. Atualiza camada WebGL fundiario-source
   * 4. Executa fitBounds suave com animação (FlyTo regional)
   */
  async function executeRegionalMeshSearch(uf, city, options = {}) {
    if (!map) {
      initMap();
    }

    const btnExecute = document.getElementById('btnExecuteMeshSearch');
    const labelExecute = document.getElementById('labelExecuteMeshSearch');
    const selectUf = document.getElementById('selectMeshSearchUf');
    const selectCity = document.getElementById('selectMeshSearchCity');
    const targetUf = (uf || (selectUf ? selectUf.value : '')).trim().toUpperCase();
    const targetCity = (city || (selectCity ? selectCity.value : '')).trim().toUpperCase();

    if (!targetUf) {
      showToast('Selecione um Estado (UF) para pesquisar.');
      return;
    }

    // Estado visual de carregamento
    if (btnExecute) btnExecute.disabled = true;
    if (labelExecute) labelExecute.innerHTML = '<span class="loading-spinner-sm" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:#00D2FF; border-radius:50%; animation:spin 0.8s linear infinite; margin-right:5px; vertical-align:middle;"></span> Localizando...';
    updateMeshStatusBar(`Buscando malha fundiária para ${targetCity ? targetCity + ' / ' : ''}${targetUf}...`);

    try {
      const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : { 'Content-Type': 'application/json' };
      const queryParams = new URLSearchParams();
      if (targetUf) queryParams.set('uf', targetUf);
      if (targetCity) queryParams.set('municipio', targetCity);
      queryParams.set('origem', 'TODOS');

      const url = `/api/fundiario/car/geojson?${queryParams.toString()}`;
      const res = await fetch(url, { headers });

      if (!res.ok) {
        throw new Error(`Servidor respondeu com status ${res.status}`);
      }

      const geojson = await res.json();
      currentFundiarioGeoJson = geojson;
      selectedSearchUf = targetUf;
      selectedSearchCity = targetCity;
      isRegionalGridLocked = true;

      // FASE 2: Sincroniza dados com o barramento de propriedades rurais global
      const featuresList = geojson.features || [];
      window.ruralPropertiesData = featuresList.map(f => {
        const p = { ...(f.properties || {}) };
        if (!p.id && f.id) p.id = f.id;
        if (!p.geometry && f.geometry) p.geometry = f.geometry;
        return p;
      });

      const fusaoCount = featuresList.filter(f => f.properties?.sobreposicao_sigef || f.properties?.tag_fonte === 'FUSAO_SIGEF_CAR').length;
      const displayTotal = fusaoCount > 0 ? fusaoCount : (geojson.total_features ?? featuresList.length);

      window.dispatchEvent(new CustomEvent('ruralDataUpdated', {
        detail: { count: window.ruralPropertiesData.length, fusaoCount: displayTotal }
      }));

      // Atualiza o contador TOTAL FILTRADO no Right Drawer / Sidebar
      const sidebarTotalEl = document.getElementById('sidebarTotalFiltered');
      if (sidebarTotalEl) {
        sidebarTotalEl.textContent = typeof formatNumber === 'function' ? formatNumber(displayTotal) : String(displayTotal);
      }
      if (window.state) {
        window.state.totalFiltered = displayTotal;
      }

      console.log(`[MAP ENGINE] GeoJSON fundiário recebido:`, geojson);

      // 1. Injeção de Dados no Source WebGL
      if (!map.getSource('fundiario-source') || !map.getLayer('fundiario-polygon-fill')) {
        setupFundiarioLayers();
      }
      
      const fundSource = map.getSource('fundiario-source');
      if (fundSource && typeof fundSource.setData === 'function') {
        fundSource.setData(geojson);
      }

      // 2. Forçar Visibilidade (Layout Properties) em todas as camadas fundiárias
      fundiarioLayerActive = true;
      setFundiarioLayersVisibility(true);

      const layersToForceVisible = [
        'fundiario-polygon-fill',
        'fundiario-polygon-stroke',
        'fundiario-polygon-label',
        'fundiario-fill-layer',
        'fundiario-line-layer'
      ];

      layersToForceVisible.forEach(layerId => {
        if (map.getLayer(layerId)) {
          try {
            map.setLayoutProperty(layerId, 'visibility', 'visible');
          } catch (_) {}
        }
      });

      // 3. Sincronia de Botões (UI): ativa o botão principal [ 🌾 Malha Fundiária ]
      const btnFundLayer = document.getElementById('btnToggleFundiarioLayer');
      if (btnFundLayer) {
        btnFundLayer.classList.add('active');
        btnFundLayer.setAttribute('aria-pressed', 'true');
      }

      const featureCount = geojson.total_features ?? (Array.isArray(geojson.features) ? geojson.features.length : 0);

      // Atualiza badge de contagem de fazendas
      const countEl = document.getElementById('mapFundiarioCountBadge');
      if (countEl) {
        const badgeLabel = fusaoCount > 0
          ? `${fusaoCount} parcelas certificadas (${targetCity || targetUf})`
          : `${featureCount} fazendas (${targetCity || targetUf})`;
        countEl.textContent = badgeLabel;
        countEl.style.display = 'inline-flex';
      }

      // HOTFIX UX: Se a busca não retornar resultados, exibe aviso tático e encerra
      if (featureCount === 0 || !geojson.features || geojson.features.length === 0) {
        updateMeshStatusBar('⚠️ Nenhuma parcela certificada encontrada nesta região.');
        showToast('Nenhuma parcela certificada encontrada nesta região.');
        return geojson;
      }

      // Enquadramento dinâmico: Se busca macro estadual sem município, enquadra limites oficiais do Estado
      if (!targetCity && BRAZIL_UF_BOUNDS[targetUf]) {
        map.fitBounds(BRAZIL_UF_BOUNDS[targetUf], {
          padding: 40,
          duration: 1500,
          essential: true
        });
      } else {
        // Calcula Bounding Box (caixa delimitadora) de todas as geometrias retornadas
        const bbox = calculateGeoJsonBoundingBox(geojson);

        // Auto-centralização da malha municipal com fitBounds nativo
        if (bbox) {
          map.fitBounds(bbox, {
            padding: 50,
            duration: 1500,
            essential: true
          });
        } else if (BRAZIL_UF_BOUNDS[targetUf]) {
          map.fitBounds(BRAZIL_UF_BOUNDS[targetUf], {
            padding: 40,
            duration: 1500,
            essential: true
          });
        } else {
          updateMeshStatusBar('⚠️ Nenhuma parcela certificada encontrada nesta região.');
          showToast('Nenhuma parcela certificada encontrada nesta região.');
          return geojson;
        }
      }

      const statusMsg = fusaoCount > 0
        ? `✅ ${fusaoCount} parcelas fundiárias com fusão CAR + SIGEF validadas para ${targetCity ? targetCity + ' / ' : ''}${targetUf}.`
        : `✅ ${featureCount} parcelas fundiárias carregadas para ${targetCity ? targetCity + ' / ' : ''}${targetUf}.`;
      updateMeshStatusBar(statusMsg);
      showToast(`🛰️ Malha fundiária: ${fusaoCount > 0 ? fusaoCount : featureCount} fazendas localizadas.`);
      showToast(`🛰️ Malha fundiária carregada: ${featureCount} fazendas localizadas.`);
      return geojson;
    } catch (err) {
      console.error('❌ [MAP ENGINE] Erro ao buscar malha regional:', err);
      updateMeshStatusBar(`⚠️ Falha na busca da malha: ${err.message}`);
      showToast(`Erro ao carregar malha de ${targetCity || targetUf}: ${err.message}`);
    } finally {
      if (btnExecute) btnExecute.disabled = false;
      if (labelExecute) labelExecute.textContent = '🔍 Carregar Malha';
    }
  }

  function getUfDescription(uf) {
    const map = {
      AC: 'Acre',
      AL: 'Alagoas',
      AP: 'Amapá',
      AM: 'Amazonas',
      BA: 'Bahia',
      CE: 'Ceará',
      DF: 'Distrito Federal',
      ES: 'Espírito Santo',
      GO: 'Goiás',
      MA: 'Maranhão',
      MT: 'Mato Grosso',
      MS: 'Mato Grosso do Sul',
      MG: 'Minas Gerais',
      PA: 'Pará',
      PB: 'Paraíba',
      PR: 'Paraná',
      PE: 'Pernambuco',
      PI: 'Piauí',
      RJ: 'Rio de Janeiro',
      RN: 'Rio Grande do Norte',
      RS: 'Rio Grande do Sul',
      RO: 'Rondônia',
      RR: 'Roraima',
      SC: 'Santa Catarina',
      SP: 'São Paulo',
      SE: 'Sergipe',
      TO: 'Tocantins'
    };
    return map[uf] || uf;
  }

  // =========================================================================
  // FASE 2: FILTRAGEM REATIVA DA MALHA FUNDIÁRIA (MAPA ⇄ TABELA ⇄ COPILOTO)
  // =========================================================================

  /**
   * Filtra dinamicamente as features do currentFundiarioGeoJson com base nos filtros canônicos
   * e executa auto-centralização (fitBounds) nas parcelas qualificadas.
   */
  function applyActiveFiltersToFundiario(filters = {}) {
    if (!currentFundiarioGeoJson || !Array.isArray(currentFundiarioGeoJson.features) || currentFundiarioGeoJson.features.length === 0) {
      return [];
    }

    const {
      cultura,
      score_min,
      intent_classification,
      status_car,
      area_min_ha,
      apenas_whatsapp
    } = filters;

    const allFeatures = currentFundiarioGeoJson.features;
    const matchingFeatures = allFeatures.filter(f => {
      const p = f.properties || {};
      if (score_min !== undefined && score_min !== null && (Number(p.intent_score) || 0) < Number(score_min)) return false;
      if (intent_classification && intent_classification !== 'ALL' && (p.intent_classification || '').toUpperCase() !== intent_classification.toUpperCase()) return false;
      if (cultura) {
        const crop = (p.dados_agronomicos?.crop_type || p.crop_type || p.cultura || '').toLowerCase();
        if (!crop.includes(cultura.toLowerCase())) return false;
      }
      if (area_min_ha && (Number(p.area_hectares) || 0) < Number(area_min_ha)) return false;
      if (apenas_whatsapp && !p.whatsapp_validado) return false;
      if (status_car) {
        const pStatus = (p.status_car || '').toUpperCase();
        const temPassivo = Boolean(p.tem_passivo_ambiental);
        const semCar = !p.codigo_car;
        if (status_car === 'TODOS_PENDENTES') {
          if (!(semCar || temPassivo || ['PENDENTE','SUSPENSO','CANCELADO','NOTIFICADO'].includes(pStatus))) return false;
        } else if (pStatus !== status_car.toUpperCase()) {
          return false;
        }
      }
      return true;
    });

    console.log(`[MAP ENGINE] Filtro ativo aplicado à malha: ${matchingFeatures.length} de ${allFeatures.length} parcelas qualificadas.`);

    // 1. Atualiza source WebGL com as features qualificadas
    if (map && map.getSource('fundiario-source')) {
      map.getSource('fundiario-source').setData({
        type: 'FeatureCollection',
        features: matchingFeatures
      });
    }

    // 2. Atualiza badge numérico na barra de ferramentas do mapa
    const countEl = document.getElementById('mapFundiarioCountBadge');
    if (countEl) {
      countEl.textContent = `${matchingFeatures.length} fazendas filtradas`;
      countEl.style.display = 'inline-flex';
    }

    // 3. Auto-centralização suave (fitBounds) no subconjunto de propriedades filtradas
    if (matchingFeatures.length > 0 && map) {
      const bbox = calculateGeoJsonBoundingBox({ type: 'FeatureCollection', features: matchingFeatures });
      if (bbox) {
        map.fitBounds(bbox, {
          padding: 60,
          duration: 1200,
          essential: true
        });
      }
    }

    return matchingFeatures;
  }

  // Subscrição ao barramento unificado de filtros
  window.addEventListener('versusFiltersChanged', async (e) => {
    const { filters, source } = e.detail || {};
    if (!filters) return;

    const targetUf = (filters.uf || '').trim().toUpperCase();
    const targetCity = (filters.municipio || '').trim().toUpperCase();

    // Se o filtro especifica região e ela ainda não foi carregada no mapa
    if (targetUf && (selectedSearchUf !== targetUf || (targetCity && selectedSearchCity !== targetCity))) {
      await carregarMalha(targetUf, targetCity);
    }

    // Aplica os filtros táticos diretamente na camada WebGL
    applyActiveFiltersToFundiario(filters);
  });

  // =========================================================================
  // FASE 47 ETAPA 2: BUSCA REVERSA / PIN-DROP ESPACIAL (POINT-IN-POLYGON)
  // =========================================================================

  function setupInspectPinControls() {
    const btnInspectPin = document.getElementById('btnInspectPinToggle');
    if (!btnInspectPin) return;

    btnInspectPin.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleInspectPinTool();
    });
  }

  function toggleInspectPinTool() {
    if (!map) {
      initMap();
    }
    if (isInspectPinActive) {
      deactivateInspectPinTool();
      showToast('Inspeção territorial desativada.');
    } else {
      activateInspectPinTool();
    }
  }

  function activateInspectPinTool() {
    if (!map) return;
    const btnInspectPin = document.getElementById('btnInspectPinToggle');
    isInspectPinActive = true;
    if (btnInspectPin) {
      btnInspectPin.classList.add('active');
    }
    map.getCanvas().style.cursor = 'crosshair';
    showToast('📍 Modo Inspecionar Ativo: Clique em qualquer local do mapa para identificar o imóvel.');
  }

  function deactivateInspectPinTool() {
    isInspectPinActive = false;
    const btnInspectPin = document.getElementById('btnInspectPinToggle');
    if (btnInspectPin) {
      btnInspectPin.classList.remove('active');
    }
    if (map) {
      map.getCanvas().style.cursor = '';
    }
  }

  async function handleInspectPinMapClick(e) {
    if (!isInspectPinActive) return;
    deactivateInspectPinTool();

    const { lng, lat } = e.lngLat || {};
    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return;

    showToast(`📍 Sondando coordenadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}...`);

    try {
      const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : { 'Content-Type': 'application/json' };
      const res = await fetch(`/api/fundiario/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, { headers });
      const json = await res.json();

      if (json && json.success && json.data) {
        const type = json.inspection_type || (json.data.nome_imovel ? 'RURAL_PROPERTY' : 'TERRITORIAL_POINT');

        if (type === 'RURAL_PROPERTY') {
          const prop = json.data;
          if (typeof window.inspectRuralPropertyInDrawer === 'function') {
            window.inspectRuralPropertyInDrawer(prop);
          }
          showToast(`🌾 Imóvel rural identificado: ${prop.nome_imovel || 'Propriedade Rural'}`);
        } else if (type === 'B2B_COMPANY') {
          const lead = json.data;
          if (typeof window.inspectLeadInDrawer === 'function') {
            window.inspectLeadInDrawer(lead.id);
          }
          const leadName = lead.nome_fantasia || lead.razao_social || 'Empresa B2B';
          showToast(`🏢 Empresa identificada no local (${json.distance_meters || 0}m): ${leadName}`);
        } else {
          // TERRITORIAL_POINT (Urbano / Praça / Logradouro / Lote)
          const point = json.data;
          if (typeof window.inspectTerritorialPointInDrawer === 'function') {
            window.inspectTerritorialPointInDrawer(point);
          }
          const pointName = point.nome || point.logradouro || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          showToast(`🌐 Ponto territorial inspecionado: ${pointName}`);
        }
      } else {
        // Fallback resiliente universal garantindo resposta em qualquer clique
        if (typeof window.inspectTerritorialPointInDrawer === 'function') {
          window.inspectTerritorialPointInDrawer({
            lat,
            lng,
            nome: `Ponto Territorial (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            display_name: `Coordenada Geográfica (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
            logradouro: 'Via Pública / Ponto Territorial',
            bairro: 'Área Territorial',
            municipio: 'Brasil',
            uf: '',
            zone_label: 'PONTO TERRITORIAL GEORREFERENCIADO'
          });
        }
        showToast(`📍 Ponto georreferenciado: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    } catch (err) {
      console.error('❌ [MAP ENGINE] Erro na inspeção territorial de coordenadas:', err);
      if (typeof window.inspectTerritorialPointInDrawer === 'function') {
        window.inspectTerritorialPointInDrawer({
          lat,
          lng,
          nome: `Ponto Territorial (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          display_name: `Coordenada Geográfica (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
          logradouro: 'Via Pública / Ponto Territorial',
          bairro: 'Área Territorial',
          municipio: 'Brasil',
          uf: '',
          zone_label: 'PONTO TERRITORIAL GEORREFERENCIADO'
        });
      }
      showToast(`📍 Ponto georreferenciado: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
  }

  // =========================================================================
  // GESTÃO DE CAMADA BASE (VETOR DARK MATTER VS. SATÉLITE REAL DE ALTA RESOLUÇÃO)
  // =========================================================================

  /**
   * Garante que fontes e camadas raster de satélite estão registradas no motor MapLibre
   */
  function ensureSatelliteSourcesAndLayers() {
    if (!map) return;

    if (!map.getSource('esri-satellite-base')) {
      map.addSource('esri-satellite-base', {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© Esri, Maxar, Earthstar Geographics'
      });
    }

    if (!map.getSource('esri-satellite-labels')) {
      map.addSource('esri-satellite-labels', {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        maxzoom: 19
      });
    }

    // Camada abaixo de qualquer polígono ou ponto vetorial
    const beforeLayerId = map.getLayer('fundiario-polygon-fill') ? 'fundiario-polygon-fill' :
                          (map.getLayer('clusters') ? 'clusters' :
                          (map.getLayer('unclustered-point') ? 'unclustered-point' : undefined));

    if (!map.getLayer('esri-satellite-base-layer')) {
      map.addLayer({
        id: 'esri-satellite-base-layer',
        type: 'raster',
        source: 'esri-satellite-base',
        minzoom: 0,
        maxzoom: 22,
        layout: {
          visibility: currentBaseMapMode === 'satellite' ? 'visible' : 'none'
        }
      }, beforeLayerId);
    }

    if (!map.getLayer('esri-satellite-labels-layer')) {
      map.addLayer({
        id: 'esri-satellite-labels-layer',
        type: 'raster',
        source: 'esri-satellite-labels',
        minzoom: 0,
        maxzoom: 22,
        layout: {
          visibility: currentBaseMapMode === 'satellite' ? 'visible' : 'none'
        }
      }, beforeLayerId);
    }
  }

  /**
   * Aplica a visibilidade das camadas base (Vetor vs Satélite) instantaneamente
   */
  function applyBaseMapVisibility(mode) {
    if (!map) return;
    const isSat = (mode === 'satellite');
    ensureSatelliteSourcesAndLayers();

    try {
      if (map.getLayer('esri-dark-base-layer')) {
        map.setLayoutProperty('esri-dark-base-layer', 'visibility', isSat ? 'none' : 'visible');
      }
      if (map.getLayer('esri-dark-labels-layer')) {
        map.setLayoutProperty('esri-dark-labels-layer', 'visibility', isSat ? 'none' : 'visible');
      }
      if (map.getLayer('esri-satellite-base-layer')) {
        map.setLayoutProperty('esri-satellite-base-layer', 'visibility', isSat ? 'visible' : 'none');
      }
      if (map.getLayer('esri-satellite-labels-layer')) {
        map.setLayoutProperty('esri-satellite-labels-layer', 'visibility', isSat ? 'visible' : 'none');
      }
    } catch (e) {
      console.warn('[MapEngine] Erro ao alternar visibilidade de camadas base:', e.message);
    }
  }

  /**
   * Alterna entre modo Vetorial Escuro e Satélite Real
   */
  function toggleBaseMapMode() {
    const nextMode = (currentBaseMapMode === 'vector') ? 'satellite' : 'vector';
    return setBaseMapMode(nextMode);
  }

  /**
   * Define expressamente o modo de base do mapa ('vector' ou 'satellite')
   */
  function setBaseMapMode(mode) {
    if (mode !== 'vector' && mode !== 'satellite') {
      mode = (currentBaseMapMode === 'vector') ? 'satellite' : 'vector';
    }
    currentBaseMapMode = mode;

    if (map && (map.isStyleLoaded() || map.loaded())) {
      applyBaseMapVisibility(mode);
    }

    updateMapModeButtonUI(mode);

    if (typeof showToast === 'function') {
      if (mode === 'satellite') {
        showToast('Satélite Real ativado (Alta Resolução).');
      } else {
        showToast('Modo Vetorial Dark Matter ativado.');
      }
    }

    return currentBaseMapMode;
  }

  const SATELLITE_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7 9 3 5 7l4 4"></path><path d="m17 11 4 4-4 4-4-4"></path><path d="m8 12 4 4 6-6-4-4Z"></path><path d="m16 8 3-3"></path><path d="M9 21a6 6 0 0 0-6-6"></path></svg>';
  const MAP_VECTOR_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>';

  /**
   * Atualiza o estado visual do botão de alternância na barra superior
   */
  function updateMapModeButtonUI(mode) {
    const btn = document.getElementById('btnToggleMapMode') || document.getElementById('btnToggleSatellite');
    const icon = document.getElementById('btnToggleMapModeIcon');
    const label = document.getElementById('btnToggleMapModeLabel');
    if (!btn) return;

    const isSat = (mode === 'satellite');
    btn.classList.toggle('active', isSat);
    btn.setAttribute('data-mode', mode);

    if (icon) {
      icon.innerHTML = isSat ? MAP_VECTOR_SVG : SATELLITE_SVG;
    }
    if (label) {
      label.textContent = isSat ? 'Modo Vetor' : 'Satélite / Vetor';
    }
    btn.setAttribute('data-tooltip', isSat
      ? 'Modo Satélite Ativo — Clique para retornar ao Modo Vetorial'
      : 'Modo Vetorial Ativo — Clique para alternar para Satélite Real'
    );
  }

  // =========================================================================
  // FASE WMS: CAMADAS GEOESPACIAIS OFICIAIS (IBAMA, ANA, PRODES)
  // =========================================================================
  const WMS_CONFIGS = {
    ibama: {
      id: 'ibama',
      name: 'IBAMA (Embargos Ambientais)',
      sourceId: 'wms-ibama-source',
      layerId: 'wms-ibama-layer',
      url: 'https://pamgia.ibama.gov.br/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=ibama:embargos&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE',
      opacity: 0.75,
      color: '#D946EF',
      active: false,
      btnId: 'toggleWmsIbamaBtn',
      chkId: 'checkWmsIbamaLeg'
    },
    ana: {
      id: 'ana',
      name: 'ANA (Pivôs de Irrigação)',
      sourceId: 'wms-ana-source',
      layerId: 'wms-ana-layer',
      url: 'https://www.snirh.gov.br/arcgis/services/INDE/Camadas/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=pivos_irrigacao&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE',
      opacity: 0.80,
      color: '#14B8A6',
      active: false,
      btnId: 'toggleWmsAnaBtn',
      chkId: 'checkWmsAnaLeg'
    },
    prodes: {
      id: 'prodes',
      name: 'PRODES (Desmatamento INPE)',
      sourceId: 'wms-prodes-source',
      layerId: 'wms-prodes-layer',
      url: 'https://terrabrasilis.dpi.inpe.br/geoserver/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=prodes-cerrado-nb:yearly_deforestation,prodes-legal-amz-nb:yearly_deforestation&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE',
      opacity: 0.75,
      color: '#EA580C',
      active: false,
      btnId: 'toggleWmsProdesBtn',
      chkId: 'checkWmsProdesLeg'
    }
  };

  let isWmsInitialized = false;

  function ensureWmsLayer(layerKey) {
    if (!map || !WMS_CONFIGS[layerKey]) return;
    const cfg = WMS_CONFIGS[layerKey];

    try {
      if (!map.getSource(cfg.sourceId)) {
        map.addSource(cfg.sourceId, {
          type: 'raster',
          tiles: [cfg.url],
          tileSize: 256
        });
      }

      if (!map.getLayer(cfg.layerId)) {
        const beforeLayerId = map.getLayer('fundiario-polygon-stroke') ? 'fundiario-polygon-stroke' :
                              (map.getLayer('clusters') ? 'clusters' :
                              (map.getLayer('unclustered-point') ? 'unclustered-point' : undefined));

        map.addLayer({
          id: cfg.layerId,
          type: 'raster',
          source: cfg.sourceId,
          minzoom: 3,
          maxzoom: 20,
          paint: {
            'raster-opacity': cfg.opacity
          },
          layout: {
            visibility: cfg.active ? 'visible' : 'none'
          }
        }, beforeLayerId);
      }
    } catch (e) {
      console.warn(`[MapEngine] Erro ao instanciar camada WMS ${layerKey}:`, e);
    }
  }

  function toggleWmsLayer(layerKey, forceState) {
    const cfg = WMS_CONFIGS[layerKey];
    if (!cfg) return;

    const nextState = typeof forceState === 'boolean' ? forceState : !cfg.active;
    cfg.active = nextState;

    if (map) {
      ensureWmsLayer(layerKey);
      try {
        if (map.getLayer(cfg.layerId)) {
          map.setLayoutProperty(cfg.layerId, 'visibility', nextState ? 'visible' : 'none');
        }
      } catch (err) {
        console.warn(`[MapEngine] Erro ao alternar visibilidade da camada WMS ${layerKey}:`, err);
      }
    }

    // Sincroniza o botão na barra superior do mapa
    const btn = document.getElementById(cfg.btnId);
    if (btn) {
      btn.classList.toggle('active', nextState);
    }

    // Sincroniza o checkbox na Legenda Espacial
    const chk = document.getElementById(cfg.chkId);
    if (chk) {
      chk.checked = nextState;
    }

    // Toast de notificação
    if (typeof showToast === 'function') {
      showToast(nextState ? `Camada ${cfg.name} ativada no mapa.` : `Camada ${cfg.name} desativada.`);
    }

    // Persistência em LocalStorage
    try {
      const saved = JSON.parse(localStorage.getItem('versus_wms_layers_state') || '{}');
      saved[layerKey] = nextState;
      localStorage.setItem('versus_wms_layers_state', JSON.stringify(saved));
    } catch (_) {}
  }

  function setupWmsLayersAndControls() {
    if (isWmsInitialized) return;
    isWmsInitialized = true;

    let savedPrefs = {};
    try {
      savedPrefs = JSON.parse(localStorage.getItem('versus_wms_layers_state') || '{}');
    } catch (_) {}

    Object.keys(WMS_CONFIGS).forEach(key => {
      const cfg = WMS_CONFIGS[key];

      // Botão na barra de ferramentas
      const btn = document.getElementById(cfg.btnId);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWmsLayer(key);
        });
      }

      // Checkbox na Legenda Espacial
      const chk = document.getElementById(cfg.chkId);
      if (chk) {
        chk.addEventListener('change', (e) => {
          e.stopPropagation();
          toggleWmsLayer(key, chk.checked);
        });
      }

      // Clique no container do item da Legenda Espacial
      const legItem = document.querySelector(`.leg-wms-item[data-wms-key="${key}"]`);
      if (legItem) {
        legItem.addEventListener('click', (e) => {
          if (e.target.tagName.toLowerCase() === 'input') return;
          e.stopPropagation();
          toggleWmsLayer(key);
        });
      }

      // Restaura preferência salva
      if (savedPrefs[key] === true) {
        if (map && isMapInitialized) {
          toggleWmsLayer(key, true);
        } else {
          cfg.active = true;
          if (btn) btn.classList.add('active');
          if (chk) chk.checked = true;
        }
      }
    });
  }

  return {
    initMap,
    resize,
    toggleFullscreen,
    exitFullscreen,
    toggleWmsLayer,
    getWmsConfigs: () => WMS_CONFIGS,
    isWmsLayerActive: (key) => !!WMS_CONFIGS[key]?.active,
    setupWmsLayersAndControls,
    toggleBaseMapMode,
    setBaseMapMode,
    getBaseMapMode: () => currentBaseMapMode,
    isSatelliteMode: () => currentBaseMapMode === 'satellite',
    ensureSatelliteSourcesAndLayers,
    renderRadiusBuffer,
    clearRadiusBuffer,
    countLeadsInRadius,
    fetchAndRenderGeoJson,
    refreshPofLayer,
    setupCompetitorsAndGapsLayers,
    setCompetitorLayersVisibility,
    renderCompetitorAndGapsSpatial,
    flyToGapLocation,
    flyToLocation,
    flyToSparkLocation,
    clearActiveSparkMarker,
    isCompetitorsLayerActive: () => competitorsLayerActive,
    setupFundiarioLayers,
    fetchAndRenderFundiarioGeoJson,
    setFundiarioLayersVisibility,
    isFundiarioLayerActive: () => fundiarioLayerActive,
    getMap: () => map,
    getCurrentGeoJson: () => currentGeoJson,
    getCurrentFundiarioGeoJson: () => currentFundiarioGeoJson,
    openMeshSearchPanel,
    closeMeshSearchPanel,
    populateMeshUfOptions,
    populateMeshCityOptions,
    resetMeshSearchForm,
    carregarMalha,
    executeRegionalMeshSearch,
    calculateGeoJsonBoundingBox,
    getSelectedSearchUf: () => selectedSearchUf,
    getSelectedSearchCity: () => selectedSearchCity,
    setupInspectPinControls,
    toggleInspectPinTool,
    activateInspectPinTool,
    deactivateInspectPinTool,
    isInspectPinActive: () => isInspectPinActive,
    handleInspectPinMapClick,
    applyActiveFiltersToFundiario,
    detectCurrentMapHub,
    applySelectionFilter: function(isActive, selectedIdsSet) {
      if (!map) return;
      const ids = selectedIdsSet ? Array.from(selectedIdsSet) : [];

      // 1. Filtragem nos markers HTML comerciais B2B
      if (commercialB2bMarkers && commercialB2bMarkers.length > 0) {
        commercialB2bMarkers.forEach(marker => {
          const el = marker.getElement();
          const id = el ? el.getAttribute('data-id') : null;
          if (!isActive || ids.length === 0) {
            el.style.display = '';
            if (id && ids.includes(id)) {
              el.classList.add('selected-highlight');
            } else {
              el.classList.remove('selected-highlight');
            }
          } else {
            if (id && ids.includes(id)) {
              el.style.display = '';
              el.classList.add('selected-highlight');
            } else {
              el.style.display = 'none';
              el.classList.remove('selected-highlight');
            }
          }
        });
      }

      // 2. Filtragem na camada nativa MapLibre unclustered-point
      try {
        if (map.getLayer('unclustered-point')) {
          if (isActive && ids.length > 0) {
            map.setFilter('unclustered-point', ['in', ['get', 'id'], ['literal', ids]]);
          } else {
            map.setFilter('unclustered-point', ['!', ['has', 'point_count']]);
          }
        }
      } catch (_) {}
    }
  };
})();

// Atribuições globais de compatibilidade e interoperabilidade
window.mapEngine = window.MapEngine;
window.carregarMalha = window.MapEngine.carregarMalha;

