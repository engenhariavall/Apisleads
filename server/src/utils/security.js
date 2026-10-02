/**
 * server/src/utils/security.js
 * 
 * FASE 26: UTILITÁRIOS CRIPTOGRÁFICOS NATIVOS
 * 
 * Implementação nativa de hashing e verificação de senhas (PBKDF2/scrypt/crypto)
 * e geração/verificação de tokens seguros sem adicionar dependências externas pesadas.
 */

import crypto from 'crypto';

const ITERATIONS = 100000;
const KEY_LEN = 64;
const DIGEST = 'sha512';

/**
 * Cria hash criptográfico seguro de senha com salt aleatório
 * @param {string} password Senha em texto puro
 * @returns {Promise<string>} String no formato salt:hash
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Senha inválida para hashing.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LEN, DIGEST, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifica se a senha fornecida confere com o hash armazenado
 * @param {string} password Senha fornecida
 * @param {string} storedHash Hash armazenado (salt:hash)
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;

  return new Promise((resolve) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LEN, DIGEST, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const keyBuffer = Buffer.from(derivedKey.toString('hex'), 'utf8');
        const origBuffer = Buffer.from(originalHash, 'utf8');
        if (keyBuffer.length !== origBuffer.length) return resolve(false);
        resolve(crypto.timingSafeEqual(keyBuffer, origBuffer));
      } catch (e) {
        resolve(false);
      }
    });
  });
}

/**
 * Assina um payload gerando um token JWT HMAC-SHA256 nativo
 * @param {Object} payload Dados a serem codificados
 * @param {string} secret Segredo de assinatura
 * @param {number} expiresInSeconds Tempo de expiração em segundos (default: 24h = 86400s)
 * @returns {string} Token JWT assinado
 */
export function signJwt(payload, secret = process.env.JWT_SECRET || 'versus_default_master_secret_2026', expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSeconds;

  const fullPayload = {
    ...payload,
    iat: now,
    exp
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  return `${b64Header}.${b64Payload}.${signature}`;
}

/**
 * Valida e decodifica um token JWT nativo
 * @param {string} token Token JWT
 * @param {string} secret Segredo de assinatura
 * @returns {Object|null} Payload decodificado ou null se inválido/expirado
 */
export function verifyJwt(token, secret = process.env.JWT_SECRET || 'versus_default_master_secret_2026') {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [b64Header, b64Payload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  try {
    const sigBuffer = Buffer.from(signature, 'utf8');
    const expBuffer = Buffer.from(expectedSignature, 'utf8');
    if (sigBuffer.length !== expBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expBuffer)) return null;

    const payloadJson = Buffer.from(b64Payload, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expirado
    }

    return payload;
  } catch (err) {
    return null;
  }
}
