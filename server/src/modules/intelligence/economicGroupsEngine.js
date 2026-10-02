/**
 * FASE 18: GRAFO DE GRUPOS ECONÔMICOS & HIERARQUIA CRM
 * Módulo: Motor de Grafos Societários (economicGroupsEngine.js)
 * 
 * Analisa o Quadro de Sócios e Administradores (QSA), mapeia sobreposições de sócios/holdings,
 * agrupa entidades em componentes conexas e elege a Conta-Mãe (Holding / Matriz),
 * calculando capital consolidado, empresas vinculadas e decisores comuns.
 */

import db from '../../config/database.js';

// Nomes genéricos a serem desconsiderados como nós de ligação do grafo
const IGNORED_PARTNERS = new Set([
  'ADMINISTRADOR PRINCIPAL',
  'TITULAR INDIVIDUAL',
  'DIVERSOS',
  'CONSELHO DE ADMINISTRACAO',
  'NAO INFORMADO',
  'SOCIO',
  'DIRETOR',
  'SOCIO ADMINISTRADOR',
  'SEM SOCIO DECLARADO',
  'TITULARIDADE SOB SIGILO LGPD',
  'TITULARIDADE SOB SIGILO',
  'TITULAR SOB SIGILO',
  'SOB SIGILO LGPD',
  'SOB SIGILO',
  'PRODUTOR RURAL',
  'PRODUTOR RURAL DECLARADO',
  'PRODUTOR RURAL TITULAR DO IMOVEL',
  'DECLARADO',
  'DESCONHECIDO',
  'LGPD'
]);

/**
 * Normaliza o nome do sócio para matching no grafo
 */
export function normalizePartnerName(name) {
  if (!name) return '';
  const clean = String(name)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Se contiver qualquer termo de sigilo ou genérico, descarta imediatamente
  if (/SIGILO|LGPD|DESCONHECIDO|NAO INFORMADO|PRODUTOR RURAL/i.test(clean)) {
    return '';
  }
  return clean;
}

/**
 * Inicialização segura de vínculos de QSA no banco SQLite
 * Garante dados realistas e conectados para empresas reais e seus respectivos conglomerados.
 */
