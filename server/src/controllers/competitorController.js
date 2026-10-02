/**
 * MÓDULO DE INTELIGÊNCIA COMPETITIVA & SCOUTING DE MERCADO
 * Controller dedicado (competitorController.js)
 */

import { lookupOrRegisterCompetitor, listCompetitors, calculateMarketGaps, deleteCompetitor, seedReferenceCompetitors, runRegionalCompetitorSweep } from '../services/competitorIntelligenceService.js';
import { getTenantFromRequest } from '../middleware/authMiddleware.js';

export async function lookupCompetitor(req, res) {
  try {
    const { cnpj, manual_data } = req.body || {};
    if (!cnpj) {
      return res.status(400).json({ error: 'CNPJ é obrigatório para consulta de concorrente.' });
    }

    const tenantId = getTenantFromRequest(req);
    const competitor = await lookupOrRegisterCompetitor(cnpj, manual_data || {}, tenantId);
    res.json({
      success: true,
      data: competitor
    });
  } catch (err) {
    console.error('Erro ao consultar concorrente:', err);
    res.status(400).json({
      success: false,
      error: err.message || 'Falha ao processar análise tática de concorrente.'
    });
  }
}

export function getCompetitors(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const competitors = listCompetitors(tenantId);
    res.json({
      success: true,
      total_count: competitors.length,
      data: competitors
    });
  } catch (err) {
    console.error('Erro ao listar concorrentes:', err);
    res.status(500).json({
      success: false,
      error: 'Falha ao recuperar base de inteligência competitiva.'
    });
  }
}

export function getMarketGapsHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const competitorId = req.query?.competitor_id || req.body?.competitor_id || null;
    const bufferKm = parseFloat(req.query?.buffer_km || req.body?.buffer_km || 50);

    const gaps = calculateMarketGaps({
      competitor_id: competitorId,
      buffer_km: bufferKm,
      tenant_id: tenantId
    });

    let selectedCompetitor = null;
    if (competitorId) {
      // Busca metadados da empresa selecionada no banco
      import('../config/database.js').then(async ({ default: db }) => {
        const row = db.prepare('SELECT id, razao_social, nome_fantasia, cnpj, uf, municipio, latitude, longitude, endereco_operacional FROM leads WHERE id = ? AND (tenant_id = ? OR tenant_id = \'tenant-root-default\')').get(competitorId, tenantId);
        if (row) {
          const { GeoSpatialEngine } = await import('../modules/gis/index.js');
          const coords = GeoSpatialEngine.resolveCoordinates(row);
          selectedCompetitor = {
            ...row,
            latitude: row.latitude || coords.lat,
            longitude: row.longitude || coords.lng
          };
        } else {
          selectedCompetitor = null;
        }

        res.json({
          success: true,
          mode: competitorId ? 'SINGLE_COMPETITOR_RELATIVE' : 'AGGREGATED_NETWORK',
          competitor_id: competitorId,
          selected_competitor: selectedCompetitor,
          total_gaps: gaps.length,
          buffer_km: bufferKm,
          data: gaps
        });
      });
      return;
    }

    res.json({
      success: true,
      mode: 'AGGREGATED_NETWORK',
      competitor_id: null,
      selected_competitor: null,
      total_gaps: gaps.length,
      buffer_km: bufferKm,
      data: gaps
    });
  } catch (err) {
    console.error('Erro ao listar gaps de mercado:', err);
    res.status(500).json({
      success: false,
      error: 'Falha ao calcular zonas de gap territorial.'
    });
  }
}

export function removeCompetitor(req, res) {
  try {
    const competitorId = req.params.id || req.body.id || req.query.id;
    if (!competitorId) {
      return res.status(400).json({
        success: false,
        error: 'ID do concorrente é obrigatório para exclusão.'
      });
    }

    const tenantId = getTenantFromRequest(req);
    deleteCompetitor(competitorId, tenantId);

    res.json({
      success: true,
      message: 'Concorrente removido com sucesso da base de inteligência competitiva.',
      id: competitorId
    });
  } catch (err) {
    console.error('Erro ao remover concorrente:', err);
    res.status(400).json({
      success: false,
      error: err.message || 'Falha ao remover concorrente.'
    });
  }
}

export function seedReferenceCompetitorsHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const result = seedReferenceCompetitors(tenantId);
    res.json({
      success: true,
      message: `${result.count} concorrentes e referências do agronegócio carregados com sucesso.`,
      ...result
    });
  } catch (err) {
    console.error('Erro ao semear concorrentes de referência:', err);
    res.status(500).json({
      success: false,
      error: 'Falha ao semear concorrentes de referência.'
    });
  }
}

export function runCompetitorSweepHandler(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { uf, segmento, buffer_km } = req.body || {};
    const result = runRegionalCompetitorSweep({
      uf,
      segmento,
      buffer_km,
      tenant_id: tenantId
    });
    res.json({
      success: true,
      message: `Varredura regional concluída: ${result.count_activated} novos concorrentes ativados em ${result.uf}. ${result.total_gaps} zonas de brecha calculadas.`,
      ...result
    });
  } catch (err) {
    console.error('Erro na varredura regional de concorrentes:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Falha ao executar varredura regional de concorrentes.'
    });
  }
}

/**
 * Retorna Raio-X do fluxo de vendas e escoamento do concorrente
 * GET /api/competitors/:id/trade-flow
 */
export async function getCompetitorTradeFlowHandler(req, res) {
  try {
    const competitorId = req.params.id;
    const tenantId = getTenantFromRequest(req);
    const { getCompetitorTradeFlow } = await import('../services/competitorTradeFlowService.js');
    const data = getCompetitorTradeFlow(competitorId, tenantId);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Erro ao recuperar fluxo de vendas do concorrente:', err);
    res.status(404).json({
      success: false,
      error: err.message || 'Falha ao analisar fluxo de vendas do concorrente.'
    });
  }
}

/**
 * Retorna payload completo para ativação do Cerco de Tráfego Pago
 * GET /api/competitors/:id/cerco-ads
 */
export async function getCercoAdsPayloadHandler(req, res) {
  try {
    const competitorId = req.params.id;
    const tenantId = getTenantFromRequest(req);
    const { generateCercoAdsPayload } = await import('../services/competitorTradeFlowService.js');
    const data = generateCercoAdsPayload(competitorId, tenantId);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Erro ao gerar cerco de tráfego pago:', err);
    res.status(400).json({
      success: false,
      error: err.message || 'Falha ao gerar cerco de tráfego pago.'
    });
  }
}

/**
 * Exporta arquivo CSV formatado para importação direta no Gerenciador de Anúncios da Meta (Alfinetes Geofencing)
 * GET /api/competitors/:id/export-cerco-csv
 */
export async function exportCercoGeofencingCsvHandler(req, res) {
  try {
    const competitorId = req.params.id;
    const tenantId = getTenantFromRequest(req);
    const { generateCercoAdsPayload } = await import('../services/competitorTradeFlowService.js');
    const payload = generateCercoAdsPayload(competitorId, tenantId);

    const headers = ['RANKING', 'PRACA_MUNICIPIO', 'UF', 'DISTANCIA_SEDE_KM', 'RAIO_SUGERIDO_KM', 'LATITUDE', 'LONGITUDE', 'META_ADS_PIN_STRING', 'VOLUME_ESTIMADO', 'PRODUTORES_ALVO'];
    const rows = payload.geofencing_destinations.map(d => [
      d.ranking,
      `"${d.praca_municipio}"`,
      d.uf,
      d.distancia_sede_km,
      d.raio_sugerido_km,
      d.latitude,
      d.longitude,
      `"${d.meta_ads_pin_string}"`,
      `"${d.volume_anual_estimado}"`,
      d.produtores_estimados
    ]);

    // Usa ponto e vírgula e BOM UTF-8 (\uFEFF) para divisão perfeita de colunas no Excel brasileiro
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const compNameClean = (payload.competitor.nome_fantasia || payload.competitor.razao_social || 'concorrente').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `cerco_meta_ads_${compNameClean}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Erro ao exportar CSV do cerco:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Falha ao gerar arquivo de cerco.'
    });
  }
}



