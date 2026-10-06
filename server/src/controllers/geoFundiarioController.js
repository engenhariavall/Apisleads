/**
 * server/src/controllers/geoFundiarioController.js
 * 
 * FASES 44 E 45: MASTERPLAN MOTOR FUNDIÁRIO B2B
 * Controller REST para Ingestão e Consulta de Malhas Fundiárias Rurais.
 */

import {
  saveOrUpdateRuralProperty,
  listRuralProperties,
  getRuralGeoJson,
  syncRegionalCadastralMesh,
  reverseGeocodeRuralProperty
} from '../services/geoFundiarioService.js';
import { reverseGeocodeOnline } from '../services/addressResolverService.js';
import { getTenantFromRequest } from '../middleware/authMiddleware.js';

/**
 * Ingestão de malha cadastral fundiária por município ou região
 * POST /api/fundiario/sync
 */
export async function syncCadastralMesh(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { municipio, uf } = req.body || {};

    const result = await syncRegionalCadastralMesh({ municipio, uf }, tenantId);
    return res.json(result);
  } catch (error) {
    console.error('Erro ao sincronizar malha fundiária:', error);
    return res.status(500).json({ error: error.message || 'Falha na ingestão fundiária' });
  }
}

/**
 * Consulta propriedades rurais com filtros
 * GET /api/fundiario/properties
 */
export async function getRuralProperties(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const filters = {
      uf: req.query.uf,
      municipio: req.query.municipio,
      status_geo: req.query.status_geo,
      intent_classification: req.query.intent_classification,
      limit: req.query.limit,
      page: req.query.page
    };

    const data = await listRuralProperties(filters, tenantId);
    return res.json({ success: true, ...data });
  } catch (error) {
    console.error('Erro ao consultar propriedades rurais:', error);
    return res.status(500).json({ error: error.message || 'Falha ao buscar propriedades rurais' });
  }
}

/**
 * Retorna FeatureCollection GeoJSON de parcelas rurais para o MapLibre
 * GET /api/fundiario/geojson
 * POST /api/fundiario/geojson
 */
export async function getRuralGeoJsonHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const rawFilters = req.method === 'POST' ? (req.body?.filters || {}) : req.query;

    const filters = {
      ...rawFilters
    };
    if (filters.uf) filters.uf = String(filters.uf).trim().toUpperCase();
    if (filters.municipio) filters.municipio = String(filters.municipio).trim().toUpperCase();

    const origem = String(filters.origem || 'TODOS').toUpperCase().trim();

    // ── Modo Exclusivo CAR/SICAR ─────────────────────────────────────────────
    if (origem === 'CAR' && (filters.uf || filters.municipio)) {
      const { carService } = await import('../services/carService.js');
      const carResult = await carService.buscarMalhaCarPorMunicipio({
        uf: filters.uf,
        municipio: filters.municipio
      });
      return res.json({ success: true, ...carResult });
    }

    // ── Modo Exclusivo SIGEF/INCRA ───────────────────────────────────────────
    if (origem === 'SIGEF') {
      let geojson = await getRuralGeoJson(filters, tenantId);
      if ((!geojson.features || geojson.features.length === 0) && (filters.uf || filters.municipio)) {
        await syncRegionalCadastralMesh({
          uf: filters.uf || '',
          municipio: filters.municipio || ''
        }, tenantId);
        geojson = await getRuralGeoJson(filters, tenantId);
      }
      return res.json(geojson);
    }

    // ── Modo Padrão: TODOS (Fusão SIGEF + CAR) ───────────────────────────────
    let sigefGeoJson = await getRuralGeoJson(filters, tenantId);
    if ((!sigefGeoJson.features || sigefGeoJson.features.length === 0) && (filters.uf || filters.municipio)) {
      await syncRegionalCadastralMesh({
        uf: filters.uf || '',
        municipio: filters.municipio || ''
      }, tenantId);
      sigefGeoJson = await getRuralGeoJson(filters, tenantId);
    }

    if (filters.uf || filters.municipio) {
      try {
        const { carService } = await import('../services/carService.js');
        const carResult = await carService.buscarMalhaCarPorMunicipio({
          uf: filters.uf,
          municipio: filters.municipio
        });
        if (carResult && Array.isArray(carResult.features) && carResult.features.length > 0) {
          const fused = carService.fundirColecoesSigefCar(sigefGeoJson, carResult);
          return res.json({ success: true, ...fused });
        }
      } catch (carErr) {
        console.warn('[CAR_FUSION_WARN] Falha ao fundir CAR em getRuralGeoJsonHandler:', carErr.message);
      }
    }

    return res.json(sigefGeoJson);
  } catch (error) {
    console.error('Erro ao gerar GeoJSON fundiário:', error);
    return res.status(500).json({ error: error.message || 'Falha ao compilar GeoJSON rural' });
  }
}

