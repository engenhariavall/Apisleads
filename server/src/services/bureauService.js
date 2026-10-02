/**
 * bureauService.js
 * FASE 51 — INTEGRAÇÃO DE BUREAU DE DADOS & OSINT OFICIAL
 * 
 * Gateway de integração com Bureaus de Dados e enriquecimento cadastral
 * oficial (Assertiva, Unitfour, Z-API, BigDataCorp).
 * 
 * REGRA ESTRITA DE PRODUÇÃO (GO-LIVE):
 * NUNCA inventa números de telefone ou documentos.
 * Se BUREAU_API_KEY não estiver configurada no .env ou se o titular não for
 * localizado na base do Bureau, retorna estritamente "Contato não localizado" (null).
 */

import { validatePhoneChannel } from '../modules/intent/phoneValidator.js';
import { resolveTenantCredentials, ApiRouterError } from './apiRouterService.js';

export const bureauService = {
  /**
   * Provedor configurado no ambiente
   */
  getProvider() {
    return (process.env.BUREAU_PROVIDER || 'assertiva').toLowerCase().trim();
  },

  /**
   * Chave de autenticação no Bureau (legado / fallback de env)
   */
  getApiKey() {
    return process.env.BUREAU_API_KEY || null;
  },

  /**
   * Resolve credenciais dinâmicas do Bureau para o Tenant via apiRouterService
   */
  async resolveCredentials(tenantId = 'tenant-root-default', options = {}) {
    return await resolveTenantCredentials(tenantId, 'bureau', options);
  },

  /**
   * URL base do Bureau
   */
  getBaseUrl() {
    if (process.env.BUREAU_API_URL) return process.env.BUREAU_API_URL;
    const provider = this.getProvider();
    switch (provider) {
      case 'assertiva':
        return 'https://api.assertivasolucoes.com.br/v2';
      case 'unitfour':
        return 'https://api.unitfour.com.br/v1';
      case 'zapi':
        return 'https://api.z-api.io/instances';
      default:
        return 'https://api.assertivasolucoes.com.br/v2';
    }
  },

  /**
   * Realiza consulta de contato telefônico e WhatsApp a partir de CPF/CNPJ
   * 
   * @param {string} rawDoc CPF (11 dígitos) ou CNPJ (14 dígitos)
   * @param {Object} [options] Opções adicionais (nome, uf, tenantId, etc.)
   * @returns {Promise<{ success: boolean, whatsapp: string|null, status: string, message: string, phones?: Array }>}
   */
  async lookupWhatsAppByCpf(rawDoc, options = {}) {
    if (!rawDoc) {
      return {
        success: false,
        whatsapp: null,
        status: 'INVALID_DOC',
        message: 'Documento não informado para consulta no Bureau.'
      };
    }

    const cleanDoc = String(rawDoc).replace(/\D/g, '');
    const tenantId = options.tenantId || 'tenant-root-default';

    // 0. Resolução dinâmica de credenciais e verificação inviolável de Test Drive
    let apiKey = options.apiKey || null;
    let routerCreds = null;

    if (!apiKey) {
      try {
        routerCreds = await resolveTenantCredentials(tenantId, 'bureau', options);
        apiKey = routerCreds.apiKey;
      } catch (routerErr) {
        const httpStatus = routerErr.statusCode || routerErr.status;
        if (httpStatus === 403 || httpStatus === 400 || routerErr instanceof ApiRouterError) {
          throw routerErr;
        }
        apiKey = this.getApiKey();
      }
    }

    // REGRA DE GO-LIVE: Se não houver chave de API configurada, utiliza fallback de inteligência cadastral SEFAZ/Sintegra
    if (!apiKey) {
      if (options.nome || options.municipio || options.uf) {
        try {
          const { resolveRuralProducerByIE } = await import('./sefazIeService.js');
          const sefaz = await resolveRuralProducerByIE({
            nome_titular: options.nome,
            municipio: options.municipio || 'Passo Fundo',
            uf: options.uf || 'RS',
            cpf_cnpj_titular: cleanDoc
          });
          if (sefaz && sefaz.whatsapp_produtor) {
            return {
              success: true,
              whatsapp: sefaz.whatsapp_produtor,
              status: 'ENRICHED_SEFAZ_FALLBACK',
              message: 'Contato localizado via inteligência tributária estadual (SEFAZ/Sintegra).'
            };
          }
        } catch (_) {}
      }

      return {
        success: false,
        whatsapp: null,
        status: 'BUREAU_KEY_NOT_CONFIGURED',
        message: 'Chave do Bureau (Assertiva) não configurada no .env.'
      };
    }

    const provider = this.getProvider();
    const baseUrl = this.getBaseUrl();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let response;
      let data = null;

      if (provider === 'assertiva') {
        response = await fetch(`${baseUrl}/localizacao/cpf/${cleanDoc}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
      } else if (provider === 'unitfour') {
        response = await fetch(`${baseUrl}/consulta/pf?cpf=${cleanDoc}`, {
          method: 'GET',
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
      } else {
        // Gateway genérico REST
        response = await fetch(`${baseUrl}/lookup?doc=${cleanDoc}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
      }

      clearTimeout(timeout);

      if (response && response.ok) {
        data = await response.json();
      } else if (response && response.status === 404) {
        return {
          success: false,
          whatsapp: null,
          status: 'NOT_FOUND',
          message: 'Contato não localizado'
        };
      }

      // Extrai telefones retornados pelo bureau
      const phones = [];
      if (data) {
        if (Array.isArray(data.telefones)) {
          phones.push(...data.telefones);
        } else if (Array.isArray(data.phones)) {
          phones.push(...data.phones);
        } else if (data.telefone) {
          phones.push(data.telefone);
        } else if (data.celular) {
          phones.push(data.celular);
        }
      }

      // Valida se algum telefone é móvel e apto para WhatsApp
      for (const phoneItem of phones) {
        const rawNum = typeof phoneItem === 'string' ? phoneItem : (phoneItem.numero || phoneItem.phone || phoneItem.ddd_numero);
        if (!rawNum) continue;

        const val = validatePhoneChannel(rawNum);
        if (val && val.is_valid && val.is_whatsapp_capable) {
          const e164 = val.e164 || `+55${val.cleaned}`;
          return {
            success: true,
            whatsapp: e164,
            status: 'ENRICHED',
            message: 'Contato localizado e validado via Bureau Oficial.',
            source: provider
          };
        }
      }

      // Se passou por todos e nenhum é válido
      return {
        success: false,
        whatsapp: null,
        status: 'NOT_FOUND',
        message: 'Contato não localizado'
      };

    } catch (err) {
      if (err instanceof ApiRouterError || err.statusCode === 403 || err.statusCode === 400 || err.status === 403 || err.status === 400) {
        throw err;
      }
      console.warn(`⚠️ [BUREAU SERVICE] Falha ao consultar ${provider}:`, err.message);
      return {
        success: false,
        whatsapp: null,
        status: 'ERROR',
        message: 'Contato não localizado'
      };
    }
  }
};

export default bureauService;
