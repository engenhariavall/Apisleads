/**
 * MÓDULO DE INTELIGÊNCIA COMPETITIVA & SCOUTING DE MERCADO
 * Motor de Análise Tática e Radiografia de Concorrentes (competitorIntelligenceService.js)
 * 
 * Executa lookup de CNPJ avulso, cálculo do Índice de Fragilidade Operacional,
 * detecção de gaps territoriais e isolamento rigoroso contra o funil GTM / tráfego pago.
 */

import db from '../config/database.js';
import * as h3 from 'h3-js';
import { CITY_COORDINATES, GeoSpatialEngine } from '../modules/gis/geoSpatialEngine.js';
import { resolveRealAddress, geocodeFiscalAddress } from './addressResolverService.js';
import { enrichSingleLead } from './leadsService.js';
import { receitaService } from './receitaService.js';

/**
 * Normaliza CNPJ removendo pontuações
 */
export function sanitizeCnpj(cnpj) {
  if (!cnpj) return '';
  return String(cnpj).replace(/\D/g, '');
}

/**
 * Formata CNPJ com máscara padrão (00.000.000/0000-00)
 */
export function formatCnpj(raw) {
  const digits = sanitizeCnpj(raw);
  if (digits.length !== 14) return raw;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Calcula o Índice de Fragilidade Operacional (0 a 100) e diagnostica vulnerabilidades
 * @param {Object} lead Empresa concorrente
 * @returns {Object} Score de fragilidade, nível de risco e lista de vulnerabilidades táticas
 */
export function calculateFragilityIndex(lead) {
  if (!lead) {
    return {
      fragility_score: 50,
      risk_level: 'MODERADO',
      risk_label: 'Vulnerabilidade Moderada',
      badge_color: '#F59E0B',
      vulnerabilities: []
    };
  }

  let fragilityScore = 0;
  const vulnerabilities = [];

  // 1. Vulnerabilidade de Endereço & Fachada (Máx 35 pts)
  const isReconciled = lead.address_reconciled === 1 || lead.audit_status === 'CONFIRMED';
  const isZombie = lead.audit_status === 'ZOMBIE_POINT';
  const isDivergent = lead.audit_status === 'DIVERGENT_CNAE';

  if (isZombie) {
    fragilityScore += 35;
    vulnerabilities.push({
      type: 'ENDERECO_FANTASMA',
      severity: 'CRITICA',
      title: 'Ponto Comercial Inexistente / Fachada Fantasma',
      detail: 'Auditoria de campo identificou ausência de sede física ou ponto operacional inativo no local registrado.'
    });
  } else if (isDivergent) {
    fragilityScore += 25;
    vulnerabilities.push({
      type: 'CNAE_DIVERGENTE',
      severity: 'ALTA',
      title: 'Incongruência de Atividade Econômica',
      detail: 'Operação física não corresponde à atividade declarada na Receita Federal (risco fiscal/regulatório).'
    });
  } else if (!isReconciled && (!lead.endereco_operacional || !lead.latitude)) {
    fragilityScore += 18;
    vulnerabilities.push({
      type: 'ENDERECO_DESATUALIZADO',
      severity: 'MEDIA',
      title: 'Endereço Cadastral sem Reconciliação Física',
      detail: 'Localização vinculada apenas ao registro formal antigo, sem presença operacional atestada no mapa.'
    });
  }

  // 2. Vulnerabilidade de Governança & QSA (Máx 30 pts)
  let qsaList = [];
  if (lead.qsa) {
    try {
      qsaList = typeof lead.qsa === 'string' ? JSON.parse(lead.qsa) : lead.qsa;
    } catch (e) {
      qsaList = [];
    }
  }

  if (!qsaList || qsaList.length === 0) {
    fragilityScore += 30;
    vulnerabilities.push({
      type: 'QSA_AUSENTE',
      severity: 'CRITICA',
      title: 'Estrutura Societária Oculta / Não Localizada',
      detail: 'Sem sócios-administradores transparentes registrados, indicando fragilidade de governança ou holding fechada.'
    });
  } else if (qsaList.length === 1) {
    fragilityScore += 15;
    vulnerabilities.push({
      type: 'CONCENTRACAO_DECISORIA',
      severity: 'MEDIA',
      title: 'Centralização Decisória Unipessoal',
      detail: 'Dependência de único titular / administrador, suscetível a gargalos operacionais e sucessórios.'
    });
  }

  // 3. Estagnação de Capital & Porte (Máx 25 pts)
  const capital = parseFloat(lead.capital_social) || 0;
  const porte = (lead.porte || 'DEMAIS').toUpperCase();

  if (capital < 20000 && porte !== 'MEI') {
    fragilityScore += 25;
    vulnerabilities.push({
      type: 'SUBCAPITALIZACAO',
      severity: 'ALTA',
      title: 'Subcapitalização Operacional Expressiva',
      detail: `Capital social de apenas R$ ${capital.toLocaleString('pt-BR')} para porte ${porte}, limitando capacidade de defesa comercial.`
    });
  } else if (capital < 100000) {
    fragilityScore += 12;
    vulnerabilities.push({
      type: 'CAPITAL_LIMITADO',
      severity: 'BAIXA',
      title: 'Capacidade Financeira de Retaliação Reduzida',
      detail: 'Capital de giro restrito para sustentar guerras de preços prolongadas ou expansão acelerada.'
    });
  }

  // 4. Vulnerabilidade de Canais de Contato (Máx 10 pts)
  const phone = (lead.telefone || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) {
    fragilityScore += 10;
    vulnerabilities.push({
      type: 'CANAL_INOPERANTE',
      severity: 'BAIXA',
      title: 'Canais Comerciais Inacessíveis',
      detail: 'Ausência de telefone ou WhatsApp corporativo ativo verificado na praça de atuação.'
    });
  }

  // Nível de vulnerabilidade
  let riskLevel = 'BAIXO';
  let riskLabel = 'Operação Estruturada (Baixa Vulnerabilidade)';
  let badgeColor = '#22C55E';

  if (fragilityScore >= 60) {
    riskLevel = 'ALTO';
    riskLabel = 'Vulnerabilidade Crítica (Ponto Fraco Detectado)';
    badgeColor = '#EF4444';
  } else if (fragilityScore >= 30) {
    riskLevel = 'MODERADO';
    riskLabel = 'Vulnerabilidade Moderada (Oportunidade Comercial)';
    badgeColor = '#F59E0B';
  }

  return {
    fragility_score: Math.min(100, fragilityScore),
    risk_level: riskLevel,
    risk_label: riskLabel,
    badge_color: badgeColor,
    vulnerabilities
  };
}

/**
 * Calcula os Gaps de Mercado, Vazio Operacional H3 e Gap Scores (0 a 100)
 * Cruzando a localização dos concorrentes com a demanda POF/IPC e malha H3
 * 
 * Fórmula: Gap Score = (Potencial de Demanda POF/IPC) * (Distância ao Concorrente mais Próximo)
 * @param {Object} options Filtros ou concorrente opcional
 * @returns {Array} Ranking de microrregiões desassistidas ordenadas por Gap Score
 */
export function calculateMarketGaps(options = {}) {
  const defaultBufferKm = options.buffer_km || 50;

  // 1. Obter todos os concorrentes ativos e suas coordenadas
  let competitorCoords = [];
  if (options.competitor_id) {
    const compStmt = options.tenant_id 
      ? db.prepare('SELECT * FROM leads WHERE id = ? AND (tenant_id = ? OR tenant_id = \'tenant-root-default\')')
      : db.prepare('SELECT * FROM leads WHERE id = ?');
    const comp = options.tenant_id 
      ? compStmt.get(options.competitor_id, options.tenant_id)
      : compStmt.get(options.competitor_id);

    if (comp) {
      const coords = GeoSpatialEngine.resolveCoordinates(comp);
      if (coords.lat && coords.lng) {
        competitorCoords.push({
          id: comp.id,
          name: comp.nome_fantasia || comp.razao_social,
          lat: coords.lat,
          lng: coords.lng,
          buffer_km: defaultBufferKm
        });
      }
    }
  } else {
    const tenantFilter = options.tenant_id ? ' AND (tenant_id = ? OR tenant_id = \'tenant-root-default\')' : '';
    const compStmt = db.prepare(`SELECT * FROM leads WHERE is_competitor = 1${tenantFilter}`);
    const compRows = options.tenant_id ? compStmt.all(options.tenant_id) : compStmt.all();
    compRows.forEach(c => {
      const coords = GeoSpatialEngine.resolveCoordinates(c);
      if (coords.lat && coords.lng) {
        competitorCoords.push({
          id: c.id,
          name: c.nome_fantasia || c.razao_social,
          lat: coords.lat,
          lng: coords.lng,
          buffer_km: defaultBufferKm
        });
      }
    });
  }

  // FASE 42: Se o tenant não possui concorrentes monitorados cadastrados,
  // retorna array vazio imediatamente (Zero State absoluto) para evitar gerar gaps fictícios globais
  if (competitorCoords.length === 0) {
    return [];
  }

  // 2. Obter municípios com dados demográficos POF/IPC
  const municipalRows = db.prepare('SELECT * FROM municipal_indicators').all();
  if (!municipalRows || municipalRows.length === 0) {
    return [];
  }

  const gapZones = [];

  municipalRows.forEach(m => {
    const key = `${m.municipio}/${m.uf}`;
    const cityCoord = CITY_COORDINATES[key];
    if (!cityCoord) return;

    const lat = cityCoord.lat;
    const lng = cityCoord.lng;

    // Calcula a distância até o concorrente mais próximo
    let minDistanceKm = 9999;
    let closestCompetitorName = 'Nenhum concorrente identificado';

    if (competitorCoords.length > 0) {
      competitorCoords.forEach(c => {
        const d = GeoSpatialEngine.calculateDistanceKm(lat, lng, c.lat, c.lng);
        if (d < minDistanceKm) {
          minDistanceKm = d;
          closestCompetitorName = c.name;
        }
      });
    } else {
      // Se não há concorrente cadastrado, assume isolamento amplo
      minDistanceKm = 150;
    }

    // Se estiver estritamente DENTRO do raio de buffer do concorrente (ex: <= 50km),
    // a praça está coberta diretamente pelo concorrente (não é um vazio desassistido)
    const isCovered = minDistanceKm <= defaultBufferKm;

    // Normalização dos componentes da fórmula de Gap Score:
    // Gap Score = (Potencial de Demanda POF/IPC) * (Distância ao Concorrente mais Próximo)
    const ipcNorm = Math.min(100, Math.max(10, m.ipc_score || 50)); // 10 a 100
    // Distância com saturação máxima em 250km
    const distFactor = Math.min(1.0, Math.max(0.1, minDistanceKm / 250));

    // Penalidade se estiver dentro do buffer de cobertura do concorrente
    const coveragePenalty = isCovered ? 0.35 : 1.0;

    let rawScore = Math.round(ipcNorm * distFactor * coveragePenalty);
    const gapScore = Math.max(5, Math.min(100, rawScore));

    // Geração de célula H3 para indexação e renderização no mapa
    let h3Index = null;
    let h3Boundary = null;
    try {
      if (h3 && typeof h3.latLngToCell === 'function') {
        h3Index = h3.latLngToCell(lat, lng, 6); // resolução 6 (~36km²)
        if (typeof h3.cellToBoundary === 'function') {
          h3Boundary = h3.cellToBoundary(h3Index, true);
        }
      }
    } catch (e) {
      h3Index = null;
    }

    const estimatedMarketBrl = (m.populacao_estimada || 100000) * (m.consumo_mensal_per_capita || 2000) * 12;

    gapZones.push({
      municipio: m.municipio,
      uf: m.uf,
      key,
      latitude: lat,
      longitude: lng,
      recommended_radius_km: Math.min(60, Math.max(25, Math.round(minDistanceKm * 0.45))),
      min_distance_competitor_km: Math.round(minDistanceKm * 10) / 10,
      closest_competitor: closestCompetitorName,
      is_covered_by_competitor: isCovered,
      ipc_score: m.ipc_score || 50,
      populacao: m.populacao_estimada,
      estimated_market_brl: estimatedMarketBrl,
      estimated_market_formatted: `R$ ${(estimatedMarketBrl / 1e6).toFixed(1)}M/ano`,
      gap_score: gapScore,
      priority_level: gapScore >= 70 ? 'ALTA' : (gapScore >= 45 ? 'MEDIA' : 'OPORTUNIDADE_SECUNDARIA'),
      h3_index: h3Index,
      h3_boundary: h3Boundary,
      geofence_snippet: `${lat.toFixed(4)}, ${lng.toFixed(4)} (+${Math.min(60, Math.max(25, Math.round(minDistanceKm * 0.45)))}km)`
    });
  });

  // Ordena pelo maior Gap Score (vazios mais lucrativos e desassistidos primeiro)
  gapZones.sort((a, b) => b.gap_score - a.gap_score);

  return gapZones;
}

/**
 * Identifica Gaps Territoriais e Ausência de Cobertura Física
 * @param {Object} competitor Empresa concorrente
 * @param {Array} marketClusters Pólos e cidades do mercado
 * @returns {Object} Análise de presença geográfica e cidades vulneráveis
 */
export function mapTerritorialGaps(competitor) {
  const compUf = (competitor.uf || '').toUpperCase();
  const compMunicipio = (competitor.municipio || '').toUpperCase();

  const key = `${compMunicipio}/${compUf}`;
  const compCoord = CITY_COORDINATES[key] || {
    lat: competitor.latitude || -15.78,
    lng: competitor.longitude || -47.92
  };

  // Calcula gaps de mercado prescritivos com base na sede e concorrentes
  const marketGaps = calculateMarketGaps({
    competitor_id: competitor.id,
    buffer_km: 50
  });

  // Cidades do mesmo estado com maiores gaps
  const sameStateGaps = marketGaps.filter(g => g.uf === compUf && g.municipio !== compMunicipio);
  const topGaps = (sameStateGaps.length > 0 ? sameStateGaps : marketGaps).slice(0, 5);

  const potentialExpansionCities = topGaps.map(g => ({
    cidade: g.municipio,
    uf: g.uf,
    gap_score: g.gap_score,
    min_distance_km: g.min_distance_competitor_km,
    potencial_demanda: g.estimated_market_formatted,
    gap_type: 'VAZIO_ASSISTENCIAL_H3',
    oportunidade: `Gap Score ${g.gap_score}/100. Distante ${g.min_distance_competitor_km}km do oponente com alta demanda.`
  }));

  return {
    base_sede: `${compMunicipio} / ${compUf}`,
    raio_cobertura_estimado_km: 50,
    gap_ranking: topGaps,
    territorios_desassistidos: potentialExpansionCities,
    resumo_gap: potentialExpansionCities.length > 0
      ? `Concorrente com buffer de 50km em ${compMunicipio}, deixando gaps desassistidos em ${potentialExpansionCities.map(c => `${c.cidade} (${c.gap_score} pts)`).join(', ')}.`
      : 'Atuação regional restrita ao município sede.'
  };
}

/**
 * Consulta dados cadastrais reais e oficiais de um CNPJ nas APIs públicas (MinhaReceita com fallback para BrasilAPI)
 * NUNCA gera mocks ou dados fictícios: traz razão social, endereço, município, UF e capital social autênticos.
 * @param {string} rawDigits 14 dígitos numéricos do CNPJ
 * @returns {Promise<Object>} Dados oficiais da empresa
 */
export async function fetchOfficialCnpjData(rawDigits) {
  const digits = sanitizeCnpj(rawDigits);
  if (digits.length !== 14) {
    throw new Error('CNPJ inválido para consulta oficial.');
  }

  // Fonte Única da Verdade: delega ao serviço canônico unificado da Receita Federal
  try {
    const result = await receitaService.consultarCnpj(digits, { forceRefresh: true });
    return result;
  } catch (err) {
    console.warn(`[COMPETITOR_CNPJ] Consulta oficial falhou para ${digits}:`, err.message);
    return null;
  }
}


/**
 * Consulta ou cadastra CNPJ avulso como concorrente isolado.
 * 1. Procura primeiro na base local existente no banco (SQLite).
 * 2. Se não existir localmente e manualData estiver preenchido com dados reais, utiliza-os.
 * 3. Se não houver dados, aciona a busca oficial online nas APIs públicas da Receita Federal.
 * 4. NUNCA utiliza valores fictícios de São Paulo/SP ou placeholders genéricos.
 * 
 * @param {string} cnpjInput CNPJ formatado ou bruto
 * @param {Object} manualData Dados complementares opcionais
 * @returns {Promise<Object>} Registro enriquecido do concorrente
 */
export async function lookupOrRegisterCompetitor(cnpjInput, manualData = {}, tenantId = null) {
  const cleanDigits = sanitizeCnpj(cnpjInput);
  if (cleanDigits.length !== 14) {
    throw new Error('CNPJ inválido. Forneça exatamente 14 dígitos numéricos.');
  }

  const formatted = formatCnpj(cleanDigits);
  const resolvedTenant = tenantId || 'tenant-root-default';

  // 1. Verifica se já existe na base local do sistema (para este tenant ou na base compartilhada / root)
  let lead = db.prepare(`
    SELECT * FROM leads 
    WHERE (cnpj_raw = ? OR cnpj = ?) 
      AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
    ORDER BY CASE WHEN tenant_id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).get(cleanDigits, formatted, resolvedTenant, resolvedTenant);

  // Fallback geral: se já existe em qualquer registro da tabela leads (respeitando a restrição UNIQUE global de leads.cnpj)
  if (!lead) {
    lead = db.prepare('SELECT * FROM leads WHERE (cnpj_raw = ? OR cnpj = ?) LIMIT 1').get(cleanDigits, formatted);
  }

  // Verifica se o registro existente possui dados genéricos/mockados ou residuais que necessitam de purge
  const hasMockOrResidualData = lead && (
    lead.razao_social === 'Consulta Avulsa de Concorrente' ||
    (typeof lead.razao_social === 'string' && (
      lead.razao_social.toUpperCase().startsWith('CONCORRENTE CONSULTA') ||
      lead.razao_social.toUpperCase().startsWith('EMPRESA ')
    ))
  );

  if (lead && !hasMockOrResidualData) {
    // Marca como concorrente caso ainda não esteja isolado
    if (!lead.is_competitor || lead.is_competitor === 0) {
      db.prepare('UPDATE leads SET is_competitor = 1 WHERE id = ?').run(lead.id);
      lead.is_competitor = 1;
    }
  } else {
    // 2. Se não está na base local OU possuía dados mockados/residuais, busca dados oficiais reais:
    let realData = null;

    // Se fornecido explicitamente com dados válidos manuais
    if (manualData && manualData.razao_social && manualData.uf && manualData.municipio &&
        manualData.razao_social !== 'Consulta Avulsa de Concorrente' &&
        !manualData.razao_social.toUpperCase().startsWith('CONCORRENTE CONSULTA')) {
      realData = {
        razao_social: manualData.razao_social,
        nome_fantasia: manualData.nome_fantasia || manualData.razao_social,
        cnae_principal_codigo: manualData.cnae_principal_codigo || '4619-2/00',
        cnae_principal_descricao: manualData.cnae_principal_descricao || 'Atividade comercial',
        porte: manualData.porte || 'DEMAIS',
        capital_social: parseFloat(manualData.capital_social) || 0,
        situacao_cadastral: manualData.situacao_cadastral || 'ATIVA',
        municipio: (manualData.municipio || '').toUpperCase().trim(),
        uf: (manualData.uf || '').toUpperCase().trim(),
        logradouro: manualData.logradouro || '',
        numero: manualData.numero || '',
        bairro: manualData.bairro || '',
        cep: manualData.cep || '',
        telefone: manualData.telefone || '',
        email: manualData.email || '',
        qsa: manualData.qsa || []
      };
    } else {
      // Consulta oficial online em tempo real (Receita Federal / MinhaReceita / BrasilAPI)
      realData = await fetchOfficialCnpjData(cleanDigits);
    }

    if (!realData || !realData.uf || !realData.municipio) {
      throw new Error(`CNPJ ${formatted} não localizado na base local e indisponível na consulta oficial da Receita Federal. Verifique a numeração digitada.`);
    }

    const cityKey = `${realData.municipio}/${realData.uf}`;
    const defaultCityCoord = CITY_COORDINATES[cityKey] || { lat: -15.7801, lng: -47.9292 };

    // Geocodificação real do endereço fiscal completo (Nominatim)
    let compCoord = defaultCityCoord;
    try {
      const geoResult = await geocodeFiscalAddress(realData);
      if (geoResult && geoResult.lat && geoResult.lng) {
        compCoord = { lat: geoResult.lat, lng: geoResult.lng };
      }
    } catch (e) {
      compCoord = defaultCityCoord;
    }

    if (lead && hasMockOrResidualData) {
      // Atualiza registro existente no SQLite substituindo dados mockados pelos dados reais oficiais
      db.prepare(`
        UPDATE leads SET
          razao_social = ?, nome_fantasia = ?,
          cnae_principal_codigo = ?, cnae_principal_descricao = ?, porte = ?, capital_social = ?,
          situacao_cadastral = ?, municipio = ?, uf = ?,
          logradouro = ?, numero = ?, bairro = ?, cep = ?, telefone = ?, email = ?, qsa = ?,
          latitude = ?, longitude = ?, is_competitor = 1
        WHERE id = ?
      `).run(
        realData.razao_social, realData.nome_fantasia,
        realData.cnae_principal_codigo, realData.cnae_principal_descricao, realData.porte, realData.capital_social,
        realData.situacao_cadastral, realData.municipio, realData.uf,
        realData.logradouro, realData.numero, realData.bairro, realData.cep, realData.telefone, realData.email,
        JSON.stringify(realData.qsa || []),
        compCoord.lat, compCoord.lng,
        lead.id
      );

      lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id);
    } else {
      const newId = `comp_${cleanDigits}_${Date.now()}`;

      db.prepare(`
        INSERT INTO leads (
          id, tenant_id, cnpj, cnpj_raw, razao_social, nome_fantasia,
          cnae_principal_codigo, cnae_principal_descricao, porte, capital_social,
          target_type, situacao_cadastral, municipio, uf, 
          logradouro, numero, bairro, cep, telefone, email, qsa,
          latitude, longitude, is_competitor, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          'SUPPLIER', ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, 1, datetime('now', 'localtime')
        )
        ON CONFLICT(cnpj) DO UPDATE SET
          is_competitor = 1,
          razao_social = excluded.razao_social,
          nome_fantasia = excluded.nome_fantasia,
          cnae_principal_codigo = excluded.cnae_principal_codigo,
          cnae_principal_descricao = excluded.cnae_principal_descricao,
          porte = excluded.porte,
          capital_social = excluded.capital_social,
          situacao_cadastral = excluded.situacao_cadastral,
          municipio = excluded.municipio,
          uf = excluded.uf,
          logradouro = excluded.logradouro,
          numero = excluded.numero,
          bairro = excluded.bairro,
          cep = excluded.cep,
          telefone = excluded.telefone,
          email = excluded.email,
          qsa = excluded.qsa,
          latitude = COALESCE(excluded.latitude, leads.latitude),
          longitude = COALESCE(excluded.longitude, leads.longitude)
      `).run(
        newId, resolvedTenant, formatted, cleanDigits, realData.razao_social, realData.nome_fantasia,
        realData.cnae_principal_codigo, realData.cnae_principal_descricao, realData.porte, realData.capital_social,
        realData.situacao_cadastral, realData.municipio, realData.uf,
        realData.logradouro, realData.numero, realData.bairro, realData.cep, realData.telefone, realData.email,
        JSON.stringify(realData.qsa || []),
        compCoord.lat, compCoord.lng
      );

      lead = db.prepare('SELECT * FROM leads WHERE (cnpj_raw = ? OR cnpj = ?) LIMIT 1').get(cleanDigits, formatted);
    }
  }

  // 3. Executa diagnóstico de inteligência tática com base nos dados reais
  const enriched = enrichSingleLead(lead);
  const fragility = calculateFragilityIndex(enriched);
  const territorialGaps = mapTerritorialGaps(enriched);
  const discoveryAddress = await resolveRealAddress(enriched);

  return {
    ...enriched,
    is_competitor: 1,
    fragility,
    territorial_gaps: territorialGaps,
    address_discovery_preview: discoveryAddress
  };
}

/**
 * Retorna lista isolada de todos os concorrentes e consultas avulsas de um tenant
 */
export function listCompetitors(tenantId = null) {
  const resolvedTenant = tenantId || 'tenant-root-default';
  const rows = db.prepare(`
    SELECT * FROM leads 
    WHERE is_competitor = 1 AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
    ORDER BY capital_social DESC, razao_social ASC
  `).all(resolvedTenant);

  return rows.map(r => {
    const enriched = enrichSingleLead(r);
    const fragility = calculateFragilityIndex(enriched);
    return {
      ...enriched,
      is_competitor: 1,
      fragility
    };
  });
}

/**
 * Remove concorrente do banco de dados local ou redefine a flag is_competitor
 * @param {string} competitorId ID do registro na tabela leads
 * @param {string} tenantId Tenant do operador
 * @returns {boolean} Sucesso da remoção
 */
export function deleteCompetitor(competitorId, tenantId = null) {
  if (!competitorId) {
    throw new Error('ID do concorrente é obrigatório para remoção.');
  }

  const tenantFilter = tenantId ? ' AND (tenant_id = ? OR tenant_id = \'tenant-root-default\')' : '';
  const queryParams = [competitorId];
  if (tenantId) queryParams.push(tenantId);

  const existing = db.prepare(`SELECT id, is_competitor, cnpj, razao_social, tenant_id FROM leads WHERE id = ?${tenantFilter}`).get(...queryParams);
  if (!existing) {
    throw new Error(`Concorrente com ID "${competitorId}" não encontrado.`);
  }

  // Se o registro foi criado exclusivamente para consulta avulsa (id prefixado por 'comp_'), remove totalmente
  if (existing.id.startsWith('comp_')) {
    db.prepare('DELETE FROM leads WHERE id = ?').run(competitorId);
  } else {
    // Se era um lead de base que foi marcado como concorrente, desmarca a flag is_competitor
    db.prepare('UPDATE leads SET is_competitor = 0 WHERE id = ?').run(competitorId);
  }

  return true;
}

/**
 * Ativa uma seleção de cooperativas, revendas e agroindústrias de referência como concorrentes monitorados
 * @param {string} tenantId Tenant do operador
 * @returns {Object} Total ativado e lista
 */
export function seedReferenceCompetitors(tenantId = null) {
  const resolvedTenant = tenantId || 'tenant-root-default';

  // Seleciona players canônicos estratégicos
  const candidates = db.prepare(`
    SELECT id, cnpj, razao_social, nome_fantasia, municipio, uf, latitude, longitude
    FROM leads 
    WHERE (razao_social LIKE '%COOPERATIVA%' 
       OR razao_social LIKE '%AGROFEL%' 
       OR razao_social LIKE '%COAMO%'
       OR razao_social LIKE '%C.VALE%'
       OR razao_social LIKE '%CCGL%'
       OR razao_social LIKE '%COTRICRUZ%'
       OR razao_social LIKE '%COMIGO%'
       OR razao_social LIKE '%COOPERFARMS%')
       AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
    LIMIT 8
  `).all(resolvedTenant);

  let updated = 0;
  candidates.forEach(c => {
    let lat = c.latitude;
    let lng = c.longitude;
    if (!lat || !lng || (lat === 0 && lng === 0)) {
      const cityKey = `${(c.municipio || '').toUpperCase()}/${(c.uf || '').toUpperCase()}`;
      const fallbackCoord = CITY_COORDINATES[cityKey] || { lat: -28.2628, lng: -52.4067 };
      lat = fallbackCoord.lat;
      lng = fallbackCoord.lng;
      db.prepare('UPDATE leads SET is_competitor = 1, latitude = ?, longitude = ? WHERE id = ?').run(lat, lng, c.id);
    } else {
      db.prepare('UPDATE leads SET is_competitor = 1 WHERE id = ?').run(c.id);
    }
    updated++;
  });

  return {
    success: true,
    count: updated,
    competitors: candidates
  };
}

/**
 * Executa Varredura Regional Autônoma de Concorrentes por Estado e Segmento
 * @param {Object} params { uf, segmento, buffer_km, tenant_id }
 * @returns {Object} Resultado com total ativado, concorrentes e cálculo de gaps atualizado
 */
export function runRegionalCompetitorSweep({ uf = 'TODOS', segmento = 'TODOS', buffer_km = 50, tenant_id = null, tenantId = null }) {
  const resolvedTenant = tenant_id || tenantId || 'tenant-root-default';
  const effectiveUf = (uf || 'TODOS').toUpperCase().trim();
  const effectiveSegmento = (segmento || 'TODOS').toUpperCase().trim();
  const bufferKm = parseFloat(buffer_km) || 50;

  let query = `
    SELECT id, cnpj, razao_social, nome_fantasia, municipio, uf, latitude, longitude, capital_social, porte
    FROM leads 
    WHERE (tenant_id = ? OR tenant_id = 'tenant-root-default')
  `;
  const params = [resolvedTenant];

  if (effectiveUf !== 'TODOS') {
    query += ` AND uf = ?`;
    params.push(effectiveUf);
  }

  if (effectiveSegmento === 'MAQUINARIO') {
    query += ` AND (cnae_principal_codigo LIKE '4661%' OR cnae_principal_descricao LIKE '%MAQUINA%' OR cnae_principal_descricao LIKE '%EQUIPAMENTO%' OR razao_social LIKE '%MAQUINAS%' OR razao_social LIKE '%TRATORES%')`;
  } else if (effectiveSegmento === 'INSUMOS') {
    query += ` AND (cnae_principal_codigo LIKE '4683%' OR cnae_principal_descricao LIKE '%DEFENSIVO%' OR cnae_principal_descricao LIKE '%ADUBO%' OR cnae_principal_descricao LIKE '%FERTILIZANTE%' OR cnae_principal_descricao LIKE '%INSUMO%' OR razao_social LIKE '%AGROCOMERCIAL%' OR razao_social LIKE '%DEFENSIVOS%')`;
  } else if (effectiveSegmento === 'COOPERATIVAS') {
    query += ` AND (razao_social LIKE '%COOPERATIVA%' OR nome_fantasia LIKE '%COOPERATIVA%' OR razao_social LIKE '%COOP%' OR cnae_principal_descricao LIKE '%COOPERATIVA%')`;
  } else {
    // TODOS: Operações estruturadas agro / revendas / concessionárias
    query += ` AND (razao_social LIKE '%COOPERATIVA%' OR razao_social LIKE '%AGRO%' OR razao_social LIKE '%MAQUINAS%' OR razao_social LIKE '%S.A.%' OR cnae_principal_codigo LIKE '4661%' OR cnae_principal_codigo LIKE '4683%')`;
  }

  query += ` LIMIT 50`;

  const candidates = db.prepare(query).all(...params);

  let countActivated = 0;
  candidates.forEach(c => {
    let lat = c.latitude;
    let lng = c.longitude;
    if (!lat || !lng || (lat === 0 && lng === 0)) {
      const cityKey = `${(c.municipio || '').toUpperCase()}/${(c.uf || '').toUpperCase()}`;
      const fallbackCoord = CITY_COORDINATES[cityKey] || { lat: -28.2628, lng: -52.4067 };
      lat = fallbackCoord.lat;
      lng = fallbackCoord.lng;
      db.prepare('UPDATE leads SET is_competitor = 1, latitude = ?, longitude = ? WHERE id = ?').run(lat, lng, c.id);
    } else {
      db.prepare('UPDATE leads SET is_competitor = 1 WHERE id = ?').run(c.id);
    }
    countActivated++;
  });

  // Recalcula imediatamente os gaps com os concorrentes atualizados
  const updatedGaps = calculateMarketGaps({
    competitor_id: null,
    buffer_km: bufferKm,
    tenant_id: resolvedTenant
  });

  const allActiveCompetitors = listCompetitors(resolvedTenant);

  return {
    success: true,
    uf: effectiveUf,
    segmento: effectiveSegmento,
    buffer_km: bufferKm,
    count_activated: countActivated,
    total_competitors: allActiveCompetitors.length,
    total_gaps: updatedGaps.length,
    competitors: allActiveCompetitors,
    gaps: updatedGaps
  };
}

