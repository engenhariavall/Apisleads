/**
 * server/src/services/apiRouterService.js
 * 
 * FASE 59 — ETAPA 2: MOTOR DE ROTEAMENTO DINÂMICO DE APIS & TEST DRIVE
 * 
 * Cérebro de decisão em milissegundos que resolve, valida e fornece as credenciais ativas
 * (Chave Mestre do Host vs. Chave Local do Tenant) para os três serviços essenciais:
 * 1. 'openai' (Copiloto de IA)
 * 2. 'meta' (Meta Ads / Graph API)
 * 3. 'bureau' (Enriquecimento de Dados B2B / WhatsApp)
 * 
 * Implementa interceptação temporal estrita:
 * - Se `use_master_key` for TRUE: compara test_drive_expires_at com a data UTC atual.
 *   - Se expirado: dispara erro estruturado `TEST_DRIVE_EXPIRED` (HTTP 403).
 *   - Se ativo: desencripta e retorna a Chave Mestre do Host.
 * - Se `use_master_key` for FALSE: desencripta e retorna a Chave Local do Tenant.
 *   - Se a chave local estiver ausente: dispara erro `TENANT_KEY_MISSING` (HTTP 400).
 */

import { getHostMasterSettings, getTenantApiConfig } from './apiConfigService.js';

export const SUPPORTED_SERVICES = Object.freeze(['openai', 'meta', 'bureau']);

/**
 * Erro customizado estruturado para falhas do motor de roteamento de credenciais
 */
export class ApiRouterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ApiRouterError';
    this.code = code;
    this.status = details.status || (code === 'TEST_DRIVE_EXPIRED' ? 403 : (code === 'TENANT_KEY_MISSING' ? 400 : 500));
    this.statusCode = this.status;
    this.serviceType = details.serviceType;
    this.tenantId = details.tenantId;
    this.friendlyMessage = details.friendlyMessage || message;
    this.details = details;
  }

  toJSON() {
    return {
      success: false,
      error: this.code,
      message: this.friendlyMessage,
      service_type: this.serviceType,
      tenant_id: this.tenantId,
      status: this.status,
      details: this.details
    };
  }
}

/**
 * Resolve e retorna as credenciais corretas para o tenant e serviço especificados
 * 
 * @param {string} tenantId Identificador do tenant requisitante
 * @param {'openai'|'meta'|'bureau'} serviceType Nome do serviço de API
 * @param {Object} [options] Opções de execução e injeção de relógio para testes
 * @param {Date|string|number} [options.now] Sobrescreve a data/hora atual (para testes de expiração)
 * @returns {Promise<Object>} Credenciais resolvidas com metadados de auditoria e origem
 */
