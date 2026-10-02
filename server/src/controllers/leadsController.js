import { queryLeads, getLocationsData, getLeadByIdOrCnpj, updateLeadAudit, updateLeadCommercialFeedback, applyDiscoveredAddressToLead, createManualLead, createRuralPropertyLead } from '../services/leadsService.js';
import { getEconomicGroupDossier } from '../modules/intelligence/index.js';
import { resolveRealAddress } from '../services/addressResolverService.js';
import { getTenantFromRequest } from '../middleware/authMiddleware.js';

export function filterLeads(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const filters = { ...(req.query || {}), ...(req.body || {}), tenant_id: tenantId };
    const result = queryLeads(filters);
    res.json(result);
  } catch (error) {
    console.error('Erro ao filtrar leads:', error);
    res.status(500).json({ error: 'Falha ao executar filtros de leads' });
  }
}

export function getLocations(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const locations = getLocationsData(tenantId);
    res.json(locations);
  } catch (error) {
    console.error('Erro ao buscar localizações:', error);
    res.status(500).json({ error: 'Falha ao buscar localizações' });
  }
}

export function getLeadDetails(req, res) {
  try {
    const { id } = req.params;
    const tenantId = getTenantFromRequest(req);
    const lead = getLeadByIdOrCnpj(id, tenantId);
    if (!lead) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('Erro ao buscar detalhes da empresa:', error);
    res.status(500).json({ error: 'Falha ao buscar detalhes da empresa' });
  }
}

export function auditLead(req, res) {
  try {
    const { id } = req.params;
    const { audit_status, operator } = req.body || {};
    const updatedLead = updateLeadAudit(id, audit_status, operator);
    if (!updatedLead) {
      return res.status(404).json({ error: 'Empresa não encontrada para auditoria' });
    }
    res.json({
      success: true,
      message: 'Auditoria de campo registrada com sucesso',
      data: updatedLead
    });
  } catch (error) {
    console.error('Erro ao auditar empresa:', error);
    res.status(500).json({ error: 'Falha ao registrar auditoria de campo' });
  }
}

export function updateLeadFeedbackController(req, res) {
  try {
    const { id } = req.params;
    const feedbackData = req.body || {};
    const operator = req.body?.operator || req.user?.nome || 'VENDEDOR_LOCAL';

    const updatedLead = updateLeadCommercialFeedback(id, feedbackData, operator);
    if (!updatedLead) {
      return res.status(404).json({ error: 'Lead ou produtor não encontrado para registrar feedback' });
    }
    res.json({
      success: true,
      message: 'Feedback comercial e refinamento de dados gravados com sucesso',
      data: updatedLead
    });
  } catch (error) {
    console.error('Erro ao registrar feedback comercial:', error);
    res.status(500).json({ error: error.message || 'Falha ao registrar feedback comercial' });
  }
}

/**
 * FASE 22: Rastreia e descobre o endereço comercial operacional real sem persistir
 * POST /api/leads/:id/discover-address
 */
export async function discoverLeadAddress(req, res) {
  try {
    const { id } = req.params;
    const lead = getLeadByIdOrCnpj(id);
    if (!lead) {
      return res.status(404).json({ error: 'Empresa não encontrada para descoberta de endereço' });
    }

    const discoveryResult = await resolveRealAddress(lead);
    res.json(discoveryResult);
  } catch (error) {
    console.error('Erro ao descobrir endereço operacional do lead:', error);
    res.status(500).json({ error: 'Falha ao processar descoberta de endereço operacional' });
  }
}

/**
 * FASE 22: Aplica e consolida o endereço operacional reconciliado
 * POST /api/leads/:id/apply-discovered-address
 */
