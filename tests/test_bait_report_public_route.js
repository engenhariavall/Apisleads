/**
 * Teste Automatizado de Homologação:
 * Restauração da Rota Pública da Isca (Cavalo de Troia)
 * (Fase 33 - Etapa 1)
 */

import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('--- Iniciando Testes da Rota Pública do Cavalo de Troia (Fase 33 - Etapa 1) ---');

  // 1. Teste com CNPJ real da base (apenas dígitos)
  const testCnpjDigits = '18737953000100';
  console.log(`[1/6] Testando GET /report/${testCnpjDigits} (HTML público)...`);
  const res1 = await fetch(`${BASE_URL}/report/${testCnpjDigits}`);
  assert.strictEqual(res1.status, 200, `Deveria retornar 200, retornou ${res1.status}`);
  const html1 = await res1.text();
  assert(html1.includes('<!DOCTYPE html>'), 'Resposta deve conter HTML');
  assert(html1.includes('Mapa de Vulnerabilidades e Gaps de Demanda'), 'Deve conter o título do relatório');
  assert(html1.includes('18.737.953/0001-00'), 'Deve exibir o CNPJ formatado');
  console.log('✔ GET /report/:cnpj com dígitos puros retornou HTML 200 com sucesso.');

  // 2. Teste com CNPJ formatado contendo barras e pontuação na URL (/report/18.737.953/0001-00)
  console.log('[2/6] Testando GET /report/18.737.953/0001-00 (com barras)...');
  const res2 = await fetch(`${BASE_URL}/report/18.737.953/0001-00`);
  assert.strictEqual(res2.status, 200, `Deveria retornar 200 mesmo com barras, retornou ${res2.status}`);
  const html2 = await res2.text();
  assert(html2.includes('<!DOCTYPE html>'), 'Resposta deve ser HTML');
  assert(!html2.includes('Cannot GET'), 'Não pode retornar Cannot GET');
  console.log('✔ GET com barras no CNPJ tratado e renderizado sem quebra de rota.');

  // 3. Teste com CNPJ desconhecido / não cadastrado
  console.log('[3/6] Testando GET /report/00000000000000 (fallback gracioso)...');
  const res3 = await fetch(`${BASE_URL}/report/00000000000000`);
  assert.strictEqual(res3.status, 200, 'Deveria retornar 200 com relatório confidencial');
  const html3 = await res3.text();
  assert(html3.includes('<!DOCTYPE html>'), 'Deve renderizar HTML de fallback');
  assert(html3.includes('Empresa sob Análise Confidencial') || html3.includes('DOSSIÊ CONFIDENCIAL'), 'Deve conter template corporativo seguro');
  console.log('✔ Fallback para CNPJ não cadastrado retornou 200 sem crash nem tela em branco.');

  // 4. Teste de requisição com Accept: application/json
  console.log('[4/6] Testando GET /report/:cnpj com Accept: application/json...');
  const res4 = await fetch(`${BASE_URL}/report/${testCnpjDigits}`, {
    headers: { 'Accept': 'application/json' }
  });
  assert.strictEqual(res4.status, 200, 'Deveria retornar 200');
  const json4 = await res4.json();
  assert(json4.success === true, 'JSON deve conter success: true');
  assert(json4.lead && json4.lead.cnpj === testCnpjDigits, 'JSON deve conter dados do lead');
  assert(Array.isArray(json4.topGaps), 'JSON deve conter array de topGaps');
  console.log('✔ Resposta JSON retornada com sucesso para clientes de API.');

  // 5. Teste via query param ?format=json
  console.log('[5/6] Testando GET /report/:cnpj?format=json...');
  const res5 = await fetch(`${BASE_URL}/report/${testCnpjDigits}?format=json`);
  assert.strictEqual(res5.status, 200, 'Deveria retornar 200');
  const json5 = await res5.json();
  assert(json5.success === true, 'Query format=json deve responder com JSON');
  console.log('✔ Query param format=json validado.');

  // 6. Teste de acesso 100% público (sem Authorization header)
  console.log('[6/6] Verificando se a rota é 100% pública sem exigência de token...');
  const res6 = await fetch(`${BASE_URL}/report/${testCnpjDigits}`, {
    headers: { 'Authorization': '' }
  });
  assert.strictEqual(res6.status, 200, 'Acesso público deve funcionar sem token');
  console.log('✔ Rota pública confirmada: livre de travas de autenticação.');

  console.log('\n🏆 ETAPA 1 DA FASE 33 VALIDADA COM 100% DE SUCESSO!\n');
}

runTests().catch(err => {
  console.error('❌ Falha na bateria de testes:', err);
  process.exit(1);
});
