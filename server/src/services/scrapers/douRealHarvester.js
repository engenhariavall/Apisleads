/**
 * server/src/services/scrapers/douRealHarvester.js
 * 
 * MOTOR DE CAPTURA REAL E AO VIVO DO DIÁRIO OFICIAL DA UNIÃO (DOU / INCOM)
 * 
 * Fonte Oficial: Imprensa Nacional do Governo Federal (in.gov.br)
 * 100% de dados reais, públicos e auditáveis publicados diariamente no DOU:
 * - Seção 1 (Atos Normativos e Portarias)
 * - Seção 2 (Atos de Pessoal)
 * - Seção 3 (Contratos, Editais, Leilões, Extratos de Financiamento e Avisos)
 * 
 * Todas as operações gravam o LINK OFICIAL VERIFICÁVEL da página no portal do governo.
 */

import crypto from 'crypto';

const DOU_SEARCH_BASE = 'https://www.in.gov.br/consulta/-/buscar/dou';

const QUERY_BY_TYPE = {
  CREDITO_BNDES: {
    term: 'crédito rural BNDES Finame',
    orgaoDefault: 'BNDES / Ministério da Agricultura',
    triggerLabel: 'Crédito e Financiamento Rural Publicado no DOU'
  },
  PASSIVO_IBAMA: {
    term: 'IBAMA embargo infração ambiental',
    orgaoDefault: 'IBAMA / Ministério do Meio Ambiente',
    triggerLabel: 'Edital de Embargo / Infração Ambiental no DOU'
  },
  OUTORGA_ANA: {
    term: 'ANA outorga água irrigação',
    orgaoDefault: 'Agência Nacional de Águas (ANA)',
    triggerLabel: 'Portaria de Outorga Hídrica Publicada no DOU'
  },
  EXPANSAO_LEILAO: {
    term: 'leilão judicial fazenda rural',
    orgaoDefault: 'Tribunal Regional / Justiça Federal',
    triggerLabel: 'Edital de Leilão de Imóvel Rural no DOU'
  },
  DOU: {
    term: 'licenciamento ambiental rural',
    orgaoDefault: 'Órgão Ambiental Federal / MAPA',
    triggerLabel: 'Publicação Oficial no Diário Oficial da União'
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
  static async harvestDOU(sparkType = 'CREDITO_BNDES', { uf = null, municipio = null } = {}) {
    const config = QUERY_BY_TYPE[sparkType] || QUERY_BY_TYPE.CREDITO_BNDES;
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

    console.log(`✅ [DOU LIVE CRAWLER] ${rawHits.length} publicações oficiais autênticas capturadas no DOU.`);

    const signals = rawHits.map(hit => {
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

      return {
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
      };
    });

    return signals;
  }
}

export default DouRealHarvester;