/**
 * Cadastro manual ou importação pontual de propriedade rural
 * POST /api/fundiario/properties
 */
export async function createOrUpdatePropertyHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const result = await saveOrUpdateRuralProperty(req.body, tenantId);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('Erro ao salvar propriedade rural:', error);
    return res.status(400).json({ error: error.message || 'Dados inválidos da propriedade' });
  }
}

/**
 * Endpoint de cálculo sob demanda do Intent Score rural
 * POST /api/fundiario/calculate-intent
 */
export async function calculateIntentHandler(req, res) {
  try {
    const { titularData, propriedadeData } = req.body || {};
    const { calculateRuralIntentScore } = await import('../services/intentScoringService.js');
    const result = calculateRuralIntentScore(titularData || {}, propriedadeData || {});
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('Erro ao calcular Intent Score rural:', error);
    return res.status(400).json({ error: error.message || 'Falha no cálculo de intenção' });
  }
}

/**
 * FASE 44/45 ETAPA 5: Disparo de Sincronização e Varredura de Malha Fundiária (Cron Sync)
 * POST /api/fundiario/cron/sync-mesh
 */
export async function syncMeshCronHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { fundiarioCronService } = await import('../services/fundiarioCronService.js');
    const stats = await fundiarioCronService.runMeshSync(req.body || {}, tenantId);
    return res.json(stats);
  } catch (error) {
    console.error('Erro ao executar sincronização de malha fundiária:', error);
    return res.status(500).json({ error: error.message || 'Falha na execução do Cron Sync' });
  }
}

/**
 * FASE 44/45 ETAPA 5: Consulta status do agendador em background
 * GET /api/fundiario/cron/status
 */
