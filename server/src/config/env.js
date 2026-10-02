import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Carregador de variáveis de ambiente do .env para Node.js
 * Atua de forma segura e autônoma caso process.loadEnvFile não exista
 */
export function loadEnv() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../../');
  const envPath = path.join(rootDir, '.env');

  // 1. Tenta usar o recurso nativo do Node 20.6+
  if (typeof process.loadEnvFile === 'function') {
    try {
      if (fs.existsSync(envPath)) {
        process.loadEnvFile(envPath);
        return;
      }
    } catch {
      // Ignora e tenta o fallback manual
    }
  }

  // 2. Fallback manual robusto de parsing de .env
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch (err) {
      console.warn('Aviso ao carregar .env local:', err.message);
    }
  }
}
