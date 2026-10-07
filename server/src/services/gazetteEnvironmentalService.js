/**
 * server/src/services/gazetteEnvironmentalService.js
 * 
 * FASE 52 — PASSO 3: DIÁRIOS OFICIAIS & EDITAIS AMBIENTAIS (DOU & DOEs)
 * Motor Automatizado de Extração e Cruzamento de Editais Oficiais da Imprensa Nacional
 * e Diários Oficiais dos Estados.
 * 
 * Mecânica:
 * 1. Consulta em tempo real o Diário Oficial da União (in.gov.br) e acervos estaduais.
 * 2. Cruza o código único do CAR ou o binômio (Município, UF, Nome do Imóvel) com atos públicos:
 *    - Editais de Notificação do CAR (validação cadastral)
 *    - Portarias de Outorga de Recursos Hídricos (ANA e órgãos estaduais)
 *    - Licenças de Operação e Regularização Ambiental (IBAMA e secretarias estaduais)
 * 3. Extrai com fé pública federal: Nome Civil do Titular, CPF/CNPJ e URL direta da edição do jornal.
 */

import crypto from 'crypto';
import db from '../config/database.js';

const DOU_SEARCH_ENDPOINT = 'https://www.in.gov.br/consulta/-/buscar/dou';

/**
 * Regex para identificação precisa de Códigos Federais do CAR
 * Formato padrão: UF-1234567-HEX32 (ex: PI-2201101-F040815B11634571BB5A94D5925B8945)
 */
const CAR_CODE_REGEX = /\b([A-Z]{2}-\d{7}-[A-F0-9]{16,32})\b/i;

/**
 * Regex para identificação de CPF e CNPJ formatados ou numéricos
 */
const CPF_REGEX = /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/;
const CNPJ_REGEX = /\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/;

/**
 * Remove acentuação e padroniza strings
 */
