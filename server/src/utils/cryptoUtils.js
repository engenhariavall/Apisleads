/**
 * server/src/utils/cryptoUtils.js
 * 
 * FASE 59 — ETAPA 1: UTILITÁRIO CRIPTOGRÁFICO DE CREDENCIAIS MULTI-TENANT
 * 
 * Implementa criptografia simétrica autenticada (AES-256-GCM) usando o módulo
 * crypto nativo do Node.js para proteção obrigatória de API Keys em repouso no SQLite.
 * Nenhuma chave de API (Mestre ou Tenant) é persistida em texto puro.
 */

import crypto from 'crypto';

// Derivação determinística de chave de 32 bytes (256 bits) para AES-256-GCM
const RAW_SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'versus_master_encryption_key_default_32bytes_2026';
const MASTER_KEY = crypto.createHash('sha256').update(RAW_SECRET).digest();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Encripta uma string de chave de API em formato seguro (iv:authTag:ciphertext)
 * @param {string|null} text Texto em claro da chave
 * @returns {string|null} String encriptada ou null/undefined se vazio
 */
export function encrypt(text) {
  if (text === null || text === undefined) return text;
  const str = String(text).trim();
  if (str === '') return '';

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
  
  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Desencripta uma string previamente encriptada (iv:authTag:ciphertext)
 * @param {string|null} encryptedText Texto cifrado
 * @returns {string|null} Texto em claro
 */
export function decrypt(encryptedText) {
  if (encryptedText === null || encryptedText === undefined) return encryptedText;
  const str = String(encryptedText).trim();
  if (str === '') return '';

  const parts = str.split(':');
  // Se não estiver no formato iv:authTag:ciphertext (3 partes hexadecimais),
  // retorna o valor original sem quebrar retrocompatibilidade
  if (parts.length !== 3) {
    return str;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(authTagHex) || !/^[0-9a-fA-F]+$/.test(encryptedHex)) {
    return str;
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('❌ [CRYPTO] Erro ao desencriptar credencial:', err.message);
    throw new Error('FAILED_TO_DECRYPT_CREDENTIAL');
  }
}

/**
 * Verifica se uma string parece estar no formato cifrado padrão (iv:authTag:ciphertext)
 * @param {string} val
 * @returns {boolean}
 */
export function isEncrypted(val) {
  if (!val || typeof val !== 'string') return false;
  const parts = val.split(':');
  return parts.length === 3 && parts.every(p => /^[0-9a-fA-F]+$/.test(p) && p.length > 0);
}

/**
 * Mascara uma chave de API para exibição segura em logs ou UI (ex: sk-...1234)
 * @param {string} key
 * @returns {string}
 */
export function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••${suffix}`;
}

/**
 * Encripta um conjunto de campos específicos de um objeto
 * @param {Object} obj
 * @param {string[]} fields
 * @returns {Object}
 */
export function encryptFields(obj, fields = []) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = { ...obj };
  for (const field of fields) {
    if (clone[field] !== undefined && clone[field] !== null && clone[field] !== '') {
      if (!isEncrypted(clone[field])) {
        clone[field] = encrypt(clone[field]);
      }
    }
  }
  return clone;
}

/**
 * Desencripta um conjunto de campos específicos de um objeto
 * @param {Object} obj
 * @param {string[]} fields
 * @returns {Object}
 */
export function decryptFields(obj, fields = []) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = { ...obj };
  for (const field of fields) {
    if (clone[field] !== undefined && clone[field] !== null && clone[field] !== '') {
      if (isEncrypted(clone[field])) {
        clone[field] = decrypt(clone[field]);
      }
    }
  }
  return clone;
}

export default {
  encrypt,
  decrypt,
  isEncrypted,
  maskApiKey,
  encryptFields,
  decryptFields
};
