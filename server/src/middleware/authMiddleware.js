/**
 * server/src/middleware/authMiddleware.js
 * 
 * FASE 26 — ETAPA 2: MIDDLEWARES DE AUTENTICAÇÃO & RBAC
 * 
 * Papéis suportados (Role-Based Access Control):
 * - SUPER_ADMIN: Acesso irrestrito a configurações, gestão de usuários, logs e quotas.
 * - GESTOR_TRAFEGO: Acesso total à inteligência, geocodificação, buscas e exportações limitadas por quota.
 * - VISUALIZADOR: Acesso apenas de consulta e visualização analítica, com bloqueio estrito de exportações brutas (HTTP 403).
 */

import { verifyJwt } from '../utils/security.js';
import db from '../config/database.js';

/**
 * Extrai o token JWT do header Authorization (Bearer token) ou de cookies
 */
export function extractToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // Fallback para cookie se houver
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)versus_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

/**
 * Middleware de Autenticação Obrigatória
 * Injeta req.user = { id, email, name, role }
 */
export function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Acesso negado. Token de autenticação não fornecido no header Authorization (Bearer <token>).'
    });
  }

  const payload = verifyJwt(token);

  if (!payload || !payload.id) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token de autenticação inválido ou expirado. Realize o login novamente.'
    });
  }

  // Verifica se o usuário ainda existe e está ativo no banco
  try {
    const user = db.prepare(`
      SELECT u.id, u.tenant_id, t.status AS tenant_status, u.email, u.name, u.role, u.is_active 
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = ?
    `).get(payload.id);

    if (!user || user.is_active !== 1) {
      return res.status(401).json({
        success: false,
        error: 'USER_INACTIVE',
        message: 'A conta do usuário foi desativada ou não existe mais.'
      });
    }

    if (user.tenant_status && user.tenant_status !== 'ACTIVE' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'TENANT_SUSPENDED',
        message: 'O acesso da sua empresa está suspenso. Contate o administrador master.'
      });
    }

    req.user = {
      id: user.id,
      tenant_id: user.tenant_id || 'tenant-root-default',
      email: user.email,
      name: user.name,
      role: user.role
    };

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'AUTH_DATABASE_ERROR',
      message: 'Erro interno ao validar credenciais do usuário.'
    });
  }
}

/**
 * Resolve com segurança o tenant_id da requisição:
 * - Se o usuário logado for SUPER_ADMIN, permite chavear via header 'x-tenant-id', query ou body.
 * - Para outros usuários autenticados, impõe estritamente o tenant_id associado ao seu cadastro no banco.
 * - Para acessos anônimos / públicos, utiliza o header 'x-tenant-id' ou fallback para 'tenant-root-default'.
 */
export function getTenantFromRequest(req) {
  const headerTenant = req?.headers ? (req.headers['x-tenant-id'] || req.headers['X-Tenant-ID'] || req.headers['tenant-id']) : null;
  const paramTenant = req?.query?.tenant_id || req?.body?.tenant_id || null;

  if (req?.user) {
    if (req.user.role === 'SUPER_ADMIN') {
      return headerTenant || paramTenant || req.user.tenant_id || 'tenant-root-default';
    }
    return req.user.tenant_id || 'tenant-root-default';
  }

  return headerTenant || paramTenant || 'tenant-root-default';
}

/**
 * Middleware opcional de autenticação: se houver token válido, preenche req.user, senão segue como anônimo
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  const payload = verifyJwt(token);
  if (payload && payload.id) {
    try {
      const user = db.prepare('SELECT id, tenant_id, email, name, role, is_active FROM users WHERE id = ?').get(payload.id);
      if (user && user.is_active === 1) {
        req.user = {
          id: user.id,
          tenant_id: user.tenant_id || 'tenant-root-default',
          email: user.email,
          name: user.name,
          role: user.role
        };
      } else {
        req.user = null;
      }
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

/**
 * Middleware de Controle de Acesso por Papel (RBAC)
 * @param {string[]} allowedRoles Lista de papéis autorizados (ex: ['SUPER_ADMIN', 'GESTOR_TRAFEGO'])
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Acesso negado. Autenticação obrigatória.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_ROLE',
        message: `Acesso proibido. Seu perfil (${req.user.role}) não possui privilégios suficientes para executar esta operação. Permissões necessárias: [${allowedRoles.join(', ')}].`
      });
    }

    next();
  };
}

/**
 * Middleware de Blindagem Específica contra Exportação do perfil VISUALIZADOR
 */
export function blockViewerExports(req, res, next) {
  if (req.user && req.user.role === 'VISUALIZADOR') {
    return res.status(403).json({
      success: false,
      error: 'EXPORTS_FORBIDDEN_FOR_VIEWER',
      message: 'Acesso negado. Usuários com perfil "VISUALIZADOR" têm permissão restrita para consulta analítica na tela e não podem exportar bases de dados ou arquivos de tráfego.'
    });
  }
  next();
}
