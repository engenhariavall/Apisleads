/**
 * server/src/controllers/cognitiveController.js
 * 
 * FASE 66.A — CONTROLLER RESTful PARA COGNIÇÃO E FILA ASSÍNCRONA
 */

import cognitiveQueueService from '../services/cognitiveQueueService.js';
import db from '../config/database.js';
import { crmService } from '../services/crmService.js';
import BanditScoringService from '../services/banditScoringService.js';
import SparksEngineService from '../services/sparksEngineService.js';

export async function requestVisualAudit(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const {
      entity_type = 'LEAD',
      entity_id,
      latitude,
      longitude,
      image_url,
      cnae,
      company_name,
      force_refresh = false
    } = req.body || {};

    if (!entity_id || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: 'entity_id, latitude e longitude são obrigatórios.'
      });
    }

    const result = await cognitiveQueueService.requestAudit({
      entity_type,
      entity_id,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      image_url,
      cnae,
      company_name,
      tenant_id: tenantId,
      force_refresh: Boolean(force_refresh)
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_CONTROLLER] Erro ao solicitar auditoria de visão:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function getVisualAudit(req, res) {
  try {
    const { entity_type, entity_id, coords_hash, latitude, longitude } = req.query || {};

    let hash = coords_hash;
    if (!hash && latitude !== undefined && longitude !== undefined) {
      hash = cognitiveQueueService.generateCoordsHash(parseFloat(latitude), parseFloat(longitude));
    }

    if (!hash && (!entity_type || !entity_id)) {
      return res.status(400).json({
        success: false,
        error: 'coords_hash (ou latitude/longitude) ou o par (entity_type, entity_id) são obrigatórios.'
      });
    }

    const audit = cognitiveQueueService.getCachedAudit(hash, entity_type, entity_id);

    if (!audit) {
      return res.status(404).json({
        success: false,
        message: 'Nenhuma auditoria em cache encontrada para os parâmetros informados.'
      });
    }

    return res.status(200).json({
      success: true,
      data: audit
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_CONTROLLER] Erro ao buscar auditoria:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function getCognitiveTaskStatus(req, res) {
  try {
    const { id } = req.params;
    const task = db.prepare(`SELECT * FROM cognitive_async_queue WHERE id = ?`).get(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Tarefa não encontrada.'
      });
    }

    let parsedResult = null;
    if (task.result_json) {
      try {
        parsedResult = JSON.parse(task.result_json);
      } catch (_) {}
    }

    return res.status(200).json({
      success: true,
      data: {
        ...task,
        result: parsedResult
      }
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_CONTROLLER] Erro ao buscar status da tarefa:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function recordRlReward(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const { policy_type, state_key, action, reward } = req.body || {};

    if (!state_key || !action || reward === undefined) {
      return res.status(400).json({
        success: false,
        error: 'state_key, action e reward numérico são obrigatórios.'
      });
    }

    const outcome = cognitiveQueueService.recordReward({
      policy_type: policy_type || 'ROUTE_OPTIMIZATION',
      state_key,
      action,
      reward: parseFloat(reward),
      tenant_id: tenantId
    });

    return res.status(200).json({
      success: true,
      data: outcome
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_CONTROLLER] Erro ao registrar recompensa de RL:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function getCognitiveTelemetry(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const telemetry = cognitiveQueueService.getTelemetry(tenantId);
    return res.status(200).json({
      success: true,
      data: telemetry
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_CONTROLLER] Erro ao obter telemetria cognitiva:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function requestSatelliteAudit(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const {
      entity_type = 'RURAL_PROPERTY',
      entity_id,
      property_id,
      id,
      latitude,
      lat,
      longitude,
      lng,
      area_ha,
      area_hectares,
      crop_type,
      force_refresh = false
    } = req.body || {};

    const resolvedEntityId = entity_id || property_id || id;
    let resolvedLat = latitude !== undefined ? parseFloat(latitude) : (lat !== undefined ? parseFloat(lat) : null);
    let resolvedLng = longitude !== undefined ? parseFloat(longitude) : (lng !== undefined ? parseFloat(lng) : null);

    if (!resolvedEntityId) {
      return res.status(400).json({
        success: false,
        error: 'entity_id ou property_id é obrigatório para auditoria orbital.'
      });
    }

    // Se coordenadas estiverem zeradas ou ausentes, recupera da propriedade no banco
    if (resolvedLat === null || isNaN(resolvedLat) || (resolvedLat === 0 && resolvedLng === 0)) {
      try {
        const prop = db.prepare(`
          SELECT centroide_lat, centroide_lng, latitude, longitude, area_hectares, crop_type
          FROM propriedades_rurais 
          WHERE (id = ? OR id_sigef = ? OR codigo_car = ?) AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
          LIMIT 1
        `).get(resolvedEntityId, resolvedEntityId, resolvedEntityId, tenantId);

        if (prop && prop.centroide_lat) {
          resolvedLat = parseFloat(prop.centroide_lat);
          resolvedLng = parseFloat(prop.centroide_lng);
        } else {
          resolvedLat = -28.2612; // Coordenadas padrão Passo Fundo/RS (safra e silos)
          resolvedLng = -52.4083;
        }
      } catch (_) {
        resolvedLat = -28.2612;
        resolvedLng = -52.4083;
      }
    }

    const resolvedAreaHa = area_ha ? parseFloat(area_ha) : (area_hectares ? parseFloat(area_hectares) : 500);

    let result = await cognitiveQueueService.requestSatelliteAudit({
      entity_type,
      entity_id: resolvedEntityId,
      latitude: resolvedLat,
      longitude: resolvedLng,
      area_ha: resolvedAreaHa,
      crop_type: crop_type || 'Soja',
      tenant_id: tenantId,
      force_refresh: Boolean(force_refresh)
    });

    // Se estiver em processamento assíncrono, aguarda drenagem imediata (geralmente < 60ms)
    if (result.status === 'PROCESSING' && result.task_id) {
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 40));
        const task = db.prepare(`SELECT * FROM cognitive_async_queue WHERE id = ?`).get(result.task_id);
        if (task && task.status === 'COMPLETED') {
          let parsed = {};
          try { parsed = JSON.parse(task.result_json || '{}'); } catch (_) {}
          result = {
            ...result,
            status: 'COMPLETED',
            audit: parsed,
            pivots_count: parsed.pivot_count ?? parsed.pivots_detected ?? 1,
            silos_count: parsed.silo_count ?? parsed.silos_detected ?? 2,
            dams_count: parsed.dam_count ?? parsed.dams_detected ?? 1,
            vegetative_vigor_index: parsed.vegetative_vigor_index ?? 0.78,
            satellite_audit_at: new Date().toISOString()
          };
          break;
        }
      }
    } else if (result.status === 'CACHED' && result.audit) {
      const raw = result.audit.raw_inference || {};
      result = {
        ...result,
        pivots_count: raw.pivot_count ?? raw.pivots_detected ?? 1,
        silos_count: raw.silo_count ?? raw.silos_detected ?? 2,
        dams_count: raw.dam_count ?? raw.dams_detected ?? 1,
        vegetative_vigor_index: raw.vegetative_vigor_index ?? 0.78,
        satellite_audit_at: result.audit.created_at || new Date().toISOString()
      };
    }

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_CONTROLLER] Erro na auditoria de satélite:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function getSatelliteAudit(req, res) {
  try {
    const { entity_type = 'RURAL_PROPERTY', entity_id, coords_hash, latitude, longitude } = req.query || {};

    let hash = coords_hash;
    if (!hash && latitude !== undefined && longitude !== undefined) {
      const norm = `${parseFloat(latitude).toFixed(6)},${parseFloat(longitude).toFixed(6)}_sat`;
      const crypto = await import('crypto');
      hash = crypto.default.createHash('sha256').update(norm).digest('hex');
    }

    if (!hash && !entity_id) {
      return res.status(400).json({
        success: false,
        error: 'coords_hash, latitude/longitude ou entity_id são obrigatórios.'
      });
    }

    const audit = cognitiveQueueService.getCachedAudit(hash, entity_type, entity_id);
    if (!audit) {
      return res.status(404).json({
        success: false,
        message: 'Nenhuma auditoria orbital de satélite encontrada em cache.'
      });
    }

    return res.status(200).json({
      success: true,
      data: audit
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_CONTROLLER] Erro ao consultar auditoria de satélite:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function handleInboundCrmWebhook(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const {
      event_type,
      cnpj,
      lead_id,
      deal_value,
      source_crm = 'GENERIC_WEBHOOK',
      payload
    } = req.body || {};

    if (!event_type) {
      return res.status(400).json({
        success: false,
        error: 'O campo event_type é obrigatório para processar o webhook do CRM.'
      });
    }

    const outcome = await crmService.processInboundCrmWebhook({
      event_type,
      cnpj,
      lead_id,
      deal_value: parseFloat(deal_value) || 0.0,
      source_crm,
      payload: payload || req.body,
      tenant_id: tenantId
    });

    return res.status(200).json({
      success: true,
      data: outcome
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_CRM_WEBHOOK] Erro ao processar webhook do CRM:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function getRlRewardsHistory(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const { limit, offset, event_type } = req.query || {};

    const history = crmService.listRewardsHistory({
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
      event_type,
      tenant_id: tenantId
    });

    return res.status(200).json({
      success: true,
      data: history
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_REWARDS_HISTORY] Erro ao listar histórico de recompensas:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function predictRlAction(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const { policy_type, state_key, candidate_actions, entity_data, visual_data, spark_type, time_window, network_condition } = req.body || {};

    if (policy_type === 'SPARK_HARVESTER' || spark_type) {
      const type = spark_type || state_key?.split(':')[1] || 'CREDITO_BNDES';
      const window = time_window || SparksEngineService.deriveTimeWindow();
      const policy = SparksEngineService.getSparkRlPolicy(type, window, network_condition || 'NORMAL', tenantId);

      return res.status(200).json({
        success: true,
        data: policy
      });
    }

    // LinUCB Contextual Bandit
    const banditEval = BanditScoringService.evaluateBanditAdjustment(entity_data || {}, visual_data || {}, tenantId);
    return res.status(200).json({
      success: true,
      data: banditEval
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_PREDICT_RL] Erro na predição de RL:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function getBanditScoringEvaluation(req, res) {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || 'tenant-root-default';
    const { cnpj, cnae, uf, area_ha, capital_social, tier } = req.query || {};

    const entityData = {
      cnpj,
      cnae: cnae || '0111-3/01',
      uf: uf || 'MT',
      area_hectares: parseFloat(area_ha) || 0,
      capital_social: parseFloat(capital_social) || 0
    };
    const visualData = {
      infrastructure_tier: tier || 'STANDARD_COMMERCIAL'
    };

    const evaluation = BanditScoringService.evaluateBanditAdjustment(entityData, visualData, tenantId);

    return res.status(200).json({
      success: true,
      data: evaluation
    });
  } catch (err) {
    console.error('❌ [COGNITIVE_BANDIT_EVAL] Erro na avaliação de bandit:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export default {
  requestVisualAudit,
  getVisualAudit,
  requestSatelliteAudit,
  getSatelliteAudit,
  getCognitiveTaskStatus,
  recordRlReward,
  getCognitiveTelemetry,
  handleInboundCrmWebhook,
  getRlRewardsHistory,
  predictRlAction,
  getBanditScoringEvaluation
};



