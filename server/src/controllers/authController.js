/**
 * server/src/controllers/authController.js
 * 
 * FASE 26 — ETAPA 2: CONTROLLER DE AUTENTICAÇÃO E SESSÃO
 * 
 * Endpoints:
 * - POST /api/auth/login: Autentica usuário com e-mail e senha, emite JWT e registra auditoria
 * - GET  /api/auth/me: Retorna dados do usuário autenticado e suas quotas atuais
 * - POST /api/auth/logout: Finaliza sessão
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { verifyPassword, signJwt } from '../utils/security.js';
import { formatUserAgent } from '../middleware/auditAndQuotaMiddleware.js';

/**
 * Login de usuário
 */
export async function login(req, res) {
  const start = process.hrtime();
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CREDENTIALS_PAYLOAD',
        message: 'Por favor, informe e-mail e senha para autenticação.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos.'
      });
    }

    if (user.is_active !== 1) {
      return res.status(403).json({
        success: false,
        error: 'USER_DEACTIVATED',
        message: 'Esta conta de usuário foi inativada pelo Administrador Master.'
      });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      // Registra tentativa falha de auditoria
      try {
        const diff = process.hrtime(start);
        const latencyMs = Math.round((diff[0] * 1e3 + diff[1] * 1e-6) * 10) / 10;
        const formattedUa = formatUserAgent(req.headers['user-agent'] || 'Unknown');
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, user_email, action, endpoint, query_params, ip_address, user_agent, status_code, latency_ms)
          VALUES (?, ?, ?, 'LOGIN_FAILED', '/api/auth/login', '{"reason":"bad_password"}', ?, ?, 401, ?)
        `).run(`log-${crypto.randomBytes(6).toString('hex')}`, user.id, user.email, req.ip || '127.0.0.1', formattedUa, latencyMs);
      } catch {}

      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos.'
      });
    }

    // Atualiza last_login_at
    db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    // Busca dados do Tenant associado
    const tenant = db.prepare('SELECT id, name, plan, status, allowed_niches FROM tenants WHERE id = ?').get(user.tenant_id || 'tenant-root-default') || {
      id: 'tenant-root-default',
      name: 'VERSUS INTELLIGENCE (ROOT)',
      plan: 'ENTERPRISE UNLIMITED',
      status: 'ACTIVE',
      allowed_niches: '["agro","b2b","saude"]'
    };

    let allowedNiches = ['agro', 'b2b', 'saude'];
    try {
      if (tenant.allowed_niches) allowedNiches = JSON.parse(tenant.allowed_niches);
    } catch (e) {}

    if (tenant.status !== 'ACTIVE' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'TENANT_SUSPENDED',
        message: 'O acesso da sua empresa está suspenso. Contate o administrador master.'
      });
    }

    // Emite Token JWT válido por 24 horas (86.400 segundos) com tenant_id
    const token = signJwt(
      {
        id: user.id,
        tenant_id: tenant.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      process.env.JWT_SECRET || 'versus_default_master_secret_2026',
      86400
    );

    // Busca quotas do usuário
    const quota = db.prepare('SELECT daily_limit, monthly_limit, used_today, used_this_month FROM export_quotas WHERE user_id = ?').get(user.id) || {
      daily_limit: 500,
      monthly_limit: 5000,
      used_today: 0,
      used_this_month: 0
    };

    // Registra log de login bem-sucedido com tenant_id
    try {
      const diff = process.hrtime(start);
      const latencyMs = Math.round((diff[0] * 1e3 + diff[1] * 1e-6) * 10) / 10;
      const formattedUa = formatUserAgent(req.headers['user-agent'] || 'Unknown');
      db.prepare(`
        INSERT INTO audit_logs (id, tenant_id, user_id, user_email, action, endpoint, query_params, ip_address, user_agent, status_code, latency_ms)
        VALUES (?, ?, ?, ?, 'LOGIN_SUCCESS', '/api/auth/login', '{"auth":"jwt"}', ?, ?, 200, ?)
      `).run(`log-${crypto.randomBytes(6).toString('hex')}`, tenant.id, user.id, user.email, req.ip || '127.0.0.1', formattedUa, latencyMs);
    } catch {}

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        email: user.email,
        name: user.name,
        role: user.role,
        allowed_niches: allowedNiches,
        last_login_at: user.last_login_at
      },
      quota: {
        daily_limit: quota.daily_limit,
        monthly_limit: quota.monthly_limit,
        used_today: quota.used_today,
        used_this_month: quota.used_this_month,
        remaining_today: Math.max(0, quota.daily_limit - quota.used_today)
      },
      expiresIn: '24h'
    });
  } catch (err) {
    console.error('❌ Erro no login:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_AUTH_ERROR',
      message: 'Falha interna ao processar autenticação.'
    });
  }
}

/**
 * Retorna os dados do usuário autenticado atual com dados do tenant
 */
export async function getMe(req, res) {
  try {
    const user = db.prepare(`
      SELECT u.id, u.tenant_id, t.name AS tenant_name, t.plan AS tenant_plan, t.status AS tenant_status, t.allowed_niches,
             u.email, u.name, u.role, u.is_active, u.created_at, u.last_login_at
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' });
    }

    try {
      user.allowed_niches = JSON.parse(user.allowed_niches || '["agro","b2b","saude"]');
    } catch (e) {
      user.allowed_niches = ['agro', 'b2b', 'saude'];
    }

    const quota = db.prepare('SELECT daily_limit, monthly_limit, used_today, used_this_month, last_reset_date FROM export_quotas WHERE user_id = ?').get(user.id) || {
      daily_limit: 500,
      monthly_limit: 5000,
      used_today: 0,
      used_this_month: 0
    };

    return res.status(200).json({
      success: true,
      user,
      quota: {
        daily_limit: quota.daily_limit,
        monthly_limit: quota.monthly_limit,
        used_today: quota.used_today,
        used_this_month: quota.used_this_month,
        remaining_today: Math.max(0, quota.daily_limit - quota.used_today)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'GET_ME_ERROR', message: err.message });
  }
}

/**
 * Logout de usuário (limpeza de auditoria)
 */
export async function logout(req, res) {
  if (req.user) {
    try {
      const formattedUa = formatUserAgent(req.headers['user-agent'] || 'Unknown');
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, user_email, action, endpoint, query_params, ip_address, user_agent, status_code, latency_ms)
        VALUES (?, ?, ?, 'LOGOUT', '/api/auth/logout', '{}', ?, ?, 200, 1.0)
      `).run(`log-${crypto.randomBytes(6).toString('hex')}`, req.user.id, req.user.email, req.ip || '127.0.0.1', formattedUa);
    } catch {}
  }

  return res.status(200).json({
    success: true,
    message: 'Sessão encerrada com sucesso.'
  });
}
