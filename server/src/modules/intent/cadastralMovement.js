/**
 * FRENTE 1: Enriquecimento por Sinais de Intenção (Intent Data)
 * Módulo: Monitoramento de Movimentação Cadastral
 * 
 * Identifica empresas com "momento de compra aquecido" através de:
 * 1. Alterações e aumentos de Capital Social
 * 2. Movimentações recentes de Quadro Societário (novos diretores/sócios)
 * 3. Porte e capacidade de investimento ativo
 * 4. Matriz de classificação de aquecimento: HOT, WARM, MONITOR
 */

export function analyzeCadastralMovement(lead) {
  if (!lead) return null;

  const signals = [];
  let score = 50; // Pontuação base
  const nowYear = new Date().getFullYear();

  // 1. Sinal de Capital Social (Poder de Fogo e Investimento)
  const capital = parseFloat(lead.capital_social) || 0;
  if (capital >= 50000000) { // R$ 50M+ (Enterprise Tier)
    score += 25;
    signals.push({
      type: 'CAPITAL_EXPANSION_ENTERPRISE',
      weight: 'HIGH',
      description: `Grande porte e alta liquidez com capital de ${formatBrl(capital)}.`
    });
  } else if (capital >= 5000000) { // R$ 5M+ (High-Mid Tier)
    score += 20;
    signals.push({
      type: 'CAPITAL_EXPANSION_MID',
      weight: 'HIGH',
      description: `Capacidade robusta de contratação com capital de ${formatBrl(capital)}.`
    });
  } else if (capital >= 500000) { // R$ 500k+
    score += 10;
    signals.push({
      type: 'CAPITAL_QUALIFIED',
      weight: 'MEDIUM',
      description: `Capital social acima da média de PMEs (${formatBrl(capital)}).`
    });
  }

  // 2. Sinal de Quadro Societário / Governança (QSA)
  const qsa = Array.isArray(lead.qsa) ? lead.qsa : [];
  if (qsa.length > 0) {
    score += 10;
    signals.push({
      type: 'QSA_STRUCTURED',
      weight: 'MEDIUM',
      description: `Governança ativa com ${qsa.length} sócio(s)/diretor(es) mapeados.`
    });

    // Detecta diretores recentes ou novas gestões
    const recentPartners = qsa.filter(p => {
      if (!p.data_entrada) return false;
      const year = parseInt(p.data_entrada.split('/')[2] || '0', 10);
      return year >= (nowYear - 3); // Últimos 3 anos
    });

    if (recentPartners.length > 0) {
      score += 15;
      signals.push({
        type: 'NEW_MANAGEMENT_APPOINTED',
        weight: 'HIGH',
        description: `Nova gestão executiva identificada: ${recentPartners.map(p => p.nome).join(', ')}.`
      });
    }
  }

  // 3. Sinal de Perfil Estratégico (Comprador vs Fornecedor)
  if (lead.target_type === 'BUYER') {
    score += 10;
    signals.push({
      type: 'ICP_BUYER_ALIGNED',
      weight: 'HIGH',
      description: 'Classificado como Comprador Final (ICP Primário de Tráfego).'
    });
  }

  // 4. Determinação do Momento de Compra (Stage)
  let stage = 'MONITOR';
  let badgeLabel = '⚪ Neutro / Monitoramento';

  if (score >= 80) {
    stage = 'HOT';
    badgeLabel = '🔥 Momento Aquecido (Alta Intenção)';
  } else if (score >= 65) {
    stage = 'WARM';
    badgeLabel = '⚡ Em Movimentação (Média Intenção)';
  }

  return {
    cnpj: lead.cnpj,
    company_name: lead.nome_fantasia || lead.razao_social,
    intent_score: Math.min(score, 100),
    intent_stage: stage,
    badge_label: badgeLabel,
    signals_count: signals.length,
    signals,
    evaluated_at: new Date().toISOString()
  };
}

function formatBrl(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}
