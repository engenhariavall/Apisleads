/**
 * server/src/controllers/tenantController.js
 * 
 * FASE 32 — ETAPA 2: CONTROLLER DE GESTÃO DE EMPRESAS & TENANTS CORPORATIVOS
 * 
 * Endpoints restritos para usuários com papel SUPER_ADMIN:
 * - GET    /api/admin/tenants: Lista todas as empresas/tenants com métricas de operadores e cotas
 * - POST   /api/admin/tenants: Cria nova empresa com limites configuráveis
 * - PUT    /api/admin/tenants/:id: Atualiza dados cadastrais, plano, status e limites
 * - DELETE /api/admin/tenants/:id: Suspende ou remove empresa
 */

import crypto from 'crypto';
import db from '../config/database.js';

/**
 * Lista todas as organizações/tenants cadastrados com agregados de usuários
 */
export async function listTenants(req, res) {
  try {
    let tenants = [];
    if (db.isPostgres && db.pool) {
      const qRes = await db.query(`
        SELECT t.id, t.name, t.cnpj, t.plan, t.status, t.max_users,
               t.daily_quota_limit, t.monthly_quota_limit, t.created_at, t.updated_at,
               COUNT(u.id) AS total_users,
               COUNT(CASE WHEN u.is_active IS TRUE THEN 1 END) AS active_users
        FROM tenants t
        LEFT JOIN users u ON t.id = u.tenant_id
        GROUP BY t.id, t.name, t.cnpj, t.plan, t.status, t.max_users, t.daily_quota_limit, t.monthly_quota_limit, t.created_at, t.updated_at
        ORDER BY t.created_at ASC
      `);
      tenants = qRes.rows || [];
    } else {
      tenants = db.prepare(`
        SELECT t.id, t.name, t.cnpj, t.plan, t.status, t.max_users,
               t.daily_quota_limit, t.monthly_quota_limit, t.created_at, t.updated_at,
               COUNT(u.id) AS total_users,
               SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) AS active_users
        FROM tenants t
        LEFT JOIN users u ON t.id = u.tenant_id
        GROUP BY t.id
        ORDER BY t.created_at ASC
      `).all();
    }

    return res.status(200).json({
      success: true,
      data: tenants,
      tenants: tenants,
      total: tenants.length
    });
  } catch (err) {
    console.error('❌ Erro ao listar tenants:', err);
    return res.status(500).json({
      success: false,
      error: 'LIST_TENANTS_ERROR',
      message: 'Falha interna ao listar empresas contratantes.'
    });
  }
}

/**
 * Obtém detalhes de um tenant específico com seus usuários
 */
export async function getTenantDetails(req, res) {
  try {
    const { id } = req.params;
    let tenant = null;
    let users = [];

    if (db.isPostgres && db.pool) {
      const tRes = await db.query('SELECT * FROM tenants WHERE id = ?', [id]);
      tenant = tRes.rows && tRes.rows.length > 0 ? tRes.rows[0] : null;

      if (tenant) {
        const uRes = await db.query(`
          SELECT id, email, name, role, is_active, created_at, last_login_at
          FROM users
          WHERE tenant_id = ?
          ORDER BY created_at ASC
        `, [id]);
        users = uRes.rows || [];
      }
    } else {
      tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);

      if (tenant) {
        users = db.prepare(`
          SELECT id, email, name, role, is_active, created_at, last_login_at
          FROM users
          WHERE tenant_id = ?
          ORDER BY created_at ASC
        `).all(id);
      }
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Empresa não encontrada.'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...tenant,
        users
      }
    });
  } catch (err) {
    console.error('❌ Erro ao buscar detalhes do tenant:', err);
    return res.status(500).json({
      success: false,
      error: 'GET_TENANT_ERROR',
      message: 'Falha interna ao obter dados da empresa.'
    });
  }
}

/**
 * Cadastra uma nova organização / tenant
 */
