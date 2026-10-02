/**
 * crmService.js
 * FASE 56 — PIPELINE DE INTEGRAÇÃO CRM (WEBHOOK GATEWAY)
 *
 * Responsabilidades:
 * 1. Formatar o payload de leads/propriedades rurais para o padrão CRM.
 * 2. Despachar o payload via HTTP POST para CRM_WEBHOOK_URL (variável de ambiente).
 * 3. Retornar feedback estruturado para a rota e para o Copiloto de IA.
 *
 * Plataformas testadas: RD Station, HubSpot, Pipefy, ActiveCampaign, n8n, Make, genérico.
 * Todos os documentos são sanitizados antes do envio.
 * Concorrentes NUNCA são exportados (validação upstream no exportController).
 */

import db from '../config/database.js';
import crypto from 'crypto';
import cognitiveQueueService from './cognitiveQueueService.js';

// ─────────────────────────────────────────────────────────────
// Constantes de Validação
// ─────────────────────────────────────────────────────────────
const BUREAU_NOT_FOUND_PHRASES = [
  'contato não localizado',
  'não localizado',
  'n/a',
  'nao localizado',
  'telefone não localizado'
];

function isValidWhatsApp(raw = '') {
  if (!raw || typeof raw !== 'string') return false;
  const lower = raw.trim().toLowerCase();
  if (BUREAU_NOT_FOUND_PHRASES.some(p => lower.includes(p))) return false;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10;
}