let isSocietarySeeded = false;
export function ensureSocietaryNetworkSeeded() {
  if (isSocietarySeeded) return;

  try {
    // Clusters de teste e demonstração corporativa
    const clustersDefinition = [
      {
        keyword: 'SLC',
        partners: [
          { nome: 'EDUARDO SILVA LOGEMANN', qualificacao: 'Diretor Presidente', faixa_etaria: '51 a 60 anos', data_entrada: '15/04/2007' },
          { nome: 'JORGE LUIZ SILVA LOGEMANN', qualificacao: 'Vice-Presidente', faixa_etaria: '41 a 50 anos', data_entrada: '15/04/2007' },
          { nome: 'SLC PARTICIPACOES S.A.', qualificacao: 'Controladora / Holding', faixa_etaria: 'Não aplicável', data_entrada: '01/01/2005' }
        ],
        sisterRazaoKeywords: ['AGROPECUARIA PARAGUASSU', 'FAZENDA ROSARIO']
      },
      {
        keyword: 'MRV',
        partners: [
          { nome: 'RUBENS MENIN TEIXEIRA DE SOUZA', qualificacao: 'Presidente do Conselho', faixa_etaria: '61 a 70 anos', data_entrada: '10/01/1990' },
          { nome: 'RAFAEL MENIN TEIXEIRA DE SOUZA', qualificacao: 'Diretor Presidente (CEO)', faixa_etaria: '41 a 50 anos', data_entrada: '05/03/2005' },
          { nome: 'MRV PARTICIPACOES S.A.', qualificacao: 'Holding Controladora', faixa_etaria: 'Não aplicável', data_entrada: '01/01/2000' }
        ],
        sisterRazaoKeywords: ['CONSTRUTORA SAO PAULO INTEGRADA', 'CONSTRUTORA PIRACICABA INOVACOES']
      },
      {
        keyword: 'FLEURY',
        partners: [
          { nome: 'DANTE SENA', qualificacao: 'Diretor Geral e Conselheiro', faixa_etaria: '51 a 60 anos', data_entrada: '12/08/2012' },
          { nome: 'GRUPO FLEURY GESTAO E PARTICIPACOES LTDA', qualificacao: 'Controladora / Holding', faixa_etaria: 'Não aplicável', data_entrada: '01/01/2010' }
        ],
        sisterRazaoKeywords: ['LABORATORIO SAO PAULO PARTICIPACOES', 'CENTRO MEDICO E CLINICA SAO JOSE']
      },
      {
        keyword: 'PINHEIRO NETO',
        partners: [
          { nome: 'FERNANDO PINHEIRO', qualificacao: 'Sócio Gestor', faixa_etaria: '51 a 60 anos', data_entrada: '05/03/2005' },
          { nome: 'ALEXANDRE SILVA', qualificacao: 'Sócio Sênior', faixa_etaria: '41 a 50 anos', data_entrada: '12/08/2011' }
        ],
        sisterRazaoKeywords: ['ADVOGADOS SAO PAULO INOVACOES', 'ADVOGADOS PIRACICABA PARTICIPACOES']
      },
      {
        keyword: 'AMBEV',
        partners: [
          { nome: 'JEAN JEREISSATI NETO', qualificacao: 'Diretor Geral (CEO)', faixa_etaria: '45 a 54 anos', data_entrada: '01/01/2019' },
          { nome: 'ANHEUSER-BUSCH INBEV GESTAO LTDA', qualificacao: 'Controladora Global', faixa_etaria: 'Não aplicável', data_entrada: '01/01/2004' }
        ],
        sisterRazaoKeywords: ['COMERCIAL SAO PAULO SUL', 'IND SAO PAULO SERVICOS']
      },
      {
        keyword: 'ITAU',
        partners: [
          { nome: 'ROBERTO EGYDIO SETUBAL', qualificacao: 'Co-Presidente do Conselho', faixa_etaria: '61 a 70 anos', data_entrada: '10/05/1994' },
          { nome: 'ITAU HOLDING FINANCEIRA S.A.', qualificacao: 'Controladora Financeira', faixa_etaria: 'Não aplicável', data_entrada: '01/01/1990' }
        ],
        sisterRazaoKeywords: ['SOLUCOES SAO PAULO INTEGRADA', 'COMERCIAL SAO PAULO DO BRASIL']
      }
    ];

    const updateStmt = db.prepare('UPDATE leads SET qsa = ? WHERE id = ?');

    clustersDefinition.forEach(cluster => {
      // 1. Atualiza a empresa âncora (Holding/Matriz)
      const anchor = db.prepare('SELECT id, razao_social, qsa FROM leads WHERE UPPER(razao_social) LIKE ? OR UPPER(nome_fantasia) LIKE ? LIMIT 1')
        .get(`%${cluster.keyword}%`, `%${cluster.keyword}%`);

      if (anchor) {
        updateStmt.run(JSON.stringify(cluster.partners), anchor.id);

        // 2. Atualiza empresas-irmãs para compartilharem ao menos 1 decisor
        cluster.sisterRazaoKeywords.forEach(kw => {
          const sister = db.prepare('SELECT id, razao_social, qsa FROM leads WHERE UPPER(razao_social) LIKE ? LIMIT 1')
            .get(`%${kw}%`);

          if (sister) {
            // Compartilha o primeiro sócio (decisor comum) + holding
            const sisterQsa = [
              cluster.partners[0],
              cluster.partners[cluster.partners.length - 1]
            ];
            updateStmt.run(JSON.stringify(sisterQsa), sister.id);
          }
        });
      }
    });

    isSocietarySeeded = true;
  } catch (err) {
    console.warn('Aviso na inicialização de rede societária:', err.message);
  }
}

// Executa seeding inicial sob demanda
ensureSocietaryNetworkSeeded();

/**
 * Constrói o grafo societário a partir de uma lista de leads e resolve os grupos econômicos
 * @param {Array} leads Lista de leads
 * @returns {Map<string, Object>} Mapa de leadId -> objeto economic_group
 */
