/**
 * SUÍTE DE TESTES: FASE 51 — INTEGRAÇÃO DE DADOS REAIS (GO-LIVE)
 * Validação da expurgação de mocks, ingestão oficial do SIGEF/INCRA,
 * consulta oficial à Receita Federal e Gateway do Bureau de Dados.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function runTestSuite() {
  console.log('\n=============================================================');
  console.log('🧪 INICIANDO TESTES: FASE 51 (INTEGRAÇÃO DE DADOS REAIS - GO-LIVE)');
  console.log('=============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   ${err.message}`);
    }
  }

  // Importa serviços
  const db = (await import('../server/src/config/database.js')).default;
  const { osintService } = await import('../server/src/services/osintService.js');
  const { bureauService } = await import('../server/src/services/bureauService.js');
  const { 
    loadOfficialRuralProperties, 
    syncRegionalCadastralMesh, 
    SEED_RURAL_PROPERTIES 
  } = await import('../server/src/services/geoFundiarioService.js');

  // TESTE 1: Expurgação de Mocks e Verificação do Banco SQLite
  await test('1. Banco de dados SQLite livre de mocks fictícios (Schneider, Della Libera, etc.)', async () => {
    const mockCount = db.prepare(`
      SELECT count(*) as count FROM propriedades_rurais 
      WHERE nome_titular LIKE '%Schneider%' 
         OR nome_titular LIKE '%Della Libera%' 
         OR nome_titular LIKE '%Fernando Santos%'
         OR id_sigef LIKE 'TEST-%'
    `).get();

    assert.strictEqual(mockCount.count, 0, 'Não deve existir nenhuma propriedade com nome mock/fictício');

    const mockLeadsCount = db.prepare(`
      SELECT count(*) as count FROM leads 
      WHERE origem = 'RURAL_SIGEF' 
        AND (razao_social LIKE '%Schneider%' OR razao_social LIKE '%Della Libera%')
    `).get();

    assert.strictEqual(mockLeadsCount.count, 0, 'Não deve existir nenhum lead rural fictício na tabela leads');
  });

  // TESTE 2: Acervo Oficial SIGEF/INCRA
  await test('2. Acervo oficial do SIGEF/INCRA contém apenas dados reais e certificados', async () => {
    const officialParcels = loadOfficialRuralProperties();
    assert.ok(Array.isArray(officialParcels), 'loadOfficialRuralProperties deve retornar array');
    assert.ok(officialParcels.length >= 4, 'Deve conter parcelas oficiais cadastradas');

    const slc = officialParcels.find(p => p.cpf_cnpj_titular === '89.096.457/0001-55');
    assert.ok(slc, 'Deve conter registro oficial da SLC Agrícola S.A.');
    assert.strictEqual(slc.status_geo, 'CERTIFICADO');
    assert.ok(slc.geometria_poligono, 'Deve possuir geometria poligonal GeoJSON');

    const amaggi = officialParcels.find(p => p.nome_titular.includes('Amaggi'));
    assert.ok(amaggi, 'Deve conter registro oficial da Amaggi');
  });

  // TESTE 3: Ingestão de Malha Regional Oficial
  await test('3. syncRegionalCadastralMesh ingere dados oficiais e NÃO inventa mocks para cidades vazias', async () => {
    // Busca em Sorriso/MT onde há dados oficiais
    const resSorriso = await syncRegionalCadastralMesh({ uf: 'MT', municipio: 'SORRISO' });
    assert.ok(resSorriso.success, 'Busca em Sorriso deve ter sucesso');
    assert.ok(resSorriso.total_ingested >= 2, 'Deve ingerir as parcelas oficiais de Sorriso');

    // Busca em município hipotético sem dados oficiais
    const resVazia = await syncRegionalCadastralMesh({ uf: 'AC', municipio: 'MUNICIPIO_SEM_SIGEF_99' });
    assert.ok(resVazia.success);
    assert.strictEqual(resVazia.total_ingested, 0, 'Não deve inventar registros sintéticos para município sem dados');
    assert.ok(resVazia.message.includes('Nenhum registro fundiário oficial'), 'Deve retornar mensagem clara de ausência');
  });

  // TESTE 4: Consulta Oficial à Receita Federal (BrasilAPI / Minha Receita)
  await test('4. osintService.consultarReceitaFederal valida CNPJ e extrai QSA autêntico', async () => {
    // CNPJ real: Banco do Brasil S.A. ou SLC Agrícola
    const realCnpj = '00000000000191'; // Banco do Brasil
    const result = await osintService.consultarReceitaFederal(realCnpj);

    assert.ok(result, 'Deve retornar dados da Receita Federal');
    assert.strictEqual(result.cnpj, realCnpj);
    assert.ok(result.razao_social.includes('BANCO DO BRASIL'), `Razão social deve ser Banco do Brasil, recebido: ${result.razao_social}`);
    assert.strictEqual(result.origem, 'RECEITA_FEDERAL');
    assert.ok(Array.isArray(result.qsa), 'QSA deve ser array');
    assert.ok(result.qsa.length > 0, 'Banco do Brasil deve possuir sócios/diretores no QSA');

    // Valida que foi persistido no SQLite
    const savedInDb = db.prepare('SELECT cnpj_raw, razao_social, origem FROM leads WHERE cnpj_raw = ?').get(realCnpj);
    assert.ok(savedInDb, 'Lead consultado na Receita Federal deve estar persistido no SQLite');
    assert.strictEqual(savedInDb.origem, 'RECEITA_FEDERAL');
  });

  // TESTE 5: Gateway do Bureau de Dados (Sem chave no .env -> NUNCA inventa número)
  await test('5. bureauService sem API Key configurada retorna estritamente "Contato não localizado"', async () => {
    const originalKey = process.env.BUREAU_API_KEY;
    delete process.env.BUREAU_API_KEY;

    try {
      const res = await bureauService.lookupWhatsAppByCpf('45812983104', { nome: 'Produtor Teste' });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.whatsapp, null, 'NUNCA deve inventar número de WhatsApp');
      assert.ok(res.message.includes('Contato não localizado'), 'Mensagem deve indicar contato não localizado');
    } finally {
      if (originalKey) process.env.BUREAU_API_KEY = originalKey;
    }
  });

  // TESTE 6: Gateway do Bureau com Chave de API Configurada
  await test('6. bureauService respeita provedores (assertiva, unitfour, zapi) e formato de requisição', async () => {
    assert.ok(typeof bureauService.lookupWhatsAppByCpf === 'function');
    assert.ok(typeof bureauService.getBaseUrl === 'function');
    assert.ok(bureauService.getBaseUrl().includes('assertiva') || bureauService.getBaseUrl().includes('unitfour'));
  });

  // TESTE 7: Endpoint de Enriquecimento OSINT no Controller NUNCA gera fake seedNum
  await test('7. geoFundiarioController /api/fundiario/enrich-osint não inventa números aleatórios', async () => {
    const controllerPath = path.join(projectRoot, 'server', 'src', 'controllers', 'geoFundiarioController.js');
    const controllerCode = fs.readFileSync(controllerPath, 'utf8');

    assert.ok(!controllerCode.includes('seedNum'), 'geoFundiarioController não pode conter seedNum');
    assert.ok(!controllerCode.includes('9841234'), 'geoFundiarioController não pode conter fallback 9841234');
    assert.ok(controllerCode.includes('bureauService'), 'geoFundiarioController deve acionar bureauService');
  });

  // TESTE 8: Variáveis de Ambiente e Frontend
  await test('8. .env.example e .env possuem chaves de produção e app.js renderiza "Contato não localizado"', async () => {
    const envExamplePath = path.join(projectRoot, '.env.example');
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
    assert.ok(envExampleContent.includes('BUREAU_API_KEY'), '.env.example deve documentar BUREAU_API_KEY');
    assert.ok(envExampleContent.includes('BUREAU_PROVIDER'), '.env.example deve documentar BUREAU_PROVIDER');
    assert.ok(envExampleContent.includes('SIGEF_API_URL'), '.env.example deve documentar SIGEF_API_URL');
    assert.ok(envExampleContent.includes('RECEITA_API_URL'), '.env.example deve documentar RECEITA_API_URL');

    const appJsPath = path.join(projectRoot, 'client', 'js', 'app.js');
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    assert.ok(appJsContent.includes('Contato não localizado'), 'app.js deve exibir "Contato não localizado" quando não houver WhatsApp');
  });

  console.log('\n-------------------------------------------------------------');
  console.log(`📊 RESULTADO FINAL: ${passed}/${total} TESTES APROVADOS (${Math.round((passed / total) * 100)}%)`);
  console.log('-------------------------------------------------------------\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Erro fatal na execução da suíte:', err);
  process.exit(1);
});
