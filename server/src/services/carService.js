/**
 * server/src/services/carService.js
 *
 * FASE 57 — ETAPA 1: FUNDAÇÃO DO SERVIÇO CAR (SICAR)
 * Integração com o Sistema Nacional de Cadastro Ambiental Rural (SICAR)
 * mantido pelo Serviço Florestal Brasileiro (SFB) / MMA.
 *
 * ARQUITETURA:
 * - Fonte primária:  API REST pública do SICAR (car.gov.br/publico)
 * - Fonte secundária: WFS OGC do SICAR (GeoServer SFB)
 * - Fonte terciária: Acervo local em data/sicar/ (shapefiles ou GeoJSONs pré-baixados)
 *
 * URLS OFICIAIS:
 *   API REST: https://www.car.gov.br/publico/imoveis/index
 *   WFS:      https://geoserver.car.gov.br/geoserver/publico/wfs
 *   Download: https://www.car.gov.br/publico/municipios/downloads?sigla={UF}
 *
 * PAYLOAD DE SAÍDA:
 *   Todos os métodos retornam um GeoJSON FeatureCollection no mesmo schema
 *   que o geoFundiarioService (SIGEF/INCRA), acrescido de:
 *     properties.source         = 'CAR'
 *     properties.codigo_car     = Código Federal do CAR (ex: MT-5107909-...)
 *     properties.status_car     = 'ATIVO' | 'PENDENTE' | 'SUSPENSO' | 'CANCELADO'
 *     properties.condicao_car   = 'AGUARDANDO_ANALISE' | 'ANALISADO_COM_PENDENCIA' | 'VALIDADO'
 *     properties.area_app_ha    = Área de APP declarada (ha)
 *     properties.area_reserva_legal_ha = Área de Reserva Legal declarada (ha)
 *     properties.tem_passivo_ambiental = true | false
 *     properties.tag_fonte      = 'SICAR' | 'FUSAO_SIGEF_CAR'
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/database.js';
import { carHistoricalService, buildUnmaskedCpf } from './carHistoricalService.js';
import { agronomicProfileService } from './agronomicProfileService.js';
import { calculateRuralIntentScore } from './intentScoringService.js';
import { executeSpatialOverlayCarSigef, testSpatialIntersection } from './spatialIntersectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── CONSTANTES DE CONFIGURAÇÃO ───────────────────────────────────────────────

/** URL base da API REST pública do SICAR */
const SICAR_API_BASE = process.env.SICAR_API_URL || 'https://www.car.gov.br/publico/imoveis/index';

/** URL base oficial do serviço WFS OGC do GeoServer SFB */
const SICAR_WFS_BASE = process.env.SICAR_WFS_URL || 'https://geoserver.car.gov.br/geoserver/sicar/wfs';

/** Timeout padrão de requisição externa (ms) — dimensionado para grandes lotes */
const FETCH_TIMEOUT_MS = parseInt(process.env.SICAR_TIMEOUT_MS, 10) || 60000;

/** Camada WFS padrão */
const SICAR_WFS_LAYER = process.env.SICAR_WFS_LAYER || 'sicar:sicar_imoveis';

/** Caminho para acervo local de malhas CAR pré-baixadas */
const LOCAL_SICAR_DIR = path.resolve(__dirname, '../../../data/sicar');

// ─── MAPEAMENTO DE STATUS DO SICAR ────────────────────────────────────────────

/**
 * Traduz código numérico/string da API do SICAR para valor semântico padronizado.
 * Referência: Manual Operacional do CAR — SFB/MMA (versão 2023).
 */
const STATUS_CAR_MAP = {
  AT: 'ATIVO',
  ATIVO: 'ATIVO',
  '1': 'ATIVO',
  PE: 'PENDENTE',
  PENDENTE: 'PENDENTE',
  '2': 'PENDENTE',
  SU: 'SUSPENSO',
  SUSPENSO: 'SUSPENSO',
  '3': 'SUSPENSO',
  CA: 'CANCELADO',
  CANCELADO: 'CANCELADO',
  '4': 'CANCELADO'
};

const CONDICAO_CAR_MAP = {
  AA: 'AGUARDANDO_ANALISE',
  AGUARDANDO_ANALISE: 'AGUARDANDO_ANALISE',
  AP: 'ANALISADO_COM_PENDENCIA',
  ANALISADO_COM_PENDENCIA: 'ANALISADO_COM_PENDENCIA',
  VA: 'VALIDADO',
  VALIDADO: 'VALIDADO'
};

// ─── UTILITÁRIOS ──────────────────────────────────────────────────────────────

/**
 * Cria AbortController com timeout configurável.
 * @param {number} ms Timeout em milissegundos
 * @returns {{ controller: AbortController, clear: Function }}
 */
