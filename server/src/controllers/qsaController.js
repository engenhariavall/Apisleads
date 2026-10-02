import { qsaService } from '../services/qsaService.js';
import { contactEnrichmentService } from '../services/contactEnrichmentService.js';

/**
 * Controller para operações de QSA e inteligência de sócios (Fase 27 - ABM)
 */
export const enrichLeadQsaController = async (req, res) => {
  const { cnpj } = req.params;
  try {
    if (!cnpj) {
      return res.status(400).json({ error: 'CNPJ é obrigatório para enriquecimento de QSA.' });
    }

    // 1. Enriquecimento primário de QSA (BrasilAPI)
    const qsaResult = await qsaService.enrichLeadQsa(cnpj);

    // 2. Enriquecimento em cascata automático de contatos (OSINT emails, telefones, linkedin)
    const cascadeResult = await contactEnrichmentService.enrichContactsCascade(cnpj);

    return res.status(200).json({
      ...qsaResult,
      corporate_domain: cascadeResult.corporate_domain,
      phone_channel: cascadeResult.phone_channel,
      socios: cascadeResult.socios
    });
  } catch (error) {
    console.error(`[QSA Controller] Erro ao enriquecer QSA do CNPJ ${cnpj}:`, error.message);
    const status = error.message.includes('404') ? 404 : (error.message.includes('inválido') ? 400 : 500);
    return res.status(status).json({
      error: error.message || 'Erro interno ao consultar QSA da empresa.'
    });
  }
};

export const enrichContactsCascadeController = async (req, res) => {
  const { cnpj } = req.params;
  try {
    if (!cnpj) {
      return res.status(400).json({ error: 'CNPJ é obrigatório para enriquecimento de contatos.' });
    }

    const result = await contactEnrichmentService.enrichContactsCascade(cnpj);
    return res.status(200).json(result);
  } catch (error) {
    console.error(`[QSA Controller] Erro no enriquecimento em cascata de contatos do CNPJ ${cnpj}:`, error.message);
    const status = error.message.includes('inválido') ? 400 : 500;
    return res.status(status).json({
      error: error.message || 'Erro interno ao enriquecer contatos dos sócios.'
    });
  }
};

export const getLeadSociosController = async (req, res) => {
  const { cnpj } = req.params;
  try {
    if (!cnpj) {
      return res.status(400).json({ error: 'CNPJ é obrigatório.' });
    }

    const cleanCnpj = qsaService.sanitizeCnpj(cnpj);
    const socios = qsaService.getSociosByCnpj(cleanCnpj);

    return res.status(200).json({
      cnpj: cleanCnpj,
      total: socios.length,
      socios
    });
  } catch (error) {
    console.error(`[QSA Controller] Erro ao listar sócios do CNPJ ${cnpj}:`, error.message);
    return res.status(500).json({
      error: 'Erro interno ao recuperar sócios da empresa.'
    });
  }
};
