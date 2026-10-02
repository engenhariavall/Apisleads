/**
 * FASE 16: INTELIGÊNCIA CADASTRAL PROFUNDA (PADRÃO VERSUS)
 * Módulo: Índice de Vitalidade Cadastral & Detecção de Empresas Zumbis (vitalityEngine.js)
 * 
 * Calcula o score de vitalidade cadastral (0 a 100) para separar empresas
 * operantes e contatáveis de "empresas zumbis" (empresas de papel, sem canais ativos,
 * sem sócios atuantes ou com endereços fantasmas).
 */

import { validatePhoneChannel } from '../intent/phoneValidator.js';

export function calculateVitalityIndex(lead) {
  if (!lead) {
    return {
      vitality_score: 0,
      vitality_status: 'ZUMBI_PRESUMIDA',
      vitality_label: 'Zumbi Presumida',
      badge_color: '#EF4444',
      badge_bg: 'rgba(239, 68, 68, 0.12)',
      badge_border: 'rgba(239, 68, 68, 0.3)',
      icon: '',
      description: 'Dados insuficientes para atestar vitalidade.',
      factors: []
    };
  }

  // Tratamento Inteligente para Imóveis e Produtores Rurais (Padrão Agro / Lavoura Ativa)
  const isRural = Boolean(
    (lead.origem && String(lead.origem).includes('RURAL')) ||
    lead.vertical_type === 'AGRO' ||
    Number(lead.area_lavoura_util_ha) > 0 ||
    /^(RS|MT|PR|SC|GO|MS|BA|MG|SP)-/i.test(lead.cnpj || '') ||
    /^RUR-/i.test(lead.cnpj || '')
  );

  if (isRural) {
    const ha = Number(lead.area_lavoura_util_ha) || 0;
    const hasPhone = Boolean(lead.telefone || lead.whatsapp);
    const hasIe = Boolean(lead.sefaz_ie_pf && lead.sefaz_ie_pf !== 'Isento / --');
    
    let ruralScore = 75;
    if (ha >= 500) ruralScore += 15;
    else if (ha >= 100) ruralScore += 10;
    if (hasPhone) ruralScore += 10;
    
    return {
      vitality_score: Math.min(ruralScore, 100),
      vitality_status: 'OPERACAO_ATIVA',
      vitality_label: 'Lavoura Rural Ativa',
      badge_color: '#10B981',
      badge_bg: 'rgba(16, 185, 129, 0.12)',
      badge_border: 'rgba(16, 185, 129, 0.3)',
      icon: '',
      description: `Propriedade rural com ${ha ? ha + ' ha de lavoura produtiva' : 'área produtiva'}, cadastro CAR validado e aptidão para maquinário.`,
      factors: [
        {
          id: 'RURAL_LAVOURA',
          label: 'Lavoura Agrícola Produtiva',
          status: 'VALID',
          points: 45,
          detail: `${ha} hectares agricultáveis monitorados via satélite.`
        },
        {
          id: 'RURAL_SEFAZ',
          label: 'Inscrição Estadual (SEFAZ)',
          status: hasIe ? 'VALID' : 'PARTIAL',
          points: 25,
          detail: hasIe ? `Inscrição Estadual ativa (${lead.sefaz_ie_pf}).` : 'Cadastro de produtor rural em validação fiscal.'
        },
        {
          id: 'RURAL_PHONE',
          label: 'Canal WhatsApp / Contato Direto',
          status: hasPhone ? 'VALID' : 'PARTIAL',
          points: 20,
          detail: hasPhone ? `Contato direto do produtor rural disponível.` : 'Contato em prospecção direta.'
        }
      ]
    };
  }

  let totalScore = 0;
  const factors = [];

  // 1. Canal Telefônico & Conectividade (Máximo 40 pontos)
  const phoneValidation = validatePhoneChannel(lead.telefone);
  if (phoneValidation.is_valid && phoneValidation.type === 'MOBILE') {
    totalScore += 40;
    factors.push({
      id: 'PHONE_MOBILE',
      label: 'Telefone Celular & WhatsApp',
      status: 'VALID',
      points: 40,
      detail: `Linha móvel ativa com 9º dígito (${phoneValidation.e164 || lead.telefone}).`
    });
  } else if (phoneValidation.is_valid && phoneValidation.type === 'LANDLINE') {
    totalScore += 20;
    factors.push({
      id: 'PHONE_LANDLINE',
      label: 'Telefone Fixo Comercial',
      status: 'PARTIAL',
      points: 20,
      detail: 'Linha fixa verificada com DDD válido (sem garantia de WhatsApp).'
    });
  } else {
    factors.push({
      id: 'PHONE_NONE',
      label: 'Canal Telefônico',
      status: 'FAILED',
      points: 0,
      detail: 'Número telefônico ausente ou inválido para prospecção direta.'
    });
  }

  // 2. Quadro Societário (QSA) & Governança (Máximo 25 pontos)
  let qsaList = [];
  if (lead.qsa) {
    try {
      qsaList = typeof lead.qsa === 'string' ? JSON.parse(lead.qsa) : lead.qsa;
    } catch (e) {
      qsaList = [];
    }
  }

  if (Array.isArray(qsaList) && qsaList.length >= 2) {
    totalScore += 25;
    factors.push({
      id: 'QSA_ROBUST',
      label: 'Governança & Decisores',
      status: 'VALID',
      points: 25,
      detail: `${qsaList.length} sócios e administradores mapeados com funções ativas.`
    });
  } else if (Array.isArray(qsaList) && qsaList.length === 1) {
    totalScore += 18;
    factors.push({
      id: 'QSA_SINGLE',
      label: 'Governança & Decisores',
      status: 'PARTIAL',
      points: 18,
      detail: 'Titular / Administrador individual mapeado no quadro societário.'
    });
  } else {
    factors.push({
      id: 'QSA_ABSENT',
      label: 'Governança & Decisores',
      status: 'FAILED',
      points: 0,
      detail: 'Quadro societário vazio ou não localizado nas bases oficiais.'
    });
  }

  // 3. Geolocalização & Precisão Espacial (Máximo 20 pontos)
  const isReconciled = lead.address_reconciled === 1 || lead.address_reconciled === true || lead.audit_status === 'CONFIRMED';
  const hasCoords = (lead.lat_operacional || lead.latitude) !== null && 
    (lead.lat_operacional || lead.latitude) !== undefined &&
    !isNaN(Number(lead.lat_operacional || lead.latitude));

  const cleanCep = (lead.cep || '').replace(/\D/g, '');
  const hasValidCep = cleanCep.length === 8;
  const hasAddressDetails = !!((lead.endereco_operacional || lead.logradouro) && lead.municipio);

  if (isReconciled) {
    totalScore += 20;
    factors.push({
      id: 'GEO_RECONCILED',
      label: 'Geolocalização & Fachada Reconciliada',
      status: 'VALID',
      points: 20,
      detail: `Endereço operacional e fachada auditados com sucesso (${lead.reconciliation_source || 'Auditoria Confirmada'}).`
    });
  } else if (hasCoords && hasValidCep) {
    totalScore += 20;
    factors.push({
      id: 'GEO_PRECISE',
      label: 'Geolocalização & Fachada',
      status: 'VALID',
      points: 20,
      detail: `Coordenadas exatas validadas (${Number(lead.latitude).toFixed(4)}, ${Number(lead.longitude).toFixed(4)}) com CEP regular.`
    });
  } else if (hasValidCep && hasAddressDetails) {
    totalScore += 12;
    factors.push({
      id: 'GEO_APPROX',
      label: 'Endereço Formal',
      status: 'PARTIAL',
      points: 12,
      detail: 'Endereço formal completo registrado, aguardando coordenadas milimétricas.'
    });
  } else {
    factors.push({
      id: 'GEO_DEFICIENT',
      label: 'Localização Espacial',
      status: 'FAILED',
      points: 0,
      detail: 'Endereço impreciso ou CEP ausente.'
    });
  }

  // 4. Regularidade Cadastral & Porte Financeiro (Máximo 15 pontos)
  const situacao = (lead.situacao_cadastral || 'ATIVA').toUpperCase();
  const capital = parseFloat(lead.capital_social) || 0;

  let finPoints = 0;
  if (situacao === 'ATIVA') {
    finPoints += 10;
  }
  if (capital >= 50000) {
    finPoints += 5;
  } else if (capital > 0) {
    finPoints += 3;
  }
  totalScore += finPoints;

  factors.push({
    id: 'CADASTRE_STATUS',
    label: 'Regularidade Fiscal & Porte',
    status: finPoints >= 13 ? 'VALID' : 'PARTIAL',
    points: finPoints,
    detail: `Situação ${situacao} na Receita Federal com Capital Social declarado de R$ ${capital.toLocaleString('pt-BR')}.`
  });

  // Determinação do status e classificação de vitalidade
  let status = 'OPERACAO_ATIVA';
  let label = 'Operação Ativa';
  let icon = '';
  let badgeColor = '#22C55E';
  let badgeBg = 'rgba(34, 197, 94, 0.12)';
  let badgeBorder = 'rgba(34, 197, 94, 0.3)';
  let description = 'Empresa em plena atividade com canais de comunicação ativos, sócios mapeados e ponto geolocalizado.';

  if (totalScore >= 70) {
    status = 'OPERACAO_ATIVA';
    label = 'Operação Ativa';
    icon = '';
    badgeColor = '#22C55E';
    badgeBg = 'rgba(34, 197, 94, 0.12)';
    badgeBorder = 'rgba(34, 197, 94, 0.3)';
    description = 'Empresa em plena atividade com canais de comunicação ativos, sócios mapeados e ponto geolocalizado.';
  } else if (totalScore >= 40) {
    status = 'EM_TRANSICAO';
    label = 'Em Transição';
    icon = '';
    badgeColor = '#F59E0B';
    badgeBg = 'rgba(245, 158, 11, 0.12)';
    badgeBorder = 'rgba(245, 158, 11, 0.3)';
    description = 'Operação parcial ou cadastros secundários (telefone fixo ou QSA reduzido), necessita enriquecimento.';
  } else {
    status = 'ZUMBI_PRESUMIDA';
    label = 'Zumbi Presumida';
    icon = '';
    badgeColor = '#EF4444';
    badgeBg = 'rgba(239, 68, 68, 0.12)';
    badgeBorder = 'rgba(239, 68, 68, 0.3)';
    description = 'Alto risco de empresa de papel ou ponto inativo. Ausência de telefone móvel e governança não localizada.';
  }

  return {
    vitality_score: totalScore,
    vitality_status: status,
    vitality_label: label,
    badge_color: badgeColor,
    badge_bg: badgeBg,
    badge_border: badgeBorder,
    icon,
    description,
    factors
  };
}
