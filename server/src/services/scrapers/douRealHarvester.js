/**
 * server/src/services/scrapers/douRealHarvester.js
 * 
 * MOTOR DE CAPTURA REAL E AO VIVO DO DIÁRIO OFICIAL DA UNIÃO (DOU / INCOM)
 * 
 * Fonte Oficial: Imprensa Nacional do Governo Federal (in.gov.br)
 * 100% de dados reais, públicos e auditáveis publicados diariamente no DOU:
 * - Seção 1 (Atos Normativos e Portarias)
 * - Seção 3 (Contratos de Financiamento, Licenças Ambientais de Armazenagem, Outorgas)
 * 
 * BLOQUEIO ESTRITO DE LICITAÇÕES:
 * Descarta automaticamente avisos de licitação, pregões eletrônicos e compras de prefeituras.
 * Focado 100% em oportunidades comerciais para o agronegócio e vendas de implementos.
 */

import crypto from 'crypto';

const DOU_SEARCH_BASE = 'https://www.in.gov.br/consulta/-/buscar/dou';

const DISCARD_PROCUREMENT_TERMS = [
  'aviso de licitação',
  'aviso de licitacao',
  'pregão eletrônico',
  'pregao eletronico',
  'pregão presencial',
  'dispensa de licitação',
  'inexigibilidade de licitação',
  'tomada de preços',
  'concorrência pública',
  'ata de registro de preços',
  'registro de preços',
  'prefeitura municipal',
  'câmara municipal',
  'universidade federal',
  'instituto federal',
  'secretaria municipal'
];

const QUERY_BY_TYPE = {
  CREDITO_BNDES: {
    term: 'contrato financiamento máquinas Moderfrota agropecuária',
    orgaoDefault: 'Banco Repassador / BNDES / MAPA',
    triggerLabel: 'Financiamento de Máquinas & Crédito Agro no DOU'
  },
  PASSIVO_IBAMA: {
    term: 'termo de embargo infração desmatamento fazenda IBAMA',
    orgaoDefault: 'IBAMA / Ministério do Meio Ambiente',
    triggerLabel: 'Termo de Embargo / Autuação Ambiental no DOU'
  },
  OUTORGA_ANA: {
    term: 'portaria outorga captação irrigação',
    orgaoDefault: 'Agência Nacional de Águas (ANA)',
    triggerLabel: 'Portaria de Outorga de Irrigação no DOU'
  },
  EXPANSAO_LEILAO: {
    term: 'certificação georreferenciamento imóvel rural gleba INCRA',
    orgaoDefault: 'INCRA / SIGEF / Cartório de Registro',
    triggerLabel: 'Expansão & Certificação Fundiária (INCRA/SIGEF)'
  },
  DOU: {
    term: 'licença instalação armazém silos secador grãos',
    orgaoDefault: 'Órgão Ambiental Estadual / Federal',
    triggerLabel: 'Licença Ambiental para Armazenagem & Silos'
  }
};

