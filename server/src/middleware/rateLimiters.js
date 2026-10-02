import rateLimit from 'express-rate-limit';

/**
 * Rate Limiter Global para mitigar abuso/DDoS na API
 * Máximo de 300 requisições por minuto por IP
 */
export const globalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 300,
  standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
  legacyHeaders: false,  // Desativa headers legados `X-RateLimit-*`
  message: {
    error: 'Limite de requisições excedido',
    message: 'Muitas requisições originadas deste IP. Por favor, aguarde 1 minuto.',
    status: 429
  },
  skip: (req) => {
    // Não limita rotas de healthcheck para evitar falsos-positivos em probes do Docker/Nginx
    return req.path === '/health' || req.path === '/api/health';
  }
});

/**
 * Rate Limiter Estrito para Rotas de Consulta Externa e Geocodificação
 * Máximo de 20 requisições a cada 15 minutos por IP
 * Protege contra rate limit exhaustion nas APIs públicas da Receita Federal e OpenStreetMap
 */
export const externalLookupRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Limite de consultas externas atingido',
    message: 'Você atingiu o limite de consultas a APIs governamentais/cartográficas (20 consultas a cada 15 minutos). Aguarde para realizar novas buscas.',
    status: 429
  }
});
