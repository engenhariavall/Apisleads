/**
 * FRENTE 4: Geolocalização Avançada baseada em Mapas (GIS)
 * Módulo: Motor Geoespacial, Filtro por Raios, Polígonos e Pólos Econômicos
 */

export const CITY_COORDINATES = {
  // Mato Grosso & Centro-Oeste
  'CUIABA/MT': { lat: -15.6014, lng: -56.0979 },
  'RONDONOPOLIS/MT': { lat: -16.4673, lng: -54.6368 },
  'SINOP/MT': { lat: -11.8608, lng: -55.5097 },
  'SORRISO/MT': { lat: -12.5425, lng: -55.7114 },
  'LUCAS DO RIO VERDE/MT': { lat: -13.0569, lng: -55.9122 },
  'NOVA MUTUM/MT': { lat: -13.8294, lng: -56.0825 },
  'CAMPO NOVO DO PARECIS/MT': { lat: -13.6744, lng: -57.8897 },
  'PRIMAVERA DO LESTE/MT': { lat: -15.5583, lng: -54.2961 },

  // Goiás
  'GOIANIA/GO': { lat: -16.6869, lng: -49.2648 },
  'ANAPOLIS/GO': { lat: -16.3267, lng: -48.9533 },
  'RIO VERDE/GO': { lat: -17.7915, lng: -50.9192 },
  'JATAI/GO': { lat: -17.8814, lng: -51.7144 },
  'ITUMBIARA/GO': { lat: -18.4189, lng: -49.2158 },
  'CRISTALINA/GO': { lat: -16.7686, lng: -47.6136 },

  // Mato Grosso do Sul
  'CAMPO GRANDE/MS': { lat: -20.4697, lng: -54.6201 },
  'DOURADOS/MS': { lat: -22.2231, lng: -54.8122 },
  'MARACAJU/MS': { lat: -21.6144, lng: -55.1683 },
  'SAO GABRIEL DO OESTE/MS': { lat: -19.3922, lng: -54.5683 },
  'PONTA PORA/MS': { lat: -22.5361, lng: -55.7256 },
  'TRES LAGOAS/MS': { lat: -20.7844, lng: -51.7008 },

  // Paraná
  'CURITIBA/PR': { lat: -25.4284, lng: -49.2733 },
  'LONDRINA/PR': { lat: -23.3103, lng: -51.1628 },
  'MARINGA/PR': { lat: -23.4209, lng: -51.9331 },
  'CASCAVEL/PR': { lat: -24.9578, lng: -53.4595 },
  'PONTA GROSSA/PR': { lat: -25.0994, lng: -50.1583 },
  'TOLEDO/PR': { lat: -24.7139, lng: -53.7431 },
  'GUAIRA/PR': { lat: -24.0811, lng: -54.2569 },
  'MANGUEIRINHA/PR': { lat: -25.9408, lng: -52.1764 },
  'CASTRO/PR': { lat: -24.7911, lng: -50.0119 },

  // São Paulo
  'SAO PAULO/SP': { lat: -23.5505, lng: -46.6333 },
  'CAMPINAS/SP': { lat: -22.9099, lng: -47.0626 },
  'RIBEIRAO PRETO/SP': { lat: -21.1767, lng: -47.8108 },
  'PIRACICABA/SP': { lat: -22.7253, lng: -47.6492 },
  'ARACATUBA/SP': { lat: -21.2089, lng: -50.4403 },
  'SANTOS/SP': { lat: -23.9608, lng: -46.3336 },
  'SOROCABA/SP': { lat: -23.5015, lng: -47.4526 },
  'SAO JOSE DOS CAMPOS/SP': { lat: -23.1896, lng: -45.8841 },
  'FRANCA/SP': { lat: -20.5386, lng: -47.4008 },
  'BARRETOS/SP': { lat: -20.5572, lng: -48.5678 },

  // Minas Gerais
  'BELO HORIZONTE/MG': { lat: -19.9167, lng: -43.9345 },
  'UBERLANDIA/MG': { lat: -18.9186, lng: -48.2772 },
  'UBERABA/MG': { lat: -19.7483, lng: -47.9319 },
  'PATOS DE MINAS/MG': { lat: -18.5789, lng: -46.5181 },
  'POUSO ALEGRE/MG': { lat: -22.2300, lng: -45.9367 },
  'VARGINHA/MG': { lat: -21.5517, lng: -45.4300 },
  'JUIZ DE FORA/MG': { lat: -21.7587, lng: -43.3496 },

  // Rio Grande do Sul
  'PORTO ALEGRE/RS': { lat: -30.0346, lng: -51.2177 },
  'CAXIAS DO SUL/RS': { lat: -29.1681, lng: -51.1794 },
  'PASSO FUNDO/RS': { lat: -28.2628, lng: -52.4067 },
  'PELOTAS/RS': { lat: -31.7654, lng: -52.3376 },
  'SANTA VITORIA DO PALMAR/RS': { lat: -33.5189, lng: -53.3681 },
  'CRUZ ALTA/RS': { lat: -28.6389, lng: -53.6064 },
  'IJUI/RS': { lat: -28.3878, lng: -53.9147 },
  'SANTA MARIA/RS': { lat: -29.6842, lng: -53.8069 },
  'SANTO ANGELO/RS': { lat: -28.2992, lng: -54.2631 },
  'ERECHIM/RS': { lat: -27.6342, lng: -52.2739 },
  'CARAZINHO/RS': { lat: -28.2839, lng: -52.7858 },
  'SAO BORJA/RS': { lat: -28.6606, lng: -56.0044 },
  'VACARIA/RS': { lat: -28.5122, lng: -50.9339 },

  // Bahia (MATOPIBA e Litoral)
  'SALVADOR/BA': { lat: -12.9714, lng: -38.5014 },
  'FEIRA DE SANTANA/BA': { lat: -12.2667, lng: -38.9667 },
  'BARREIRAS/BA': { lat: -12.1528, lng: -44.9961 },
  'LUIS EDUARDO MAGALHAES/BA': { lat: -12.0969, lng: -45.7958 },
  'VITORIA DA CONQUISTA/BA': { lat: -14.8661, lng: -40.8394 },

  // Santa Catarina
  'FLORIANOPOLIS/SC': { lat: -27.5954, lng: -48.5480 },
  'JOINVILLE/SC': { lat: -26.3045, lng: -48.8487 },
  'BLUMENAU/SC': { lat: -26.9194, lng: -49.0661 },
  'CHAPECO/SC': { lat: -27.1004, lng: -52.6152 },
  'CRICIUMA/SC': { lat: -28.6775, lng: -49.3697 }
};

