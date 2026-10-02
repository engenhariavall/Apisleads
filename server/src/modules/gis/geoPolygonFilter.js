/**
 * FRENTE 4: Geolocalização Avançada baseada em Mapas (GIS)
 * Módulo: Seleção por Polígonos e Raios Visuais
 * 
 * Permite filtrar leads por:
 * 1. Raio circular em quilômetros em torno de uma coordenada central (Fórmula de Haversine)
 * 2. Polígono delimitador (Bounding Box ou Point-in-Polygon via Ray Casting)
 */

export class GeoSpatialEngine {
  /**
   * Calcula a distância em km entre dois pontos geográficos (Fórmula de Haversine)
   */
  static calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
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
   * Filtra leads que estejam dentro de um raio (km) a partir de um centro (lat, lng)
   */
  static filterByRadius(leads, centerLat, centerLng, radiusKm) {
    if (!Array.isArray(leads)) return [];

    return leads
      .map(lead => {
        // Se o lead tiver latitude/longitude direta ou estimada por município/UF
        const leadLat = lead.latitude || this.estimateCoords(lead).lat;
        const leadLng = lead.longitude || this.estimateCoords(lead).lng;

        if (leadLat === null || leadLng === null) return null;

        const distance = this.calculateDistanceKm(centerLat, centerLng, leadLat, leadLng);
        if (distance <= radiusKm) {
          return {
            ...lead,
            geo_distance_km: Math.round(distance * 10) / 10
          };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.geo_distance_km - b.geo_distance_km);
  }

  /**
   * Algoritmo Ray-Casting para verificar se coordenada está dentro de um polígono
   * polygon = [ [lat, lng], [lat, lng], ... ]
   */
  static isPointInPolygon(pointLat, pointLng, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      const intersect = ((yi > pointLng) !== (yj > pointLng))
        && (pointLat < (xj - xi) * (pointLng - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Mapeamento de apoio com centróides das capitais brasileiras
   */
  static estimateCoords(lead) {
    const centroids = {
      SP: { lat: -23.5505, lng: -46.6333 },
      RJ: { lat: -22.9068, lng: -43.1729 },
      MG: { lat: -19.9167, lng: -43.9345 },
      PR: { lat: -25.4284, lng: -49.2733 },
      RS: { lat: -30.0346, lng: -51.2177 },
      SC: { lat: -27.5954, lng: -48.5480 },
      GO: { lat: -16.6869, lng: -49.2648 },
      MT: { lat: -15.6014, lng: -56.0979 },
      MS: { lat: -20.4697, lng: -54.6201 },
      BA: { lat: -12.9714, lng: -38.5014 }
    };
    return centroids[lead.uf] || { lat: null, lng: null };
  }
}
