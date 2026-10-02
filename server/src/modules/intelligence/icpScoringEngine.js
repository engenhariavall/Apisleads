/**
 * icpScoringEngine.js
 * Fase 20 - Motor Preditivo de ICP Fit Score 0 a 100
 */

/**
 * Calcula a aderência de cada lead ao Perfil de Cliente Ideal (ICP).
 * Retorna { icp_score: number, icp_tier: string, icp_factors: object }
 */
export function calculateIcpFitScore(lead) {
  let score = 0;
  const factors = {
    porte_capital: 0,
    maturidade: 0,
    vitalidade: 0,
    atratividade_territorial: 0,
    canais: 0
  };

  // 1. Porte & Musculatura Financeira (Peso 25)
  // Capital social e faixa de faturamento presumido normalizados contra a média da vertical
  const capital = parseFloat(lead.capital_social) || 0;
  if (capital >= 5000000) {
    factors.porte_capital = 25;
  } else if (capital >= 1000000) {
    factors.porte_capital = 20;
  } else if (capital >= 200000) {
    factors.porte_capital = 15;
  } else if (capital >= 50000) {
    factors.porte_capital = 10;
  } else {
    factors.porte_capital = 5;
  }
  
  if (lead.porte === 'MEI') {
    factors.porte_capital = 0;
  }

  // 2. Maturidade Cadastral & Longevidade (Peso 15)
  let maturidade = 10; // Base
  if (lead.qsa && Array.isArray(lead.qsa) && lead.qsa.length > 0) {
    const mainSocio = lead.qsa[0];
    if (mainSocio.data_entrada) {
      const year = parseInt(mainSocio.data_entrada.split('/').pop(), 10);
      if (!isNaN(year)) {
        const age = new Date().getFullYear() - year;
        if (age >= 10) maturidade = 15;
        else if (age >= 5) maturidade = 12;
        else if (age >= 3) maturidade = 8;
        else maturidade = 5;
      }
    }
  }
  factors.maturidade = maturidade;

  // 3. Vitalidade & Governança (Peso 25)
  const vitalityScore = lead.vitality?.score || 50;
  factors.vitalidade = Math.round((vitalityScore / 100) * 25);

  // 4. Atratividade Territorial da Praça (Peso 20)
  let ipcScore = 50; // Fallback
  if (lead.city_macro_data && lead.city_macro_data.ipc_score) {
    ipcScore = lead.city_macro_data.ipc_score;
  }
  factors.atratividade_territorial = Math.round((ipcScore / 100) * 20);

  // 5. Presença Digital & Canais (Peso 15)
  let canaisScore = 0;
  if (lead.contact_health?.is_mobile || lead.contact_health?.is_whatsapp_probable) {
    canaisScore += 10;
  } else if (lead.telefone) {
    canaisScore += 5; // Tem telefone fixo
  }
  if (lead.email) {
    canaisScore += 5;
  }
  factors.canais = Math.min(15, canaisScore);

  // Calcula Score Total
  score = factors.porte_capital + factors.maturidade + factors.vitalidade + factors.atratividade_territorial + factors.canais;
  score = Math.min(100, Math.max(0, score));

  // Tiers de Aderência ICP
  let tier = 'TIER D';
  if (score >= 85) tier = 'TIER A';
  else if (score >= 65) tier = 'TIER B';
  else if (score >= 40) tier = 'TIER C';

  return {
    icp_score: score,
    icp_tier: tier,
    icp_factors: factors
  };
}
