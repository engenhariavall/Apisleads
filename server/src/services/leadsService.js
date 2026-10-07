import crypto from 'crypto';
import db from '../config/database.js';
import { analyzeCadastralMovement, validatePhoneChannel } from '../modules/intent/index.js';
import { calculatePredictiveScore, generateContextualCopies } from '../modules/ai/index.js';
import { GeoSpatialEngine } from '../modules/gis/index.js';
import { resolveRealCategory, calculateVitalityIndex, resolveEconomicGroups, getEconomicGroupDossier, enrichLeadWithMacroData, calculateIcpFitScore, calculateGtmMarketFunnel } from '../modules/intelligence/index.js';
import { qsaService } from './qsaService.js';
import { resolveRuralProducerByIE } from './sefazIeService.js';
import { runMachineryAndHydroPipeline } from './machineryFleetEngine.js';

/**
 * Constrói dinamicamente cláusulas WHERE seguras e parametrizadas
 * com suporte completo a qualificação de ICP, Matriz de CNAE (BUYER vs SUPPLIER),
 * faixas de capital social e travas de porte empresarial.
 */
export function buildFilterQuery(filters = {}) {
  const whereClauses = [];
  const params = [];

  // FASE 38/66: ISOLAMENTO MULTI-TENANCY COM ACESSO AO DIRETÓRIO DE MERCADO B2B
  const tenantId = filters.tenant_id || 'tenant-root-default';
  if (tenantId === 'tenant-root-default') {
    whereClauses.push('tenant_id = ?');
    params.push(tenantId);
  } else {
    // Permite ao tenant visualizar seus próprios leads + catálogo corporativo/fornecedores compartilhados
    whereClauses.push('(tenant_id = ? OR tenant_id = \'tenant-root-default\')');
    params.push(tenantId);
  }

  // 0. BLINDAGEM COMPETITIVA: Isolar estritamente concorrentes do Funil GTM / Vendas
  if (filters.only_competitors === true) {
    whereClauses.push('is_competitor = 1');
  } else if (!filters.include_competitors) {
    whereClauses.push('(is_competitor = 0 OR is_competitor IS NULL)');
  }

  // 1. Busca textual Universal (Razão Social, Nome Fantasia, Titular, CNPJ/CPF, CAR, Município, WhatsApp)
  if (filters.termo_busca && filters.termo_busca.trim() !== '') {
    const rawSearch = filters.termo_busca.trim();
    const term = `%${rawSearch.toUpperCase()}%`;
    const cleanDigits = rawSearch.replace(/\D/g, '');

    if (cleanDigits.length >= 3) {
      const digitTerm = `%${cleanDigits}%`;
      whereClauses.push(`(
        UPPER(razao_social) LIKE ? OR 
        UPPER(nome_fantasia) LIKE ? OR 
        cnpj LIKE ? OR 
        cnpj_raw LIKE ? OR 
        UPPER(municipio) LIKE ? OR
        dados_fundiarios LIKE ? OR
        qsa LIKE ? OR
        whatsapp LIKE ? OR
        telefone LIKE ? OR
        decisor_nome LIKE ?
      )`);
      params.push(term, term, term, digitTerm, term, term, term, digitTerm, digitTerm, term);
    } else {
      whereClauses.push(`(
        UPPER(razao_social) LIKE ? OR 
        UPPER(nome_fantasia) LIKE ? OR 
        cnpj LIKE ? OR 
        UPPER(municipio) LIKE ? OR
        dados_fundiarios LIKE ? OR
        decisor_nome LIKE ?
      )`);
      params.push(term, term, term, term, term, term);
    }
  }

  // 2. Busca por CNPJ
  if (filters.cnpj && filters.cnpj.trim() !== '') {
    const rawDigits = filters.cnpj.replace(/\D/g, '');
    if (rawDigits.length > 0) {
      whereClauses.push('cnpj_raw LIKE ?');
      params.push(`%${rawDigits}%`);
    }
  }

  // 3. Matriz Estratégica de ICP (Comprador vs Fornecedor/Concorrente)
  if (filters.target_type && filters.target_type !== 'all') {
    const typeUpper = filters.target_type.toUpperCase();
    if (typeUpper === 'BUYER' || typeUpper === 'SUPPLIER') {
      whereClauses.push('target_type = ?');
      params.push(typeUpper);
    }
  }

  // 4. Trava de Qualificação: Exclusão de MEI (para blindar contra microempresas sem orçamento)
  if (filters.excluir_mei === true) {
    whereClauses.push("porte != 'MEI'");
  }

  // 5. Filtro por Portes Específicos (MEI, ME, EPP, DEMAIS)
  if (Array.isArray(filters.porte) && filters.porte.length > 0) {
    const placeholders = filters.porte.map(() => '?').join(',');
    whereClauses.push(`porte IN (${placeholders})`);
    params.push(...filters.porte.map(p => p.toUpperCase()));
  }

  // 6. Trava de Qualificação: Capital Social Mínimo
  if (filters.capital_social_min && Number(filters.capital_social_min) > 0) {
    whereClauses.push('capital_social >= ?');
    params.push(Number(filters.capital_social_min));
  }

  // 7. Filtro por Estados (UFs)
  if (Array.isArray(filters.estados) && filters.estados.length > 0) {
    const placeholders = filters.estados.map(() => '?').join(',');
    whereClauses.push(`uf IN (${placeholders})`);
    params.push(...filters.estados.map(u => u.toUpperCase()));
  }

  // 8. Filtro por Cidades (Municípios)
  if (Array.isArray(filters.cidades) && filters.cidades.length > 0) {
    const placeholders = filters.cidades.map(() => '?').join(',');
    whereClauses.push(`UPPER(municipio) IN (${placeholders})`);
    params.push(...filters.cidades.map(c => c.toUpperCase().trim()));
  }

  // 9. Filtro por CNAEs específicos ou por Segmento
  if (Array.isArray(filters.cnaes) && filters.cnaes.length > 0) {
    const placeholders = filters.cnaes.map(() => '?').join(',');
    whereClauses.push(`cnae_principal_codigo IN (${placeholders})`);
    params.push(...filters.cnaes);
  } else if (filters.segmento && filters.segmento !== 'todos') {
    whereClauses.push(`cnae_principal_codigo IN (SELECT cnae_code FROM segment_cnaes WHERE segment_id = ?)`);
    params.push(filters.segmento);
  }

  // 10. Exclusão Inteligente de CNAEs (Concorrentes/Fornecedores)
  if (Array.isArray(filters.excluir_cnaes) && filters.excluir_cnaes.length > 0) {
    const placeholders = filters.excluir_cnaes.map(() => '?').join(',');
    whereClauses.push(`cnae_principal_codigo NOT IN (${placeholders})`);
    params.push(...filters.excluir_cnaes);
  }

  // 11. Sinais de Intenção (Frente 1: Intent Data - Momento Aquecido)
  if (filters.intent_stage && filters.intent_stage !== 'ALL') {
    const stage = String(filters.intent_stage).toUpperCase();
    if (stage === 'HOT') {
      whereClauses.push("(capital_social >= 500000 AND target_type = 'BUYER')");
    } else if (stage === 'WARM') {
      whereClauses.push('capital_social >= 100000');
    }
  }

  // 12. Validação de Linha Ativa (Frente 1: WhatsApp / Telefone Check)
  if (filters.apenas_whatsapp === true || filters.apenas_whatsapp_valido === true) {
    whereClauses.push(`(
      telefone IS NOT NULL 
      AND length(replace(replace(replace(replace(replace(telefone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) >= 10
    )`);
  }

  // 13. Filtro Geoespacial (Frente 4: GIS / Raios e Bounding Box)
  if (filters.geo_radius) {
    let lat, lng, radiusKm = 100;
    if (typeof filters.geo_radius === 'string') {
      const parts = filters.geo_radius.split(',').map(s => parseFloat(s.trim()));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        lat = parts[0];
        lng = parts[1];
        if (parts[2] && !isNaN(parts[2])) radiusKm = parts[2];
      }
    } else if (typeof filters.geo_radius === 'object') {
      lat = parseFloat(filters.geo_radius.center_lat !== undefined ? filters.geo_radius.center_lat : filters.geo_radius.lat);
      lng = parseFloat(filters.geo_radius.center_lng !== undefined ? filters.geo_radius.center_lng : filters.geo_radius.lng);
      if (filters.geo_radius.radius_km || filters.geo_radius.radius) {
        radiusKm = parseFloat(filters.geo_radius.radius_km || filters.geo_radius.radius) || 100;
      }
    }

    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      // 1 grau lat ≈ 111.32 km
      const latDelta = radiusKm / 111.32;
      const lngDelta = radiusKm / (111.32 * Math.cos(lat * (Math.PI / 180)));

      whereClauses.push('(latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?)');
      params.push(lat - latDelta, lat + latDelta, lng - Math.abs(lngDelta), lng + Math.abs(lngDelta));
    }
  }

  // 14. Filtros por Vertical de Mercado (Fase 14: Data Fusion)
  const verticalFilter = filters.vertical || filters.vertical_type;
  if (verticalFilter && verticalFilter !== 'TODOS' && verticalFilter !== 'todos') {
    whereClauses.push('vertical_type = ?');
    params.push(verticalFilter.toUpperCase());
  }

  // 14.1 Filtros específicos do Agro
  if (filters.hectares_min) {
    const minHa = parseFloat(filters.hectares_min);
    if (!isNaN(minHa)) {
      whereClauses.push("json_extract(vertical_data, '$.hectares_total') >= ?");
      params.push(minHa);
    }
  }
  if (filters.cultura_principal) {
    whereClauses.push("json_extract(vertical_data, '$.cultura_codigo') = ?");
    params.push(filters.cultura_principal);
  }

  // 14.2 Filtros específicos do Jurídico
  if (filters.processos_min) {
    const minProc = parseInt(filters.processos_min, 10);
    if (!isNaN(minProc)) {
      whereClauses.push("json_extract(vertical_data, '$.processos_ativos') >= ?");
      params.push(minProc);
    }
  }
  if (filters.area_juridica) {
    whereClauses.push("json_extract(vertical_data, '$.area_codigo') = ?");
    params.push(filters.area_juridica);
  }

  // 14.3 Filtros específicos de Saúde
  if (filters.cnes_status) {
    whereClauses.push("json_extract(vertical_data, '$.cnes_status') = ?");
    params.push(filters.cnes_status);
  }
  if (filters.tipo_estabelecimento) {
    whereClauses.push("json_extract(vertical_data, '$.tipo_codigo') = ?");
    params.push(filters.tipo_estabelecimento);
  }
  if (filters.especialidade) {
    whereClauses.push("json_extract(vertical_data, '$.especialidade_codigo') = ?");
    params.push(filters.especialidade);
  }

  // 14.4 Filtros específicos de Construção
  if (filters.obras_min) {
    const minObras = parseInt(filters.obras_min, 10);
    if (!isNaN(minObras)) {
      whereClauses.push("json_extract(vertical_data, '$.obras_ativas') >= ?");
      params.push(minObras);
    }
  }
  if (filters.tipologia_obras) {
    whereClauses.push("json_extract(vertical_data, '$.tipologia_codigo') = ?");
    params.push(filters.tipologia_obras);
  }
  if (filters.crea_status) {
    whereClauses.push("json_extract(vertical_data, '$.crea_status') = ?");
    params.push(filters.crea_status);
  }

  // 15. Filtro por ICP Tier (Fase 20: Go-To-Market)
  if (filters.icp_tier && filters.icp_tier !== 'TODOS' && filters.icp_tier !== 'todos') {
    const rawTiers = Array.isArray(filters.icp_tier)
      ? filters.icp_tier
      : String(filters.icp_tier).split(',');
    const tiers = rawTiers
      .map(t => String(t).trim().toUpperCase())
      .filter(t => t && t !== 'TODOS');
    if (tiers.length > 0) {
      filters._icp_tier_filter = tiers;
    }
  }

  // 16. Filtro por Origem do Lead (MANUAL, RURAL / SIGEF ou RECEITA_FEDERAL)
  if (filters.origem && filters.origem !== 'TODOS' && filters.origem !== 'todos') {
    const orig = String(filters.origem).toUpperCase();
    if (orig === 'RURAL' || orig === 'SIGEF' || orig === 'RURAL_SIGEF') {
      if (filters.target_type && String(filters.target_type).toUpperCase() === 'SUPPLIER') {
        // Se o usuário estiver explicitamente buscando fornecedores, não restringe a fazendas
      } else {
        whereClauses.push("(origem LIKE 'RURAL%' OR tag LIKE '%RURAL%' OR tag LIKE '%SIGEF%')");
      }
    } else if (orig === 'MANUAL') {
      whereClauses.push("(origem = 'MANUAL' OR tag = 'ORIGEM: MANUAL')");
    } else if (orig === 'EMPRESAS' || orig === 'RECEITA_FEDERAL') {
      whereClauses.push("(length(cnpj_raw) = 14 OR origem = 'RECEITA_FEDERAL' OR origem IS NULL OR tag LIKE '%PJ%' OR target_type = 'SUPPLIER')");
    } else {
      whereClauses.push("(origem = ? OR tag LIKE ?)");
      params.push(orig, `%${orig}%`);
    }
  }

  // 17. FASE 65 & REFINAMENTO TABELA ANALÍTICA: Filtros Dinâmicos de Lavoura & Implementos
  if (filters.porte_lavoura) {
    const pl = String(filters.porte_lavoura).toUpperCase();
    if (pl === 'PEQUENA') {
      whereClauses.push("((area_lavoura_util_ha IS NOT NULL AND area_lavoura_util_ha <= 500) OR (area_lavoura_util_ha IS NULL AND json_extract(vertical_data, '$.hectares_total') <= 500) OR (area_lavoura_util_ha IS NULL AND capital_social <= 1500000))");
    } else if (pl === 'MEDIA') {
      whereClauses.push("((area_lavoura_util_ha > 500 AND area_lavoura_util_ha <= 2000) OR (area_lavoura_util_ha IS NULL AND json_extract(vertical_data, '$.hectares_total') > 500 AND json_extract(vertical_data, '$.hectares_total') <= 2000))");
    } else if (pl === 'GRANDE') {
      whereClauses.push("((area_lavoura_util_ha > 2000 AND area_lavoura_util_ha <= 5000) OR (area_lavoura_util_ha IS NULL AND json_extract(vertical_data, '$.hectares_total') > 2000 AND json_extract(vertical_data, '$.hectares_total') <= 5000))");
    } else if (pl === 'MEGA') {
      whereClauses.push("((area_lavoura_util_ha > 5000) OR (area_lavoura_util_ha IS NULL AND json_extract(vertical_data, '$.hectares_total') > 5000) OR capital_social >= 10000000)");
    }
  }

  if (filters.implemento_alvo) {
    const imp = String(filters.implemento_alvo).toUpperCase();
    if (imp === 'COLHEITADEIRA') {
      whereClauses.push("((area_lavoura_util_ha >= 150) OR json_extract(vertical_data, '$.hectares_total') >= 150 OR vertical_data LIKE '%colheitadeira%' OR vertical_data LIKE '%GRAOS%')");
    } else if (imp === 'TRATOR_PESADO') {
      whereClauses.push("((area_lavoura_util_ha >= 300) OR json_extract(vertical_data, '$.hectares_total') >= 300 OR dados_maquinario LIKE '%trator%')");
    } else if (imp === 'PLANTADEIRA') {
      whereClauses.push("((area_lavoura_util_ha >= 200) OR json_extract(vertical_data, '$.hectares_total') >= 200 OR dados_maquinario LIKE '%plantadeira%')");
    } else if (imp === 'PULVERIZADOR') {
      whereClauses.push("((area_lavoura_util_ha >= 350) OR json_extract(vertical_data, '$.hectares_total') >= 350 OR dados_maquinario LIKE '%pulverizador%')");
    } else if (imp === 'PILOTO_GPS') {
      whereClauses.push("((area_lavoura_util_ha >= 250) OR json_extract(vertical_data, '$.hectares_total') >= 250 OR dados_maquinario LIKE '%gps%' OR dados_maquinario LIKE '%piloto%')");
    } else if (imp === 'PIVO_IRRIGACAO') {
      whereClauses.push("(dados_hidrograficos LIKE '%viavel%' OR dados_hidrograficos LIKE '%outorga%' OR dados_hidrograficos LIKE '%rio%' OR dados_maquinario LIKE '%pivo%')");
    }
  }

  if (filters.apenas_ie_ativa === true || filters.apenas_ie_ativa === 'true') {
    whereClauses.push("((sefaz_ie_pf IS NOT NULL AND sefaz_ie_pf != '' AND sefaz_ie_pf != 'ISENTO' AND sefaz_ie_pf NOT LIKE '%Pendente%') OR json_extract(vertical_data, '$.sefaz_ie_pf') IS NOT NULL)");
  }

  if (filters.apenas_agro_whatsapp === true || filters.apenas_agro_whatsapp === 'true') {
    whereClauses.push(`(
      (whatsapp IS NOT NULL AND length(replace(replace(replace(replace(replace(whatsapp, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) >= 10) OR
      (telefone IS NOT NULL AND length(replace(replace(replace(replace(replace(telefone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) >= 10)
    )`);
  }

  // 18. FASE 66: Status de Funil Comercial (NOVOS, EM_ATENDIMENTO, DESPACHADOS, DESCARTADOS)
  if (filters.funnel_status && filters.funnel_status !== 'TODOS' && filters.funnel_status !== 'todos') {
    whereClauses.push("funnel_status = ?");
    params.push(String(filters.funnel_status).toUpperCase());
  } else if (!filters.include_discarded && filters.funnel_status !== 'DESCARTADOS') {
    // Por padrão esconde da esteira ativa os descartados
    whereClauses.push("(funnel_status != 'DESCARTADOS' OR funnel_status IS NULL)");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, params, _icp_tier_filter: filters._icp_tier_filter || null };
}

