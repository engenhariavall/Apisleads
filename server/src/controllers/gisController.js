import { getAllLeadsMatchingFilter } from '../services/leadsService.js';
import { GeoSpatialEngine, ECONOMIC_CLUSTERS, CITY_COORDINATES, UF_CENTROIDS } from '../modules/gis/index.js';
import { resolveRealCategory, calculateVitalityIndex } from '../modules/intelligence/index.js';
import { validatePhoneChannel } from '../modules/intent/phoneValidator.js';
import { getTenantFromRequest } from '../middleware/authMiddleware.js';

/**
 * Retorna catálogo de pólos econômicos e agropecuários estratégicos
 * GET /api/gis/clusters
 */
export function getEconomicClusters(req, res) {
  try {
    res.json({
      success: true,
      clusters: ECONOMIC_CLUSTERS
    });
  } catch (error) {
    console.error('Erro ao listar pólos econômicos GIS:', error);
    res.status(500).json({ error: 'Falha ao obter catálogo de pólos geográficos' });
  }
}

/**
 * Filtro avançado de leads por raio circular em KM (Fórmula de Haversine)
 * POST /api/gis/filter-radius
 */
export function filterLeadsByRadius(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { 
      center_lat, 
      center_lng, 
      latitude, 
      longitude, 
      lat, 
      lng, 
      radius_km = 100, 
      filters = {}, 
      cluster_id 
    } = req.body || {};

    let cLat = parseFloat(center_lat !== undefined ? center_lat : (latitude !== undefined ? latitude : lat));
    let cLng = parseFloat(center_lng !== undefined ? center_lng : (longitude !== undefined ? longitude : lng));
    let rKm = parseFloat(radius_km) || 100;
    let clusterName = null;

    if (cluster_id) {
      const cluster = ECONOMIC_CLUSTERS.find(c => c.id === cluster_id);
      if (cluster) {
        cLat = cluster.center.lat;
        cLng = cluster.center.lng;
        rKm = cluster.default_radius_km;
        clusterName = cluster.name;
      }
    }

    if (isNaN(cLat) || isNaN(cLng)) {
      return res.status(400).json({ error: 'Coordenadas de centro (lat, lng) são obrigatórias.' });
    }

    const allLeads = getAllLeadsMatchingFilter({ ...filters, tenant_id: tenantId });
    const filteredLeads = GeoSpatialEngine.filterByRadius(allLeads, cLat, cLng, rKm);

    res.json({
      success: true,
      center: { lat: cLat, lng: cLng },
      radius_km: rKm,
      cluster_name: clusterName,
      total_found: filteredLeads.length,
      leads: filteredLeads
    });
  } catch (error) {
    console.error('Erro no filtro por raio GIS:', error);
    res.status(500).json({ error: error.message || 'Falha ao filtrar leads por raio geográfico' });
  }
}

/**
 * Filtro avançado de leads por polígono geográfico (Ray-Casting Algorithm)
 * POST /api/gis/filter-polygon
 */
export function filterLeadsByPolygon(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { polygon, filters = {} } = req.body || {};

    if (!Array.isArray(polygon) || polygon.length < 3) {
      return res.status(400).json({ error: 'Polígono inválido. Forneça ao menos 3 coordenadas [lat, lng].' });
    }

    const allLeads = getAllLeadsMatchingFilter({ ...filters, tenant_id: tenantId });
    const filteredLeads = GeoSpatialEngine.filterByPolygon(allLeads, polygon);

    res.json({
      success: true,
      polygon_vertices: polygon.length,
      total_found: filteredLeads.length,
      leads: filteredLeads
    });
  } catch (error) {
    console.error('Erro no filtro por polígono GIS:', error);
    res.status(500).json({ error: error.message || 'Falha ao filtrar leads por polígono' });
  }
}

/**
 * Retorna coordenadas simplificadas de leads para renderização de mapa/pins
 * POST /api/gis/map-points
 */