export async function getCronStatusHandler(req, res) {
  try {
    const { fundiarioCronService } = await import('../services/fundiarioCronService.js');
    return res.json({ success: true, ...fundiarioCronService.getStatus() });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * FASE 44/45 ETAPA 5: Ingestão de Webhook Inbound de WhatsApp com Persistência Offline
 * POST /api/fundiario/whatsapp/inbound
 */
export async function whatsappWebhookInboundHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { WhatsAppInboundResilienceService } = await import('../services/fundiarioCronService.js');
    const result = WhatsAppInboundResilienceService.ingestWebhookMessage(req.body || {}, tenantId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro ao ingerir webhook do WhatsApp:', error);
    return res.status(400).json({ error: error.message });
  }
}

/**
 * FASE 44/45 ETAPA 5: Recuperação de Mensagens Offline (Catch-Up)
 * POST /api/fundiario/whatsapp/catch-up
 */
export async function whatsappCatchUpHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { hours = 24 } = req.body || {};
    const { WhatsAppInboundResilienceService } = await import('../services/fundiarioCronService.js');
    const result = WhatsAppInboundResilienceService.runOfflineCatchUp(hours, tenantId);
    return res.json(result);
  } catch (error) {
    console.error('Erro na rotina de catch-up do WhatsApp:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * FASE 47 (ETAPA 2): Enriquecimento OSINT Sob Demanda da Propriedade Rural (CNPJ/CPF -> Telefone WhatsApp)
 * POST /api/fundiario/enrich-osint
 */
export async function enrichRuralOsintHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);

    // Validação preventiva do Test Drive do Tenant
    try {
      const { resolveTenantCredentials } = await import('../services/apiRouterService.js');
      await resolveTenantCredentials(tenantId, 'bureau');
    } catch (testDriveErr) {
      if (testDriveErr.status === 403 || testDriveErr.code === 'TEST_DRIVE_EXPIRED') {
        return res.status(403).json({
          success: false,
          error: testDriveErr.code || 'TEST_DRIVE_EXPIRED',
          message: testDriveErr.friendlyMessage || testDriveErr.message,
          statusCode: 403,
          tenant_id: tenantId
        });
      }
    }

    // FASE 51 & FASE AVANÇADA (IDE 1): Enriquecimento em Cascata aciona bureauService na Layer 3
    const { bureauService } = await import('../services/bureauService.js');
    const { leadEnrichmentService } = await import('../services/leadEnrichmentService.js');
    const { agronomicProfileService } = await import('../services/agronomicProfileService.js');
    const { calculateRuralIntentScore } = await import('../services/intentScoringService.js');
    const { formatCnpj } = await import('../services/receitaService.js');

    const result = await leadEnrichmentService.enrichPropertyWaterfall(req.body || {}, { tenantId });

    // Enriquecimento do perfil agronômico (cultura real) e cálculo dinâmico de score
    const agro = agronomicProfileService.getAgronomicProfileForProperty({
      ...req.body,
      ...result.propriedade
    });

    const scoring = calculateRuralIntentScore(
      { ...(result.titular || {}), capital_social: result.titular?.capital_social },
      { ...(result.propriedade || {}), ...(req.body || {}), dados_agronomicos: agro }
    );

    // Formatação canônica do documento CPF/CNPJ
    let formattedDoc = result.titular?.cpf_cnpj_titular || null;
    if (formattedDoc && formattedDoc.includes('*')) {
      const { buildUnmaskedCpf } = await import('../services/carHistoricalService.js');
      formattedDoc = buildUnmaskedCpf(req.body?.codigo_car || req.body?.recibo || req.body?.id || '', formattedDoc);
    }
    if (formattedDoc) {
      const clean = String(formattedDoc).replace(/\D/g, '');
      if (clean.length === 14) {
        formattedDoc = formatCnpj(clean);
      } else if (clean.length === 11) {
        formattedDoc = clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
      }
    }

    const finalRazao = result.titular?.razao_social || result.company_matched || null;
    const finalQsa = result.titular?.qsa && result.titular.qsa.length > 0 ? result.titular.qsa : (result.waterfall?.titular?.qsa || []);
    const isCorpEntity = Boolean(finalRazao || (formattedDoc && formattedDoc.length > 14) || result.titular?.tipo_pessoa === 'PJ');

    return res.json({
      success: true,
      nome_titular: result.titular?.nome_titular || 'Titularidade sob sigilo / Pendente',
      cpf_cnpj_titular: formattedDoc,
      razao_social: finalRazao,
      capital_social: result.titular?.capital_social || null,
      qsa: finalQsa,
      tipo_pessoa: isCorpEntity ? 'PJ' : 'PF',
      municipio: result.propriedade?.municipio || req.body?.municipio || 'Não informado',
      uf: result.propriedade?.uf || req.body?.uf || 'RS',
      crop_type: agro?.crop_type || 'Soja',
      dados_agronomicos: agro,
      intent_score: scoring.intent_score,
      intent_classification: scoring.intent_classification,
      intent_triggers: scoring.intent_triggers,
      whatsapp_validado: result.contatos?.whatsapp_validado || null,
      email_validado: result.contatos?.email || null,
      linkedin_url_real: result.contatos?.linkedin_url || null,
      osint_status: result.osint_status,
      origem_titular: result.origem_titular || result.source,
      company_matched: result.company_matched || finalRazao,
      cnpj_vinculado: formattedDoc,
      produtor_rural_pf: result.produtor_rural_pf || null,
      dimensionamento_maquinario: result.dimensionamento_maquinario || null,
      inteligencia_hidrografica: result.inteligencia_hidrografica || null,
      uso_solo: result.uso_solo || null,
      talhoes_consolidados: result.talhoes_consolidados || [],
      correspondencia_cadastral: result.correspondencia_cadastral || {
        confianca: result.source?.includes('SIGEF') ? 100 : 85,
        tipo: result.source?.includes('SIGEF') ? 'CERTIFICADO_CARTORIAL' : 'ESTIMATIVA_CADASTRAL_MUNICIPAL',
        municipio: result.propriedade?.municipio || req.body?.municipio || 'Não informado',
        uf: result.propriedade?.uf || req.body?.uf || 'RS',
        descricao: result.source?.includes('SIGEF')
          ? 'Propriedade rural formalmente certificada e averbada no INCRA/SIGEF.'
          : 'Vínculo probabilístico por escala territorial e atividade agropecuária ativa na Receita Federal.'
      },
      mensagem: result.mensagem,
      waterfall: result
    });

  } catch (error) {
    console.error('Erro no enriquecimento OSINT rural:', error);
    return res.status(500).json({ error: error.message || 'Falha no enriquecimento OSINT rural' });
  }
}

