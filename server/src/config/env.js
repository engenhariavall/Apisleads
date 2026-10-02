import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Carregador universal e resiliente de variáveis de ambiente (.env) para Node.js
 * Executa automaticamente na importação para blindar contra problemas de hoisting do ESM
 */
export function loadEnv() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Procura o arquivo .env em múltiplos caminhos candidatos
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
    '/var/www/versus-api/.env'
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      try {
        if (typeof process.loadEnvFile === 'function') {
          try {
            process.loadEnvFile(envPath);
          } catch {}
        }

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
            if (process.env[key] === undefined || process.env[key] === '') {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {
        console.warn(`Aviso ao ler ${envPath}:`, err.message);
      }
    }
  }
}

// Auto-execução na importação
loadEnv();