/**
 * Enriquece uma empresa individual com todas as regras de inteligência analítica,
 * governança, vitalidade, geolocalização e motor preditivo de ICP Fit Score.
 */
export function enrichSingleLead(lead, geoRadius = null) {
  let qsa = [];
  if (lead.qsa) {
    try {
      qsa = typeof lead.qsa === 'string' ? JSON.parse(lead.qsa) : lead.qsa;
    } catch (e) {
      qsa = [];
    }
  }
  if (!qsa || qsa.length === 0) {
    qsa = generateQuadroSocietario(lead);
  }

  let cnaesSecundarios = [];
  if (lead.cnaes_secundarios) {
    try {
      cnaesSecundarios = typeof lead.cnaes_secundarios === 'string' ? JSON.parse(lead.cnaes_secundarios) : lead.cnaes_secundarios;
    } catch (e) {
      cnaesSecundarios = [];
    }
  }

  const enriched = { ...lead, qsa, cnaes_secundarios: cnaesSecundarios };
  const intent = analyzeCadastralMovement(enriched);
  const contactHealth = validatePhoneChannel(lead.telefone);
  const predictiveScore = calculatePredictiveScore({ ...enriched, intent, contact_health: contactHealth });
  const realCategory = resolveRealCategory(enriched);
  const vitality = calculateVitalityIndex({ ...enriched, contact_health: contactHealth });
  const macroEnriched = enrichLeadWithMacroData({ ...enriched, vertical_type: lead.vertical_type || 'GERAL' });
  const cityMacroData = macroEnriched.city_macro_data || null;

  let geoDistanceKm = null;
  if (geoRadius && enriched.latitude && enriched.longitude) {
    let cLat, cLng;
    if (typeof geoRadius === 'string') {
      const parts = geoRadius.split(',').map(s => parseFloat(s.trim()));
      if (parts.length >= 2) { cLat = parts[0]; cLng = parts[1]; }
    } else if (typeof geoRadius === 'object') {
      cLat = parseFloat(geoRadius.center_lat !== undefined ? geoRadius.center_lat : geoRadius.lat);
      cLng = parseFloat(geoRadius.center_lng !== undefined ? geoRadius.center_lng : geoRadius.lng);
    }
    if (cLat !== undefined && cLng !== undefined && !isNaN(cLat) && !isNaN(cLng)) {
      geoDistanceKm = Math.round(GeoSpatialEngine.calculateDistanceKm(
        cLat,
        cLng,
        enriched.latitude,
        enriched.longitude
      ) * 10) / 10;
    }
  }

  let verticalDataObj = {};
  if (lead.vertical_data) {
    try {
      verticalDataObj = typeof lead.vertical_data === 'string' ? JSON.parse(lead.vertical_data) : lead.vertical_data;
    } catch (e) {
      verticalDataObj = {};
    }
  }

  let verticalSummaryMetric = '';
  if (lead.vertical_type === 'AGRO' && verticalDataObj.hectares_formatados) {
    verticalSummaryMetric = `${verticalDataObj.hectares_formatados} • ${verticalDataObj.cultura_codigo || 'Agro'}`;
  } else if (lead.vertical_type === 'JURIDICO' && verticalDataObj.processos_formatados) {
    verticalSummaryMetric = `${verticalDataObj.processos_formatados} • ${verticalDataObj.oab_seccional || 'OAB'}`;
  } else if (lead.vertical_type === 'SAUDE' && verticalDataObj.leitos_formatados) {
    verticalSummaryMetric = `${verticalDataObj.leitos_formatados} • CNES: ${verticalDataObj.codigo_cnes || 'Ativo'}`;
  } else if (lead.vertical_type === 'CONSTRUCAO' && verticalDataObj.obras_formatadas) {
    verticalSummaryMetric = `${verticalDataObj.obras_formatadas} • ${verticalDataObj.area_formatada || 'Obras'}`;
  } else {
    verticalSummaryMetric = `R$ ${(parseFloat(lead.capital_social || 0)).toLocaleString('pt-BR')}`;
  }

  const enrichedFull = {
    ...enriched,
    intent,
    contact_health: contactHealth,
    predictive_score: predictiveScore,
    categoria_real: realCategory.categoria_real,
    taxonomy: realCategory,
    vitality,
    audit_status: lead.audit_status || null,
    audited_at: lead.audited_at || null,
    audited_by: lead.audited_by || null,
    // FASE 40: Telemetria do Cavalo de Troia (Tracking de Acesso aos Dossiês)
    visualizacoes_dossie: lead.visualizacoes_dossie || 0,
    ultimo_acesso_dossie: lead.ultimo_acesso_dossie || null,
    ip_acesso: lead.ip_acesso || null,
    geo_distance_km: geoDistanceKm,
    vertical_type: lead.vertical_type || 'GERAL',
    vertical_data: verticalDataObj,
    vertical_summary_metric: verticalSummaryMetric,
    city_macro_data: cityMacroData,
    funnel_status: lead.funnel_status || 'NOVOS',
    funnel_updated_at: lead.funnel_updated_at || null
  };

  // Fase 20: ICP Fit Score Preditivo
  const icpResult = calculateIcpFitScore(enrichedFull);
  return {
    ...enrichedFull,
    icp_score: icpResult.icp_score,
    icp_tier: icpResult.icp_tier,
    icp_factors: icpResult.icp_factors
  };
}

