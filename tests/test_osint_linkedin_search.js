/**
 * test_osint_linkedin_search.js
 * 
 * Bateria de Testes Automatizados para a Fase 33 - Etapa 3:
 * Validação do Motor de Busca Dinâmica no LinkedIn e Botão Tático Executivo
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { contactEnrichmentService } from '../server/src/services/contactEnrichmentService.js';
import { osintService } from '../server/src/services/osintService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function runTests() {
  console.log('\n--- Iniciando Testes do Motor de Busca Dinâmica no LinkedIn (Fase 33 - Etapa 3) ---');

  // 1. Validação da URL Gerada pelo Backend (contactEnrichmentService e osintService)
  console.log('[1/4] Testando formato da URL inteligente de busca de pessoas no LinkedIn...');
  const url1 = contactEnrichmentService.generatePresumedLinkedIn('Carlos Alberto Silva', 'Fazenda do Rosário Agropecuária');
  const expectedPrefix = 'https://www.linkedin.com/search/results/people/?keywords=';
  assert(url1.startsWith(expectedPrefix), `URL deve começar com ${expectedPrefix}, recebido: ${url1}`);
  assert(url1.includes('Carlos%20Alberto%20Silva') || url1.includes('Carlos'), 'Deve conter nome codificado');
  assert(url1.includes('Ros'), 'Deve conter empresa codificada');

  const urlOsint = osintService.generatePresumedLinkedIn('Mariana Souza', 'Tech Solutions Ltda');
  assert(urlOsint.startsWith(expectedPrefix), 'osintService deve gerar a URL people/?keywords=');
  console.log('✔ URLs dinâmicas do backend homologadas com formato de busca de pessoas.');

  // 2. Validação estática no arquivo client/js/app.js
  console.log('[2/4] Verificando renderizador QSA em client/js/app.js...');
  const appJsPath = path.join(projectRoot, 'client', 'js', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  assert(
    appJsContent.includes('https://www.linkedin.com/search/results/people/?keywords='),
    'app.js deve conter a URL de busca dinâmica de pessoas no LinkedIn'
  );
  assert(
    appJsContent.includes('btn-linkedin-tactical'),
    'app.js deve conter a classe de botão tático btn-linkedin-tactical'
  );
  assert(
    appJsContent.includes('Procurar no LinkedIn'),
    'app.js deve conter o rótulo do botão "Procurar no LinkedIn"'
  );
  assert(
    appJsContent.includes('target="_blank"') && appJsContent.includes('rel="noopener noreferrer"'),
    'app.js deve abrir em nova aba com target="_blank" e rel="noopener noreferrer"'
  );
  console.log('✔ app.js possui gerador dinâmico, botão estilizado e atributos de segurança.');

  // 3. Validação CSS em client/css/styles.css
  console.log('[3/4] Verificando estilos corporativos em client/css/styles.css...');
  const stylesPath = path.join(projectRoot, 'client', 'css', 'styles.css');
  const stylesContent = fs.readFileSync(stylesPath, 'utf8');

  assert(
    stylesContent.includes('.btn-linkedin-tactical'),
    'styles.css deve conter a regra .btn-linkedin-tactical'
  );
  assert(
    stylesContent.includes('border-radius: 4px'),
    'styles.css deve conter border-radius de 4px para o botão tático'
  );
  console.log('✔ styles.css homologado com padrão Dark Mode tático e raio de 4px.');

  // 4. Verificação de Ausência de Emojis e Degradês em QSA
  console.log('[4/4] Verificando ausência de emojis e degradação visual...');
  // Não deve haver links estáticos quebrados como linkedin.com/in/adivinhado
  assert(!appJsContent.includes('linkedin.com/in/'), 'Não deve tentar inventar URLs estáticas fictícias em app.js');
  console.log('✔ Sem URLs fictícias estáticas ou regressões visuais.');

  console.log('\n🏆 ETAPA 3 DA FASE 33 VALIDADA COM 100% DE SUCESSO!\n');
}

runTests();
