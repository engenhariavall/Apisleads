/**
 * server/src/services/copilotReinforcementService.js
 * 
 * SERVIÇO DE APRENDIZADO POR REFORÇO (RL) & RETROALIMENTAÇÃO DO COPILOTO VERSUS 2.0
 * 
 * Conecta o feedback do operador (Upvote, Downvote, Correção) e eventos de conversão
 * de negócios no CRM (DEAL_WON, DEAL_LOST) com a tabela `rl_rewards_log` e o motor
 * de políticas cognitivas LinUCB (`cognitive_rl_states`).
 * 
 * Fornece síntese em tempo real dos padrões vencedores para enriquecer o System Prompt
 * do Copiloto, tornando o agente mais assertivo a cada interação.
 */

import crypto from 'crypto';
import db from '../config/database.js';
import cognitiveQueueService from './cognitiveQueueService.js';
import BanditScoringService from './banditScoringService.js';

export const CopilotReinforcementService = {
  /**
   * Registra um evento de recompensa / feedback
   * 
   * @param {Object} params
   * @param {string} [params.lead_id] ID do lead ou da propriedade
   * @param {string} [params.cnpj] CNPJ ou CPF associado
   * @param {'DEAL_WON'|'DEAL_LOST'|'UPVOTE'|'DOWNVOTE'|'CORRECTION'} params.event_type Tipo de evento
   * @param {number} [params.reward_score] Pontuação de recompensa (-100 a +100)
   * @param {number} [params.deal_value] Valor financeiro do negócio
   * @param {string} [params.source_crm] Origem do sinal (ex: 'COPILOT_UI', 'HUBSPOT', 'RD_STATION')
   * @param {string} [params.context_state_key] Chave de contexto de estado RL
   * @param {Object} [params.payload] Metadados contextuais adicionais
   * @param {string} [params.tenant_id] Tenant ID
   * @returns {Object} Registro inserido e status da política atualizada
   */
  async recordFeedback({
    lead_id = null,
    cnpj = null,
    event_type = 'UPVOTE',
    reward_score = null,
    deal_value = 0.0,
    source_crm = 'COPILOT_UI',
    context_state_key = null,
    payload = {},
    tenant_id = 'tenant-root-default'
  }) {
    // 1. Determina o reward_score padrão baseado no tipo de evento se não informado
    let score = reward_score;
    if (score === null || score === undefined) {
      switch (event_type) {
        case 'DEAL_WON':
          score = 100.0;
          break;
        case 'DEAL_LOST':
          score = -40.0;
          break;
        case 'UPVOTE':
          score = 50.0;
          break;
        case 'DOWNVOTE':
          score = -50.0;
          break;
        case 'CORRECTION':
          score = -20.0;
          break;
        default:
          score = 10.0;
      }
    }

    // 2. Se a chave de contexto não for passada, tenta derivar do lead/propriedade
    let stateKey = context_state_key;
    if (!stateKey && (lead_id || cnpj)) {
      let entity = null;
      if (lead_id) {
        entity = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id) ||
                 db.prepare('SELECT * FROM propriedades_rurais WHERE id = ? OR id_sigef = ?').get(lead_id, lead_id);
      }
      if (!entity && cnpj) {
        const cleanDoc = String(cnpj).replace(/\D/g, '');
        entity = db.prepare('SELECT * FROM leads WHERE cnpj_raw = ? OR cnpj = ? LIMIT 1').get(cleanDoc, cnpj);
      }
      if (entity) {
        stateKey = BanditScoringService.deriveContextStateKey(entity, {});
      }
    }

    if (!stateKey) {
      stateKey = `copilot:general:${event_type.toLowerCase()}`;
    }

    const logId = `rew-${crypto.randomUUID()}`;
    const payloadStr = JSON.stringify(payload || {});

    // 3. Persiste no banco de dados na tabela rl_rewards_log
    try {
      db.prepare(`
        INSERT INTO rl_rewards_log (
          id, tenant_id, lead_id, cnpj, source_crm,
          event_type, deal_value, reward_score, context_state_key,
          payload_json, processed_by_rl, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      `).run(
        logId,
        tenant_id,
        lead_id,
        cnpj,
        source_crm,
        event_type,
        Number(deal_value) || 0.0,
        Number(score),
        stateKey,
        payloadStr
      );
    } catch (dbErr) {
      console.warn('⚠️ [COPILOT_RL] Falha ao persistir em rl_rewards_log:', dbErr.message);
    }

    // 4. Retroalimenta a política de Q-Learning / LinUCB
    let policyResult = null;
    try {
      const action = score >= 0 ? 'PRIORITIZE_SIMILAR_DEALS' : 'PENALIZE_UNFIT';
      policyResult = await cognitiveQueueService.recordReward({
        policy_type: 'ICP_CONVERGENCE',
        state_key: stateKey,
        action,
        reward: Number(score),
        tenant_id
      });
    } catch (rlErr) {
      console.warn('⚠️ [COPILOT_RL] Falha ao atualizar política cognitiva:', rlErr.message);
    }

    return {
      success: true,
      log_id: logId,
      event_type,
      reward_score: score,
      context_state_key: stateKey,
      policy_updated: Boolean(policyResult),
      policy_result: policyResult
    };
  },

  /**
   * Obtém um resumo tático das preferências e conversões aprendidas pelo modelo
   * para enriquecer dinamicamente o System Prompt do Copiloto VERSUS
   * 
   * @param {string} tenantId ID do tenant
   * @returns {string} Texto condensado com as lições aprendidas
   */
  getLearnedPreferencesSummary(tenantId = 'tenant-root-default') {
    try {
      const recentLogs = db.prepare(`
        SELECT event_type, reward_score, context_state_key, COUNT(*) as qty, AVG(reward_score) as avg_score, MAX(created_at) as last_seen
        FROM rl_rewards_log
        WHERE tenant_id = ? OR tenant_id = 'tenant-root-default'
        GROUP BY context_state_key, event_type
        ORDER BY last_seen DESC, qty DESC
        LIMIT 12
      `).all(tenantId);

      if (!recentLogs || recentLogs.length === 0) {
        return 'Nenhum viés prévio registrado. O agente deve explorar oportunidades de alto score de intenção (HOT > 70 pts) e sinais de investimento ativo (BNDES/Outorgas).';
      }

      const wins = recentLogs.filter(l => l.reward_score > 0);
      const losses = recentLogs.filter(l => l.reward_score < 0);

      let summary = '';
      if (wins.length > 0) {
        const topWins = wins.map(w => `${w.context_state_key} (+${Math.round(w.avg_score)}pts, ${w.qty}x)`).join(', ');
        summary += `• Perfis de Alta Conversão / Fechados com Sucesso: ${topWins}.\n`;
      }
      if (losses.length > 0) {
        const topLosses = losses.map(l => `${l.context_state_key} (${Math.round(l.avg_score)}pts, ${l.qty}x)`).join(', ');
        summary += `• Perfis Penalizados / Rejeitados pelo Operador: ${topLosses}.\n`;
      }

      return summary || 'Políticas de reforço ativas em regime neutro.';
    } catch (e) {
      return 'Políticas de reforço operando em modo padrão.';
    }
  },

  /**
   * Retorna os últimos feedbacks registrados para auditoria
   */
  listRecentRewards(tenantId = 'tenant-root-default', limit = 20) {
    try {
      return db.prepare(`
        SELECT * FROM rl_rewards_log
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(tenantId, limit);
    } catch (e) {
      return [];
    }
  }
};

export default CopilotReinforcementService;