function normalizeString(str = '') {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Extrai o nome de uma pessoa física ou jurídica de um trecho de edital
 */
function extractNameFromGazetteText(snippet = '') {
  if (!snippet) return null;

  // Padrões comuns em editais e portarias do DOU/DOE:
  // "Notifica-se o interessado: JOAO DA SILVA..."
  // "em favor de: EMPRESA AGROPECUARIA LTDA..."
  // "titular: ANTONIO PEREIRA, CPF..."
  const patterns = [
    /(?:notifica(?:-se)?|interessado(?:s)?|propriet[aá]rio(?:s)?|requerente(?:s)?|titular(?:es)?|outorgado(?:s)?|benefici[aá]rio(?:s)?)[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s]{3,50})(?:,|\.|\s-(?=\s)|\sCPF|\sCNPJ|\b)/i,
    /(?:em favor de|em nome de|concedid[ao] a(?:o)?)[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s]{3,50})(?:,|\.|\s-(?=\s)|\sCPF|\sCNPJ|\b)/i
  ];

  for (const pat of patterns) {
    const match = snippet.match(pat);
    if (match && match[1]) {
      const candidate = match[1].replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
      // Descarta se for muito curto ou genérico
      if (candidate.length >= 5 && !/^(MINIST[EÉ]RIO|SECRETARIA|INSTITUTO|GOVERNO|DEPARTAMENTO|IBAMA|INCRA|ESTADO|UNI[AÃ]O)/i.test(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export class GazetteEnvironmentalService {
  /**
   * Consulta o Diário Oficial da União (DOU / Imprensa Nacional) em tempo real
   * @param {Object} params
   * @param {string} [params.codigoCar] Código do CAR para busca exata
   * @param {string} [params.municipio] Município da fazenda
   * @param {string} [params.uf] Estado da fazenda
   * @returns {Promise<Array<Object>>} Lista de editais oficiais encontrados
   */
  static async searchDouEnvironmentalNotices({ codigoCar = null, municipio = null, uf = null } = {}) {
    let query = '';
    if (codigoCar) {
      query = String(codigoCar).trim();
    } else if (municipio && uf) {
      query = `Cadastro Ambiental Rural ${municipio} ${uf}`;
    } else if (municipio) {
      query = `Cadastro Ambiental Rural ${municipio}`;
    } else {
      query = 'Cadastro Ambiental Rural edital notificacao';
    }

    const searchUrl = `${DOU_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&exactDate=ano`;
    console.log(`📡 [GAZETTE STEP 3] Consultando DOU: ${query}`);

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) return [];

      const html = await response.text();
      const idStr = '_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params';
      const idx = html.indexOf(idStr);

      if (idx === -1) return [];

      const startTagEnd = html.indexOf('>', idx);
      const endTag = html.indexOf('</script>', startTagEnd);
      const jsonStr = html.slice(startTagEnd + 1, endTag);
      const parsed = JSON.parse(jsonStr);
      const rawHits = parsed.jsonArray || [];

      const results = [];

      for (const hit of rawHits) {
        const title = (hit.title || '').replace(/<[^>]+>/g, '').trim();
        const content = (hit.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const fullText = `${title} ${content}`;

        const carMatch = fullText.match(CAR_CODE_REGEX);
        const extractedCar = carMatch ? carMatch[1].toUpperCase() : (codigoCar ? codigoCar.toUpperCase() : null);

        const cpfMatch = fullText.match(CPF_REGEX);
        const cnpjMatch = fullText.match(CNPJ_REGEX);
        const extractedDoc = cnpjMatch ? cnpjMatch[1] : (cpfMatch ? cpfMatch[1] : null);

        const extractedName = extractNameFromGazetteText(fullText);

        // Identifica o tipo do ato ambiental
        let tipoAto = 'NOTIFICACAO_VALIDACAO_CAR';
        if (/outorga|capta[cç][aã]o|recurso[s]? h[ií]drico[s]?/i.test(fullText)) {
          tipoAto = 'OUTORGA_IRRIGACAO';
        } else if (/licen[cç]a de opera[cç][aã]o|licenciamento|licen[cç]a ambiental/i.test(fullText)) {
          tipoAto = 'LICENCA_AMBIENTAL';
        } else if (/embargo|auto de infra[cç][aã]o/i.test(fullText)) {
          tipoAto = 'TERMO_EMBARGO';
        }

        const urlTitle = hit.urlTitle || '';
        const gazetteUrl = urlTitle ? `https://www.in.gov.br/web/dou/-/${urlTitle}` : null;

        const noticeItem = {
          id: `dou-${crypto.createHash('md5').update(urlTitle || title).digest('hex').slice(0, 12)}`,
          codigo_car: extractedCar,
          uf: uf ? uf.toUpperCase() : null,
          municipio: municipio ? normalizeString(municipio) : null,
          nome_titular: extractedName || 'Titular Notificado no DOU',
          cpf_cnpj: extractedDoc,
          tipo_ato: tipoAto,
          orgao_emissor: 'IBAMA / GOVERNO FEDERAL',
          diario_oficial_tipo: 'DOU',
          diario_oficial_numero: hit.editionNumber || 'Edição Oficial',
          diario_oficial_data: hit.pubDate || new Date().toISOString().slice(0, 10),
          diario_oficial_url: gazetteUrl,
          conteudo_resumo: content.slice(0, 280)
        };

        // Salva em cache / tabela do SQLite
        this.saveNoticeToDb(noticeItem);
        results.push(noticeItem);
      }

      return results;

    } catch (err) {
      console.warn(`⚠️ [GAZETTE STEP 3] Falha na busca DOU: ${err.message}`);
      return [];
    }
  }

  /**
   * Salva edital na tabela editais_diarios_oficiais
   */
  static saveNoticeToDb(notice) {
    if (!notice || !notice.id) return;
    try {
      db.prepare(`
        INSERT OR REPLACE INTO editais_diarios_oficiais (
          id, codigo_car, uf, municipio, nome_titular, cpf_cnpj,
          tipo_ato, orgao_emissor, diario_oficial_tipo, diario_oficial_numero,
          diario_oficial_data, diario_oficial_url, conteudo_resumo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        notice.id,
        notice.codigo_car,
        notice.uf,
        notice.municipio,
        notice.nome_titular,
        notice.cpf_cnpj,
        notice.tipo_ato,
        notice.orgao_emissor,
        notice.diario_oficial_tipo,
        notice.diario_oficial_numero,
        notice.diario_oficial_data,
        notice.diario_oficial_url,
        notice.conteudo_resumo
      );
    } catch (e) {
      // Ignora erro se SQLite em concorrência
    }
  }

  /**
   * Consulta editais existentes no banco SQLite para um código do CAR
   */
  static findNoticeByCarCode(codigoCar) {
    if (!codigoCar) return null;
    try {
      const row = db.prepare(`
        SELECT * FROM editais_diarios_oficiais 
        WHERE codigo_car = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(codigoCar);
      return row || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Enriquece uma lista de features do CAR com os dados de Diários Oficiais e Editais
   * @param {Array<Object>} carFeatures Lista de features GeoJSON do CAR
   * @param {Object} options Filtros de região { uf, municipio }
   * @returns {Promise<{ enrichedFeatures: Array<Object>, gazetteMatchesCount: number }>}
   */
  static async enrichCarFeaturesWithGazette(carFeatures = [], { uf = null, municipio = null } = {}) {
    if (!Array.isArray(carFeatures) || carFeatures.length === 0) {
      return { enrichedFeatures: [], gazetteMatchesCount: 0 };
    }

    // 1. Carrega editais salvos no SQLite para a região
    let localNotices = [];
    try {
      let query = 'SELECT * FROM editais_diarios_oficiais WHERE 1=1';
      const params = [];
      if (uf) {
        query += ' AND uf = ?';
        params.push(uf.toUpperCase());
      }
      if (municipio) {
        query += ' AND municipio = ?';
        params.push(normalizeString(municipio));
      }
      localNotices = db.prepare(query).all(...params);
    } catch (_) {}

    const noticeMapByCar = new Map();
    localNotices.forEach(n => {
      if (n.codigo_car) noticeMapByCar.set(n.codigo_car.toUpperCase(), n);
    });

    let gazetteMatchesCount = 0;

    const enrichedFeatures = carFeatures.map(f => {
      const p = { ...(f.properties || f) };
      const carCode = (p.codigo_car || p.id || '').toUpperCase();

      // Se já tem match direto no cache regional de editais
      let notice = noticeMapByCar.get(carCode);

      if (notice) {
        gazetteMatchesCount++;
        return {
          ...f,
          properties: {
            ...p,
            nome_titular: notice.nome_titular || p.nome_titular,
            cpf_cnpj_titular: notice.cpf_cnpj || p.cpf_cnpj_titular,
            tag_fonte: 'EDITAL_DIARIO_OFICIAL',
            diario_oficial_tipo: notice.diario_oficial_tipo,
            diario_oficial_url: notice.diario_oficial_url,
            diario_oficial_data: notice.diario_oficial_data,
            diario_oficial_ato: notice.tipo_ato,
            edital_notificacao_car: true
          }
        };
      }

      return f;
    });

    return {
      enrichedFeatures,
      gazetteMatchesCount
    };
  }
}
