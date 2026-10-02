/**
 * test_report_enterprise_redesign.js
 * 
 * Bateria de Testes Automatizados para a Fase 35 - Etapa 2:
 * Redesign Corporativo do Dossiê Público (/report/:cnpj) - Padrão Bloomberg/Palantir
 */

import assert from 'assert';
import http from 'http';
import { baitReportService } from '../server/src/services/baitReportService.js';

function getHtml(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${urlPath}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('\n--- Iniciando Testes do Redesign Corporativo do Dossiê (Fase 35 - Etapa 2) ---');

  // 1. Testando Renderização Direta via baitReportService
  console.log('[1/4] Testando renderReportHtml do baitReportService...');
  const html = baitReportService.renderReportHtml({
    lead: {
      cnpj: '18737953000100',
      nome: 'SLC Agrícola S/A',
      razao_social: 'SLC Agrícola S/A',
      municipio: 'Porto Alegre',
      uf: 'RS',
      capital_social: 1250000000,
      porte: 'DEMAIS'
    },
    decisor: 'Aurélio Pavinato',
    topGaps: [
      { municipio: 'Sorriso', uf: 'MT', distancia_km: 42, gap_score: 94 },
      { municipio: 'Sapezal', uf: 'MT', distancia_km: 78, gap_score: 88 }
    ]
  });

  // Verificações de Paleta e Padrão Enterprise
  assert(html.includes('#050814'), 'Deve utilizar fundo Enterprise #050814');
  assert(html.includes('#0B1224'), 'Deve utilizar containers #0B1224');
  assert(html.includes('rgba(0, 85, 255, 0.3)'), 'Deve utilizar bordas em azul cobalto sutil rgba(0, 85, 255, 0.3)');
  assert(html.includes('border-radius: 4px'), 'Deve conter cantos de 4px');
  assert(!html.includes('linear-gradient'), 'Não deve conter gradientes extravagantes');
  assert(!html.includes('🔒') && !html.includes('🎯') && !html.includes('💬'), 'Não deve conter emojis amadores');
  console.log('✔ baitReportService gera HTML Enterprise sem emojis ou gradientes extravagantes.');

  // 2. Testando Rota HTTP Real no Servidor
  console.log('[2/4] Testando resposta HTTP da rota /report/18737953000100...');
  const res = await getHtml('/report/18737953000100');
  assert.strictEqual(res.statusCode, 200, 'Status deve ser 200');
  assert(res.body.includes('CLASSIFICAÇÃO') || res.body.includes('DOSSIÊ CONFIDENCIAL'), 'Deve conter barra de classificação confidencial');
  assert(res.body.includes('TERMINAL DE INTELIGÊNCIA TERRITORIAL'), 'Deve conter terminal strip');
  assert(res.body.includes('gap-table'), 'Deve renderizar tabela estruturada de gaps');
  assert(res.body.includes('btn-action'), 'Deve conter botão de ação executiva');
  assert(!res.body.includes('linear-gradient'), 'Resposta HTTP não deve conter gradientes');
  console.log('✔ Rota pública /report/:cnpj renderiza o novo layout Palantir/Bloomberg com status 200.');

  // 3. Verificação de Fallback sem gaps
  console.log('[3/4] Testando layout de fallback para empresa sem gaps mapeados...');
  const fallbackHtml = baitReportService.renderReportHtml({
    lead: { cnpj: '00000000000000', nome: 'Nova Empresa SA' },
    topGaps: []
  });
  assert(fallbackHtml.includes('Nenhum vazio concorrencial'), 'Deve exibir mensagem profissional para ausência de gaps');
  assert(fallbackHtml.includes('gap-table'), 'Estrutura da tabela deve se manter íntegra');
  console.log('✔ Fallback gracioso com tabela analítica validado.');

  // 4. Verificação de Tipografia e Monocromia
  console.log('[4/4] Verificando fontes Inter e JetBrains Mono...');
  assert(html.includes('Inter'), 'Deve incluir tipografia Inter');
  assert(html.includes('JetBrains+Mono'), 'Deve incluir fonte mono JetBrains Mono para metadados auditáveis');
  console.log('✔ Tipografia e monocromia tática homologadas com sucesso.');

  console.log('\n🏆 ETAPA 2 DA FASE 35 VALIDADA COM 100% DE SUCESSO!\n');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes da Etapa 2:', err);
  process.exit(1);
});
