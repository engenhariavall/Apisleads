/**
 * assertivaAuthService.js
 * INTEGRAÇÃO OFICIAL ASSERTIVA API v3 — MOTOR OAUTH2
 * 
 * Gerencia autenticação OAuth2 (Client Credentials) com a Assertiva Soluções:
 * - Endpoint: POST https://integracao.assertivasolucoes.com.br/v3/token
 * - Cabeçalho: Authorization: Basic base64(client_id:client_secret)
 * - Cache em memória com renovação proativa (buffer de 5 minutos antes da expiração)
 * - Previne requisições redundantes de autenticação e elimina gargalos de latência
 */

import '../config/env.js';

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
  tokenType: 'Bearer',
  scope: null
};

export const assertivaAuthService = {
  /**
   * Resolve as credenciais (Client ID e Client Secret)
   */
  resolveCredentials(customCreds = {}) {
    let clientId = customCreds.clientId || process.env.ASSERTIVA_CLIENT_ID || null;
    let clientSecret = customCreds.clientSecret || process.env.ASSERTIVA_CLIENT_SECRET || null;

    // Se a chave veio no formato "client_id:client_secret" via apiKey
    if ((!clientId || !clientSecret) && customCreds.apiKey) {
      if (customCreds.apiKey.includes(':')) {
        const [id, secret] = customCreds.apiKey.split(':');
        clientId = id.trim();
        clientSecret = secret.trim();
      }
    }

    // Fallback para BUREAU_API_KEY se estiver no formato "id:secret"
    if ((!clientId || !clientSecret) && process.env.BUREAU_API_KEY && process.env.BUREAU_API_KEY.includes(':')) {
      const [id, secret] = process.env.BUREAU_API_KEY.split(':');
      clientId = id.trim();
      clientSecret = secret.trim();
    }

    return {
      clientId,
      clientSecret,
      directApiKey: customCreds.apiKey || process.env.BUREAU_API_KEY || null
    };
  },

  /**
   * Retorna a URL de autenticação OAuth2
   */
  getAuthUrl() {
    return process.env.ASSERTIVA_AUTH_URL || 'https://integracao.assertivasolucoes.com.br/v3/token';
  },

  /**
   * Obtém token de acesso válido, reutilizando cache se não expirado
   * @param {Object} [options] Credenciais opcionais específicas
   * @returns {Promise<string|null>} Bearer Access Token
   */
  async getAccessToken(options = {}) {
    const now = Date.now();
    const safetyBufferMs = 5 * 60 * 1000; // 5 minutos de margem de segurança

    // 1. Se já temos token em cache e ainda faltam mais de 5 minutos para expirar
    if (tokenCache.accessToken && tokenCache.expiresAt > (now + safetyBufferMs) && !options.forceRefresh) {
      return tokenCache.accessToken;
    }

    const { clientId, clientSecret, directApiKey } = this.resolveCredentials(options);

    // Se não há Client ID e Client Secret mas temos uma apiKey direta que não é no formato id:secret
    if (!clientId || !clientSecret) {
      if (directApiKey && !directApiKey.includes(':')) {
        return directApiKey;
      }
      return null;
    }

    // 2. Solicita novo token de acesso via OAuth2 BasicAuth
    const authUrl = this.getAuthUrl();
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials'
        }).toString(),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [ASSERTIVA OAUTH2 ERROR ${response.status}]:`, errorText);
        throw new Error(`Falha de autenticação Assertiva OAuth2 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const accessToken = data.access_token || data.token;
      const expiresInSec = Number(data.expires_in) || 3600;

      if (!accessToken) {
        throw new Error('Assertiva OAuth2 retornou resposta sem access_token válido.');
      }

      // Atualiza o cache local em memória
      tokenCache = {
        accessToken,
        expiresAt: now + (expiresInSec * 1000),
        tokenType: data.token_type || 'Bearer',
        scope: data.scope || null
      };

      console.log(`🔒 [ASSERTIVA OAUTH2] Token renovado com sucesso. Válido por ${expiresInSec}s.`);
      return tokenCache.accessToken;

    } catch (err) {
      console.error('❌ [ASSERTIVA OAUTH2] Erro na requisição de token:', err.message);
      // Se tivermos um token anterior ainda não expirado, fallback temporário
      if (tokenCache.accessToken && tokenCache.expiresAt > now) {
        console.warn('⚠️ [ASSERTIVA OAUTH2] Utilizando token em cache residual.');
        return tokenCache.accessToken;
      }
      throw err;
    }
  },

  /**
   * Invalida o cache atual de token (útil para testes ou rotação forçada)
   */
  clearTokenCache() {
    tokenCache = {
      accessToken: null,
      expiresAt: 0,
      tokenType: 'Bearer',
      scope: null
    };
  }
};

export default assertivaAuthService;