export async function resolveTenantCredentials(tenantId, serviceType, options = {}) {
  // 1. Validação estrita do serviceType
  const service = String(serviceType || '').toLowerCase().trim();
  if (!SUPPORTED_SERVICES.includes(service)) {
    throw new ApiRouterError(
      'INVALID_SERVICE_TYPE',
      `Serviço "${serviceType}" não suportado. Serviços válidos: ${SUPPORTED_SERVICES.join(', ')}.`,
      { status: 400, serviceType }
    );
  }

  // 2. Normalização do tenantId (fallback para tenant-root-default)
  const targetTenantId = tenantId ? String(tenantId).trim() : 'tenant-root-default';

  // 3. Obtenção das configurações do tenant com chaves já desencriptadas
  const tenantConfig = await getTenantApiConfig(targetTenantId);
  if (!tenantConfig) {
    throw new ApiRouterError(
      'TENANT_NOT_FOUND',
      `Configuração de APIs não localizada para o inquilino "${targetTenantId}".`,
      { status: 404, tenantId: targetTenantId, serviceType: service }
    );
  }

  const useMaster = Boolean(tenantConfig.use_master_key);
  const now = options.now ? new Date(options.now) : new Date();

  // 4. RAMIFICAÇÃO TEST DRIVE (USO DE CHAVE MESTRE DO HOST)
  if (useMaster) {
    const expiresAt = tenantConfig.test_drive_expires_at ? new Date(tenantConfig.test_drive_expires_at) : null;
    const isExpired = !expiresAt || isNaN(expiresAt.getTime()) || (now.getTime() >= expiresAt.getTime());

    // Se o prazo do Test Drive estiver vencido: BLOQUEIO IMEDIATO E INVIOLÁVEL
    if (isExpired) {
      throw new ApiRouterError(
        'TEST_DRIVE_EXPIRED',
        'O seu Test Drive expirou. Contate o suporte para ativar as suas próprias chaves e continuar a faturar.',
        {
          status: 403,
          tenantId: targetTenantId,
          serviceType: service,
          expiredAt: expiresAt ? expiresAt.toISOString() : null,
          currentDate: now.toISOString(),
          friendlyMessage: 'O seu Test Drive expirou. Contate o suporte para ativar as suas próprias chaves e continuar a faturar.'
        }
      );
    }

    // Prazo válido: busca as credenciais Mestre do Host (desencriptadas)
    const masterSettings = await getHostMasterSettings();

    if (service === 'openai') {
      const masterKey = masterSettings.master_openai_key;
      if (!masterKey || masterKey.trim() === '') {
        throw new ApiRouterError(
          'MASTER_KEY_MISSING',
          'Chave Mestre da OpenAI não configurada no Host.',
          { status: 500, serviceType: service, tenantId: targetTenantId }
        );
      }
      return {
        serviceType: 'openai',
        source: 'MASTER',
        isMasterKey: true,
        isTestDrive: true,
        apiKey: masterKey,
        credentials: { apiKey: masterKey },
        expiresAt: tenantConfig.test_drive_expires_at,
        tenantId: targetTenantId
      };
    }

    if (service === 'meta') {
      const masterAppId = masterSettings.master_meta_app_id;
      const masterToken = masterSettings.master_meta_token;
      if (!masterToken || masterToken.trim() === '') {
        throw new ApiRouterError(
          'MASTER_KEY_MISSING',
          'Token Mestre da Meta Ads API não configurado no Host.',
          { status: 500, serviceType: service, tenantId: targetTenantId }
        );
      }
      return {
        serviceType: 'meta',
        source: 'MASTER',
        isMasterKey: true,
        isTestDrive: true,
        appId: masterAppId || null,
        token: masterToken,
        accessToken: masterToken,
        credentials: { appId: masterAppId || null, token: masterToken, accessToken: masterToken },
        expiresAt: tenantConfig.test_drive_expires_at,
        tenantId: targetTenantId
      };
    }

    if (service === 'bureau') {
      const masterBureauKey = masterSettings.master_bureau_key;
      if (!masterBureauKey || masterBureauKey.trim() === '') {
        throw new ApiRouterError(
          'MASTER_KEY_MISSING',
          'Chave Mestre do Bureau de Dados não configurada no Host.',
          { status: 500, serviceType: service, tenantId: targetTenantId }
        );
      }
      return {
        serviceType: 'bureau',
        source: 'MASTER',
        isMasterKey: true,
        isTestDrive: true,
        apiKey: masterBureauKey,
        credentials: { apiKey: masterBureauKey },
        expiresAt: tenantConfig.test_drive_expires_at,
        tenantId: targetTenantId
      };
    }
  }

  // 5. RAMIFICAÇÃO CHAVE LOCAL (PRODUÇÃO DO CLIENTE / use_master_key = FALSE)
  if (service === 'openai') {
    const localKey = tenantConfig.openai_key;
    if (!localKey || localKey.trim() === '') {
      throw new ApiRouterError(
        'TENANT_KEY_MISSING',
        'Chave local da OpenAI não configurada para este inquilino.',
        {
          status: 400,
          tenantId: targetTenantId,
          serviceType: service,
          friendlyMessage: 'Chave da OpenAI não configurada para a sua empresa. Acesse as configurações para inseri-la.'
        }
      );
    }
    return {
      serviceType: 'openai',
      source: 'TENANT',
      isMasterKey: false,
      isTestDrive: false,
      apiKey: localKey,
      credentials: { apiKey: localKey },
      expiresAt: null,
      tenantId: targetTenantId
    };
  }

  if (service === 'meta') {
    const localAppId = tenantConfig.meta_app_id;
    const localToken = tenantConfig.meta_token;
    if (!localToken || localToken.trim() === '') {
      throw new ApiRouterError(
        'TENANT_KEY_MISSING',
        'Token local da Meta Ads API não configurado para este inquilino.',
        {
          status: 400,
          tenantId: targetTenantId,
          serviceType: service,
          friendlyMessage: 'Token da Meta Ads API não configurado para a sua empresa. Acesse as configurações para inseri-lo.'
        }
      );
    }
    return {
      serviceType: 'meta',
      source: 'TENANT',
      isMasterKey: false,
      isTestDrive: false,
      appId: localAppId || null,
      token: localToken,
      accessToken: localToken,
      credentials: { appId: localAppId || null, token: localToken, accessToken: localToken },
      expiresAt: null,
      tenantId: targetTenantId
    };
  }

  if (service === 'bureau') {
    const localBureauKey = tenantConfig.bureau_key;
    if (!localBureauKey || localBureauKey.trim() === '') {
      throw new ApiRouterError(
        'TENANT_KEY_MISSING',
        'Chave local do Bureau de Dados não configurada para este inquilino.',
        {
          status: 400,
          tenantId: targetTenantId,
          serviceType: service,
          friendlyMessage: 'Chave do Bureau de Dados não configurada para a sua empresa. Acesse as configurações para inseri-la.'
        }
      );
    }
    return {
      serviceType: 'bureau',
      source: 'TENANT',
      isMasterKey: false,
      isTestDrive: false,
      apiKey: localBureauKey,
      credentials: { apiKey: localBureauKey },
      expiresAt: null,
      tenantId: targetTenantId
    };
  }
}

/**
 * Consulta rápida de status do Test Drive para renderização defensiva no Frontend
 * 
 * @param {string} tenantId 
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function checkTenantTestDriveStatus(tenantId, options = {}) {
  const targetTenantId = tenantId ? String(tenantId).trim() : 'tenant-root-default';
  const tenantConfig = await getTenantApiConfig(targetTenantId);
  const now = options.now ? new Date(options.now) : new Date();

  const useMaster = Boolean(tenantConfig?.use_master_key);
  const expiresAt = tenantConfig?.test_drive_expires_at ? new Date(tenantConfig.test_drive_expires_at) : null;
  const isExpired = useMaster && (!expiresAt || isNaN(expiresAt.getTime()) || (now.getTime() >= expiresAt.getTime()));

  let daysRemaining = 0;
  if (useMaster && expiresAt && !isExpired) {
    daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  return {
    tenant_id: targetTenantId,
    use_master_key: useMaster,
    is_test_drive_active: useMaster && !isExpired,
    is_test_drive_expired: isExpired,
    test_drive_expires_at: tenantConfig?.test_drive_expires_at || null,
    days_remaining: daysRemaining
  };
}

export default {
  resolveTenantCredentials,
  checkTenantTestDriveStatus,
  ApiRouterError,
  SUPPORTED_SERVICES
};
