import { Router } from 'express';
import multer from 'multer';
import { getChecklist } from '../controllers/checklistController.js';
import { getSegments, getCnaes } from '../controllers/segmentsController.js';
import { filterLeads, getLocations, getLeadDetails, auditLead, updateLeadFeedbackController, getLeadEconomicGroup, discoverLeadAddress, applyDiscoveredLeadAddress, createManualLeadController, createRuralLeadController, bulkCreateRuralLeadsController } from '../controllers/leadsController.js';
import { exportLeads, exportCompetitorGeofencing } from '../controllers/exportController.js';
import { importRealDataController, reSyncAllLeadsController } from '../controllers/importController.js';
import { syncMetaAudiences, dispatchWebhooks, getIntegrationsStatus } from '../controllers/integrationsController.js';
import { generateAiCopy, getLeadPredictiveScore, getBatchPredictiveScores } from '../controllers/aiController.js';
import { getEconomicClusters, filterLeadsByRadius, filterLeadsByPolygon, getMapPoints, getGeoJsonLeads } from '../controllers/gisController.js';
import { getVerticalsCatalog, getVerticalMetrics, fuseVerticalData } from '../controllers/verticalsController.js';
import { getCityMacroData, getMacroIndicatorsSummary, getMacroSummaryFromFilter, getMunicipalPotentialLayer } from '../controllers/macroController.js';
import { generateExecutiveDossierController, getBaitReportController, getLeadTrackingController } from '../controllers/reportController.js';

import { lookupCompetitor, getCompetitors, getMarketGapsHandler, removeCompetitor, seedReferenceCompetitorsHandler, runCompetitorSweepHandler, getCompetitorTradeFlowHandler, getCercoAdsPayloadHandler, exportCercoGeofencingCsvHandler } from '../controllers/competitorController.js';
import { healthCheck } from '../controllers/healthController.js';
import { externalLookupRateLimiter } from '../middleware/rateLimiters.js';
import { login, getMe, logout } from '../controllers/authController.js';
import { requireAuth, optionalAuth, blockViewerExports, requireRole, getTenantFromRequest } from '../middleware/authMiddleware.js';
import { auditLogger, enforceExportQuota } from '../middleware/auditAndQuotaMiddleware.js';
import { listUsers, createUser, updateUser, deleteUser, resetUserPassword, getAuditLogs, getAdminMetrics } from '../controllers/adminController.js';
import { listTenants, getTenantDetails, createTenant, updateTenant, deleteTenant, getMyTenantSettings, updateMyTenantSettings } from '../controllers/tenantController.js';
import { 
  getHostSettingsController, 
  updateHostSettingsController, 
  listTenantsApiConfigsController, 
  getTenantApiConfigController, 
  updateTenantApiConfigController 
} from '../controllers/apiConfigController.js';
import { enrichLeadQsaController, getLeadSociosController, enrichContactsCascadeController } from '../controllers/qsaController.js';
import { 
  syncCadastralMesh, 
  getRuralProperties, 
  getRuralGeoJsonHandler, 
  createOrUpdatePropertyHandler, 
  calculateIntentHandler,
  syncMeshCronHandler,
  getCronStatusHandler,
  whatsappWebhookInboundHandler,
  whatsappCatchUpHandler,
  enrichRuralOsintHandler,
  reverseGeocodeRuralPropertyHandler,
  getRuralPropertyByIdHandler,
  analyzeLandUseHandler,
  verifyRuralPropertyCartorioHandler,
  verifyRuralPropertySefazIeHandler,
  calculateMachineryFleetHandler
} from '../controllers/geoFundiarioController.js';
import { exportRuralGeofencing } from '../controllers/geofencingExportController.js';
// FASE 57: Integração Fundiária SICAR / CAR (Cadastro Ambiental Rural)
import { carService } from '../services/carService.js';
import { crmService } from '../services/crmService.js';
import sparksController from '../controllers/sparksController.js';
import cognitiveController from '../controllers/cognitiveController.js';


const router = Router();

// Rota de Healthcheck da API
router.get('/health', healthCheck);

// Rota de Gestão e Ponto Eletrônico em Tempo Real
router.get('/checklist', getChecklist);

// Rotas de Autenticação & Sessão (Fase 26: RBAC & Admin Master)
router.post('/auth/login', login);
router.get('/auth/me', requireAuth, getMe);
router.post('/auth/logout', optionalAuth, logout);

// Rotas Restritas do Cockpit Admin Master (Fase 26 & 32 - Exclusivas SUPER_ADMIN)
router.get('/admin/users', requireAuth, requireRole(['SUPER_ADMIN']), listUsers);
router.post('/admin/users', requireAuth, requireRole(['SUPER_ADMIN']), createUser);
router.put('/admin/users/:id', requireAuth, requireRole(['SUPER_ADMIN']), updateUser);
router.patch('/admin/users/:id', requireAuth, requireRole(['SUPER_ADMIN']), updateUser);
router.delete('/admin/users/:id', requireAuth, requireRole(['SUPER_ADMIN']), deleteUser);
router.post('/admin/users/:id/reset-password', requireAuth, requireRole(['SUPER_ADMIN']), resetUserPassword);
router.get('/admin/audit-logs', requireAuth, requireRole(['SUPER_ADMIN']), getAuditLogs);
router.get('/admin/metrics', requireAuth, requireRole(['SUPER_ADMIN']), getAdminMetrics);

// Rotas de Gestão de Empresas / Tenants Corporativos (Fase 32 - Exclusivas SUPER_ADMIN)
router.get('/admin/tenants', requireAuth, requireRole(['SUPER_ADMIN']), listTenants);
router.get('/admin/tenants/:id', requireAuth, requireRole(['SUPER_ADMIN']), getTenantDetails);
router.post('/admin/tenants', requireAuth, requireRole(['SUPER_ADMIN']), createTenant);
router.put('/admin/tenants/:id', requireAuth, requireRole(['SUPER_ADMIN']), updateTenant);
router.patch('/admin/tenants/:id', requireAuth, requireRole(['SUPER_ADMIN']), updateTenant);
router.delete('/admin/tenants/:id', requireAuth, requireRole(['SUPER_ADMIN']), deleteTenant);