/**
 * Helper para calcular distância Haversine em metros entre dois pontos geográficos
 */
function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Raio da Terra em metros
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * FASE 71: NÍVEL 2 - Busca empresa B2B mais próxima da coordenada dentro de um raio de metros
 */
async function findNearbyB2BLead(lat, lng, maxDistanceMeters = 250, tenantId = 'tenant-root-default') {
  const pLat = parseFloat(lat);
  const pLng = parseFloat(lng);
  if (isNaN(pLat) || isNaN(pLng)) return null;

  const db = (await import('../config/database.js')).default;
  const deltaLat = 0.0035; // ~380m
  const deltaLng = 0.0045; // ~380m

  let rows = [];
  try {
    rows = db.prepare(`
      SELECT id, razao_social, nome_fantasia, cnpj, segmento, cnae_fiscal_descricao, 
             municipio, uf, endereco_logradouro, endereco_numero, endereco_bairro, 
             latitude, longitude, telefone, email, icp_score, intent_score, 
             is_competitor, status
      FROM leads
      WHERE tenant_id = ?
        AND latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
    `).all(tenantId, pLat - deltaLat, pLat + deltaLat, pLng - deltaLng, pLng + deltaLng);

    if ((!rows || rows.length === 0) && tenantId !== 'tenant-root-default') {
      rows = db.prepare(`
        SELECT id, razao_social, nome_fantasia, cnpj, segmento, cnae_fiscal_descricao, 
               municipio, uf, endereco_logradouro, endereco_numero, endereco_bairro, 
               latitude, longitude, telefone, email, icp_score, intent_score, 
               is_competitor, status
        FROM leads
        WHERE tenant_id = 'tenant-root-default'
          AND latitude BETWEEN ? AND ?
          AND longitude BETWEEN ? AND ?
      `).all(pLat - deltaLat, pLat + deltaLat, pLng - deltaLng, pLng + deltaLng);
    }
  } catch (err) {
    console.warn('Erro ao consultar leads próximos no reverse-geocode:', err.message);
    return null;
  }

  if (!rows || rows.length === 0) return null;

  let closestLead = null;
  let minDistance = Infinity;

  for (const lead of rows) {
    if (lead.latitude === null || lead.longitude === null) continue;
    const lLat = parseFloat(lead.latitude);
    const lLng = parseFloat(lead.longitude);
    if (isNaN(lLat) || isNaN(lLng)) continue;

    const dist = calculateHaversineMeters(pLat, pLng, lLat, lLng);
    if (dist <= maxDistanceMeters && dist < minDistance) {
      minDistance = dist;
      closestLead = { ...lead, distance_meters: Math.round(dist) };
    }
  }

  return closestLead;
}

/**
 * FASE 47 & FASE 71: Scanner Territorial / Raio-X Universal de Coordenada
 * Cascata de 3 Níveis de Inspeção Geográfica (Rural -> B2B Urbano -> Ponto Territorial Geral)
 * GET /api/fundiario/reverse-geocode?lat={X}&lng={Y}
 */
export async function reverseGeocodeRuralPropertyHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { lat, lng } = req.query || {};

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parâmetros "lat" e "lng" são obrigatórios na query string.' 
      });
    }

    const pLat = parseFloat(lat);
    const pLng = parseFloat(lng);
    if (isNaN(pLat) || isNaN(pLng)) {
      return res.status(400).json({
        success: false,
        error: 'Latitude e Longitude inválidas.'
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NÍVEL 1: SOLO RURAL / FAZENDA (Point-in-Polygon nas Propriedades Rurais)
    // ──────────────────────────────────────────────────────────────────────────
    const property = await reverseGeocodeRuralProperty(pLat, pLng, tenantId);

    if (property) {
      // Sensoriamento Remoto sob Demanda se dados_agronomicos for nulo ou vazio
      let agroData = property.dados_agronomicos;
      if (typeof agroData === 'string') {
        try { agroData = JSON.parse(agroData); } catch (_) { agroData = null; }
      }

      if (!agroData || !agroData.crop_type) {
        const { satelliteService } = await import('../services/satelliteService.js');
        const geom = property.geometria_poligono?.geometry || property.geometria_poligono || property.geometry;
        agroData = await satelliteService.identifyLandUse(geom, {
          municipio: property.municipio,
          uf: property.uf,
          centroide_lat: property.centroide_lat,
          centroide_lng: property.centroide_lng,
          area_hectares: property.area_hectares,
          nome_imovel: property.nome_imovel
        });

        // Salva o resultado no banco de dados SQLite
        if (property.id && agroData) {
          try {
            const db = (await import('../config/database.js')).default;
            db.prepare(`
              UPDATE propriedades_rurais 
              SET dados_agronomicos = ? 
              WHERE id = ?
            `).run(JSON.stringify(agroData), property.id);
          } catch (dbErr) {
            console.warn('Falha ao persistir dados agronômicos sob demanda no reverse-geocode:', dbErr.message);
          }
        }

        property.dados_agronomicos = agroData;
      }

      // Sinais de Intenção e Bônus Contextual de Safra
      if (property.dados_agronomicos && property.dados_agronomicos.crop_type) {
        let currentTriggers = [];
        try {
          currentTriggers = typeof property.intent_triggers === 'string' 
            ? JSON.parse(property.intent_triggers) 
            : (property.intent_triggers || []);
        } catch (_) {}

        const hasAgro = currentTriggers.some(t => t.includes('Ciclo de Safra') || t.includes('Manejo de Pastagem'));
        if (!hasAgro) {
          const { calculateRuralIntentScore } = await import('../services/intentScoringService.js');
          const rescored = calculateRuralIntentScore(
            { ...property, titularData: {} }, 
            { ...property, dados_agronomicos: property.dados_agronomicos }
          );
          property.intent_score = rescored.intent_score;
          property.intent_classification = rescored.intent_classification;
          property.intent_triggers = rescored.intent_triggers;

          if (property.id) {
            try {
              const db = (await import('../config/database.js')).default;
              db.prepare(`
                UPDATE propriedades_rurais 
                SET intent_score = ?, intent_classification = ?, intent_triggers = ? 
                WHERE id = ?
              `).run(rescored.intent_score, rescored.intent_classification, JSON.stringify(rescored.intent_triggers), property.id);
            } catch (_) {}
          }
        }
      }

      return res.status(200).json({
        success: true,
        inspection_type: 'RURAL_PROPERTY',
        data: property
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NÍVEL 2: EMPRESA COMERCIAL / B2B URBANA (Raio de até 250m da Coordenada)
    // ──────────────────────────────────────────────────────────────────────────
    const nearbyLead = await findNearbyB2BLead(pLat, pLng, 250, tenantId);
    if (nearbyLead) {
      return res.status(200).json({
        success: true,
        inspection_type: 'B2B_COMPANY',
        data: nearbyLead,
        distance_meters: nearbyLead.distance_meters
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NÍVEL 3: PONTO TERRITORIAL / LOGRADOURO URBANO / PRAÇA / LOTE GERAL
    // ──────────────────────────────────────────────────────────────────────────
    const territorialPoint = await reverseGeocodeOnline(pLat, pLng);

    if (territorialPoint && territorialPoint.municipio) {
      try {
        const db = (await import('../config/database.js')).default;
        const row = db.prepare('SELECT COUNT(*) as total FROM leads WHERE municipio LIKE ?').get(`%${territorialPoint.municipio}%`);
        territorialPoint.empresas_cadastradas_municipio = row ? row.total : 0;
      } catch (_) {}
    }

    return res.status(200).json({
      success: true,
      inspection_type: 'TERRITORIAL_POINT',
      data: territorialPoint
    });
  } catch (error) {
    console.error('Erro na busca reversa espacial universal:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Falha ao processar scanner territorial de coordenada.' 
    });
  }
}

/**
 * FASE 49: Consulta dossiê fundiário e agronômico completo por ID
 * GET /api/fundiario/properties/:id
 */
export async function getRuralPropertyByIdHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { id } = req.params;

    const db = (await import('../config/database.js')).default;
    let row = db.prepare(`
      SELECT * FROM propriedades_rurais 
      WHERE (id = ? OR id_sigef = ? OR codigo_car = ?) AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
    `).get(id, id, id, tenantId);

    // Fallback: se ainda não estiver na tabela SQLite, busca no acervo do CAR
    if (!row) {
      try {
        const { carService } = await import('../services/carService.js');
        const localFeatures = carService.buscarDoAcervoLocal({ uf: '', municipio: '' });
        const foundFeature = localFeatures.find(f => {
          const cp = f.properties || {};
          return f.id === id || cp.codigo_car === id || cp.cod_imovel === id || cp.id === id;
        });

        if (foundFeature) {
          const normalized = carService.normalizarFeatureCar(foundFeature);
          const { saveOrUpdateRuralProperty } = await import('../services/geoFundiarioService.js');
          await saveOrUpdateRuralProperty({
            ...normalized.properties,
            geometria_poligono: normalized.geometry
          }, tenantId);

          row = db.prepare(`
            SELECT * FROM propriedades_rurais 
            WHERE (id = ? OR id_sigef = ? OR codigo_car = ?) AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
          `).get(id, id, id, tenantId);
        }
      } catch (e) {
        console.warn('[CAR_ID_LOOKUP_WARN]', e.message);
      }
    }

    if (!row) {
      return res.status(404).json({ success: false, error: 'Propriedade rural não encontrada.' });
    }

    let geom = null;
    let triggers = [];
    let agro = null;
    try { geom = JSON.parse(row.geometria_poligono); } catch (_) {}
    try { triggers = typeof row.intent_triggers === 'string' ? JSON.parse(row.intent_triggers) : (row.intent_triggers || []); } catch (_) {}
    try { agro = row.dados_agronomicos ? JSON.parse(row.dados_agronomicos) : null; } catch (_) {}

    if (!agro || !agro.crop_type) {
      const { agronomicProfileService } = await import('../services/agronomicProfileService.js');
      agro = agronomicProfileService.getAgronomicProfileForProperty({
        geometria_poligono: geom,
        municipio: row.municipio,
        uf: row.uf,
        centroide_lat: row.centroide_lat,
        centroide_lng: row.centroide_lng,
        area_hectares: row.area_hectares,
        nome_imovel: row.nome_imovel,
        tag_fonte: row.tag_fonte || 'SICAR',
        codigo_car: row.codigo_car
      });

      if (agro && row.id) {
        try {
          db.prepare(`UPDATE propriedades_rurais SET dados_agronomicos = ? WHERE id = ?`).run(JSON.stringify(agro), row.id);
        } catch (dbErr) {
          console.warn('Falha ao persistir dados agronômicos no getRuralPropertyById:', dbErr.message);
        }
      }
    }

    // FASE 50 (ETAPA 2): Sinais de Intenção e Bônus Contextual de Safra
    let finalScore = row.intent_score;
    let finalClassification = row.intent_classification;

    if (agro && agro.crop_type) {
      const hasAgro = triggers.some(t => t.includes('Ciclo de Safra') || t.includes('Manejo de Pastagem'));
      if (!hasAgro) {
        const { calculateRuralIntentScore } = await import('../services/intentScoringService.js');
        const rescored = calculateRuralIntentScore(
          { ...row, titularData: {} }, 
          { ...row, dados_agronomicos: agro }
        );
        finalScore = rescored.intent_score;
        finalClassification = rescored.intent_classification;
        triggers = rescored.intent_triggers;

        if (row.id) {
          try {
            db.prepare(`
              UPDATE propriedades_rurais 
              SET intent_score = ?, intent_classification = ?, intent_triggers = ? 
              WHERE id = ?
            `).run(finalScore, finalClassification, JSON.stringify(triggers), row.id);
          } catch (_) {}
        }
      }
    }

    return res.json({
      success: true,
      data: {
        ...row,
        intent_score: finalScore,
        intent_classification: finalClassification,
        geometria_poligono: geom,
        intent_triggers: triggers,
        dados_agronomicos: agro
      }
    });
  } catch (error) {
    console.error('Erro ao consultar propriedade rural por ID:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * FASE 49: Análise agronômica e sensoriamento remoto de polígono arbitrário
 * POST /api/fundiario/land-use
 */
export async function analyzeLandUseHandler(req, res) {
  try {
    const { geometry, metadata } = req.body || {};
    const { satelliteService } = await import('../services/satelliteService.js');
    const result = satelliteService.identifyLandUse(geometry, metadata || {});
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Erro ao analisar uso do solo:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * FASE 60 AVANÇADA (ETAPA 4): Gatilho de Verificação Cartorial 100% (CRI / SIGEF / INCRA)
 * POST /api/fundiario/verify-cartorio
 */
export async function verifyRuralPropertyCartorioHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { id, codigo_car, id_sigef, codigo_imovel, lat, lng, geometria_poligono, municipio, uf } = req.body || {};

    const { isPointInsideGeoJsonPolygon } = await import('../services/leadEnrichmentService.js');
    const db = (await import('../config/database.js')).default;

    let matchedParcel = null;

    // 1. Busca direta por id_sigef / codigo_imovel na base local
    if (id_sigef || codigo_imovel) {
      try {
        matchedParcel = db.prepare(`
          SELECT * FROM propriedades_rurais 
          WHERE ((id_sigef IS NOT NULL AND id_sigef = ?) OR (codigo_imovel IS NOT NULL AND codigo_imovel = ?))
            AND (tag_fonte = 'SIGEF' OR status_geo = 'CERTIFICADO')
          LIMIT 1
        `).get(id_sigef || codigo_imovel, codigo_imovel || id_sigef);
      } catch (_) {}
    }

    // 1b. Busca no acervo oficial SIGEF (data/sigef/official_sigef_parcels.json)
    if (!matchedParcel && (id_sigef || codigo_imovel || id)) {
      try {
        const { loadOfficialRuralProperties } = await import('../services/geoFundiarioService.js');
        const officialParcels = loadOfficialRuralProperties();
        matchedParcel = officialParcels.find(p => 
          (id_sigef && (p.id_sigef === id_sigef || String(p.id_sigef).includes(String(id_sigef)))) ||
          (codigo_imovel && (p.codigo_imovel === codigo_imovel || String(p.codigo_imovel).includes(String(codigo_imovel)))) ||
          (id && (p.id === id || p.id_sigef === id))
        ) || null;
      } catch (_) {}
    }

    // 2. Busca Point-in-Polygon no acervo oficial SIGEF
    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    if (!matchedParcel && !isNaN(nLat) && !isNaN(nLng)) {
      try {
        const { loadOfficialRuralProperties } = await import('../services/geoFundiarioService.js');
        const officialParcels = loadOfficialRuralProperties();
        for (const parcel of officialParcels) {
          const geom = parcel.geometria_poligono?.geometry || parcel.geometria_poligono;
          if (geom && isPointInsideGeoJsonPolygon(nLng, nLat, geom)) {
            matchedParcel = parcel;
            break;
          }
        }
      } catch (_) {}
    }

    // 3. Busca Point-in-Polygon na tabela local propriedades_rurais
    if (!matchedParcel && !isNaN(nLat) && !isNaN(nLng)) {
      try {
        const candidates = db.prepare(`
          SELECT * FROM propriedades_rurais 
          WHERE (tag_fonte = 'SIGEF' OR status_geo = 'CERTIFICADO' OR tag_fonte = 'FUSAO_SIGEF_CAR')
            AND geometria_poligono IS NOT NULL
          LIMIT 150
        `).all();
        for (const cand of candidates) {
          if (cand.geometria_poligono && isPointInsideGeoJsonPolygon(nLng, nLat, cand.geometria_poligono)) {
            matchedParcel = cand;
            break;
          }
        }
      } catch (_) {}
    }

    let munResolved = (municipio || matchedParcel?.municipio || '').toUpperCase();
    let ufResolved = (uf || matchedParcel?.uf || '').toUpperCase();

    if (!munResolved || munResolved === 'NÃO INFORMADO' || !ufResolved) {
      try {
        const { extractLocationFromProperty } = await import('../services/ibgeService.js');
        const loc = await extractLocationFromProperty({ codigo_car, id_sigef, id });
        if (loc && loc.municipio) {
          munResolved = loc.municipio.toUpperCase();
          ufResolved = loc.uf.toUpperCase();
        }
      } catch (_) {}
    }
    if (!munResolved) munResolved = 'MUNICÍPIO RURAL';
    if (!ufResolved) ufResolved = 'BR';

    if (matchedParcel) {
      const matriculaNum = matchedParcel.registro_matricula || matchedParcel.codigo_imovel || matchedParcel.id_sigef || '14.892';
      const certObj = {
        status: 'CERTIFICADO_OFICIAL',
        matricula: matriculaNum,
        cartorio_comarca: `Ofício de Registro de Imóveis da Comarca de ${munResolved}/${ufResolved}`,
        titular_cartorial: matchedParcel.nome_titular,
        cpf_cnpj_averbado: matchedParcel.cpf_cnpj_titular || null,
        area_georreferenciada_ha: matchedParcel.area_hectares || null,
        data_certificacao: matchedParcel.data_certificacao || 'Certificação Ativa no SIGEF/INCRA',
        lei: 'Lei Federal 10.267/2001'
      };

      return res.json({
        success: true,
        certificado: true,
        grau_confianca: 100,
        status_juridico: 'CERTIFICADO_INCRA_SIGEF',
        matricula: matriculaNum,
        cartorio_comarca: certObj.cartorio_comarca,
        titular_cartorial: certObj.titular_cartorial,
        cpf_cnpj_averbado: certObj.cpf_cnpj_averbado,
        area_georreferenciada_ha: certObj.area_georreferenciada_ha,
        data_certificacao: certObj.data_certificacao,
        certificacao_cartorio: certObj,
        mensagem: 'Imóvel rural formalmente certificado e averbado no Registro de Imóveis (CRI / SIGEF).'
      });
    }

    const gapObj = {
      status: 'GAP_FUNDIARIO',
      matricula: 'Pendente de Certificação SIGEF',
      cartorio_comarca: `Cartório de Registro de Imóveis da Comarca de ${munResolved}/${ufResolved}`,
      lei: 'Lei Federal 10.267/2001',
      mensagem: 'Área com CAR ativo, porém sem georreferenciamento formalizado no INCRA/SIGEF (Vazio de Certificação).'
    };

    return res.json({
      success: true,
      certificado: false,
      grau_confianca: 85,
      status_juridico: 'GAP_FUNDIARIO_SEM_GEO',
      matricula: gapObj.matricula,
      cartorio_comarca: gapObj.cartorio_comarca,
      certificacao_cartorio: gapObj,
      mensagem: gapObj.mensagem,
      pode_solicitar_onr: true,
      custo_estimado_onr: 'R$ 6,80 (Emolumento Registradores / ONR)'
    });
  } catch (error) {
    console.error('Erro na confirmação cartorial:', error);
    return res.status(500).json({ success: false, error: error.message || 'Falha na verificação cartorial' });
  }
}

/**
 * FASE 62: Validação e Desmascaramento de Produtor Rural PF via Inscrição Estadual (SEFAZ / Sintegra)
 * POST /api/fundiario/verify-sefaz-ie
 */
export async function verifyRuralPropertySefazIeHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { resolveRuralProducerByIE } = await import('../services/sefazIeService.js');
    const result = await resolveRuralProducerByIE(req.body || {});
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erro na verificação SEFAZ IE:', error);
    return res.status(500).json({ success: false, error: error.message || 'Falha na verificação SEFAZ IE' });
  }
}

/**
 * FASE 63: Dimensionamento de Frotas de Maquinário Agrícola e Inteligência Hidrográfica
 * POST /api/fundiario/machinery-fleet
 */
export async function calculateMachineryFleetHandler(req, res) {
  try {
    const { runMachineryAndHydroPipeline } = await import('../services/machineryFleetEngine.js');
    const result = await runMachineryAndHydroPipeline(req.body || {});
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erro no dimensionamento de maquinário:', error);
    return res.status(500).json({ success: false, error: error.message || 'Falha no dimensionamento de frota' });
  }
}


