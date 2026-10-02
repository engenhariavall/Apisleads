/**
 * FASE 16: INTELIGÊNCIA CADASTRAL PROFUNDA (PADRÃO VERSUS)
 * Módulo: Motor de Taxonomia Proprietária (categoryResolver.js)
 * 
 * Analisa semanticamente Razão Social, Nome Fantasia, CNAE Principal e
 * a lista completa de CNAEs Secundários para inferir a "categoria_real" da empresa.
 * Identifica e resolve divergências operacionais (ex: empresas cadastradas com CNAE
 * primário de Holding ou Consultoria que operam de fato no Agro, Saúde, Construção, etc.).
 */

// Catálogo de domínios econômicos prioritários com palavras-chave e faixas de CNAE
const CANONICAL_CATEGORIES = [
  {
    id: 'AGRO',
    canonicalName: 'Agronegócio & Produção Rural',
    cnaePrefixes: ['01', '02', '03'],
    keywords: [
      'AGRO', 'AGRICOLA', 'AGROPECUARIA', 'FAZENDA', 'AGROPECUARIO', 'GRAOS', 'SOJA',
      'MILHO', 'ALGODAO', 'CAFE', 'CULTIVO', 'GADO', 'BOVINOS', 'PECUARIA', 'SUINOS',
      'AVES', 'SEMENTES', 'HARAS', 'SILOS', 'PRODUCAO RURAL', 'AGRONEGOCIO', 'COOPERATIVA AGRO'
    ],
    weightModifier: 1.2
  },
  {
    id: 'SAUDE',
    canonicalName: 'Clínica & Serviços de Saúde',
    cnaePrefixes: ['86', '87', '75'],
    keywords: [
      'CLINICA', 'HOSPITAL', 'MEDICA', 'MEDICO', 'MEDICINA', 'SAUDE', 'ODONTO', 'ODONTOLOGIA',
      'DIAGNOSTICO', 'LABORATORIO', 'EXAMES', 'TERAPIA', 'FISIOTERAPIA', 'PEDIATRIA',
      'CARDIOLOGIA', 'OFTALMOLOGIA', 'ORTOPEDIA', 'CIRURGIA', 'PSICOLOGIA', 'CENTRO MEDICO'
    ],
    weightModifier: 1.2
  },
  {
    id: 'CONSTRUCAO',
    canonicalName: 'Engenharia & Construção Civil',
    cnaePrefixes: ['41', '42', '43', '71'],
    keywords: [
      'CONSTRUTORA', 'CONSTRUCAO', 'CONSTRUCOES', 'ENGENHARIA', 'OBRAS', 'EDIFICACOES',
      'INCORPORADORA', 'PAVIMENTACAO', 'TERRAPLANAGEM', 'REFORMAS', 'EMPREENDIMENTOS IMOBILIARIOS',
      'ESTRUTURAS', 'FUNDACOES', 'CIVIL', 'ARQUITETURA'
    ],
    weightModifier: 1.15
  },
  {
    id: 'JURIDICO',
    canonicalName: 'Advocacia & Serviços Jurídicos',
    cnaePrefixes: ['691', '69.1'],
    keywords: [
      'ADVOGADOS', 'ADVOCACIA', 'ADVOGADO', 'JURIDICO', 'JURIDICA', 'SOCIEDADE DE ADVOGADOS',
      'DIREITO', 'ASSESSORIA JURIDICA', 'CONSULTORIA JURIDICA', 'TRIBUTARIO', 'CONTENCIOSO'
    ],
    weightModifier: 1.2
  },
  {
    id: 'TECH',
    canonicalName: 'Tecnologia da Informação & Software',
    cnaePrefixes: ['62', '63'],
    keywords: [
      'SOFTWARE', 'TECH', 'TECNOLOGIA', 'SISTEMAS', 'INFORMATICA', 'DIGITAL', 'PLATAFORMA',
      'SOLUCOES DIGITAIS', 'SAAS', 'CLOUD', 'DADOS', 'INTELIGENCIA ARTIFICIAL', 'CYBER', 'APLICATIVOS'
    ],
    weightModifier: 1.15
  },
  {
    id: 'RESTAURANTE',
    canonicalName: 'Restaurante & Gastronomia',
    cnaePrefixes: ['56'],
    keywords: [
      'RESTAURANTE', 'GASTRONOMIA', 'LANCHONETE', 'CHURRASCARIA', 'PIZZARIA', 'BAR',
      'BUFFET', 'PADARIA', 'HAMBURGUERIA', 'ALIMENTACAO', 'BISTRO', 'CAFE'
    ],
    weightModifier: 1.1
  },
  {
    id: 'INDUSTRIA',
    canonicalName: 'Indústria & Manufatura',
    cnaePrefixes: ['10', '11', '13', '14', '15', '16', '17', '18', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33'],
    keywords: [
      'INDUSTRIA', 'FABRICA', 'MANUFATURA', 'METALURGICA', 'TEXTIL', 'QUIMICA', 'MAQUINAS',
      'EQUIPAMENTOS', 'PLASTICOS', 'ARTEFATOS', 'EMBALAGENS', 'ESTAMPARIA', 'USINAGEM'
    ],
    weightModifier: 1.05
  },
  {
    id: 'LOGISTICA',
    canonicalName: 'Transporte & Logística',
    cnaePrefixes: ['49', '50', '51', '52', '53'],
    keywords: [
      'TRANSPORTES', 'TRANSPORTE', 'LOGISTICA', 'FRETES', 'CARGAS', 'ARMAZENS',
      'DISTRIBUIDORA', 'FROTAS', 'EXPRESS', 'ENTREGAS', 'RODOVIARIO', 'LOG'
    ],
    weightModifier: 1.1
  },
  {
    id: 'VAREJO',
    canonicalName: 'Comércio Varejista & Atacadista',
    cnaePrefixes: ['45', '46', '47'],
    keywords: [
      'COMERCIO', 'VAREJO', 'ATACADO', 'LOJA', 'SUPERMERCADO', 'MAGAZINE', 'AUTOPECAS',
      'CONCESSIONARIA', 'DISTRIBUICAO', 'UTILIDADES', 'BOUTIQUE'
    ],
    weightModifier: 1.0
  },
  {
    id: 'FINANCEIRO',
    canonicalName: 'Serviços Financeiros & Holdings',
    cnaePrefixes: ['64', '65', '66', '70'],
    keywords: [
      'HOLDING', 'PARTICIPACOES', 'INVESTIMENTOS', 'GESTAO DE ATIVOS', 'CONSULTORIA',
      'FOMENTO', 'FACTORING', 'SECURITIZADORA', 'CAPITAL'
    ],
    weightModifier: 0.95
  }
];

// CNAEs reconhecidamente genéricos ou secundários em cadastros empresariais
const GENERIC_CNAES = new Set([
  '6462-0/00', '64.62-0-00', // Holdings de instituições não financeiras
  '7020-4/00', '70.20-4-00', // Consultoria em gestão empresarial
  '6810-2/02', '68.10-2-02', // Aluguel de imóveis próprios
  '6810-2/01', '68.10-2-01', // Compra e venda de imóveis próprios
  '8211-3/00', '82.11-3-00', // Serviços combinados de escritório e apoio administrativo
  '7490-1/04', '74.90-1-04', // Atividades de intermediação e agenciamento de serviços e negócios em geral
  '8299-7/99', '82.99-7-99'  // Outras atividades de serviços prestados principalmente às empresas
]);

/**
 * Normaliza strings para análise semântica (remove acentos, pontuação e caixa alta)
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza código CNAE (remove pontos, barras, traços)
 */
function normalizeCnae(cnae) {
  if (!cnae || typeof cnae !== 'string') return '';
  return cnae.replace(/\D/g, '');
}

/**
 * Resolve a categoria real de um lead cruzando múltiplas fontes de dados cadastrais
 * 
 * @param {Object} lead Objeto com dados do lead
 * @returns {Object} Resultado com categoria_real, flags e nível de confiança
 */
export function resolveRealCategory(lead) {
  if (!lead) {
    return {
      categoria_real: 'Geral & Não Classificado',
      categoria_id: 'GERAL',
      divergencia_cadastral: false,
      origem_resolucao: 'INDEFINIDO',
      nivel_confianca: 0,
      justificativa: 'Lead não fornecido para classificação.'
    };
  }

  const razaoSocial = cleanText(lead.razao_social || '');
  const nomeFantasia = cleanText(lead.nome_fantasia || '');

  const cnaePrincipalCod = lead.cnae_principal_codigo || '';
  const cnaePrincipalNorm = normalizeCnae(cnaePrincipalCod);
  const cnaePrincipalDesc = cleanText(lead.cnae_principal_descricao || '');

  // Extrai lista de CNAEs secundários
  let secondaryCnaes = [];
  if (lead.cnaes_secundarios) {
    if (Array.isArray(lead.cnaes_secundarios)) {
      secondaryCnaes = lead.cnaes_secundarios;
    } else if (typeof lead.cnaes_secundarios === 'string') {
      try {
        secondaryCnaes = JSON.parse(lead.cnaes_secundarios);
      } catch (e) {
        secondaryCnaes = [];
      }
    }
  }

  const isPrimaryGeneric = GENERIC_CNAES.has(cnaePrincipalCod) ||
    cnaePrincipalNorm.startsWith('6462') ||
    cnaePrincipalNorm.startsWith('7020') ||
    cnaePrincipalNorm.startsWith('8211');

  // Pontuação por categoria
  const scores = {};
  const matchedKeywords = {};
  const matchedCnaes = {};

  CANONICAL_CATEGORIES.forEach(cat => {
    scores[cat.id] = 0;
    matchedKeywords[cat.id] = [];
    matchedCnaes[cat.id] = [];

    // 1. Verificação do CNAE Principal
    const primaryMatchesPrefix = cat.cnaePrefixes.some(pref => {
      const cleanPref = pref.replace(/\D/g, '');
      return cnaePrincipalNorm.startsWith(cleanPref);
    });

    if (primaryMatchesPrefix) {
      // Se for holding/genérico, o peso do CNAE primário é reduzido para dar espaço à atividade real
      const cnaeWeight = isPrimaryGeneric ? 15 : 50;
      scores[cat.id] += cnaeWeight;
      matchedCnaes[cat.id].push({ type: 'PRIMARY', code: cnaePrincipalCod, desc: cnaePrincipalDesc });
    }

    // 2. Verificação de Palavras-Chave no Nome Fantasia e Razão Social
    cat.keywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      let points = 0;
      if (nomeFantasia && regex.test(nomeFantasia)) {
        points += 35; // Nome Fantasia tem altíssimo peso de identificação de marca
      }
      if (razaoSocial && regex.test(razaoSocial)) {
        points += 25; // Razão social
      }
      if (points > 0) {
        scores[cat.id] += points;
        matchedKeywords[cat.id].push(kw);
      }
    });

    // 3. Verificação de CNAEs Secundários
    secondaryCnaes.forEach(sec => {
      const secCode = typeof sec === 'string' ? sec : (sec.codigo || sec.code || '');
      const secDesc = cleanText(typeof sec === 'string' ? '' : (sec.descricao || sec.description || ''));
      const secNorm = normalizeCnae(secCode);

      const secMatches = cat.cnaePrefixes.some(pref => {
        const cleanPref = pref.replace(/\D/g, '');
        return secNorm.startsWith(cleanPref);
      });

      if (secMatches) {
        scores[cat.id] += 15; // Cada secundário aderente soma pontos
        matchedCnaes[cat.id].push({ type: 'SECONDARY', code: secCode, desc: secDesc });
      }
    });

    // Aplica o modificador da categoria
    scores[cat.id] = Math.round(scores[cat.id] * cat.weightModifier);
  });

  // Encontra a categoria com maior pontuação
  let bestCatId = null;
  let highestScore = -1;

  Object.entries(scores).forEach(([id, score]) => {
    if (score > highestScore) {
      highestScore = score;
      bestCatId = id;
    }
  });

  const bestCategory = CANONICAL_CATEGORIES.find(c => c.id === bestCatId);

  // Se a pontuação for muito baixa, verifica se há alinhamento com vertical_type pré-definida
  if ((!bestCategory || highestScore < 15) && lead.vertical_type && lead.vertical_type !== 'GERAL') {
    const verticalMapping = {
      'AGRO': 'AGRO',
      'SAUDE': 'SAUDE',
      'CONSTRUCAO': 'CONSTRUCAO',
      'JURIDICO': 'JURIDICO'
    };
    const mappedId = verticalMapping[lead.vertical_type];
    if (mappedId) {
      const vCat = CANONICAL_CATEGORIES.find(c => c.id === mappedId);
      if (vCat) {
        return {
          categoria_real: vCat.canonicalName,
          categoria_id: vCat.id,
          divergencia_cadastral: false,
          origem_resolucao: 'VERTICAL_FUSION_DATA',
          nivel_confianca: 82,
          justificativa: `Enriquecido via fusão de bases especializadas setoriais (${lead.vertical_type}).`,
          palavras_chave: [],
          cnaes_relevantes: []
        };
      }
    }
  }

  // Se ainda assim não houver pontuação, recorre ao CNAE Principal ou Geral
  if (!bestCategory || highestScore < 15) {
    const fallbackTitle = lead.cnae_principal_descricao
      ? `${lead.cnae_principal_descricao.slice(0, 45)}...`
      : 'Atividade Geral B2B';

    return {
      categoria_real: fallbackTitle,
      categoria_id: 'GERAL',
      divergencia_cadastral: false,
      origem_resolucao: 'CNAE_PRIMARIO_PADRAO',
      nivel_confianca: 65,
      justificativa: 'Atividade operacional classificada diretamente pelo CNAE primário da Receita Federal.',
      palavras_chave: [],
      cnaes_relevantes: []
    };
  }

  // Verifica se há divergência cadastral real
  const primaryBelongsToWinner = bestCategory.cnaePrefixes.some(pref => {
    const cleanPref = pref.replace(/\D/g, '');
    return cnaePrincipalNorm.startsWith(cleanPref);
  });

  const hasNameEvidence = (matchedKeywords[bestCatId] && matchedKeywords[bestCatId].length > 0);
  const hasSecondaryEvidence = (matchedCnaes[bestCatId] && matchedCnaes[bestCatId].some(c => c.type === 'SECONDARY'));

  const isDivergent = (!primaryBelongsToWinner && (hasNameEvidence || hasSecondaryEvidence)) ||
    (isPrimaryGeneric && (hasNameEvidence || hasSecondaryEvidence));

  let origemResolucao = 'CONVERGENCIA_TOTAL';
  let justificativa = `Operação e marca convergem diretamente para ${bestCategory.canonicalName}.`;

  if (isDivergent) {
    if (hasNameEvidence && hasSecondaryEvidence) {
      origemResolucao = 'SEMANTICA_NOME_E_CNAES_SECUNDARIOS';
      justificativa = `CNAE primário formal (${cnaePrincipalCod}) difere da operação real indicada pelo nome fantasia e ${matchedCnaes[bestCatId].length} CNAE(s) secundário(s).`;
    } else if (hasNameEvidence) {
      origemResolucao = 'SEMANTICA_NOME_FANTASIA';
      justificativa = `Identidade corporativa e marca (${matchedKeywords[bestCatId].join(', ')}) confirmam atuação real no segmento de ${bestCategory.canonicalName}.`;
    } else {
      origemResolucao = 'CNAE_SECUNDARIO_PREPONDERANTE';
      justificativa = `Lista de CNAEs secundários revela forte especialização operacional em ${bestCategory.canonicalName}.`;
    }
  }

  const confidence = Math.min(99, Math.max(72, Math.round(55 + (highestScore / 2))));

  return {
    categoria_real: bestCategory.canonicalName,
    categoria_id: bestCategory.id,
    divergencia_cadastral: isDivergent,
    origem_resolucao: origemResolucao,
    nivel_confianca: confidence,
    justificativa,
    palavras_chave: matchedKeywords[bestCatId] || [],
    cnaes_relevantes: matchedCnaes[bestCatId] || []
  };
}
