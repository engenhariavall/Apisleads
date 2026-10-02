/**
 * server/src/services/geoFundiarioService.js
 * 
 * FASES 44 E 45: MASTERPLAN MOTOR FUNDIÁRIO B2B
 * Serviço de Ingestão, Normalização e Gestão de Propriedades Rurais (SIGEF/INCRA/CAR).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import db from '../config/database.js';
import { CITY_COORDINATES, UF_CENTROIDS } from '../modules/gis/index.js';
import { calculateRuralIntentScore, lookupTitularCorporateData } from './intentScoringService.js';
import { osintService } from './osintService.js';
import { validatePhoneChannel } from '../modules/intent/phoneValidator.js';
import { satelliteService } from './satelliteService.js';
import { createRuralPropertyLead } from './leadsService.js';

/**
 * Calcula centroide geométrico simples e raio de abrangência a partir de anel de coordenadas GeoJSON
 * @param {Array} coordinates Ring de coordenadas [[lng, lat], ...]
 * @returns {{ centroide_lat: number, centroide_lng: number, raio_km: number }}
 */
export function calculatePolygonCentroidAndRadius(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return { centroide_lat: 0, centroide_lng: 0, raio_km: 1 };
  }

  const points = [];
  function recurse(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return;
    if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      points.push(arr);
    } else {
      for (const item of arr) recurse(item);
    }
  }
  recurse(coordinates);

  if (points.length === 0) {
    return { centroide_lat: 0, centroide_lng: 0, raio_km: 1 };
  }

  let sumLat = 0;
  let sumLng = 0;
  let count = 0;

  points.forEach(pt => {
    const lng = parseFloat(pt[0]);
    const lat = parseFloat(pt[1]);
    if (!isNaN(lat) && !isNaN(lng)) {
      sumLat += lat;
      sumLng += lng;
      count++;
    }
  });

  if (count === 0) {
    return { centroide_lat: 0, centroide_lng: 0, raio_km: 1 };
  }

  const cLat = sumLat / count;
  const cLng = sumLng / count;

  let maxDistKm = 0.5;
  points.forEach(pt => {
    const lng = parseFloat(pt[0]);
    const lat = parseFloat(pt[1]);
    if (!isNaN(lat) && !isNaN(lng)) {
      const dLat = (lat - cLat) * (Math.PI / 180);
      const dLng = (lng - cLng) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(cLat * (Math.PI / 180)) * Math.cos(lat * (Math.PI / 180)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = 6371 * c;
      if (dist > maxDistKm) maxDistKm = dist;
    }
  });

  return {
    centroide_lat: parseFloat(cLat.toFixed(6)),
    centroide_lng: parseFloat(cLng.toFixed(6)),
    raio_km: parseFloat(Math.max(1, maxDistKm).toFixed(2))
  };
}

/**
 * Gera polígono simulado (GeoJSON Polygon) ao redor de um ponto central
 * para cidades do agronegócio que não possuam mock manual.
 */
export function generateSyntheticRuralPolygon(centerLat, centerLng, radiusKm = 3) {
  const points = 12;
  const coords = [];
  const earthRadiusKm = 6371;

  for (let i = 0; i < points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    // Variação leve no raio para criar contorno orgânico de fazenda
    const variation = 0.8 + ((i % 3) * 0.15);
    const r = radiusKm * variation;
    
    const latOffset = (r / earthRadiusKm) * (180 / Math.PI);
    const lngOffset = (r / (earthRadiusKm * Math.cos(centerLat * Math.PI / 180))) * (180 / Math.PI);

    const lat = centerLat + Math.sin(angle) * latOffset;
    const lng = centerLng + Math.cos(angle) * lngOffset;
    coords.push([parseFloat(lng.toFixed(6)), parseFloat(lat.toFixed(6))]);
  }
  // Fecha o anel
  coords.push(coords[0]);

  return {
    type: 'Polygon',
    coordinates: [coords]
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SIGEF_DIR = path.resolve(__dirname, '../../../data/sigef');
const OFFICIAL_SIGEF_PATH = path.resolve(__dirname, '../../../data/sigef/official_sigef_parcels.json');

/**
 * FASE 51: Carrega parcelas fundiárias oficiais cadastradas pelo SIGEF/INCRA
 */
export function loadOfficialRuralProperties() {
  const parcels = [];
  const seenIds = new Set();

  function addParcel(p) {
    if (!p) return;
    const key = p.id_sigef || p.codigo_imovel || (String(p.nome_imovel || '') + String(p.municipio || ''));
    if (!seenIds.has(key)) {
      seenIds.add(key);
      parcels.push(p);
    }
  }

  try {
    if (fs.existsSync(OFFICIAL_SIGEF_PATH)) {
      const content = fs.readFileSync(OFFICIAL_SIGEF_PATH, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) parsed.forEach(addParcel);
    }

    if (fs.existsSync(SIGEF_DIR)) {
      function scanDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.geojson') || (entry.name.endsWith('.json') && entry.name !== 'official_sigef_parcels.json'))) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const parsed = JSON.parse(content);
              if (Array.isArray(parsed)) {
                parsed.forEach(addParcel);
              } else if (parsed && Array.isArray(parsed.features)) {
                parsed.features.forEach(f => {
                  addParcel({
                    ...(f.properties || {}),
                    geometria_poligono: f.geometry
                  });
                });
              }
            } catch (_) {}
          }
        }
      }
      scanDir(SIGEF_DIR);
    }
  } catch (err) {
    console.warn('⚠️ [GEO FUNDIARIO] Falha ao ler acervo oficial SIGEF:', err.message);
  }
  return parcels;
}

