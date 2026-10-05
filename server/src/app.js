import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';
import { configureCors } from './middleware/corsConfig.js';
import { globalApiRateLimiter } from './middleware/rateLimiters.js';
import { healthCheck } from './controllers/healthController.js';
import { getBaitReportController } from './controllers/reportController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.resolve(__dirname, '../../client');

const app = express();
app.set('trust proxy', 1);

// 1. Cabeçalhos HTTP de Segurança (Helmet)
app.use(
  helmet({
    contentSecurityPolicy: false, // Mantém compatibilidade com CDNs de fontes, MapLibre GL e tiles do OSM
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'sameorigin' } // Proteção anti-clickjacking: X-Frame-Options: SAMEORIGIN
  })
);

// 2. Proteção Adicional Explícita nos Headers de Segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// 3. Middlewares essenciais e segurança de rede
app.use(configureCors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(CLIENT_DIR));

// 4. Rota de Healthcheck direta na raiz (sem rate limit, para probes do Docker/Nginx/PM2)
app.get('/health', healthCheck);

// 5. Aplicação do Rate Limit Global em todas as rotas de API
app.use('/api', globalApiRateLimiter);

// 6. Rotas da API RESTful (com suporte a /api e rotas diretas de primeiro nível para o Copiloto)
app.use('/api', apiRoutes);
app.use(['/ai', '/copilot'], apiRoutes);

// 7. Rota direta para o Relatório de Gestão em Tempo Real
app.get('/relatorio', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'relatorio.html'));
});

// 8. Rota direta para a Tela de Login Imersiva Premium (Glassmorphism & Canvas 3D)
app.get('/login', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'login.html'));
});

// 9. Rota direta para o Cockpit Isolado do Super Admin Master
app.get('/admin', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'admin.html'));
});

// 10. FASE 33 (ETAPA 1): Isca Dinâmica (Cavalo de Troia) & Relatório Público de Market Gaps
app.get(['/report/:cnpj(*)', '/reports/:cnpj(*)', '/report', '/reports'], getBaitReportController);

// 11. Rota raiz (Painel ABM de Leads)
app.get('/', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

export default app;