export const UF_CENTROIDS = {
  AC: { lat: -9.97499, lng: -67.8243 },
  AL: { lat: -9.57131, lng: -36.7820 },
  AP: { lat: 0.034934, lng: -51.0694 },
  AM: { lat: -3.11703, lng: -60.0258 },
  BA: { lat: -12.9714, lng: -38.5014 },
  CE: { lat: -3.73186, lng: -38.5267 },
  DF: { lat: -15.7975, lng: -47.8919 },
  ES: { lat: -20.3155, lng: -40.3128 },
  GO: { lat: -16.6869, lng: -49.2648 },
  MA: { lat: -2.53874, lng: -44.2825 },
  MT: { lat: -15.6014, lng: -56.0979 },
  MS: { lat: -20.4697, lng: -54.6201 },
  MG: { lat: -19.9167, lng: -43.9345 },
  PA: { lat: -1.45540, lng: -48.4902 },
  PB: { lat: -7.11950, lng: -34.8450 },
  PR: { lat: -25.4284, lng: -49.2733 },
  PE: { lat: -8.05784, lng: -34.8829 },
  PI: { lat: -5.09194, lng: -42.8034 },
  RJ: { lat: -22.9068, lng: -43.1729 },
  RN: { lat: -5.79448, lng: -35.2110 },
  RS: { lat: -30.0346, lng: -51.2177 },
  RO: { lat: -8.76116, lng: -63.9004 },
  RR: { lat: 2.82384, lng: -60.6753 },
  SC: { lat: -27.5954, lng: -48.5480 },
  SP: { lat: -23.5505, lng: -46.6333 },
  SE: { lat: -10.9472, lng: -37.0731 },
  TO: { lat: -10.2491, lng: -48.3243 }
};

