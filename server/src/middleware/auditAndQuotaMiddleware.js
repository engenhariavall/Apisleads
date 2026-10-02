/**
 * server/src/middleware/auditAndQuotaMiddleware.js
 * 
 * FASE 26 — ETAPA 3: INTERCEPTOR DE AUDITORIA & ENFORCEMENT DE QUOTAS
 * 
 * Funcionalidades:
 * 1. auditLogger(actionName):
 *    - Registra de forma não-bloqueante no audit_logs quem executou a ação,
 *      endpoint, parâmetros, quantidade de registros e metadados de rede.
 * 2. enforceExportQuota:
 *    - Verifica as quotas de exportação do usuário autenticado.
 *    - Se o usuário ultrapassou daily_limit ou monthly_limit, retorna HTTP 429 com aviso explicativo.
 *    - Desconta a quantidade de leads exportados de forma atômica após o envio bem-sucedido.
 */

import crypto from 'crypto';
import db from '../config/database.js';

/**
 * Normaliza e reseta quotas diárias/mensais automaticamente com base na data atual
 * @param {string} userId ID do usuário
 * @returns {Object} Quota atualizada
 */
export function getAndSyncUserQuota(userId) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7); // YYYY-MM

  let quota = db.prepare('SELECT * FROM export_quotas WHERE user_id = ?').get(userId);

  if (!quota) {
    // Inicializa quota padrão se não existir
    db.prepare(`
      INSERT INTO export_quotas (user_id, daily_limit, monthly_limit, used_today, used_this_month, last_reset_date)
      VALUES (?, 500, 5000, 0, 0, ?)
    `).run(userId, todayStr);
    quota = db.prepare('SELECT * FROM export_quotas WHERE user_id = ?').get(userId);
  }

  const lastReset = quota.last_reset_date || '';
  const lastResetMonth = lastReset.slice(0, 7);

  let needUpdate = false;
  let newUsedToday = quota.used_today;
  let newUsedThisMonth = quota.used_this_month;

  // Se mudou o dia, reseta consumo diário
  if (lastReset !== todayStr) {
    newUsedToday = 0;
    needUpdate = true;
  }

  // Se mudou o mês, reseta consumo mensal
  if (lastResetMonth !== currentMonthStr) {
    newUsedThisMonth = 0;
    needUpdate = true;
  }

  if (needUpdate) {
    db.prepare(`
      UPDATE export_quotas 
      SET used_today = ?, used_this_month = ?, last_reset_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(newUsedToday, newUsedThisMonth, todayStr, userId);

    quota.used_today = newUsedToday;
    quota.used_this_month = newUsedThisMonth;
    quota.last_reset_date = todayStr;
  }

  return quota;
}

/**
 * Middleware que intercepta e aplica o limite de quotas antes da exportação
 */
export function enforceExportQuota(req, res, next) {
  // Se for anônimo (dev local sem login), permite com quota virtual de segurança
  if (!req.user || !req.user.id) {
    return next();
  }

  // Super Admin possui isenção de bloqueio de quotas
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  try {
    const quota = getAndSyncUserQuota(req.user.id);
    const requestedCount = req.estimatedExportCount || 1;

    // 1. Checa limite diário
    if (quota.used_today + requestedCount > quota.daily_limit) {
      const remainingToday = Math.max(0, quota.daily_limit - quota.used_today);
      return res.status(429).json({
        success: false,
        error: 'DAILY_QUOTA_EXCEEDED',
        message: `Limite diário de exportação atingido. Você já utilizou ${quota.used_today} de ${quota.daily_limit} créditos hoje. Saldo restante: ${remainingToday}. Contate o Administrador Master para expansão de quota.`,
        quota: {
          daily_limit: quota.daily_limit,
          used_today: quota.used_today,
          remaining_today: remainingToday
        }
      });
    }

    // 2. Checa limite mensal
    if (quota.used_this_month + requestedCount > quota.monthly_limit) {
      const remainingMonth = Math.max(0, quota.monthly_limit - quota.used_this_month);
      return res.status(429).json({
        success: false,
        error: 'MONTHLY_QUOTA_EXCEEDED',
        message: `Limite mensal de exportação atingido. Você já utilizou ${quota.used_this_month} de ${quota.monthly_limit} créditos neste mês. Contate o Administrador Master para expansão de quota.`,
        quota: {
          monthly_limit: quota.monthly_limit,
          used_this_month: quota.used_this_month,
          remaining_this_month: remainingMonth
        }
      });
    }

    next();
  } catch (err) {
    console.error('❌ Erro no enforcement de quota:', err);
    next();
  }
}

/**
 * Debita créditos de exportação do usuário autenticado de forma atômica
 * @param {string} userId ID do usuário
 * @param {number} count Quantidade de leads exportados
 */
export function consumeExportQuota(userId, count) {
  if (!userId || !count || count <= 0) return;
  try {
    db.prepare(`
      UPDATE export_quotas
      SET used_today = used_today + ?,
          used_this_month = used_this_month + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(count, count, userId);
  } catch (err) {
    console.error('❌ Falha ao debitar quota de exportação:', err.message);
  }
}