// ─────────────────────────────────────────────────────────────
// Formatação de payload de lead único para o CRM
// ─────────────────────────────────────────────────────────────
function formatLeadForCrm(lead) {
  // Nome: nome_fantasia > razao_social > nome_titular > contato_nome
  const nome = (
    lead.nome_fantasia ||
    lead.razao_social ||
    lead.nome_titular ||
    lead.contato_nome ||
    'Empresa Não Identificada'
  ).trim();

  // Documento: CNPJ ou CPF do titular (sem pontuação como madid_clean)
  const documento_raw = (lead.cnpj || lead.cpf_cnpj_titular || lead.cnpj_raw || '').trim();
  const documento_clean = documento_raw.replace(/\D/g, '');

  // WhatsApp: apenas Bureau-enriquecido
  const rawWa = (
    lead.bureau_whatsapp ||
    lead.whatsapp_enriquecido ||
    lead.whatsapp_validado ||
    lead.whatsapp ||
    ''
  ).trim();
  const whatsapp = isValidWhatsApp(rawWa) ? rawWa : null;

  // Telefone comercial como fallback
  const telefone = (lead.telefone_sanitized || lead.telefone || '').trim() || null;

  // E-mail
  const email = (lead.email || '').trim().toLowerCase() || null;

  // Cultura Principal (Fase 49 / Agro)
  let cultura_principal = null;
  if (lead.dados_agronomicos) {
    try {
      const agro = typeof lead.dados_agronomicos === 'string'
        ? JSON.parse(lead.dados_agronomicos)
        : lead.dados_agronomicos;
      cultura_principal = agro.crop_type || null;
    } catch (_) { /* silencioso */ }
  }
  if (!cultura_principal && lead.vertical_type === 'AGRO') {
    cultura_principal = 'AGRO';
  }

  // Score (prioridade: icp_score > predictive_score > intent_score)
  const score = lead.icp_score || lead.predictive_score || lead.intent_score || 0;

  // Localização
  const municipio = (lead.municipio || '').trim() || null;
  const uf = (lead.uf || '').trim() || null;

  // Propriedade Rural (SIGEF / CAR / Lavoura)
  const nome_imovel = (lead.nome_imovel || '').trim() || null;
  const area_hectares = lead.area_hectares || null;
  const area_lavoura_util_ha = Number(lead.area_lavoura_util_ha) || null;

  // CNAE / Segmento B2B
  const cnae = lead.cnae_principal_codigo || null;
  const vertical = lead.vertical_type || null;

  // Dados de Campo / Frotas / Fase 62, 63 e 65
  const decisor_nome = lead.decisor_nome || lead.contato_nome || null;
  const sefaz_ie = lead.sefaz_ie_pf || lead.inscricao_estadual || null;
  const interesse_maquinario = lead.interesse_maquinario || null;
  const feedback_status = lead.feedback_status || null;

  let rawCleanPhone = (lead.whatsapp || lead.telefone_sanitized || lead.telefone || '').replace(/\D/g, '');
  let waPhone = rawCleanPhone;
  if (waPhone && !waPhone.startsWith('55') && (waPhone.length === 10 || waPhone.length === 11)) {
    waPhone = '55' + waPhone;
  }
  const link_whatsapp_web = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent('Olá, tudo bem? Gostaria de conversar sobre as soluções de máquinas e implementos para sua lavoura.')}` : null;

  let dados_maquinario = null;
  if (lead.dados_maquinario) {
    try {
      dados_maquinario = typeof lead.dados_maquinario === 'string' ? JSON.parse(lead.dados_maquinario) : lead.dados_maquinario;
    } catch (_) {}
  }

  let dados_hidrograficos = null;
  if (lead.dados_hidrograficos) {
    try {
      dados_hidrograficos = typeof lead.dados_hidrograficos === 'string' ? JSON.parse(lead.dados_hidrograficos) : lead.dados_hidrograficos;
    } catch (_) {}
  }

  return {
    nome,
    decisor_nome,
    documento: documento_raw || null,
    madid_clean: documento_clean || null,
    sefaz_ie,
    whatsapp,
    telefone: whatsapp ? null : telefone,
    link_whatsapp_web,
    email,
    municipio,
    uf,
    score,
    cultura_principal,
    nome_imovel,
    area_hectares,
    area_lavoura_util_ha,
    interesse_maquinario,
    feedback_status,
    dados_maquinario,
    dados_hidrograficos,
    cnae,
    vertical,
    origem: lead.origem || 'VERSUS',
    is_rural: !!lead.id_sigef || !!lead.cpf_cnpj_titular || String(lead.origem || '').startsWith('RURAL')
  };
}

// ─────────────────────────────────────────────────────────────
// Busca leads pelo array de IDs (tabela leads + propriedades_rurais)
// ─────────────────────────────────────────────────────────────
function fetchLeadsByIds(ids = [], tenantId = null) {
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(',');
  const params = [...ids];

  // Busca na tabela leads
  let leadsRows = [];
  try {
    let query = `SELECT * FROM leads WHERE id IN (${placeholders}) AND (is_competitor = 0 OR is_competitor IS NULL)`;
    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    leadsRows = db.prepare(query).all(...params) || [];
  } catch (_) { /* tabela pode não existir em certos envs */ }

  // Busca na tabela propriedades_rurais
  let ruralRows = [];
  try {
    const ruralPlaceholders = ids.map(() => '?').join(',');
    const ruralQuery = `SELECT * FROM propriedades_rurais WHERE id IN (${ruralPlaceholders})`;
    ruralRows = db.prepare(ruralQuery).all(...ids) || [];
  } catch (_) { /* silencioso */ }

  return [...leadsRows, ...ruralRows];
}

// ─────────────────────────────────────────────────────────────
// Dispatch HTTP para o webhook do CRM
// ─────────────────────────────────────────────────────────────
async function dispatchToCrm(payload) {
  const webhookUrl = process.env.CRM_WEBHOOK_URL || '';

  if (!webhookUrl || !webhookUrl.startsWith('http')) {
    return {
      success: false,
      configured: false,
      message: 'CRM_WEBHOOK_URL não configurada. Adicione a URL do seu CRM no arquivo .env para ativar o envio automático.'
    };
  }

  const body = JSON.stringify(payload);

  // Usa fetch nativo (Node 18+) — sem dependência externa
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'VERSUS-CRM-Gateway/1.0',
      'X-Source': 'versus-platform'
    },
    body,
    signal: AbortSignal.timeout(12000) // timeout de 12s
  });

  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    throw new Error(`CRM retornou status ${response.status}: ${responseText.slice(0, 200)}`);
  }

  let responseData = null;
  try {
    responseData = JSON.parse(responseText);
  } catch (_) {
    responseData = { raw: responseText.slice(0, 300) };
  }

  return {
    success: true,
    configured: true,
    status: response.status,
    crm_response: responseData
  };
}

// ─────────────────────────────────────────────────────────────
// Serviço Público
// ─────────────────────────────────────────────────────────────
export const crmService = {
  /**
   * Exporta leads/propriedades para o CRM via Webhook.
   *
   * @param {Object} params
   * @param {string[]} [params.lead_ids] IDs de leads ou propriedades rurais
   * @param {Object}  [params.filters]  Filtros genéricos (para exportação total filtrada)
   * @param {string}  [params.tipo_lead] Tipo: 'agro' | 'b2b' | 'all'
   * @param {string}  [params.tenant_id] Tenant do operador
   * @returns {Promise<Object>}
   */
  async exportLeadsToCrm({ lead_ids = [], filters = {}, tipo_lead = 'all', tenant_id = null } = {}) {
    let rawLeads = [];

    if (lead_ids && lead_ids.length > 0) {
      rawLeads = fetchLeadsByIds(lead_ids, tenant_id);
    } else {
      // Exporta todos os leads válidos do tenant (sem concorrentes)
      try {
        let query = `SELECT * FROM leads WHERE (is_competitor = 0 OR is_competitor IS NULL)`;
        const queryParams = [];

        if (tenant_id) {
          query += ' AND tenant_id = ?';
          queryParams.push(tenant_id);
        }

        if (tipo_lead === 'agro') {
          query += ` AND (vertical_type = 'AGRO' OR cnae_principal_codigo LIKE '011%' OR cnae_principal_codigo LIKE '012%')`;
        } else if (tipo_lead === 'b2b') {
          query += ` AND vertical_type != 'AGRO'`;
        }

        query += ' ORDER BY icp_score DESC, created_at DESC LIMIT 500';
        rawLeads = db.prepare(query).all(...queryParams) || [];
      } catch (_) { rawLeads = []; }

      // Complementa com propriedades rurais para tipo 'agro' ou 'all'
      if (tipo_lead === 'agro' || tipo_lead === 'all') {
        try {
          const ruralRows = db.prepare(
            `SELECT * FROM propriedades_rurais ORDER BY intent_score DESC LIMIT 300`
          ).all() || [];
          rawLeads = [...rawLeads, ...ruralRows];
        } catch (_) { /* silencioso */ }
      }
    }

    if (!rawLeads.length) {
      return {
        success: false,
        configured: !!process.env.CRM_WEBHOOK_URL,
        total_processed: 0,
        message: 'Nenhum lead qualificado encontrado para os critérios informados.'
      };
    }

    // Formata cada lead para o padrão CRM
    const formattedLeads = rawLeads.map(formatLeadForCrm);

    // Payload final
    const payload = {
      source: 'VERSUS Platform',
      exported_at: new Date().toISOString(),
      tipo_lead,
      total: formattedLeads.length,
      leads: formattedLeads
    };

    // Disparo para o webhook
    const dispatchResult = await dispatchToCrm(payload);

    return {
      ...dispatchResult,
      total_processed: formattedLeads.length,
      tipo_lead,
      sample: formattedLeads.slice(0, 3) // Amostra para debug/log
    };
  },

  /**
   * Retorna o status da configuração do CRM para o painel de Integrações.
   */
  getStatus() {
    const webhookUrl = process.env.CRM_WEBHOOK_URL || '';
    return {
      crm_webhook_configured: !!(webhookUrl && webhookUrl.startsWith('http')),
      crm_webhook_url_preview: webhookUrl ? webhookUrl.replace(/^(https?:\/\/[^/]{0,20}).*/, '$1...') : null
    };
  },

  /**
   * FASE 66.C: Normaliza qualquer evento vindo de CRMs externos em um score de recompensa numérico (-100 a +100).
   */
  normalizeCrmEvent(eventType = '') {
    const raw = String(eventType || '').toUpperCase().trim();

    if (['DEAL_WON', 'WON', 'SALE_CLOSED', 'FECHADO_GANHO', 'OPORTUNIDADE_GANHA'].includes(raw)) {
      return { standardized: 'DEAL_WON', reward: 100.0, label: 'Venda Fechada / Deal Ganho' };
    }
    if (['MEETING_SCHEDULED', 'DEMO_BOOKED', 'REUNIAO_AGENDADA', 'VISITA_AGENDADA'].includes(raw)) {
      return { standardized: 'MEETING_SCHEDULED', reward: 50.0, label: 'Reunião ou Demonstração Agendada' };
    }
    if (['LEAD_QUALIFIED', 'OPPORTUNITY_CREATED', 'QUALIFICADO', 'PROPOSTA_ENVIADA'].includes(raw)) {
      return { standardized: 'LEAD_QUALIFIED', reward: 40.0, label: 'Lead Qualificado com Oportunidade' };
    }
    if (['CONTACT_CONNECTED', 'WHATSAPP_REPLIED', 'RESPOSTA_WHATSAPP'].includes(raw)) {
      return { standardized: 'CONTACT_CONNECTED', reward: 20.0, label: 'Contato Efetivo / Decisor Respondeu' };
    }
    if (['ZOMBIE_DISCARDED', 'DESCARTE_ZUMBI', 'FANTASMA_CONFIRMADO'].includes(raw)) {
      return { standardized: 'ZOMBIE_DISCARDED', reward: 15.0, label: 'Descarte Confirmado de Empresa Fantasma' };
    }
    if (['DEAL_LOST', 'LOST', 'PERDIDO', 'SEM_INTERESSE', 'UNQUALIFIED'].includes(raw)) {
      return { standardized: 'DEAL_LOST', reward: -30.0, label: 'Negócio Perdido / Sem Interesse' };
    }
    if (['INVALID_CONTACT', 'WRONG_NUMBER', 'TELEFONE_INVALIDO', 'NUMERO_ERRADO'].includes(raw)) {
      return { standardized: 'INVALID_CONTACT', reward: -40.0, label: 'Contato Inexistente / Número Furado' };
    }

    return { standardized: raw || 'CUSTOM_EVENT', reward: 0.0, label: 'Evento Genérico Sem Recompensa' };
  },

  /**
   * Constrói a chave de estado contextual para o agente de RL (LinUCB / Q-Learning)
   */
  buildContextStateKey(entity) {
    if (!entity) return 'global:general';

    if (entity.area_hectares !== undefined || entity.codigo_car || entity.id_sigef) {
      const uf = (entity.uf || 'BR').toUpperCase();
      const ha = Number(entity.area_hectares || entity.area_lavoura_util_ha || 0);
      let porte = 'PEQUENO';
      if (ha > 5000) porte = 'MEGA';
      else if (ha > 2000) porte = 'GRANDE';
      else if (ha > 500) porte = 'MEDIO';

      let cultura = 'SOJA_MILHO';
      if (entity.dados_agronomicos) {
        try {
          const d = typeof entity.dados_agronomicos === 'string' ? JSON.parse(entity.dados_agronomicos) : entity.dados_agronomicos;
          if (d.crop_type) cultura = d.crop_type.toUpperCase();
        } catch (_) {}
      }
      return `agro:${cultura}:${porte}:${uf}`;
    }

    const cnae = (entity.cnae_principal_codigo || '0000').slice(0, 4);
    const uf = (entity.uf || 'BR').toUpperCase();
    const tier = entity.visual_audit_tier || 'STANDARD_COMMERCIAL';
    return `cnae:${cnae}:${uf}:${tier}`;
  },

  /**
   * Ingestão Atômica de Webhook Reverso do CRM & Loop de Recompensa
   */
  async processInboundCrmWebhook({
    event_type,
    cnpj = null,
    lead_id = null,
    deal_value = 0.0,
    source_crm = 'GENERIC_WEBHOOK',
    payload = {},
    tenant_id = 'tenant-root-default'
  }) {
    if (!event_type) {
      throw new Error('O campo event_type é obrigatório para processar o webhook do CRM.');
    }

    const norm = this.normalizeCrmEvent(event_type);
    const cleanDoc = (cnpj || '').replace(/\D/g, '');

    // Busca lead ou propriedade rural no banco
    let entity = null;
    let entityType = 'LEAD';

    if (cleanDoc) {
      entity = db.prepare(`SELECT * FROM leads WHERE cnpj_raw = ? OR cnpj = ? LIMIT 1`).get(cleanDoc, cleanDoc);
      if (!entity) {
        entity = db.prepare(`SELECT * FROM propriedades_rurais WHERE cpf_cnpj_titular = ? LIMIT 1`).get(cleanDoc);
        if (entity) entityType = 'RURAL_PROPERTY';
      }
    }

    if (!entity && lead_id) {
      entity = db.prepare(`SELECT * FROM leads WHERE id = ? LIMIT 1`).get(lead_id);
      if (!entity) {
        entity = db.prepare(`SELECT * FROM propriedades_rurais WHERE id = ? LIMIT 1`).get(lead_id);
        if (entity) entityType = 'RURAL_PROPERTY';
      }
    }

    const stateKey = this.buildContextStateKey(entity);
    const rewardId = `rwd-${crypto.randomUUID()}`;
    const numValue = parseFloat(deal_value) || 0.0;

    // 1. Grava no log de recompensas auditável
    db.prepare(`
      INSERT INTO rl_rewards_log (
        id, tenant_id, lead_id, cnpj, source_crm, event_type,
        deal_value, reward_score, context_state_key, payload_json, processed_by_rl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      rewardId,
      tenant_id,
      entity ? entity.id : lead_id,
      cleanDoc || (entity ? entity.cnpj : null),
      source_crm.toUpperCase(),
      norm.standardized,
      numValue,
      norm.reward,
      stateKey,
      JSON.stringify(payload || {})
    );

    // 2. Ingestão no motor de RL (Atualiza Q-Values e Epsilon Decay)
    const actionKey = norm.standardized.includes('WON') 
      ? 'PRIORITIZE_SIMILAR_DEALS' 
      : (norm.reward > 0 ? 'BOOST_CONTACT' : 'PENALIZE_UNFIT');

    const rlOutcome = cognitiveQueueService.recordReward({
      policy_type: 'ICP_CONVERGENCE',
      state_key: stateKey,
      action: actionKey,
      reward: norm.reward,
      tenant_id
    });

    // 3. Atualiza status comercial da entidade no banco
    if (entity) {
      const nowIso = new Date().toISOString();
      const feedbackStatus = norm.reward > 0 ? 'CONVERTED' : (norm.reward < 0 ? 'DISCARDED' : 'ENGAGED');
      const feedbackNote = `[CRM ${source_crm.toUpperCase()}] ${norm.label} | Valor: R$ ${numValue.toLocaleString('pt-BR')}`;

      if (entityType === 'LEAD') {
        db.prepare(`
          UPDATE leads 
          SET feedback_status = ?, feedback_comercial = ?, updated_at = ?
          WHERE id = ?
        `).run(feedbackStatus, feedbackNote, nowIso, entity.id);
      } else {
        db.prepare(`
          UPDATE propriedades_rurais 
          SET feedback_status = ?, feedback_comercial = ?, updated_at = ?
          WHERE id = ?
        `).run(feedbackStatus, feedbackNote, nowIso, entity.id);
      }
    }

    return {
      success: true,
      reward_id: rewardId,
      event_type: norm.standardized,
      event_label: norm.label,
      reward_score: norm.reward,
      context_state_key: stateKey,
      deal_value: numValue,
      new_q_value: rlOutcome.new_q_value,
      exploration_rate: rlOutcome.exploration_rate,
      matched_entity: entity ? { id: entity.id, type: entityType, name: entity.razao_social || entity.nome_imovel } : null
    };
  },

  /**
   * Retorna histórico de recompensas auditáveis
   */
  listRewardsHistory({ limit = 50, offset = 0, event_type = null, tenant_id = 'tenant-root-default' } = {}) {
    let query = `SELECT * FROM rl_rewards_log WHERE tenant_id = ?`;
    const params = [tenant_id];

    if (event_type) {
      query += ` AND event_type = ?`;
      params.push(event_type.toUpperCase());
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10) || 50, parseInt(offset, 10) || 0);

    const rewards = db.prepare(query).all(...params) || [];

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN reward_score > 0 THEN 1 ELSE 0 END) as positive_rewards,
        SUM(CASE WHEN reward_score < 0 THEN 1 ELSE 0 END) as penalties,
        SUM(deal_value) as total_deal_volume,
        AVG(reward_score) as avg_reward
      FROM rl_rewards_log
      WHERE tenant_id = ?
    `).get(tenant_id);

    return {
      total: rewards.length,
      stats: stats || {},
      rewards
    };
  }
};

export default crmService;