export const ECONOMIC_CLUSTERS = [
  {
    id: 'POLO_AGRO_MT',
    name: 'Pólo Agro BR-163 (Mato Grosso)',
    description: 'Eixo líder nacional de produção de soja, milho e algodão (Cuiabá, Sorriso, Sinop, Rondonópolis)',
    center: { lat: -13.8294, lng: -56.0825, city: 'Nova Mutum / Sorriso', uf: 'MT' },
    default_radius_km: 300,
    tags: ['AGRO', 'COMMODITIES', 'GRAOS', 'MAQUINARIO']
  },
  {
    id: 'POLO_AGRO_PR',
    name: 'Pólo Agro & Cooperativas do Paraná',
    description: 'Norte e Campos Gerais do PR (Londrina, Maringá, Ponta Grossa, Cascavel)',
    center: { lat: -24.7139, lng: -51.5000, city: 'Norte/Centro PR', uf: 'PR' },
    default_radius_km: 200,
    tags: ['AGRO', 'COOPERATIVAS', 'AVICULTURA', 'INDUSTRIA']
  },
  {
    id: 'POLO_AGRO_GO',
    name: 'Sudoeste Goiano (Rio Verde & Jataí)',
    description: 'Cinturão de alta produtividade agrícola e agroindústria de grãos e carnes',
    center: { lat: -17.7915, lng: -50.9192, city: 'Rio Verde', uf: 'GO' },
    default_radius_km: 180,
    tags: ['AGRO', 'AGROINDUSTRIA', 'GRAOS']
  },
  {
    id: 'POLO_MATOPIBA_BA',
    name: 'Fronteira Agrícola MATOPIBA (Oeste da Bahia)',
    description: 'Cinturão de expansão agrícola de grande escala (Luís Eduardo Magalhães & Barreiras)',
    center: { lat: -12.0969, lng: -45.7958, city: 'Luís Eduardo Magalhães', uf: 'BA' },
    default_radius_km: 250,
    tags: ['AGRO', 'MATOPIBA', 'MEGA_FAZENDAS']
  },
  {
    id: 'POLO_SUCRO_SP',
    name: 'Cinturão Sucroalcooleiro & Agritech SP',
    description: 'Região de Ribeirão Preto, Sertãozinho e Piracicaba',
    center: { lat: -21.1767, lng: -47.8108, city: 'Ribeirão Preto', uf: 'SP' },
    default_radius_km: 180,
    tags: ['SUCROALCOOLEIRO', 'AGRITECH', 'MAQUINAS']
  },
  {
    id: 'POLO_TECH_IND_SP',
    name: 'Eixo Tech & Industrial Campinas - SP',
    description: 'Maior polo de tecnologia, inovação B2B e indústrias farmacêuticas da América Latina',
    center: { lat: -22.9099, lng: -47.0626, city: 'Campinas / São Paulo', uf: 'SP' },
    default_radius_km: 120,
    tags: ['TECH', 'INDUSTRIA', 'SAUDE', 'CORPORATIVO']
  },
  {
    id: 'POLO_TRIANGULO_MG',
    name: 'Triângulo Mineiro (Uberlândia & Uberaba)',
    description: 'Eixo de distribuição logística, agronegócio e indústrias de fertilizantes',
    center: { lat: -18.9186, lng: -48.2772, city: 'Uberlândia', uf: 'MG' },
    default_radius_km: 160,
    tags: ['LOGISTICA', 'AGRO', 'FERTILIZANTES']
  }
];