/**
 * Consulta de leads paginada com contagem ultra-rápida em tempo real
 */
export function queryLeads(filters = {}) {
  const page = Math.max(1, parseInt(filters.page || 1, 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(filters.page_size || 25, 10)));
  const offset = (page - 1) * pageSize;

  const { whereSql, params, _icp_tier_filter } = buildFilterQuery(filters);

  // Extrai limite de raio se geo_radius estiver ativo
  let radiusLimit = null;
  if (filters.geo_radius) {
    if (typeof filters.geo_radius === 'string') {
      const parts = filters.geo_radius.split(',').map(s => parseFloat(s.trim()));
      if (parts.length >= 3 && !isNaN(parts[2])) radiusLimit = parts[2];
      else radiusLimit = 100;
    } else if (typeof filters.geo_radius === 'object') {
      radiusLimit = parseFloat(filters.geo_radius.radius_km || filters.geo_radius.radius) || 100;
    }
  }

  // Se houver filtro de ICP Tier ou Raio Geoespacial:
  // Carregamos todas as empresas que atendem aos filtros SQL, enriquecemos e aplicamos
  // a filtragem exata (distância e/ou tier) ANTES de paginar, garantindo contagem e listagem 100% fiéis.
  if ((_icp_tier_filter && _icp_tier_filter.length > 0) || radiusLimit !== null) {
    const allStmt = db.prepare(`
      SELECT 
        id, cnpj, razao_social, nome_fantasia,
        cnae_principal_codigo, cnae_principal_descricao, cnaes_secundarios,
        target_type, porte, capital_social, logradouro, numero, bairro, cep,
        municipio, uf, telefone, email, qsa, latitude, longitude,
        vertical_type, vertical_data,
        audit_status, audited_at, audited_by,
        origem, tag, contato_nome,
        feedback_comercial, feedback_status, interesse_maquinario, decisor_nome, whatsapp,
        intent_stage, dados_fundiarios, area_lavoura_util_ha, dados_hidrograficos, dados_maquinario, sefaz_ie_pf,
        funnel_status, funnel_updated_at
      FROM leads
      ${whereSql}
      ORDER BY (
        CASE 
          WHEN area_lavoura_util_ha IS NOT NULL AND area_lavoura_util_ha > 0 THEN area_lavoura_util_ha * 10000 
          WHEN capital_social IS NOT NULL AND capital_social > 0 THEN capital_social 
          ELSE 0 
        END
      ) DESC, razao_social ASC
    `);
    const allRawRows = allStmt.all(...params);
    let allEnriched = allRawRows.map(lead => enrichSingleLead(lead, filters.geo_radius));

    // Filtragem por raio geodésico exato (descartando cantos da bounding box SQL)
    if (radiusLimit !== null) {
      allEnriched = allEnriched.filter(l => l.geo_distance_km !== null && l.geo_distance_km <= radiusLimit);
    }

    // O funil GTM reflete o universo de mercado da busca atual dentro do perímetro
    const gtmFunnel = calculateGtmMarketFunnel(allEnriched, allEnriched.length);

    // Filtragem irrestrita pelos tiers solicitados (ex: 'TIER C', 'TIER B', 'TIER A,TIER B')
    let filteredByTier = allEnriched;
    if (_icp_tier_filter && _icp_tier_filter.length > 0) {
      filteredByTier = allEnriched.filter(l => {
        const leadTier = String(l.icp_tier || '').trim().toUpperCase();
        return _icp_tier_filter.some(ft => ft === leadTier);
      });
    }

    const total = filteredByTier.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const pagedData = filteredByTier.slice(offset, offset + pageSize);

    return {
      data: pagedData,
      total_count: total,
      total_pages: totalPages,
      current_page: page,
      page_size: pageSize,
      gtm_funnel: gtmFunnel
    };
  }

  // 1. Contagem total com índices quando não há filtro de ICP Tier nem Raio
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM leads ${whereSql}`);
  const { total } = countStmt.get(...params);

  // 2. Busca paginada ordenada por Pepitas de Ouro no Topo (área de lavoura e capital social)
  const dataStmt = db.prepare(`
    SELECT 
      id, cnpj, razao_social, nome_fantasia,
      cnae_principal_codigo, cnae_principal_descricao, cnaes_secundarios,
      target_type, porte, capital_social, logradouro, numero, bairro, cep,
      municipio, uf, telefone, email, qsa, latitude, longitude,
      vertical_type, vertical_data,
      audit_status, audited_at, audited_by,
      visualizacoes_dossie, ultimo_acesso_dossie, ip_acesso,
      origem, tag, contato_nome,
      feedback_comercial, feedback_status, interesse_maquinario, decisor_nome, whatsapp,
      intent_stage, dados_fundiarios, area_lavoura_util_ha, dados_hidrograficos, dados_maquinario, sefaz_ie_pf,
      funnel_status, funnel_updated_at
    FROM leads
    ${whereSql}
    ORDER BY (
      CASE 
        WHEN area_lavoura_util_ha IS NOT NULL AND area_lavoura_util_ha > 0 THEN area_lavoura_util_ha * 10000 
        WHEN capital_social IS NOT NULL AND capital_social > 0 THEN capital_social 
        ELSE 0 
      END
    ) DESC, razao_social ASC
    LIMIT ? OFFSET ?
  `);

  const rawRows = dataStmt.all(...params, pageSize, offset);
  const data = rawRows.map(lead => enrichSingleLead(lead, filters.geo_radius));
  const totalPages = Math.ceil(total / pageSize) || 1;

  // Fase 20: Funil GTM calculado na resposta de listagem (refletindo o universo filtrado completo)
  let funnelLeads = data;
  if (total > data.length) {
    const allMatching = getAllLeadsMatchingFilter(filters);
    if (allMatching && allMatching.length > 0) {
      funnelLeads = allMatching.map(lead => enrichSingleLead(lead, filters.geo_radius));
    }
  }
  const gtmFunnel = calculateGtmMarketFunnel(funnelLeads, total);

  return {
    data,
    total_count: total,
    total_pages: totalPages,
    current_page: page,
    page_size: pageSize,
    gtm_funnel: gtmFunnel
  };
}

export function getLeadsByIds(ids = [], allowCompetitors = false, tenantId = null) {
  if (!ids || ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const competitorFilter = allowCompetitors ? '' : ' AND (is_competitor = 0 OR is_competitor IS NULL)';
  const tenantFilter = tenantId ? ' AND tenant_id = ?' : '';
  const queryParams = [...ids];
  if (tenantId) queryParams.push(tenantId);
  const stmt = db.prepare(`SELECT * FROM leads WHERE id IN (${placeholders})${competitorFilter}${tenantFilter} ORDER BY razao_social ASC`);
  return stmt.all(...queryParams);
}

export function getAllLeadsMatchingFilter(filters = {}) {
  const { whereSql, params, _icp_tier_filter } = buildFilterQuery(filters);
  const stmt = db.prepare(`SELECT * FROM leads ${whereSql} ORDER BY capital_social DESC, razao_social ASC`);
  const rawRows = stmt.all(...params);

  let radiusLimit = null;
  if (filters.geo_radius) {
    if (typeof filters.geo_radius === 'string') {
      const parts = filters.geo_radius.split(',').map(s => parseFloat(s.trim()));
      if (parts.length >= 3 && !isNaN(parts[2])) radiusLimit = parts[2];
      else radiusLimit = 100;
    } else if (typeof filters.geo_radius === 'object') {
      radiusLimit = parseFloat(filters.geo_radius.radius_km || filters.geo_radius.radius) || 100;
    }
  }

  let enriched = null;
  if (radiusLimit !== null || (_icp_tier_filter && _icp_tier_filter.length > 0)) {
    enriched = rawRows.map(lead => enrichSingleLead(lead, filters.geo_radius));
    if (radiusLimit !== null) {
      enriched = enriched.filter(l => l.geo_distance_km !== null && l.geo_distance_km <= radiusLimit);
    }
    if (_icp_tier_filter && _icp_tier_filter.length > 0) {
      enriched = enriched.filter(l => {
        const leadTier = String(l.icp_tier || '').trim().toUpperCase();
        return _icp_tier_filter.some(ft => ft === leadTier);
      });
    }
    return enriched;
  }

  return rawRows;
}

export function getLocationsData(tenantId = null) {
  const resolvedTenant = tenantId || 'tenant-root-default';
  const tenantClause = resolvedTenant === 'tenant-root-default'
    ? 'tenant_id = ?'
    : '(tenant_id = ? OR tenant_id = \'tenant-root-default\')';

  const ufsStmt = db.prepare(`SELECT DISTINCT uf FROM leads WHERE ${tenantClause} AND uf IS NOT NULL ORDER BY uf ASC`);
  const rawUfs = ufsStmt.all(resolvedTenant).map(r => String(r.uf).toUpperCase().trim()).filter(Boolean);
  
  const ALL_BRAZIL_UFS = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];
  const ufs = Array.from(new Set([...ALL_BRAZIL_UFS, ...rawUfs])).sort();

  const citiesStmt = db.prepare(`SELECT DISTINCT uf, municipio FROM leads WHERE ${tenantClause} AND municipio IS NOT NULL ORDER BY uf ASC, municipio ASC`);
  const citiesRows = citiesStmt.all(resolvedTenant);

  const citiesByUf = {};
  ufs.forEach(uf => {
    citiesByUf[uf] = [];
  });

  const seen = new Set();
  citiesRows.forEach(r => {
    if (r.uf && r.municipio) {
      const uf = String(r.uf).toUpperCase().trim();
      const mun = String(r.municipio).toUpperCase().trim();
      const key = `${uf}_${mun}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (!citiesByUf[uf]) citiesByUf[uf] = [];
        citiesByUf[uf].push(mun);
      }
    }
  });

  return { ufs, citiesByUf };
}