export class DouRealHarvester {
  /**
   * Coleta publicações autênticas em tempo real diretamente do Diário Oficial da União
   * 
   * @param {string} sparkType Tipo de sinal a capturar
   * @param {Object} options Filtros opcionais (uf, municipio)
   * @returns {Promise<Array>} Lista de sinais reais com link de auditoria
   */
  static async harvestDOU(sparkType = 'DOU', { uf = null, municipio = null } = {}) {
    const config = QUERY_BY_TYPE[sparkType] || QUERY_BY_TYPE.DOU;
    const query = config.term;

    const searchUrl = `${DOU_SEARCH_BASE}?q=${encodeURIComponent(query)}&exactDate=mes`;
    console.log(`📡 [DOU LIVE CRAWLER] Consultando Imprensa Nacional: "${query}"...`);

    let rawHits = [];

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8'
        },
        signal: AbortSignal.timeout(25000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao consultar in.gov.br`);
      }

      const html = await response.text();
      const idStr = '_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params';
      const idx = html.indexOf(idStr);

      if (idx !== -1) {
        const startTagEnd = html.indexOf('>', idx);
        const endTag = html.indexOf('</script>', startTagEnd);
        const jsonStr = html.slice(startTagEnd + 1, endTag);
        const parsed = JSON.parse(jsonStr);
        rawHits = parsed.jsonArray || [];
      } else {
        console.warn(`⚠️ [DOU LIVE CRAWLER] Elemento de dados JSON não localizado no HTML retornado.`);
      }

    } catch (err) {
      console.error(`❌ [DOU LIVE CRAWLER] Falha na requisição ao Diário Oficial da União:`, err.message);
      return [];
    }

    if (!Array.isArray(rawHits) || rawHits.length === 0) {
      console.log(`ℹ️ [DOU LIVE CRAWLER] Nenhuma publicação nova retornada para "${query}".`);
      return [];
    }

    const signals = [];

    for (const hit of rawHits) {
      const titleLower = (hit.title || '').toLowerCase();
      const contentLower = (hit.content || '').toLowerCase();
      const hierarchyStr = (hit.hierarchyList || []).join(' ').toLowerCase();
      const fullInspect = `${titleLower} ${contentLower} ${hierarchyStr}`;

      // FILTRO ANTI-LICITAÇÃO & ENTIDADES PÚBLICAS: descarta compras governamentais, UASG, editais e licitações
      const isPublicProcurement = 
        fullInspect.includes('licitaç') ||
        fullInspect.includes('licitac') ||
        fullInspect.includes('pregão') ||
        fullInspect.includes('pregao') ||
        fullInspect.includes('adjudicaç') ||
        fullInspect.includes('homologaç') ||
        fullInspect.includes('prefeitura') ||
        fullInspect.includes('câmara municipal') ||
        fullInspect.includes('camara municipal') ||
        fullInspect.includes('universidade') ||
        fullInspect.includes('instituto federal') ||
        fullInspect.includes('escola superior') ||
        fullInspect.includes('dispensa de lic') ||
        fullInspect.includes('inexigibilidade') ||
        fullInspect.includes('edital') ||
        fullInspect.includes('apostilamento') ||
        fullInspect.includes('uasg') ||
        fullInspect.includes('acordo de cooperação') ||
        fullInspect.includes('acordo de cooperacao') ||
        fullInspect.includes('convênio') ||
        fullInspect.includes('convenio') ||
        fullInspect.includes('conselho regional') ||
        fullInspect.includes('secretaria municipal') ||
        fullInspect.includes('secretaria estadual') ||
        fullInspect.includes('aviso de alteração') ||
        fullInspect.includes('aviso de cancelamento') ||
        fullInspect.includes('termo aditivo') ||
        fullInspect.includes('ata de registro');

      if (isPublicProcurement) {
        continue;
      }

      const urlTitle = hit.urlTitle || hit.title || '';
      const urlOficial = `https://www.in.gov.br/web/dou/-/${urlTitle}`;
      const uniqueKey = hit.urlTitle || `${hit.title}-${hit.pubDate}`;
      const signalId = `sig-dou-${crypto.createHash('md5').update(uniqueKey).digest('hex').slice(0, 10)}`;

      // Data de Publicação Oficial (DD/MM/YYYY -> YYYY-MM-DD)
      let dataIso = new Date().toISOString().slice(0, 10);
      if (hit.pubDate && hit.pubDate.includes('/')) {
        const parts = hit.pubDate.split('/');
        if (parts.length === 3) {
          dataIso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }

      // Limpeza do conteúdo HTML
      const cleanSnippet = (hit.content || '')
        .replace(/<span[^>]*class=['"]highlight['"][^>]*>/gi, '')
        .replace(/<\/span>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Extração de CNPJ ou CPF
      const cnpjMatch = cleanSnippet.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/) || (hit.title || '').match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
      const cpfMatch = cleanSnippet.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
      const doc = cnpjMatch ? cnpjMatch[0] : (cpfMatch ? cpfMatch[0] : null);

      // Extração de Valor Monetário (R$)
      const valMatch = cleanSnippet.match(/R\$\s*([\d\.,]+)/i);
      let valorMonetario = 0;
      if (valMatch) {
        valorMonetario = parseFloat(valMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
      }

      // Extração de Vazão Hídrica (m³/h) se for outorga
      let volumeM3h = 0;
      const vazaoMatch = cleanSnippet.match(/([\d\.,]+)\s*(?:m³\/h|m3\/h|litros\/s|l\/s)/i);
      if (vazaoMatch) {
        volumeM3h = parseFloat(vazaoMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
      }

      // Identificação da Seção e Edição
      const secaoStr = hit.pubName ? `Seção ${hit.pubName}` : 'DOU';
      const edicaoStr = hit.editionNumber ? `Edição ${hit.editionNumber}` : '';
      const orgaoEmissor = hit.hierarchyList && hit.hierarchyList.length > 0 
        ? hit.hierarchyList[hit.hierarchyList.length - 1] 
        : `${config.orgaoDefault} (${secaoStr})`;

      // Nome do Titular / Interessado extraído
      let titular = null;
      const contratadoMatch = cleanSnippet.match(/Contratad[ao]:\s*([^,\.]+)/i) || cleanSnippet.match(/Interessad[ao]:\s*([^,\.]+)/i) || cleanSnippet.match(/Favorecid[ao]:\s*([^,\.]+)/i);
      if (contratadoMatch && contratadoMatch[1]) {
        titular = contratadoMatch[1].trim();
      } else if (doc) {
        titular = `Entidade sob CNPJ/CPF ${doc}`;
      } else {
        titular = hit.title ? hit.title.slice(0, 60) : 'Publicação Oficial DOU';
      }

      // Detecção de UF e Município se presente no texto
      let ufDetectada = uf || 'DF';
      let munDetectado = municipio || 'Brasília';
      const ufRegex = /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/;
      const ufFound = (hit.title + ' ' + cleanSnippet).match(ufRegex);
      if (ufFound && !uf) {
        ufDetectada = ufFound[1];
      }

      signals.push({
        id: signalId,
        spark_type: sparkType,
        titulo: hit.title || `Publicação Oficial do DOU (${hit.pubDate})`,
        resumo: cleanSnippet.slice(0, 280) + (cleanSnippet.length > 280 ? '...' : ''),
        conteudo_bruto: `${hit.title}. ${cleanSnippet}. Publicado em ${hit.pubDate} (${secaoStr} - ${edicaoStr}). Link Oficial: ${urlOficial}`,
        orgao_emissor: orgaoEmissor,
        data_publicacao: dataIso,
        valor_monetario: valorMonetario,
        volume_m3h: volumeM3h,
        documento_identificado: doc,
        titular_identificado: titular,
        nome_imovel: `Imóvel / Operação Publicada no DOU (${secaoStr})`,
        municipio: munDetectado,
        uf: ufDetectada,
        lat: -15.7801,
        lng: -47.9292,
        url_fonte: urlOficial,
        trigger_texto: `${config.triggerLabel} [${hit.pubDate}]`
      });
    }

    console.log(`✅ [DOU LIVE CRAWLER] ${signals.length} publicações comerciais legítimas filtradas (licitações descartadas).`);
    return signals;
  }
}

export default DouRealHarvester;
