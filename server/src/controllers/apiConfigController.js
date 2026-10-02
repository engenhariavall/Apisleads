/**
 * server/src/controllers/apiConfigController.js
 * 
 * FASE 59 — ETAPA 3: CONTROLLER DE GESTÃO DE APIS & TEST DRIVE (SUPER ADMIN)
 * 
 * Fornece endpoints protegidos para o Super Admin gerenciar credenciais globais do Host,
 * acompanhar a saúde de APIs de cada cliente e controlar o modelo de Test Drive.
 */

import db from '../config/database.js';
import { 
  getHostMasterSettings, 
  updateHostMasterSettings, 
  getTenantApiConfig, 
  saveTenantApiConfig, 
  listTenantsWithApiStatus 
} from '../services/apiConfigService.js';
import { maskApiKey } from '../utils/cryptoUtils.js';

/**
 * GET /api/admin/api-configs/host
 * Retorna as configurações das chaves Mestre do Host (apenas Super Admin)
 */
export async function getHostSettingsController(req, res) {
  try {
    const settings = await getHostMasterSettings();
    return res.status(200).json({
      success: true,
      settings: {
        ...settings,
        masked_openai: maskApiKey(settings.master_openai_key),
        masked_meta_token: maskApiKey(settings.master_meta_token),
        masked_bureau: maskApiKey(settings.master_bureau_key)
      }
    });
  } catch (err) {
    console.error('❌ Erro ao buscar configurações de API do Host:', err);
    return res.status(500).json({
      success: false,
      error: 'GET_HOST_SETTINGS_ERROR',
      message: err.message || 'Falha ao buscar credenciais mestre.'
    });
  }
}

/**
 * PUT /api/admin/api-configs/host
 * Atualiza as credenciais Mestre do Host no SQLite com criptografia AES-256-GCM
 */
export async function updateHostSettingsController(req, res) {
  try {
    const { master_openai_key, master_meta_app_id, master_meta_token, master_bureau_key } = req.body;

    const updated = await updateHostMasterSettings({
      master_openai_key,
      master_meta_app_id,
      master_meta_token,
      master_bureau_key
    });

    return res.status(200).json({
      success: true,
      message: 'Credenciais do Host atualizadas e encriptadas com sucesso!',
      settings: {
        ...updated,
        masked_openai: maskApiKey(updated.master_openai_key),
        masked_meta_token: maskApiKey(updated.master_meta_token),
        masked_bureau: maskApiKey(updated.master_bureau_key)
      }
    });
  } catch (err) {
    console.error('❌ Erro ao atualizar configurações de API do Host:', err);
    return res.status(500).json({
      success: false,
      error: 'UPDATE_HOST_SETTINGS_ERROR',
      message: err.message || 'Falha ao atualizar credenciais mestre.'
    });
  }
}

/**
 * GET /api/admin/api-configs/tenants
 * Lista todos os inquilinos com status de Test Drive e chaves mascaradas
 */
export async function listTenantsApiConfigsController(req, res) {
  try {
    const list = await listTenantsWithApiStatus();
    
    // Anexa os nichos permitidos de cada tenant
    const tenantRows = db.prepare('SELECT id, allowed_niches FROM tenants').all();
    const nichesMap = new Map(tenantRows.map(r => [r.id, r.allowed_niches]));

    const enrichedList = list.map(t => {
      let niches = ['agro', 'b2b', 'saude'];
      try {
        const raw = nichesMap.get(t.tenant_id);
        if (raw) niches = JSON.parse(raw);
      } catch (e) {}

      return {
        ...t,
        allowed_niches: niches
      };
    });

    return res.status(200).json({
      success: true,
      tenants: enrichedList
    });
  } catch (err) {
    console.error('❌ Erro ao listar status de APIs dos tenants:', err);
    return res.status(500).json({
      success: false,
      error: 'LIST_TENANTS_API_ERROR',
      message: err.message || 'Falha ao listar inquilinos.'
    });
  }
}

/**
 * GET /api/admin/api-configs/tenants/:tenantId
 * Retorna as credenciais e status de Test Drive de um inquilino específico
 */
export async function getTenantApiConfigController(req, res) {
  try {
    const { tenantId } = req.params;
    const config = await getTenantApiConfig(tenantId);
    const tenant = db.prepare('SELECT id, name, cnpj, allowed_niches FROM tenants WHERE id = ?').get(tenantId);

    let allowedNiches = ['agro', 'b2b', 'saude'];
    try {
      if (tenant?.allowed_niches) allowedNiches = JSON.parse(tenant.allowed_niches);
    } catch (e) {}

    return res.status(200).json({
      success: true,
      config: {
        ...config,
        tenant_name: tenant?.name || tenantId,
        cnpj: tenant?.cnpj || null,
        allowed_niches: allowedNiches
      }
    });
  } catch (err) {
    console.error('❌ Erro ao buscar configuração de API do tenant:', err);
    return res.status(500).json({
      success: false,
      error: 'GET_TENANT_API_ERROR',
      message: err.message || 'Falha ao buscar configuração do inquilino.'
    });
  }
}

/**
 * PUT /api/admin/api-configs/tenants/:tenantId
 * Atualiza configurações de API, Test Drive e Workspaces de um inquilino
 */
export async function updateTenantApiConfigController(req, res) {
  try {
    const { tenantId } = req.params;
    const { 
      use_master_key, 
      test_drive_expires_at, 
      openai_key, 
      meta_app_id, 
      meta_token, 
      bureau_key, 
      allowed_niches 
    } = req.body;

    const updated = await saveTenantApiConfig(tenantId, {
      use_master_key,
      test_drive_expires_at,
      openai_key,
      meta_app_id,
      meta_token,
      bureau_key
    });

    if (allowed_niches !== undefined) {
      const nichesJson = Array.isArray(allowed_niches) ? JSON.stringify(allowed_niches) : String(allowed_niches);
      db.prepare('UPDATE tenants SET allowed_niches = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nichesJson, tenantId);
    }

    const tenant = db.prepare('SELECT id, name, allowed_niches FROM tenants WHERE id = ?').get(tenantId);
    let resolvedNiches = ['agro', 'b2b', 'saude'];
    try {
      if (tenant?.allowed_niches) resolvedNiches = JSON.parse(tenant.allowed_niches);
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: 'Configurações de APIs do cliente salvas com sucesso!',
      config: {
        ...updated,
        tenant_name: tenant?.name || tenantId,
        allowed_niches: resolvedNiches
      }
    });
  } catch (err) {
    console.error('❌ Erro ao atualizar configuração de API do tenant:', err);
    return res.status(500).json({
      success: false,
      error: 'UPDATE_TENANT_API_ERROR',
      message: err.message || 'Falha ao salvar configurações de API do cliente.'
    });
  }
}

export default {
  getHostSettingsController,
  updateHostSettingsController,
  listTenantsApiConfigsController,
  getTenantApiConfigController,
  updateTenantApiConfigController
};