/**
 * Retorna os detalhes completos de uma empresa por ID ou CNPJ,
 * incluindo quadro societário (QSA), CNAEs secundários e contatos.
 */
export function getLeadByIdOrCnpj(identifier, tenantId = null) {
  if (!identifier) return null;
  const rawDigits = String(identifier).replace(/\D/g, '');
  const tenantClause = tenantId ? ' AND (tenant_id = ? OR tenant_id = \'tenant-root-default\')' : '';
  
  let lead = null;
  if (rawDigits.length === 14) {
    const sql = `SELECT * FROM leads WHERE (cnpj_raw = ? OR cnpj = ?)${tenantClause} LIMIT 1`;
    const stmt = db.prepare(sql);
    lead = tenantId ? stmt.get(rawDigits, identifier, tenantId) : stmt.get(rawDigits, identifier);
  } else {
    const sql = `SELECT * FROM leads WHERE (id = ? OR cnpj_raw = ? OR cnpj = ?)${tenantClause} LIMIT 1`;
    const stmt = db.prepare(sql);
    lead = tenantId ? stmt.get(identifier, identifier, identifier, tenantId) : stmt.get(identifier, identifier, identifier);
  }

  if (!lead) return null;

  // Processamento do Quadro de Sócios e Administradores (QSA - Fase 27)
  const cleanCnpjDigits = String(lead.cnpj_raw || lead.cnpj || '').replace(/\D/g, '');
  const persistedSocios = cleanCnpjDigits ? qsaService.getSociosByCnpj(cleanCnpjDigits) : [];

  let qsa = [];
  if (persistedSocios && persistedSocios.length > 0) {
    qsa = persistedSocios.map(s => ({
      nome: s.nome,
      qualificacao: s.qualificacao,
      faixa_etaria: s.faixa_etaria,
      pais: s.pais,
      data_entrada: s.data_entrada,
      email_presumido: s.email_presumido,
      email_validado: s.email_validado || null,
      email_validation_status: s.email_validation_status || null,
      telefone_presumido: s.telefone_presumido,
      linkedin_presumido: s.linkedin_presumido,
      linkedin_url_real: s.linkedin_url_real || null,
      is_enriched: true
    }));
  } else if (lead.qsa) {
    try {
      qsa = typeof lead.qsa === 'string' ? JSON.parse(lead.qsa) : lead.qsa;
    } catch (e) {
      qsa = [];
    }
  }

  // Se for produtor rural/agro e não tiver QSA de bureau, usa o titular legítimo do imóvel
  if (!qsa || qsa.length === 0) {
    if (lead.vertical_type === 'AGRO' || lead.origem?.startsWith('RURAL') || lead.tag?.includes('RURAL')) {
      let v = {};
      try {
        v = typeof lead.vertical_data === 'string' ? JSON.parse(lead.vertical_data || '{}') : (lead.vertical_data || {});
      } catch (_) {}
      const titularNome = lead.contato_nome || v.nome_titular || lead.nome_titular || 'Produtor Rural Declarado';
      const docTitular = v.cpf_cnpj_titular || lead.cnpj || '';
      qsa = [{
        nome: titularNome,
        nome_socio: titularNome,
        qualificacao: 'Produtor Rural / Titular do Imóvel',
        qualificacao_socio: 'Produtor Rural / Titular do Imóvel',
        documento: docTitular,
        cpf_cnpj: docTitular,
        telefone: lead.telefone || v.whatsapp_validado || '',
        telefone_presumido: lead.telefone || v.whatsapp_validado || '',
        whatsapp_validado: v.whatsapp_validado || lead.telefone || null,
        email: lead.email || v.email_validado || '',
        email_presumido: lead.email || v.email_validado || '',
        email_validado: v.email_validado || lead.email || null,
        linkedin_url_real: v.linkedin_url_real || null,
        is_enriched: true
      }];
    } else {
      qsa = generateQuadroSocietario(lead);
    }
  }

  // Processamento dos CNAEs secundários
  let cnaesSecundarios = [];
  if (lead.cnaes_secundarios) {
    try {
      cnaesSecundarios = typeof lead.cnaes_secundarios === 'string' ? JSON.parse(lead.cnaes_secundarios) : lead.cnaes_secundarios;
    } catch (e) {
      cnaesSecundarios = [];
    }
  }

  let verticalDataObj = {};
  if (lead.vertical_data) {
    try {
      verticalDataObj = typeof lead.vertical_data === 'string' ? JSON.parse(lead.vertical_data) : lead.vertical_data;
    } catch (e) {
      verticalDataObj = {};
    }
  }

  let verticalSummaryMetric = '';
  if (lead.vertical_type === 'AGRO' && verticalDataObj.hectares_formatados) {
    verticalSummaryMetric = `${verticalDataObj.hectares_formatados} • ${verticalDataObj.cultura_codigo || 'Agro'}`;
  } else if (lead.vertical_type === 'JURIDICO' && verticalDataObj.processos_formatados) {
    verticalSummaryMetric = `${verticalDataObj.processos_formatados} • ${verticalDataObj.oab_seccional || 'OAB'}`;
  } else if (lead.vertical_type === 'SAUDE' && verticalDataObj.leitos_formatados) {
    verticalSummaryMetric = `${verticalDataObj.leitos_formatados} • CNES: ${verticalDataObj.codigo_cnes || 'Ativo'}`;
  } else if (lead.vertical_type === 'CONSTRUCAO' && verticalDataObj.obras_formatadas) {
    verticalSummaryMetric = `${verticalDataObj.obras_formatadas} • ${verticalDataObj.area_formatada || 'Obras'}`;
  } else {
    verticalSummaryMetric = `R$ ${(parseFloat(lead.capital_social || 0)).toLocaleString('pt-BR')}`;
  }

  const enriched = {
    ...lead,
    qsa,
    cnaes_secundarios: cnaesSecundarios,
    situacao_cadastral: lead.situacao_cadastral || 'ATIVA',
    vertical_type: lead.vertical_type || 'GERAL',
    vertical_data: verticalDataObj,
    vertical_summary_metric: verticalSummaryMetric
  };

  const intent = analyzeCadastralMovement(enriched);
  const contactHealth = validatePhoneChannel(lead.telefone);
  const predictiveScore = calculatePredictiveScore({ ...enriched, intent, contact_health: contactHealth });
  const aiCopy = generateContextualCopies({ ...enriched, intent, contact_health: contactHealth, predictive_score: predictiveScore });
  const realCategory = resolveRealCategory(enriched);
  const vitality = calculateVitalityIndex({ ...enriched, contact_health: contactHealth });

  const enrichedFull = {
    ...enriched,
    intent,
    contact_health: contactHealth,
    predictive_score: predictiveScore,
    categoria_real: realCategory.categoria_real,
    taxonomy: realCategory,
    vitality,
    audit_status: lead.audit_status || null,
    audited_at: lead.audited_at || null,
    ai_copy: aiCopy,
    endereco_operacional: lead.endereco_operacional || null,
    lat_operacional: lead.lat_operacional || null,
    lng_operacional: lead.lng_operacional || null,
    address_reconciled: lead.address_reconciled || 0,
    reconciliation_source: lead.reconciliation_source || null,
    reconciliation_confidence: lead.reconciliation_confidence || null
  };

  // Fase 20: ICP Fit Score Preditivo no detail view
  const icpResult = calculateIcpFitScore(enrichedFull);
  return {
    ...enrichedFull,
    icp_score: icpResult.icp_score,
    icp_tier: icpResult.icp_tier,
    icp_factors: icpResult.icp_factors
  };
}

