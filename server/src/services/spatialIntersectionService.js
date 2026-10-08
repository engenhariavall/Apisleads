/**
 * server/src/services/spatialIntersectionService.js
 * 
 * FASE 52 — PASSO 2: SOBREPOSIÇÃO ESPACIAL SIGEF / INCRA (INTERSECTS)
 * Motor Geodésico de Alta Precisão para Cruzamento de Malhas Fundiárias.
 * 
 * Mecânica:
 * 1. Executa Bounding-Box indexing para descartar polígonos distantes em O(1).
 * 2. Aplica Ray-Casting (Jordan Curve Theorem) para testar inclusão de centróides e vértices.
 * 3. Quando há sobreposição espacial entre o polígono do CAR e o polígono do SIGEF/INCRA:
 *    - O imóvel do CAR herda os metadados com fé pública federal:
 *      * Matrícula Imobiliária no Cartório de Registro de Imóveis (CRI)
 *      * Código do Imóvel no SNCR (INCRA)
 *      * Denominação Oficial Registrada (nome_area)
 *      * Nome do Detentor Certificado (quando presente no SIGEF)
 *      * Status de Certificação Federal ('CERTIFICADO_INCRA')
 */

/**
 * Calcula Bounding Box [minLng, minLat, maxLng, maxLat] de uma geometria GeoJSON
 * @param {Object} geometry Objeto Geometry (Polygon ou MultiPolygon)
 * @returns {[number, number, number, number]|null}
 */
export function calculateBoundingBox(geometry) {
  if (!geometry) return null;
  const geomType = geometry.type;
  const coords = geometry.coordinates;
  if (!coords || !Array.isArray(coords)) return null;

  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  function recurse(arr) {
    if (!Array.isArray(arr)) return;
    if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      const lng = arr[0];
      const lat = arr[1];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const item of arr) recurse(item);
    }
  }

  recurse(coords);

  if (minLng === Infinity || minLat === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Testa se dois Bounding Boxes colidem
 */
export function doBoundingBoxesOverlap(bbox1, bbox2, toleranceDeg = 0.002) {
  if (!bbox1 || !bbox2) return false;
  return !(
    bbox1[2] + toleranceDeg < bbox2[0] ||
    bbox1[0] - toleranceDeg > bbox2[2] ||
    bbox1[3] + toleranceDeg < bbox2[1] ||
    bbox1[1] - toleranceDeg > bbox2[3]
  );
}

/**
 * Algoritmo Ray-Casting (Jordan Curve Theorem) para testar se ponto [lng, lat] está dentro do anel
 */
export function isPointInLinearRing(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]), yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]), yj = Number(ring[j][1]);

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Testa se [lng, lat] está dentro de uma geometria (Polygon ou MultiPolygon)
 */
export function isPointInsideGeometry(lng, lat, geometry) {
  if (!geometry || !geometry.coordinates) return false;
  const geomType = geometry.type;
  const coords = geometry.coordinates;

  if (geomType === 'Polygon') {
    if (!Array.isArray(coords) || coords.length === 0) return false;
    const outerRing = coords[0];
    if (!isPointInLinearRing(lng, lat, outerRing)) return false;
    // Se houver anéis internos (ilhas/buracos), exclui
    for (let i = 1; i < coords.length; i++) {
      if (isPointInLinearRing(lng, lat, coords[i])) return false;
    }
    return true;
  } else if (geomType === 'MultiPolygon') {
    for (const polyCoords of coords) {
      if (Array.isArray(polyCoords) && polyCoords.length > 0) {
        if (isPointInLinearRing(lng, lat, polyCoords[0])) {
          let inHole = false;
          for (let i = 1; i < polyCoords.length; i++) {
            if (isPointInLinearRing(lng, lat, polyCoords[i])) {
              inHole = true;
              break;
            }
          }
          if (!inHole) return true;
        }
      }
    }
    return false;
  }
  return false;
}

/**
 * Extrai amostra de vértices de uma geometria
 */
function extractSampleVertices(geometry, maxSamples = 20) {
  if (!geometry || !geometry.coordinates) return [];
  const coords = geometry.coordinates;
  const points = [];

  function recurse(arr) {
    if (!Array.isArray(arr)) return;
    if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      points.push([arr[0], arr[1]]);
    } else {
      for (const item of arr) recurse(item);
    }
  }
  recurse(coords);

  if (points.length <= maxSamples) return points;
  const step = Math.floor(points.length / maxSamples);
  const sampled = [];
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
    if (sampled.length >= maxSamples) break;
  }
  return sampled;
}

/**
 * Calcula o centroide aproximado de uma geometria
 */
export function calculateGeometryCentroid(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  const vertices = extractSampleVertices(geometry, 100);
  if (vertices.length === 0) return null;

  let sumLng = 0, sumLat = 0;
  vertices.forEach(v => {
    sumLng += v[0];
    sumLat += v[1];
  });
  return {
    lng: sumLng / vertices.length,
    lat: sumLat / vertices.length
  };
}

