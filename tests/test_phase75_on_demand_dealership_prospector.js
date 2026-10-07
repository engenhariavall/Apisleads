/**
 * tests/test_phase75_on_demand_dealership_prospector.js
 * 
 * FASE 75: TESTE DO MOTOR DE PROSPECÇÃO DE REVENDAS SOB DEMANDA (QUALQUER CIDADE DO BRASIL)
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import { OnDemandSupplierProspectorService } from '../server/src/services/onDemandSupplierProspectorService.js';
import { queryLeads } from '../server/src/services/leadsService.js';

console.log('🧪 Iniciando Testes da Fase 75: Motor de Prospecção de Revendas Sob Demanda...');

// 1. Teste de Validação de Parâmetros
console.log('-> 1. Testando validação de parâmetros obrigatórios...');
try {
  await OnDemandSupplierProspectorService.prospectSuppliersForCity('', '');
  assert.fail('Deveria ter lançado erro para parâmetros vazios');
} catch (e) {
  assert.ok(e.message.includes('obrigatórios'), 'Mensagem de validação esperada');
  console.log('   ✅ Validação de parâmetros aprovada.');
}

// 2. Teste de Prospecção Sob Demanda em Rio Verde / GO
console.log('-> 2. Executando prospecção sob demanda em Rio Verde / GO...');
const resRioVerde = await OnDemandSupplierProspectorService.prospectSuppliersForCity('GO', 'RIO VERDE', { force_refresh: true });
console.log(`   Total retornado: ${resRioVerde.total_found} revendas (${resRioVerde.message})`);
assert.strictEqual(resRioVerde.success, true, 'Deveria retornar success: true');
assert.ok(resRioVerde.total_found >= 10, `Esperava ao menos 10 revendas em Rio Verde, obteve ${resRioVerde.total_found}`);
console.log('   ✅ Prospecção em Rio Verde / GO aprovada.');

// 3. Teste de Persistência no SQLite
console.log('-> 3. Verificando persistência no SQLite e isolamento de target_type...');
const qRioVerde = queryLeads({
  target_type: 'SUPPLIER',
  cidades: ['RIO VERDE'],
  page: 1,
  page_size: 50
});
assert.ok(qRioVerde.total_count >= 10, `Total no banco deve ser >= 10, obteve ${qRioVerde.total_count}`);

for (const lead of qRioVerde.data) {
  assert.strictEqual(lead.target_type, 'SUPPLIER', 'target_type deve ser SUPPLIER');
  assert.strictEqual(lead.municipio.toUpperCase(), 'RIO VERDE', 'Município deve ser RIO VERDE');
  assert.strictEqual(lead.uf.toUpperCase(), 'GO', 'UF deve ser GO');
  assert.ok(lead.is_competitor === 0 || lead.is_competitor === null, 'Não pode estar bloqueado como competidor');
  assert.ok(lead.latitude !== null && lead.longitude !== null, 'Coordenadas devem existir');
}
console.log(`   ✅ ${qRioVerde.total_count} revendas validadas com sucesso no banco de dados SQLite.`);

// 4. Teste de Cache e Idempotência (Sem Duplicação)
console.log('-> 4. Testando idempotência (segunda chamada não deve duplicar registros)...');
const resSecond = await OnDemandSupplierProspectorService.prospectSuppliersForCity('GO', 'RIO VERDE', { force_refresh: false });
assert.strictEqual(resSecond.already_existed, true, 'Segunda chamada deve reconhecer que os registros já existem');
const qRioVerde2 = queryLeads({
  target_type: 'SUPPLIER',
  cidades: ['RIO VERDE'],
  page: 1,
  page_size: 50
});
assert.strictEqual(qRioVerde2.total_count, qRioVerde.total_count, 'Contagem total não deve ser alterada por nova chamada');
console.log('   ✅ Idempotência e integridade de base confirmadas.');

// 5. Teste de Prospecção em Luís Eduardo Magalhães / BA
console.log('-> 5. Executando prospecção em Luís Eduardo Magalhães / BA...');
const resLem = await OnDemandSupplierProspectorService.prospectSuppliersForCity('BA', 'LUIS EDUARDO MAGALHAES', { force_refresh: true });
assert.ok(resLem.total_found >= 10, `Esperava ao menos 10 revendas em LEM, obteve ${resLem.total_found}`);
const qLem = queryLeads({
  target_type: 'SUPPLIER',
  cidades: ['LUIS EDUARDO MAGALHAES'],
  page: 1,
  page_size: 50
});
assert.ok(qLem.total_count >= 10, 'Leads de LEM devem estar disponíveis imediatamente');
console.log(`   ✅ ${qLem.total_count} revendas de Luís Eduardo Magalhães / BA inseridas e validadas.`);

console.log('\n🎉 TODOS OS TESTES DA FASE 75 FORAM HOMOLOGADOS COM 100% DE SUCESSO!\n');
