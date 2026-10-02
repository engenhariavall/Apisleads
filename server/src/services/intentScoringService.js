/**
 * server/src/services/intentScoringService.js
 * 
 * FASES 44 E 45: MASTERPLAN MOTOR FUNDIÁRIO B2B
 * Serviço de Inteligência de Intenção de Compra Rural (Intent Scoring Engine)
 * 
 * Avalia três eixos críticos:
 * 1. Dor Regulatória: Imóvel 'SEM_GEO' (+30 pts, trigger "Gap Fundiário Detectado")
 * 2. Cruzamento de Expansão: Abertura de nova filial/CNPJ em menos de 12 meses (+40 pts, trigger "Expansão de Operação (< 12 meses)")
 * 3. Cruzamento de Capital: Aumento recente de capital social ou liberação de crédito (+30 pts, trigger "Injeção de Capital/Crédito")
 * 
 * Classificação:
 * - score >= 70: 'HOT'
 * - score >= 30 && score < 70: 'WARM'
 * - score < 30: 'COLD'
 */

import db from '../config/database.js';
import BanditScoringService from './banditScoringService.js';

/**
 * Calcula a pontuação e os gatilhos analíticos de intenção de compra para uma propriedade rural e seu titular.
 * 
 * @param {Object} titularData Dados cadastrais, societários ou fiscais do titular/proprietário
 * @param {Object} propriedadeData Dados do imóvel rural (status_geo, area_hectares, etc.)
 * @returns {{ intent_score: number, intent_classification: 'HOT'|'WARM'|'COLD', intent_triggers: string[] }}
 */