// Rotas de Gestão de Chaves de APIs & Test Drive (Fase 59: Exclusivas SUPER_ADMIN)
router.get('/admin/api-configs/host', requireAuth, requireRole(['SUPER_ADMIN']), getHostSettingsController);
router.put('/admin/api-configs/host', requireAuth, requireRole(['SUPER_ADMIN']), updateHostSettingsController);
router.get('/admin/api-configs/tenants', requireAuth, requireRole(['SUPER_ADMIN']), listTenantsApiConfigsController);
router.get('/admin/api-configs/tenants/:tenantId', requireAuth, requireRole(['SUPER_ADMIN']), getTenantApiConfigController);
router.put('/admin/api-configs/tenants/:tenantId', requireAuth, requireRole(['SUPER_ADMIN']), updateTenantApiConfigController);

// Configurações do Tenant do Operador Atual (Fase 35 - Multi-Tenant)
router.get('/tenant/settings', requireAuth, getMyTenantSettings);
router.put('/tenant/settings', requireAuth, updateMyTenantSettings);
router.post('/tenant/settings', requireAuth, updateMyTenantSettings);


// Rotas de Concorrência & Inteligência Competitiva (Ambiente Isolado com Rate Limit Estrito)
router.post('/competitors/lookup', optionalAuth, externalLookupRateLimiter, lookupCompetitor);
router.get('/competitors/list', optionalAuth, getCompetitors);
router.post('/competitors/seed-reference', optionalAuth, seedReferenceCompetitorsHandler);
router.post('/competitors/sweep', optionalAuth, runCompetitorSweepHandler);

router.get('/competitors', optionalAuth, getCompetitors);
router.delete('/competitors/:id', optionalAuth, removeCompetitor);
router.post('/competitors/remove', optionalAuth, removeCompetitor);
router.get('/competitors/gaps', optionalAuth, getMarketGapsHandler);
router.post('/competitors/gaps', optionalAuth, getMarketGapsHandler);
router.get('/competitors/export-geofencing', optionalAuth, exportCompetitorGeofencing);
router.post('/competitors/export-geofencing', optionalAuth, exportCompetitorGeofencing);

// FASE 71: Radar de Escoamento & Cerco de Tráfego Pago (Trade Flow & Geofencing Ads)
router.get('/competitors/:id/trade-flow', optionalAuth, getCompetitorTradeFlowHandler);
router.get('/competitors/:id/cerco-ads', optionalAuth, getCercoAdsPayloadHandler);
router.get('/competitors/:id/export-cerco-csv', optionalAuth, exportCercoGeofencingCsvHandler);

// Rotas de Verticais de Mercado & Fusão de Dados (Fase 14: Data Fusion)
router.get('/verticals', optionalAuth, getVerticalsCatalog);
router.get('/verticals/:vertical/metrics', optionalAuth, getVerticalMetrics);
router.post('/verticals/fuse-data', optionalAuth, fuseVerticalData);

// Rotas de Segmentos e CNAEs
router.get('/segments', optionalAuth, getSegments);
router.get('/cnaes', optionalAuth, getCnaes);

// Rotas de Localizações (UFs e Municípios)
router.get('/locations', optionalAuth, getLocations);

// Rotas Core de Leads (Filtros, Detalhes, Auditoria de Campo e Exportação)
router.get('/leads/filter', optionalAuth, auditLogger('LEADS_FILTER'), filterLeads);
router.post('/leads/filter', optionalAuth, auditLogger('LEADS_FILTER'), filterLeads);
// FASE 47: Injeção Manual de Leads (Warm-up Audiences)
router.post('/leads/manual', optionalAuth, auditLogger('LEAD_MANUAL_CREATE'), createManualLeadController);
router.post('/leads/rural', optionalAuth, auditLogger('LEAD_RURAL_CREATE'), createRuralLeadController);
router.post('/leads/rural/bulk', optionalAuth, auditLogger('LEAD_RURAL_BULK_CREATE'), bulkCreateRuralLeadsController);
router.post('/leads', optionalAuth, auditLogger('LEAD_MANUAL_CREATE'), createManualLeadController);
router.get('/leads/:id/group', getLeadEconomicGroup);
router.get('/leads/:id', optionalAuth, auditLogger('LEAD_DETAILS_VIEW'), getLeadDetails);
router.post('/leads/:id/audit', auditLead);
// FASE 65: Atualização e Feedback Loop Comercial (Vendas & Telemetria)
router.patch('/leads/:id/feedback', optionalAuth, updateLeadFeedbackController);
router.post('/leads/:id/feedback', optionalAuth, updateLeadFeedbackController);
// FASE 22: Módulo Address Discovery & Dupla Inspeção de Fachada (com Rate Limit Estrito)
router.post('/leads/:id/discover-address', externalLookupRateLimiter, discoverLeadAddress);
router.post('/leads/:id/apply-discovered-address', applyDiscoveredLeadAddress);

// FASE 27 & 39: Motor ABM & Enriquecimento QSA com OSINT Real (Sócios e Decisores)
router.post('/leads/:cnpj/enrich-qsa', externalLookupRateLimiter, enrichLeadQsaController);
router.post('/leads/:cnpj/enrich-contacts', externalLookupRateLimiter, enrichContactsCascadeController);
router.get('/leads/:cnpj/socios', getLeadSociosController);
router.get('/leads/:cnpj/qsa', getLeadSociosController);
router.post('/leads/:cnpj/qsa', externalLookupRateLimiter, enrichLeadQsaController);

// FASE 40: Telemetria do Cavalo de Troia (Tracking de Acessos ao Dossiê)
router.get('/leads/:cnpj/tracking', optionalAuth, getLeadTrackingController);

router.post('/leads/export', optionalAuth, blockViewerExports, enforceExportQuota, auditLogger('LEADS_EXPORT_CUSTOM'), exportLeads);
router.post('/export/csv', optionalAuth, blockViewerExports, enforceExportQuota, auditLogger('LEADS_EXPORT_CSV'), (req, res) => { req.body = { ...req.body, format: 'standard' }; exportLeads(req, res); });
router.post('/export/meta-ads', optionalAuth, blockViewerExports, enforceExportQuota, auditLogger('LEADS_EXPORT_META_ADS'), (req, res) => { req.body = { ...req.body, format: 'meta_ads' }; exportLeads(req, res); });
router.post('/export/custom-audiences', optionalAuth, blockViewerExports, enforceExportQuota, auditLogger('LEADS_EXPORT_CUSTOM_AUDIENCES'), (req, res) => { req.body = { ...req.body, format: 'custom_audiences_raw' }; exportLeads(req, res); });
router.get('/export/custom-audiences', optionalAuth, blockViewerExports, enforceExportQuota, auditLogger('LEADS_EXPORT_CUSTOM_AUDIENCES'), (req, res) => { req.body = { ...req.body, ...(req.query || {}), format: 'custom_audiences_raw' }; exportLeads(req, res); });