export async function createTenant(req, res) {
  try {
    const body = req.body || {};
    const name = (body.name || body.razao_social || '').trim();
    const cnpj = (body.cnpj || '').trim();
    const plan = (body.plan || 'ENTERPRISE').trim().toUpperCase();
    const max_users = Number(body.max_users || body.maxUsers || 5);
    const daily_quota_limit = Number(body.daily_quota_limit || body.dailyQuota || 500);
    const monthly_quota_limit = Number(body.monthly_quota_limit || body.monthlyQuota || 5000);

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_NAME',
        message: 'O nome / razão social da empresa é obrigatório.'
      });
    }

    // Se CNPJ informado, valida duplicidade
    if (cnpj) {
      let existingCnpj = null;
      if (db.isPostgres && db.pool) {
        const cRes = await db.query('SELECT id FROM tenants WHERE cnpj = ?', [cnpj]);
        existingCnpj = cRes.rows && cRes.rows.length > 0;
      } else {
        existingCnpj = db.prepare('SELECT id FROM tenants WHERE cnpj = ?').get(cnpj);
      }
      if (existingCnpj) {
        return res.status(400).json({
          success: false,
          error: 'CNPJ_ALREADY_EXISTS',
          message: 'Já existe uma empresa cadastrada com este CNPJ.'
        });
      }
    }

    const tenantId = `tenant-${crypto.randomBytes(4).toString('hex')}`;

    if (db.isPostgres && db.pool) {
      await db.query(`
        INSERT INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, NOW(), NOW())
      `, [tenantId, name, cnpj || null, plan, max_users, daily_quota_limit, monthly_quota_limit]);
    } else {
      db.prepare(`
        INSERT INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(tenantId, name, cnpj || null, plan, max_users, daily_quota_limit, monthly_quota_limit);
    }

    // FASE 59: Inicialização automática de Test Drive (7 dias) em tenant_api_configs
    try {
      const configId = `cfg-${tenantId}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      if (db.isPostgres && db.pool) {
        await db.query(`
          INSERT INTO tenant_api_configs (id, tenant_id, use_master_key, test_drive_expires_at, created_at, updated_at)
          VALUES (?, ?, 1, ?, NOW(), NOW())
          ON CONFLICT (tenant_id) DO NOTHING
        `, [configId, tenantId, expiresAt]);
      } else {
        db.prepare(`
          INSERT OR IGNORE INTO tenant_api_configs (id, tenant_id, use_master_key, test_drive_expires_at, created_at, updated_at)
          VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(configId, tenantId, expiresAt);
      }
    } catch (cfgErr) {
      console.warn('Aviso ao inicializar tenant_api_configs:', cfgErr.message);
    }

    let newTenant = null;
    if (db.isPostgres && db.pool) {
      const nRes = await db.query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
      newTenant = nRes.rows && nRes.rows.length > 0 ? nRes.rows[0] : null;
    } else {
      newTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    }

    return res.status(201).json({
      success: true,
      message: `Empresa "${name}" cadastrada com sucesso!`,
      data: newTenant,
      tenant: newTenant
    });
  } catch (err) {
    console.error('❌ Erro ao criar tenant:', err);
    return res.status(500).json({
      success: false,
      error: 'CREATE_TENANT_ERROR',
      message: err.message || 'Falha interna ao cadastrar empresa.'
    });
  }
}

/**
 * Atualiza dados, plano, limites ou status de um tenant
 */
export async function updateTenant(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    let tenant = null;
    if (db.isPostgres && db.pool) {
      const tRes = await db.query('SELECT * FROM tenants WHERE id = ?', [id]);
      tenant = tRes.rows && tRes.rows.length > 0 ? tRes.rows[0] : null;
    } else {
      tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Empresa não encontrada.'
      });
    }

    // Proteção de integridade: O tenant raiz não pode ser inativado
    if (id === 'tenant-root-default' && body.status && body.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: 'CANNOT_DEACTIVATE_ROOT_TENANT',
        message: 'A organização raiz do sistema não pode ser desativada.'
      });
    }

    const name = body.name !== undefined ? String(body.name).trim() : tenant.name;
    const cnpj = body.cnpj !== undefined ? String(body.cnpj).trim() : tenant.cnpj;
    const plan = body.plan !== undefined ? String(body.plan).trim().toUpperCase() : tenant.plan;
    const status = body.status !== undefined ? String(body.status).trim().toUpperCase() : tenant.status;
    const max_users = body.max_users !== undefined ? Number(body.max_users) : tenant.max_users;
    const daily_quota_limit = body.daily_quota_limit !== undefined ? Number(body.daily_quota_limit) : tenant.daily_quota_limit;
    const monthly_quota_limit = body.monthly_quota_limit !== undefined ? Number(body.monthly_quota_limit) : tenant.monthly_quota_limit;

    if (db.isPostgres && db.pool) {
      await db.query(`
        UPDATE tenants 
        SET name = ?, cnpj = ?, plan = ?, status = ?, max_users = ?, 
            daily_quota_limit = ?, monthly_quota_limit = ?, updated_at = NOW()
        WHERE id = ?
      `, [name, cnpj || null, plan, status, max_users, daily_quota_limit, monthly_quota_limit, id]);
    } else {
      db.prepare(`
        UPDATE tenants 
        SET name = ?, cnpj = ?, plan = ?, status = ?, max_users = ?, 
            daily_quota_limit = ?, monthly_quota_limit = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, cnpj || null, plan, status, max_users, daily_quota_limit, monthly_quota_limit, id);
    }

    let updated = null;
    if (db.isPostgres && db.pool) {
      const uRes = await db.query('SELECT * FROM tenants WHERE id = ?', [id]);
      updated = uRes.rows && uRes.rows.length > 0 ? uRes.rows[0] : null;
    } else {
      updated = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    }

    return res.status(200).json({
      success: true,
      message: 'Empresa atualizada com sucesso.',
      data: updated,
      tenant: updated
    });
  } catch (err) {
    console.error('❌ Erro ao atualizar tenant:', err);
    return res.status(500).json({
      success: false,
      error: 'UPDATE_TENANT_ERROR',
      message: err.message || 'Falha ao atualizar dados da empresa.'
    });
  }
}