/**
 * Parcelas fundiárias oficiais autenticadas do SIGEF/INCRA
 */
export const SEED_RURAL_PROPERTIES = loadOfficialRuralProperties();

/**
 * FASE 51 (ETAPA 3 - AÇÃO 2): Conversor e normalizador de propriedades GeoJSON reais do SIGEF / INCRA / CAR.
 * Mapeia propriedades governamentais:
 * - area / num_area -> area_hectares
 * - nome_area / denominacao -> nome_imovel
 * - detentor_nome / detentor / titular / proprietario -> nome_titular
 * - detentor_cpf_cnpj / cpf_cnpj -> cpf_cnpj_titular
 * 
 * @param {Object} rawProps Propriedades brutas do Feature GeoJSON ou do payload
 * @returns {Object} Propriedades normalizadas
 */
export function convertGeoJsonProperties(rawProps = {}) {
  if (!rawProps || typeof rawProps !== 'object') return {};

  const area = parseFloat(rawProps.area_hectares ?? rawProps.area ?? rawProps.num_area ?? rawProps.area_ha ?? 0) || 0;
  const nomeImovel = rawProps.nome_imovel || rawProps.nome_area || rawProps.denominacao || rawProps.nome || '';
  const nomeTitular = rawProps.nome_titular || rawProps.detentor_nome || rawProps.detentor || rawProps.titular || rawProps.proprietario || '';
  const cpfCnpj = rawProps.cpf_cnpj_titular || rawProps.detentor_cpf_cnpj || rawProps.cpf_cnpj || rawProps.documento_titular || null;
  const idSigef = rawProps.id_sigef || rawProps.codigo_imovel || rawProps.parcela_codigo || null;
  const statusGeo = String(rawProps.status_geo || (idSigef || area > 0 || rawProps.geometria_poligono || rawProps.geometry ? 'CERTIFICADO' : 'SEM_GEO')).toUpperCase();

  // Classificação tática de Entidade: PJ (Receita Federal / QSA) vs PF (LGPD / Bureau)
  const cleanDoc = String(cpfCnpj || '').replace(/\D/g, '');
  const corporateRegex = /\b(S\/A|S\.A\.|SA|LTDA|ME|EPP|EIRELI|AGROPECUARIA|AGROPECUÁRIA|AGRICOLA|AGRÍCOLA|AGRO|COOPERATIVA|COOP|SEMENTES|GRAOS|GRÃOS|PARTICIPACOES|PARTICIPAÇÕES|COMERCIO|IND[UÚ]STRIA|USINA|PESQUISAS AGRON[OÔ]MICAS|CENTRO DE PESQUISAS)\b/i;
  
  let tipoPessoa = rawProps.tipo_pessoa || 'INDETERMINADO';
  if (cleanDoc.length === 14) {
    tipoPessoa = 'PJ';
  } else if (cleanDoc.length === 11) {
    tipoPessoa = 'PF';
  } else if (corporateRegex.test(nomeTitular) || corporateRegex.test(nomeImovel) || area >= 150) {
    tipoPessoa = 'PJ';
  } else {
    tipoPessoa = 'PF';
  }
  const isCorporate = tipoPessoa === 'PJ';

  return {
    ...rawProps,
    id_sigef: idSigef,
    nome_imovel: nomeImovel,
    nome_titular: nomeTitular,
    cpf_cnpj_titular: cpfCnpj,
    tipo_pessoa: tipoPessoa,
    is_corporate: isCorporate,
    area_hectares: area,
    status_geo: statusGeo
  };
}

/**
 * Salva ou atualiza uma propriedade rural no banco de dados com isolamento por Tenant
 */
