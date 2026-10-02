import { getLeadByIdOrCnpj, getAllLeadsMatchingFilter, getLeadsByIds } from '../services/leadsService.js';
import { generateContextualCopies, generateCampaignCopyPack, calculatePredictiveScore } from '../modules/ai/index.js';

/**
 * Endpoint para geração de Copywriting Contextual via IA
 * POST /api/ai/copywriting/generate
 */
export async function generateAiCopy(req, res) {
  try {
    const { lead_id, filters = {}, segment } = req.body || {};

    if (lead_id) {
      // 1. Geração hiper-personalizada para uma empresa específica
      const lead = getLeadByIdOrCnpj(lead_id);
      if (!lead) {
        return res.status(404).json({ error: 'Empresa não encontrada para geração de copy.' });
      }

      const copyData = generateContextualCopies(lead);
      return res.json({
        success: true,
        type: 'individual_lead',
        data: copyData
      });
    }

    // 2. Geração para campanha / audiência completa baseada nos filtros
    const effectiveFilters = { ...filters };
    if (segment) effectiveFilters.segmento = segment;

    const sampleLeads = getAllLeadsMatchingFilter(effectiveFilters).slice(0, 5);
    const campaignPack = generateCampaignCopyPack(effectiveFilters, sampleLeads);

    res.json({
      success: true,
      type: 'campaign_pack',
      data: campaignPack
    });
  } catch (error) {
    console.error('Erro na geração de copy com IA:', error);
    res.status(500).json({ error: error.message || 'Falha ao gerar copy com Inteligência Artificial' });
  }
}

/**
 * Endpoint para cálculo do Score Preditivo de Conversão de uma empresa
 * GET /api/ai/predictive-score/:id
 */
export function getLeadPredictiveScore(req, res) {
  try {
    const { id } = req.params;
    const lead = getLeadByIdOrCnpj(id);
    if (!lead) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    const scoreData = calculatePredictiveScore(lead);
    res.json({
      success: true,
      data: scoreData
    });
  } catch (error) {
    console.error('Erro ao calcular score preditivo:', error);
    res.status(500).json({ error: error.message || 'Falha ao calcular score preditivo' });
  }
}

/**
 * Endpoint para cálculo do Score Preditivo em lote
 * POST /api/ai/predictive-score/batch
 */
export function getBatchPredictiveScores(req, res) {
  try {
    const { lead_ids, filters } = req.body || {};

    let leads = [];
    if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      leads = getLeadsByIds(lead_ids);
    } else {
      leads = getAllLeadsMatchingFilter(filters || {});
    }

    const scores = leads.map(l => {
      const detailed = getLeadByIdOrCnpj(l.id) || l;
      return calculatePredictiveScore(detailed);
    });

    res.json({
      success: true,
      total: scores.length,
      data: scores
    });
  } catch (error) {
    console.error('Erro no cálculo preditivo em lote:', error);
    res.status(500).json({ error: error.message || 'Falha ao calcular scores em lote' });
  }
}