/**
 * Remove definitivamente uma organização/tenant com cascata governamental segura
 */
export async function deleteTenant(req, res) {
  try {
    const { id } = req.params;

    if (id === 'tenant-root-default') {
      return res.status(400).json({
        success: false,
        error: 'CANNOT_DELETE_ROOT_TENANT',
        message: 'A organização raiz primária da plataforma VERSUS não pode ser removida.'
      });
    }

    let tenant = null;
    if (db.isPostgres && db.pool) {
      const tRes = await db.query('SELECT id, name FROM tenants WHERE id = ?', [id]);
      tenant = tRes.rows && tRes.rows.length > 0 ? tRes.rows[0] : null;
    } else {
      tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(id);
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Empresa não encontrada.'
      });
    }

    let deletedUsersCount = 0;
    let deletedLeadsCount = 0;

    if (db.isPostgres && db.pool) {
      try { await db.query('UPDATE audit_logs SET tenant_id = NULL WHERE tenant_id = ?', [id]); } catch (e) {}
      try { await db.query('DELETE FROM leads WHERE is_competitor = 1 AND tenant_id = ?', [id]); } catch (e) {}
      try { await db.query('DELETE FROM export_quotas WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)', [id]); } catch (e) {}
      const du = await db.query('DELETE FROM users WHERE tenant_id = ?', [id]);
      deletedUsersCount = du.rowCount || 0;
      const dl = await db.query('DELETE FROM leads WHERE tenant_id = ?', [id]);
      deletedLeadsCount = dl.rowCount || 0;
      try { await db.query('DELETE FROM tenant_api_configs WHERE tenant_id = ?', [id]); } catch (e) {}
      await db.query('DELETE FROM tenants WHERE id = ?', [id]);
    } else {
      try { db.prepare('UPDATE audit_logs SET tenant_id = NULL WHERE tenant_id = ?').run(id); } catch (e) {}
      try { db.prepare('DELETE FROM leads WHERE is_competitor = 1 AND tenant_id = ?').run(id); } catch (e) {}
      try {
        db.prepare(`
          DELETE FROM export_quotas 
          WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)
        `).run(id);
      } catch (e) {}
      const du = db.prepare('DELETE FROM users WHERE tenant_id = ?').run(id);
      deletedUsersCount = du.changes || 0;
      const dl = db.prepare('DELETE FROM leads WHERE tenant_id = ?').run(id);
      deletedLeadsCount = dl.changes || 0;
      try { db.prepare('DELETE FROM tenant_api_configs WHERE tenant_id = ?').run(id); } catch (e) {}
      db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
    }

    return res.status(200).json({
      success: true,
      message: `Empresa "${tenant.name}" excluída definitivamente com sucesso (${deletedUsersCount} operadores e ${deletedLeadsCount} leads purgados).`,
      action: 'DELETED',
      deleted_users_count: deletedUsersCount,
      deleted_leads_count: deletedLeadsCount
    });
  } catch (err) {
    console.error('❌ Erro ao excluir tenant em cascata:', err);
    return res.status(500).json({
      success: false,
      error: 'DELETE_TENANT_ERROR',
      message: err.message || 'Falha interna ao excluir empresa.'
    });
  }
}

/**
 * FASE 35 (ETAPA 3): Obtém configurações do Tenant do usuário autenticado atual
 */
