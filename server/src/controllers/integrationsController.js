import db from '../config/database.js';
import { getLeadsByIds, getAllLeadsMatchingFilter } from '../services/leadsService.js';
import { MetaMarketingClient, CrmWebhookDispatcher } from '../modules/integrations/index.js';
import { getTenantFromRequest } from '../middleware/authMiddleware.js';
import { resolveTenantCredentials, ApiRouterError } from '../services/apiRouterService.js';

const metaClient = new MetaMarketingClient();
const webhookDispatcher = new CrmWebhookDispatcher();

/**
 * Sincronização direta com a Meta Marketing API (Custom Audiences)
 */
export async function syncMetaAudiences(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);

    // 0. Resolução dinâmica de credenciais e verificação inviolável de Test Drive
    let metaCreds;
    try {
      metaCreds = await resolveTenantCredentials(tenantId, 'meta');
    } catch (routerErr) {
      const httpStatus = routerErr.statusCode || routerErr.status;
      if (httpStatus === 403 || httpStatus === 400 || routerErr instanceof ApiRouterError) {
        return res.status(httpStatus || 403).json({
          success: false,
          error: routerErr.code || 'TEST_DRIVE_EXPIRED',
          message: routerErr.friendlyMessage || routerErr.message,
          statusCode: httpStatus || 403,
          service_type: 'meta',
          tenant_id: tenantId
        });
      }
      throw routerErr;
    }

    const { 
      audience_name = `Audience B2B - ${new Date().toISOString().slice(0, 10)}`,
      description = 'Público qualificado via API Leads Engine com SHA-256',
      lead_ids,
      property_ids,
      tipo = 'b2b',
      filters,
      ad_account_id,
      access_token,
      leads: inlineLeads
    } = req.body || {};

    let leads = [];

    if (Array.isArray(inlineLeads) && inlineLeads.length > 0) {
      leads = inlineLeads;
    } else if (tipo === 'agro' || tipo === 'rural' || (Array.isArray(property_ids) && property_ids.length > 0)) {
      const propIds = property_ids || lead_ids || [];
      if (Array.isArray(propIds) && propIds.length > 0) {
        const placeholders = propIds.map(() => '?').join(',');
        leads = db.prepare(`SELECT * FROM propriedades_rurais WHERE id IN (${placeholders})`).all(...propIds);
      } else {
        leads = db.prepare(`SELECT * FROM propriedades_rurais LIMIT 100`).all();
      }
    } else if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      leads = getLeadsByIds(lead_ids);
    } else {
      leads = getAllLeadsMatchingFilter(filters || {});
    }

    if (!leads || leads.length === 0) {
      return res.status(400).json({ error: 'Nenhum lead encontrado para os critérios de sincronização. Selecione ou pesquise registros primeiro.' });
    }

    const customConfig = {};
    customConfig.adAccountId = ad_account_id || metaCreds?.appId || process.env.META_AD_ACCOUNT_ID;
    customConfig.accessToken = access_token || metaCreds?.token || metaCreds?.accessToken || process.env.META_ACCESS_TOKEN;

    // 1. Cria ou valida o Custom Audience
    const audience = await metaClient.createCustomAudience(audience_name, description, customConfig);

    // 2. Injeta e sincroniza a lista de leads com SHA-256
    const syncResult = await metaClient.syncLeadsToAudience(audience.audience_id, leads, customConfig);

    res.json({
      success: true,
      audience_id: audience.audience_id,
      audience_name: audience.name,
      ad_account_id: audience.ad_account_id || customConfig.adAccountId,
      records_synced: syncResult.records_synced || leads.length,
      estimated_match_rate: syncResult.estimated_match_rate || '70% - 85%',
      is_simulated: audience.simulated || false,
      message: syncResult.message,
      synced_at: syncResult.synced_at
    });
  } catch (error) {
    console.error('Erro na sincronização com Meta Marketing API:', error);
    res.status(500).json({ error: error.message || 'Falha na sincronização com Meta Ads' });
  }
}

/**
 * Disparo de Webhooks para CRMs (HubSpot, Pipedrive, RD Station, etc.)
 */
export async function dispatchWebhooks(req, res) {
  try {
    const {
      webhook_url,
      platform = 'generic',
      lead_ids,
      filters
    } = req.body || {};

    const defaultUrls = {
      pipedrive: 'https://api.pipedrive.com/mock/v1/leads',
      hubspot: 'https://api.hubapi.com/mock/v1/leads',
      rdstation: 'https://api.rd.services/mock/v1/lead',
      activecampaign: 'https://api.activecampaign.com/mock/v1/contacts',
      generic: 'https://example.com/api/webhook/leads'
    };

    const targetUrl = webhook_url || process.env.CRM_WEBHOOK_URL || defaultUrls[platform] || defaultUrls.generic;

    let leads = [];
    if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      leads = getLeadsByIds(lead_ids);
    } else {
      leads = getAllLeadsMatchingFilter(filters || {});
    }

    if (leads.length === 0) {
      return res.status(400).json({ error: 'Nenhum lead selecionado para disparo.' });
    }

    const dispatchResult = await webhookDispatcher.dispatchBatch(targetUrl, leads, platform);

    res.json(dispatchResult);
  } catch (error) {
    console.error('Erro no disparo de Webhooks para CRM:', error);
    res.status(500).json({ error: error.message || 'Falha ao disparar webhook para CRM' });
  }
}

/**
 * Status das integrações conectadas
 */
export function getIntegrationsStatus(req, res) {
  res.json({
    meta_marketing_api: {
      status: process.env.META_ACCESS_TOKEN ? 'CONNECTED' : 'SANDBOX_READY',
      configured_account: process.env.META_AD_ACCOUNT_ID || 'act_sandbox_default',
      api_version: 'v20.0',
      features: ['CUSTOM_AUDIENCES', 'SHA256_HASHING', 'DIRECT_INJECTION']
    },
    crm_webhooks: {
      status: 'ACTIVE',
      supported_platforms: ['hubspot', 'pipedrive', 'rdstation', 'activecampaign', 'generic'],
      retry_timeout_ms: 5000
    }
  });
}
