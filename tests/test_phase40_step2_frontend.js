/**
 * TESTE DE HOMOLOGAÇÃO AUTOMATIZADA - FASE 40 (ETAPA 2)
 * Feedback de Engajamento Visual no Frontend (Tabela de Leads & Drawer Lateral)
 */

import fs from 'fs';
import path from 'path';

function runFrontendTelemetryTests() {
  console.log('🚀 Iniciando teste de homologação da Fase 40 - Etapa 2 (Feedback de Engajamento no Frontend)...');

  const appJsPath = path.resolve('client/js/app.js');
  const indexHtmlPath = path.resolve('client/index.html');
  const stylesCssPath = path.resolve('client/css/styles.css');

  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');

  // 1. Verificação de Estilos CSS
  console.log('\n[1/4] Verificando estilos CSS (.telemetry-pill-table, .telemetry-pulse-dot, .telemetry-drawer-card)...');
  if (!stylesCss.includes('.telemetry-pill-table')) {
    throw new Error('Classe .telemetry-pill-table não encontrada em styles.css');
  }
  if (!stylesCss.includes('.telemetry-pulse-dot')) {
    throw new Error('Classe .telemetry-pulse-dot não encontrada em styles.css');
  }
  if (!stylesCss.includes('.telemetry-drawer-card')) {
    throw new Error('Classe .telemetry-drawer-card não encontrada em styles.css');
  }
  console.log('✅ Estilos CSS validados com sucesso!');

  // 2. Verificação de HTML do Drawer
  console.log('\n[2/4] Verificando marcação do Card de Telemetria no Right Drawer (index.html)...');
  if (!indexHtml.includes('id="inspectorTelemetryCard"')) {
    throw new Error('Card #inspectorTelemetryCard ausente em index.html');
  }
  if (!indexHtml.includes('id="inspectorTelemetryViewsCount"')) {
    throw new Error('Elemento #inspectorTelemetryViewsCount ausente em index.html');
  }
  if (!indexHtml.includes('Aguardando engajamento do decisor...')) {
    throw new Error('Texto sutil de aguardo ausente em index.html');
  }
  console.log('✅ Estrutura HTML do Right Drawer validada com sucesso!');

  // 3. Verificação de Injeção na Tabela de Leads
  console.log('\n[3/4] Verificando injeção do indicador de engajamento na tabela (app.js)...');
  if (!appJs.includes('telemetry-pill-table') || !appJs.includes('lead.visualizacoes_dossie > 0')) {
    throw new Error('Indicador de telemetria não encontrado na renderização da tabela em app.js');
  }
  if (!appJs.includes('Dossiê visualizado')) {
    throw new Error('Tooltip title com contador de visualizações ausente na tabela');
  }
  console.log('✅ Indicador tático de telemetria na tabela de leads validado com sucesso!');

  // 4. Verificação de Lógica do Drawer Lateral
  console.log('\n[4/4] Verificando preenchimento dinâmico do card de telemetria no Drawer (app.js)...');
  if (!appJs.includes("telemetryBadge.textContent = 'ENGAJOU'") || !appJs.includes("telemetryBadge.textContent = 'AGUARDANDO'")) {
    throw new Error('Chaveamento de badge ENGAJOU/AGUARDANDO ausente em app.js');
  }
  if (!appJs.includes('telemetryViewsCount.textContent = `${views}')) {
    throw new Error('Formatação de contador de visualizações ausente no Drawer');
  }
  console.log('✅ Lógica de telemetria do Drawer validada com sucesso!');

  console.log('\n🎉 SUCESSO: Todos os testes de Feedback de Engajamento no Frontend (Fase 40 - Etapa 2) foram aprovados!');
}

runFrontendTelemetryTests();
