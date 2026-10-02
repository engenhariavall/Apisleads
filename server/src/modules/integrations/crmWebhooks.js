/**
 * FRENTE 2: Integração Nativa com Plataformas de Anúncios & CRM
 * Módulo: Webhooks para CRMs (HubSpot, Pipedrive, ActiveCampaign, RD Station, etc.)
 */

export class CrmWebhookDispatcher {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 5000;
  }

  /**
   * Dispara webhook com payload formatado para um único lead
   */
  async dispatchLead(targetUrl, lead, platform = 'generic') {
    if (!targetUrl) throw new Error('URL de Webhook não configurada');

    const payload = this.formatPayload(lead, platform);

    // Se for URL de simulação ou teste
    if (targetUrl.includes('example.com') || targetUrl.includes('mock') || targetUrl.startsWith('test_')) {
      return {
        success: true,
        simulated: true,
        company: lead.nome_fantasia || lead.razao_social,
        cnpj: lead.cnpj,
        target_url: targetUrl,
        platform,
        dispatched_at: new Date().toISOString()
      };
    }

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'API-Leads-Engine/3.0',
          'X-Event-Type': 'lead.qualified'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      return {
        success: response.ok,
        status_code: response.status,
        company: lead.nome_fantasia || lead.razao_social,
        cnpj: lead.cnpj,
        target_url: targetUrl,
        platform,
        dispatched_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        company: lead.nome_fantasia || lead.razao_social,
        cnpj: lead.cnpj,
        target_url: targetUrl,
        platform
      };
    }
  }

  /**
   * Dispara lote de leads para o Webhook com controle de concorrência
   */
  async dispatchBatch(targetUrl, leads, platform = 'generic') {
    if (!targetUrl) throw new Error('URL de Webhook não configurada');
    if (!Array.isArray(leads) || leads.length === 0) {
      throw new Error('Nenhum lead fornecido para envio via Webhook');
    }

    const isMock = targetUrl.includes('example.com') || targetUrl.includes('mock') || targetUrl.startsWith('test_');
    if (isMock) {
      return {
        success: true,
        simulated: true,
        total_leads: leads.length,
        successful_dispatches: leads.length,
        failed_dispatches: 0,
        target_url: targetUrl,
        platform,
        dispatched_at: new Date().toISOString(),
        message: `⚡ Webhook Simulado: ${leads.length} leads preparados e disparados para ${platform.toUpperCase()}!`
      };
    }

    const results = [];
    const batchSize = 5;
    for (let i = 0; i < leads.length; i += batchSize) {
      const slice = leads.slice(i, i + batchSize);
      const batchPromises = slice.map(lead => this.dispatchLead(targetUrl, lead, platform));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successes = results.filter(r => r.success).length;

    return {
      success: successes > 0,
      total_leads: leads.length,
      successful_dispatches: successes,
      failed_dispatches: leads.length - successes,
      target_url: targetUrl,
      platform,
      dispatched_at: new Date().toISOString(),
      message: `${successes} de ${leads.length} leads entregues com sucesso para ${platform.toUpperCase()}!`
    };
  }

  formatPayload(lead, platform) {
    const base = {
      cnpj: lead.cnpj,
      company_name: lead.nome_fantasia || lead.razao_social,
      legal_name: lead.razao_social,
      contact: {
        phone: lead.telefone,
        email: lead.email
      },
      address: {
        city: lead.municipio,
        state: lead.uf,
        zip: lead.cep
      },
      segment: {
        cnae: lead.cnae_principal_codigo,
        activity: lead.cnae_principal_descricao,
        target_type: lead.target_type
      },
      financial: {
        capital_social: lead.capital_social,
        porte: lead.porte
      },
      intent_data: lead.intent ? {
        stage: lead.intent.intent_stage,
        score: lead.intent.intent_score
      } : null
    };

    if (platform === 'pipedrive') {
      return {
        title: `Lead B2B: ${base.company_name}`,
        org_name: base.company_name,
        email: base.contact.email,
        phone: base.contact.phone,
        custom_fields: { ...base }
      };
    }

    if (platform === 'hubspot') {
      return {
        properties: {
          company: base.company_name,
          phone: base.contact.phone,
          email: base.contact.email,
          city: base.address.city,
          state: base.address.state,
          annualrevenue: base.financial.capital_social
        }
      };
    }

    if (platform === 'rdstation') {
      return {
        event_type: 'CONVERSION',
        event_family: 'CDP',
        payload: {
          conversion_identifier: 'api-leads-engine',
          name: base.company_name,
          email: base.contact.email,
          mobile_phone: base.contact.phone,
          company_name: base.legal_name,
          state: base.address.state,
          city: base.address.city,
          cf_capital_social: base.financial.capital_social,
          cf_intent_stage: base.intent_data?.stage || 'MONITOR'
        }
      };
    }

    return base;
  }
}
