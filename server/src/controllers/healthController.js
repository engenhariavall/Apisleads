import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packagePath = path.resolve(__dirname, '../../../package.json');

let appVersion = '1.0.0';
try {
  if (fs.existsSync(packagePath)) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (pkg.version) appVersion = pkg.version;
  }
} catch {
  // mantém fallback
}

/**
 * Controller leve de Healthcheck para monitoramento, Nginx, PM2 e Docker
 */
export function healthCheck(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: Number(process.uptime().toFixed(1)),
    environment: process.env.NODE_ENV || 'development',
    version: appVersion
  });
}
