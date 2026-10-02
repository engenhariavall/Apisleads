import cors from 'cors';

/**
 * Utilitário de conversão de padrão wildcard (*.dominio.com) para RegExp
 */
function wildcardToRegExp(pattern) {
  const escaped = pattern
    .trim()
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Cria o middleware CORS parametrizado e dinâmico
 */
export function configureCors() {
  const isProd = process.env.NODE_ENV === 'production';
  const rawOrigins = process.env.CORS_ORIGIN || '';

  // Lista de origens permitidas
  const allowedPatterns = rawOrigins
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(p => wildcardToRegExp(p));

  const corsOptions = {
    origin: (origin, callback) => {
      // 1. Permite requisições sem origin (ex: mobile apps, curl, healthcheck, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // 2. Em ambiente de desenvolvimento, aceita requisições locais automaticamente
      if (!isProd) {
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
          return callback(null, true);
        }
      }

      // 3. Valida contra os padrões permitidos de produção (inclui wildcards da Vercel)
      const isAllowed = allowedPatterns.some(regex => regex.test(origin));

      if (isAllowed) {
        return callback(null, true);
      }

      // Se nenhum padrão foi configurado em desenvolvimento, permite com aviso
      if (allowedPatterns.length === 0 && !isProd) {
        return callback(null, true);
      }

      const err = new Error(`Origem não permitida pela política de CORS: ${origin}`);
      err.status = 403;
      return callback(err);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    maxAge: 86400 // Cache de preflight por 24 horas
  };

  return cors(corsOptions);
}