export async function applyDiscoveredLeadAddress(req, res) {
  try {
    const { id } = req.params;
    const { discovery_data, operator = 'OPERADOR_LOCAL' } = req.body || {};

    let dataToApply = discovery_data;
    if (!dataToApply || !dataToApply.lat_operacional) {
      const lead = getLeadByIdOrCnpj(id);
      if (!lead) {
        return res.status(404).json({ error: 'Empresa não encontrada' });
      }
      dataToApply = await resolveRealAddress(lead);
    }

    const updatedLead = applyDiscoveredAddressToLead(id, dataToApply, operator);
    if (!updatedLead) {
      return res.status(404).json({ error: 'Empresa não encontrada para reconciliação' });
    }

    res.json({
      success: true,
      message: 'Endereço operacional reconciliado e consolidado com sucesso',
      data: updatedLead,
      discovery_data: dataToApply
    });
  } catch (error) {
    console.error('Erro ao aplicar endereço operacional reconciliado:', error);
    res.status(500).json({ error: 'Falha ao consolidar reconciliação de endereço' });
  }
}

/**
 * FASE 18: Retorna o dossiê de Grupo Econômico de um lead
 * GET /api/leads/:id/group
 */
export function getLeadEconomicGroup(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID do lead é obrigatório.' });
    }

    // Verifica se o lead existe antes de tentar o dossiê
    const lead = getLeadByIdOrCnpj(id);
    if (!lead) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    const dossier = getEconomicGroupDossier(lead.id);
    res.json(dossier);
  } catch (error) {
    console.error('Erro ao consultar grupo econômico:', error);
    res.status(500).json({ error: 'Falha ao resolver grupo econômico' });
  }
}

/**
 * FASE 47: Endpoint para cadastro de lead manual (Warm-up Audiences)
 * POST /api/leads/manual
 */
export function createManualLeadController(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { nome, empresa, whatsapp, email } = req.body || {};

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ error: 'Nome do proprietário/decisor é obrigatório.' });
    }
    if (!whatsapp || !String(whatsapp).trim()) {
      return res.status(400).json({ error: 'Número de WhatsApp é obrigatório.' });
    }

    const cleanWhatsapp = String(whatsapp).replace(/\D/g, '');
    if (cleanWhatsapp.length < 10) {
      return res.status(400).json({ error: 'Número de WhatsApp inválido. Digite DDD + Número.' });
    }

    const lead = createManualLead({ nome, empresa, whatsapp, email }, tenantId);
    res.status(201).json({
      success: true,
      message: 'Lead manual cadastrado com sucesso',
      data: lead
    });
  } catch (error) {
    console.error('Erro ao cadastrar lead manual:', error);
    res.status(500).json({ error: error.message || 'Falha ao cadastrar lead manual' });
  }
}

/**
 * Endpoint para injetar propriedade rural do SIGEF diretamente como Lead na Tabela Analítica
 * POST /api/leads/rural
 */
export async function createRuralLeadController(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const propData = req.body || {};

    const lead = await createRuralPropertyLead(propData, tenantId);
    res.status(201).json({
      success: true,
      message: 'Propriedade rural injetada com sucesso na Tabela de Leads',
      data: lead
    });
  } catch (error) {
    console.error('Erro ao injetar lead rural:', error);
    res.status(500).json({ error: error.message || 'Falha ao injetar lead rural' });
  }
}

/**
 * Endpoint para injeção em lote de fazendas do Mapa na Tabela Analítica
 * POST /api/leads/rural/bulk
 */
export async function bulkCreateRuralLeadsController(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const properties = Array.isArray(req.body) ? req.body : (req.body?.properties || []);
    const { bulkCreateRuralPropertyLeads } = await import('../services/leadsService.js');
    const result = await bulkCreateRuralPropertyLeads(properties, tenantId);
    return res.status(201).json({
      success: true,
      message: `${result.count} propriedades rurais injetadas com sucesso na Tabela Analítica.`,
      count: result.count,
      data: result.leads
    });
  } catch (error) {
    console.error('Erro ao injetar lote de propriedades rurais:', error);
    return res.status(500).json({ success: false, error: error.message || 'Falha ao injetar propriedades rurais' });
  }
}