export function calculateRuralIntentScore(titularData = {}, propriedadeData = {}) {
  let score = 0;
  const triggers = [];

  // 1. EIXO DE DOR REGULATÓRIA (Status do Georreferenciamento INCRA/SIGEF)
  const statusGeo = String(propriedadeData.status_geo || '').toUpperCase();
  if (statusGeo === 'SEM_GEO' || statusGeo === 'PENDENTE' || statusGeo === 'IRREGULAR') {
    score += 30;
    triggers.push('Gap Fundiário Detectado');
  }

  // 2. EIXO DE EXPANSÃO DE OPERAÇÃO (< 12 meses)
  // Avalia se o titular abriu filiais recentes, filiais rurais ou registrou nova unidade
  const hasRecentBranch = !!(
    titularData.nova_filial_recente === true ||
    titularData.expansao_recente === true ||
    titularData.filiais_recentes_count > 0 ||
    checkRecentBranchFromDates(titularData.data_abertura_filial, titularData.filiais)
  );

  if (hasRecentBranch) {
    score += 40;
    triggers.push('Expansão de Operação (< 12 meses)');
  }

  // 3. EIXO DE INJEÇÃO DE CAPITAL OU CRÉDITO RURAL
  // Avalia aumentos recentes de capital social, captação ou linhas de investimento ativas
  const hasCapitalInjection = !!(
    titularData.aumento_capital_recente === true ||
    titularData.injecao_capital_credito === true ||
    titularData.credito_rural_aprovado === true ||
    (parseFloat(titularData.capital_social || 0) >= 5000000 && titularData.movimentacao_capital_recente) ||
    checkRecentCapitalIncrease(titularData.historico_capital)
  );

  if (hasCapitalInjection) {
    score += 30;
    triggers.push('Injeção de Capital/Crédito');
  }

  // 4. EIXO DE INTELIGÊNCIA AGRONÔMICA & USO DO SOLO (FASE 50 ETAPA 2)
  // Interliga a cultura identificada pelo Sensoriamento Remoto (Fase 49) à propensão comercial de insumos/maquinário
  let agroObj = propriedadeData.dados_agronomicos || titularData.dados_agronomicos;
  if (typeof agroObj === 'string') {
    try { agroObj = JSON.parse(agroObj); } catch (_) { agroObj = null; }
  }

  const cropType = String(
    agroObj?.crop_type || 
    agroObj?.uso_solo || 
    propriedadeData.crop_type || 
    propriedadeData.uso_solo || 
    titularData.crop_type || 
    ''
  ).trim();

  if (cropType) {
    const cropLower = cropType.toLowerCase();
    if (cropLower.includes('arroz')) {
      score += 40;
      triggers.push('💧 Rizicultura Irrigada Intensiva - Demanda de alta tecnologia em motobombas, nivelamento a laser e fertilizantes.');
    } else if (
      cropLower.includes('soja') || 
      cropLower.includes('algod') || 
      cropLower.includes('grãos') || 
      cropLower.includes('graos')
    ) {
      score += 35;
      triggers.push('🌱 Ciclo de Safra de Grãos (Soja) - Alta propensão para maquinário pesado, defensivos e crédito rural.');
    } else if (cropLower.includes('milho')) {
      score += 32;
      triggers.push('🌽 Cultivo de Milho / Safrinha - Demanda de híbridos de alto rendimento, adubação nitrogenada e colheitadeiras.');
    } else if (cropLower.includes('trigo') || cropLower.includes('cevada') || cropLower.includes('aveia')) {
      score += 28;
      triggers.push('🌾 Safra de Inverno (Trigo/Cevada) - Demanda para dessecação, sementes certificadas e proteção fungicida.');
    } else if (
      cropLower.includes('pastagem') || 
      cropLower.includes('pasto') || 
      cropLower.includes('pecuária') || 
      cropLower.includes('pecuaria') ||
      cropLower.includes('bovino')
    ) {
      score += 20;
      triggers.push('🌿 Manejo de Pastagem Detectado - Potencial para correção de solo, cercamento e insumos veterinários.');
    }
  }

  // 4.1. ESCALA DA PROPRIEDADE (Área em Hectares)
  const areaHa = Number(propriedadeData.area_hectares || propriedadeData.area_ha || propriedadeData.num_area || 0);
  if (areaHa >= 1000) {
    score += 15;
    triggers.push('🚜 Megapropriedade (> 1.000 ha) - Poder de compra elevado para frotas agrícolas e contratos de grande porte.');
  } else if (areaHa >= 400) {
    score += 10;
    triggers.push('📐 Média-Grande Escala (400 - 1.000 ha) - Alta demanda de modernização e eficiência operacional.');
  } else if (areaHa >= 100) {
    score += 5;
    triggers.push('📏 Módulo Rural Estruturado (100 - 400 ha) - Produtor consolidado com alta tecnificação.');
  }

  // 4.2. PORTE ECONÔMICO DO TITULAR / CAPITAL SOCIAL
  const capVal = parseFloat(titularData.capital_social || 0);
  if (capVal >= 100000000) {
    score += 15;
    triggers.push('🏢 Grande Conglomerado Agroindustrial (Capital > R$ 100M) - Decisor corporativo de altíssimo ticket.');
  } else if (capVal >= 25000000) {
    score += 10;
    triggers.push('🏛️ Cooperativa / Empresa Regional de Grande Porte (Capital > R$ 25M) - Estrutura consolidada.');
  } else if (capVal >= 5000000) {
    score += 5;
    triggers.push('💼 Agroempresa com Capital Relevante (> R$ 5M).');
  }

  // 5. EIXO DE INTELIGÊNCIA AMBIENTAL CAR (FASE 57 — ETAPA 4)
  // Avalia a regularidade no Cadastro Ambiental Rural (SICAR) como vetor de "dor" e
  // propensão comercial. Imóveis sem CAR ou com passivos geram as maiores oportunidades
  // para consultorias, escritórios jurídicos, crédito rural e recuperação de habitats.
  const tagFonte          = String(propriedadeData.tag_fonte || '').toUpperCase();
  const statusCar         = String(propriedadeData.status_car || '').toUpperCase();
  const temPassivo        = Boolean(propriedadeData.tem_passivo_ambiental);
  const alertaAmbiental   = String(propriedadeData.alerta_ambiental || '').toUpperCase();
  const codigoCar         = propriedadeData.codigo_car || null;

  // Faixa A — SEM CAR: +40 pts (Urgência máxima de regularização, risco de embargo)
  const semCar = (
    !codigoCar &&
    (tagFonte === 'SIGEF' || tagFonte === '' || !tagFonte) &&
    (alertaAmbiental === 'SEM_CAR_MAPEADO' || alertaAmbiental === 'SEM_CAR' || !codigoCar)
  );

  // Faixa B — Passivo / Pendência: +35 pts (Alta dor B2B — crédito bloqueado)
  const temPendencia = (
    temPassivo ||
    ['PENDENTE', 'SUSPENSO', 'CANCELADO', 'NOTIFICADO', 'IRREGULAR'].includes(statusCar) ||
    alertaAmbiental.includes('PASSIVO') ||
    alertaAmbiental.includes('PENDENTE') ||
    alertaAmbiental.includes('SUSPEN')
  );

  // Faixa C — Conforme/Ativo: +20 pts (Perfil regular elegível para crédito verde, CPR)
  const carAtivo = (
    !semCar &&
    !temPendencia &&
    codigoCar &&
    ['ATIVO', 'VALIDADO', 'REGULAR', 'ACTIVE', 'ATUALIZADO'].includes(statusCar)
  );

  if (semCar) {
    score += 40;
    triggers.push('🛑 Vazio Regulatório Ambiental (Sem CAR) — Risco de embargo e demanda urgente de adequação.');
  } else if (temPendencia) {
    score += 35;
    triggers.push('⚠️ Pendência Ambiental SICAR — Oportunidade de Consultoria Florestal / Regularização PRA.');
  } else if (carAtivo) {
    score += 20;
    triggers.push('🌱 Conformidade Verde (CAR Validado) — Perfil elegível para Financiamento Verde, CPR e Créditos de Carbono.');
  }

  // 6. EIXO DE POTENCIAL ECONÔMICO TERRITORIAL (IBGE POF & IPC)
  const ufNorm = String(propriedadeData.uf || titularData.uf || '').toUpperCase().trim();
  const munNorm = String(propriedadeData.municipio || titularData.municipio || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

  if (ufNorm && munNorm) {
    try {
      const macro = db.prepare(`
        SELECT ipc_score, pib_per_capita, frota_agro_pesados, consumo_anual_familias 
        FROM municipal_indicators 
        WHERE uf = ? AND (municipio = ? OR instr(municipio, ?) > 0)
        LIMIT 1
      `).get(ufNorm, munNorm, munNorm);

      if (macro) {
        if (macro.ipc_score >= 60 || macro.pib_per_capita >= 60000) {
          score += 12;
          triggers.push(`💰 Alto Potencial POF/IPC (${munNorm}/${ufNorm}) — Polo de alto poder de compra para insumos e frotas agrícolas.`);
        } else if (macro.ipc_score >= 35 || macro.pib_per_capita >= 40000) {
          score += 6;
          triggers.push(`📊 Médio Potencial POF/IPC (${munNorm}/${ufNorm}) — Polo agro regional.`);
        }
        if (macro.frota_agro_pesados >= 3500) {
          score += 8;
          triggers.push(`🚜 Alta Mecanização Agrícola (Frota > 3.500 maquinários pesados no IBGE/SENATRAN).`);
        }
      }
    } catch (_) {}
  }

  // 7. EIXO VERSUS SPARKS: SINAIS DE MERCADO & TRIGGER EVENTS (CORE MÁQUINAS & OUTORGAS)
  const sparksSignals = propriedadeData.sparks_signals || titularData.sparks_signals || [];
  if (Array.isArray(sparksSignals) && sparksSignals.length > 0) {
    for (const sig of sparksSignals) {
      const type = String(sig.spark_type || '').toUpperCase();
      if (type === 'CREDITO_BNDES' || type.includes('CREDITO')) {
        score += 40;
        triggers.push(sig.trigger_texto || '💰 Crédito BNDES Finame Liberado — Janela de compra ativa para renovação de frota de colheita/tratores.');
      } else if (type === 'OUTORGA_ANA' || type.includes('OUTORGA')) {
        score += 35;
        triggers.push(sig.trigger_texto || '💧 Outorga de Captação Ativa (ANA/Estadual) — Demanda imediata por Pivô Central e Motobombas.');
      } else if (type === 'EXPANSAO_LEILAO' || type.includes('EXPANSAO')) {
        score += 35;
        triggers.push(sig.trigger_texto || '🚜 Expansão Fundiária Recente — Área recém-adquirida com demanda de ampliação de frota.');
      } else if (type === 'DOU') {
        score += 25;
        triggers.push(sig.trigger_texto || '📜 Licença Ambiental/Instalação DOU — Modernização de silos e armazenagem.');
      } else if (type === 'EVENTO_AGRO') {
        score += 25;
        triggers.push(sig.trigger_texto || '🎯 Presença Confirmada em Feira Agropecuária.');
      } else if (type === 'PASSIVO_IBAMA') {
        score += 20;
        triggers.push(sig.trigger_texto || '⚠️ Termo de Embargo IBAMA — Demanda de regularização topográfica e CAR.');
      }
    }
  }

  // 8. EIXO DE APRENDIZADO POR REFORÇO (FASE 66.D: LINUCB BANDIT ADAPTATIVO)
  // Consulta o agente de reforço com base no histórico de conversões reais no CRM (+WON / -LOST / Zumbi)
  let rlAdjustment = 0;
  let rlRationale = null;
  let rlConfidence = 0.5;
  let rlStateKey = null;
  let rlChosenArm = 'NEUTRAL_HOLD';

  try {
    const banditResult = BanditScoringService.evaluateBanditAdjustment(
      { ...titularData, ...propriedadeData },
      propriedadeData.visual_data || titularData.visual_data || {},
      propriedadeData.tenant_id || titularData.tenant_id || 'tenant-root-default'
    );

    rlAdjustment = banditResult.adjustment || 0;
    rlRationale = banditResult.rationale || null;
    rlConfidence = banditResult.confidence || 0.5;
    rlStateKey = banditResult.state_key || null;
    rlChosenArm = banditResult.chosen_arm || 'NEUTRAL_HOLD';

    if (rlAdjustment !== 0) {
      score = Math.max(0, Math.min(100, score + rlAdjustment));
      if (rlRationale) {
        triggers.push(rlRationale);
      }
    }
  } catch (err) {
    console.warn('⚠️ [LINUCB BANDIT] Falha ao calcular ajuste dinâmico:', err.message);
  }

  // Classificação por Tiers
  let classification = 'COLD';
  if (score >= 70) {
    classification = 'HOT';
  } else if (score >= 30) {
    classification = 'WARM';
  }

  return {
    intent_score: Math.min(100, score),
    intent_classification: classification,
    intent_triggers: triggers,
    rl_score_adjustment: rlAdjustment,
    rl_confidence: rlConfidence,
    rl_state_key: rlStateKey,
    rl_chosen_arm: rlChosenArm
  };
}

/**
 * Helper para verificar abertura de filial nos últimos 12 meses
 */
function checkRecentBranchFromDates(singleDate, filiaisArray) {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  if (singleDate) {
    const d = new Date(singleDate);
    if (!isNaN(d.getTime()) && d >= oneYearAgo) return true;
  }

  if (Array.isArray(filiaisArray)) {
    return filiaisArray.some(f => {
      const dStr = f.data_abertura || f.data_inicio_atividade;
      if (!dStr) return false;
      const d = new Date(dStr);
      return !isNaN(d.getTime()) && d >= oneYearAgo;
    });
  }

  return false;
}

/**
 * Helper para verificar aumento recente de capital
 */
function checkRecentCapitalIncrease(history) {
  if (!Array.isArray(history) || history.length === 0) return false;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  return history.some(h => {
    if (!h.data_alteracao) return false;
    const d = new Date(h.data_alteracao);
    return !isNaN(d.getTime()) && d >= oneYearAgo && (h.valor_novo > h.valor_anterior);
  });
}

/**
 * Consulta a base de leads ou CNPJs da Receita Federal vinculados ao titular da propriedade
 * para extrair indicadores de filial recente e movimentação de capital.
 * 
 * @param {string} cpfCnpjTitular CNPJ ou CPF do titular
 * @param {string} nomeTitular Nome do proprietário/titular
 * @param {string} tenantId Tenant do operador
 * @returns {Object} Dados agregados do titular
 */
export function lookupTitularCorporateData(cpfCnpjTitular, nomeTitular = '', tenantId = 'tenant-root-default') {
  const titularInfo = {
    cpf_cnpj: cpfCnpjTitular || null,
    nome: nomeTitular || null,
    nova_filial_recente: false,
    injecao_capital_credito: false,
    capital_social: 0
  };

  if (!cpfCnpjTitular && !nomeTitular) return titularInfo;

  try {
    let cleanCnpj = (cpfCnpjTitular || '').replace(/\D/g, '');
    let matchedLead = null;

    if (cleanCnpj.length === 14) {
      // 1. Busca por CNPJ exato na tabela leads
      matchedLead = db.prepare(`
        SELECT id, cnpj, razao_social, capital_social
        FROM leads 
        WHERE (cnpj_raw = ? OR cnpj = ?) AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
        LIMIT 1
      `).get(cleanCnpj, cpfCnpjTitular, tenantId);

      // 2. Se for matriz (0001), busca se existem filiais abertas nos últimos 12 meses com a mesma raiz
      if (cleanCnpj.endsWith('0001') || cleanCnpj.substring(8, 12) === '0001') {
        const rootCnpj = cleanCnpj.substring(0, 8);
        const branchMatch = db.prepare(`
          SELECT COUNT(*) as count 
          FROM leads 
          WHERE cnpj_raw LIKE ? AND cnpj_raw NOT LIKE '%0001%'
        `).get(`${rootCnpj}%`);

        if (branchMatch && branchMatch.count > 0) {
          titularInfo.nova_filial_recente = true;
          titularInfo.filiais_recentes_count = branchMatch.count;
        }
      }
    } else if (nomeTitular) {
      // Busca pelo nome do titular ou sócio na tabela leads_socios
      const socioMatch = db.prepare(`
        SELECT ls.lead_cnpj, l.razao_social, l.capital_social
        FROM leads_socios ls
        LEFT JOIN leads l ON (l.cnpj = ls.lead_cnpj OR l.cnpj_raw = ls.lead_cnpj)
        WHERE ls.nome LIKE ?
        LIMIT 1
      `).get(`%${nomeTitular}%`);

      if (socioMatch) {
        matchedLead = socioMatch;
      }
    }

    if (matchedLead) {
      titularInfo.capital_social = parseFloat(matchedLead.capital_social) || 0;
      if (matchedLead.intent_stage === 'HOT' || titularInfo.capital_social >= 5000000) {
        titularInfo.injecao_capital_credito = true;
      }
    }
  } catch (err) {
    console.warn('⚠️ [INTENT SCORING] Falha ao consultar histórico cadastral do titular:', err.message);
  }

  return titularInfo;
}