function createFetchTimeout(ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

/**
 * Normaliza código de imóvel CAR: garante formato XX-NNNNNNN-XXXXXXX...
 * @param {string} raw Código bruto
 * @returns {string}
 */
function normalizarCodigoCar(raw = '') {
  return String(raw).toUpperCase().trim();
}

/**
 * Normaliza status do CAR
 * @param {string|number} raw
 * @returns {'ATIVO'|'PENDENTE'|'SUSPENSO'|'CANCELADO'}
 */
function normalizarStatusCar(raw = '') {
  return STATUS_CAR_MAP[String(raw).toUpperCase().trim()] || 'PENDENTE';
}

/**
 * Normaliza condição do CAR
 * @param {string} raw
 * @returns {'AGUARDANDO_ANALISE'|'ANALISADO_COM_PENDENCIA'|'VALIDADO'}
 */
function normalizarCondicaoCar(raw = '') {
  return CONDICAO_CAR_MAP[String(raw).toUpperCase().trim()] || 'AGUARDANDO_ANALISE';
}

/**
 * Calcula centróide geométrico simples de um anel de coordenadas GeoJSON.
 * Idêntico ao algoritmo em geoFundiarioService para consistência de resposta.
 * @param {Array} coordinates Ring [[lng, lat], ...]
 * @returns {{ lat: number, lng: number }}
 */
function calcularCentroide(coordinates = []) {
  const ring = Array.isArray(coordinates[0]?.[0]) ? coordinates[0] : coordinates;
  let sumLat = 0, sumLng = 0, count = 0;
  for (const pt of ring) {
    const lng = parseFloat(pt[0]);
    const lat = parseFloat(pt[1]);
    if (!isNaN(lat) && !isNaN(lng)) {
      sumLat += lat; sumLng += lng; count++;
    }
  }
  if (count === 0) return { lat: 0, lng: 0 };
  return {
    lat: parseFloat((sumLat / count).toFixed(6)),
    lng: parseFloat((sumLng / count).toFixed(6))
  };
}

// ─── NORMALIZADOR DE FEATURE ───────────────────────────────────────────────────

/**
 * Converte uma feature bruta (da API REST, WFS ou acervo local) para o schema
 * GeoJSON normalizado da Plataforma VERSUS, idêntico ao produzido por
 * geoFundiarioService.getRuralGeoJson(), acrescido de campos CAR.
 *
 * @param {Object} rawFeature Feature bruta com { geometry, properties }
 * @param {Object} [overrides] Campos extras a forçar (uf, municipio, etc.)
 * @returns {Object} Feature GeoJSON normalizada (tipo 'Feature')
 */
export function normalizarFeatureCar(rawFeature = {}, overrides = {}) {
  const props = rawFeature.properties || rawFeature || {};
  const geometry = rawFeature.geometry || rawFeature.geometria || null;

  // ── Identificadores do imóvel ──────────────────────────────────────────────
  const codigoCar    = normalizarCodigoCar(props.cod_imovel || props.codigo_car || props.codigo || props.num_registro || '');

  // Consulta automática à base espelho histórica do CAR (pré-maio/2023)
  let histMatch = null;
  if (codigoCar && db) {
    try {
      histMatch = db.prepare(`
        SELECT nome_proprietario, cpf_cnpj_parcial, matricula_declarada, nome_imovel_declarado
        FROM car_proprietarios_historico
        WHERE codigo_car = ?
        LIMIT 1
      `).get(codigoCar);

      // RESOLUÇÃO AUTOMÁTICA NACIONAL JIT: Se ainda não estava indexado, desmascara na hora para qualquer cidade/UF!
      if (!histMatch && carHistoricalService?.resolveOrSeedHistoricalCarOwnerSync) {
        histMatch = carHistoricalService.resolveOrSeedHistoricalCarOwnerSync({
          codigo_car: codigoCar,
          municipio: overrides.municipio || props.nom_municipio || props.municipio,
          uf: overrides.uf || props.sig_uf || props.uf,
          area_hectares: props.num_area || props.area_ha || props.area_hectares || props.area || 0,
          nome_imovel: props.nom_imovel || props.nome_imovel || props.denominacao
        });
      }
    } catch (_) {}
  }

  const dirtyTitular = histMatch?.nome_proprietario || props.nom_proprietario || props.nome_titular || props.proprietario || props.titular || '';
  const rawTitular   = String(dirtyTitular).replace(/^undefined\s+/i, '').trim();
  const nomeTitular  = (rawTitular && !['Produtor Rural Declarado', 'Titular não informado', 'Não informado', 'Titularidade sob sigilo (LGPD)'].includes(String(rawTitular).trim()))
    ? String(rawTitular).trim()
    : 'Titularidade sob sigilo (LGPD)';
  let cpfCnpj        = histMatch?.cpf_cnpj_parcial || String(props.cpf_cnpj_titular || props.cpf_cnpj || props.num_cpf_cnpj || '').replace(/\s/g, '') || null;
  if (cpfCnpj && cpfCnpj.includes('*') && codigoCar) {
    cpfCnpj = buildUnmaskedCpf(codigoCar, cpfCnpj);
  }
  const nomeImovel   = String(histMatch?.nome_imovel_declarado || props.nom_imovel || props.nome_imovel || props.denominacao || props.nome || (codigoCar ? `Imóvel CAR ${codigoCar.slice(-8)}` : 'Imóvel Rural CAR')).trim();
  const municipio    = String(overrides.municipio || props.nom_municipio || props.municipio || '').toUpperCase().trim();
  const uf           = String(overrides.uf || props.sig_uf || props.uf || '').toUpperCase().trim();
  const areaHa       = parseFloat(props.num_area || props.area_ha || props.area_hectares || props.area || 0) || 0;

  // ── Status e condição ambiental ────────────────────────────────────────────
  const statusCar   = normalizarStatusCar(props.status_imovel || props.ind_status || props.status_car || props.status || '');
  const condicaoCar = normalizarCondicaoCar(props.condicao || props.ind_tipo_imovel || props.condicao_car || '');
  const areaAppHa   = parseFloat(props.num_area_app || props.area_app_ha || props.val_area_p || props.val_area_app || 0) || 0;
  const areaRlHa    = parseFloat(props.num_area_reserva_legal || props.area_reserva_legal_ha || props.val_area_r || props.val_area_reserva_legal || 0) || 0;
  const temPassivo  = Boolean(props.tem_passivo_ambiental || statusCar === 'PENDENTE' || statusCar === 'SUSPENSO');

  // ── Centróide para minimap e geofencing ───────────────────────────────────
  let centroide = { lat: 0, lng: 0 };
  if (geometry) {
    const coords = geometry.type === 'Polygon'
      ? geometry.coordinates
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0]
        : null;
    if (coords) centroide = calcularCentroide(coords);
  }

  // ── Inteligência Agronômica (Sensoriamento Remoto / Sentinel-2 & MapBiomas) ──
  let agroData = props.dados_agronomicos;
  if (typeof agroData === 'string') {
    try { agroData = JSON.parse(agroData); } catch (_) { agroData = null; }
  }
  if (!agroData || !agroData.crop_type) {
    agroData = agronomicProfileService.getAgronomicProfileForProperty({
      geometria_poligono: geometry,
      municipio,
      uf,
      area_hectares: areaHa,
      nome_imovel: nomeImovel,
      centroide_lat: centroide.lat,
      centroide_lng: centroide.lng,
      tag_fonte: 'SICAR',
      codigo_car: codigoCar
    });
  }

  // ── Inteligência Preditiva (Score e Triggers Dinâmicos de Intenção Rural) ──
  const carScored = calculateRuralIntentScore(
    { nome_titular: nomeTitular, cpf_cnpj_titular: cpfCnpj },
    {
      municipio,
      uf,
      area_hectares: areaHa,
      status_geo: statusCar === 'ATIVO' ? 'CERTIFICADO' : 'PENDENTE',
      dados_agronomicos: agroData,
      tem_passivo_ambiental: temPassivo
    }
  );

  // ── Classificação de Entidade PJ vs PF ────────────────────────────────────
  const cleanDoc = String(cpfCnpj || '').replace(/\D/g, '');
  const corporateRegex = /\b(S\/A|S\.A\.|SA|LTDA|ME|EPP|EIRELI|AGROPECUARIA|AGROPECUÁRIA|AGRICOLA|AGRÍCOLA|AGRO|COOPERATIVA|COOP|SEMENTES|GRAOS|GRÃOS|PARTICIPACOES|PARTICIPAÇÕES|COMERCIO|IND[UÚ]STRIA|USINA|PESQUISAS AGRON[OÔ]MICAS|CENTRO DE PESQUISAS)\b/i;
  let tipoPessoa = props.tipo_pessoa || 'INDETERMINADO';
  if (cleanDoc.length === 14) {
    tipoPessoa = 'PJ';
  } else if (cleanDoc.length === 11) {
    tipoPessoa = 'PF';
  } else if (corporateRegex.test(nomeTitular) || corporateRegex.test(nomeImovel) || areaHa >= 150) {
    tipoPessoa = 'PJ';
  } else {
    tipoPessoa = 'PF';
  }
  const isCorporate = tipoPessoa === 'PJ';

  return {
    type: 'Feature',
    id: codigoCar || `car-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    geometry,
    properties: {
      // ── Campos do schema SIGEF (obrigatórios para compatibilidade de frontend) ──
      id: codigoCar,
      id_sigef: null,                         // CAR não tem ID SIGEF
      nome_imovel: nomeImovel || nomeImovel || nomeTitular,
      nome_titular: nomeTitular,
      cpf_cnpj_titular: cpfCnpj,
      tipo_pessoa: tipoPessoa,
      is_corporate: isCorporate,
      municipio,
      uf,
      area_hectares: areaHa,
      status_geo: statusCar === 'ATIVO' ? 'CERTIFICADO' : 'PENDENTE', // Mapa semântico para o motor de intenção existente
      intent_score: carScored.intent_score,
      intent_classification: carScored.intent_classification,
      intent_triggers: carScored.intent_triggers,
      whatsapp_validado: null,
      linkedin_url_real: null,
      email_validado: null,
      osint_status: 'PENDING',
      dados_agronomicos: agroData,
      crop_type: agroData?.crop_type || null,
      crop_confidence: agroData?.confidence || null,
      centroide_lat: centroide.lat,
      centroide_lng: centroide.lng,
      raio_abrangencia_km: null,
      data_ultima_sync: new Date().toISOString(),

      // ── Campos exclusivos do CAR / SICAR ──────────────────────────────────
      source: 'CAR',
      tag_fonte: histMatch ? 'SICAR_HISTORICO_PRE2023' : 'SICAR',
      codigo_car: codigoCar,
      status_car: statusCar,
      condicao_car: condicaoCar,
      matricula_declarada: histMatch?.matricula_declarada || props.matricula_declarada || null,
      proprietario_desmascarado: Boolean(histMatch),
      area_app_ha: areaAppHa,
      area_reserva_legal_ha: areaRlHa,
      tem_passivo_ambiental: temPassivo,
      alerta_ambiental: statusCar === 'ATIVO' && condicaoCar === 'VALIDADO'
        ? null
        : statusCar === 'PENDENTE' || condicaoCar === 'ANALISADO_COM_PENDENCIA'
          ? 'PENDENCIA_AMBIENTAL'
          : statusCar === 'SUSPENSO' || statusCar === 'CANCELADO'
            ? 'CAR_INATIVO'
            : 'AGUARDANDO_ANALISE'
    }
  };
}

// ─── FONTE 1: API REST PÚBLICA DO SICAR ──────────────────────────────────────

/**
 * Consulta a API REST pública do SICAR para listar imóveis de um município.
 * Endpoint de consulta pública (sem autenticação): /publico/imoveis/index
 *
 * @param {Object} params
 * @param {string} params.uf       Sigla da UF (ex: 'MT')
 * @param {string} params.municipio Nome do município (ex: 'SORRISO')
 * @returns {Promise<Object[]>} Array de features brutas
 */
async function buscarViaSicarRestApi({ uf, municipio }) {
  const url = new URL(SICAR_API_BASE);
  url.searchParams.set('imovel[uf]', uf.toUpperCase());
  if (municipio) url.searchParams.set('imovel[municipio]', municipio.toUpperCase());
  url.searchParams.set('imovel[tipo]', 'IRU'); // Imóvel Rural
  url.searchParams.set('imovel[status]', 'AT'); // ATIVO

  const { controller, clear } = createFetchTimeout();
  try {
    const res = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'VERSUS-Platform/1.0 (agro-intelligence)'
      },
      signal: controller.signal
    });
    clear();

    if (!res.ok) {
      console.warn(`[CAR REST] HTTP ${res.status} para ${uf}/${municipio}`);
      return [];
    }

    const json = await res.json();
    // A API pode devolver { data: [...] }, { imoveis: [...] } ou um array direto
    const lista = Array.isArray(json) ? json
      : Array.isArray(json.data) ? json.data
      : Array.isArray(json.imoveis) ? json.imoveis
      : [];

    console.log(`[CAR REST] ${lista.length} imóvel(eis) encontrado(s) em ${municipio}/${uf}`);
    return lista;
  } catch (err) {
    clear();
    if (err.name === 'AbortError') {
      console.warn(`[CAR REST] Timeout ao consultar ${uf}/${municipio}`);
    } else {
      console.warn(`[CAR REST] Erro de rede: ${err.message}`);
    }
    return [];
  }
}

// ─── FONTE 2: WFS OGC DO GEOSERVER SFB ──────────────────────────────────────

/**
 * Consulta o serviço WFS OGC do GeoServer SFB para buscar shapes de imóveis CAR.
 * Retorna FeatureCollection GeoJSON com geometrias reais.
 *
 * @param {Object} params
 * @param {string} params.uf       Sigla da UF
 * @param {string} params.municipio Nome do município
 * @returns {Promise<Object[]>} Array de features GeoJSON brutas
 */
/**
 * Salva malha de parcelas em cache local para disponibilidade permanente
 */
function salvarCacheLocal({ uf, municipio, features = [] }) {
  if (!uf || !municipio || features.length === 0) return;
  try {
    const ufNorm = uf.toUpperCase().trim();
    const munLimpo = normalizarTextoBusca(municipio).replace(/\s+/g, '_');
    const dirUf = path.join(LOCAL_SICAR_DIR, ufNorm);
    if (!fs.existsSync(dirUf)) fs.mkdirSync(dirUf, { recursive: true });
    const targetFile = path.join(dirUf, `${munLimpo}.geojson`);
    const payload = {
      type: 'FeatureCollection',
      name: `sicar_${ufNorm}_${munLimpo}`,
      total_features: features.length,
      updated_at: new Date().toISOString(),
      features
    };
    fs.writeFileSync(targetFile, JSON.stringify(payload), 'utf8');
    console.log(`[CAR CACHE] Persistido em disco: ${features.length} parcelas em ${targetFile}`);
  } catch (err) {
    console.warn(`[CAR CACHE] Falha ao persistir cache local: ${err.message}`);
  }
}

/**
 * Consulta o serviço WFS OGC do GeoServer SFB com paginação particionada e streaming de lotes.
 * Baixa o volume real de parcelas (milhares de imóveis) sem estourar a memória.
 *
 * @param {Object} params
 * @param {string} params.uf       Sigla da UF (ex: 'RS')
 * @param {string} params.municipio Nome do município (ex: 'PASSO FUNDO')
 * @param {number} [params.maxLimit=10000] Limite máximo de parcelas
 * @param {number} [params.pageSize=1500] Tamanho de cada lote OGC
 * @returns {Promise<Object[]>} Array de features GeoJSON brutas
 */
async function buscarViaSicarWfs({ uf, municipio, maxLimit = 2500, pageSize = 1500 }) {
  const ufNorm = (uf || '').toUpperCase().trim();
  const munNorm = normalizarTextoBusca(municipio);
  const typeNames = `sicar:sicar_imoveis_${ufNorm.toLowerCase()}`;

  let cqlFilter = '';
  if (munNorm) {
    const rawMun = String(municipio || '').replace(/-\s*[A-Z]{2}$/i, '').trim();
    if (rawMun && rawMun.toUpperCase() !== munNorm) {
      cqlFilter = `(municipio ILIKE '%${munNorm}%' OR municipio ILIKE '%${rawMun}%')`;
    } else {
      cqlFilter = `municipio ILIKE '%${munNorm}%'`;
    }
  }

  let allFeatures = [];
  let startIndex = 0;
  let hasMore = true;

  console.log(`[CAR WFS] Iniciando ingestão em escala real para ${munNorm}/${ufNorm} (camada: ${typeNames})...`);

  while (hasMore && allFeatures.length < maxLimit) {
    const wfsUrl = new URL(SICAR_WFS_BASE);
    wfsUrl.searchParams.set('service', 'WFS');
    wfsUrl.searchParams.set('version', '2.0.0');
    wfsUrl.searchParams.set('request', 'GetFeature');
    wfsUrl.searchParams.set('typeNames', typeNames);
    wfsUrl.searchParams.set('outputFormat', 'application/json');
    wfsUrl.searchParams.set('count', String(pageSize));
    wfsUrl.searchParams.set('maxFeatures', String(maxLimit));
    wfsUrl.searchParams.set('startIndex', String(startIndex));
    if (cqlFilter) wfsUrl.searchParams.set('CQL_FILTER', cqlFilter);

    const { controller, clear } = createFetchTimeout();
    try {
      const res = await fetch(wfsUrl.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clear();

      if (!res.ok) {
        console.warn(`[CAR WFS] HTTP ${res.status} no lote ${startIndex} para ${ufNorm}/${munNorm}`);
        break;
      }

      const featureCollection = await res.json();
      const batch = Array.isArray(featureCollection?.features) ? featureCollection.features : [];

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      allFeatures.push(...batch);
      startIndex += batch.length;
      console.log(`[CAR WFS] Lote ingerido: +${batch.length} parcelas (acumulado: ${allFeatures.length})`);

      if (batch.length < pageSize) {
        hasMore = false; // Última página
      }
    } catch (err) {
      clear();
      if (err.name === 'AbortError') {
        console.warn(`[CAR WFS] Timeout no lote ${startIndex} ao consultar ${ufNorm}/${munNorm}`);
      } else {
        console.warn(`[CAR WFS] Erro de rede no lote ${startIndex}: ${err.message}`);
      }
      break;
    }
  }

  if (allFeatures.length > 0) {
    console.log(`[CAR WFS] Total ingerido do SICAR: ${allFeatures.length} parcelas reais para ${munNorm}/${ufNorm}`);
    salvarCacheLocal({ uf: ufNorm, municipio: munNorm, features: allFeatures });
  }

  return allFeatures;
}

// ─── FONTE 3: ACERVO LOCAL ───────────────────────────────────────────────────

function normalizarTextoBusca(str = '') {
  return String(str || '')
    .replace(/-\s*[A-Z]{2}$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Lê GeoJSONs reais pré-baixados do SICAR armazenados em data/sicar/.
 * Estrutura: data/sicar/{UF}/{MUNICIPIO}.geojson ou data/sicar/{UF}.geojson
 *
 * @param {Object} params
 * @param {string} [params.uf]
 * @param {string} [params.municipio]
 * @returns {Object[]} Array de features GeoJSON brutas
 */
function buscarDoAcervoLocal({ uf = '', municipio = '' } = {}) {
  const ufNorm = (uf || '').toUpperCase().trim();
  const munLimpo = normalizarTextoBusca(municipio);
  const munFile = munLimpo.replace(/\s+/g, '_');

  if (!fs.existsSync(LOCAL_SICAR_DIR)) return [];

  // 1. Busca por UF e Município específicos
  if (ufNorm && munLimpo) {
    const candidatePaths = [
      path.join(LOCAL_SICAR_DIR, ufNorm, `${munFile}.geojson`),
      path.join(LOCAL_SICAR_DIR, ufNorm, `${munFile}.json`),
      path.join(LOCAL_SICAR_DIR, `${ufNorm}.geojson`),
      path.join(LOCAL_SICAR_DIR, `${ufNorm}.json`)
    ];

    for (const filePath of candidatePaths) {
      if (!fs.existsSync(filePath)) continue;
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        let features = Array.isArray(parsed.features) ? parsed.features : (Array.isArray(parsed) ? parsed : []);

        if (features.length > 0) {
          // Se o arquivo for estadual geral, filtra pelo município
          if (filePath.endsWith(`${ufNorm}.geojson`) || filePath.endsWith(`${ufNorm}.json`)) {
            const filtered = features.filter(f => {
              const rawMun = String(f.properties?.nom_municipio || f.properties?.municipio || '');
              const fMunLimpo = normalizarTextoBusca(rawMun);
              return fMunLimpo.includes(munLimpo) || munLimpo.includes(fMunLimpo);
            });
            if (filtered.length > 0) return filtered;
          } else {
            console.log(`[CAR LOCAL REAL] ${features.length} parcelas carregadas de ${filePath}`);
            return features;
          }
        }
      } catch (err) {
        console.warn(`[CAR LOCAL] Erro ao ler ${filePath}: ${err.message}`);
      }
    }
    // Município não encontrado no acervo local: retorna vazio para disparar busca WFS oficial
    return [];
  }

  // 2. Busca apenas por UF (escopo regional amplo do estado)
  if (ufNorm && !munLimpo) {
    const dirUf = path.join(LOCAL_SICAR_DIR, ufNorm);
    if (fs.existsSync(dirUf)) {
      try {
        const files = fs.readdirSync(dirUf).filter(f => f.endsWith('.geojson') || f.endsWith('.json'));
        let combined = [];
        for (const file of files) {
          const filePath = path.join(dirUf, file);
          const raw = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(raw);
          const feats = Array.isArray(parsed.features) ? parsed.features : (Array.isArray(parsed) ? parsed : []);
          combined.push(...feats);
        }
        if (combined.length > 0) {
          console.log(`[CAR LOCAL REAL] ${combined.length} parcelas carregadas para UF ${ufNorm}`);
          return combined;
        }
      } catch (err) {
        console.warn(`[CAR LOCAL] Erro ao listar diretório ${dirUf}: ${err.message}`);
      }
    }

    const ufDirectFile = path.join(LOCAL_SICAR_DIR, `${ufNorm}.geojson`);
    if (fs.existsSync(ufDirectFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(ufDirectFile, 'utf8'));
        return Array.isArray(parsed.features) ? parsed.features : [];
      } catch (_) {}
    }
    return [];
  }

  // 3. Carga geral da malha nacional (apenas quando nenhum filtro UF/município é fornecido)
  if (!ufNorm && !munLimpo) {
    try {
      let allFeatures = [];
      function scanDir(dir) {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            scanDir(fullPath);
          } else if (item.isFile() && (item.name.endsWith('.geojson') || item.name.endsWith('.json'))) {
            try {
              const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
              const feats = Array.isArray(parsed.features) ? parsed.features : (Array.isArray(parsed) ? parsed : []);
              allFeatures.push(...feats);
            } catch (_) {}
          }
        }
      }
      scanDir(LOCAL_SICAR_DIR);
      if (allFeatures.length > 0) {
        console.log(`[CAR LOCAL REAL] Acervo geral carregado: ${allFeatures.length} parcelas reais.`);
        return allFeatures;
      }
    } catch (err) {
      console.warn(`[CAR LOCAL] Erro na varredura geral do acervo: ${err.message}`);
    }
  }

  return [];
}

// ─── MÉTODO PRINCIPAL DE CONSULTA ────────────────────────────────────────────

/**
 * Busca imóveis rurais do SICAR/CAR para um par (UF, município).
 * Estratégia em cascata EXCLUSIVAMENTE COM DADOS REAIS:
 *   1. Acervo Local de malhas oficiais pré-baixadas (data/sicar/)
 *   2. WFS OGC oficial (GeoServer SFB - geoserver.car.gov.br) com geometrias reais
 *   3. API REST pública oficial do SICAR (car.gov.br)
 *   ZERO geração de dados sintéticos ou retângulos artificiais.
 *
 * @param {Object} params
 * @param {string} params.uf       Sigla da UF (obrigatório)
 * @param {string} [params.municipio] Nome do município (opcional)
 * @returns {Promise<{ type: 'FeatureCollection', source: 'CAR', features: Object[], total_features: number, provenance: Object }>}
 */
export async function buscarMalhaCarPorMunicipio({ uf, municipio } = {}) {
  if (!uf) throw new Error('[carService] O parâmetro "uf" é obrigatório.');

  const ufNorm = uf.toUpperCase().trim();
  const munNorm = normalizarTextoBusca(municipio);
  const provenance = { wfs: 0, rest_api: 0, local: 0, source_used: null };

  let rawFeatures = [];

  // ── Tentativa 1: Acervo Local Oficial Pré-baixado ──────────────────────────
  const localFeatures = buscarDoAcervoLocal({ uf: ufNorm, municipio: munNorm });
  if (localFeatures.length > 0) {
    rawFeatures = localFeatures;
    provenance.local = localFeatures.length;
    provenance.source_used = 'LOCAL_REAL';
  }

  // ── Tentativa 2: WFS OGC Oficial (GeoServer SFB) ──────────────────────────
  if (rawFeatures.length === 0) {
    try {
      const wfsFeatures = await buscarViaSicarWfs({ uf: ufNorm, municipio: munNorm });
      if (wfsFeatures.length > 0) {
        rawFeatures = wfsFeatures;
        provenance.wfs = wfsFeatures.length;
        provenance.source_used = 'WFS';
      }
    } catch (err) {
      console.warn('[CAR] Falha na fonte WFS:', err.message);
    }
  }

  // ── Tentativa 3: API REST Oficial do SICAR ────────────────────────────────
  if (rawFeatures.length === 0) {
    try {
      const restItems = await buscarViaSicarRestApi({ uf: ufNorm, municipio: munNorm });
      if (restItems.length > 0) {
        rawFeatures = restItems.map(item => ({
          type: 'Feature',
          geometry: item.geometry || item.geometria || null,
          properties: item
        }));
        provenance.rest_api = restItems.length;
        provenance.source_used = 'REST_API';
      }
    } catch (err) {
      console.warn('[CAR] Falha na fonte REST API:', err.message);
    }
  }

  // ── Normalização para schema VERSUS (apenas geometrias reais válidas) ──────
  let features = rawFeatures
    .filter(f => f && (f.geometry || f.geometria))
    .map(f => normalizarFeatureCar(f, { uf: ufNorm, municipio: munNorm }));

  // ── PASSO 2: SOBREPOSIÇÃO ESPACIAL SIGEF / INCRA (INTERSECTS) ─────────────
  // Cruza a malha do CAR com as parcelas certificadas do SIGEF para herdar Matrícula CRI, SNCR e Detentor
  try {
    const { loadOfficialRuralProperties } = await import('./geoFundiarioService.js');
    const allSigef = loadOfficialRuralProperties();
    const regionalSigef = allSigef.filter(s => {
      const sUf = String(s.uf || '').toUpperCase().trim();
      const sMun = String(s.municipio || '').toUpperCase().trim();
      if (ufNorm && sUf !== ufNorm) return false;
      if (munNorm && sMun && !sMun.includes(munNorm) && !munNorm.includes(sMun)) return false;
      return true;
    });

    if (regionalSigef.length > 0) {
      const overlayResult = executeSpatialOverlayCarSigef(features, regionalSigef);
      features = overlayResult.enrichedFeatures;
      provenance.sigef_overlay_matches = overlayResult.matchCount;
      console.log(`[PASSO 2 INTERSECTS] ${overlayResult.matchCount}/${features.length} parcelas do CAR sobrepostas com certificação SIGEF/INCRA em ${munNorm}/${ufNorm}.`);
    }
  } catch (overlayErr) {
    console.warn('[PASSO 2 INTERSECTS] Aviso:', overlayErr.message);
  }

  // ── PASSO 3: DIÁRIOS OFICIAIS & EDITAIS AMBIENTAIS (DOU & DOEs) ───────────
  // Para parcelas sem titular no SIGEF, cruza com editais públicos e portarias ambientais
  try {
    const { GazetteEnvironmentalService } = await import('./gazetteEnvironmentalService.js');
    const gazetteRes = await GazetteEnvironmentalService.enrichCarFeaturesWithGazette(features, { uf: ufNorm, municipio: munNorm });
    features = gazetteRes.enrichedFeatures;
    provenance.gazette_matches = gazetteRes.gazetteMatchesCount;
    if (gazetteRes.gazetteMatchesCount > 0) {
      console.log(`[PASSO 3 EDITAIS] ${gazetteRes.gazetteMatchesCount} parcelas enriquecidas com publicações do Diário Oficial.`);
    }
  } catch (gazetteErr) {
    console.warn('[PASSO 3 EDITAIS] Aviso:', gazetteErr.message);
  }

  return {
    type: 'FeatureCollection',
    source: 'CAR',
    total_features: features.length,
    municipio: munNorm,
    uf: ufNorm,
    provenance,
    features
  };
}

// ─── FUSÃO COM SIGEF/INCRA ────────────────────────────────────────────────────

/**
 * Recebe duas FeatureCollections (SIGEF e CAR) e produz uma coleção unificada,
 * aplicando as tags de proveniência da Fase 57:
 *
 *   - SIGEF sem correspondência no CAR → tag_fonte = 'SIGEF', alerta 'SEM_CAR_MAPEADO'
 *   - CAR sem correspondência no SIGEF → tag_fonte = 'SICAR'
 *   - Interseção (mesmo município + titular semelhante) → tag_fonte = 'FUSAO_SIGEF_CAR'
 *
 * A heurística de interseção usa a distância entre centróides (<= 0.5 km) como
 * proxy para sobreposição geométrica real (sem cálculo de intersect completo no
 * backend leve). Fase 57 Etapa 2 implementará o algoritmo de interseção de polígonos.
 *
 * @param {Object} sigefCollection FeatureCollection do SIGEF/INCRA
 * @param {Object} carCollection   FeatureCollection do SICAR/CAR
 * @returns {Object} FeatureCollection unificada com tags de proveniência
 */
export function fundirColecoesSigefCar(sigefCollection = {}, carCollection = {}) {
  const sigefFeatures = Array.isArray(sigefCollection.features) ? sigefCollection.features : [];
  const carFeatures   = Array.isArray(carCollection.features)   ? carCollection.features   : [];

  // Helper: distância haversine simplificada em km
  function distKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getFeatureCenter(feat) {
    const p = feat.properties || {};
    let lat = parseFloat(p.centroide_lat || p.lat || 0);
    let lng = parseFloat(p.centroide_lng || p.lon || p.lng || 0);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return { lat, lng };

    const geom = feat.geometry;
    if (!geom || !geom.coordinates) return { lat: 0, lng: 0 };

    const points = [];
    function recurse(arr) {
      if (!Array.isArray(arr) || arr.length === 0) return;
      if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
        points.push(arr);
      } else {
        for (const item of arr) recurse(item);
      }
    }
    recurse(geom.coordinates);

    if (points.length > 0) {
      let sumLat = 0, sumLng = 0, count = 0;
      for (const pt of points) {
        if (Array.isArray(pt) && pt.length >= 2) {
          sumLng += Number(pt[0]);
          sumLat += Number(pt[1]);
          count++;
        }
      }
      if (count > 0) return { lat: sumLat / count, lng: sumLng / count };
    }
    return { lat: 0, lng: 0 };
  }

  const matchedCarIds = new Set();
  const fusedFeatures = [];

  // 1. Processa features do SIGEF: verifica se existe CAR próximo (proxy de interseção)
  for (const sigefFeat of sigefFeatures) {
    const sp = sigefFeat.properties || {};
    const sCenter = getFeatureCenter(sigefFeat);

    let bestCarMatch = null;
    let bestDist = Infinity;

    if (sCenter.lat !== 0 && sCenter.lng !== 0) {
      for (const carFeat of carFeatures) {
        const cp = carFeat.properties || {};
        const cCenter = getFeatureCenter(carFeat);
        if (cCenter.lat === 0 && cCenter.lng === 0) continue;

        const d = distKm(sCenter.lat, sCenter.lng, cCenter.lat, cCenter.lng);
        const sameCode = (sp.codigo_car && (cp.codigo_car || cp.cod_imovel) && (sp.codigo_car === cp.codigo_car || sp.codigo_car === cp.cod_imovel));
        if ((sameCode || d < 0.8) && d < bestDist) { // Limiar de 800m para sobreposição espacial direta
          bestDist = d;
          bestCarMatch = carFeat;
          cp.centroide_lat = cCenter.lat;
          cp.centroide_lng = cCenter.lng;
        }
      }
    }

    if (bestCarMatch) {
      // Fusão: SIGEF + CAR → enriquece a feature SIGEF com dados ambientais do CAR
      const cp = bestCarMatch.properties || {};
      const carKey = bestCarMatch.id || cp.codigo_car || cp.id;
      if (carKey) matchedCarIds.add(carKey);

      const fusedScored = calculateRuralIntentScore(
        { nome_titular: sp.nome_titular, cpf_cnpj_titular: sp.cpf_cnpj_titular },
        {
          municipio: sp.municipio,
          uf: sp.uf,
          area_hectares: sp.area_hectares,
          status_geo: sp.status_geo || 'CERTIFICADO',
          dados_agronomicos: sp.dados_agronomicos || cp.dados_agronomicos,
          tem_passivo_ambiental: cp.tem_passivo_ambiental || false
        }
      );

      const resolvedTipoPessoa = sp.tipo_pessoa || cp.tipo_pessoa || (sp.is_corporate || cp.is_corporate ? 'PJ' : 'PF');
      const resolvedIsCorporate = Boolean(sp.is_corporate || cp.is_corporate || resolvedTipoPessoa === 'PJ');

      fusedFeatures.push({
        ...sigefFeat,
        properties: {
          ...sp,
          source: 'FUSAO_SIGEF_CAR',
          tag_fonte: 'FUSAO_SIGEF_CAR',
          tipo_pessoa: resolvedTipoPessoa,
          is_corporate: resolvedIsCorporate,
          intent_score: fusedScored.intent_score,
          intent_classification: fusedScored.intent_classification,
          intent_triggers: fusedScored.intent_triggers,
          // Dados ambientais do CAR
          codigo_car: cp.codigo_car || null,
          status_car: cp.status_car || null,
          condicao_car: cp.condicao_car || null,
          area_app_ha: cp.area_app_ha || null,
          area_reserva_legal_ha: cp.area_reserva_legal_ha || null,
          tem_passivo_ambiental: cp.tem_passivo_ambiental || false,
          alerta_ambiental: cp.alerta_ambiental || null
        }
      });
    } else {
      // SIGEF puro: sem correspondência no CAR
      fusedFeatures.push({
        ...sigefFeat,
        properties: {
          ...sp,
          source: sp.source || 'SIGEF',
          tag_fonte: 'SIGEF',
          tipo_pessoa: sp.tipo_pessoa || (sp.is_corporate ? 'PJ' : 'PF'),
          is_corporate: Boolean(sp.is_corporate || sp.tipo_pessoa === 'PJ'),
          alerta_ambiental: sp.alerta_ambiental || 'SEM_CAR_MAPEADO'
        }
      });
    }
  }

  // 2. Inclui features CAR que não tiveram correspondência no SIGEF
  for (const carFeat of carFeatures) {
    const cp = carFeat.properties || {};
    const carKey = carFeat.id || cp.codigo_car || cp.id;
    if (!carKey || !matchedCarIds.has(carKey)) {
      // Critério Técnico Legal (Lei 10.267/2001 & INCRA):
      // Imóveis no CAR com área >= 25ha ou com passivo ambiental / status pendente
      // que NÃO possuem certificação no SIGEF representam GAP FUNDIÁRIO (Lead Quente ICP).
      const area = parseFloat(cp.area_hectares || cp.area || 0);
      const isGap = Boolean(
        cp.tem_passivo_ambiental ||
        cp.status_car === 'PENDENTE' ||
        cp.status_car === 'SUSPENSO' ||
        area >= 25
      );

      fusedFeatures.push({
        ...carFeat,
        properties: {
          ...cp,
          source: 'CAR',
          is_car: true,
          tag_fonte: isGap ? 'SEM_GEO' : 'SICAR',
          tipo_pessoa: cp.tipo_pessoa || (cp.is_corporate ? 'PJ' : 'PF'),
          is_corporate: Boolean(cp.is_corporate || cp.tipo_pessoa === 'PJ'),
          gap_fundiario: isGap,
          status_geo: isGap ? 'SEM_GEO' : 'CERTIFICADO',
          alerta_gap: isGap ? 'Vazio Regulatório: Imóvel no CAR sem certificação perimétrica SIGEF (Lei 10.267/2001)' : null
        }
      });
    }
  }

  // Ordenação visual tática de profundidade (Z-Order WebGL):
  // 1. CAR (verde - base ambiental)
  // 2. GAPS (vermelho - alerta de regularização)
  // 3. FUSÃO (âmbar - imóveis certificados e auditados)
  // 4. SIGEF (azul ciano - topo perimétrico para NUNCA ser sobreposto ou ocultado)
  const zOrder = { 'SICAR': 1, 'CAR': 1, 'SEM_GEO': 2, 'FUSAO_SIGEF_CAR': 3, 'SIGEF': 4 };
  fusedFeatures.sort((a, b) => {
    const oa = zOrder[a.properties?.tag_fonte] || 1;
    const ob = zOrder[b.properties?.tag_fonte] || 1;
    return oa - ob;
  });

  return {
    type: 'FeatureCollection',
    source: 'FUSAO_SIGEF_CAR',
    total_features: fusedFeatures.length,
    meta: {
      total_sigef: sigefFeatures.length,
      total_car: carFeatures.length,
      fusionados: sigefFeatures.length - (fusedFeatures.filter(f => f.properties?.tag_fonte === 'SIGEF').length),
      apenas_sigef: fusedFeatures.filter(f => f.properties?.tag_fonte === 'SIGEF').length,
      apenas_car: fusedFeatures.filter(f => f.properties?.tag_fonte === 'SICAR').length,
      gaps_fundiarios: fusedFeatures.filter(f => f.properties?.tag_fonte === 'SEM_GEO').length
    },
    features: fusedFeatures
  };
}

// ─── EXPORTAÇÕES DO SERVIÇO ──────────────────────────────────────────────────

export const carService = {
  buscarMalhaCarPorMunicipio,
  fundirColecoesSigefCar,
  normalizarFeatureCar,
  buscarDoAcervoLocal,

  /**
   * Verifica se as fontes externas (WFS e REST) estão configuradas/acessíveis.
   * Usado pelo healthcheck e pela rota de status.
   * @returns {Object}
   */
  getConfig() {
    return {
      sicar_api_url: SICAR_API_BASE,
      sicar_wfs_url: SICAR_WFS_BASE,
      sicar_wfs_layer: SICAR_WFS_LAYER,
      local_data_dir: LOCAL_SICAR_DIR,
      local_data_exists: fs.existsSync(LOCAL_SICAR_DIR),
      timeout_ms: FETCH_TIMEOUT_MS
    };
  }
};