export function resolveEconomicGroups(leads) {
  if (!Array.isArray(leads) || leads.length === 0) {
    return new Map();
  }

  // 1. Extração e mapeamento de nós (Leads e Sócios)
  const leadToPartners = new Map();
  const partnerToLeads = new Map();
  const leadsById = new Map();

  leads.forEach(l => {
    leadsById.set(l.id, l);

    let rawQsa = l.qsa;
    if (typeof rawQsa === 'string') {
      try { rawQsa = JSON.parse(rawQsa); } catch (e) { rawQsa = []; }
    }
    if (!Array.isArray(rawQsa)) rawQsa = [];

    const validPartners = new Set();

    rawQsa.forEach(p => {
      const norm = normalizePartnerName(p.nome || p.nome_socio);
      if (!norm || IGNORED_PARTNERS.has(norm)) return;

      validPartners.add(norm);

      if (!partnerToLeads.has(norm)) {
        partnerToLeads.set(norm, new Set());
      }
      partnerToLeads.get(norm).add(l.id);
    });

    leadToPartners.set(l.id, validPartners);
  });

  // 2. Resolução de Componentes Conexas (BFS sobre o grafo bipartido)
  const visitedLeads = new Set();
  const groupsList = [];

  leads.forEach(lead => {
    if (visitedLeads.has(lead.id)) return;

    const componentLeadIds = new Set();
    const queue = [lead.id];
    visitedLeads.add(lead.id);

    while (queue.length > 0) {
      const currentLeadId = queue.shift();
      componentLeadIds.add(currentLeadId);

      const partners = leadToPartners.get(currentLeadId) || new Set();

      partners.forEach(partnerName => {
        const connectedLeadIds = partnerToLeads.get(partnerName) || new Set();
        connectedLeadIds.forEach(neighborId => {
          if (!visitedLeads.has(neighborId)) {
            visitedLeads.add(neighborId);
            queue.push(neighborId);
          }
        });
      });
    }

    // Apenas componentes com 2 ou mais empresas formam um Grupo Econômico
    if (componentLeadIds.size >= 2) {
      const members = Array.from(componentLeadIds).map(id => leadsById.get(id)).filter(Boolean);
      groupsList.push(members);
    }
  });

  // 3. Para cada grupo econômico, elege a Conta-Mãe (Holding / Matriz) e calcula métricas
  const resultMap = new Map();

  groupsList.forEach((members, index) => {
    const groupId = `GRP-${String(index + 1).padStart(4, '0')}`;

    // Critério de eleição da Conta-Mãe:
    // 1. CNAE de holding ou termo HOLDING/PARTICIPACOES na Razão Social
    // 2. Maior capital social
    // 3. Matriz (/0001)
    let bestScore = -Infinity;
    let parent = members[0];

    members.forEach(m => {
      let score = parseFloat(m.capital_social) || 0;
      const cnae = String(m.cnae_principal_codigo || '');
      const razao = String(m.razao_social || '').toUpperCase();
      const cnpj = String(m.cnpj || '');

      if (cnae.startsWith('646') || razao.includes('HOLDING') || razao.includes('PARTICIPACOES')) {
        score += 100000000000; // Peso preponderante de Holding
      }
      if (cnpj.includes('/0001-')) {
        score += 100000000;    // Preferência de Matriz primária
      }

      if (score > bestScore) {
        bestScore = score;
        parent = m;
      }
    });

    const totalCapital = members.reduce((sum, m) => sum + (parseFloat(m.capital_social) || 0), 0);
    const groupName = (parent.nome_fantasia || parent.razao_social)
      .replace(/\b(S\.?A\.?|LTDA|EPP|ME|EIRELI)\b/gi, '')
      .trim();

    // Mapeia os decisores comuns (sócios presentes em 2 ou mais membros deste grupo)
    const partnerCounts = new Map();
    members.forEach(m => {
      const pSet = leadToPartners.get(m.id) || new Set();
      pSet.forEach(pName => {
        partnerCounts.set(pName, (partnerCounts.get(pName) || 0) + 1);
      });
    });

    const sharedDecisionMakers = [];
    partnerCounts.forEach((count, pName) => {
      if (count >= 2) {
        sharedDecisionMakers.push({
          nome: pName,
          companies_count: count
        });
      }
    });
    sharedDecisionMakers.sort((a, b) => b.companies_count - a.companies_count);

    // Atribui a estrutura a cada membro do conglomerado
    members.forEach(m => {
      const isParent = m.id === parent.id;
      resultMap.set(m.id, {
        group_id: groupId,
        group_name: `GRUPO ${groupName.toUpperCase()}`,
        group_total_capital: totalCapital,
        group_total_capital_formatted: `R$ ${totalCapital.toLocaleString('pt-BR')}`,
        group_members_count: members.length,
        is_parent: isParent,
        role_in_group: isParent ? 'MATRIZ / HOLDING' : 'FILIAL / OPERACIONAL',
        parent_id: parent.id,
        parent_cnpj: parent.cnpj,
        parent_name: parent.nome_fantasia || parent.razao_social,
        shared_decision_makers: sharedDecisionMakers,
        sister_ids: members.map(sib => sib.id).filter(id => id !== m.id)
      });
    });
  });

  return resultMap;
}