export function getMapPoints(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { 
      filters = {}, 
      center_lat, 
      center_lng, 
      latitude, 
      longitude, 
      lat, 
      lng, 
      radius_km 
    } = req.body || {};

    const cLat = center_lat !== undefined ? center_lat : (latitude !== undefined ? latitude : lat);
    const cLng = center_lng !== undefined ? center_lng : (longitude !== undefined ? longitude : lng);

    let leads = getAllLeadsMatchingFilter({ ...filters, tenant_id: tenantId });

    if (cLat !== undefined && cLng !== undefined && radius_km) {
      leads = GeoSpatialEngine.filterByRadius(leads, parseFloat(cLat), parseFloat(cLng), parseFloat(radius_km));
    }

    const points = leads
      .map(l => {
        const coords = GeoSpatialEngine.resolveCoordinates(l);
        if (coords.lat === null || coords.lng === null) return null;

        return {
          id: l.id,
          name: l.nome_fantasia || l.razao_social,
          cnpj: l.cnpj,
          city: l.municipio,
          uf: l.uf,
          target_type: l.target_type,
          porte: l.porte,
          capital_social: l.capital_social,
          lat: coords.lat,
          lng: coords.lng,
          distance_km: l.geo_distance_km || null,
          intent_stage: l.intent?.intent_stage || 'MONITOR'
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      total_points: points.length,
      points
    });
  } catch (error) {
    console.error('Erro ao gerar pontos do mapa GIS:', error);
    res.status(500).json({ error: 'Falha ao obter pontos geoespaciais' });
  }
}

/**
 * Retorna FeatureCollection GeoJSON padronizado para WebGIS (MapLibre GL & H3)
 * POST /api/gis/geojson
 */
export function getGeoJsonLeads(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { filters = {}, polygon, geo_radius } = req.body || {};

    let leads = getAllLeadsMatchingFilter({ ...filters, tenant_id: tenantId });

    // Se houver polígono espacial fornecido (desenho livre de cancelas comerciais)
    if (Array.isArray(polygon) && polygon.length >= 3) {
      leads = GeoSpatialEngine.filterByPolygon(leads, polygon);
    }

    const features = leads.map(l => {
      const coords = GeoSpatialEngine.resolveCoordinates(l);
      if (coords.lat === null || coords.lng === null) return null;

      const contactHealth = validatePhoneChannel(l.telefone);
      const realCategory = resolveRealCategory(l);
      const vitality = calculateVitalityIndex({ ...l, contact_health: contactHealth });

      const capitalNum = parseFloat(l.capital_social) || 0;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [coords.lng, coords.lat] // GeoJSON: [longitude, latitude]
        },
        properties: {
          id: l.id,
          cnpj: l.cnpj,
          razao_social: l.razao_social,
          nome_fantasia: l.nome_fantasia || l.razao_social,
          categoria_real: realCategory.categoria_real,
          categoria_id: realCategory.categoria_id,
          divergencia_cadastral: realCategory.divergencia_cadastral,
          cnae_codigo: l.cnae_principal_codigo,
          cnae_descricao: l.cnae_principal_descricao,
          porte: l.porte,
          capital_social: capitalNum,
          capital_formatted: `R$ ${capitalNum.toLocaleString('pt-BR')}`,
          target_type: l.target_type || 'BUYER',
          vitality_status: vitality.vitality_status,
          vitality_score: vitality.vitality_score,
          vitality_label: vitality.vitality_label,
          vitality_icon: vitality.icon,
          vitality_color: vitality.badge_color,
          uf: l.uf,
          municipio: l.municipio,
          telefone: l.telefone || '',
          whatsapp_capable: contactHealth.is_whatsapp_capable,
          audit_status: l.audit_status || 'UNAUDITED',
          vertical_type: l.vertical_type || 'GERAL'
        }
      };
    }).filter(Boolean);

    let finalFeatures = features;

    // Filtro analítico de vitalidade cadastral (calculada dinamicamente)
    if (filters.vitality_status || filters.vitality) {
      const reqStatus = (filters.vitality_status || filters.vitality).toUpperCase();
      finalFeatures = finalFeatures.filter(f => f.properties.vitality_status === reqStatus);
    }

    // Filtro analítico de categoria real
    if (filters.categoria_id || filters.categoria_real) {
      const reqCat = (filters.categoria_id || filters.categoria_real).toUpperCase();
      finalFeatures = finalFeatures.filter(f => 
        (f.properties.categoria_id && f.properties.categoria_id.toUpperCase() === reqCat) ||
        (f.properties.categoria_real && f.properties.categoria_real.toUpperCase().includes(reqCat))
      );
    }

    res.json({
      type: 'FeatureCollection',
      total_features: finalFeatures.length,
      features: finalFeatures
    });
  } catch (error) {
    console.error('Erro ao gerar GeoJSON de leads:', error);
    res.status(500).json({ error: 'Falha ao processar GeoJSON geoespacial' });
  }
}