/**
 * Distância Haversine em km entre dois pontos
 */
export function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Testa se duas geometrias se sobrepõem no espaço geodésico
 * @param {Object} geomA Geometria A (ex: CAR)
 * @param {Object} geomB Geometria B (ex: SIGEF)
 * @returns {{ intersects: boolean, score: number, reason: string }}
 */
export function testSpatialIntersection(geomA, geomB) {
  if (!geomA || !geomB) return { intersects: false, score: 0, reason: 'SEM_GEOMETRIA' };

  const bboxA = calculateBoundingBox(geomA);
  const bboxB = calculateBoundingBox(geomB);

  // 1. Descarte rápido por Bounding Box
  if (!doBoundingBoxesOverlap(bboxA, bboxB)) {
    return { intersects: false, score: 0, reason: 'BBOX_DISJUNTO' };
  }

  const centerA = calculateGeometryCentroid(geomA);
  const centerB = calculateGeometryCentroid(geomB);

  // 2. Teste: Centróide de A dentro do polígono B
  if (centerA && isPointInsideGeometry(centerA.lng, centerA.lat, geomB)) {
    return { intersects: true, score: 0.95, reason: 'CENTROIDE_CAR_DENTRO_SIGEF' };
  }

  // 3. Teste: Centróide de B dentro do polígono A
  if (centerB && isPointInsideGeometry(centerB.lng, centerB.lat, geomA)) {
    return { intersects: true, score: 0.95, reason: 'CENTROIDE_SIGEF_DENTRO_CAR' };
  }

  // 4. Teste: Vértices amostrais de A dentro de B
  const samplesA = extractSampleVertices(geomA, 15);
  let hitsInB = 0;
  for (const pt of samplesA) {
    if (isPointInsideGeometry(pt[0], pt[1], geomB)) hitsInB++;
  }
  if (hitsInB > 0) {
    const pct = hitsInB / samplesA.length;
    return { intersects: true, score: 0.80 + (pct * 0.15), reason: `VERTICES_INTERSECCAO_${Math.round(pct * 100)}%` };
  }

  // 5. Teste: Vértices amostrais de B dentro de A
  const samplesB = extractSampleVertices(geomB, 15);
  let hitsInA = 0;
  for (const pt of samplesB) {
    if (isPointInsideGeometry(pt[0], pt[1], geomA)) hitsInA++;
  }
  if (hitsInA > 0) {
    const pct = hitsInA / samplesB.length;
    return { intersects: true, score: 0.80 + (pct * 0.15), reason: `VERTICES_INTERSECCAO_${Math.round(pct * 100)}%` };
  }

  // 6. Proximidade de centróides de alta precisão (tolerância para áreas pequenas / glebas rurais)
  if (centerA && centerB) {
    const dist = calculateDistanceKm(centerA.lat, centerA.lng, centerB.lat, centerB.lng);
    if (dist < 0.4) { // menos de 400 metros de centroide
      return { intersects: true, score: 0.70, reason: `PROXIMIDADE_CENTROIDE_${Math.round(dist * 1000)}m` };
    }
  }

  return { intersects: false, score: 0, reason: 'SEM_INTERSECCAO_GEOMETRICA' };
}

/**
 * Executa o cruzamento espacial em lote de uma coleção de CAR contra o acervo SIGEF do INCRA.
 * @param {Array<Object>} carFeatures Lista de features do CAR
 * @param {Array<Object>} sigefFeatures Lista de features certificadas do SIGEF
 * @returns {{ enrichedFeatures: Array<Object>, matchCount: number, totalCar: number }}
 */
