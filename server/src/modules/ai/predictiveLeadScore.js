/**
 * FRENTE 3: Inteligência Artificial para Geração de Criativos & Copywriting
 * Módulo: Score Preditivo de Conversão (Lead Score B2B Multicritério)
 * 
 * Algoritmo preditivo para pontuar propensão de compra e conversão (0 a 100):
 * - Poder Financeiro (Capital Social e Porte): 35%
 * - Alinhamento com Matriz de ICP (Comprador vs Fornecedor): 25%
 * - Governança e Decisores Mapeados no QSA: 20%
 * - Riqueza, Validação e Saúde dos Canais de Contato: 20%
 * - Bônus por Sinais de Intenção e Movimentação Cadastral: até +10 pts
 */

export function calculatePredictiveScore(lead) {
  if (!lead) return null;

  let financialScore = 0;
  let icpScore = 0;
  let governanceScore = 0;
  let contactScore = 0;
  let intentBonus = 0;

  const keyDrivers = [];

  // 1. Financeiro & Poder de Compra (35 pts max)
  const cap = parseFloat(lead.capital_social) || 0;
  const porte = (lead.porte || '').toUpperCase();

  if (cap >= 50000000) {
    financialScore = 35;
    keyDrivers.push('💰 Capital Social Enterprise (R$ 50M+) - Altíssimo poder de investimento');
  } else if (cap >= 10000000) {
    financialScore = 30;
    keyDrivers.push('💰 Capital Social de Grande Porte (R$ 10M+)');
  } else if (cap >= 1000000) {
    financialScore = 25;
    keyDrivers.push('💰 Capital Social Sólido (R$ 1M a R$ 10M)');
  } else if (cap >= 200000) {
    financialScore = 18;
    keyDrivers.push('💰 Porte Médio Qualificado (R$ 200k+)');
  } else if (cap >= 50000) {
    financialScore = 12;
  } else {
    financialScore = 5;
    if (porte === 'MEI') {
      keyDrivers.push('⚠️ Microempreendedor Individual (MEI) - Baixo ticket médio');
    }
  }

  // 2. Alinhamento com Matriz de ICP (25 pts max)
  if (lead.target_type === 'BUYER') {
    icpScore = 25;
    keyDrivers.push('🎯 Alinhamento Exato de ICP: Perfil Comprador / Usuário Final');
  } else if (lead.target_type === 'SUPPLIER') {
    icpScore = 8;
    keyDrivers.push('🏢 Perfil Fornecedor / Concorrente (Necessita abordagem B2B de parceria)');
  } else {
    icpScore = 15;
  }

  // 3. Governança e Profundidade do QSA (20 pts max)
  const qsa = Array.isArray(lead.qsa) ? lead.qsa : [];
  const hasExecutiveRole = qsa.some(s => {
    const q = (s.qualificacao || '').toUpperCase();
    return q.includes('DIRETOR') || q.includes('PRESIDENTE') || q.includes('ADMINISTRADOR') || q.includes('CEO') || q.includes('CFO');
  });

  if (qsa.length >= 3) {
    governanceScore = 18;
    keyDrivers.push(`👥 Quadro Societário Robusto (${qsa.length} sócios/diretores mapeados)`);
  } else if (qsa.length >= 1) {
    governanceScore = 14;
    keyDrivers.push(`👥 Tomador de Decisão Identificado: ${qsa[0]?.nome || 'Sócio'}`);
  } else {
    governanceScore = 5;
  }

  if (hasExecutiveRole) {
    governanceScore = Math.min(20, governanceScore + 2);
    keyDrivers.push('👔 Cargo Executivo de Nível C / Diretoria Presidencial mapeado');
  }

  // 4. Qualidade e Saúde dos Canais de Contato (20 pts max)
  const phone = lead.telefone || '';
  const email = lead.email || '';
  const contactHealth = lead.contact_health;

  if (contactHealth && contactHealth.is_valid) {
    if (contactHealth.is_whatsapp_capable) {
      contactScore += 14;
      keyDrivers.push('📱 Telefone Celular verificado com alta probabilidade de WhatsApp');
    } else {
      contactScore += 10;
      keyDrivers.push('📞 Linha Fixa Comercial verificada');
    }
  } else if (phone) {
    contactScore += 8;
  }

  if (email && email.includes('@') && !email.includes('naoinformado')) {
    contactScore += 6;
    keyDrivers.push(`✉️ E-mail Comercial Ativo: ${email}`);
  }

  contactScore = Math.min(20, contactScore);

  // 5. Bônus por Sinais de Intenção (Frente 1)
  const intentStage = lead.intent?.intent_stage || 'MONITOR';
  if (intentStage === 'HOT') {
    intentBonus = 10;
    keyDrivers.push('🔥 Sinal de Intenção HOT: Momento de Compra Aquecido');
  } else if (intentStage === 'WARM') {
    intentBonus = 5;
    keyDrivers.push('⚡ Sinal de Intenção WARM: Movimentação recente identificada');
  }

  const rawScore = financialScore + icpScore + governanceScore + contactScore + intentBonus;
  const totalScore = Math.min(100, Math.max(0, rawScore));

  let tier = 'C';
  let tierLabel = 'Bronze / Regular (Nutrição)';
  let recommendedAction = 'Nutrição de médio prazo via conteúdo ou e-mail corporativo';
  let recommendedChannel = 'EMAIL_NURTURING';

  if (totalScore >= 80) {
    tier = 'A+';
    tierLabel = 'Ouro / Hot Lead (Alta Propensão de Fechamento)';
    recommendedAction = 'Abordagem direta via WhatsApp com tomador de decisão + Campanha Meta Ads ABM de Alto Impacto';
    recommendedChannel = 'WHATSAPP_ABM';
  } else if (totalScore >= 65) {
    tier = 'B';
    tierLabel = 'Prata / Qualificado (Média/Alta Propensão)';
    recommendedAction = 'Campanha Meta Ads para geração de leads qualificados e follow-up comercial via SDR';
    recommendedChannel = 'META_ADS_LEAD_GEN';
  }

  return {
    lead_id: lead.id,
    cnpj: lead.cnpj,
    company_name: lead.nome_fantasia || lead.razao_social,
    predictive_score: totalScore,
    tier,
    tier_label: tierLabel,
    conversion_probability: `${Math.round(totalScore * 0.88)}%`,
    recommended_action: recommendedAction,
    recommended_channel: recommendedChannel,
    breakdown: {
      financial: financialScore,
      icp_alignment: icpScore,
      governance_qsa: governanceScore,
      contact_enrichment: contactScore,
      intent_bonus: intentBonus
    },
    key_drivers: keyDrivers,
    calculated_at: new Date().toISOString()
  };
}
