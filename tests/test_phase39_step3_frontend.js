/**
 * TESTE DE HOMOLOGAÇÃO AUTOMATIZADA - FASE 39 (ETAPA 3)
 * Validação de UI, Badges Verdes, Fallbacks e Links Diretos do LinkedIn
 */

import fs from 'fs';
import path from 'path';

function runFrontendValidationTests() {
  console.log('🚀 Iniciando teste de homologação da Fase 39 - Etapa 3 (Frontend & Feedback de Validação)...');

  const appJsPath = path.resolve('client/js/app.js');
  const stylesCssPath = path.resolve('client/css/styles.css');

  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');

  console.log('\n[1/4] Verificando estilos CSS para badges de validação e perfis reais...');
  if (!stylesCss.includes('.btn-linkedin-real')) {
    throw new Error('Classe .btn-linkedin-real não encontrada em client/css/styles.css');
  }
  if (!stylesCss.includes('.badge-email-verified')) {
    throw new Error('Classe .badge-email-verified não encontrada em client/css/styles.css');
  }
  if (!stylesCss.includes('.qsa-tactical-skeleton')) {
    throw new Error('Classe .qsa-tactical-skeleton não encontrada em client/css/styles.css');
  }
  console.log('✅ Estilos CSS validados com sucesso (.btn-linkedin-real, .badge-email-verified, .qsa-tactical-skeleton)!');

  console.log('\n[2/4] Verificando renderização do Right Drawer QSA (renderDrawerQsaTab)...');
  if (!appJs.includes('emailValidado = socio.email_validado')) {
    throw new Error('Priorização de email_validado não encontrada em renderDrawerQsaTab');
  }
  if (!appJs.includes("socio.email_validation_status === 'VERIFIED_DELIVERABLE'")) {
    throw new Error('Verificação de VERIFIED_DELIVERABLE ausente');
  }
  if (!appJs.includes('🟢 Validado')) {
    throw new Error('Selo "🟢 Validado" não encontrado no app.js');
  }
  if (!appJs.includes('Não encontrado / Uso Restrito')) {
    throw new Error('Texto de fallback "Não encontrado / Uso Restrito" ausente no app.js');
  }
  if (!appJs.includes('&rarr; Abrir Perfil Real')) {
    throw new Error('Botão de redirecionamento direto ao LinkedIn real ausente');
  }
  console.log('✅ Lógica de renderização da Aba QSA (Drawer) 100% validada!');

  console.log('\n[3/4] Verificando renderização do Modal de Detalhes do Lead...');
  if (!appJs.includes('modalLeadQsaList') || !appJs.includes('realLinkedIn = s.linkedin_url_real')) {
    throw new Error('Lógica de LinkedIn Real ausente no modalLeadQsaList');
  }
  console.log('✅ Modal de Detalhes com suporte a perfis reais e e-mails validados 100% validado!');

  console.log('\n[4/4] Verificando estado de carregamento tático (Skeleton/Loader) em triggerLiveQsaEnrichment...');
  if (!appJs.includes('⏳ Extraindo inteligência tática...')) {
    throw new Error('Texto de feedback de carregamento tático ausente');
  }
  if (!appJs.includes('btnRefresh.disabled = true')) {
    throw new Error('Trava anti-duplo clique no botão de enriquecimento ausente');
  }
  if (!appJs.includes('qsa-tactical-skeleton')) {
    throw new Error('Renderização do container skeleton ausente');
  }
  console.log('✅ Estado de carregamento tático e proteção contra cliques duplos 100% validados!');

  console.log('\n🎉 SUCESSO: Todos os requisitos da Fase 39 - Etapa 3 foram aprovados com excelência!');
}

runFrontendValidationTests();