export async function getMyTenantSettings(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 'tenant-root-default';
    let tenant = null;

    if (db.isPostgres && db.pool) {
      const tRes = await db.query('SELECT id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit, whatsapp_inbound, settings_json FROM tenants WHERE id = ?', [tenantId]);
      tenant = tRes.rows && tRes.rows.length > 0 ? tRes.rows[0] : null;
      if (!tenant) {
        const rootRes = await db.query('SELECT id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit, whatsapp_inbound, settings_json FROM tenants WHERE id = ?', ['tenant-root-default']);
        tenant = rootRes.rows && rootRes.rows.length > 0 ? rootRes.rows[0] : null;
      }
    } else {
      tenant = db.prepare('SELECT id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit, whatsapp_inbound, settings_json FROM tenants WHERE id = ?').get(tenantId);
      if (!tenant) {
        tenant = db.prepare('SELECT id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit, whatsapp_inbound, settings_json FROM tenants WHERE id = ?').get('tenant-root-default');
      }
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Organização não encontrada.'
      });
    }

    let parsedSettings = {};
    try {
      parsedSettings = typeof tenant.settings_json === 'string' ? JSON.parse(tenant.settings_json || '{}') : (tenant.settings_json || {});
    } catch (e) {}

    return res.status(200).json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        cnpj: tenant.cnpj,
        plan: tenant.plan,
        status: tenant.status,
        max_users: tenant.max_users,
        daily_quota_limit: tenant.daily_quota_limit,
        monthly_quota_limit: tenant.monthly_quota_limit,
        whatsapp_inbound: tenant.whatsapp_inbound || '',
        settings: parsedSettings
      }
    });
  } catch (err) {
    console.error('❌ Erro ao obter configurações do tenant:', err);
    return res.status(500).json({
      success: false,
      error: 'GET_SETTINGS_ERROR',
      message: 'Falha ao buscar configurações da organização.'
    });
  }
}

/**
 * FASE 35 (ETAPA 3): Atualiza configurações de Roteamento Inbound (WhatsApp) do Tenant
 */
export async function updateMyTenantSettings(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 'tenant-root-default';
    const body = req.body || {};
    
    // Sanitização do WhatsApp (remove caracteres não-dígitos)
    let rawWa = body.whatsapp_inbound !== undefined ? String(body.whatsapp_inbound).trim() : null;
    let cleanWa = rawWa ? rawWa.replace(/\D/g, '') : null;
    if (cleanWa && !cleanWa.startsWith('55') && cleanWa.length <= 11) {
      cleanWa = `55${cleanWa}`;
    }

    let tenant = null;
    if (db.isPostgres && db.pool) {
      const tRes = await db.query('SELECT * FROM tenants WHERE id = ?', [tenantId]);
      tenant = tRes.rows && tRes.rows.length > 0 ? tRes.rows[0] : null;
    } else {
      tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Organização não encontrada.'
      });
    }

    let currentSettings = {};
    try {
      currentSettings = typeof tenant.settings_json === 'string' ? JSON.parse(tenant.settings_json || '{}') : (tenant.settings_json || {});
    } catch (e) {}

    const updatedSettings = {
      ...currentSettings,
      ...(body.settings || {})
    };

    if (db.isPostgres && db.pool) {
      await db.query(`
        UPDATE tenants 
        SET whatsapp_inbound = ?,
            settings_json = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [cleanWa, JSON.stringify(updatedSettings), tenantId]);
    } else {
      db.prepare(`
        UPDATE tenants 
        SET whatsapp_inbound = ?,
            settings_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cleanWa, JSON.stringify(updatedSettings), tenantId);
    }

    let updated = null;
    if (db.isPostgres && db.pool) {
      const uRes = await db.query('SELECT id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit, whatsapp_inbound, settings_json FROM tenants WHERE id = ?', [tenantId]);
      updated = uRes.rows && uRes.rows.length > 0 ? uRes.rows[0] : null;
    } else {
      updated = db.prepare('SELECT id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit, whatsapp_inbound, settings_json FROM tenants WHERE id = ?').get(tenantId);
    }

    let resSettings = {};
    try {
      resSettings = typeof updated.settings_json === 'string' ? JSON.parse(updated.settings_json || '{}') : (updated.settings_json || {});
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: 'Configurações de roteamento inbound do tenant salvas com sucesso!',
      tenant: {
        id: updated.id,
        name: updated.name,
        cnpj: updated.cnpj,
        plan: updated.plan,
        status: updated.status,
        whatsapp_inbound: updated.whatsapp_inbound || '',
        settings: resSettings
      }
    });
  } catch (err) {
    console.error('❌ Erro ao atualizar configurações do tenant:', err);
    return res.status(500).json({
      success: false,
      error: 'UPDATE_SETTINGS_ERROR',
      message: 'Falha ao salvar configurações da organização.'
    });
  }
}
