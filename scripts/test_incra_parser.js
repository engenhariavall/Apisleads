export function parseIncraGml(xml, targetMun = '', targetUf = '') {
  const features = [];
  const parts = xml.split(/<gml:featureMember>/i);

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i].split(/<\/gml:featureMember>/i)[0];
    if (!block) continue;

    const getTag = (tag) => {
      const m = block.match(new RegExp(`<ms:${tag}>([\\s\\S]*?)<\\/ms:${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };

    const parcelaCodigo = getTag('parcela_codigo');
    const id = getTag('id');
    const codigoImovel = getTag('codigo_imovel');
    const nomeArea = getTag('nome_area');
    const registroMatricula = getTag('registro_matricula');
    const status = getTag('status') || 'CERTIFICADA';
    const codigoMunicipio = getTag('codigo_municipio');

    // Extrai especificamente as coordenadas do LinearRing (polígono da parcela), não da Bounding Box!
    const ringMatch = block.match(/<gml:LinearRing>[\s\S]*?<gml:coordinates>([\s\S]*?)<\/gml:coordinates>/i);
    if (!ringMatch) continue;

    const pairs = ringMatch[1].trim().split(/\s+/);
    const ring = [];
    for (const p of pairs) {
      const [lngStr, latStr] = p.split(',');
      const lng = parseFloat(lngStr);
      const lat = parseFloat(latStr);
      if (!isNaN(lng) && !isNaN(lat)) {
        ring.push([lng, lat]);
      }
    }

    if (ring.length < 3) continue;
    // Garante fechamento do polígono
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }

    // Calcula centróide
    let sumLat = 0;
    let sumLng = 0;
    for (let c = 0; c < ring.length - 1; c++) {
      sumLng += ring[c][0];
      sumLat += ring[c][1];
    }
    const centroideLat = sumLat / (ring.length - 1);
    const centroideLng = sumLng / (ring.length - 1);

    // Calcula área em hectares via Shoelace
    let areaHectares = 0;
    for (let r = 0; r < ring.length - 1; r++) {
      areaHectares += ring[r][0] * ring[r + 1][1] - ring[r + 1][0] * ring[r][1];
    }
    const latRad = (centroideLat * Math.PI) / 180;
    const mPerDegLat = 111132.954;
    const mPerDegLng = 111412.84 * Math.cos(latRad);
    const areaM2 = Math.abs(areaHectares / 2) * mPerDegLat * mPerDegLng;
    const calculatedHa = Math.round((areaM2 / 10000) * 100) / 100;

    features.push({
      id_sigef: parcelaCodigo || id,
      codigo_imovel: codigoImovel || '',
      nome_imovel: nomeArea || (codigoImovel ? `Gleba SNCR ${codigoImovel}` : 'Parcela Certificada SIGEF'),
      nome_titular: 'Titularidade sob sigilo (Cartório CRI / SNCR)',
      cpf_cnpj_titular: null,
      area_hectares: calculatedHa || 50.0,
      registro_matricula: registroMatricula ? `Matrícula ${registroMatricula} - CRI` : null,
      municipio: targetMun,
      uf: targetUf,
      status_geo: 'CERTIFICADO',
      tag_fonte: 'SIGEF',
      centroide_lat: centroideLat,
      centroide_lng: centroideLng,
      geometria_poligono: {
        type: 'Polygon',
        coordinates: [ring]
      }
    });
  }

  return features;
}