/**
 * Analisador leve de User-Agent via Regex para telemetria executiva
 * Formata strings legíveis como: "Chrome / Windows 10", "Safari / macOS", "Firefox / Linux", "Edge / Windows 10"
 * @param {string} rawUa
 * @returns {string}
 */
export function formatUserAgent(rawUa) {
  if (!rawUa || typeof rawUa !== 'string') return 'Desconhecido';
  const ua = rawUa.trim();
  if (!ua) return 'Desconhecido';

  // 1. Detecta Sistema Operacional
  let os = 'Outro';
  if (/windows nt 10\.0/i.test(ua)) os = 'Windows 10';
  else if (/windows nt 6\.3/i.test(ua)) os = 'Windows 8.1';
  else if (/windows nt 6\.2/i.test(ua)) os = 'Windows 8';
  else if (/windows nt 6\.1/i.test(ua)) os = 'Windows 7';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/iphone/i.test(ua)) os = 'iOS (iPhone)';
  else if (/ipad/i.test(ua)) os = 'iOS (iPad)';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  // 2. Detecta Navegador ou Cliente HTTP
  let browser = 'Navegador';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/postmanruntime/i.test(ua)) browser = 'Postman';
  else if (/curl/i.test(ua)) browser = 'cURL';
  else if (/axios/i.test(ua)) browser = 'Axios';
  else if (/node/i.test(ua)) browser = 'Node.js';

  return `${browser} / ${os}`;
}

/**
 * Middleware genérico para registrar log de auditoria ao concluir uma requisição
 * @param {string} actionName Nome da ação (ex: 'LEADS_FILTER', 'LEADS_EXPORT', 'COMPETITOR_LOOKUP')
 */
export function auditLogger(actionName) {
  return (req, res, next) => {
    const startTime = process.hrtime();

    res.on('finish', () => {
      // Registra telemetria de forma não-bloqueante
      setImmediate(() => {
        try {
          const diff = process.hrtime(startTime);
          const latencyMs = Math.round((diff[0] * 1e3 + diff[1] * 1e-6) * 10) / 10;
          const statusCode = res.statusCode || 200;

          const tenantId = req.user ? (req.user.tenant_id || 'tenant-root-default') : 'tenant-root-default';
          const userId = req.user ? req.user.id : null;
          const userEmail = req.user ? req.user.email : 'anonymous';
          const ip = req.headers['x-forwarded-for'] || req.ip || '127.0.0.1';
          const rawUserAgent = req.headers['user-agent'] || 'Unknown';
          const userAgent = formatUserAgent(rawUserAgent);
          const endpoint = req.originalUrl || req.url;

          // Extrai parâmetros seguros (omitindo senhas e tokens)
          const queryParams = {
            query: req.query || {},
            body: { ...(req.body || {}) }
          };
          delete queryParams.body.password;
          delete queryParams.body.token;

          let recordsCount = 0;
          if (req.exportedCount) {
            recordsCount = req.exportedCount;
          } else if (req.body && Array.isArray(req.body.lead_ids)) {
            recordsCount = req.body.lead_ids.length;
          }

          const logId = `log-${crypto.randomBytes(6).toString('hex')}`;
          db.prepare(`
            INSERT INTO audit_logs (id, tenant_id, user_id, user_email, action, endpoint, query_params, records_count, ip_address, user_agent, status_code, latency_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(
            logId,
            tenantId,
            userId,
            userEmail,
            actionName,
            endpoint,
            JSON.stringify(queryParams),
            recordsCount,
            String(ip).slice(0, 50),
            String(userAgent).slice(0, 255),
            statusCode,
            latencyMs
          );
        } catch (err) {
          // Auditoria não derruba a resposta da API
        }
      });
    });

    next();
  };
}