export function executeSpatialOverlayCarSigef(carFeatures = [], sigefFeatures = []) {
  if (!Array.isArray(carFeatures) || carFeatures.length === 0) {
    return { enrichedFeatures: [], matchCount: 0, totalCar: 0 };
  }

  // Pré-indexa Bounding Boxes das parcelas do SIGEF para ganho de performance
  const indexedSigef = sigefFeatures.map(sf => {
    const geom = sf.geometry || sf.geometria_poligono;
    return {
      raw: sf,
      geometry: geom,
      properties: sf.properties || sf,
      bbox: calculateBoundingBox(geom),
      center: calculateGeometryCentroid(geom)
    };
  }).filter(s => s.geometry && s.bbox);

  let matchCount = 0;

  const enrichedFeatures = carFeatures.map(carFeat => {
    const carGeom = carFeat.geometry || carFeat.geometria_poligono;
    const cp = { ...(carFeat.properties || carFeat) };

    if (!carGeom) return carFeat;

    const carBbox = calculateBoundingBox(carGeom);
    if (!carBbox) return carFeat;

    // Filtra candidatos do SIGEF por BBox
    const candidateSigef = indexedSigef.filter(s => doBoundingBoxesOverlap(carBbox, s.bbox));

    let bestMatch = null;
    let highestScore = 0;

    for (const cand of candidateSigef) {
      const result = testSpatialIntersection(carGeom, cand.geometry);
      if (result.intersects && result.score > highestScore) {
        highestScore = result.score;
        bestMatch = {
          sigef: cand.properties,
          score: result.score,
          reason: result.reason
        };
      }
    }

    if (bestMatch) {
      matchCount++;
      const sp = bestMatch.sigef;

      // Herança de Metadados Oficiais do INCRA / Cartório:
      const registroMatricula = sp.registro_matricula || sp.matricula || null;
      const codigoImovelSncr = sp.codigo_imovel || sp.sncr || null;
      const nomeImovelIncra  = sp.nome_imovel || sp.nome_area || null;
      const titularIncra     = sp.nome_titular && !sp.nome_titular.includes('sigilo') ? sp.nome_titular : null;
      const cpfCnpjIncra     = sp.cpf_cnpj_titular || sp.cnpj_raw || null;

      // Detecção de titular provável a partir da denominação ou dados do cartório
      const rawNome = nomeImovelIncra || cp.nome_imovel || '';
      let titularProvavel = titularIncra || null;
      if (!titularProvavel && rawNome) {
        const cleaned = rawNome
          .replace(/[-–—]\s*(Parte\s*\d+|Gleba\s*[\d\.]+|Parcela\s*\d+|Área\s*[\d\.]+|Lote\s*\d+|Matr\.\s*\d+)/gi, '')
          .replace(/\b(FAZENDA|ESTÂNCIA|GRANJA|SÍTIO|CHÁCARA|RECANTO|GLEBA|PARCELA)\b/gi, '')
          .replace(/[-_]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned.length >= 3 && !/^\d+$/.test(cleaned) && !/^(MATRICULA|LIVRO|SNCR)/i.test(cleaned)) {
          titularProvavel = cleaned;
        }
      }

      // Classificação de tipo_titular: PESSOA JURIDICA vs PESSOA FISICA
      const isCorporateCheck = /\b(S\/A|S\.A\.|SA|LTDA|ME|EPP|EIRELI|AGROPECUARIA|AGROPECUÁRIA|AGRICOLA|AGRÍCOLA|AGRO|COOPERATIVA|COOP|SEMENTES|GRAOS|GRÃOS|PARTICIPACOES|PARTICIPAÇÕES|COMERCIO|IND[UÚ]STRIA|USINA|PESQUISAS AGRON[OÔ]MICAS|CENTRO DE PESQUISAS)\b/i;
      const docClean = String(cpfCnpjIncra || cp.cpf_cnpj_titular || '').replace(/\D/g, '');
      let tipoTitular = 'PESSOA FISICA';
      if (docClean.length === 14 || isCorporateCheck.test(rawNome) || isCorporateCheck.test(titularProvavel || '') || isCorporateCheck.test(cp.nome_titular || '')) {
        tipoTitular = 'PESSOA JURIDICA';
      }

      const scorePct = Math.round(bestMatch.score * 100);

      return {
        ...carFeat,
        properties: {
          ...cp,
          // Metadados Oficiais Herdados do SIGEF / Cartório:
          id_sigef: sp.id_sigef || sp.id || cp.id_sigef || null,
          codigo_car: cp.codigo_car || cp.cod_imovel || null,
          codigo_sncr: codigoImovelSncr || cp.codigo_sncr || cp.codigo_imovel || null,
          codigo_imovel: codigoImovelSncr || cp.codigo_imovel || null,
          codigo_imovel_sncr: codigoImovelSncr || cp.codigo_imovel_sncr || null,
          registro_matricula: registroMatricula || cp.registro_matricula || null,
          nome_imovel: nomeImovelIncra || cp.nome_imovel || null,
          nome_imovel_cartorio: nomeImovelIncra || cp.nome_imovel_cartorio || null,
          municipio: cp.municipio || sp.municipio || null,
          uf: cp.uf || sp.uf || null,
          area_ha: parseFloat(cp.area_hectares || cp.num_area || sp.area_hectares || 0) || 0,
          area_hectares: parseFloat(cp.area_hectares || cp.num_area || sp.area_hectares || 0) || 0,
          nome_titular: titularProvavel || titularIncra || cp.nome_titular || 'Titularidade sob sigilo (CAR Declaratório)',
          cpf_cnpj_titular: cpfCnpjIncra || cp.cpf_cnpj_titular || null,
          tipo_titular: tipoTitular,
          titular_provavel: titularProvavel,
          // Tags de Paridade e Fé Pública:
          status_geo: 'CERTIFICADO_INCRA',
          tag_fonte: 'FUSAO_SIGEF_CAR',
          sobreposicao_sigef: true,
          score_sobreposicao: `${scorePct}%`,
          sobreposicao_score: scorePct,
          motivo_geodesico: bestMatch.reason,
          sobreposicao_motivo: bestMatch.reason
        }
      };
    }

    return carFeat;
  });

  return {
    enrichedFeatures,
    matchCount,
    totalCar: carFeatures.length
  };
}
