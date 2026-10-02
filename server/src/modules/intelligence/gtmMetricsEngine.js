/**
 * gtmMetricsEngine.js
 * Fase 20 - Motor de Dimensionamento de Mercado GTM (TAM / SAM / SOM)
 */

/**
 * Calcula o funil de mercado para o recorte geográfico/setorial ativo.
 * Garante relação estrita: TAM >= SAM >= SOM.
 * 
 * @param {Array} filteredLeads - Leads já enriquecidos (com vitality, contact_health, city_macro_data, icp_score, icp_tier)
 * @param {number} totalUniverseCount - Contagem total do universo (sem filtros), para referência de TAM base
 * @returns {Object} funil { tam, sam, som, distribution }
 */
export function calculateGtmMarketFunnel(filteredLeads = [], totalUniverseCount = 0) {
  if (!Array.isArray(filteredLeads) || filteredLeads.length === 0) {
    return _emptyFunnel(totalUniverseCount);
  }

  // ─── TAM (Total Addressable Market) ─────────────────────────────────────────
  // Todo o conjunto de leads passados (universo filtrado pelo recorte ativo)
  const tamLeads = filteredLeads;
  const tamCount = tamLeads.length;
  const tamCapital = tamLeads.reduce((acc, l) => acc + (parseFloat(l.capital_social) || 0), 0);

  // ─── SAM (Serviceable Available Market) ─────────────────────────────────────
  // Empresas com capital mínimo viável (>= R$50k), porte diferente de MEI
  // e tipo comprador (BUYER) ou geral (sem restrição de tipo)
  const samLeads = tamLeads.filter(l => {
    const capital = parseFloat(l.capital_social) || 0;
    const isMei = l.porte === 'MEI';
    const hasMinCapital = capital >= 50000;
    return !isMei && hasMinCapital;
  });
  const samCount = samLeads.length;
  const samCapital = samLeads.reduce((acc, l) => acc + (parseFloat(l.capital_social) || 0), 0);

  // ─── SOM (Serviceable Obtainable Market) ────────────────────────────────────
  // Parcela imediatamente acionável: vitalidade ativa + canal de contato validado + praça favorável
  const somLeads = samLeads.filter(l => {
    const isActive = (l.vitality?.vitality_status === 'OPERACAO_ATIVA' || l.vitality?.status === 'OPERACAO_ATIVA') || 
                     ((l.vitality?.vitality_score || l.vitality?.score || 0) >= 70);
    const hasContact = l.contact_health?.is_mobile || l.contact_health?.is_whatsapp_probable || !!l.telefone;
    const ipcScore = l.city_macro_data?.ipc_score;
    const ipcOk = ipcScore !== undefined ? ipcScore >= 40 : true;
    return isActive && hasContact && ipcOk;
  });
  const somCount = somLeads.length;
  const somCapital = somLeads.reduce((acc, l) => acc + (parseFloat(l.capital_social) || 0), 0);

  // ─── Distribuição por ICP Tiers ─────────────────────────────────────────────
  const distribution = {
    TIER_A: 0, TIER_B: 0, TIER_C: 0, TIER_D: 0,
    'TIER A': 0, 'TIER B': 0, 'TIER C': 0, 'TIER D': 0
  };
  filteredLeads.forEach(l => {
    const rawTier = (l.icp_tier || 'TIER D').toUpperCase();
    const tierUnderscore = rawTier.replace(/\s+/g, '_');
    const tierSpace = rawTier.replace(/_/g, ' ');
    if (distribution[tierUnderscore] !== undefined) {
      distribution[tierUnderscore]++;
      distribution[tierSpace]++;
    } else {
      distribution['TIER_D']++;
      distribution['TIER D']++;
    }
  });

  const tierDistributionPct = {
    TIER_A: tamCount > 0 ? Math.round((distribution.TIER_A / tamCount) * 100) : 0,
    TIER_B: tamCount > 0 ? Math.round((distribution.TIER_B / tamCount) * 100) : 0,
    TIER_C: tamCount > 0 ? Math.round((distribution.TIER_C / tamCount) * 100) : 0,
    TIER_D: tamCount > 0 ? Math.round((distribution.TIER_D / tamCount) * 100) : 0,
    'TIER A': tamCount > 0 ? Math.round((distribution.TIER_A / tamCount) * 100) : 0,
    'TIER B': tamCount > 0 ? Math.round((distribution.TIER_B / tamCount) * 100) : 0,
    'TIER C': tamCount > 0 ? Math.round((distribution.TIER_C / tamCount) * 100) : 0,
    'TIER D': tamCount > 0 ? Math.round((distribution.TIER_D / tamCount) * 100) : 0,
  };

  // Conversão do funil (%)
  const samPct = tamCount > 0 ? Number(((samCount / tamCount) * 100).toFixed(1)) : 0;
  const somPct = tamCount > 0 ? Number(((somCount / tamCount) * 100).toFixed(1)) : 0;

  return {
    tam: {
      count: tamCount,
      total_capital: tamCapital,
      total_capital_formatted: _formatCurrency(tamCapital),
      label: 'TAM — Mercado Total Endereçável'
    },
    sam: {
      count: samCount,
      total_capital: samCapital,
      total_capital_formatted: _formatCurrency(samCapital),
      pct_of_tam: samPct,
      label: 'SAM — Mercado Disponível Atingível'
    },
    som: {
      count: somCount,
      total_capital: somCapital,
      total_capital_formatted: _formatCurrency(somCapital),
      pct_of_tam: somPct,
      label: 'SOM — Mercado Imediatamente Acionável'
    },
    tier_distribution: distribution,
    tier_distribution_pct: tierDistributionPct,
    universe_count: totalUniverseCount || tamCount
  };
}

function _emptyFunnel(totalUniverseCount) {
  return {
    tam: { count: 0, total_capital: 0, total_capital_formatted: 'R$ 0', label: 'TAM — Mercado Total Endereçável' },
    sam: { count: 0, total_capital: 0, total_capital_formatted: 'R$ 0', pct_of_tam: 0, label: 'SAM — Mercado Disponível Atingível' },
    som: { count: 0, total_capital: 0, total_capital_formatted: 'R$ 0', pct_of_tam: 0, label: 'SOM — Mercado Imediatamente Acionável' },
    tier_distribution: {
      TIER_A: 0, TIER_B: 0, TIER_C: 0, TIER_D: 0,
      'TIER A': 0, 'TIER B': 0, 'TIER C': 0, 'TIER D': 0
    },
    tier_distribution_pct: {
      TIER_A: 0, TIER_B: 0, TIER_C: 0, TIER_D: 0,
      'TIER A': 0, 'TIER B': 0, 'TIER C': 0, 'TIER D': 0
    },
    universe_count: totalUniverseCount || 0
  };
}

function _formatCurrency(value) {
  if (value === undefined || value === null || isNaN(value)) return 'R$ 0';
  const v = Number(value);
  if (v >= 1e9) {
    const s = (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `R$ ${s} Bi`;
  }
  if (v >= 1e6) {
    const s = (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `R$ ${s} Mi`;
  }
  if (v >= 1e3) {
    const s = (v / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return `R$ ${s} Mil`;
  }
  return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
}
