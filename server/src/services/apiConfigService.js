/**
 * server/src/services/apiConfigService.js
 * 
 * FASE 59 — ETAPA 1: SERVIÇO DE CONFIGURAÇÃO DE CREDENCIAIS & BANCO DE DADOS
 * 
 * Gerencia persistência segura e acesso às tabelas `super_admin_settings` e `tenant_api_configs`,
 * aplicando criptografia obrigatória (AES-256-GCM) em todas as chaves de API antes de salvar
 * no SQLite e desencriptando transparentemente nas consultas.
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { encrypt, decrypt, maskApiKey, isEncrypted } from '../utils/cryptoUtils.js';

const MASTER_SETTINGS_ID = 'host_master_settings';
const DEFAULT_TEST_DRIVE_DAYS = 7;

/**
 * Retorna as credenciais mestre do Host desencriptadas
 * @returns {Promise<Object>}
 */
export async function getHostMasterSettings() {
  let row = db.prepare('SELECT * FROM super_admin_settings WHERE id = ?').get(MASTER_SETTINGS_ID);

  if (!row) {
    db.prepare('INSERT OR IGNORE INTO super_admin_settings (id) VALUES (?)').run(MASTER_SETTINGS_ID);
    row = db.prepare('SELECT * FROM super_admin_settings WHERE id = ?').get(MASTER_SETTINGS_ID);
  }

  // Fallback transparente: se chaves no banco estiverem vazias, mas presentes no .env,
  // encripta e salva no SQLite imediatamente
  let needsSync = false;
  let masterOpenai = row.master_openai_key ? decrypt(row.master_openai_key) : null;
  let masterBureau = row.master_bureau_key ? decrypt(row.master_bureau_key) : null;
  let masterMetaAppId = row.master_meta_app_id ? decrypt(row.master_meta_app_id) : null;
  let masterMetaToken = row.master_meta_token ? decrypt(row.master_meta_token) : null;

  if (!masterOpenai && process.env.OPENAI_API_KEY) {
    masterOpenai = process.env.OPENAI_API_KEY.trim();
    row.master_openai_key = encrypt(masterOpenai);
    needsSync = true;
  }
  if (!masterBureau && process.env.BUREAU_API_KEY) {
    masterBureau = process.env.BUREAU_API_KEY.trim();
    row.master_bureau_key = encrypt(masterBureau);
    needsSync = true;
  }

  if (needsSync) {
    db.prepare(`
      UPDATE super_admin_settings 
      SET master_openai_key = ?, master_bureau_key = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(row.master_openai_key, row.master_bureau_key, MASTER_SETTINGS_ID);
  }

  return {
    id: row.id,
    master_openai_key: masterOpenai,
    master_meta_app_id: masterMetaAppId,
    master_meta_token: masterMetaToken,
    master_bureau_key: masterBureau,
    updated_at: row.updated_at,
    created_at: row.created_at
  };
}

/**
 * Atualiza as credenciais mestre do Host, encriptando-as antes de persistir
 * @param {Object} params
 * @param {string} [params.master_openai_key]
 * @param {string} [params.master_meta_app_id]
 * @param {string} [params.master_meta_token]
 * @param {string} [params.master_bureau_key]
 * @returns {Promise<Object>}
 */
export async function updateHostMasterSettings(params = {}) {
  const current = await getHostMasterSettings();

  const newOpenai = params.master_openai_key !== undefined ? params.master_openai_key : current.master_openai_key;
  const newMetaAppId = params.master_meta_app_id !== undefined ? params.master_meta_app_id : current.master_meta_app_id;
  const newMetaToken = params.master_meta_token !== undefined ? params.master_meta_token : current.master_meta_token;
  const newBureau = params.master_bureau_key !== undefined ? params.master_bureau_key : current.master_bureau_key;

  const encOpenai = newOpenai ? encrypt(newOpenai) : null;
  const encMetaAppId = newMetaAppId ? encrypt(newMetaAppId) : null;
  const encMetaToken = newMetaToken ? encrypt(newMetaToken) : null;
  const encBureau = newBureau ? encrypt(newBureau) : null;

  db.prepare(`
    INSERT INTO super_admin_settings (id, master_openai_key, master_meta_app_id, master_meta_token, master_bureau_key, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      master_openai_key = excluded.master_openai_key,
      master_meta_app_id = excluded.master_meta_app_id,
      master_meta_token = excluded.master_meta_token,
      master_bureau_key = excluded.master_bureau_key,
      updated_at = CURRENT_TIMESTAMP
  `).run(MASTER_SETTINGS_ID, encOpenai, encMetaAppId, encMetaToken, encBureau);

  return getHostMasterSettings();
}

/**
 * Retorna a configuração de APIs de um Tenant específico, desencriptando as chaves
 * Se não existir, inicializa automaticamente com modelo Test Drive ativo
 * @param {string} tenantId
 * @returns {Promise<Object>}
 */
export async function getTenantApiConfig(tenantId) {
  if (!tenantId) {
    tenantId = 'tenant-root-default';
  }

  let row = db.prepare('SELECT * FROM tenant_api_configs WHERE tenant_id = ?').get(tenantId);

  if (!row) {
    // Inicializa novo registro
    const configId = `cfg-${tenantId}-${crypto.randomBytes(3).toString('hex')}`;
    const isRoot = tenantId === 'tenant-root-default';
    const expiresAt = isRoot 
      ? '2099-12-31T23:59:59.999Z' 
      : new Date(Date.now() + DEFAULT_TEST_DRIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT OR IGNORE INTO tenant_api_configs (id, tenant_id, use_master_key, test_drive_expires_at, created_at, updated_at)
      VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(configId, tenantId, expiresAt);

    row = db.prepare('SELECT * FROM tenant_api_configs WHERE tenant_id = ?').get(tenantId);
  }

  if (!row) {
    throw new Error(`Falha ao obter ou criar tenant_api_configs para o tenant: ${tenantId}`);
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    openai_key: row.openai_key ? decrypt(row.openai_key) : null,
    meta_app_id: row.meta_app_id ? decrypt(row.meta_app_id) : null,
    meta_token: row.meta_token ? decrypt(row.meta_token) : null,
    bureau_key: row.bureau_key ? decrypt(row.bureau_key) : null,
    use_master_key: Boolean(row.use_master_key),
    test_drive_expires_at: row.test_drive_expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Atualiza ou insere as credenciais locais e flags de Test Drive de um Tenant
 * Encripta qualquer chave de API antes do salvamento
 * @param {string} tenantId
 * @param {Object} params
 * @param {string} [params.openai_key]
 * @param {string} [params.meta_app_id]
 * @param {string} [params.meta_token]
 * @param {string} [params.bureau_key]
 * @param {boolean} [params.use_master_key]
 * @param {string} [params.test_drive_expires_at]
 * @returns {Promise<Object>}
 */
export async function saveTenantApiConfig(tenantId, params = {}) {
  if (!tenantId) {
    throw new Error('tenant_id é obrigatório para salvar configurações de API.');
  }

  const existing = await getTenantApiConfig(tenantId);

  const newOpenai = params.openai_key !== undefined ? params.openai_key : existing.openai_key;
  const newMetaAppId = params.meta_app_id !== undefined ? params.meta_app_id : existing.meta_app_id;
  const newMetaToken = params.meta_token !== undefined ? params.meta_token : existing.meta_token;
  const newBureau = params.bureau_key !== undefined ? params.bureau_key : existing.bureau_key;
  const newUseMaster = params.use_master_key !== undefined ? (params.use_master_key ? 1 : 0) : (existing.use_master_key ? 1 : 0);
  const newExpiresAt = params.test_drive_expires_at !== undefined ? params.test_drive_expires_at : existing.test_drive_expires_at;

  const encOpenai = newOpenai ? encrypt(newOpenai) : null;
  const encMetaAppId = newMetaAppId ? encrypt(newMetaAppId) : null;
  const encMetaToken = newMetaToken ? encrypt(newMetaToken) : null;
  const encBureau = newBureau ? encrypt(newBureau) : null;

  db.prepare(`
    UPDATE tenant_api_configs
    SET openai_key = ?,
        meta_app_id = ?,
        meta_token = ?,
        bureau_key = ?,
        use_master_key = ?,
        test_drive_expires_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ?
  `).run(encOpenai, encMetaAppId, encMetaToken, encBureau, newUseMaster, newExpiresAt, tenantId);

  return getTenantApiConfig(tenantId);
}

/**
 * Lista todos os tenants combinados com suas configurações de API, mascarando as chaves
 * para exibição segura na tabela do Super Admin
 * @returns {Promise<Array>}
 */
export async function listTenantsWithApiStatus() {
  const tenants = db.prepare(`
    SELECT t.id, t.name, t.cnpj, t.plan, t.status, t.created_at,
           c.use_master_key, c.test_drive_expires_at,
           c.openai_key, c.meta_app_id, c.meta_token, c.bureau_key
    FROM tenants t
    LEFT JOIN tenant_api_configs c ON t.id = c.tenant_id
    ORDER BY t.created_at DESC
  `).all();

  const now = new Date();

  return tenants.map(t => {
    const useMaster = t.use_master_key === null || t.use_master_key === undefined ? true : Boolean(t.use_master_key);
    const expiresAt = t.test_drive_expires_at ? new Date(t.test_drive_expires_at) : null;
    const isExpired = expiresAt ? (now > expiresAt) : false;
    
    let daysRemaining = 0;
    if (expiresAt && !isExpired) {
      daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // Desencripta para mascarar
    const decOpenai = t.openai_key ? decrypt(t.openai_key) : null;
    const decMetaAppId = t.meta_app_id ? decrypt(t.meta_app_id) : null;
    const decMetaToken = t.meta_token ? decrypt(t.meta_token) : null;
    const decBureau = t.bureau_key ? decrypt(t.bureau_key) : null;

    return {
      tenant_id: t.id,
      name: t.name,
      cnpj: t.cnpj,
      plan: t.plan,
      status: t.status,
      use_master_key: useMaster,
      test_drive_expires_at: t.test_drive_expires_at,
      is_test_drive_expired: useMaster && isExpired,
      days_remaining: daysRemaining,
      has_openai_key: Boolean(decOpenai),
      has_meta_keys: Boolean(decMetaAppId && decMetaToken),
      has_bureau_key: Boolean(decBureau),
      masked_openai_key: maskApiKey(decOpenai),
      masked_meta_app_id: maskApiKey(decMetaAppId),
      masked_meta_token: maskApiKey(decMetaToken),
      masked_bureau_key: maskApiKey(decBureau)
    };
  });
}

export default {
  getHostMasterSettings,
  updateHostMasterSettings,
  getTenantApiConfig,
  saveTenantApiConfig,
  listTenantsWithApiStatus
};