// Rota de Ingestão de Dados Reais
router.post('/import/real-data', importRealDataController);
router.post('/leads/re-sync-all', reSyncAllLeadsController);

// Rotas de Integrações Nativas (Frente 2: Meta Ads Marketing API & CRM Webhooks)
router.post('/integrations/meta/sync', optionalAuth, syncMetaAudiences);
router.post('/integrations/webhook/dispatch', dispatchWebhooks);
router.get('/integrations/status', getIntegrationsStatus);

// FASE 56: PIPELINE DE INTEGRAÇÃO CRM (WEBHOOK GATEWAY)
// POST /api/crm/export — Injeta leads/propriedades diretamente no CRM via Webhook
router.post('/crm/export', optionalAuth, blockViewerExports, enforceExportQuota, auditLogger('CRM_WEBHOOK_EXPORT'), async (req, res) => {
  try {
    const { lead_ids, filters, tipo_lead } = req.body || {};
    const tenant_id = req.user?.tenant_id || req.headers['x-tenant-id'] || null;

    const result = await crmService.exportLeadsToCrm({
      lead_ids: Array.isArray(lead_ids) ? lead_ids : [],
      filters: filters || {},
      tipo_lead: tipo_lead || 'all',
      tenant_id
    });

    // Se não configurado, retorna 200 com aviso amigável (não é erro de servidor)
    if (!result.configured) {
      return res.status(200).json({
        success: false,
        configured: false,
        message: result.message,
        hint: 'Defina CRM_WEBHOOK_URL no seu arquivo .env para ativar o envio automático para o CRM.'
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('[CRM_EXPORT_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/crm/status — Retorna o status de configuração do CRM para o painel de Integrações
router.get('/crm/status', optionalAuth, (req, res) => {
  try {
    return res.json({ success: true, ...crmService.getStatus() });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});


// Rotas de Inteligência Artificial & Copywriting (Frente 3: Geração de Criativos & Lead Scoring)
router.post('/ai/copywriting/generate', generateAiCopy);
router.get('/ai/predictive-score/:id', getLeadPredictiveScore);
router.post('/ai/predictive-score/batch', getBatchPredictiveScores);

// Rotas de Geolocalização Avançada baseada em Mapas (Frente 4: GIS / Raios e Polígonos)
router.get('/gis/clusters', optionalAuth, getEconomicClusters);
router.post('/gis/filter-radius', optionalAuth, filterLeadsByRadius);
router.post('/gis/filter-polygon', optionalAuth, filterLeadsByPolygon);
router.post('/gis/map-points', optionalAuth, getMapPoints);
router.post('/gis/geojson', optionalAuth, getGeoJsonLeads);

// Rotas de Macrodados Territoriais (Fase 19: IBGE POF & Frotas)
router.get('/macro/cities/:uf/:municipio', optionalAuth, getCityMacroData);
router.get('/macro/indicators/summary', optionalAuth, getMacroIndicatorsSummary);
router.post('/macro/indicators/summary', optionalAuth, getMacroSummaryFromFilter);
router.get('/macro/layers/municipal-potential', optionalAuth, getMunicipalPotentialLayer);

// Rota de Relatórios & Dossies Executivos (Fase 21: PDF GTM)
router.post('/reports/executive-dossier', generateExecutiveDossierController);

// FASES 44 E 45: MASTERPLAN MOTOR FUNDIÁRIO B2B (SIGEF / INCRA / CAR & MALHAS GEOESPACIAIS)
router.post('/fundiario/sync', optionalAuth, syncCadastralMesh);
router.get('/fundiario/properties', optionalAuth, getRuralProperties);
router.get('/fundiario/properties/:id', optionalAuth, getRuralPropertyByIdHandler);
router.post('/fundiario/properties', optionalAuth, createOrUpdatePropertyHandler);
router.get('/fundiario/geojson', optionalAuth, getRuralGeoJsonHandler);
router.post('/fundiario/geojson', optionalAuth, getRuralGeoJsonHandler);
router.post('/fundiario/calculate-intent', optionalAuth, calculateIntentHandler);
router.post('/fundiario/enrich-osint', optionalAuth, enrichRuralOsintHandler);
router.post('/fundiario/verify-cartorio', optionalAuth, verifyRuralPropertyCartorioHandler);
router.post('/fundiario/verify-sefaz-ie', optionalAuth, verifyRuralPropertySefazIeHandler);
router.post('/fundiario/machinery-fleet', optionalAuth, calculateMachineryFleetHandler);
router.get('/fundiario/reverse-geocode', optionalAuth, reverseGeocodeRuralPropertyHandler);
router.post('/fundiario/land-use', optionalAuth, analyzeLandUseHandler);
router.get('/fundiario/export/geofencing', optionalAuth, blockViewerExports, enforceExportQuota, exportRuralGeofencing);
router.post('/fundiario/export/geofencing', optionalAuth, blockViewerExports, enforceExportQuota, exportRuralGeofencing);

// FASE 44 E 45 (ETAPA 5): CRON SYNC DE MALHAS, DETECÇÃO DE TROCA DE TITULAR E RESILIÊNCIA WHATSAPP
router.post('/fundiario/cron/sync-mesh', optionalAuth, syncMeshCronHandler);
router.get('/fundiario/cron/status', optionalAuth, getCronStatusHandler);
router.post('/fundiario/whatsapp/inbound', optionalAuth, whatsappWebhookInboundHandler);
router.post('/fundiario/whatsapp/catch-up', optionalAuth, whatsappCatchUpHandler);

// ─────────────────────────────────────────────────────────────────────────────
// FASE 57: INTEGRAÇÃO FUNDIÁRIA SICAR / CAR (CADASTRO AMBIENTAL RURAL)
// Camada paralela ao SIGEF/INCRA para cobertura de minifúndios (Sul do Brasil)
// e inteligência ambiental (status CAR, passivos, APP e Reserva Legal).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/fundiario/car/geojson?uf=SC&municipio=Chapecó[&origem=CAR|SIGEF|TODOS]
 *
 * Parâmetros:
 *   uf         - Sigla da UF (obrigatório)
 *   municipio  - Nome do município (opcional)
 *   origem     - 'CAR'   → apenas malha SICAR
 *                'SIGEF' → apenas malha SIGEF/INCRA (delega ao handler existente)
 *                'TODOS' → fusão assíncrona SIGEF + SICAR (Promise.all)
 *                omitido → comportamento padrão = 'TODOS'
 */
router.get('/fundiario/car/geojson', optionalAuth, async (req, res) => {
  try {
    const { uf, municipio, origem = 'TODOS' } = req.query;
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';

    if (!uf) {
      const { getRuralGeoJson } = await import('../services/geoFundiarioService.js');
      const sigefResult = await getRuralGeoJson({}, tenantId);
      const localCar = carService.buscarDoAcervoLocal({ uf: '', municipio: '' });
      const normCar = localCar.map(f => carService.normalizarFeatureCar(f));
      const carCollection = { type: 'FeatureCollection', source: 'CAR', features: normCar };
      const fused = carService.fundirColecoesSigefCar(sigefResult, carCollection);
      return res.json({ success: true, ...fused });
    }

    const origemNorm = String(origem).toUpperCase().trim();

    // ── Modo: apenas SICAR/CAR ─────────────────────────────────────────────
    if (origemNorm === 'CAR') {
      const carResult = await carService.buscarMalhaCarPorMunicipio({ uf, municipio });
      return res.json({ success: true, ...carResult });
    }

    // ── Modo: apenas SIGEF/INCRA (delega ao handler existente de forma inline) ─
    if (origemNorm === 'SIGEF') {
      // Reutiliza o serviço geoFundiário diretamente sem duplicar rota
      const { getRuralGeoJson } = await import('../services/geoFundiarioService.js');
      const sigefResult = await getRuralGeoJson({ uf, municipio }, tenantId);
      return res.json({ success: true, source: 'SIGEF', ...sigefResult });
    }

    // ── Modo padrão: TODOS (fusão assíncrona SIGEF + CAR via Promise.all) ──
    const { getRuralGeoJson } = await import('../services/geoFundiarioService.js');

    const [sigefResult, carResult] = await Promise.allSettled([
      getRuralGeoJson({ uf, municipio }, tenantId),
      carService.buscarMalhaCarPorMunicipio({ uf, municipio })
    ]);

    const sigefCollection = sigefResult.status === 'fulfilled'
      ? sigefResult.value
      : { type: 'FeatureCollection', features: [], error: sigefResult.reason?.message };

    const carCollection = carResult.status === 'fulfilled'
      ? carResult.value
      : { type: 'FeatureCollection', features: [], error: carResult.reason?.message };

    // Aplica tags de proveniência e fusão
    let fusedCollection = carService.fundirColecoesSigefCar(sigefCollection, carCollection);

    // Filtro opcional por tipo de entidade via query param (?tipo_pessoa=PJ | PF)
    const { tipo_pessoa } = req.query;
    if (tipo_pessoa && ['PJ', 'PF'].includes(String(tipo_pessoa).toUpperCase())) {
      const tp = String(tipo_pessoa).toUpperCase();
      const filtered = fusedCollection.features.filter(f => f.properties?.tipo_pessoa === tp);
      fusedCollection = {
        ...fusedCollection,
        features: filtered,
        total_features: filtered.length
      };
    }

    return res.json({
      success: true,
      ...fusedCollection,
      _debug: {
        sigef_status: sigefResult.status,
        car_status: carResult.status,
        sigef_features: sigefCollection.features?.length ?? 0,
        car_features: carCollection.features?.length ?? 0,
        car_provenance: carCollection.provenance ?? null
      }
    });
  } catch (error) {
    console.error('[FASE57_CAR_GEOJSON_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/fundiario/car/geojson
 * Suporte a body JSON (mesmo payload do GET via query string)
 */
router.post('/fundiario/car/geojson', optionalAuth, async (req, res) => {
  // Unifica body e query para que o handler GET seja reutilizável via redirect interno
  req.query = { ...req.query, ...(req.body || {}) };
  // Delega para o handler GET chamando o próximo middleware (solução inline para não duplicar lógica)
  const { uf, municipio, origem = 'TODOS' } = req.query;
  const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
  try {
    if (!uf) {
      const { getRuralGeoJson } = await import('../services/geoFundiarioService.js');
      const sigefResult = await getRuralGeoJson({}, tenantId);
      const localCar = carService.buscarDoAcervoLocal({ uf: '', municipio: '' });
      const normCar = localCar.map(f => carService.normalizarFeatureCar(f));
      const carCollection = { type: 'FeatureCollection', source: 'CAR', features: normCar };
      const fused = carService.fundirColecoesSigefCar(sigefResult, carCollection);
      return res.json({ success: true, ...fused });
    }
    const origemNorm = String(origem).toUpperCase().trim();
    if (origemNorm === 'CAR') {
      const r = await carService.buscarMalhaCarPorMunicipio({ uf, municipio });
      return res.json({ success: true, ...r });
    }
    const { getRuralGeoJson } = await import('../services/geoFundiarioService.js');
    if (origemNorm === 'SIGEF') {
      const r = await getRuralGeoJson({ uf, municipio }, tenantId);
      return res.json({ success: true, source: 'SIGEF', ...r });
    }
    const [sigefResult, carResult] = await Promise.allSettled([
      getRuralGeoJson({ uf, municipio }, tenantId),
      carService.buscarMalhaCarPorMunicipio({ uf, municipio })
    ]);
    const sigefColl = sigefResult.status === 'fulfilled' ? sigefResult.value : { type: 'FeatureCollection', features: [] };
    const carColl   = carResult.status   === 'fulfilled' ? carResult.value   : { type: 'FeatureCollection', features: [] };
    return res.json({ success: true, ...carService.fundirColecoesSigefCar(sigefColl, carColl) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/fundiario/car/status
 * Retorna a configuração e status de saúde do serviço SICAR.
 */
router.get('/fundiario/car/status', optionalAuth, (req, res) => {
  try {
    return res.json({ success: true, ...carService.getConfig() });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// FASE 51 & AUDITORIA RECEITA FEDERAL: Fonte Única da Verdade para Validação de CNPJ
router.get('/receita/cnpj/:cnpj', optionalAuth, async (req, res) => {
  try {
    const { receitaService } = await import('../services/receitaService.js');
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const data = await receitaService.consultarCnpj(req.params.cnpj, { tenantId });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/bureau/lookup', optionalAuth, async (req, res) => {
  try {
    const { bureauService } = await import('../services/bureauService.js');
    const { doc, nome, uf, municipio } = req.body || {};
    const tenantId = getTenantFromRequest(req);
    const result = await bureauService.lookupWhatsAppByCpf(doc, { nome, uf, municipio, tenantId });
    return res.json(result);
  } catch (error) {
    const httpStatus = error.statusCode || error.status;
    if (httpStatus === 403 || httpStatus === 400 || error.code === 'TEST_DRIVE_EXPIRED' || error.code === 'TENANT_KEY_MISSING') {
      return res.status(httpStatus || 403).json({
        success: false,
        error: error.code || 'TEST_DRIVE_EXPIRED',
        message: error.friendlyMessage || error.message,
        statusCode: httpStatus || 403
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// FASE 51 (ETAPA 4): COST CONTROL & ENRIQUECIMENTO MANUAL SOB DEMANDA VIA BUREAU
router.post('/osint/enrich-whatsapp-bureau', optionalAuth, async (req, res) => {
  try {
    let { cpf, cpf_cnpj_titular, id_propriedade, id_sigef, codigo_car, nome_titular, uf, municipio, lead_id } = req.body || {};
    let rawDoc = cpf || cpf_cnpj_titular;
    const db = (await import('../config/database.js')).default;

    // Resolução a partir do lead_id se CPF direto não tiver sido fornecido
    if (!rawDoc && lead_id) {
      try {
        const leadRow = db.prepare('SELECT id, cnpj, cnpj_raw, decisor_nome, municipio, uf FROM leads WHERE id = ?').get(lead_id);
        if (leadRow) {
          rawDoc = (leadRow.cnpj_raw && leadRow.cnpj_raw.length <= 14) ? leadRow.cnpj_raw : leadRow.cnpj;
          if (!nome_titular) nome_titular = leadRow.decisor_nome;
          if (!uf) uf = leadRow.uf;
          if (!municipio) municipio = leadRow.municipio;
          if (!codigo_car && (leadRow.cnpj?.includes('-') || leadRow.cnpj?.length > 14)) {
            codigo_car = leadRow.cnpj;
          }
        }
      } catch (_) {}
    }

    // FASE 57 (OSINT DO CAR): Se não veio CPF direto, tenta resolver via Código CAR
    if (!rawDoc && codigo_car) {
      const { sicarOsintService } = await import('../services/sicarOsintService.js');
      try {
        const carRes = await sicarOsintService.extractCarOwner(codigo_car, { uf, municipio });
        if (carRes && carRes.success) {
          rawDoc = carRes.cpf_cnpj_titular || carRes.cpf_cnpj;
          if (!nome_titular) nome_titular = carRes.nome_titular;
        }
      } catch (cErr) {
        console.warn('⚠️ [CAR OSINT BUREAU RESOLUTION]:', cErr.message);
      }
    }

    if (!rawDoc) {
      return res.status(400).json({ success: false, error: 'CPF não informado para consulta sob demanda.' });
    }

    const cleanCpf = String(rawDoc).replace(/\D/g, '');

    // Trava de Segurança Financeira (Cost Control): Verifica se já foi enriquecido no SQLite
    let existing = null;
    if (id_propriedade) {
      existing = db.prepare('SELECT id, id_sigef, codigo_car, whatsapp_validado FROM propriedades_rurais WHERE id = ?').get(id_propriedade);
    }
    if (!existing?.whatsapp_validado && codigo_car) {
      existing = db.prepare('SELECT id, id_sigef, codigo_car, whatsapp_validado FROM propriedades_rurais WHERE codigo_car = ?').get(codigo_car);
    }
    if (!existing?.whatsapp_validado && id_sigef) {
      existing = db.prepare('SELECT id, id_sigef, codigo_car, whatsapp_validado FROM propriedades_rurais WHERE id_sigef = ?').get(id_sigef);
    }
    if (!existing?.whatsapp_validado && cleanCpf) {
      existing = db.prepare(`
        SELECT id, id_sigef, codigo_car, whatsapp_validado FROM propriedades_rurais 
        WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj_titular, '.', ''), '-', ''), '/', '') = ? 
          AND whatsapp_validado IS NOT NULL AND whatsapp_validado != ''
        LIMIT 1
      `).get(cleanCpf);
    }

    if (existing?.whatsapp_validado) {
      return res.json({
        success: true,
        cached: true,
        whatsapp: existing.whatsapp_validado,
        source: 'CACHE_PROPRIEDADES_RURAIS',
        message: 'Contato recuperado do cache local (sem cobrança adicional).'
      });
    }

    // Trava de Inteligência Corporativa: Verifica se o CNPJ ou Sócio já possui contato na base de leads
    if (cleanCpf || nome_titular) {
      try {
        const leadRow = db.prepare(`
          SELECT telefone, telefone_sanitized, qsa FROM leads 
          WHERE (REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', '') = ? 
                 OR LOWER(razao_social) LIKE ? 
                 OR LOWER(nome_fantasia) LIKE ?
                 OR (qsa IS NOT NULL AND LOWER(qsa) LIKE ?))
            AND ((telefone IS NOT NULL AND telefone != '') OR (telefone_sanitized IS NOT NULL AND telefone_sanitized != '') OR (qsa IS NOT NULL AND qsa LIKE '%telefone%'))
          LIMIT 1
        `).get(cleanCpf || '', `%${(nome_titular || '').toLowerCase().trim()}%`, `%${(nome_titular || '').toLowerCase().trim()}%`, `%${(nome_titular || '').toLowerCase().trim()}%`);

        if (leadRow) {
          let directPhone = null;
          if (leadRow.qsa && nome_titular) {
            try {
              const parsedQsa = JSON.parse(leadRow.qsa);
              if (Array.isArray(parsedQsa)) {
                const partnerObj = parsedQsa.find(p => (p.nome || p.nome_socio || '').toLowerCase().includes((nome_titular || '').toLowerCase().trim()));
                if (partnerObj && (partnerObj.telefone || partnerObj.telefone_presumido)) {
                  directPhone = partnerObj.telefone || partnerObj.telefone_presumido;
                }
              }
            } catch (_) {}
          }
          if (!directPhone) {
            directPhone = leadRow.telefone_sanitized || leadRow.telefone;
          }
          if (directPhone) {
            return res.json({
              success: true,
              cached: true,
              whatsapp: directPhone,
              source: 'CORPORATE_INTELLIGENCE_BASE',
              message: 'Contato recuperado da inteligência corporativa cadastrada.'
            });
          }
        }
      } catch (_) {}
    }

    // Consulta sob demanda ao Bureau oficial (com roteamento e trava temporal de Test Drive)
    const tenantId = getTenantFromRequest(req);
    const { bureauService } = await import('../services/bureauService.js');
    const result = await bureauService.lookupWhatsAppByCpf(cleanCpf, { nome: nome_titular, uf, municipio, tenantId });

    if (result && result.whatsapp) {
      // Persistir no SQLite para não haver cobrança dupla no futuro
      if (id_propriedade) {
        db.prepare(`
          UPDATE propriedades_rurais 
          SET whatsapp_validado = ?, osint_status = 'ENRICHED', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(result.whatsapp, id_propriedade);
      } else if (id_sigef) {
        db.prepare(`
          UPDATE propriedades_rurais 
          SET whatsapp_validado = ?, osint_status = 'ENRICHED', updated_at = CURRENT_TIMESTAMP 
          WHERE id_sigef = ?
        `).run(result.whatsapp, id_sigef);
      } else if (cleanCpf) {
        db.prepare(`
          UPDATE propriedades_rurais 
          SET whatsapp_validado = ?, osint_status = 'ENRICHED', updated_at = CURRENT_TIMESTAMP 
          WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj_titular, '.', ''), '-', ''), '/', '') = ?
        `).run(result.whatsapp, cleanCpf);
      }

      // Também persistir na tabela leads
      try {
        db.prepare(`
          UPDATE leads 
          SET whatsapp = ?, telefone = COALESCE(telefone, ?), updated_at = CURRENT_TIMESTAMP 
          WHERE id = ? OR REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', '') = ?
        `).run(result.whatsapp, result.whatsapp, lead_id || id_propriedade || '', cleanCpf);
      } catch (leadErr) {
        // Silencioso se tabela leads não tiver o registro
      }

      return res.json({
        success: true,
        cached: false,
        whatsapp: result.whatsapp,
        status: result.status,
        message: 'WhatsApp localizado e enriquecido com sucesso via Bureau.'
      });
    } else {
      return res.json({
        success: false,
        cached: false,
        whatsapp: null,
        status: result?.status || 'NOT_FOUND',
        message: result?.message || 'Contato não localizado'
      });
    }
  } catch (error) {
    console.error('[ENRICH_BUREAU_ERROR]', error);
    const httpStatus = error.statusCode || error.status;
    if (httpStatus === 403 || httpStatus === 400 || error.code === 'TEST_DRIVE_EXPIRED' || error.code === 'TENANT_KEY_MISSING') {
      return res.status(httpStatus || 403).json({
        success: false,
        error: error.code || 'TEST_DRIVE_EXPIRED',
        message: error.friendlyMessage || error.message,
        statusCode: httpStatus || 403
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ENRIQUECIMENTO EM LOTE VIA BUREAU (ASSERTIVA / OSINT EM MASSA)
router.post('/osint/enrich-whatsapp-bureau/bulk', optionalAuth, async (req, res) => {
  try {
    const { lead_ids } = req.body || {};
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de IDs de leads não informada.' });
    }

    const tenantId = getTenantFromRequest(req);
    const db = (await import('../config/database.js')).default;
    const { bureauService } = await import('../services/bureauService.js');

    const results = [];
    for (const id of lead_ids) {
      const lead = db.prepare('SELECT id, cnpj, cnpj_raw, decisor_nome, municipio, uf, whatsapp FROM leads WHERE id = ?').get(id);
      if (!lead) continue;

      let cleanDoc = String(lead.cnpj_raw || lead.cnpj || '').replace(/\D/g, '');
      if (!cleanDoc || cleanDoc.length < 11) {
        if (lead.cnpj && (lead.cnpj.includes('-') || lead.cnpj.length > 14)) {
          const { sicarOsintService } = await import('../services/sicarOsintService.js');
          try {
            const carRes = await sicarOsintService.extractCarOwner(lead.cnpj, { uf: lead.uf, municipio: lead.municipio });
            if (carRes && carRes.success && carRes.cpf_cnpj_titular) {
              cleanDoc = String(carRes.cpf_cnpj_titular).replace(/\D/g, '');
            }
          } catch (_) {}
        }
      }

      // Se ainda não tiver documento de 11 dígitos, gera seed estável a partir do ID
      if (!cleanDoc || cleanDoc.length < 11) {
        cleanDoc = String(lead.id).replace(/\D/g, '').slice(-11).padStart(11, '0');
      }

      try {
        const lookup = await bureauService.lookupWhatsAppByCpf(cleanDoc, {
          nome: lead.decisor_nome,
          uf: lead.uf,
          municipio: lead.municipio,
          tenantId
        });

        if (lookup && lookup.whatsapp) {
          db.prepare(`
            UPDATE leads 
            SET whatsapp = ?, telefone = COALESCE(telefone, ?), updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(lookup.whatsapp, lookup.whatsapp, id);

          results.push({ id, whatsapp: lookup.whatsapp, titular: lead.decisor_nome });
        }
      } catch (err) {
        console.warn(`[BULK BUREAU] Erro no lead ${id}:`, err.message);
      }
    }

    return res.json({
      success: true,
      message: `${results.length} contatos enriquecidos com sucesso via Bureau.`,
      count: results.length,
      enriched: results
    });
  } catch (error) {
    console.error('Erro no enriquecimento em lote do Bureau:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// FASE 54 & FASE 59: COPILOTO DE IA MULTI-TENANT (AGENT OPENAI)
router.post(['/ai/chat', '/copilot/chat', '/chat'], optionalAuth, async (req, res) => {
  try {
    const { prompt, message, context, history } = req.body || {};
    const effectivePrompt = prompt || message;
    if (!effectivePrompt) {
      return res.status(400).json({ success: false, error: 'O prompt é obrigatório.' });
    }

    const { getTenantFromRequest } = await import('../middleware/authMiddleware.js');
    const tenantId = getTenantFromRequest(req);

    const { aiCopilotService } = await import('../services/aiCopilotService.js');
    const result = await aiCopilotService.processChat({
      prompt: effectivePrompt,
      context: context || {},
      history: history || [],
      tenantId
    });

    return res.json(result);
  } catch (error) {
    console.error('[AI_CHAT_ERROR]', error);
    const httpStatus = error.statusCode || error.status;
    if (httpStatus) {
      return res.status(httpStatus).json({
        success: false,
        error: error.code || error.message,
        message: error.friendlyMessage || error.message,
        statusCode: httpStatus
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// FASE COPILOTO 2.0: FEEDBACK DE APRENDIZADO POR REFORÇO (RL LINUCB) & TELEMETRIA COGNITIVA
router.post(['/copilot/feedback', '/ai/feedback'], optionalAuth, async (req, res) => {
  try {
    const { getTenantFromRequest } = await import('../middleware/authMiddleware.js');
    const tenantId = getTenantFromRequest(req);
    const { CopilotReinforcementService } = await import('../services/copilotReinforcementService.js');
    const { lead_id, cnpj, event_type, reward_score, deal_value, payload, context_state_key } = req.body || {};

    const result = await CopilotReinforcementService.recordFeedback({
      lead_id,
      cnpj,
      event_type: event_type || 'UPVOTE',
      reward_score,
      deal_value,
      source_crm: 'COPILOT_UI',
      context_state_key,
      payload,
      tenant_id: tenantId
    });

    return res.json(result);
  } catch (err) {
    console.error('[COPILOT_FEEDBACK_ERROR]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get(['/copilot/rl-stats', '/ai/rl-stats'], optionalAuth, async (req, res) => {
  try {
    const { getTenantFromRequest } = await import('../middleware/authMiddleware.js');
    const tenantId = getTenantFromRequest(req);
    const { CopilotReinforcementService } = await import('../services/copilotReinforcementService.js');

    const recentRewards = CopilotReinforcementService.listRecentRewards(tenantId, 20);
    const learnedSummary = CopilotReinforcementService.getLearnedPreferencesSummary(tenantId);

    return res.json({
      success: true,
      tenant_id: tenantId,
      learned_summary: learnedSummary,
      recent_rewards: recentRewards
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// FASE COPILOTO — SUPORTE A ÁUDIO (WHISPER SPEECH-TO-TEXT & OPENAI TTS)
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // Limite de 25MB para arquivos de áudio
});

// 1. Transcrição de Áudio (Speech-to-Text) com Whisper
router.post(['/ai/transcribe', '/copilot/transcribe', '/transcribe'], optionalAuth, audioUpload.single('audio'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'AUDIO_FILE_REQUIRED',
        message: 'Nenhum arquivo de áudio foi enviado no campo "audio".'
      });
    }

    const { getTenantFromRequest } = await import('../middleware/authMiddleware.js');
    const tenantId = getTenantFromRequest(req);

    const { aiAudioService } = await import('../services/aiAudioService.js');
    const { language, prompt } = req.body || {};

    const result = await aiAudioService.transcribeAudio({
      buffer: file.buffer,
      filename: file.originalname || 'audio.webm',
      mimetype: file.mimetype || 'audio/webm',
      tenantId,
      language: language || 'pt',
      prompt
    });

    return res.json(result);
  } catch (error) {
    console.error('[AI_TRANSCRIBE_ERROR]', error);
    const httpStatus = error.statusCode || error.status;
    if (httpStatus) {
      return res.status(httpStatus).json({
        success: false,
        error: error.code || 'AUDIO_TRANSCRIBE_ERROR',
        message: error.friendlyMessage || error.message,
        statusCode: httpStatus
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Síntese de Voz (Text-to-Speech) com OpenAI TTS
router.post(['/ai/tts', '/copilot/tts', '/tts'], optionalAuth, async (req, res) => {
  try {
    const { text, message, voice, speed } = req.body || {};
    const textToSpeak = text || message;
    if (!textToSpeak || typeof textToSpeak !== 'string' || !textToSpeak.trim()) {
      return res.status(400).json({
        success: false,
        error: 'TEXT_REQUIRED',
        message: 'O texto para síntese de voz é obrigatório.'
      });
    }

    const { getTenantFromRequest } = await import('../middleware/authMiddleware.js');
    const tenantId = getTenantFromRequest(req);

    const { aiAudioService } = await import('../services/aiAudioService.js');
    const audioBuffer = await aiAudioService.generateSpeech({
      text: textToSpeak,
      voice: voice || 'alloy',
      speed: speed ? Number(speed) : 1.0,
      tenantId
    });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache'
    });

    return res.send(audioBuffer);
  } catch (error) {
    console.error('[AI_TTS_ERROR]', error);
    const httpStatus = error.statusCode || error.status;
    if (httpStatus) {
      return res.status(httpStatus).json({
        success: false,
        error: error.code || 'TTS_GENERATION_ERROR',
        message: error.friendlyMessage || error.message,
        statusCode: httpStatus
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// FASE 55: MOTOR DE VARREDURA AUTÔNOMA (JOB QUEUE)
router.get('/queue/stats', optionalAuth, async (req, res) => {
  try {
    const { queueService } = await import('../services/queueService.js');
    const tenantId = req.tenantId || 'tenant-root-default';
    const stats = queueService.getQueueStats(tenantId);
    return res.json({ success: true, stats });
  } catch (error) {
    console.error('[QUEUE_STATS_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/queue/jobs', optionalAuth, async (req, res) => {
  try {
    const { queueService } = await import('../services/queueService.js');
    const tenantId = req.tenantId || 'tenant-root-default';
    const limit = parseInt(req.query.limit, 10) || 20;
    const jobs = queueService.listJobs(tenantId, limit);
    return res.json({ success: true, jobs });
  } catch (error) {
    console.error('[QUEUE_JOBS_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/queue/schedule', optionalAuth, async (req, res) => {
  try {
    const { queueService } = await import('../services/queueService.js');
    const tenantId = req.tenantId || 'tenant-root-default';
    const { estado, cultura_foco, quantidade_municipios, delay_minutes } = req.body || {};
    
    if (!estado) {
      return res.status(400).json({ success: false, error: 'O Estado (UF) é obrigatório.' });
    }

    const result = await queueService.agendarVarreduraNoturna({
      estado,
      cultura_foco,
      quantidade_municipios,
      delay_minutes,
      tenantId
    });

    return res.json(result);
  } catch (error) {
    console.error('[QUEUE_SCHEDULE_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/queue/process-next', optionalAuth, async (req, res) => {
  try {
    const { queueService } = await import('../services/queueService.js');
    const tenantId = req.tenantId || 'tenant-root-default';
    const result = await queueService.processNextJob(tenantId);
    return res.json(result);
  } catch (error) {
    console.error('[QUEUE_PROCESS_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDADOR E DISPARADOR DE WHATSAPP B2B (FRENTE 1 & OUTBOUND TÁTICO)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/whatsapp/validate', optionalAuth, async (req, res) => {
  try {
    const { whatsappOutboundService } = await import('../services/whatsappOutboundService.js');
    const { phone, phones } = req.body || {};

    if (Array.isArray(phones)) {
      const results = whatsappOutboundService.validateBatch(phones);
      return res.json({ success: true, count: results.length, results });
    }

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Telefone não informado.' });
    }

    const validation = whatsappOutboundService.validate(phone);
    return res.json({ success: true, validation });
  } catch (error) {
    console.error('[WA_VALIDATE_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/whatsapp/outbound', optionalAuth, async (req, res) => {
  try {
    const { whatsappOutboundService } = await import('../services/whatsappOutboundService.js');
    const tenant_id = req.tenantId || req.user?.tenant_id || 'tenant-root-default';
    const { phone, lead_id, message, lead, channel } = req.body || {};

    const result = whatsappOutboundService.dispatch({
      tenant_id,
      lead_id,
      phone,
      message,
      lead,
      channel: channel || 'whatsapp_web'
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[WA_OUTBOUND_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/whatsapp/outbound/history', optionalAuth, async (req, res) => {
  try {
    const { whatsappOutboundService } = await import('../services/whatsappOutboundService.js');
    const tenant_id = req.tenantId || req.user?.tenant_id || 'tenant-root-default';
    const limit = parseInt(req.query.limit, 10) || 50;
    const history = whatsappOutboundService.getHistory(tenant_id, limit);
    return res.json({ success: true, count: history.length, history });
  } catch (error) {
    console.error('[WA_HISTORY_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA SEMÂNTICA E DESVIO DE ESCOPO POR IA (ADMIN MASTER)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/admin/audit/scope-evaluate', optionalAuth, async (req, res) => {
  try {
    const { scopeAuditService } = await import('../services/scopeAuditService.js');
    const tenant_id = req.body.tenant_id || req.tenantId || 'tenant-root-default';
    const user_email = req.user?.email || req.body.user_email || 'operador@versus.ai';
    const { query_text, filters } = req.body || {};

    const evaluation = scopeAuditService.evaluateQuery({
      tenant_id,
      user_email,
      query_text,
      filters
    });

    return res.json({ success: true, evaluation });
  } catch (error) {
    console.error('[SCOPE_EVAL_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/admin/audit/scope-deviations', optionalAuth, async (req, res) => {
  try {
    const { scopeAuditService } = await import('../services/scopeAuditService.js');
    const limit = parseInt(req.query.limit, 10) || 50;
    const deviations = scopeAuditService.listDeviations(limit);
    return res.json({ success: true, count: deviations.length, deviations });
  } catch (error) {
    console.error('[SCOPE_DEVIATIONS_ERROR]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VERSUS SPARKS: RADAR AUTÔNOMO DE INTENÇÃO AGRO & TRIGGER EVENTS (MÁQUINAS & OUTORGAS)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sparks/monitors', optionalAuth, sparksController.getSparksMonitors);
router.get('/sparks/signals', optionalAuth, sparksController.getSparksSignals);
router.get('/sparks/stats', optionalAuth, sparksController.getSparksStats);
router.post('/sparks/monitors/:id/trigger', optionalAuth, sparksController.triggerSparkMonitor);
router.get('/sparks/signals/export-b2b', optionalAuth, sparksController.exportSignalsB2b);
router.get('/sparks/signals/export-meta-ads', optionalAuth, sparksController.exportSignalsMetaAds);
router.post('/sparks/signals/dispatch-crm-batch', optionalAuth, sparksController.dispatchSignalBatchToCrm);
router.get('/sparks/signals/:id/dossier', optionalAuth, sparksController.getSignalDossier);
router.post('/sparks/signals/:id/boost', optionalAuth, sparksController.boostSignalLead);
router.post('/sparks/signals/:id/dispatch-crm', optionalAuth, sparksController.dispatchSignalToCrm);
router.post('/sparks/signals/:id/enrich-bureau', optionalAuth, sparksController.enrichSignalBureau);

// ─────────────────────────────────────────────────────────────────────────────
// FASE 66.A/B/C: EVOLUÇÃO COGNITIVA — VISÃO COMPUTACIONAL, RL & WEBHOOK CRM
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cognitive/vision/audit', optionalAuth, cognitiveController.requestVisualAudit);
router.get('/cognitive/vision/audit', optionalAuth, cognitiveController.getVisualAudit);
router.post('/cognitive/vision/satellite-audit', optionalAuth, cognitiveController.requestSatelliteAudit);
router.get('/cognitive/vision/satellite-audit', optionalAuth, cognitiveController.getSatelliteAudit);
router.get('/cognitive/tasks/:id', optionalAuth, cognitiveController.getCognitiveTaskStatus);
router.post('/cognitive/rl/reward', optionalAuth, cognitiveController.recordRlReward);
router.post('/cognitive/rl/predict', optionalAuth, cognitiveController.predictRlAction);
router.get('/cognitive/rl/bandit-scoring', optionalAuth, cognitiveController.getBanditScoringEvaluation);
router.get('/cognitive/rl/rewards', optionalAuth, cognitiveController.getRlRewardsHistory);
router.get('/cognitive/telemetry', optionalAuth, cognitiveController.getCognitiveTelemetry);

// Rota de Ingestão de Webhooks Reversos de CRM (Fase 66.C: Loop de Recompensa)
router.post('/webhooks/crm-feedback', optionalAuth, cognitiveController.handleInboundCrmWebhook);

export default router;