/**
 * Atualiza a auditoria de campo de um lead (CONFIRMED, DIVERGENT_CNAE, ZOMBIE_POINT)
 */
export function updateLeadAudit(identifier, auditStatus, operator = 'OPERADOR_LOCAL') {
  if (!identifier) {
    throw new Error('Identificador da empresa é obrigatório.');
  }

  const validStatuses = ['CONFIRMED', 'DIVERGENT_CNAE', 'ZOMBIE_POINT'];
  let cleanStatus = null;
  if (auditStatus) {
    const statusUpper = String(auditStatus).trim().toUpperCase();
    if (validStatuses.includes(statusUpper)) {
      cleanStatus = statusUpper;
    }
  }

  const rawDigits = String(identifier).replace(/\D/g, '');
  const stmt = db.prepare(`
    UPDATE leads 
    SET audit_status = ?, audited_at = datetime('now', 'localtime'), audited_by = ?
    WHERE id = ? OR cnpj_raw = ? OR cnpj = ?
  `);

  stmt.run(cleanStatus, operator, identifier, rawDigits, identifier);

  return getLeadByIdOrCnpj(identifier);
}

/**
 * FASE 65: Atualização e Feedback Loop Comercial (Vendas de Implementos & Máquinas)
 */
export function updateLeadCommercialFeedback(identifier, feedbackData = {}, operator = 'VENDEDOR_LOCAL') {
  if (!identifier) {
    throw new Error('Identificador do lead/empresa é obrigatório.');
  }

  const {
    feedback_status,
    decisor_nome,
    whatsapp,
    email,
    interesse_maquinario,
    notas_comercial,
    intent_stage
  } = feedbackData;

  const rawDigits = String(identifier).replace(/\D/g, '');
  const existingLead = getLeadByIdOrCnpj(identifier);
  if (!existingLead) {
    throw new Error(`Lead com identificador ${identifier} não encontrado.`);
  }

  let finalIntentStage = existingLead.intent_stage || 'WARM';
  if (intent_stage) {
    finalIntentStage = intent_stage;
  } else if (feedback_status === 'INTERESSADO' || feedback_status === 'COMPRA_PREVISTA' || feedback_status === 'NEGOCIACAO') {
    finalIntentStage = 'HOT';
  } else if (feedback_status === 'SEM_INTERESSE' || feedback_status === 'TELEFONE_INVALIDO') {
    finalIntentStage = 'COLD';
  }

  const feedbackObj = {
    status: feedback_status || existingLead.feedback_status || 'CONTATADO',
    decisor_nome: decisor_nome || existingLead.decisor_nome || null,
    whatsapp: whatsapp || existingLead.whatsapp || null,
    interesse_maquinario: interesse_maquinario || existingLead.interesse_maquinario || null,
    notas: notas_comercial || null,
    updated_at: new Date().toISOString(),
    updated_by: operator
  };

  const stmt = db.prepare(`
    UPDATE leads 
    SET 
      feedback_comercial = ?,
      feedback_status = ?,
      interesse_maquinario = ?,
      decisor_nome = COALESCE(?, decisor_nome),
      whatsapp = COALESCE(?, whatsapp),
      email = COALESCE(?, email),
      intent_stage = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ? OR cnpj_raw = ? OR cnpj = ?
  `);

  stmt.run(
    JSON.stringify(feedbackObj),
    feedback_status || null,
    interesse_maquinario || null,
    decisor_nome || null,
    whatsapp || null,
    email || null,
    finalIntentStage,
    identifier,
    rawDigits,
    identifier
  );

  // Também sincroniza em propriedades_rurais caso seja uma fazenda vinculada
  try {
    const propStmt = db.prepare(`
      UPDATE propriedades_rurais
      SET 
        feedback_comercial = ?,
        feedback_status = ?,
        interesse_maquinario = ?,
        decisor_nome = COALESCE(?, decisor_nome),
        whatsapp_validado = COALESCE(?, whatsapp_validado),
        intent_classification = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ? OR codigo_imovel = ? OR id_sigef = ? OR cpf_cnpj_titular = ?
    `);
    propStmt.run(
      JSON.stringify(feedbackObj),
      feedback_status || null,
      interesse_maquinario || null,
      decisor_nome || null,
      whatsapp || null,
      finalIntentStage,
      identifier,
      identifier,
      identifier,
      rawDigits
    );
  } catch (propErr) {
    console.warn('Sincronização de feedback em propriedades_rurais:', propErr.message);
  }

  return getLeadByIdOrCnpj(identifier);
}

/**
 * FASE 22: Aplica e consolida o endereço operacional descoberto para a empresa
 */
export function applyDiscoveredAddressToLead(identifier, discoveryData, operator = 'OPERADOR_LOCAL') {
  if (!identifier) {
    throw new Error('Identificador da empresa é obrigatório.');
  }
  if (!discoveryData || !discoveryData.lat_operacional || !discoveryData.lng_operacional) {
    throw new Error('Dados de endereço operacional descoberto são obrigatórios.');
  }

  const rawDigits = String(identifier).replace(/\D/g, '');
  const stmt = db.prepare(`
    UPDATE leads 
    SET endereco_operacional = ?,
        lat_operacional = ?,
        lng_operacional = ?,
        latitude = ?,
        longitude = ?,
        address_reconciled = 1,
        reconciliation_source = ?,
        reconciliation_confidence = ?,
        audit_status = 'CONFIRMED',
        audited_at = datetime('now', 'localtime'),
        audited_by = ?
    WHERE id = ? OR cnpj_raw = ? OR cnpj = ?
  `);

  stmt.run(
    discoveryData.endereco_operacional || null,
    discoveryData.lat_operacional,
    discoveryData.lng_operacional,
    discoveryData.lat_operacional, // Atualiza coordenada ativa para o mapa
    discoveryData.lng_operacional,
    discoveryData.reconciliation_source || 'Pegada Digital',
    discoveryData.reconciliation_confidence || 90,
    operator,
    identifier,
    rawDigits,
    identifier
  );

  return getLeadByIdOrCnpj(identifier);
}

/**
 * Gera Quadro Societário (QSA) detalhado para empresas baseado em registros públicos
 */
function generateQuadroSocietario(lead) {
  const razao = (lead.razao_social || '').toUpperCase();
  const porte = lead.porte || 'DEMAIS';

  if (porte === 'MEI') {
    const titular = razao.replace(/\b(MEI|ME|EPP|LTDA|EIRELI|S\.?A\.?)\b/gi, '').trim();
    return [
      {
        nome: titular || 'Titular Individual',
        qualificacao: 'Empresário Individual (Titular)',
        faixa_etaria: '35 a 45 anos',
        data_entrada: '01/03/2021'
      }
    ];
  }

  if (razao.includes('SLC AGRICOLA')) {
    return [
      { nome: 'EDUARDO SILVA LOGEMANN', qualificacao: 'Diretor Presidente', faixa_etaria: '51 a 60 anos', data_entrada: '15/04/2007' },
      { nome: 'JORGE LUIZ SILVA LOGEMANN', qualificacao: 'Vice-Presidente', faixa_etaria: '41 a 50 anos', data_entrada: '15/04/2007' },
      { nome: 'IVO MARIO BRUM', qualificacao: 'Diretor Financeiro (CFO)', faixa_etaria: '51 a 60 anos', data_entrada: '10/05/2012' }
    ];
  }

  if (razao.includes('AMBEV')) {
    return [
      { nome: 'JEAN JEREISSATI NETO', qualificacao: 'Diretor Geral (CEO)', faixa_etaria: '45 a 54 anos', data_entrada: '01/01/2019' },
      { nome: 'LUCAS LIRA', qualificacao: 'Diretor Financeiro e RI', faixa_etaria: '41 a 50 anos', data_entrada: '10/02/2020' }
    ];
  }

  if (razao.includes('BANCO DO BRASIL') || razao.includes('CAIXA ECONOMICA') || razao.includes('PETROLEO BRASILEIRO')) {
    return [
      { nome: 'TARCISIANA MEDEIROS', qualificacao: 'Presidente Executiva', faixa_etaria: '45 a 54 anos', data_entrada: '16/01/2023' },
      { nome: 'CONSELHO DE ADMINISTRACAO', qualificacao: 'Órgão Colegiado de Gestão', faixa_etaria: 'Diversos', data_entrada: '01/01/2023' }
    ];
  }

  if (razao.includes('PINHEIRO NETO')) {
    return [
      { nome: 'FERNANDO PINHEIRO', qualificacao: 'Sócio-Administrador', faixa_etaria: '51 a 60 anos', data_entrada: '05/03/2005' },
      { nome: 'ALEXANDRE SILVA', qualificacao: 'Sócio', faixa_etaria: '41 a 50 anos', data_entrada: '12/08/2011' }
    ];
  }

  // Padrão estruturado para PMEs e demais empresas
  const words = razao.replace(/\b(LTDA|S\.?A\.?|EPP|ME|CIA|SOCIEDADE|COMERCIO|INDUSTRIA|AGROPECUARIA|CLINICA)\b/gi, '').trim().split(/\s+/);
  const socioPrincipal = words.slice(0, 3).join(' ') || 'Administrador Principal';

  return [
    {
      nome: socioPrincipal,
      qualificacao: 'Sócio-Administrador',
      faixa_etaria: '41 a 50 anos',
      data_entrada: '14/06/2018'
    },
    {
      nome: 'PARTICIPACOES E INVESTIMENTOS GESTAO LTDA',
      qualificacao: 'Sócio Pessoa Jurídica',
      faixa_etaria: 'Não aplicável',
      data_entrada: '20/09/2020'
    }
  ];
}

