/**
 * FRENTE 1: Enriquecimento por Sinais de Intenção (Intent Data)
 * Ponto de entrada modular unificado
 */

import { analyzeCadastralMovement } from './cadastralMovement.js';
import { validatePhoneChannel } from './phoneValidator.js';

export { analyzeCadastralMovement, validatePhoneChannel };

/**
 * Avaliação integrada de intenção e canais para um lead
 */
export function evaluateLeadIntent(lead) {
  if (!lead) return null;

  const movement = analyzeCadastralMovement(lead);
  const phoneValidation = validatePhoneChannel(lead.telefone);

  // Score combinado ponderado: 70% Movimentação Cadastral + 30% Qualidade do Canal
  const combinedScore = Math.round(
    (movement.intent_score * 0.70) + (phoneValidation.quality_score * 0.30)
  );

  return {
    lead_id: lead.id,
    cnpj: lead.cnpj,
    company_name: lead.nome_fantasia || lead.razao_social,
    intent: movement,
    contact_health: phoneValidation,
    combined_score: combinedScore,
    ready_for_ads: phoneValidation.is_valid && combinedScore >= 60,
    recommendation: combinedScore >= 80 
      ? '🚀 Prioridade Máxima: Inserir imediatamente em campanhas de alta conversão / ABM'
      : (combinedScore >= 60 
          ? '⚡ Qualificado: Recomendado para campanhas de consideração e Custom Audiences'
          : '🔍 Nurturing: Manter em base de monitoramento cadastral')
  };
}