export class GeoSpatialEngine {
  /**
   * Obtém coordenadas precisas para um lead baseado em seu município e UF
   */
  static resolveCoordinates(lead) {
    if (lead.latitude && lead.longitude && !isNaN(lead.latitude) && !isNaN(lead.longitude)) {
      return { lat: parseFloat(lead.latitude), lng: parseFloat(lead.longitude), precision: 'DATABASE' };
    }

    const mun = (lead.municipio || '').toUpperCase().trim();
    const uf = (lead.uf || '').toUpperCase().trim();
    const key = `${mun}/${uf}`;

    if (CITY_COORDINATES[key]) {
      return { ...CITY_COORDINATES[key], precision: 'CITY' };
    }

    if (UF_CENTROIDS[uf]) {
      return { ...UF_CENTROIDS[uf], precision: 'STATE_CENTROID' };
    }

    return { lat: null, lng: null, precision: 'UNKNOWN' };
  }

  /**
   * Fórmula de Haversine para cálculo de distância esférica em km
   */
  static calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio médio da Terra em km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Filtra leads dentro de um raio circular em km a partir de uma coordenada central
   */
  static filterByRadius(leads, centerLat, centerLng, radiusKm) {
    if (!Array.isArray(leads) || leads.length === 0) return [];
    const radius = parseFloat(radiusKm) || 100;
    const cLat = parseFloat(centerLat);
    const cLng = parseFloat(centerLng);

    if (isNaN(cLat) || isNaN(cLng)) return leads;

    return leads
      .map(lead => {
        const coords = this.resolveCoordinates(lead);
        if (coords.lat === null || coords.lng === null) return null;

        const distance = this.calculateDistanceKm(cLat, cLng, coords.lat, coords.lng);
        if (distance <= radius) {
          const distRounded = Math.round(distance * 10) / 10;
          return {
            ...lead,
            latitude: coords.lat,
            longitude: coords.lng,
            geo_distance_km: distRounded,
            distance_km: distRounded
          };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.geo_distance_km - b.geo_distance_km);
  }

  /**
   * Algoritmo Ray-Casting (Point-in-Polygon) para verificar se ponto está dentro de polígono
   * polygon pode ser [ [lat, lng], ... ] ou [ {lat, lng}, ... ] ou [ {latitude, longitude}, ... ]
   */
  static isPointInPolygon(pointLat, pointLng, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;

    const pts = polygon.map(p => {
      if (Array.isArray(p)) return [parseFloat(p[0]), parseFloat(p[1])];
      const lat = p.lat !== undefined ? p.lat : p.latitude;
      const lng = p.lng !== undefined ? p.lng : p.longitude;
      return [parseFloat(lat), parseFloat(lng)];
    });

    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];

      const intersect = ((yi > pointLng) !== (yj > pointLng))
        && (pointLat < (xj - xi) * (pointLng - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Filtra leads contidos dentro de um polígono geográfico desenhado
   */
  static filterByPolygon(leads, polygon) {
    if (!Array.isArray(leads) || leads.length === 0) return [];
    if (!Array.isArray(polygon) || polygon.length < 3) return leads;

    return leads
      .map(lead => {
        const coords = this.resolveCoordinates(lead);
        if (coords.lat === null || coords.lng === null) return null;

        if (this.isPointInPolygon(coords.lat, coords.lng, polygon)) {
          return {
            ...lead,
            latitude: coords.lat,
            longitude: coords.lng,
            geo_inside_polygon: true
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  /**
   * Filtra leads dentro de uma Bounding Box retangular [minLat, minLng, maxLat, maxLng]
   */
  static filterByBoundingBox(leads, minLat, minLng, maxLat, maxLng) {
    if (!Array.isArray(leads)) return [];

    return leads
      .map(lead => {
        const coords = this.resolveCoordinates(lead);
        if (coords.lat === null || coords.lng === null) return null;

        if (
          coords.lat >= minLat && coords.lat <= maxLat &&
          coords.lng >= minLng && coords.lng <= maxLng
        ) {
          return {
            ...lead,
            latitude: coords.lat,
            longitude: coords.lng
          };
        }
        return null;
      })
      .filter(Boolean);
  }
}
