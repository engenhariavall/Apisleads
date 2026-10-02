/**
 * server/src/controllers/adminController.js
 * 
 * FASE 26 — ETAPA 4: CONTROLLER DO COCKPIT ADMIN MASTER
 * 
 * Endpoints restritos para usuários com papel SUPER_ADMIN:
 * - GET    /api/admin/users: Lista todos os usuários com suas quotas e status
 * - POST   /api/admin/users: Cria novo usuário com quota definida
 * - PUT    /api/admin/users/:id: Atualiza papel, nome, status (ativo/inativo) e quota
 * - DELETE /api/admin/users/:id: Remove usuário (impede remoção do próprio super admin)
 * - POST   /api/admin/users/:id/reset-password: Redefine senha de um usuário
 * - GET    /api/admin/audit-logs: Consulta telemetria de auditoria com paginação e filtros
 * - GET    /api/admin/metrics: Estatísticas de uso, consumo de quotas e usuários ativos
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { hashPassword } from '../utils/security.js';

/**
 * Lista todos os usuários cadastrados com suas quotas
 */
export async function listUsers(req, res) {
  try {
    const { tenant_id, scope } = req.query;

    let query = `
      SELECT u.id, u.tenant_id, COALESCE(t.name, 'VERSUS INTELLIGENCE (ROOT)') AS tenant_name, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login_at, u.access_password,
             q.daily_limit, q.monthly_limit, q.used_today, q.used_this_month, q.last_reset_date
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      LEFT JOIN export_quotas q ON u.id = q.user_id
    `;
    const params = [];

    if (tenant_id && tenant_id !== 'tenant-root-default') {
      query += ` WHERE u.tenant_id = ? `;
      params.push(tenant_id);
    } else if (scope === 'all') {
      // Retorna todos os usuários de todos os inquilinos quando explicitamente solicitado
    } else {
      // Cláusula estrita da Fase 41: filtra exclusivamente a equipe interna da Plataforma VERSUS (Tenant Raiz)
      query += ` WHERE (u.tenant_id = 'tenant-root-default' OR u.tenant_id IS NULL OR u.tenant_id = '') `;
    }

    query += ` ORDER BY u.created_at ASC `;

    let users = [];
    if (db.isPostgres && db.pool) {
      const uRes = await db.query(query, params);
      users = uRes.rows || [];
    } else {
      users = db.prepare(query).all(...params);
    }

    return res.status(200).json({
      success: true,
      data: users,
      users: users
    });
  } catch (err) {
    console.error('❌ Erro ao listar usuários no admin:', err);
    return res.status(500).json({ success: false, error: 'LIST_USERS_ERROR', message: err.message });
  }
}

/**
 * Cria um novo usuário associado a um tenant/empresa
 */
