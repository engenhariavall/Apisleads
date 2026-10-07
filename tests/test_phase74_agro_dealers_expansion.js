/**
 * tests/test_phase74_agro_dealers_expansion.js
 * 
 * FASE 74: TESTE DE EXPANSÃO DE CONCESSIONÁRIAS / REVENDAS AGRO B2B (PASSO FUNDO)
 * E SINCRONIZAÇÃO DE PERFIL / CAMADAS
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import { seedAgroLeads } from '../server/src/config/seedAgroLeads.js';
import { queryLeads, getAllLeadsMatchingFilter } from '../server/src/services/leadsService.js';
import { GeoSpatialEngine } from '../server/src/modules/gis/index.js';

console.log('🧪 Iniciando Testes da Fase 74: Expansão de Concessionárias / Revendas Agro B2B...');

// 1. Executa o seed de garantia
console.log('-> 1. Executando seedAgroLeads...');
seedAgroLeads();

// 2. Testa contagem de Fornecedores / Revendas em Passo Fundo
console.log('-> 2. Verificando contagem de SUPPLIER em Passo Fundo...');
const supplierQuery = queryLeads({
  target_type: 'SUPPLIER',
  cidades: ['PASSO FUNDO'],
  page: 1,
  page_size: 50
});

console.log(`   Total retornado: ${supplierQuery.total_count} revendas`);
assert.ok(
  supplierQuery.total_count >= 35,
  `Esperava ao menos 35 revendas/fornecedores em Passo Fundo, mas obteve ${supplierQuery.total_count}`
);
assert.ok(
  supplierQuery.data.length >= 35,
  `A lista retornada deve conter ao menos 35 itens na página 1`
);
console.log('   ✅ Contagem de revendas aprovada (>= 35 revendas ativas).');

// 3. Testa segregação estrita: quando BUYER, zero revendas devem aparecer
console.log('-> 3. Verificando segregação estrita (BUYER não pode conter SUPPLIER)...');
const buyerQuery = queryLeads({
  target_type: 'BUYER',
  cidades: ['PASSO FUNDO'],
  page: 1,
  page_size: 50
});

const invalidSuppliersInBuyer = buyerQuery.data.filter(l => l.target_type === 'SUPPLIER');
assert.strictEqual(
  invalidSuppliersInBuyer.length,
  0,
  'Filtro BUYER não pode retornar nenhum lead com target_type = SUPPLIER'
);
console.log(`   ✅ Segregação confirmada: 0 revendas retornadas no filtro BUYER.`);

// 4. Validação de integridade de dados das revendas
console.log('-> 4. Validando integridade cadastral e georreferenciamento em Passo Fundo...');
const allSuppliers = getAllLeadsMatchingFilter({
  target_type: 'SUPPLIER',
  cidades: ['PASSO FUNDO']
});

let validCoordsCount = 0;
let validPhonesCount = 0;
let validCnaesCount = 0;

for (const sup of allSuppliers) {
  // Verifica CNPJ
  assert.ok(sup.cnpj && sup.cnpj.length >= 14, `CNPJ inválido no lead ${sup.razao_social}`);

  // Verifica Razão Social
  assert.ok(sup.razao_social && sup.razao_social.length > 3, `Razão social inválida`);

  // Bounding box de Passo Fundo: Lat entre -28.35 e -28.15 | Lng entre -52.55 e -52.30
  if (sup.latitude && sup.longitude) {
    assert.ok(
      sup.latitude >= -28.38 && sup.latitude <= -28.15,
      `Latitude fora de Passo Fundo: ${sup.latitude} (${sup.razao_social})`
    );
    assert.ok(
      sup.longitude >= -52.55 && sup.longitude <= -52.30,
      `Longitude fora de Passo Fundo: ${sup.longitude} (${sup.razao_social})`
    );
    validCoordsCount++;
  }

  if (sup.telefone || sup.telefone_sanitized || sup.whatsapp) {
    validPhonesCount++;
  }

  if (sup.cnae_principal_codigo) {
    validCnaesCount++;
  }

  // Blindagem de concorrente: não pode estar bloqueado como is_competitor = 1
  assert.ok(
    sup.is_competitor === 0 || sup.is_competitor === null,
    `Revenda ${sup.razao_social} não pode estar bloqueada como is_competitor = 1`
  );
}

assert.strictEqual(validCoordsCount, allSuppliers.length, 'Todas as revendas devem ter coordenadas válidas');
assert.ok(validPhonesCount >= allSuppliers.length * 0.9, 'Mais de 90% das revendas devem ter telefone de contato');
assert.strictEqual(validCnaesCount, allSuppliers.length, 'Todas as revendas devem ter CNAE preenchido');
console.log(`   ✅ Todas as ${validCoordsCount} revendas possuem coordenadas precisas no perímetro de Passo Fundo.`);

// 5. Teste de Resposta Geoespacial para Leaflet / MapLibre (GeoJSON)
console.log('-> 5. Testando resolução geoespacial com GeoSpatialEngine...');
const geoCoords = allSuppliers.map(l => GeoSpatialEngine.resolveCoordinates(l));
const resolvedCount = geoCoords.filter(c => c.lat !== null && c.lng !== null).length;
assert.strictEqual(resolvedCount, allSuppliers.length, 'GeoSpatialEngine deve resolver 100% das coordenadas');
console.log(`   ✅ GeoSpatialEngine resolveu 100% das coordenadas das revendas.`);

// 6. Teste de Performance (tempo de resposta < 100ms)
console.log('-> 6. Testando velocidade de processamento da consulta de revendas...');
const t0 = Date.now();
for (let i = 0; i < 5; i++) {
  queryLeads({ target_type: 'SUPPLIER', cidades: ['PASSO FUNDO'], page: 1, page_size: 25 });
}
const avgTime = (Date.now() - t0) / 5;
console.log(`   Tempo médio de consulta: ${avgTime.toFixed(1)}ms`);
assert.ok(avgTime < 100, `Consulta demorou mais que 100ms: ${avgTime}ms`);
console.log('   ✅ Performance confirmada: execução ultra-rápida via SQLite.');

console.log('\n🎉 TODOS OS TESTES DA FASE 74 FORAM APROVADOS COM SUCESSO (100%)!\n');