export async function saveOrUpdateRuralProperty(propertyData, tenantId = 'tenant-root-default') {
  // Normaliza dados de GeoJSON do SIGEF (area, nome_area, detentor_nome, detentor_cpf_cnpj)
  const normalizedData = convertGeoJsonProperties(propertyData);

  const {
    id_sigef,
    codigo_imovel,
    nome_imovel: _rawNomeImovel,
    municipio,
    uf,
    area_hectares = 0,
    geometria_poligono,
    nome_titular: _rawNomeTitular,
    cpf_cnpj_titular = null,
    status_geo = 'SEM_GEO',
    intent_score = 0,
    intent_classification = 'COLD',
    intent_triggers = [],
    // ── FASE 57: Campos ambientais SICAR/CAR ──────────────────────────────
    codigo_car = null,
    status_car = null,
    condicao_car = null,
    tag_fonte = null,          // null → determinado automaticamente abaixo
    area_app_ha = null,
    area_reserva_legal_ha = null,
    tem_passivo_ambiental = 0,
    alerta_ambiental = null
  } = normalizedData;

  // ── BUGFIX "Falha de API no MT": SICAR/CAR não garante esses campos ──────
  // Imóveis do CAR chegam sem nome_imovel e sem nome_titular — fields NOT NULL
  // no SQLite que causavam falha silenciosa de INSERT. Aplicamos fallback seguro.
  const nome_imovel = (_rawNomeImovel || '').trim() || 'Imóvel Rural (CAR)';
  const nome_titular = (_rawNomeTitular || '').trim() || 'Titular não informado';

  // tag_fonte: derivada do codigo_car e id_sigef se não fornecida explicitamente
  const resolvedTagFonte = tag_fonte ||
    (codigo_car && id_sigef ? 'FUSAO_SIGEF_CAR' :
     codigo_car             ? 'SICAR'           :
                              'SIGEF');

  if (!municipio || !uf || !geometria_poligono) {
    throw new Error('Campos obrigatórios ausentes: municipio, uf, geometria_poligono');
  }

  // Parse e validação do GeoJSON
  let geomJson = typeof geometria_poligono === 'string' 
    ? JSON.parse(geometria_poligono) 
    : geometria_poligono;

  // Extrai anel de coordenadas para centróide e raio
  let coordsRing = [];
  // Garante que o identificador de SIGEF seja unívoco por tenant_id
  const scopedSigef = id_sigef 
    ? (id_sigef.includes(`::${tenantId}`) ? id_sigef : (tenantId === 'tenant-root-default' ? id_sigef : `${id_sigef}::${tenantId}`))
    : null;

  if (geomJson.type === 'Feature' && geomJson.geometry) {
    coordsRing = geomJson.geometry.coordinates;
  } else if (geomJson.type === 'Polygon') {
    coordsRing = geomJson.coordinates;
  }

  const { centroide_lat, centroide_lng, raio_km } = calculatePolygonCentroidAndRadius(coordsRing);
  const geomString = JSON.stringify(geomJson);

  // Busca registro existente antes para comparar titularidade (isolamento estrito por tenant)
  const existing = db.prepare(`
    SELECT id, nome_titular, cpf_cnpj_titular, whatsapp_validado, linkedin_url_real, email_validado, osint_status 
    FROM propriedades_rurais 
    WHERE ((id_sigef = ? AND id_sigef IS NOT NULL) OR (nome_imovel = ? AND municipio = ? AND uf = ?)) AND tenant_id = ?
  `).get(scopedSigef || '', nome_imovel, municipio, uf, tenantId);

  // FASE 44/45 ETAPA 5: DETECÇÃO DE MUDANÇA DE TITULARIDADE (TROCA DE DONO)
  const isOwnershipChanged = existing && (
    (existing.nome_titular && existing.nome_titular.trim().toUpperCase() !== (nome_titular || '').trim().toUpperCase()) ||
    (existing.cpf_cnpj_titular && cpf_cnpj_titular && existing.cpf_cnpj_titular.replace(/\D/g, '') !== cpf_cnpj_titular.replace(/\D/g, ''))
  );

  // FASE 49: Identificação de Uso do Solo e Cultivo via Sensoriamento Remoto (MapBiomas / Sentinel)
  const agronomicData = propertyData.dados_agronomicos 
    ? (typeof propertyData.dados_agronomicos === 'string' ? JSON.parse(propertyData.dados_agronomicos) : propertyData.dados_agronomicos)
    : satelliteService.identifyLandUse(geomJson, {
        municipio,
        uf,
        area_hectares,
        nome_imovel,
        centroide_lat,
        centroide_lng
      });
  const agronomicString = agronomicData ? JSON.stringify(agronomicData) : null;

  // FASE 44 & FASE 50 (ETAPA 2): MOTOR DE INTENÇÃO DE COMPRA RURAL (INTENT SCORING ENGINE COM SINAIS DE SAFRA)
  let finalScore = intent_score;
  let finalClassification = intent_classification;
  let finalTriggers = intent_triggers;
  let mergedTitular = propertyData.titularData || {};

  // Se não foi explicitamente fornecido um score customizado (>0), se foi passado titularData, ou se houve troca de titular, recalcula
  if (propertyData.titularData || isOwnershipChanged || (!intent_score && intent_triggers.length === 0) || (agronomicData && agronomicData.crop_type)) {
    const corporateData = lookupTitularCorporateData(cpf_cnpj_titular, nome_titular, tenantId);
    mergedTitular = {
      ...corporateData,
      ...(propertyData.titularData || {})
    };
    const scored = calculateRuralIntentScore(mergedTitular, { status_geo, area_hectares, nome_imovel, municipio, uf, dados_agronomicos: agronomicData });
    finalScore = scored.intent_score;
    finalClassification = scored.intent_classification;
    finalTriggers = scored.intent_triggers;
  }

  const triggersString = JSON.stringify(finalTriggers || []);

  // FASE 44 ETAPA 3 / ETAPA 5: FUSÃO OSINT (ENRIQUECIMENTO AUTOMÁTICO DE DECISOR)
  let whatsapp_validado = isOwnershipChanged ? null : (propertyData.whatsapp_validado || null);
  let linkedin_url_real = isOwnershipChanged ? null : (propertyData.linkedin_url_real || null);
  let email_validado = isOwnershipChanged ? null : (propertyData.email_validado || null);
  let osint_status = isOwnershipChanged ? 'PENDING' : (propertyData.osint_status || 'PENDING');

  // Aciona OSINT se ainda não foi enriquecido, se for imóvel SEM_GEO ou HOT, ou se houve troca de titular (a menos que skip_osint esteja ativo)
  const shouldEnrichOsint = !propertyData.skip_osint && ((!whatsapp_validado && !linkedin_url_real && (status_geo === 'SEM_GEO' || finalClassification === 'HOT' || propertyData.force_osint)) || isOwnershipChanged);
  if (shouldEnrichOsint && nome_titular) {
    try {
      // FASE 47 (ETAPA 2): SALTO SOCIETÁRIO (QSA MATCH) SE FOR CPF OU SE TITULAR NÃO POSSUIR CONTATO DIRETO
      let qsaCompany = null;
      if (cpf_cnpj_titular || nome_titular) {
        qsaCompany = osintService.findCompanyByCpf(cpf_cnpj_titular, tenantId, nome_titular);
      }

      if (qsaCompany) {
        if (qsaCompany.whatsapp_validado && !whatsapp_validado) {
          whatsapp_validado = qsaCompany.whatsapp_validado;
          osint_status = 'ENRICHED';
        }
        if (qsaCompany.email_comercial && !email_validado) {
          email_validado = qsaCompany.email_comercial;
        }
      }

      const osintResult = await osintService.enrichDecisorReal({
        nome: nome_titular,
        empresa: qsaCompany?.razao_social || nome_imovel,
        municipio,
        uf,
        candidateEmail: propertyData.email || email_validado || null
      });

      if (osintResult && osintResult.enriched) {
        linkedin_url_real = osintResult.linkedin_url || linkedin_url_real || null;
        email_validado = osintResult.email_validado || email_validado || null;
        osint_status = 'ENRICHED';
      } else if (!whatsapp_validado && !email_validado) {
        osint_status = 'NOT_FOUND';
      }

      // Validação/Triangulação de telefone se fornecido no payload ou dados corporativos
      const phoneCandidate = propertyData.telefone || propertyData.whatsapp || (mergedTitular?.telefone) || (qsaCompany?.telefone_comercial) || null;
      if (phoneCandidate && !whatsapp_validado) {
        const phoneCheck = validatePhoneChannel(phoneCandidate);
        if (phoneCheck.is_valid && phoneCheck.is_whatsapp_capable) {
          whatsapp_validado = phoneCheck.e164 || phoneCheck.cleaned;
          osint_status = 'ENRICHED';
        }
      }
    } catch (osintErr) {
      console.warn('⚠️ [OSINT RURAL WARNING]:', osintErr.message);
      osint_status = 'ERROR';
    }
  }

  const now = new Date().toISOString();

  // Dados agronômicos já inicializados no bloco anterior de scoring

  if (existing) {
    // Se a titularidade mudou, NÃO herda contatos do antigo proprietário
    if (!isOwnershipChanged) {
      whatsapp_validado = whatsapp_validado || existing.whatsapp_validado;
      linkedin_url_real = linkedin_url_real || existing.linkedin_url_real;
      email_validado = email_validado || existing.email_validado;
      osint_status = (osint_status !== 'PENDING' && osint_status !== 'NOT_FOUND') ? osint_status : (existing.osint_status || osint_status);
    }

    db.prepare(`
      UPDATE propriedades_rurais SET
        id_sigef = COALESCE(?, id_sigef),
        codigo_imovel = COALESCE(?, codigo_imovel),
        nome_imovel = ?,
        municipio = ?,
        uf = ?,
        area_hectares = ?,
        geometria_poligono = ?,
        centroide_lat = ?,
        centroide_lng = ?,
        raio_abrangencia_km = ?,
        nome_titular = ?,
        cpf_cnpj_titular = ?,
        status_geo = ?,
        intent_score = ?,
        intent_classification = ?,
        intent_triggers = ?,
        whatsapp_validado = ?,
        linkedin_url_real = ?,
        email_validado = ?,
        osint_status = ?,
        dados_agronomicos = COALESCE(?, dados_agronomicos),
        codigo_car = COALESCE(?, codigo_car),
        status_car = COALESCE(?, status_car),
        condicao_car = COALESCE(?, condicao_car),
        tag_fonte = COALESCE(?, tag_fonte),
        area_app_ha = COALESCE(?, area_app_ha),
        area_reserva_legal_ha = COALESCE(?, area_reserva_legal_ha),
        tem_passivo_ambiental = COALESCE(?, tem_passivo_ambiental),
        alerta_ambiental = COALESCE(?, alerta_ambiental),
        data_ultima_sync = ?,
        updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(
      id_sigef || null,
      codigo_imovel || null,
      nome_imovel,
      municipio.toUpperCase(),
      uf.toUpperCase(),
      area_hectares,
      geomString,
      centroide_lat,
      centroide_lng,
      raio_km,
      nome_titular,
      cpf_cnpj_titular,
      status_geo,
      finalScore,
      finalClassification,
      triggersString,
      whatsapp_validado,
      linkedin_url_real,
      email_validado,
      osint_status,
      agronomicString,
      codigo_car || null,
      status_car || null,
      condicao_car || null,
      resolvedTagFonte || null,
      area_app_ha != null ? area_app_ha : null,
      area_reserva_legal_ha != null ? area_reserva_legal_ha : null,
      tem_passivo_ambiental ? 1 : 0,
      alerta_ambiental || null,
      now,
      now,
      existing.id,
      tenantId
    );

    const updatedPayload = { 
      id: existing.id, 
      action: 'UPDATED', 
      is_ownership_changed: Boolean(isOwnershipChanged),
      centroide_lat, 
      centroide_lng, 
      raio_km,
      intent_score: finalScore,
      intent_classification: finalClassification,
      intent_triggers: finalTriggers,
      whatsapp_validado,
      linkedin_url_real,
      email_validado,
      osint_status,
      dados_agronomicos: agronomicData
    };

    // Sincroniza atualização com a Tabela Analítica (aba Produtores Rurais)
    try {
      await createRuralPropertyLead({
        id_sigef: scopedSigef || id_sigef || null,
        nome_imovel,
        nome_titular,
        cpf_cnpj_titular,
        municipio,
        uf,
        area_hectares,
        whatsapp_validado,
        email_validado,
        status_geo,
        intent_score: finalScore,
        intent_classification: finalClassification,
        centroide_lat,
        centroide_lng
      }, tenantId);
    } catch (_) {}

    return updatedPayload;
  } else {
    const id = `prop-${crypto.randomBytes(6).toString('hex')}`;
    db.prepare(`
      INSERT INTO propriedades_rurais (
        id, id_sigef, codigo_imovel, nome_imovel, municipio, uf,
        area_hectares, geometria_poligono, centroide_lat, centroide_lng,
        raio_abrangencia_km, nome_titular, cpf_cnpj_titular, status_geo,
        intent_score, intent_classification, intent_triggers,
        whatsapp_validado, linkedin_url_real, email_validado, osint_status,
        dados_agronomicos,
        codigo_car, status_car, condicao_car, tag_fonte,
        area_app_ha, area_reserva_legal_ha, tem_passivo_ambiental, alerta_ambiental,
        tenant_id, data_ultima_sync, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      scopedSigef || null,
      codigo_imovel || null,
      nome_imovel,
      municipio.toUpperCase(),
      uf.toUpperCase(),
      area_hectares,
      geomString,
      centroide_lat,
      centroide_lng,
      raio_km,
      nome_titular,
      cpf_cnpj_titular,
      status_geo,
      finalScore,
      finalClassification,
      triggersString,
      whatsapp_validado,
      linkedin_url_real,
      email_validado,
      osint_status,
      agronomicString,
      codigo_car || null,
      status_car || null,
      condicao_car || null,
      resolvedTagFonte || 'SIGEF',
      area_app_ha != null ? area_app_ha : null,
      area_reserva_legal_ha != null ? area_reserva_legal_ha : null,
      tem_passivo_ambiental ? 1 : 0,
      alerta_ambiental || null,
      tenantId,
      now,
      now,
      now
    );

    const responsePayload = { 
      id, 
      action: 'CREATED', 
      centroide_lat, 
      centroide_lng, 
      raio_km,
      intent_score: finalScore,
      intent_classification: finalClassification,
      intent_triggers: finalTriggers,
      whatsapp_validado,
      linkedin_url_real,
      email_validado,
      osint_status,
      dados_agronomicos: agronomicData
    };

    // FASE 47: Sincronização automática com a Tabela Analítica (aba Produtores Rurais)
    try {
      await createRuralPropertyLead({
        id_sigef: scopedSigef || id_sigef || null,
        nome_imovel,
        nome_titular,
        cpf_cnpj_titular,
        municipio,
        uf,
        area_hectares,
        whatsapp_validado,
        email_validado,
        status_geo,
        intent_score: finalScore,
        intent_classification: finalClassification,
        centroide_lat,
        centroide_lng
      }, tenantId);
    } catch (_) {}

    return responsePayload;
  }
}

/**
 * Consulta propriedades rurais com filtros opcionais de localização e status_geo
 */
export async function listRuralProperties(filters = {}, tenantId = 'tenant-root-default') {
  const { uf, municipio, status_geo, intent_classification, limit = 100, page = 1 } = filters;
  const conditions = ['tenant_id = ?'];
  const params = [tenantId];

  if (uf) {
    conditions.push('uf = ?');
    params.push(uf.toUpperCase());
  }

  if (municipio) {
    const rawMun = String(municipio || '').trim();
    const cleanMun = rawMun.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    conditions.push('(UPPER(municipio) = ? OR UPPER(municipio) = ? OR UPPER(municipio) LIKE ?)');
    params.push(rawMun.toUpperCase(), cleanMun, `%${cleanMun}%`);
  }

  if (status_geo) {
    conditions.push('status_geo = ?');
    params.push(status_geo.toUpperCase());
  }

  if (intent_classification) {
    conditions.push('intent_classification = ?');
    params.push(intent_classification.toUpperCase());
  }

  const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
  const whereClause = conditions.join(' AND ');

  const totalCountRow = db.prepare(`SELECT COUNT(*) as total FROM propriedades_rurais WHERE ${whereClause}`).get(...params);
  const total = totalCountRow ? totalCountRow.total : 0;

  params.push(parseInt(limit, 10));
  params.push(offset);

  const rows = db.prepare(`
    SELECT * FROM propriedades_rurais 
    WHERE ${whereClause}
    ORDER BY area_hectares DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params);

  const properties = rows.map(r => {
    let geom = null;
    let triggers = [];
    let agro = null;
    try { geom = JSON.parse(r.geometria_poligono); } catch (_) {}
    try { triggers = JSON.parse(r.intent_triggers); } catch (_) {}
    try { agro = r.dados_agronomicos ? JSON.parse(r.dados_agronomicos) : null; } catch (_) {}

    if (!agro) {
      agro = satelliteService.identifyLandUse(geom, {
        municipio: r.municipio,
        uf: r.uf,
        centroide_lat: r.centroide_lat,
        centroide_lng: r.centroide_lng,
        area_hectares: r.area_hectares,
        nome_imovel: r.nome_imovel
      });
    }

    return {
      ...r,
      geometria_poligono: geom,
      intent_triggers: triggers,
      dados_agronomicos: agro
    };
  });

  return {
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    data: properties
  };
}

/**
 * Retorna FeatureCollection GeoJSON completa das propriedades para renderização imediata no WebGL
 */
export async function getRuralGeoJson(filters = {}, tenantId = 'tenant-root-default') {
  let result = await listRuralProperties({ ...filters, limit: 1000 }, tenantId);

  // Auto-sync: se SQLite não possuir parcelas da região solicitada, sincroniza com acervo oficial SIGEF
  if ((!result.data || result.data.length === 0) && (filters.uf || filters.municipio)) {
    try {
      await syncRegionalCadastralMesh(filters, tenantId);
      result = await listRuralProperties({ ...filters, limit: 1000 }, tenantId);
    } catch (syncErr) {
      console.warn('⚠️ [GEO FUNDIARIO] Auto-sync SIGEF:', syncErr.message);
    }
  }

  const features = result.data.map(p => {
    const geometry = p.geometria_poligono?.geometry || p.geometria_poligono;
    return {
      type: 'Feature',
      id: p.id,
      geometry: geometry,
      properties: {
        id: p.id,
        id_sigef: p.id_sigef,
        nome_imovel: p.nome_imovel,
        nome_titular: p.nome_titular,
        cpf_cnpj_titular: p.cpf_cnpj_titular,
        municipio: p.municipio,
        uf: p.uf,
        area_hectares: p.area_hectares,
        status_geo: p.status_geo,
        tag_fonte: p.tag_fonte || 'SIGEF',
        tipo_pessoa: p.tipo_pessoa || (String(p.cpf_cnpj_titular || '').replace(/\D/g, '').length === 14 ? 'PJ' : (String(p.cpf_cnpj_titular || '').replace(/\D/g, '').length === 11 ? 'PF' : (/\b(S\/A|S\.A\.|SA|LTDA|ME|EPP|EIRELI|AGROPECUARIA|AGROPECUÁRIA|AGRICOLA|AGRÍCOLA|AGRO|COOPERATIVA|COOP|SEMENTES|GRAOS|GRÃOS|PARTICIPACOES|PARTICIPAÇÕES|COMERCIO|IND[UÚ]STRIA|USINA|PESQUISAS AGRON[OÔ]MICAS|CENTRO DE PESQUISAS)\b/i.test((p.nome_titular || '') + ' ' + (p.nome_imovel || '')) || Number(p.area_hectares) >= 150 ? 'PJ' : 'PF'))),
        is_corporate: (p.tipo_pessoa === 'PJ' || String(p.cpf_cnpj_titular || '').replace(/\D/g, '').length === 14 || /\b(S\/A|S\.A\.|SA|LTDA|ME|EPP|EIRELI|AGROPECUARIA|AGROPECUÁRIA|AGRICOLA|AGRÍCOLA|AGRO|COOPERATIVA|COOP|SEMENTES|GRAOS|GRÃOS|PARTICIPACOES|PARTICIPAÇÕES|COMERCIO|IND[UÚ]STRIA|USINA|PESQUISAS AGRON[OÔ]MICAS|CENTRO DE PESQUISAS)\b/i.test((p.nome_titular || '') + ' ' + (p.nome_imovel || '')) || Number(p.area_hectares) >= 150),
        intent_score: p.intent_score,
        intent_classification: p.intent_classification,
        whatsapp_validado: p.whatsapp_validado,
        linkedin_url_real: p.linkedin_url_real,
        email_validado: p.email_validado,
        osint_status: p.osint_status,
        dados_agronomicos: p.dados_agronomicos,
        crop_type: p.dados_agronomicos?.crop_type || 'Soja',
        crop_confidence: p.dados_agronomicos?.confidence || 0.90,
        centroide_lat: p.centroide_lat,
        centroide_lng: p.centroide_lng,
        raio_abrangencia_km: p.raio_abrangencia_km,
        data_ultima_sync: p.data_ultima_sync
      }
    };
  });

  return {
    type: 'FeatureCollection',
    total_features: features.length,
    features
  };
}

/**
 * FASE 51 (ETAPA 2 - AÇÃO 1): Ingestão Oficial de Malha Fundiária (SIGEF / INCRA)
 * Conecta a endpoints governamentais (WFS / GeoServer INCRA) e consome acervos
 * oficiais GeoJSON, eliminando 100% de dados sintéticos ou fictícios.
 */
export async function syncRegionalCadastralMesh(params = {}, tenantId = 'tenant-root-default') {
  const { municipio, uf } = params;
  const norm = str => String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const targetMun = (municipio || '').toUpperCase().trim();
  const targetUf = (uf || '').toUpperCase().trim();
  const targetMunNorm = norm(targetMun);
  const targetUfNorm = norm(targetUf);

  // 1. Consulta acervo oficial de parcelas certificadas
  const officialParcels = loadOfficialRuralProperties();
  let matches = officialParcels.filter(p => {
    const pUf = norm(p.uf);
    const pMun = norm(p.municipio);
    if (targetUfNorm && pUf !== targetUfNorm) return false;
    if (targetMunNorm && pMun !== targetMunNorm && !pMun.includes(targetMunNorm) && !targetMunNorm.includes(pMun)) return false;
    return true;
  });

  // 2. Consulta ao endpoint oficial WFS OGC do INCRA (Acervo Fundiário)
  if (matches.length === 0 && targetUf) {
    const ufLower = targetUf.toLowerCase();
    const sigefWfsUrl = process.env.SIGEF_API_URL || `https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_${ufLower}&service=WFS&version=1.0.0&request=GetFeature&typeName=certificada_sigef_particular_${ufLower}&maxFeatures=50`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      
      const res = await fetch(sigefWfsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const textData = await res.text();
        if (textData && textData.includes('featureMember')) {
          const { parseIncraGml } = await import('../../scripts/test_incra_parser.js');
          const wfsMatches = parseIncraGml(textData, targetMun, targetUf);
          if (wfsMatches.length > 0) {
            matches = [...matches, ...wfsMatches];
          }
        }
      }
    } catch (wfsErr) {
      console.warn(`[SIGEF/INCRA WFS] Consulta online oficial: ${wfsErr.message}. Utilizando acervo oficial local.`);
    }
  }

  // 3. REGRA DE PRODUÇÃO GO-LIVE: Se não houver dados oficiais do SIGEF/INCRA,
  // retorna estritamente 0 registros sem inventar dados sintéticos.
  if (matches.length === 0) {
    return {
      success: true,
      total_ingested: 0,
      municipio: targetMun || 'TODOS',
      uf: targetUf || 'TODAS',
      properties: [],
      message: 'Nenhum registro fundiário oficial localizado para o município informado.'
    };
  }

  const results = [];
  for (const item of matches) {
    // RIGOR PRODUÇÃO GO-LIVE: Se não possuir geometria oficial, descarta. Nunca inventa polígonos sintéticos.
    const polyGeoJson = item.geometria_poligono;
    if (!polyGeoJson) continue;

    const saved = await saveOrUpdateRuralProperty({
      id_sigef: item.id_sigef || '',
      codigo_imovel: item.codigo_imovel || '',
      nome_imovel: item.nome_imovel || '',
      municipio: item.municipio || targetMun,
      uf: item.uf || targetUf,
      area_hectares: item.area_hectares || 0,
      geometria_poligono: polyGeoJson,
      nome_titular: item.nome_titular || '',
      cpf_cnpj_titular: item.cpf_cnpj_titular || null,
      status_geo: item.status_geo || 'CERTIFICADO',
      tag_fonte: 'SIGEF',
      dados_agronomicos: item.dados_agronomicos || null,
      skip_osint: true,
      titularData: item.titularData || {}
    }, tenantId);

    results.push({
      id_sigef: item.id_sigef,
      nome_imovel: item.nome_imovel,
      status_geo: item.status_geo,
      ...saved
    });
  }

  return {
    success: true,
    total_ingested: results.length,
    municipio: targetMun || 'TODOS',
    uf: targetUf || 'TODAS',
    properties: results
  };
}

/**
 * FASE 47 ETAPA 2: Algoritmo Point-in-Polygon (Ray-Casting / Jordan Curve Theorem)
 * Verifica se uma coordenada [lng, lat] intercepta a geometria GeoJSON de uma propriedade
 */
export function isPointInsideGeoJsonPolygon(lng, lat, geometry) {
  if (!geometry) return false;
  const geom = typeof geometry === 'string' ? JSON.parse(geometry) : geometry;
  const geomType = geom.type === 'Feature' ? geom.geometry?.type : geom.type;
  const coords = geom.type === 'Feature' ? geom.geometry?.coordinates : geom.coordinates;

  if (!coords) return false;

  if (geomType === 'Polygon') {
    return pointInPolygonRings(lng, lat, coords);
  } else if (geomType === 'MultiPolygon') {
    for (const polyCoords of coords) {
      if (pointInPolygonRings(lng, lat, polyCoords)) {
        return true;
      }
    }
    return false;
  }
  return false;
}

function pointInPolygonRings(lng, lat, rings) {
  if (!Array.isArray(rings) || rings.length === 0) return false;
  const outerRing = rings[0];
  if (!pointInLinearRing(lng, lat, outerRing)) return false;

  // Se houver anéis internos (buracos/ilhas), se estiver dentro de um buraco, está FORA
  for (let i = 1; i < rings.length; i++) {
    if (pointInLinearRing(lng, lat, rings[i])) {
      return false;
    }
  }
  return true;
}

function pointInLinearRing(x, y, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Realiza busca reversa (Pin-Drop) para descobrir qual fazenda/titular intercepta a coordenada
 * @param {number} lat Latitude do clique
 * @param {number} lng Longitude do clique
 * @param {string} tenantId Identificador do tenant
 */
export async function reverseGeocodeRuralProperty(lat, lng, tenantId = 'tenant-root-default') {
  const pLat = parseFloat(lat);
  const pLng = parseFloat(lng);

  if (isNaN(pLat) || isNaN(pLng)) {
    throw new Error('Coordenadas inválidas. Forneça latitude e longitude válidas.');
  }

  // 1. Busca propriedades registradas para o tenant
  const rows = db.prepare(`
    SELECT * FROM propriedades_rurais 
    WHERE tenant_id = ?
    ORDER BY created_at DESC
  `).all(tenantId);

  let found = null;

  for (const row of rows) {
    if (!row.geometria_poligono) continue;
    if (isPointInsideGeoJsonPolygon(pLng, pLat, row.geometria_poligono)) {
      found = row;
      break;
    }
  }

  // Se não encontrar no tenant e não for o tenant-root-default, pesquisa no acervo público do tenant raiz
  if (!found && tenantId !== 'tenant-root-default') {
    const rootRows = db.prepare(`
      SELECT * FROM propriedades_rurais 
      WHERE tenant_id = 'tenant-root-default'
      ORDER BY created_at DESC
    `).all();

    for (const row of rootRows) {
      if (!row.geometria_poligono) continue;
      if (isPointInsideGeoJsonPolygon(pLng, pLat, row.geometria_poligono)) {
        found = row;
        break;
      }
    }
  }

  if (!found) {
    return null;
  }

  let geom = null;
  let triggers = [];
  let agro = null;
  try { geom = JSON.parse(found.geometria_poligono); } catch (_) {}
  try { triggers = typeof found.intent_triggers === 'string' ? JSON.parse(found.intent_triggers) : (found.intent_triggers || []); } catch (_) {}
  try { agro = found.dados_agronomicos ? JSON.parse(found.dados_agronomicos) : null; } catch (_) {}

  if (!agro || !agro.crop_type) {
    agro = await satelliteService.identifyLandUse(geom, {
      municipio: found.municipio,
      uf: found.uf,
      centroide_lat: found.centroide_lat,
      centroide_lng: found.centroide_lng,
      area_hectares: found.area_hectares,
      nome_imovel: found.nome_imovel
    });

    if (found.id && agro) {
      try {
        db.prepare(`
          UPDATE propriedades_rurais 
          SET dados_agronomicos = ? 
          WHERE id = ?
        `).run(JSON.stringify(agro), found.id);
      } catch (dbErr) {
        console.warn('Falha ao persistir dados agronômicos no service:', dbErr.message);
      }
    }
  }

  // FASE 50 (ETAPA 2): Sinais de Intenção e Bônus Contextual Agronômico
  let finalScore = found.intent_score;
  let finalClassification = found.intent_classification;

  if (agro && agro.crop_type) {
    const hasAgroTrigger = triggers.some(t => t.includes('Ciclo de Safra') || t.includes('Manejo de Pastagem'));
    if (!hasAgroTrigger) {
      const rescored = calculateRuralIntentScore(
        { ...found, titularData: {} }, 
        { ...found, dados_agronomicos: agro }
      );
      finalScore = rescored.intent_score;
      finalClassification = rescored.intent_classification;
      triggers = rescored.intent_triggers;
      
      try {
        db.prepare(`
          UPDATE propriedades_rurais 
          SET intent_score = ?, intent_classification = ?, intent_triggers = ? 
          WHERE id = ?
        `).run(finalScore, finalClassification, JSON.stringify(triggers), found.id);
      } catch (_) {}
    }
  }

  return {
    ...found,
    intent_score: finalScore,
    intent_classification: finalClassification,
    geometria_poligono: geom,
    intent_triggers: triggers,
    dados_agronomicos: agro
  };
}