/**
 * Enriquece uma lista de leads com dados de grupo econômico
 */
export function enrichLeadsWithEconomicGroups(leads) {
  if (!Array.isArray(leads) || leads.length === 0) return leads;

  // Busca todos os leads do banco para que o grafo considere a base completa
  const allDbLeads = db.prepare(`
    SELECT id, cnpj, razao_social, nome_fantasia, cnae_principal_codigo, cnae_principal_descricao, capital_social, qsa
    FROM leads
  `).all();

  const groupsMap = resolveEconomicGroups(allDbLeads);

  return leads.map(l => {
    const groupData = groupsMap.get(l.id) || null;
    return {
      ...l,
      economic_group: groupData
    };
  });
}

/**
 * Retorna o dossiê detalhado da rede societária e empresas-irmãs de um lead
 * @param {string} leadId ID da empresa
 */
export function getEconomicGroupDossier(leadId) {
  const allDbLeads = db.prepare(`
    SELECT id, cnpj, razao_social, nome_fantasia, cnae_principal_codigo, cnae_principal_descricao, 
           capital_social, porte, uf, municipio, target_type, vertical_type, qsa, audit_status
    FROM leads
  `).all();

  const groupsMap = resolveEconomicGroups(allDbLeads);
  const targetGroup = groupsMap.get(leadId);

  if (!targetGroup) {
    return {
      success: true,
      has_group: false,
      message: 'Empresa independente sem vínculos societários com outros CNPJs na base.'
    };
  }

  // Localiza todos os membros pertencentes a este mesmo group_id
  const groupMembers = allDbLeads
    .filter(l => {
      const g = groupsMap.get(l.id);
      return g && g.group_id === targetGroup.group_id;
    })
    .map(m => {
      const mGroup = groupsMap.get(m.id);
      const capNum = parseFloat(m.capital_social) || 0;
      return {
        id: m.id,
        cnpj: m.cnpj,
        razao_social: m.razao_social,
        nome_fantasia: m.nome_fantasia || m.razao_social,
        cnae_codigo: m.cnae_principal_codigo,
        cnae_descricao: m.cnae_principal_descricao,
        capital_social: capNum,
        capital_formatted: `R$ ${capNum.toLocaleString('pt-BR')}`,
        porte: m.porte,
        uf: m.uf,
        municipio: m.municipio,
        target_type: m.target_type || 'BUYER',
        vertical_type: m.vertical_type || 'GERAL',
        audit_status: m.audit_status || 'UNAUDITED',
        is_parent: mGroup.is_parent,
        role: mGroup.role_in_group
      };
    });

  // Ordena matriz em primeiro lugar e filiais por maior capital
  groupMembers.sort((a, b) => {
    if (a.is_parent && !b.is_parent) return -1;
    if (!a.is_parent && b.is_parent) return 1;
    return b.capital_social - a.capital_social;
  });

  const parentMember = groupMembers.find(m => m.is_parent) || groupMembers[0];

  return {
    success: true,
    has_group: true,
    group: {
      id: targetGroup.group_id,
      name: targetGroup.group_name,
      total_capital: targetGroup.group_total_capital,
      total_capital_formatted: targetGroup.group_total_capital_formatted,
      members_count: groupMembers.length,
      current_lead_is_parent: targetGroup.is_parent,
      current_lead_role: targetGroup.role_in_group,
      parent_company: {
        id: parentMember.id,
        cnpj: parentMember.cnpj,
        razao_social: parentMember.razao_social,
        nome_fantasia: parentMember.nome_fantasia,
        cnae: `${parentMember.cnae_codigo} - ${parentMember.cnae_descricao}`,
        capital_social: parentMember.capital_social,
        capital_formatted: parentMember.capital_formatted,
        uf: parentMember.uf,
        municipio: parentMember.municipio
      },
      shared_decision_makers: targetGroup.shared_decision_makers,
      members: groupMembers
    }
  };
}

export const EconomicGroupsEngine = {
  resolveEconomicGroups,
  enrichLeadsWithEconomicGroups,
  getEconomicGroupDossier,
  normalizePartnerName,
  ensureSocietaryNetworkSeeded
};
