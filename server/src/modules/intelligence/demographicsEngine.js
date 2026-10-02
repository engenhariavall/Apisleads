import db from '../../config/database.js';
import '../../config/seedDemographics.js';

/**
 * Normaliza string para cruzamento
 */
function normalizeString(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

/**
 * Motor de Inteligência Demográfica (Fase 19)
 * 
 * Recebe município, uf e vertical_type e retorna:
 * - Estimativa de Mercado Consumidor Local
 * - Classificação da praça (ALTO_CONSUMO, CONSUMO_MEDIO, CONSUMO_RESTRITO)
 */
export function getDemographicAnalysis(municipio, uf, vertical_type = 'GERAL') {
  const normMunicipio = normalizeString(municipio);
  const normUf = normalizeString(uf);

  // Busca os indicadores da cidade
  const row = db.prepare('SELECT * FROM municipal_indicators WHERE uf = ? AND municipio = ?')
    .get(normUf, normMunicipio);

  if (!row) {
    return {
      status: 'NOT_FOUND',
      message: 'Município não coberto no DB demográfico (usando médias estaduais aproximadas)',
      market_size_estimation_brl: 0,
      classification: 'CONSUMO_RESTRITO'
    };
  }

  // Parse do consumo setorial
  let consumoSetorial = {};
  try {
    consumoSetorial = JSON.parse(row.consumo_setorial_json || '{}');
  } catch (e) {
    consumoSetorial = {};
  }

  // Mapeamento semântico vertical -> chave POF
  let chaveConsumo = '';
  if (vertical_type === 'AGRO') chaveConsumo = 'agro_insumos';
  else if (vertical_type === 'SAUDE') chaveConsumo = 'saude_medicamentos';
  else if (vertical_type === 'CONSTRUCAO') chaveConsumo = 'construcao_reforma';
  else if (vertical_type === 'AUTOMOTIVO') chaveConsumo = 'automotivo_transporte';
  else chaveConsumo = 'alimentacao_gastronomia'; // Fallback geral

  // Extrai o valor específico de consumo per capita daquele setor na POF
  const consumoMensalPc = consumoSetorial[chaveConsumo] || (row.consumo_mensal_per_capita * 0.1); 
  
  // Calcula a estimativa de Mercado Consumidor Local (Tamanho da Praça = População × Consumo Setorial Anual)
  const consumoAnualPc = consumoMensalPc * 12;
  const marketSizeBrl = row.populacao_estimada * consumoAnualPc;

  // Classifica a atratividade da praça
  let classification = 'CONSUMO_RESTRITO';
  if (marketSizeBrl > 500000000) {
    classification = 'ALTO_CONSUMO';
  } else if (marketSizeBrl > 100000000) {
    classification = 'CONSUMO_MEDIO';
  }

  return {
    status: 'SUCCESS',
    ibge_code: row.ibge_code,
    municipio: row.municipio,
    uf: row.uf,
    populacao: row.populacao_estimada,
    pib_per_capita: row.pib_per_capita,
    ipc_score: row.ipc_score,
    frota_total: row.frota_total,
    frota_pesados_agro: row.frota_pesados_agro,
    target_sector: chaveConsumo,
    consumo_mensal_per_capita_setor: consumoMensalPc,
    market_size_estimation_brl: marketSizeBrl,
    classification
  };
}

/**
 * Retorna os indicadores de nicho de uma cidade, baseados na vertical.
 */
export function getSectoralNicheMetrics(municipio, uf, verticalType) {
  const normMunicipio = normalizeString(municipio);
  const normUf = normalizeString(uf);

  const row = db.prepare('SELECT * FROM municipal_indicators WHERE uf = ? AND municipio = ?')
    .get(normUf, normMunicipio);

  if (!row) return null;

  let densityIndex = 0;
  let diagnostic = '';
  let metrics = {};

  if (verticalType === 'AGRO' || verticalType === 'AUTOMOTIVO') {
    metrics = {
      frota_caminhoes_tratores: row.frota_caminhoes_tratores,
      hectares_lavoura_estimados: row.hectares_lavoura_estimados
    };
    densityIndex = Math.min((row.frota_caminhoes_tratores / 1000) * 5, 100);
    diagnostic = densityIndex > 70 ? 'Polo de Alta Mecanização' : (densityIndex > 30 ? 'Mecanização em Expansão' : 'Baixa Mecanização');
  } else if (verticalType === 'CONSTRUCAO') {
    metrics = {
      obras_ativas_estimadas: row.obras_ativas_estimadas,
      metragem_alvaras_m2: row.metragem_alvaras_m2
    };
    densityIndex = Math.min((row.obras_ativas_estimadas / 100) * 10, 100);
    diagnostic = densityIndex > 70 ? 'Canteiros em Expansão' : (densityIndex > 30 ? 'Mercado Estável' : 'Desaceleração Imobiliária');
  } else if (verticalType === 'SAUDE') {
    metrics = {
      leitos_totais: row.leitos_totais,
      estabelecimentos_saude: row.estabelecimentos_saude,
      densidade_leitos_mil_hab: row.densidade_leitos_mil_hab
    };
    densityIndex = Math.min((row.densidade_leitos_mil_hab / 3) * 100, 100);
    diagnostic = densityIndex > 80 ? 'Alta Demanda por Leitos' : (densityIndex > 40 ? 'Cobertura Intermediária' : 'Déficit Hospitalar');
  } else if (verticalType === 'JURIDICO') {
    metrics = {
      comarcas_varas_total: row.comarcas_varas_total,
      volume_processual_anual: row.volume_processual_anual
    };
    densityIndex = Math.min((row.volume_processual_anual / 50000) * 100, 100);
    diagnostic = densityIndex > 70 ? 'Alto Volume Processual' : (densityIndex > 30 ? 'Comarca Ativa' : 'Baixa Litigiosidade');
  } else {
    // Fallback genérico
    return null;
  }

  return {
    vertical: verticalType,
    density_index: densityIndex,
    diagnostic: diagnostic,
    metrics: metrics
  };
}

/**
 * Enriquece um lead com os dados macroeconômicos e demográficos do município.
 */
export function enrichLeadWithMacroData(lead) {
  if (!lead.municipio || !lead.uf) {
    return { ...lead, city_macro_data: null, niche_indicators: null };
  }
  const macroData = getDemographicAnalysis(lead.municipio, lead.uf, lead.vertical_type || 'GERAL');
  const nicheData = getSectoralNicheMetrics(lead.municipio, lead.uf, lead.vertical_type || 'GERAL');
  
  return { ...lead, city_macro_data: macroData, niche_indicators: nicheData };
}
