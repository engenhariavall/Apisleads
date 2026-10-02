import { loadEnv } from './src/config/env.js';

// Carrega variáveis de ambiente (.env)
loadEnv();

import app from './src/app.js';
import SparksEngineService from './src/services/sparksEngineService.js';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 API Leads Engine iniciada com sucesso!`);
  console.log(`📡 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`🌍 Ambiente de Execução: ${NODE_ENV}`);
  console.log(`🩺 Healthcheck: http://localhost:${PORT}/health`);
  console.log(`📊 Relatório de Gestão em Tempo Real: http://localhost:${PORT}/relatorio`);
  console.log(`💼 Painel de Leads ABM: http://localhost:${PORT}`);
  console.log(`🕒 Ponto Eletrônico Inviolável ativo e sincronizado`);
  console.log('====================================================');

  // Inicialização autônoma dos robôs VERSUS Sparks em nuvem (segundo plano 24/7)
  SparksEngineService.startAutoScheduler();
});