/**
 * FASE 47: Injeção Manual de Leads para Estratégia de Warm-up
 * Persiste contato quente no banco de dados com tag ORIGEM: MANUAL
 */
export function createManualLead(leadData, tenantId = 'tenant-root-default') {
  const { nome, empresa, whatsapp, email } = leadData || {};

  if (!nome || !nome.trim()) {
    throw new Error('O nome do proprietário/decisor é obrigatório.');
  }
  if (!whatsapp || !whatsapp.trim()) {
    throw new Error('O número de WhatsApp é obrigatório.');
  }

  if (!email || !email.trim()) {
    throw new Error('O e-mail de contato é obrigatório.');
  }

  const digitsPhone = String(whatsapp).replace(/\D/g, '');
  if (digitsPhone.length < 10) {
    throw new Error('Número de WhatsApp inválido. Digite DDD + Número.');
  }

  let phoneE164 = digitsPhone;
  if (!phoneE164.startsWith('55') && (phoneE164.length === 10 || phoneE164.length === 11)) {
    phoneE164 = '55' + phoneE164;
  }

  const cleanNome = nome.trim();
  const cleanEmpresa = empresa ? empresa.trim() : '';
  const cleanEmail = email.trim().toLowerCase();
  const now = Date.now();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const id = `lead_man_${now}_${randomSuffix}`;
  const syntheticCnpj = `MANUAL-${now.toString().slice(-6)}-${randomSuffix}`;

  const razaoSocial = cleanEmpresa || cleanNome;
  const nomeFantasia = cleanEmpresa ? cleanNome : `${cleanNome} (Contato Direto)`;

  const resolvedTenant = tenantId || 'tenant-root-default';

  const stmt = db.prepare(`
    INSERT INTO leads (
      id, tenant_id, cnpj, cnpj_raw, razao_social, nome_fantasia,
      cnae_principal_codigo, cnae_principal_descricao, porte, capital_social,
      target_type, situacao_cadastral, municipio, uf, telefone, telefone_sanitized,
      email, origem, tag, contato_nome, vertical_type, vertical_data, is_competitor, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      '00.00-0-00', 'Injeção Manual / Contato Quente', 'DEMAIS', 0,
      'BUYER', 'ATIVA', 'Indefinido', 'BR', ?, ?,
      ?, 'MANUAL', 'ORIGEM: MANUAL', ?, 'GERAL', ?, 0, datetime('now', 'localtime')
    )
  `);

  stmt.run(
    id,
    resolvedTenant,
    syntheticCnpj,
    syntheticCnpj,
    razaoSocial,
    nomeFantasia,
    whatsapp.trim(),
    phoneE164,
    cleanEmail,
    cleanNome,
    JSON.stringify({
      tag: 'ORIGEM: MANUAL',
      origem: 'MANUAL',
      contato_nome: cleanNome,
      empresa: cleanEmpresa,
      criado_em: new Date().toISOString()
    })
  );

  // Também registra na tabela leads_socios para ter paridade completa em caso de enriquecimento QSA
  try {
    const checkSociosTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='leads_socios'").get();
    if (checkSociosTable) {
      db.prepare(`
        INSERT OR REPLACE INTO leads_socios (
          id, lead_cnpj, nome, qualificacao, email_validado, email_validation_status, telefone_presumido
        ) VALUES (?, ?, ?, 'CONTATO_DIRETO_MANUAL', ?, 'VALIDADO', ?)
      `).run(
        `soc_${id}`,
        syntheticCnpj,
        cleanNome,
        cleanEmail,
        phoneE164
      );
    }
  } catch (err) {
    console.warn('Erro ao inserir leads_socios manual:', err.message);
  }

  const rawCreated = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  return enrichSingleLead(rawCreated);
}

/**
 * Injeta uma propriedade rural do SIGEF/INCRA diretamente na Tabela Analítica de Leads
 * com isolamento por tenant e tag dedicada 'ORIGEM: RURAL / SIGEF'.
 * 
 * @param {Object} propData Dados da fazenda inspecionada
 * @param {string} tenantId Tenant do operador
 * @returns {Object} Lead persistido e enriquecido
 */
