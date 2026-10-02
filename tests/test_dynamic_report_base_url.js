/**
 * test_dynamic_report_base_url.js
 * 
 * Bateria de Testes Automatizados para a Fase 35 - Etapa 1:
 * Correção do Base URL e Erradicação de Hardcode de localhost no Gerador de Script
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function runTests() {
  console.log('\n--- Iniciando Testes de Resolução Dinâmica de Base URL (Fase 35 - Etapa 1) ---');

  // 1. Auditoria Estática do Arquivo client/js/app.js
  console.log('[1/4] Auditando client/js/app.js para erradicação de hardcode de localhost:3000...');
  const appJsPath = path.join(projectRoot, 'client', 'js', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  assert(
    !appJsContent.includes('localhost:3000'),
    'ERRO: client/js/app.js ainda contém hardcode de localhost:3000!'
  );
  assert(
    appJsContent.includes('window.getReportBaseUrl = function'),
    'ERRO: window.getReportBaseUrl não foi encontrado em client/js/app.js'
  );
  console.log('✔ client/js/app.js livre de qualquer hardcode de localhost:3000.');

  // 2. Simulação em Ambiente DOM Mockado
  console.log('[2/4] Testando prioridade com Variável de Ambiente (window.__ENV__)...');
  
  // Criamos ambiente global simulado
  const mockWindow = {
    __ENV__: {
      REPORT_BASE_URL: 'https://painel.agencia.com.br/'
    },
    localStorage: {
      getItem: (key) => null
    },
    location: {
      origin: 'https://dev-origin.internal'
    },
    currentInspectedLead: {
      razao_social: 'Empresa Teste SA',
      nome_fantasia: 'Empresa Teste',
      cnpj_raw: '12345678000199',
      qsa: [{ nome: 'Roberto Andrade', cargo: 'Diretor' }]
    },
    document: {
      getElementById: (id) => ({ textContent: '' })
    }
  };

  // Avaliação da função getReportBaseUrl
  const fnString = appJsContent.slice(
    appJsContent.indexOf('window.getReportBaseUrl = function'),
    appJsContent.indexOf('window.generateCustomSocioScript = function')
  );

  const evalContext = new Function('window', 'localStorage', 'document', `${fnString}; return window.getReportBaseUrl;`);
  const getReportBaseUrl = evalContext(mockWindow, mockWindow.localStorage, mockWindow.document);

  const urlFromEnv = getReportBaseUrl();
  assert.strictEqual(urlFromEnv, 'https://painel.agencia.com.br', 'Deve respeitar window.__ENV__.REPORT_BASE_URL sem barra final');
  console.log('✔ Variável de Ambiente REPORT_BASE_URL priorizada corretamente.');

  // 3. Testando prioridade com LocalStorage (configuração do operador)
  console.log('[3/4] Testando fallback para configuração de operador no LocalStorage...');
  mockWindow.__ENV__ = null;
  mockWindow.localStorage.getItem = (key) => {
    if (key === 'versus_report_base_url') return 'https://meu-dominio-customizado.com.br/';
    return null;
  };

  const getReportBaseUrlStorage = evalContext(mockWindow, mockWindow.localStorage, mockWindow.document);
  const urlFromStorage = getReportBaseUrlStorage();
  assert.strictEqual(urlFromStorage, 'https://meu-dominio-customizado.com.br', 'Deve respeitar LocalStorage sem barra final');
  console.log('✔ Configuração persistida do operador (LocalStorage) homologada.');

  // 4. Testando resolução dinâmica via window.location.origin
  console.log('[4/4] Testando resolução dinâmica do domínio atual via window.location.origin...');
  mockWindow.localStorage.getItem = (key) => null;
  mockWindow.location.origin = 'https://app-leads.com.br';

  const getReportBaseUrlOrigin = evalContext(mockWindow, mockWindow.localStorage, mockWindow.document);
  const urlFromOrigin = getReportBaseUrlOrigin();
  assert.strictEqual(urlFromOrigin, 'https://app-leads.com.br', 'Deve capturar window.location.origin dinamicamente');
  console.log('✔ Captura dinâmica de window.location.origin validada com sucesso.');

  console.log('\n🏆 ETAPA 1 DA FASE 35 HOMOLOGADA COM 100% DE SUCESSO!\n');
}

runTests();
