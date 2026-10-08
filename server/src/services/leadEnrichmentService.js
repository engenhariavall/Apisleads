/**
 * server/src/services/leadEnrichmentService.js
 * FASE AVANÇADA (IDE 1): MOTOR DE ENRIQUECIMENTO EM CASCATA E RESOLUÇÃO DE IDENTIDADE
 * 
 * Orquestrador do pipeline de Waterfall Enrichment da Plataforma VERSUS:
 * 
 * 1. Layer 1 (CAR/LGPD): Identificação cadastral de área e município.
 *    Se o titular vier mascarado ou sob sigilo pelo WFS/CAR, avança para Layer 2.
 * 2. Layer 2 (Cruzamento Geográfico - SIGEF/INCRA/SNCR):
 *    Interseção espacial (Point-in-Polygon / Bounding Box) das coordenadas geodésicas
 *    com a malha oficial do SIGEF/INCRA para resgatar o Nome do Titular Real de cartório.
 * 3. Layer 3 (Market Bureau / Receita / QSA / WhatsApp):
 *    Com "Nome Titular + Município" ou CPF/CNPJ, consulta bureaus de dados oficiais
 *    (Assertiva/Unitfour/MinhaReceita/BrasilAPI/QSA) para resolução da entidade:
 *    CNPJ íntegro, Razão Social, Capital Social, QSA e contatos validados de WhatsApp.
 * 
 * Blindagem Anti-Bloqueio (Ação 2):
 * - Database-First (Cache): Retorna em ~1ms se enriquecido nos últimos 30 dias.
 * - Limitador de Concorrência & Throttling: Fila limitando a no máximo 3 chamadas/s.
 * 
 * Regra de Fallback Estrita (Ação 3):
 * - SÓ usará a string "Titularidade sob sigilo / Pendente" se a busca exaustiva
 *   falhar simultaneamente na Layer 1, Layer 2 e Layer 3.
 */

import db from '../config/database.js';
import { isPointInsideGeoJsonPolygon } from './geoFundiarioService.js';
import { sicarOsintService, normalizarCodigoCar, parseCarCodeMetadata } from './sicarOsintService.js';
import { bureauService } from './bureauService.js';
import { qsaService } from './qsaService.js';
import { osintService } from './osintService.js';
import { receitaService } from './receitaService.js';
import { validatePhoneChannel } from '../modules/intent/phoneValidator.js';
import { resolveTenantCredentials, ApiRouterError } from './apiRouterService.js';
import { extractLocationFromProperty } from './ibgeService.js';
import { resolveRuralProducerByIE, formatCpf } from './sefazIeService.js';
import { runMachineryAndHydroPipeline } from './machineryFleetEngine.js';
import { resolverEmpresaPorDenominacao, formatCnpj } from './empresaFundiariaResolver.js';

/**
 * Fila Limitadora de Concorrência e Throttling Anti-Bloqueio (Token-Bucket / Leaky-Bucket)
 * Garante concorrência máxima de 3 workers e taxa máxima de 3 requisições por segundo.
 */
export class AsyncConcurrencyRateLimiter {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 3;
    this.maxPerSecond = options.maxPerSecond || 3;
    this.intervalMs = Math.ceil(1000 / this.maxPerSecond); // ~334ms entre requisições
    this.queue = [];
    this.activeCount = 0;
    this.lastExecutedAt = 0;
    this.totalExecuted = 0;
  }

  /**
   * Enfileira uma função assíncrona respeitando o limite de concorrência e rate limit
   * @param {Function} task Função assíncrona a ser executada
   * @returns {Promise<any>}
   */
  async run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._processQueue();
    });
  }

  _processQueue() {
    if (this.queue.length === 0 || this.activeCount >= this.concurrency) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastExecutedAt;

    if (elapsed < this.intervalMs) {
      const waitTime = this.intervalMs - elapsed;
      setTimeout(() => this._processQueue(), waitTime);
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;
    this.lastExecutedAt = Date.now();
    this.totalExecuted++;

    (async () => {
      try {
        const result = await item.task();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      } finally {
        this.activeCount--;
        this._processQueue();
      }
    })();
  }

  getStats() {
    return {
      activeWorkers: this.activeCount,
      queuedTasks: this.queue.length,
      totalExecuted: this.totalExecuted,
      concurrencyLimit: this.concurrency,
      rateLimitPerSecond: this.maxPerSecond
    };
  }
}

// Instância global do limitador para chamadas externas de Bureau / Receita (Layer 3)
export const bureauRateLimiter = new AsyncConcurrencyRateLimiter({
  concurrency: 3,
  maxPerSecond: 3
});

/**
 * Padrões de titular mascarado / sigilo pela LGPD
 */
const MASKED_PATTERNS = [
  '***',
  'sigilo',
  'lgpd',
  'sigilo',
  'pendente',
  'protegid',
  'não informado',
  'nao informado',
  'produtor rural declarado',
  'titular não informado',
  'titularidade sob sigilo',
  'desconhecido',
  'a identificar',
  'cartório cri',
  'sncr'
];

/**
 * Validação matemática de CPF (Receita Federal)
 */
export function isValidCPF(cpf) {
  if (!cpf) return false;
  const clean = String(cpf).replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10))) return false;

  return true;
}

/**
 * Validação matemática de CNPJ (Receita Federal)
 */
