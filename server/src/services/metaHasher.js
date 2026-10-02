import crypto from 'crypto';
import { resolveTenantCredentials, ApiRouterError } from './apiRouterService.js';

/**
 * Obtém dinamicamente o meta_token e meta_app_id validados pelo motor de roteamento
 * 
 * @param {string} [tenantId] Identificador do inquilino
 * @param {Object} [options] Opções adicionais de resolução
 * @returns {Promise<{ meta_token: string, meta_app_id: string|null, isMasterKey: boolean, isTestDrive: boolean }>}
 */
export async function resolveMetaCredentials(tenantId = 'tenant-root-default', options = {}) {
  const creds = await resolveTenantCredentials(tenantId, 'meta', options);
  return {
    meta_token: creds.token || creds.accessToken,
    meta_app_id: creds.appId || null,
    accessToken: creds.token || creds.accessToken,
    adAccountId: creds.appId || null,
    isMasterKey: creds.isMasterKey,
    isTestDrive: creds.isTestDrive,
    source: creds.source,
    tenantId: creds.tenantId
  };
}

/**
 * Normaliza e gera hash SHA-256 estritamente conforme a documentação
 * do Meta Ads (Facebook Custom Audience Data Formatting):
 * https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences
 */

export function sha256(value) {
  if (!value) return '';
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Normaliza e-mail: remove espaços, converte para minúsculas e aplica SHA-256
 */
export function hashEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const clean = email.trim().toLowerCase();
  if (!clean.includes('@')) return '';
  return sha256(clean);
}

/**
 * Normaliza telefone no formato internacional E.164:
 * Exemplo Brasil: +55 (42) 3220-4100 -> 554232204100 (somente dígitos com DDI 55)
 * Em seguida aplica SHA-256
 */
export function normalizeAndHashPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  let digits = phone.replace(/\D/g, '');

  if (!digits) return '';

  // Se não começar com o DDI do Brasil (55) e tiver tamanho válido de DDD+número (10 ou 11 dígitos)
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }

  return sha256(digits);
}

/**
 * Remove acentuação e caracteres especiais
 */
export function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Formata cidade para Meta Ads (letras minúsculas, sem acentos, sem pontuação)
 */
export function hashCity(city) {
  if (!city) return '';
  const clean = removeAccents(city).trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
  return sha256(clean);
}

/**
 * Formata estado (UF com 2 letras minúsculas)
 */
export function hashState(uf) {
  if (!uf) return '';
  const clean = uf.trim().toLowerCase().slice(0, 2);
  return sha256(clean);
}

/**
 * Normaliza e gera hash de CEP/Zip (primeiros 5 dígitos conforme especificação do Meta Ads)
 */
export function normalizeAndHashZip(cep) {
  if (!cep || typeof cep !== 'string') return '';
  const clean = cep.replace(/\D/g, '').slice(0, 5);
  if (clean.length < 5) return '';
  return sha256(clean);
}

/**
 * País fixo ("br" em minúsculas)
 */
export function hashCountry() {
  return sha256('br');
}

/**
 * Transforma uma lista de leads em formato oficial do Meta Ads Custom Audience
 */
export function transformToMetaAds(leads) {
  return leads.map(lead => {
    // Extrai primeiro nome e sobrenome (priorizando contato_nome > nome_titular > nome_fantasia > razao_social)
    const personName = (
      lead.contato_nome ||
      lead.nome_titular ||
      lead.nome_fantasia ||
      lead.razao_social ||
      ''
    );
    const nameParts = personName.trim().split(/\s+/);
    const firstName = nameParts[0] ? sha256(removeAccents(nameParts[0]).toLowerCase()) : '';
    const lastName = nameParts.length > 1 ? sha256(removeAccents(nameParts.slice(1).join(' ')).toLowerCase()) : '';

    const phoneRaw = lead.telefone || lead.whatsapp_validado || lead.bureau_whatsapp || lead.whatsapp || '';
    const cityRaw = lead.municipio || lead.cidade || '';
    const ufRaw = lead.uf || lead.estado || '';
    const emailRaw = lead.email || lead.email_validado || '';

    return {
      email: hashEmail(emailRaw),
      phone: normalizeAndHashPhone(phoneRaw),
      fn: firstName,
      ln: lastName,
      ct: hashCity(cityRaw),
      st: hashState(ufRaw),
      zip: normalizeAndHashZip(lead.cep),
      country: hashCountry(),
      cnpj: lead.cnpj || lead.cpf_cnpj_titular || lead.cnpj_raw || '',
      razao_social: lead.razao_social || lead.nome_titular || ''
    };
  });
}
