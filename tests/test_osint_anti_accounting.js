/**
 * Teste Automatizado de Homologação:
 * Heurística Anti-Contador & Refinamento OSINT
 * (Fase 33 - Etapa 2)
 */

import assert from 'assert';
import {
  contactEnrichmentService,
  ACCOUNTING_BLACKLIST_REGEX,
  isAccountingOrGenericEmail
} from '../server/src/services/contactEnrichmentService.js';
import { osintService } from '../server/src/services/osintService.js';

function runTests() {
  console.log('--- Iniciando Testes de Heurística Anti-Contador (Fase 33 - Etapa 2) ---');

  // 1. Validação da Regex de Blacklist
  console.log('[1/5] Testando padrões obrigatórios da Regex de Blacklist...');
  assert(ACCOUNTING_BLACKLIST_REGEX instanceof RegExp, 'ACCOUNTING_BLACKLIST_REGEX deve ser uma RegExp');

  const blacklistedExamples = [
    'contato@fazendarosario.com.br',
    'CONTATO@EMPRESA.COM.BR',
    'contabilidade@contabilparana.com.br',
    'financeiro@agropecuaria.com.br',
    'adm@minhaempresa.com.br',
    'atendimento@escritoriocontabil.com.br',
    'joao@contabilize.com.br',
    'fiscal@contabilidadeexpress.com.br'
  ];

  for (const email of blacklistedExamples) {
    assert.strictEqual(
      isAccountingOrGenericEmail(email),
      true,
      `O e-mail "${email}" DEVE ser bloqueado pela heurística anti-contador`
    );
  }
  console.log(`✔ Todos os ${blacklistedExamples.length} e-mails de contabilidade/genéricos foram bloqueados.`);

  // 2. Validação de e-mails legítimos de sócios/decisores (não devem ser bloqueados)
  console.log('[2/5] Testando e-mails legítimos de sócios...');
  const legitimateExamples = [
    'joao.silva@fazendarosario.com.br',
    'carlos.eduardo@clinicaalfa.com.br',
    'mariana.souza@bancocosta.com.br',
    'roberto@engenhariabrasil.com.br',
    'aline.rodrigues@techsolucoes.com'
  ];

  for (const email of legitimateExamples) {
    assert.strictEqual(
      isAccountingOrGenericEmail(email),
      false,
      `O e-mail legítimo "${email}" NÃO deve ser bloqueado`
    );
  }
  console.log(`✔ Todos os ${legitimateExamples.length} e-mails legítimos de decisores foram aprovados.`);

  // 3. Validação do resolveCorporateDomain expurgando domínios de contabilidade
  console.log('[3/5] Testando resolveCorporateDomain com e-mails de contabilidade...');
  const leadWithAccountingEmail = {
    nome_fantasia: 'Fazenda Rosário Agropecuária',
    razao_social: 'Fazenda Rosário Agropecuária Ltda',
    email: 'contabilidade@escritoriocontabil.com.br'
  };

  const domain = contactEnrichmentService.resolveCorporateDomain(leadWithAccountingEmail);
  assert(
    !domain.includes('contabil'),
    `Domínio resolvido não pode ser do escritório de contabilidade. Recebido: "${domain}"`
  );
  assert(domain.startsWith('fazenda'), `Deve deduzir o domínio a partir do nome da empresa. Recebido: "${domain}"`);
  console.log(`✔ Domínio resolvido corretamente para "${domain}", expurgando o e-mail de contabilidade.`);

  // 4. Validação do generatePresumedEmails com priorização de sócio e bloqueio de contabilidade
  console.log('[4/5] Testando generatePresumedEmails priorizando sócio e bloqueando contabilidade...');
  // Caso 4.1: Sócio legítimo em domínio legítimo
  const resValid = contactEnrichmentService.generatePresumedEmails('Carlos Alberto Silva', 'fazendarosario.com.br');
  assert.strictEqual(resValid.primary, 'carlos.silva@fazendarosario.com.br', 'Deve priorizar nome.sobrenome@dominio');
  assert.strictEqual(resValid.is_accounting_blacklisted, false);
  assert(resValid.patterns.includes('carlos.silva@fazendarosario.com.br'));

  // Caso 4.2: Domínio contaminado por contabilidade
  const resBlockedDomain = contactEnrichmentService.generatePresumedEmails('Carlos Silva', 'contabilidadesilva.com.br');
  assert.strictEqual(resBlockedDomain.primary, null, 'E-mail primário deve ser nulo para domínio de contabilidade');
  assert.strictEqual(resBlockedDomain.is_accounting_blacklisted, true);
  assert.strictEqual(resBlockedDomain.patterns.length, 0);

  // Caso 4.3: Nome genérico ou departamento financeiro
  const resBlockedName = contactEnrichmentService.generatePresumedEmails('Financeiro / Adm', 'empresa.com.br');
  assert.strictEqual(resBlockedName.primary, null, 'E-mail primário deve ser nulo para nome genérico');
  assert.strictEqual(resBlockedName.is_accounting_blacklisted, true);
  console.log('✔ generatePresumedEmails validado: sócios priorizados e contabilidade expurgada.');

  // 5. Validação da interface do osintService
  console.log('[5/5] Testando interface unificada do osintService...');
  assert.strictEqual(typeof osintService.isAccountingOrGenericEmail, 'function');
  assert.strictEqual(typeof osintService.resolveCorporateDomain, 'function');
  assert.strictEqual(typeof osintService.generatePresumedEmails, 'function');
  assert.strictEqual(typeof osintService.enrichLeadOsint, 'function');
  console.log('✔ osintService validado com sucesso.');

  console.log('\n🏆 ETAPA 2 DA FASE 33 VALIDADA COM 100% DE SUCESSO!\n');
}

runTests();
