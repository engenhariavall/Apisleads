/**
 * server/src/controllers/sparksController.js
 * 
 * VERSUS SPARKS: CONTROLLER RESTFUL
 * Controla endpoints de telemetria dos robôs, listagem de sinais,
 * disparo de varredura sob demanda e métricas executivas de máquinas/outorgas.
 */

import SparksEngineService from '../services/sparksEngineService.js';
import SparksAlertDispatcherService from '../services/sparksAlertDispatcherService.js';

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

/**
 * Retorna os sinais mais recentes para o polling em tempo real do frontend
 */
export async function getLatestSparksSignals(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const since = req.query.since || null;
    const limit = req.query.limit || 15;
    const signals = SparksEngineService.getLatestSignals({ since, limit }, tenantId);
    return res.status(200).json({
      success: true,
      data: signals,
      total: signals.length,
      server_time: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ [SPARKS_CONTROLLER] Erro ao obter sinais recentes:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Lista os gestores destinatários de alertas do WhatsApp (Super Admin)
 */
export async function getSparksAlertRecipients(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const recipients = SparksAlertDispatcherService.listRecipients(tenantId);
    return res.status(200).json({
      success: true,
      data: recipients,
      total: recipients.length
    });
  } catch (err) {
    console.error('❌ [SPARKS_CONTROLLER] Erro ao listar gestores de alertas:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Cadastra um novo gestor para receber alertas de WhatsApp (Super Admin)
 */
export async function addSparksAlertRecipient(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const { nome, telefone, tipos_alertas } = req.body || {};
    const result = SparksAlertDispatcherService.addRecipient({
      nome,
      telefone,
      tipos_alertas: tipos_alertas || 'ALL',
      tenantId
    });
    return res.status(201).json({
      success: true,
      data: result,
      message: 'Gestor cadastrado com sucesso para alertas do Radar Sparks!'
    });
  } catch (err) {
    console.error('❌ [SPARKS_CONTROLLER] Erro ao cadastrar gestor de alertas:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * Atualiza um gestor existente (Super Admin)
 */
export async function updateSparksAlertRecipient(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const id = req.params.id;
    const { nome, telefone, ativo, tipos_alertas } = req.body || {};
    const result = SparksAlertDispatcherService.updateRecipient(id, {
      nome,
      telefone,
      ativo,
      tipos_alertas
    }, tenantId);
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Gestor atualizado com sucesso!'
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao atualizar gestor ${req.params.id}:`, err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * Exclui um gestor destinatário (Super Admin)
 */
export async function deleteSparksAlertRecipient(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const id = req.params.id;
    const result = SparksAlertDispatcherService.deleteRecipient(id, tenantId);
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Gestor removido da lista de alertas com sucesso!'
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao excluir gestor ${req.params.id}:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Alterna status ativo/inativo de um gestor
 */
export async function toggleSparksAlertRecipient(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const id = req.params.id;
    const result = SparksAlertDispatcherService.toggleRecipientStatus(id, tenantId);
    return res.status(200).json({
      success: true,
      data: result,
      message: result.ativo ? 'Alertas ativados para o gestor.' : 'Alertas silenciados para o gestor.'
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao alternar status do gestor ${req.params.id}:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Envia um disparo de teste para o WhatsApp do gestor
 */
export async function testSparksAlertRecipient(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const id = req.params.id;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'apisleads.vercel.app';
    const baseUrl = `${protocol}://${host}`;

    const result = SparksAlertDispatcherService.sendTestMessage(id, tenantId, baseUrl);
    return res.status(200).json({
      success: true,
      data: result,
      message: 'Disparo de teste gerado com sucesso para o gestor!'
    });
  } catch (err) {
    console.error(`❌ [SPARKS_CONTROLLER] Erro ao enviar teste para gestor ${req.params.id}:`, err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * Simula a chegada de um novo sinal (para teste ponta a ponta de tela e som)
 */
export async function simulateNewSparkSignal(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'apisleads.vercel.app';
    const baseUrl = `${protocol}://${host}`;

    const type = req.body?.spark_type || 'CREDITO_BNDES';
    const simSignal = {
      id: `sig-sim-${Date.now()}`,
      monitor_id: 'spark-credito-rural',
      spark_type: type,
      titulo: req.body?.titulo || 'Crédito BNDES Finame Agro Aprovado: R$ 3.850.000,00',
      resumo: req.body?.resumo || 'Liberação de linha Moderfrota/Finame para aquisição de Trator de Alta Potência 350cv e Plantadeira.',
      conteudo_bruto: 'Operação simulada de demonstração em tempo real.',
      orgao_emissor: 'BNDES / BACEN',
      valor_monetario: req.body?.valor_monetario || 3850000.0,
      volume_m3h: 0,
      documento_identificado: '09.821.441/0001-20',
      titular_identificado: req.body?.titular || 'AGROPECUARIA NOVA ESPERANCA LTDA',
      nome_imovel: 'Fazenda Santa Tereza',
      municipio: 'Sorriso',
      uf: 'MT',
      trigger_texto: 'Crédito BNDES Finame Liberado (R$ 3,85M em Maquinário Pesado)',
      tenant_id: tenantId,
      created_at: new Date().toISOString()
    };

    // Insere no banco
    const db = (await import('../config/database.js')).default;
    db.prepare(`
      INSERT INTO sparks_signals (
        id, monitor_id, spark_type, titulo, resumo, conteudo_bruto,
        orgao_emissor, data_publicacao, valor_monetario, volume_m3h,
        documento_identificado, titular_identificado, nome_imovel,
        municipio, uf, lat, lng, status_processamento, score_gerado,
        trigger_texto, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, -12.5425, -55.7211, 'ENRIQUECIDO', 40, ?, ?)
    `).run(
      simSignal.id, simSignal.monitor_id, simSignal.spark_type, simSignal.titulo, simSignal.resumo,
      simSignal.conteudo_bruto, simSignal.orgao_emissor, simSignal.valor_monetario, simSignal.volume_m3h,
      simSignal.documento_identificado, simSignal.titular_identificado, simSignal.nome_imovel,
      simSignal.municipio, simSignal.uf, simSignal.trigger_texto, tenantId
    );

    // Notifica gestores
    const alertRes = await SparksAlertDispatcherService.notifySignal(simSignal, tenantId, baseUrl);

    return res.status(201).json({
      success: true,
      data: simSignal,
      alert_dispatch: alertRes,
      message: 'Sinal de teste gerado com sucesso e despachado aos gestores!'
    });
  } catch (err) {
    console.error('❌ [SPARKS_CONTROLLER] Erro ao simular sinal:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export default {
  getSparksMonitors,
  getSparksSignals,
  getLatestSparksSignals,
  getSparksStats,
  triggerSparkMonitor,
  getSignalDossier,
  boostSignalLead,
  dispatchSignalToCrm,
  dispatchSignalBatchToCrm,
  exportSignalsB2b,
  enrichSignalBureau,
  exportSignalsMetaAds,
  getSparksAlertRecipients,
  addSparksAlertRecipient,
  updateSparksAlertRecipient,
  deleteSparksAlertRecipient,
  toggleSparksAlertRecipient,
  testSparksAlertRecipient,
  simulateNewSparkSignal
};
