/**
 * FASE 17: WEBGIS ANALÍTICO & GESTÃO ESPACIAL (PADRÃO VERSUS)
 * Módulo: Camada Hexagonal Uber H3 (h3Layer.js)
 * 
 * Indexa coordenadas de leads em células hexagonais H3 (resolução 7),
 * agregando densidade de empresas e faturamento/capital acumulado por micro-região.
 */

window.H3LayerEngine = (function() {
  let isH3Active = false;
  let currentHexGeoJson = null;
  let h3Popup = null;

  /**
   * Converte uma coleção de features pontuais GeoJSON em polígonos hexagonais H3
   * @param {Array} features Lista de features GeoJSON (Points)
   * @param {number} resolution Resolução H3 (padrão 7: ~1.2km de raio)
   * @returns {Object} FeatureCollection GeoJSON de Polígonos H3
   */
  function buildH3GeoJson(features, resolution = 7) {
    if (typeof h3 === 'undefined') {
      console.warn('Biblioteca h3-js não carregada.');
      return { type: 'FeatureCollection', features: [] };
    }

    if (!Array.isArray(features) || features.length === 0) {
      return { type: 'FeatureCollection', features: [] };
    }

    const cellMap = new Map();

    features.forEach(f => {
      if (!f.geometry || !Array.isArray(f.geometry.coordinates)) return;
      const [lng, lat] = f.geometry.coordinates;
      if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) return;

      try {
        // Converte coordenadas para ID de célula H3
        const cell = h3.latLngToCell(lat, lng, resolution);
        if (!cellMap.has(cell)) {
          cellMap.set(cell, {
            cell,
            count: 0,
            totalCapital: 0,
            categories: {},
            leads: []
          });
        }

        const bucket = cellMap.get(cell);
        bucket.count++;
        const cap = parseFloat(f.properties?.capital_social) || 0;
        bucket.totalCapital += cap;
        bucket.leads.push(f.properties || {});

        const cat = f.properties?.categoria_real || 'Geral';
        bucket.categories[cat] = (bucket.categories[cat] || 0) + 1;
      } catch (err) {
        // Ignora coordenada inválida pontual
      }
    });

    const hexFeatures = [];

    cellMap.forEach(bucket => {
      try {
        // Obtém os vértices do hexágono em formato GeoJSON [lng, lat]
        const boundary = h3.cellToBoundary(bucket.cell, true);
        if (!Array.isArray(boundary) || boundary.length === 0) return;

        // Fecha o anel poligonal se já não estiver fechado
        const isClosed = boundary.length > 1 && 
          boundary[0][0] === boundary[boundary.length - 1][0] && 
          boundary[0][1] === boundary[boundary.length - 1][1];
        const ring = isClosed ? boundary : [...boundary, boundary[0]];

        // Determina categoria dominante
        let dominantCat = 'Múltiplos Segmentos';
        let maxCatCount = 0;
        Object.entries(bucket.categories).forEach(([c, cnt]) => {
          if (cnt > maxCatCount) {
            maxCatCount = cnt;
            dominantCat = c;
          }
        });

        hexFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [ring]
          },
          properties: {
            cell: bucket.cell,
            count: bucket.count,
            total_capital: bucket.totalCapital,
            total_capital_formatted: `R$ ${bucket.totalCapital.toLocaleString('pt-BR')}`,
            avg_capital: bucket.count > 0 ? Math.round(bucket.totalCapital / bucket.count) : 0,
            dominant_category: dominantCat,
            leads_sample: bucket.leads.slice(0, 3)
          }
        });
      } catch (err) {
        console.warn('Erro ao processar hexágono H3:', bucket.cell, err);
      }
    });

    return {
      type: 'FeatureCollection',
      features: hexFeatures
    };
  }

  /**
   * Adiciona ou atualiza as camadas H3 no mapa MapLibre
   */
  function applyH3Layer(map, features, resolution = 7) {
    if (!map) return;

    currentHexGeoJson = buildH3GeoJson(features, resolution);

    if (map.getSource('h3-hexagons-source')) {
      map.getSource('h3-hexagons-source').setData(currentHexGeoJson);
    } else {
      map.addSource('h3-hexagons-source', {
        type: 'geojson',
        data: currentHexGeoJson
      });

      // Camada de preenchimento com gradiente VERSUS por densidade
      map.addLayer({
        id: 'h3-hexagons-fill',
        type: 'fill',
        source: 'h3-hexagons-source',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'count'],
            1, 'rgba(0, 85, 255, 0.35)',
            3, 'rgba(0, 140, 255, 0.50)',
            8, 'rgba(0, 210, 255, 0.65)',
            15, 'rgba(34, 197, 94, 0.75)'
          ],
          'fill-opacity': 0.65
        }
      }, 'unclustered-point'); // Insere abaixo dos pins

      // Camada de contorno fino ciano
      map.addLayer({
        id: 'h3-hexagons-line',
        type: 'line',
        source: 'h3-hexagons-source',
        paint: {
          'line-color': '#00D2FF',
          'line-width': 1.2,
          'line-opacity': 0.75
        }
      }, 'unclustered-point');

      // Popover interativo no hover dos hexágonos
      if (!h3Popup && typeof maplibregl !== 'undefined') {
        h3Popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'map-dark-popup h3-popup'
        });
      }

      map.on('mousemove', 'h3-hexagons-fill', (e) => {
        if (!isH3Active || !e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = 'pointer';

        const props = e.features[0].properties;
        const coordinates = e.lngLat;

        h3Popup.setLngLat(coordinates)
          .setHTML(`
            <div class="h3-tooltip-box">
              <div class="h3-tooltip-header">
                <span class="h3-badge">🔷 Célula H3</span>
                <span class="h3-count">${props.count} empresa(s)</span>
              </div>
              <div class="h3-tooltip-body">
                <div class="h3-row">
                  <span>Capital Acumulado:</span>
                  <strong>${props.total_capital_formatted}</strong>
                </div>
                <div class="h3-row">
                  <span>Segmento Dominante:</span>
                  <span class="h3-dom-cat">${props.dominant_category}</span>
                </div>
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'h3-hexagons-fill', () => {
        map.getCanvas().style.cursor = '';
        if (h3Popup) h3Popup.remove();
      });
    }

    // Garante visibilidade
    setH3Visibility(map, true);
    isH3Active = true;
  }

  /**
   * Alterna a visibilidade das camadas H3
   */
  function setH3Visibility(map, visible) {
    if (!map) return;
    const val = visible ? 'visible' : 'none';
    if (map.getLayer('h3-hexagons-fill')) map.setLayoutProperty('h3-hexagons-fill', 'visibility', val);
    if (map.getLayer('h3-hexagons-line')) map.setLayoutProperty('h3-hexagons-line', 'visibility', val);
    isH3Active = visible;

    const legendH3 = document.getElementById('legendH3Section');
    if (legendH3) {
      legendH3.style.display = visible ? 'flex' : 'none';
    }
  }

  function toggleH3(map, features) {
    if (!map) return false;
    if (isH3Active) {
      setH3Visibility(map, false);
      return false;
    } else {
      applyH3Layer(map, features);
      return true;
    }
  }

  return {
    buildH3GeoJson,
    applyH3Layer,
    setH3Visibility,
    toggleH3,
    isActive: () => isH3Active
  };
})();