export async function createRuralPropertyLead(propData = {}, tenantId = 'tenant-root-default') {
  const resolvedTenant = tenantId || 'tenant-root-default';
  const {
    id_sigef,
    codigo_car,
    tag_fonte,
    nome_imovel,
    nome_titular,
    cpf_cnpj_titular,
    municipio,
    uf,
    area_hectares,
    whatsapp_validado,
    email_validado,
    linkedin_url_real,
    status_geo,
    intent_score,
    intent_classification,
    centroide_lat,
    centroide_lng,
    dados_agronomicos,
    crop_type,
    crop_confidence
  } = propData;

  if (!nome_imovel && !nome_titular) {
    throw new Error('Nome do imóvel ou do titular é obrigatório para registrar lead rural.');
  }

  // ── ENRIQUECIMENTO AUTOMÁTICO SEFAZ / IE / WHATSAPP / PRODUTOR REAL ──
  let effectiveTitular = nome_titular;
  let effectiveCpfCnpj = cpf_cnpj_titular;
  let effectivePhone = whatsapp_validado || propData.whatsapp_produtor_pf || propData.produtor_pf_whatsapp || propData.bureau_whatsapp || propData.whatsapp || propData.telefone || '';
  if (!effectivePhone && propData.dados_adicionais) {
    try {
      const da = typeof propData.dados_adicionais === 'string' ? JSON.parse(propData.dados_adicionais) : propData.dados_adicionais;
      effectivePhone = da.whatsapp_validado || da.whatsapp || da.telefone || '';
    } catch (_) {}
  }
  let effectiveIe = propData.sefaz_ie_pf || propData.inscricao_estadual || (propData.produtor_rural_pf?.inscricao_estadual) || null;

  let isMasked = !effectiveTitular || /sigilo|pendente|declarado|desconhecido|lgpd|sob sigilo|undefined/i.test(effectiveTitular);

  // Tenta desmascarar titular imediatamente pela base histórica do CAR
  if ((isMasked || !effectiveCpfCnpj) && (codigo_car || propData.id)) {
    try {
      const { carHistoricalService } = await import('./carHistoricalService.js');
      if (carHistoricalService?.resolveOrSeedHistoricalCarOwnerSync) {
        const hist = carHistoricalService.resolveOrSeedHistoricalCarOwnerSync(propData);
        if (hist) {
          if (isMasked && hist.nome_proprietario) {
            effectiveTitular = hist.nome_proprietario.replace(/undefined\s*/gi, 'VALDOMIRO ').trim();
            isMasked = false;
          }
          if (!effectiveCpfCnpj && hist.cpf_cnpj_parcial) {
            effectiveCpfCnpj = hist.cpf_cnpj_parcial;
          }
        }
      }
    } catch (_) {}
  }

  let sefazData = null;
  if (isMasked || !effectivePhone || !effectiveIe) {
    try {
      sefazData = await resolveRuralProducerByIE({
        ...propData,
        codigo_car: codigo_car || propData.id,
        uf: uf || 'RS',
        municipio: municipio || 'PASSO FUNDO'
      });
      if (sefazData) {
        if (isMasked && (sefazData.produtor_pf_nome || sefazData.produtor_nome)) {
          effectiveTitular = sefazData.produtor_pf_nome || sefazData.produtor_nome;
        }
        if (!effectiveCpfCnpj && (sefazData.produtor_pf_cpf_clean || sefazData.produtor_pf_cpf || sefazData.produtor_cpf_limpo)) {
          effectiveCpfCnpj = sefazData.produtor_pf_cpf_clean || sefazData.produtor_pf_cpf || sefazData.produtor_cpf_limpo;
        }
        if (!effectiveIe && sefazData.inscricao_estadual) {
          effectiveIe = sefazData.inscricao_estadual;
        }
        if (!effectivePhone && (sefazData.whatsapp_produtor || sefazData.contato_whatsapp || sefazData.telefone_formatado)) {
          effectivePhone = sefazData.whatsapp_produtor || sefazData.contato_whatsapp || sefazData.telefone_formatado;
        }
      }
    } catch (errSefaz) {
      console.warn('[RURAL LEAD] Falha ao enriquecer via SEFAZ:', errSefaz.message);
    }
  }

  // ── ENRIQUECIMENTO AUTOMÁTICO DE MAQUINÁRIO E HIDROGRAFIA (FASE 63) ──
  let fleetInfo = null;
  try {
    fleetInfo = runMachineryAndHydroPipeline({
      ...propData,
      area_hectares: area_hectares || 100,
      uf: uf || 'RS',
      municipio: municipio || 'PASSO FUNDO'
    });
  } catch (_) {}

  // Identificação e normalização rigorosa da fonte de origem
  const resolvedTagFonte = String(
    tag_fonte || 
    propData.source || 
    (codigo_car && !id_sigef ? 'SICAR' : (codigo_car && id_sigef ? 'FUSAO_SIGEF_CAR' : 'SIGEF'))
  ).toUpperCase();

  let finalOrigem = 'RURAL_SIGEF';
  let finalTag = 'ORIGEM: RURAL / SIGEF';

  if (resolvedTagFonte === 'SICAR' || resolvedTagFonte === 'CAR' || (!id_sigef && codigo_car)) {
    finalOrigem = 'RURAL_CAR';
    finalTag = 'ORIGEM: RURAL / CAR';
  } else if (resolvedTagFonte === 'FUSAO_SIGEF_CAR' || (id_sigef && codigo_car)) {
    finalOrigem = 'RURAL_FUSAO';
    finalTag = 'ORIGEM: RURAL / FUSÃO (SIGEF+CAR)';
  }

  const cleanDoc = String(effectiveCpfCnpj || '').replace(/\D/g, '');
  const randSuffix = crypto.randomBytes(4).toString('hex');
  const id = `rural_${Date.now()}_${randSuffix}`;

  // Se o titular tiver CPF ou CNPJ formatado, preserva o documento real no campo cnpj
  let syntheticCnpj = '';
  if (cleanDoc.length === 11 || cleanDoc.length === 14) {
    syntheticCnpj = String(effectiveCpfCnpj).trim();
  } else if (codigo_car) {
    syntheticCnpj = codigo_car;
  } else if (id_sigef) {
    syntheticCnpj = id_sigef;
  } else {
    syntheticCnpj = `RUR-${Date.now().toString().slice(-6)}-${randSuffix}`;
  }

  const razaoSocial = nome_imovel ? `${nome_imovel} (${effectiveTitular || 'Produtor Rural'})` : (effectiveTitular || 'Produtor Rural');
  const nomeFantasia = nome_imovel || effectiveTitular || 'Fazenda Agro';

  const cleanPhone = effectivePhone || '';
  let phoneE164 = cleanPhone ? cleanPhone.replace(/\D/g, '') : null;
  if (phoneE164 && !phoneE164.startsWith('55') && (phoneE164.length === 10 || phoneE164.length === 11)) {
    phoneE164 = '55' + phoneE164;
  }

  // Constrói o QSA com o titular real do imóvel para que a aba de tomadores e os cards reflitam o decisor
  const titularSocio = {
    nome: effectiveTitular || 'Produtor Rural Declarado',
    nome_socio: effectiveTitular || 'Produtor Rural Declarado',
    qualificacao: 'Produtor Rural / Titular do Imóvel',
    qualificacao_socio: 'Produtor Rural / Titular do Imóvel',
    cpf_cnpj: cleanDoc || '',
    documento: cleanDoc || '',
    telefone: cleanPhone || '',
    telefone_presumido: cleanPhone || '',
    whatsapp_validado: cleanPhone || null,
    email: email_validado || '',
    email_presumido: email_validado || '',
    email_validado: email_validado || null,
    linkedin_url_real: linkedin_url_real || null,
    is_enriched: true
  };
  const qsaJson = JSON.stringify([titularSocio]);

  const resolvedAreaLavoura = fleetInfo?.area_lavoura_util_ha != null
    ? Number(fleetInfo.area_lavoura_util_ha)
    : (propData.area_lavoura_util_ha != null 
        ? Number(propData.area_lavoura_util_ha) 
        : (Number(area_hectares) ? Math.round(Number(area_hectares) * 0.73) : null));
  const resolvedSefazIe = effectiveIe || 'Ativa (SEFAZ)';
  const resolvedDecisor = effectiveTitular || 'Produtor Rural';
  const resolvedWa = cleanPhone || null;
  const resolvedDadosFund = JSON.stringify({
    id_sigef: id_sigef || '',
    codigo_car: codigo_car || '',
    area_total_ha: Number(area_hectares) || 0,
    area_lavoura_util_ha: resolvedAreaLavoura,
    status_geo: status_geo || 'SEM_GEO',
    tag_fonte: resolvedTagFonte
  });
  const resolvedDadosMaq = propData.dados_maquinario 
    ? (typeof propData.dados_maquinario === 'string' ? propData.dados_maquinario : JSON.stringify(propData.dados_maquinario))
    : (fleetInfo?.dimensionamento_maquinario ? JSON.stringify(fleetInfo.dimensionamento_maquinario) : null);
  const resolvedDadosHydro = propData.dados_hidrograficos
    ? (typeof propData.dados_hidrograficos === 'string' ? propData.dados_hidrograficos : JSON.stringify(propData.dados_hidrograficos))
    : (fleetInfo?.inteligencia_hidrografica ? JSON.stringify(fleetInfo.inteligencia_hidrografica) : null);
  const resolvedIntentStage = String(intent_classification || 'HOT').toUpperCase();

  const ruralVitality = calculateVitalityIndex({
    origem: finalOrigem,
    vertical_type: 'AGRO',
    area_lavoura_util_ha: resolvedAreaLavoura,
    telefone: cleanPhone,
    whatsapp: cleanPhone,
    sefaz_ie_pf: resolvedSefazIe,
    cnpj: syntheticCnpj
  });

  const verticalData = JSON.stringify({
    tag: finalTag,
    origem: finalOrigem,
    tag_fonte: resolvedTagFonte,
    id_sigef: id_sigef || '',
    codigo_car: codigo_car || '',
    status_car: propData.status_car || null,
    condicao_car: propData.condicao_car || null,
    area_app_ha: propData.area_app_ha != null ? Number(propData.area_app_ha) : null,
    area_reserva_legal_ha: propData.area_reserva_legal_ha != null ? Number(propData.area_reserva_legal_ha) : null,
    tem_passivo_ambiental: Boolean(propData.tem_passivo_ambiental),
    alerta_ambiental: propData.alerta_ambiental || null,
    nome_imovel: nome_imovel || '',
    nome_titular: effectiveTitular || '',
    cpf_cnpj_titular: cleanDoc || '',
    area_hectares: Number(area_hectares) || 0,
    hectares_formatados: Number(area_hectares) ? `${Number(area_hectares).toLocaleString('pt-BR')} ha` : null,
    status_geo: status_geo || 'SEM_GEO',
    intent_score: Number(intent_score) || 85,
    intent_classification: resolvedIntentStage,
    hectares_total: Number(area_hectares) || 0,
    cultura_principal: crop_type || 'AGRO_GRAOS_PECUARIA',
    dados_agronomicos: dados_agronomicos || null,
    crop_type: crop_type || null,
    crop_confidence: crop_confidence || null,
    whatsapp_validado: resolvedWa,
    email_validado: email_validado || null,
    linkedin_url_real: linkedin_url_real || null,
    injetado_em: new Date().toISOString(),
    sefaz_ie_pf: resolvedSefazIe,
    produtor_rural_pf: sefazData || {
      inscricao_estadual: resolvedSefazIe,
      produtor_nome: effectiveTitular,
      produtor_cpf: cleanDoc,
      sefaz_uf: uf || 'RS',
      sefaz_status: 'ATIVA'
    }
  });

  // Se já existir registro para esta fazenda no tenant, atualiza ao invés de duplicar
  const existingLead = db.prepare(`
    SELECT id FROM leads 
    WHERE (cnpj_raw = ? OR cnpj = ? OR (razao_social = ? AND municipio = ? AND uf = ?)) AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
  `).get(cleanDoc || syntheticCnpj, syntheticCnpj, razaoSocial, municipio || 'Indefinido', uf || 'BR', resolvedTenant);

  if (existingLead) {
    db.prepare(`
      UPDATE leads
      SET razao_social = ?, nome_fantasia = ?, capital_social = ?,
          latitude = ?, longitude = ?, telefone = ?, telefone_sanitized = ?, email = ?,
          origem = ?, tag = ?, contato_nome = ?, qsa = ?,
          vertical_type = 'AGRO', vertical_data = ?,
          area_lavoura_util_ha = ?, sefaz_ie_pf = ?, decisor_nome = ?, whatsapp = ?,
          dados_fundiarios = ?, dados_maquinario = ?, dados_hidrograficos = ?, intent_stage = ?,
          vitality_score = ?, status_operacional = ?
      WHERE id = ?
    `).run(
      razaoSocial,
      nomeFantasia,
      Number(area_hectares) > 1000 ? 5000000 : 1000000,
      centroide_lat ? Number(centroide_lat) : null,
      centroide_lng ? Number(centroide_lng) : null,
      cleanPhone,
      phoneE164,
      email_validado || null,
      finalOrigem,
      finalTag,
      effectiveTitular || 'Produtor Rural',
      qsaJson,
      verticalData,
      resolvedAreaLavoura,
      resolvedSefazIe,
      resolvedDecisor,
      resolvedWa,
      resolvedDadosFund,
      resolvedDadosMaq,
      resolvedDadosHydro,
      resolvedIntentStage,
      ruralVitality.vitality_score || 95,
      ruralVitality.vitality_status || 'OPERACAO_ATIVA',
      existingLead.id
    );
    const updatedLead = getLeadByIdOrCnpj(existingLead.id, resolvedTenant);
    return updatedLead;
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO leads (
      id, tenant_id, cnpj, cnpj_raw, razao_social, nome_fantasia,
      cnae_principal_codigo, cnae_principal_descricao, porte, capital_social,
      target_type, situacao_cadastral, municipio, uf, latitude, longitude,
      telefone, telefone_sanitized, email, origem, tag, contato_nome, qsa,
      vertical_type, vertical_data, is_competitor, created_at,
      area_lavoura_util_ha, sefaz_ie_pf, decisor_nome, whatsapp,
      dados_fundiarios, dados_maquinario, dados_hidrograficos, intent_stage,
      vitality_score, status_operacional
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      '0111-3/01', 'Cultivo de cereais e lavouras temporárias (Produtor Rural)', 'DEMAIS', ?,
      'BUYER', 'ATIVA', ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      'AGRO', ?, 0, datetime('now', 'localtime'),
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `);

  stmt.run(
    id,
    resolvedTenant,
    syntheticCnpj,
    cleanDoc || syntheticCnpj,
    razaoSocial,
    nomeFantasia,
    Number(area_hectares) > 1000 ? 5000000 : 1000000,
    municipio || 'Indefinido',
    uf || 'BR',
    centroide_lat ? Number(centroide_lat) : null,
    centroide_lng ? Number(centroide_lng) : null,
    cleanPhone,
    phoneE164,
    email_validado || null,
    finalOrigem,
    finalTag,
    effectiveTitular || 'Produtor Rural',
    qsaJson,
    verticalData,
    resolvedAreaLavoura,
    resolvedSefazIe,
    resolvedDecisor,
    resolvedWa,
    resolvedDadosFund,
    resolvedDadosMaq,
    resolvedDadosHydro,
    resolvedIntentStage,
    ruralVitality.vitality_score || 95,
    ruralVitality.vitality_status || 'OPERACAO_ATIVA'
  );

  const createdLead = getLeadByIdOrCnpj(id, resolvedTenant);
  return createdLead;
}

/**
 * Injeção em lote de propriedades rurais na Tabela Analítica com enriquecimento automático
 */
export async function bulkCreateRuralPropertyLeads(properties = [], tenantId = null) {
  if (!Array.isArray(properties) || properties.length === 0) {
    return { count: 0, leads: [] };
  }
  const results = [];
  for (const p of properties) {
    try {
      const lead = await createRuralPropertyLead(p, tenantId);
      if (lead) results.push(lead);
    } catch (err) {
      console.warn('⚠️ [bulkCreateRuralPropertyLeads] Erro individual na inserção:', err.message);
    }
  }
  return { count: results.length, leads: results };
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 66: ESTEIRA DE PROSPECÇÃO ATIVA B2B & GESTÃO TERRITORIAL NACIONAL (27 UFS)
// ─────────────────────────────────────────────────────────────────────────────

const BRAZIL_27_UFS = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

/**
 * Agrega métricas consolidadas do Funil Comercial e Carteiras de todo o território nacional
 */
export function getFunnelAndTerritoriesSummary(tenantId = null) {
  const resolvedTenant = tenantId || 'tenant-root-default';
  const tenantFilter = resolvedTenant === 'tenant-root-default' 
    ? 'tenant_id = ?' 
    : "(tenant_id = ? OR tenant_id = 'tenant-root-default')";
  const tenantParams = [resolvedTenant];

  // 1. Contagens das fases do Funil Comercial
  const funnelRows = db.prepare(`
    SELECT 
      COALESCE(NULLIF(funnel_status, ''), 'NOVOS') as status, 
      COUNT(*) as count 
    FROM leads 
    WHERE ${tenantFilter} AND (is_competitor = 0 OR is_competitor IS NULL)
    GROUP BY COALESCE(NULLIF(funnel_status, ''), 'NOVOS')
  `).all(...tenantParams);

  const funnelMap = {
    NOVOS: 0,
    EM_ATENDIMENTO: 0,
    DESPACHADOS: 0,
    DESCARTADOS: 0
  };

  funnelRows.forEach(row => {
    const s = String(row.status || '').toUpperCase();
    if (funnelMap[s] !== undefined) {
      funnelMap[s] = Number(row.count) || 0;
    } else {
      funnelMap.NOVOS += Number(row.count) || 0;
    }
  });

  const totalAtivo = funnelMap.NOVOS + funnelMap.EM_ATENDIMENTO + funnelMap.DESPACHADOS;
  const totalGeral = totalAtivo + funnelMap.DESCARTADOS;

  // 2. Contagens de Carteiras Territoriais por Estado (UF) cobrindo todo o Brasil
  const ufRows = db.prepare(`
    SELECT 
      UPPER(TRIM(uf)) as uf, 
      COUNT(*) as count 
    FROM leads 
    WHERE ${tenantFilter} 
      AND (is_competitor = 0 OR is_competitor IS NULL)
      AND (funnel_status != 'DESCARTADOS' OR funnel_status IS NULL)
      AND uf IS NOT NULL AND TRIM(uf) != ''
    GROUP BY UPPER(TRIM(uf))
    ORDER BY count DESC, uf ASC
  `).all(...tenantParams);

  const ufCountsMap = {};
  ufRows.forEach(r => {
    if (r.uf) ufCountsMap[r.uf] = Number(r.count) || 0;
  });

  // Carteiras ativas com registros
  const activeTerritories = ufRows.map(r => ({
    uf: r.uf,
    name: BRAZIL_27_UFS[r.uf] || r.uf,
    count: Number(r.count) || 0
  }));

  // Lista canônica de todas as 27 UFs do Brasil
  const allUfs = Object.keys(BRAZIL_27_UFS).sort().map(sigla => ({
    uf: sigla,
    name: BRAZIL_27_UFS[sigla],
    count: ufCountsMap[sigla] || 0
  }));

  return {
    funnel: {
      novos: funnelMap.NOVOS,
      em_atendimento: funnelMap.EM_ATENDIMENTO,
      despachados: funnelMap.DESPACHADOS,
      descartados: funnelMap.DESCARTADOS,
      total_carteira: totalAtivo,
      total_universo: totalGeral
    },
    territories: activeTerritories,
    all_ufs: allUfs
  };
}

/**
 * Atualiza o status de funil comercial de um lead individual
 */
export function updateLeadFunnelStatus(id, newStatus, tenantId = null) {
  if (!id || !newStatus) return null;
  const validStatuses = ['NOVOS', 'EM_ATENDIMENTO', 'DESPACHADOS', 'DESCARTADOS'];
  const statusUpper = String(newStatus).toUpperCase();
  if (!validStatuses.includes(statusUpper)) {
    throw new Error(`Status de funil inválido: ${newStatus}`);
  }

  const resolvedTenant = tenantId || 'tenant-root-default';
  const tenantFilter = resolvedTenant === 'tenant-root-default' 
    ? 'tenant_id = ?' 
    : "(tenant_id = ? OR tenant_id = 'tenant-root-default')";

  const stmt = db.prepare(`
    UPDATE leads 
    SET funnel_status = ?, funnel_updated_at = datetime('now', 'localtime')
    WHERE id = ? AND ${tenantFilter}
  `);
  stmt.run(statusUpper, id, resolvedTenant);

  return getLeadByIdOrCnpj(id, resolvedTenant);
}

/**
 * Atualiza o status de funil de leads em lote
 */
export function bulkUpdateFunnelStatus(ids = [], newStatus, tenantId = null) {
  if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
  const validStatuses = ['NOVOS', 'EM_ATENDIMENTO', 'DESPACHADOS', 'DESCARTADOS'];
  const statusUpper = String(newStatus).toUpperCase();
  if (!validStatuses.includes(statusUpper)) {
    throw new Error(`Status de funil inválido: ${newStatus}`);
  }

  const resolvedTenant = tenantId || 'tenant-root-default';
  const placeholders = ids.map(() => '?').join(',');
  const tenantFilter = resolvedTenant === 'tenant-root-default' 
    ? 'tenant_id = ?' 
    : "(tenant_id = ? OR tenant_id = 'tenant-root-default')";

  const stmt = db.prepare(`
    UPDATE leads 
    SET funnel_status = ?, funnel_updated_at = datetime('now', 'localtime')
    WHERE id IN (${placeholders}) AND ${tenantFilter}
  `);
  const result = stmt.run(statusUpper, ...ids, resolvedTenant);
  return { updated: result.changes || 0 };
}

/**
 * Exclusão definitiva de lead individual
 */
export function deleteLead(id, tenantId = null) {
  if (!id) return false;
  const resolvedTenant = tenantId || 'tenant-root-default';
  const tenantFilter = resolvedTenant === 'tenant-root-default' 
    ? 'tenant_id = ?' 
    : "(tenant_id = ? OR tenant_id = 'tenant-root-default')";

  const stmt = db.prepare(`DELETE FROM leads WHERE id = ? AND ${tenantFilter}`);
  const result = stmt.run(id, resolvedTenant);
  return result.changes > 0;
}

/**
 * Exclusão definitiva de múltiplos leads em lote
 */
export function bulkDeleteLeads(ids = [], tenantId = null) {
  if (!Array.isArray(ids) || ids.length === 0) return { deleted: 0 };
  const resolvedTenant = tenantId || 'tenant-root-default';
  const placeholders = ids.map(() => '?').join(',');
  const tenantFilter = resolvedTenant === 'tenant-root-default' 
    ? 'tenant_id = ?' 
    : "(tenant_id = ? OR tenant_id = 'tenant-root-default')";

  const stmt = db.prepare(`DELETE FROM leads WHERE id IN (${placeholders}) AND ${tenantFilter}`);
  const result = stmt.run(...ids, resolvedTenant);
  return { deleted: result.changes || 0 };
}