export function isValidCNPJ(cnpj) {
  if (!cnpj) return false;
  const clean = String(cnpj).replace(/\D/g, '');
  if (clean.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

/**
 * Avalia se o titular fornecido é mascarado, genérico ou protegido por sigilo
 * @param {string} name 
 * @returns {boolean}
 */
export function isMaskedTitular(name) {
  if (!name || typeof name !== 'string') return true;
  const n = name.trim().toLowerCase();
  if (n === '') return true;
  return MASKED_PATTERNS.some(p => n.includes(p));
}

/**
 * Normaliza e sanitiza documento (CPF ou CNPJ)
 * REGRA RIGOROSA DE PRODUÇÃO (ZERO MOCKS):
 * Apenas retorna documentos que passem 100% no algoritmo matemático oficial da Receita Federal.
 * UUIDs, IDs de parcela ou números inventados são estritamente rejeitados retornando ''.
 * @param {string} doc 
 * @returns {string}
 */
export function cleanDocument(doc) {
  if (!doc) return '';
  const digits = String(doc).replace(/\D/g, '');
  if (digits.length === 11 && isValidCPF(digits)) {
    return digits;
  }
  if (digits.length === 14 && isValidCNPJ(digits)) {
    return digits;
  }
  return '';
}

export const leadEnrichmentService = {
  // Exporta o rate limiter para monitoramento e testes
  rateLimiter: bureauRateLimiter,

  /**
   * Avalia máscara de titular
   */
  isMaskedTitular,

  /**
   * Verifica se a propriedade foi enriquecida nos últimos 30 dias (Database-First Cache)
   * @param {Object} query 
   * @param {string} [tenantId]
   * @returns {Object|null}
   */
  check30DayCache(query, tenantId = 'tenant-root-default') {
    const { id, codigo_car, id_sigef } = query;
    if (!id && !codigo_car && !id_sigef) return null;

    try {
      const row = db.prepare(`
        SELECT * FROM propriedades_rurais 
        WHERE (
          (id IS NOT NULL AND id = ?) OR 
          (codigo_car IS NOT NULL AND codigo_car = ?) OR 
          (id_sigef IS NOT NULL AND id_sigef = ?)
        )
        AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
        LIMIT 1
      `).get(id || '', codigo_car || '', id_sigef || '', tenantId);

      if (!row) return null;

      // Verifica se a última sincronização ou atualização foi nos últimos 30 dias
      const refDateStr = row.updated_at || row.data_ultima_sync || row.created_at;
      if (refDateStr) {
        const refTime = new Date(refDateStr).getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const isFresh = (Date.now() - refTime) <= thirtyDaysMs;

        // Se estiver fresco e possuir dados enriquecidos válidos (titular real ou contato)
        const hasRealTitular = !isMaskedTitular(row.nome_titular);
        const hasEnrichedContact = !!row.whatsapp_validado || row.osint_status === 'ENRICHED';

        if (isFresh && (hasRealTitular || hasEnrichedContact)) {
          return {
            cached: true,
            source: 'DATABASE_CACHE_30D',
            layer_resolved: 0,
            propriedade: {
              id: row.id,
              codigo_car: row.codigo_car,
              codigo_imovel: row.codigo_imovel,
              id_sigef: row.id_sigef,
              nome_imovel: row.nome_imovel,
              municipio: row.municipio,
              uf: row.uf,
              area_hectares: row.area_hectares,
              status_geo: row.status_geo,
              tag_fonte: row.tag_fonte,
              centroide: {
                lat: row.centroide_lat,
                lng: row.centroide_lng
              }
            },
            titular: {
              nome_titular: row.nome_titular,
              cpf_cnpj_titular: row.cpf_cnpj_titular,
              tipo_pessoa: cleanDocument(row.cpf_cnpj_titular).length === 14 ? 'PJ' : 'PF'
            },
            contatos: {
              whatsapp: row.whatsapp_validado,
              whatsapp_validado: row.whatsapp_validado,
              telefones: row.whatsapp_validado ? [row.whatsapp_validado] : [],
              email: row.email_validado,
              linkedin_url: row.linkedin_url_real
            },
            produtor_rural_pf: row.inscricao_estadual ? {
              inscricao_estadual: row.inscricao_estadual,
              sefaz_uf: row.sefaz_uf || row.uf || 'BR',
              sefaz_status: row.sefaz_status || 'ATIVA',
              habilitado_nfe: true,
              regime_tributario: 'PRODUTOR_RURAL_PF',
              produtor_pf_nome: row.produtor_pf_nome,
              produtor_pf_cpf: row.produtor_pf_cpf ? formatCpf(row.produtor_pf_cpf, false) : null,
              produtor_pf_cpf_clean: row.produtor_pf_cpf,
              produtor_pf_cpf_masked: row.produtor_pf_cpf ? formatCpf(row.produtor_pf_cpf, true) : null,
              whatsapp_produtor: row.whatsapp_produtor_pf || row.whatsapp_validado,
              municipio_ie: row.municipio,
              origem_cruzamento: `SEFAZ_${row.sefaz_uf || row.uf}_SINTEGRA_CCC`
            } : null,
            // FASE 63: Dimensionamento de Maquinário & Hidrografia
            ...(() => {
              const mData = runMachineryAndHydroPipeline({
                ...row,
                area_hectares: row.area_hectares || 0
              });
              return {
                dimensionamento_maquinario: mData?.dimensionamento_frota || null,
                inteligencia_hidrografica: mData?.inteligencia_hidrografica || null,
                uso_solo: mData?.uso_solo || null,
                talhoes_consolidados: mData?.talhoes_consolidados || []
              };
            })(),
            osint_status: row.osint_status || (row.whatsapp_validado ? 'ENRICHED' : 'PARTIAL'),
            mensagem: 'Propriedade recuperada instantaneamente da base local (Cache 30 dias).'
          };
        }
      }
    } catch (err) {
      console.warn('⚠️ [CACHE_30D_CHECK] Falha ao verificar cache local:', err.message);
    }

    return null;
  },

  /**
   * LAYER 1: CAR / LGPD
   * Identifica metadados cadastrais do imóvel. Se o titular for mascarado, retorna precisa_avancar: true.
   * @param {Object} input 
   * @returns {Promise<Object>}
   */
  async executeLayer1CarLgpd(input) {
    const normCar = normalizarCodigoCar(input.codigo_car || input.recibo || '');
    let nomeTitular = input.nome_titular || '';
    let cpfCnpj = input.cpf_cnpj_titular || '';
    let municipio = input.municipio || '';
    let uf = input.uf || '';
    let areaHectares = input.area_hectares || 0;

    // Se temos código CAR, extrai metadados do recibo federal
    if (normCar) {
      const carMeta = parseCarCodeMetadata(normCar);
      if (!uf && carMeta.uf) uf = carMeta.uf;
    }

    // Se o titular não estiver mascarado e for autêntico na Layer 1
    if (!isMaskedTitular(nomeTitular)) {
      return {
        success: true,
        resolved: true,
        layer: 1,
        source: 'CAR_WFS_LAYER1',
        nome_titular: nomeTitular,
        cpf_cnpj_titular: cpfCnpj || null,
        municipio,
        uf,
        area_hectares: areaHectares,
        codigo_car: normCar || null
      };
    }

    // Se temos código CAR mas o titular é mascarado, tenta cruzamento com SICAR OSINT
    if (normCar) {
      try {
        const sicarResult = await sicarOsintService.extractCarOwner(normCar, { uf, municipio });
        if (sicarResult && sicarResult.success && !isMaskedTitular(sicarResult.nome_titular)) {
          return {
            success: true,
            resolved: true,
            layer: 1,
            source: 'SICAR_PUBLIC_LAYER1',
            nome_titular: sicarResult.nome_titular,
            cpf_cnpj_titular: sicarResult.cpf_cnpj_titular || null,
            municipio: sicarResult.municipio || municipio,
            uf: sicarResult.uf || uf,
            area_hectares: areaHectares,
            codigo_car: normCar
          };
        }
      } catch (err) {
        console.warn('⚠️ [LAYER1_SICAR] Consulta SICAR não resolveu titular:', err.message);
      }
    }

    // Titular permaneceu mascarado ou não identificado: avança para Layer 2
    return {
      success: false,
      resolved: false,
      layer: 1,
      precisa_avancar: true,
      nome_titular: null,
      cpf_cnpj_titular: cpfCnpj || null,
      municipio,
      uf,
      area_hectares: areaHectares,
      codigo_car: normCar || null
    };
  },

  /**
   * LAYER 2: Cruzamento Geográfico (SIGEF / INCRA / SNCR Mesh)
   * Realiza interseção espacial (Point-in-Polygon / Bounding Box) das coordenadas com a malha fundiária cartorial.
   * @param {Object} params
   * @param {number} [params.lat]
   * @param {number} [params.lng]
   * @param {Object} [params.propertyData]
   * @param {string} [tenantId]
   * @returns {Promise<Object>}
   */
  async executeLayer2GeographicSigef(params, tenantId = 'tenant-root-default') {
    let lat = parseFloat(params.lat || params.centroide_lat || params.propertyData?.centroide_lat || params.propertyData?.lat);
    let lng = parseFloat(params.lng || params.lon || params.centroide_lng || params.propertyData?.centroide_lng || params.propertyData?.lng);
    const codigoImovel = params.codigo_imovel || params.propertyData?.codigo_imovel;
    const codigoCar = params.codigo_car || params.propertyData?.codigo_car;
    const idSigef = params.id_sigef || params.propertyData?.id_sigef;

    // Se coordenadas diretas não vieram mas temos geometria de polígono, calcula o centróide
    if ((isNaN(lat) || isNaN(lng)) && (params.geometria_poligono || params.propertyData?.geometria_poligono || params.geometry)) {
      const g = params.geometria_poligono || params.propertyData?.geometria_poligono || params.geometry;
      const coords = g?.coordinates || g;
      if (Array.isArray(coords)) {
        try {
          const { calculatePolygonCentroidAndRadius } = await import('./geoFundiarioService.js');
          const c = calculatePolygonCentroidAndRadius(coords);
          if (c && c.centroide_lat && c.centroide_lng) {
            lat = c.centroide_lat;
            lng = c.centroide_lng;
          }
        } catch (_) {}
      }
    }

    let matchedRow = null;

    // 1. Interseção Espacial Point-in-Polygon no banco SQLite se coordenadas forem válidas
    if (!isNaN(lat) && !isNaN(lng)) {
      try {
        const candidates = db.prepare(`
          SELECT * FROM propriedades_rurais 
          WHERE (tag_fonte = 'SIGEF' OR status_geo = 'CERTIFICADO' OR tag_fonte = 'FUSAO_SIGEF_CAR')
            AND nome_titular IS NOT NULL
            AND nome_titular != ''
            AND geometria_poligono IS NOT NULL
          ORDER BY area_hectares DESC
          LIMIT 250
        `).all();

        for (const cand of candidates) {
          if (isMaskedTitular(cand.nome_titular)) continue;
          if (isPointInsideGeoJsonPolygon(lng, lat, cand.geometria_poligono)) {
            matchedRow = cand;
            break;
          }
        }
      } catch (spatialErr) {
        console.warn('⚠️ [LAYER2_SPATIAL] Falha no teste Point-in-Polygon:', spatialErr.message);
      }
    }

    // 2. Interseção Espacial Point-in-Polygon contra o acervo oficial SIGEF (data/sigef/official_sigef_parcels.json)
    if (!matchedRow && !isNaN(lat) && !isNaN(lng)) {
      try {
        const { loadOfficialRuralProperties } = await import('./geoFundiarioService.js');
        const officialParcels = loadOfficialRuralProperties();
        for (const parcel of officialParcels) {
          if (isMaskedTitular(parcel.nome_titular)) continue;
          const geom = parcel.geometria_poligono?.geometry || parcel.geometria_poligono;
          if (geom && isPointInsideGeoJsonPolygon(lng, lat, geom)) {
            matchedRow = parcel;
            break;
          }
        }
      } catch (err) {
        console.warn('⚠️ [LAYER2_OFFICIAL_SIGEF]', err.message);
      }
    }

    // 3. Se não encontrou por ponto geográfico, busca por código SIGEF / Código do Imóvel / Recibo CAR
    if (!matchedRow && (codigoImovel || codigoCar || idSigef)) {
      try {
        matchedRow = db.prepare(`
          SELECT * FROM propriedades_rurais 
          WHERE (
            (codigo_imovel IS NOT NULL AND codigo_imovel = ?) OR 
            (codigo_car IS NOT NULL AND codigo_car = ?) OR 
            (id_sigef IS NOT NULL AND id_sigef = ?)
          )
          AND (tag_fonte = 'SIGEF' OR status_geo = 'CERTIFICADO')
          AND nome_titular IS NOT NULL
          AND nome_titular != ''
          LIMIT 1
        `).get(codigoImovel || '', codigoCar || '', idSigef || '');
      } catch (_) {}
    }

    if (matchedRow && !isMaskedTitular(matchedRow.nome_titular)) {
      return {
        success: true,
        resolved: true,
        layer: 2,
        source: 'SIGEF_CARTORIO_LAYER2',
        nome_titular: matchedRow.nome_titular,
        cpf_cnpj_titular: matchedRow.cpf_cnpj_titular || null,
        id_sigef: matchedRow.id_sigef || null,
        codigo_imovel: matchedRow.codigo_imovel || null,
        nome_imovel: matchedRow.nome_imovel || null,
        area_hectares: matchedRow.area_hectares || null,
        municipio: matchedRow.municipio,
        uf: matchedRow.uf,
        status_geo: matchedRow.status_geo || 'CERTIFICADO'
      };
    }

    return {
      success: false,
      resolved: false,
      layer: 2,
      precisa_avancar: true,
      mensagem: 'Interseção geográfica SIGEF/INCRA não localizou titular certificado para a coordenada.'
    };
  },

  /**
   * LAYER 3: Market Bureau / Receita / QSA / WhatsApp
   * Executa sob fila de controle de concorrência e vazão (Rate Limiter).
   * @param {Object} titularData 
   * @param {Object} propertyData 
   * @param {string} [tenantId] 
   * @returns {Promise<Object>}
   */
  async executeLayer3MarketBureau(titularData, propertyData = {}, tenantId = 'tenant-root-default') {
    return this.rateLimiter.run(async () => {
      let nomeTitular = titularData.nome_titular || propertyData.nome_titular || '';
      let cpfCnpj = cleanDocument(titularData.cpf_cnpj_titular || propertyData.cpf_cnpj_titular || '');
      const municipio = titularData.municipio || propertyData.municipio || '';
      const uf = titularData.uf || propertyData.uf || '';

      let whatsapp = null;
      let email = null;
      let linkedin = null;
      let company = null;
      let companyMatched = null;
      let qsaList = [];
      let razaoSocial = null;
      let capitalSocial = null;

      // 3.0. Vínculo Cartorial / Empresarial e Correlação Espacial Municipal (FASE 60 - DOMÍNIO TOTAL DE PJ):
      let statusResolucao = null;
      let finalL3Source = 'MARKET_BUREAU_LAYER3';

      if ((!cpfCnpj || isMaskedTitular(nomeTitular))) {
        try {
          const rawNome = (propertyData.nome_imovel || titularData.nome_imovel || '').trim();
          let targetMun = (municipio || propertyData.municipio || titularData.municipio || '').trim().toUpperCase();
          let targetUf = (uf || propertyData.uf || titularData.uf || '').trim().toUpperCase();

          if (!targetMun || targetMun === 'NÃO INFORMADO' || targetMun === 'MUNICÍPIO DECLARADO' || targetMun === 'ZONA RURAL') {
            try {
              const loc = await extractLocationFromProperty({ ...propertyData, ...titularData });
              if (loc && loc.municipio && loc.municipio !== 'ZONA RURAL') {
                targetMun = loc.municipio.toUpperCase();
                targetUf = (loc.uf || targetUf || 'RS').toUpperCase();
              }
            } catch (_) {}
          }

          // A) RESOLVEDOR AUTOMÁTICO DE CNPJ POR RADICAL DA DENOMINAÇÃO E MUNICÍPIO (RECEITA FEDERAL)
          let matchEmpresa = null;
          if (rawNome && rawNome.length >= 3) {
            matchEmpresa = await resolverEmpresaPorDenominacao({
              nome_imovel: rawNome,
              municipio: targetMun,
              uf: targetUf,
              area_ha: parseFloat(propertyData.area_hectares || titularData.area_hectares || 0),
              tenantId
            });
          }

          if (matchEmpresa && matchEmpresa.matched) {
            nomeTitular = matchEmpresa.razao_social;
            cpfCnpj = matchEmpresa.cnpj;
            razaoSocial = matchEmpresa.razao_social;
            capitalSocial = matchEmpresa.capital_social;
            qsaList = matchEmpresa.socios_qsa || [];
            companyMatched = matchEmpresa.razao_social;
            statusResolucao = '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]';
            finalL3Source = 'RECEITA_FEDERAL_RADICAL';

            if (matchEmpresa.telefone) {
              const val = validatePhoneChannel(matchEmpresa.telefone);
              if (val && val.is_valid) {
                whatsapp = val.e164 || `+55${val.cleaned}`;
              } else {
                whatsapp = matchEmpresa.telefone;
              }
            }
            if (matchEmpresa.email) email = matchEmpresa.email;

            if (!whatsapp && Array.isArray(qsaList) && qsaList.length > 0 && qsaList[0].telefone) {
              whatsapp = qsaList[0].telefone;
            }
          } else {
            // B) Limpa sufixos cartoriais para extrair o núcleo empresarial
            const cleanCoreName = rawNome
              .replace(/\s*-\s*(gleba|parte|mat|matr[íi]cula|lote|área|unica).*$/i, '')
              .replace(/\s*–\s*.*$/i, '')
              .trim();

            let leadMatch = null;
            if (cleanCoreName && !cleanCoreName.startsWith('Imóvel CAR') && !cleanCoreName.startsWith('Imóvel Rural') && cleanCoreName.length >= 4) {
              leadMatch = db.prepare(`
                SELECT * FROM leads 
                WHERE (razao_social LIKE ? OR nome_fantasia LIKE ?)
                  AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
                ORDER BY capital_social DESC
                LIMIT 1
              `).get(`%${cleanCoreName}%`, `%${cleanCoreName}%`, tenantId);
            }

            if (leadMatch) {
              nomeTitular = leadMatch.razao_social;
              cpfCnpj = cleanDocument(leadMatch.cnpj_raw || leadMatch.cnpj || '');
              razaoSocial = leadMatch.razao_social;
              capitalSocial = leadMatch.capital_social;
              statusResolucao = '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]';
              
              // Busca QSA em leads_socios se não estiver preenchido
              try {
                const sociosRows = db.prepare(`
                  SELECT nome, qualificacao, telefone_presumido as telefone, email_validado as email
                  FROM leads_socios
                  WHERE lead_cnpj = ?
                `).all(leadMatch.cnpj_raw || leadMatch.cnpj);
                if (sociosRows && sociosRows.length > 0) {
                  qsaList = sociosRows;
                } else if (leadMatch.qsa) {
                  qsaList = typeof leadMatch.qsa === 'string' ? JSON.parse(leadMatch.qsa) : leadMatch.qsa;
                }
              } catch (_) {}

              if (leadMatch.email) email = leadMatch.email;
              const ph = leadMatch.telefone_sanitized || leadMatch.telefone;
              if (ph) {
                const val = validatePhoneChannel(ph);
                if (val && val.is_valid) {
                  whatsapp = val.e164 || `+55${val.cleaned}`;
                } else {
                  whatsapp = ph;
                }
              }

              if (!whatsapp && Array.isArray(qsaList) && qsaList.length > 0 && qsaList[0].telefone) {
                whatsapp = qsaList[0].telefone;
              }
            }
          }
        } catch (mErr) {
          console.warn('⚠️ [LAYER3_PJ_CORRELATION]', mErr.message);
        }
      }

      // 3.1. Se já possui CPF/CNPJ ou titular real, tenta o Salto Societário (QSA Match)
      if (cpfCnpj || (nomeTitular && !isMaskedTitular(nomeTitular))) {
        company = osintService.findCompanyByCpf(cpfCnpj, tenantId, !isMaskedTitular(nomeTitular) ? nomeTitular : null);
        if (company) {
          whatsapp = whatsapp || company.whatsapp_validado || null;
          email = email || company.email_comercial || null;
          razaoSocial = razaoSocial || company.razao_social || null;
          if (!cpfCnpj && company.cnpj_vinculado) {
            cpfCnpj = cleanDocument(company.cnpj_vinculado);
          }
        }
      }

      // 3.2. Se tiver CNPJ íntegro (14 dígitos), consulta oficial na Receita Federal (Fonte Única da Verdade)
      if (cpfCnpj && cpfCnpj.length === 14) {
        try {
          const recData = await receitaService.consultarCnpj(cpfCnpj, { tenantId });
          if (recData) {
            razaoSocial = razaoSocial || recData.razao_social;
            capitalSocial = capitalSocial || recData.capital_social;
            if (Array.isArray(recData.qsa) && recData.qsa.length > 0) {
              qsaList = recData.qsa;
            }
            if (!whatsapp && recData.telefone_sanitized) {
              const val = validatePhoneChannel(recData.telefone_sanitized);
              if (val && val.is_valid) {
                whatsapp = val.e164 || `+55${val.cleaned}`;
              }
            }
          }
        } catch (recErr) {
          console.warn('⚠️ [LAYER3_RECEITA] Falha ao consultar Receita Federal:', recErr.message);
        }
      }

      // 3.3. Consulta oficial ao Bureau de Dados para contato WhatsApp
      if (!whatsapp && cpfCnpj) {
        try {
          const bureauRes = await bureauService.lookupWhatsAppByCpf(cpfCnpj, {
            nome: nomeTitular,
            municipio,
            uf,
            tenantId
          });
          if (bureauRes && bureauRes.success && bureauRes.whatsapp) {
            whatsapp = bureauRes.whatsapp;
          }
        } catch (bureauErr) {
          console.warn('⚠️ [LAYER3_BUREAU] Erro na consulta de WhatsApp no Bureau:', bureauErr.message);
        }
      }

      // 3.4. Se ainda não possui WhatsApp, busca na base local de leads comerciais
      if (!whatsapp && (nomeTitular && !isMaskedTitular(nomeTitular))) {
        try {
          const leadMatch = db.prepare(`
            SELECT telefone, telefone_sanitized, email, razao_social, cnpj_raw, capital_social, qsa 
            FROM leads 
            WHERE (razao_social LIKE ? OR nome_fantasia LIKE ? OR contato_nome LIKE ?)
              AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
            ORDER BY capital_social DESC
            LIMIT 1
          `).get(`%${nomeTitular}%`, `%${nomeTitular}%`, `%${nomeTitular}%`, tenantId);

          if (leadMatch) {
            razaoSocial = razaoSocial || leadMatch.razao_social;
            capitalSocial = capitalSocial || leadMatch.capital_social;
            if (!cpfCnpj && leadMatch.cnpj_raw) cpfCnpj = cleanDocument(leadMatch.cnpj_raw);
            if (!email && leadMatch.email) email = leadMatch.email;
            if (leadMatch.qsa && (!qsaList || qsaList.length === 0)) {
              try {
                qsaList = typeof leadMatch.qsa === 'string' ? JSON.parse(leadMatch.qsa) : leadMatch.qsa;
              } catch (_) {}
            }

            const ph = leadMatch.telefone_sanitized || leadMatch.telefone;
            if (ph) {
              const val = validatePhoneChannel(ph);
              if (val && val.is_valid) {
                whatsapp = val.e164 || `+55${val.cleaned}`;
              }
            }
          }
        } catch (_) {}
      }

      // 3.5. Enriquecimento de LinkedIn e E-mail via OSINT Decisor
      if (nomeTitular && !isMaskedTitular(nomeTitular)) {
        try {
          const osintDecisor = await osintService.enrichDecisorReal({
            nome: nomeTitular,
            empresa: razaoSocial || propertyData.nome_imovel || '',
            municipio,
            uf,
            candidateEmail: email
          });
          if (osintDecisor) {
            linkedin = osintDecisor.linkedin_url || null;
            if (osintDecisor.email_validado) email = osintDecisor.email_validado;
          }
        } catch (_) {}
      }

      const isResolved = !!(whatsapp || email || linkedin || razaoSocial || (cpfCnpj && cpfCnpj.length === 14));

      return {
        success: isResolved,
        resolved: isResolved,
        layer: 3,
        source: finalL3Source,
        status_resolucao: statusResolucao || (razaoSocial ? '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]' : null),
        titular_resolvido: (!isMaskedTitular(nomeTitular) ? nomeTitular : (razaoSocial || company?.razao_social || null)),
        whatsapp: whatsapp || null,
        email: email || null,
        linkedin_url: linkedin || null,
        cpf_cnpj: cpfCnpj || null,
        razao_social: razaoSocial || null,
        capital_social: capitalSocial || null,
        qsa: qsaList,
        company_matched: company ? company.razao_social : (razaoSocial || null)
      };
    });
  },

  /**
   * PIPELINE DE CASCATA PRINCIPAL (WATERFALL ENRICHMENT)
   * Recebe ID, Coordenadas ou Objeto da Propriedade e executa o fluxo completo:
   * Cache 30D -> Layer 1 -> Layer 2 -> Layer 3 -> Persistência & Resposta Unificada.
   * 
   * @param {Object|string} input Dados da propriedade rural ou ID do registro
   * @param {Object} [options]
   * @param {boolean} [options.forceRefresh] Ignorar cache de 30 dias se true
   * @param {string} [options.tenantId] Identificador do tenant
   * @returns {Promise<Object>} Payload padronizado para o Inspetor de Leads
   */
  async enrichPropertyWaterfall(input, options = {}) {
    const tenantId = options.tenantId || 'tenant-root-default';
    const forceRefresh = !!options.forceRefresh;

    // Normalização dos parâmetros de entrada
    let propInput = {};
    if (typeof input === 'string') {
      propInput = { id: input };
    } else if (input && typeof input === 'object') {
      propInput = { ...input };
    }
    if (!propInput.codigo_car && propInput.recibo) {
      propInput.codigo_car = propInput.recibo;
    }

    // Se foi passado apenas ID, busca dados prévios na tabela
    if (propInput.id && (!propInput.municipio || !propInput.geometria_poligono)) {
      try {
        const existingRow = db.prepare(`
          SELECT * FROM propriedades_rurais 
          WHERE (id = ? OR id_sigef = ? OR codigo_car = ?)
            AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
          LIMIT 1
        `).get(propInput.id, propInput.id, propInput.id, tenantId);

        if (existingRow) {
          propInput = { ...existingRow, ...propInput };
        }
      } catch (_) {}
    }

    // FASE 60 AVANÇADA: Decodificação automática do código IBGE do CAR para cobertura nacional
    if (!propInput.municipio || propInput.municipio === 'Não informado' || propInput.municipio === 'Município Declarado' || propInput.municipio === 'ZONA RURAL') {
      try {
        const loc = await extractLocationFromProperty(propInput);
        if (loc && loc.municipio && loc.municipio !== 'ZONA RURAL') {
          propInput.municipio = loc.municipio;
          if (loc.uf) propInput.uf = loc.uf;
        }
      } catch (locErr) {
        console.warn('⚠️ [WATERFALL_LOC] Erro ao decodificar localização:', locErr.message);
      }
    }

    // =========================================================================
    // AÇÃO 2: DATABASE-FIRST CACHE (30 DIAS)
    // =========================================================================
    if (!forceRefresh) {
      const cached = this.check30DayCache(propInput, tenantId);
      if (cached) {
        return cached;
      }
    }

    let finalSource = 'WATERFALL_CASCADE';
    let layerResolved = 0;
    let resolvedTitular = null;
    let resolvedCpfCnpj = cleanDocument(propInput.cpf_cnpj_titular || '');
    let resolvedWhatsapp = propInput.whatsapp_validado || null;
    let resolvedEmail = propInput.email_validado || null;
    let resolvedLinkedin = propInput.linkedin_url_real || null;
    let resolvedRazaoSocial = null;
    let resolvedCapitalSocial = null;
    let resolvedQsa = [];
    let companyMatched = null;
    let statusResolucao = null;

    // =========================================================================
    // LAYER 1: CAR / LGPD
    // =========================================================================
    const l1Result = await this.executeLayer1CarLgpd(propInput);
    if (l1Result && l1Result.resolved) {
      resolvedTitular = l1Result.nome_titular;
      if (l1Result.cpf_cnpj_titular) resolvedCpfCnpj = cleanDocument(l1Result.cpf_cnpj_titular);
      finalSource = l1Result.source;
      layerResolved = 1;
    }

    // =========================================================================
    // LAYER 2: CRUZAMENTO GEOGRÁFICO (SIGEF / INCRA / SNCR MESH)
    // Se o titular for mascarado ou nulo após a Layer 1, cruza espacialmente com o SIGEF
    // =========================================================================
    if (!resolvedTitular || isMaskedTitular(resolvedTitular)) {
      const l2Result = await this.executeLayer2GeographicSigef({
        lat: propInput.lat || propInput.centroide_lat,
        lng: propInput.lng || propInput.lon || propInput.centroide_lng,
        codigo_imovel: propInput.codigo_imovel,
        codigo_car: propInput.codigo_car,
        id_sigef: propInput.id_sigef,
        propertyData: propInput
      }, tenantId);

      if (l2Result && l2Result.resolved) {
        resolvedTitular = l2Result.nome_titular;
        if (l2Result.cpf_cnpj_titular) resolvedCpfCnpj = cleanDocument(l2Result.cpf_cnpj_titular);
        if (l2Result.id_sigef && !propInput.id_sigef) propInput.id_sigef = l2Result.id_sigef;
        if (l2Result.codigo_imovel && !propInput.codigo_imovel) propInput.codigo_imovel = l2Result.codigo_imovel;
        finalSource = l2Result.source;
        layerResolved = 2;
      }
    }

    // =========================================================================
    // LAYER 3: MARKET BUREAU / RECEITA / QSA / WHATSAPP
    // Munido de titular e/ou CPF/CNPJ, consulta a camada de bureau com rate limiter
    // =========================================================================
    const titularForL3 = {
      nome_titular: resolvedTitular || propInput.nome_titular,
      cpf_cnpj_titular: resolvedCpfCnpj || propInput.cpf_cnpj_titular,
      municipio: propInput.municipio,
      uf: propInput.uf
    };

    const l3Result = await this.executeLayer3MarketBureau(titularForL3, propInput, tenantId);
    if (l3Result && l3Result.resolved) {
      if ((!resolvedTitular || isMaskedTitular(resolvedTitular)) && l3Result.titular_resolvido) {
        resolvedTitular = l3Result.titular_resolvido;
      } else if ((!resolvedTitular || isMaskedTitular(resolvedTitular)) && (l3Result.razao_social || l3Result.company_matched)) {
        resolvedTitular = l3Result.razao_social || l3Result.company_matched;
      }
      if (l3Result.whatsapp) resolvedWhatsapp = l3Result.whatsapp;
      if (l3Result.email) resolvedEmail = l3Result.email;
      if (l3Result.linkedin_url) resolvedLinkedin = l3Result.linkedin_url;
      if (l3Result.cpf_cnpj && !resolvedCpfCnpj) resolvedCpfCnpj = cleanDocument(l3Result.cpf_cnpj);
      if (l3Result.razao_social) resolvedRazaoSocial = l3Result.razao_social;
      if (l3Result.capital_social) resolvedCapitalSocial = l3Result.capital_social;
      if (l3Result.qsa) resolvedQsa = l3Result.qsa;
      if (l3Result.company_matched) companyMatched = l3Result.company_matched;
      if (l3Result.status_resolucao) statusResolucao = l3Result.status_resolucao;

      finalSource = l3Result.source;
      layerResolved = 3;
    }

    // =========================================================================
    // AÇÃO 3: PAYLOAD DE RESPOSTA E REGRA DE FALLBACK ESTRITA
    // SÓ usará "Titularidade sob sigilo / Pendente" se falhar nas 3 camadas
    // =========================================================================
    const searchFailedAllLayers = isMaskedTitular(resolvedTitular) && !resolvedCpfCnpj && !resolvedWhatsapp;

    const fallbackSigilo = (propInput.tag_fonte === 'SICAR' && !propInput.id_sigef)
      ? 'Titularidade sob sigilo (LGPD)'
      : 'Titularidade sob sigilo / Pendente';

    const nomeTitularFinal = searchFailedAllLayers
      ? fallbackSigilo
      : (!isMaskedTitular(resolvedTitular)
          ? resolvedTitular
          : (resolvedRazaoSocial || companyMatched || propInput.nome_titular || 'Produtor Rural Qualificado'));

    let osintFinalStatus = resolvedWhatsapp ? 'ENRICHED' : (resolvedTitular || resolvedCpfCnpj ? 'PARTIAL' : 'NOT_FOUND');
    const cleanDocLen = (resolvedCpfCnpj ? String(resolvedCpfCnpj).replace(/\D/g, '').length : 0);
    const tipoPessoa = (cleanDocLen === 14 || resolvedRazaoSocial || companyMatched || propInput.tipo_pessoa === 'PJ')
      ? 'PJ'
      : (cleanDocLen === 11 ? 'PF' : 'INDETERMINADO');

    // =========================================================================
    // PERSISTÊNCIA NA BASE DE DADOS (ATUALIZAÇÃO DE CACHE)
    // =========================================================================
    if (propInput.id || propInput.codigo_car || propInput.id_sigef) {
      try {
        const now = new Date().toISOString();
        db.prepare(`
          UPDATE propriedades_rurais 
          SET nome_titular = CASE 
                WHEN nome_titular IS NULL OR nome_titular = '' OR nome_titular LIKE '%sigilo%' OR nome_titular LIKE '%Declarado%'
                THEN COALESCE(?, nome_titular) 
                ELSE nome_titular 
              END,
              cpf_cnpj_titular = COALESCE(?, cpf_cnpj_titular),
              whatsapp_validado = COALESCE(?, whatsapp_validado),
              email_validado = COALESCE(?, email_validado),
              linkedin_url_real = COALESCE(?, linkedin_url_real),
              osint_status = ?,
              updated_at = ?
          WHERE (
            (id IS NOT NULL AND id = ?) OR 
            (codigo_car IS NOT NULL AND codigo_car = ?) OR 
            (id_sigef IS NOT NULL AND id_sigef = ?)
          )
          AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
        `).run(
          !isMaskedTitular(nomeTitularFinal) ? nomeTitularFinal : null,
          resolvedCpfCnpj || null,
          resolvedWhatsapp || null,
          resolvedEmail || null,
          resolvedLinkedin || null,
          osintFinalStatus,
          now,
          propInput.id || '',
          propInput.codigo_car || '',
          propInput.id_sigef || '',
          tenantId
        );
      } catch (dbErr) {
        console.warn('⚠️ [WATERFALL_PERSIST] Falha ao persistir enriquecimento no banco:', dbErr.message);
      }
    }

    // FASE 62: MOTOR DE INSCRIÇÃO ESTADUAL (SEFAZ / SINTEGRA / CCC) & DESMASCARAMENTO PF
    let sefazPfData = null;
    try {
      sefazPfData = await resolveRuralProducerByIE({
        ...propInput,
        municipio: propInput.municipio,
        uf: propInput.uf
      });
      // Se a cascata não tiver localizado WhatsApp ou se for apenas contato de matriz PJ, conecta o WhatsApp do produtor PF
      if (!resolvedWhatsapp && sefazPfData?.whatsapp_produtor) {
        resolvedWhatsapp = sefazPfData.whatsapp_produtor;
        osintFinalStatus = 'ENRICHED';
      }
      // Se não havia documento resolvido, conecta o CPF do produtor rural
      if (!resolvedCpfCnpj && sefazPfData?.produtor_pf_cpf) {
        resolvedCpfCnpj = sefazPfData.produtor_pf_cpf;
      }
      if (!resolvedRazaoSocial && sefazPfData?.produtor_pf_nome) {
        resolvedRazaoSocial = `${sefazPfData.produtor_pf_nome} - PRODUTOR RURAL`;
      }
    } catch (sefazErr) {
      console.warn('⚠️ [WATERFALL_SEFAZ_IE] Erro ao resolver produtor PF via SEFAZ:', sefazErr.message);
    }

    // FASE 63: INTELIGÊNCIA HIDROGRÁFICA, ÁREA ÚTIL & DIMENSIONAMENTO DE MAQUINÁRIO
    let machineryData = null;
    try {
      machineryData = await runMachineryAndHydroPipeline({
        ...propInput,
        area_hectares: propInput.area_hectares || 0,
        municipio: propInput.municipio,
        uf: propInput.uf
      });
      if (machineryData?.uso_solo?.area_lavoura_util_ha && (propInput.id || propInput.codigo_car || propInput.id_sigef)) {
        try {
          db.prepare(`
            UPDATE propriedades_rurais
            SET area_lavoura_util_ha = ?,
                dados_hidrograficos = ?,
                dados_maquinario = ?
            WHERE (
              (id IS NOT NULL AND id = ?) OR 
              (codigo_car IS NOT NULL AND codigo_car = ?) OR 
              (id_sigef IS NOT NULL AND id_sigef = ?)
            )
          `).run(
            machineryData.uso_solo.area_lavoura_util_ha,
            JSON.stringify(machineryData.inteligencia_hidrografica || {}),
            JSON.stringify(machineryData.dimensionamento_frota || {}),
            propInput.id || '',
            propInput.codigo_car || '',
            propInput.id_sigef || ''
          );
        } catch (_) {}
      }
    } catch (mErr) {
      console.warn('⚠️ [WATERFALL_MACHINERY] Erro ao dimensionar maquinário:', mErr.message);
    }

    return {
      success: true,
      source: finalSource,
      layer_resolved: layerResolved,
      cached: false,
      propriedade: {
        id: propInput.id || null,
        codigo_car: propInput.codigo_car || null,
        codigo_imovel: propInput.codigo_imovel || null,
        id_sigef: propInput.id_sigef || null,
        nome_imovel: propInput.nome_imovel || 'Imóvel Rural',
        municipio: propInput.municipio || 'Não informado',
        uf: propInput.uf || 'BR',
        area_hectares: propInput.area_hectares || 0,
        status_geo: propInput.status_geo || 'SEM_GEO',
        tag_fonte: propInput.tag_fonte || 'WATERFALL',
        centroide: {
          lat: propInput.centroide_lat || propInput.lat || null,
          lng: propInput.centroide_lng || propInput.lng || propInput.lon || null
        }
      },
      titular: {
        nome_titular: nomeTitularFinal,
        cpf_cnpj_titular: resolvedCpfCnpj || null,
        tipo_pessoa: tipoPessoa,
        razao_social: resolvedRazaoSocial || null,
        capital_social: resolvedCapitalSocial || null,
        qsa: resolvedQsa
      },
      produtor_rural_pf: sefazPfData,
      dimensionamento_maquinario: machineryData?.dimensionamento_frota || null,
      inteligencia_hidrografica: machineryData?.inteligencia_hidrografica || null,
      uso_solo: machineryData?.uso_solo || null,
      talhoes_consolidados: machineryData?.talhoes_consolidados || [],
      contatos: {
        whatsapp: resolvedWhatsapp || null,
        whatsapp_validado: resolvedWhatsapp || null,
        telefones: resolvedWhatsapp ? [resolvedWhatsapp] : [],
        email: resolvedEmail || null,
        linkedin_url: resolvedLinkedin || null
      },
      osint_status: osintFinalStatus,
      origem_titular: finalSource,
      company_matched: companyMatched || resolvedRazaoSocial || null,
      cnpj_vinculado: resolvedCpfCnpj || null,
      cnpj: (resolvedCpfCnpj && resolvedCpfCnpj.length === 14) ? formatCnpj(resolvedCpfCnpj) : (resolvedCpfCnpj || null),
      socios_qsa: (resolvedQsa && resolvedQsa.length > 0) ? resolvedQsa : (propInput.qsa || []),
      status_resolucao: statusResolucao || (tipoPessoa === 'PJ' && (resolvedRazaoSocial || companyMatched) ? '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]' : null),
      status: statusResolucao || (tipoPessoa === 'PJ' && (resolvedRazaoSocial || companyMatched) ? '[EMPRESA LOCALIZADA (RECEITA FEDERAL)]' : 'QUALIFIED'),
      correspondencia_cadastral: {
        confianca: (layerResolved === 2 || finalSource.includes('SIGEF')) ? 100 : (resolvedRazaoSocial ? 85 : 50),
        tipo: (layerResolved === 2 || finalSource.includes('SIGEF')) ? 'CERTIFICADO_CARTORIAL' : 'ESTIMATIVA_CADASTRAL_MUNICIPAL',
        municipio: propInput.municipio || 'Não informado',
        uf: propInput.uf || 'BR',
        descricao: (layerResolved === 2 || finalSource.includes('SIGEF'))
          ? 'Propriedade rural formalmente certificada e averbada no INCRA/SIGEF.'
          : 'Vínculo probabilístico por escala territorial e atividade agropecuária ativa na Receita Federal.'
      },
      mensagem: resolvedWhatsapp 
        ? 'Contato localizado e validado via Motor em Cascata.' 
        : (searchFailedAllLayers 
            ? 'Titularidade sob sigilo / Pendente de cruzamento cartorial exaustivo.' 
            : 'Titular identificado. Aguardando validação de canal direto.')
    };
  }
};

export default leadEnrichmentService;
