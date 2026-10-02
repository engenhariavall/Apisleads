/**
 * server/src/controllers/geofencingExportController.js
 * 
 * FASES 44 E 45: MASTERPLAN MOTOR FUNDIÁRIO B2B - ETAPA 3
 * Exportador de Geofencing para Meta Ads (Custom Location Audiences) e Google Ads.
 * 
 * Rota: GET /api/fundiario/export/geofencing
 * Suporta filtros por:
 *  - intent (ex: HOT, WARM, COLD)
 *  - status_geo (ex: SEM_GEO, CERTIFICADO)
 *  - uf (ex: MT, GO, PR)
 *  - municipio (ex: SORRISO, RIO VERDE)
 *  - min_score (ex: 70)
 *  - format ('csv' ou 'json', padrão 'csv')
 */

import { listRuralProperties } from '../services/geoFundiarioService.js';
import { getTenantFromRequest } from '../middleware/authMiddleware.js';
import db from '../config/database.js';

export async function exportRuralGeofencing(req, res) {
  try {
    const params = req.method === 'GET' ? req.query : (req.body || {});
    const tenantId = getTenantFromRequest(req);

    const intent = (params.intent || '').toUpperCase();
    const statusGeo = (params.status_geo || '').toUpperCase();
    const uf = (params.uf || '').toUpperCase();
    const municipio = (params.municipio || '').toUpperCase();
    const minScore = parseFloat(params.min_score) || 0;
    const format = (params.format || 'csv').toLowerCase();

    // Busca até 2000 propriedades para exportação
    const result = await listRuralProperties({
      uf: uf || undefined,
      municipio: municipio || undefined,
      status_geo: statusGeo || undefined,
      intent_classification: intent || undefined,
      limit: 2000,
      page: 1
    }, tenantId);

    let items = result.data || [];

    // FASE 47: Injeção de Contatos Quentes Manuais (Warm-up Audiences) na exportação Geofencing
    try {
      const manualStmt = db.prepare(`
        SELECT * FROM leads 
        WHERE tenant_id = ? AND (origem = 'MANUAL' OR tag = 'ORIGEM: MANUAL')
        ORDER BY created_at DESC
      `);
      const manualLeads = manualStmt.all(tenantId);
      if (manualLeads && manualLeads.length > 0) {
        for (const ml of manualLeads) {
          const lat = parseFloat(ml.lat_operacional || ml.latitude || -12.5425);
          const lng = parseFloat(ml.lng_operacional || ml.longitude || -55.7114);
          items.push({
            id: ml.id,
            id_sigef: `MANUAL-${ml.id}`,
            nome_imovel: ml.razao_social || ml.nome_fantasia || 'Propriedade Manual',
            nome_titular: ml.contato_nome || ml.nome_fantasia || ml.razao_social || 'Decisor Manual',
            cpf_cnpj_titular: ml.cnpj || '',
            status_geo: 'CERTIFICADO',
            intent_classification: 'HOT',
            intent_score: 95,
            centroide_lat: lat,
            centroide_lng: lng,
            raio_abrangencia_km: 5.0,
            whatsapp_validado: ml.telefone_sanitized || ml.telefone || '',
            linkedin_url_real: '',
            email_validado: ml.email || '',
            osint_status: 'ENRICHED',
            municipio: ml.municipio || 'SORRISO',
            uf: ml.uf || 'MT',
            area_hectares: 1000
          });
        }
      }
    } catch (manualErr) {
      console.warn('Injeção manual no geofencing:', manualErr.message);
    }

    // Filtra por score mínimo se especificado
    if (minScore > 0) {
      items = items.filter(p => (p.intent_score || 0) >= minScore);
    }

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhuma propriedade rural encontrada com os critérios informados.'
      });
    }

    // Formata cada ponto com coordenadas e raio para Geofencing Ads
    const geofenceRecords = items.map((p, index) => {
      const lat = p.centroide_lat !== null && p.centroide_lat !== undefined ? Number(p.centroide_lat) : 0;
      const lng = p.centroide_lng !== null && p.centroide_lng !== undefined ? Number(p.centroide_lng) : 0;
      const radius = p.raio_abrangencia_km !== null && p.raio_abrangencia_km !== undefined ? Number(p.raio_abrangencia_km) : 5.0;

      const rawDoc = String(p.cpf_cnpj_titular || '').replace(/\D/g, '');

      return {
        ranking: index + 1,
        id_propriedade: p.id,
        id_sigef: p.id_sigef || '',
        nome_imovel: p.nome_imovel,
        nome_titular: p.nome_titular,
        cpf_cnpj_titular: p.cpf_cnpj_titular || '',
        // FASE 47 (ETAPA 2): Mapeamento limpo de CPF/CNPJ para Custom Audiences do Meta Ads
        madid_clean: rawDoc,
        meta_custom_audience_doc: rawDoc,
        status_geo: p.status_geo,
        intent_classification: p.intent_classification,
        intent_score: p.intent_score,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        raio_abrangencia_km: Number(radius.toFixed(2)),
        // Meta Ads Location Target String exigido: lat,lng:+radius_km
        meta_ads_target_string: `${lat.toFixed(6)},${lng.toFixed(6)}:+${radius.toFixed(1)}km`,
        google_ads_radius_target: `${lat.toFixed(6)},${lng.toFixed(6)} (${radius.toFixed(1)} km)`,
        whatsapp_validado: p.whatsapp_validado || '',
        linkedin_url_real: p.linkedin_url_real || '',
        email_validado: p.email_validado || '',
        osint_status: p.osint_status || 'PENDING',
        municipio: p.municipio,
        uf: p.uf,
        area_hectares: p.area_hectares || 0
      };
    });

    if (format === 'json') {
      return res.json({
        success: true,
        total_records: geofenceRecords.length,
        filters_applied: {
          intent: intent || 'TODOS',
          status_geo: statusGeo || 'TODOS',
          uf: uf || 'TODAS',
          municipio: municipio || 'TODOS',
          min_score: minScore
        },
        data: geofenceRecords
      });
    }

    // Exportação em CSV no formato padrão internacional para campanhas de Geofencing
    const headers = [
      'ranking',
      'id_propriedade',
      'id_sigef',
      'nome_imovel',
      'nome_titular',
      'cpf_cnpj_titular',
      'madid_clean',
      'meta_custom_audience_doc',
      'status_geo',
      'intent_classification',
      'intent_score',
      'latitude',
      'longitude',
      'raio_abrangencia_km',
      'meta_ads_target_string',
      'google_ads_radius_target',
      'whatsapp_validado',
      'linkedin_url_real',
      'email_validado',
      'osint_status',
      'municipio',
      'uf',
      'area_hectares'
    ];

    const escapeCsvField = (field) => {
      if (field === null || field === undefined) return '';
      const str = String(field).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.join(';')];
    for (const record of geofenceRecords) {
      const row = headers.map(header => escapeCsvField(record[header]));
      csvRows.push(row.join(';'));
    }

    // UTF-8 BOM para abrir perfeitamente no Excel sem corromper acentuação
    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const filename = `geofencing_rural_${intent || 'ALL'}_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);

  } catch (err) {
    console.error('❌ [GEOFENCING EXPORT ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: 'Falha ao gerar exportação de geofencing rural.',
      details: err.message
    });
  }
}