export async function createUser(req, res) {
  try {
    const body = req.body || {};
    const email = body.email;
    const password = body.password;
    const name = body.name;
    const role = body.role || 'GESTOR_TRAFEGO';
    const tenant_id = body.tenant_id || body.tenantId || 'tenant-root-default';
    const daily_limit = body.daily_limit !== undefined ? body.daily_limit : (body.dailyQuota !== undefined ? body.dailyQuota : 500);
    const monthly_limit = body.monthly_limit !== undefined ? body.monthly_limit : (body.monthlyQuota !== undefined ? body.monthlyQuota : 5000);

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Nome, e-mail e senha são obrigatórios.'
      });
    }

    // Valida se o Tenant existe e está ativo
    let tenant = null;
    let currentUsersCount = 0;
    if (db.isPostgres && db.pool) {
      const tRes = await db.query('SELECT id, name, status, max_users FROM tenants WHERE id = ?', [tenant_id]);
      tenant = tRes.rows && tRes.rows.length > 0 ? tRes.rows[0] : null;
      if (tenant) {
        const cRes = await db.query('SELECT COUNT(*) as count FROM users WHERE tenant_id = ?', [tenant_id]);
        currentUsersCount = parseInt(cRes.rows[0]?.count || 0, 10);
      }
    } else {
      tenant = db.prepare('SELECT id, name, status, max_users FROM tenants WHERE id = ?').get(tenant_id);
      if (tenant) {
        currentUsersCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE tenant_id = ?').get(tenant_id)?.count || 0;
      }
    }

    if (!tenant) {
      return res.status(400).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'A empresa informada para vinculação não existe.'
      });
    }

    if (tenant.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: 'TENANT_INACTIVE',
        message: `Não é possível cadastrar operadores na empresa "${tenant.name}" pois seu status é ${tenant.status}.`
      });
    }

    const validRoles = [
      'SUPER_ADMIN',
      'ADMIN',
      'Admin',
      'GESTOR_TRAFEGO',
      'Gestor de Tráfego',
      'ANALISTA_MARKETING',
      'Analista de Marketing',
      'COORDENADOR_MARKETING',
      'Coordenador de Marketing',
      'VISUALIZADOR',
      'SUPORTE_INTERNO'
    ];
    let assignedRole = 'Gestor de Tráfego';
    if (role && validRoles.includes(role)) {
      assignedRole = role;
    }

    // Trava de segurança RBAC: Clientes (Tenants) nunca podem receber SUPER_ADMIN ou SUPORTE_INTERNO
    const normalizedTenant = String(tenant_id || '').trim();
    const isRoot = normalizedTenant === 'tenant-root-default' || !normalizedTenant;
    if (!isRoot && (assignedRole === 'SUPER_ADMIN' || assignedRole === 'SUPORTE_INTERNO')) {
      return res.status(400).json({
        success: false,
        error: 'FORBIDDEN_ROLE_FOR_TENANT',
        message: 'A role SUPER_ADMIN é exclusiva da plataforma VERSUS e não pode ser atribuída a clientes.'
      });
    }

    // Trava de limite de operadores contratados (max_users)
    if (currentUsersCount >= tenant.max_users) {
      return res.status(400).json({
        success: false,
        error: 'TENANT_USER_LIMIT_REACHED',
        message: `Limite de operadores excedido para a empresa "${tenant.name}". Capacidade contratada: ${tenant.max_users} usuários.`
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    let existing = null;
    if (db.isPostgres && db.pool) {
      const eRes = await db.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
      existing = eRes.rows && eRes.rows.length > 0 ? eRes.rows[0] : null;
    } else {
      existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    }

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'Já existe um usuário cadastrado com este e-mail.'
      });
    }

    const userId = `usr-${crypto.randomBytes(5).toString('hex')}`;
    const passwordHash = await hashPassword(password);

    if (db.isPostgres && db.pool) {
      await db.query(`
        INSERT INTO users (id, tenant_id, email, password_hash, access_password, name, role, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW())
      `, [userId, tenant_id, cleanEmail, passwordHash, password, name.trim(), assignedRole]);

      await db.query(`
        INSERT INTO export_quotas (user_id, daily_limit, monthly_limit, used_today, used_this_month, last_reset_date)
        VALUES (?, ?, ?, 0, 0, CURRENT_DATE)
      `, [userId, Number(daily_limit) || 500, Number(monthly_limit) || 5000]);
    } else {
      db.prepare(`
        INSERT INTO users (id, tenant_id, email, password_hash, access_password, name, role, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      `).run(userId, tenant_id, cleanEmail, passwordHash, password, name.trim(), assignedRole);

      const todayStr = new Date().toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO export_quotas (user_id, daily_limit, monthly_limit, used_today, used_this_month, last_reset_date)
        VALUES (?, ?, ?, 0, 0, ?)
      `).run(userId, Number(daily_limit) || 500, Number(monthly_limit) || 5000, todayStr);
    }

    const userData = {
      id: userId,
      tenant_id,
      tenant_name: tenant.name,
      email: cleanEmail,
      name: name.trim(),
      role: assignedRole,
      access_password: password,
      daily_limit: Number(daily_limit) || 500,
      monthly_limit: Number(monthly_limit) || 5000
    };

    return res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso.',
      data: userData,
      user: userData
    });
  } catch (err) {
    console.error('❌ Erro ao criar usuário no admin:', err);
    return res.status(500).json({ success: false, error: 'CREATE_USER_ERROR', message: err.message });
  }
}

/**
 * Atualiza dados e quotas de um usuário
 */
export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, email, password, role, is_active, daily_limit, monthly_limit, tenant_id } = req.body || {};

    let user = null;
    if (db.isPostgres && db.pool) {
      const uRes = await db.query('SELECT id, email, role, tenant_id FROM users WHERE id = ?', [id]);
      user = uRes.rows && uRes.rows.length > 0 ? uRes.rows[0] : null;
    } else {
      user = db.prepare('SELECT id, email, role, tenant_id FROM users WHERE id = ?').get(id);
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' });
    }

    // Proteção: Não permite desativar o próprio Super Admin logado
    if (req.user.id === id && (is_active === 0 || is_active === false)) {
      return res.status(400).json({
        success: false,
        error: 'CANNOT_DEACTIVATE_SELF',
        message: 'Você não pode desativar seu próprio usuário administrador.'
      });
    }

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name.trim()); }
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      let existingEmail = null;
      if (db.isPostgres && db.pool) {
        const eRes = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [normalizedEmail, id]);
        existingEmail = eRes.rows && eRes.rows.length > 0 ? eRes.rows[0] : null;
      } else {
        existingEmail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(normalizedEmail, id);
      }
      if (existingEmail) {
        return res.status(400).json({ success: false, error: 'EMAIL_ALREADY_EXISTS', message: 'Este e-mail já está sendo utilizado por outro usuário.' });
      }
      updates.push('email = ?');
      params.push(normalizedEmail);
    }
    if (password && password.trim().length >= 6) {
      const { hashPassword } = await import('../utils/security.js');
      const passwordHash = await hashPassword(password.trim());
      updates.push('password_hash = ?');
      params.push(passwordHash);
      updates.push('access_password = ?');
      params.push(password.trim());
    }
    const validRoles = [
      'SUPER_ADMIN', 'ADMIN', 'Admin', 'GESTOR_TRAFEGO', 'Gestor de Tráfego',
      'ANALISTA_MARKETING', 'Analista de Marketing', 'COORDENADOR_MARKETING',
      'Coordenador de Marketing', 'VISUALIZADOR', 'SUPORTE_INTERNO'
    ];
    if (role && validRoles.includes(role)) {
      const targetTenantId = tenant_id !== undefined ? tenant_id : user.tenant_id;
      const isTargetRoot = String(targetTenantId || '').trim() === 'tenant-root-default' || !targetTenantId;
      if (!isTargetRoot && (role === 'SUPER_ADMIN' || role === 'SUPORTE_INTERNO')) {
        return res.status(400).json({
          success: false,
          error: 'FORBIDDEN_ROLE_FOR_TENANT',
          message: 'As roles SUPER_ADMIN e SUPORTE_INTERNO são exclusivas da equipe interna da plataforma VERSUS e não podem ser atribuídas a clientes.'
        });
      }
      updates.push('role = ?'); params.push(role);
    }
    if (tenant_id) {
      let tenantCheck = null;
      if (db.isPostgres && db.pool) {
        const tcRes = await db.query('SELECT id FROM tenants WHERE id = ?', [tenant_id]);
        tenantCheck = tcRes.rows && tcRes.rows.length > 0;
      } else {
        tenantCheck = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenant_id);
      }
      if (tenantCheck) {
        updates.push('tenant_id = ?');
        params.push(tenant_id);
      }
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?'); params.push(is_active ? true : false);
    }

    if (updates.length > 0) {
      params.push(id);
      const updateSql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      if (db.isPostgres && db.pool) {
        await db.query(updateSql, params);
      } else {
        db.prepare(updateSql).run(...params);
      }
    }

    // Atualiza quotas se informado
    const finalDaily = daily_limit !== undefined ? daily_limit : req.body?.dailyQuota;
    const finalMonthly = monthly_limit !== undefined ? monthly_limit : req.body?.monthlyQuota;

    if (finalDaily !== undefined || finalMonthly !== undefined) {
      const qUpdates = [];
      const qParams = [];
      if (finalDaily !== undefined) { qUpdates.push('daily_limit = ?'); qParams.push(Number(finalDaily)); }
      if (finalMonthly !== undefined) { qUpdates.push('monthly_limit = ?'); qParams.push(Number(finalMonthly)); }
      qUpdates.push('updated_at = NOW()');
      qParams.push(id);
      const quotaSql = `UPDATE export_quotas SET ${qUpdates.join(', ')} WHERE user_id = ?`;
      if (db.isPostgres && db.pool) {
        await db.query(quotaSql, qParams);
      } else {
        db.prepare(quotaSql.replace('NOW()', 'CURRENT_TIMESTAMP')).run(...qParams);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Usuário atualizado com sucesso.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'UPDATE_USER_ERROR', message: err.message });
  }
}

/**
 * Redefine a senha de um usuário
 */
export async function resetUserPassword(req, res) {
  try {
    const { id } = req.params;
    const password = req.body?.password || req.body?.newPassword;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: 'A senha deve conter no mínimo 6 caracteres.'
      });
    }

    let user = null;
    if (db.isPostgres && db.pool) {
      const uRes = await db.query('SELECT id, email FROM users WHERE id = ?', [id]);
      user = uRes.rows && uRes.rows.length > 0 ? uRes.rows[0] : null;
    } else {
      user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' });
    }

    const passwordHash = await hashPassword(password);
    if (db.isPostgres && db.pool) {
      await db.query('UPDATE users SET password_hash = ?, access_password = ? WHERE id = ?', [passwordHash, password, id]);
    } else {
      db.prepare('UPDATE users SET password_hash = ?, access_password = ? WHERE id = ?').run(passwordHash, password, id);
    }

    return res.status(200).json({
      success: true,
      message: `Senha do usuário ${user.email} redefinida com sucesso.`
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'RESET_PASSWORD_ERROR', message: err.message });
  }
}

/**
 * Remove um usuário (exceto o próprio Super Admin)
 */
export async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return res.status(400).json({
        success: false,
        error: 'CANNOT_DELETE_SELF',
        message: 'Você não pode excluir seu próprio usuário.'
      });
    }

    let user = null;
    if (db.isPostgres && db.pool) {
      const uRes = await db.query('SELECT id, email FROM users WHERE id = ?', [id]);
      user = uRes.rows && uRes.rows.length > 0 ? uRes.rows[0] : null;
    } else {
      user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' });
    }

    if (db.isPostgres && db.pool) {
      try { await db.query('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?', [id]); } catch (e) {}
      await db.query('DELETE FROM export_quotas WHERE user_id = ?', [id]);
      await db.query('DELETE FROM users WHERE id = ?', [id]);
    } else {
      try { db.prepare('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?').run(id); } catch (e) {}
      db.prepare('DELETE FROM export_quotas WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    }

    return res.status(200).json({
      success: true,
      message: `Usuário ${user.email} removido com sucesso.`
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'DELETE_USER_ERROR', message: err.message });
  }
}

/**
 * Consulta de logs de auditoria e telemetria
 */
export async function getAuditLogs(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize || 30, 10)));
    const offset = (page - 1) * pageSize;
    const actionFilter = req.query.action;
    const tenantFilter = req.query.tenant_id || req.query.tenantId;

    let query = `
      SELECT a.*, t.name AS tenant_name
      FROM audit_logs a
      LEFT JOIN tenants t ON a.tenant_id = t.id
    `;
    const whereClauses = [];
    const params = [];

    if (actionFilter) {
      whereClauses.push('a.action = ?');
      params.push(actionFilter);
    }
    if (tenantFilter) {
      whereClauses.push('a.tenant_id = ?');
      params.push(tenantFilter);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, offset);

    let logs = [];
    if (db.isPostgres && db.pool) {
      const lRes = await db.query(query, params);
      logs = lRes.rows || [];
    } else {
      logs = db.prepare(query).all(...params);
    }

    let countQuery = 'SELECT COUNT(*) as total FROM audit_logs';
    const countParams = [];
    const countClauses = [];
    if (actionFilter) { countClauses.push('action = ?'); countParams.push(actionFilter); }
    if (tenantFilter) { countClauses.push('tenant_id = ?'); countParams.push(tenantFilter); }
    if (countClauses.length > 0) {
      countQuery += ` WHERE ${countClauses.join(' AND ')}`;
    }

    let total = 0;
    if (db.isPostgres && db.pool) {
      const cRes = await db.query(countQuery, countParams);
      total = parseInt(cRes.rows[0]?.total || 0, 10);
    } else {
      const totalRow = db.prepare(countQuery).get(...countParams);
      total = totalRow ? totalRow.total : 0;
    }

    return res.status(200).json({
      success: true,
      data: logs,
      logs: logs,
      total: total,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'AUDIT_LOGS_ERROR', message: err.message });
  }
}

/**
 * Retorna métricas analíticas e de governança para o cockpit do Admin
 */
export async function getAdminMetrics(req, res) {
  try {
    let totalUsers = 0;
    let activeUsers = 0;
    let totalAuditEvents = 0;
    let totalExportsToday = 0;
    let topActions = [];
    let recentLogs = [];

    if (db.isPostgres && db.pool) {
      const uTotal = await db.query('SELECT COUNT(*) as c FROM users');
      totalUsers = parseInt(uTotal.rows[0]?.c || 0, 10);

      const uActive = await db.query('SELECT COUNT(*) as c FROM users WHERE is_active = TRUE');
      activeUsers = parseInt(uActive.rows[0]?.c || 0, 10);

      const aTotal = await db.query('SELECT COUNT(*) as c FROM audit_logs');
      totalAuditEvents = parseInt(aTotal.rows[0]?.c || 0, 10);

      const eToday = await db.query("SELECT COALESCE(SUM(records_count), 0) as s FROM audit_logs WHERE action LIKE '%EXPORT%' AND created_at >= CURRENT_DATE");
      totalExportsToday = parseInt(eToday.rows[0]?.s || 0, 10);

      const tAct = await db.query(`
        SELECT action, COUNT(*) as count 
        FROM audit_logs 
        GROUP BY action 
        ORDER BY count DESC 
        LIMIT 5
      `);
      topActions = tAct.rows || [];

      const rLogs = await db.query(`
        SELECT id, user_email, action, endpoint, records_count, ip_address, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 8
      `);
      recentLogs = rLogs.rows || [];
    } else {
      totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get()?.c || 0;
      activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get()?.c || 0;
      totalAuditEvents = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get()?.c || 0;
      totalExportsToday = db.prepare("SELECT COALESCE(SUM(records_count), 0) as s FROM audit_logs WHERE action LIKE '%EXPORT%' AND date(created_at) = date('now')").get()?.s || 0;
      topActions = db.prepare(`
        SELECT action, COUNT(*) as count 
        FROM audit_logs 
        GROUP BY action 
        ORDER BY count DESC 
        LIMIT 5
      `).all();
      recentLogs = db.prepare(`
        SELECT id, user_email, action, endpoint, records_count, ip_address, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 8
      `).all();
    }

    return res.status(200).json({
      success: true,
      metrics: {
        totalUsers,
        activeUsers,
        totalAuditEvents,
        totalExportsToday,
        topActions,
        recentLogs
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'METRICS_ERROR', message: err.message });
  }
}
