/**
 * server/src/controllers/sparksController.js
 * 
 * VERSUS SPARKS: CONTROLLER RESTFUL
 * Controla endpoints de telemetria dos robôs, listagem de sinais,
 * disparo de varredura sob demanda e métricas executivas de máquinas/outorgas.
 */

import SparksEngineService from '../services/sparksEngineService.js';

export async function getSparksMonitors(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const monitors = SparksEngineService.listMonitors(tenantId);
    return res.status(200).json({
      success: true,
      data: monitors,
      total: monitors.length
    });
  } catch (err) {
    console.error('❌ [SPARKS_CONTROLLER] Erro ao listar monitores:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getSparksSignals(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const filters = {
      spark_type: req.query.spark_type,
      uf: req.query.uf,
      municipio: req.query.municipio,
      limit: req.query.limit,
      offset: req.query.offset
    };
    const signals = SparksEngineService.listSignals(filters, tenantId);
    return res.status(200).json({
      success: true,
      data: signals,
      total: signals.length
    });
  } catch (err) {
    console.error('❌ [SPARKS_CONTROLLER] Erro ao listar sinais:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getSparksStats(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const stats = SparksEngineService.getAggregatedStats(tenantId);
    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error('❌ [SPARKS_CONTROLLER] Erro ao obter estatísticas:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function triggerSparkMonitor(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const monitorId = req.params.id;
    const result = await SparksEngineService.triggerMonitor(monitorId, tenantId);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao disparar monitor ${req.params.id}:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getSignalDossier(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const signalId = req.params.id;
    const dossier = await SparksEngineService.getSignalDossier(signalId, tenantId);
    return res.status(200).json({
      success: true,
      data: dossier
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao obter dossiê do sinal ${req.params.id}:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function boostSignalLead(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const signalId = req.params.id;
    const result = await SparksEngineService.boostSignalLeadScore(signalId, tenantId);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao bonificar score do lead do sinal ${req.params.id}:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function dispatchSignalToCrm(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const signalId = req.params.id;
    const customOptions = req.body || {};
    const result = await SparksEngineService.dispatchSignalToCrm(signalId, tenantId, customOptions);
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Sinal de compra despachado para o CRM com sucesso!'
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao despachar sinal para CRM:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function dispatchSignalBatchToCrm(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const { signalIds = [], customOptions = {} } = req.body || {};
    const result = await SparksEngineService.dispatchSignalBatchToCrm(signalIds, tenantId, customOptions);
    return res.status(200).json({
      success: true,
      data: result,
      message: `${result.successCount} de ${result.total} sinais despachados para o CRM com sucesso!`
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao despachar lote de sinais para CRM:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function exportSignalsB2b(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    let signalIds = [];
    if (req.query.ids) {
      signalIds = String(req.query.ids).split(',').filter(Boolean);
    } else if (req.body?.signalIds) {
      signalIds = req.body.signalIds;
    }
    const data = await SparksEngineService.exportSignalsB2b(signalIds, tenantId);
    return res.status(200).json({
      success: true,
      data,
      total: data.length
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao exportar planilha B2B dos sinais:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function enrichSignalBureau(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const signalId = req.params.id;
    const result = await SparksEngineService.enrichSignalViaBureau(signalId, tenantId);
    return res.status(200).json(result);
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao consultar Bureau para sinal ${req.params.id}:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function exportSignalsMetaAds(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    let signalIds = [];
    if (req.query.ids) {
      signalIds = String(req.query.ids).split(',').filter(Boolean);
    } else if (req.body?.signalIds) {
      signalIds = req.body.signalIds;
    }
    const hashedRows = await SparksEngineService.exportSignalsMetaAds(signalIds, tenantId);

    if (req.query.format === 'json') {
      return res.status(200).json({ success: true, data: hashedRows, total: hashedRows.length });
    }

    // Gera arquivo CSV estritamente no padrão Custom Audiences do Meta Ads
    const headers = ['email', 'phone', 'fn', 'ln', 'ct', 'st', 'zip', 'country', 'cnpj', 'razao_social'];
    let csvContent = headers.join(',') + '\r\n';

    hashedRows.forEach(row => {
      const escape = val => `"${String(val || '').replace(/"/g, '""')}"`;
      csvContent += [
        escape(row.email),
        escape(row.phone),
        escape(row.fn),
        escape(row.ln),
        escape(row.ct),
        escape(row.st),
        escape(row.zip),
        escape(row.country),
        escape(row.cnpj),
        escape(row.razao_social)
      ].join(',') + '\r\n';
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="meta-ads-audiences-sparks-sha256-${timestamp}.csv"`);
    return res.status(200).send('\uFEFF' + csvContent);
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao exportar planilha Meta Ads SHA-256:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export default {
  getSparksMonitors,
  getSparksSignals,
  getSparksStats,
  triggerSparkMonitor,
  getSignalDossier,
  boostSignalLead,
  dispatchSignalToCrm,
  dispatchSignalBatchToCrm,
  exportSignalsB2b,
  enrichSignalBureau,
  exportSignalsMetaAds
};
