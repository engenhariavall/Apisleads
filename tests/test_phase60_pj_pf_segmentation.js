import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function runTests() {
  console.log('🧪 [TEST PHASE 60] Iniciando validação da Segmentação PJ vs PF...');

  // 1. Validação Unitária de Normalização no Backend
  const { convertGeoJsonProperties } = await import('../server/src/services/geoFundiarioService.js');
  const { normalizarFeatureCar } = await import('../server/src/services/carService.js');

  // Caso 1: CNPJ de 14 dígitos
  const pjProps = convertGeoJsonProperties({
    cpf_cnpj_titular: '12.345.678/0001-90',
    nome_titular: 'AGROPECUARIA PLANALTO LTDA',
    nome_imovel: 'FAZENDA SANTA FE',
    area: 540
  });
  assert.strictEqual(pjProps.tipo_pessoa, 'PJ', 'Documento com 14 dígitos deve ser PJ');
  assert.strictEqual(pjProps.is_corporate, true, 'is_corporate deve ser true para PJ');
  console.log('  ✅ convertGeoJsonProperties classifica CNPJ 14 dígitos como PJ');

  // Caso 2: CPF de 11 dígitos
  const pfProps = convertGeoJsonProperties({
    cpf_cnpj_titular: '123.456.789-00',
    nome_titular: 'JOAO CARLOS DA SILVA',
    nome_imovel: 'SITIO SAO JOSE',
    area: 45
  });
  assert.strictEqual(pfProps.tipo_pessoa, 'PF', 'Documento com 11 dígitos deve ser PF');
  assert.strictEqual(pfProps.is_corporate, false, 'is_corporate deve ser false para PF');
  console.log('  ✅ convertGeoJsonProperties classifica CPF 11 dígitos como PF');

  // Caso 3: Heurística corporativa sem documento aberto
  const corpHeuristic = convertGeoJsonProperties({
    cpf_cnpj_titular: null,
    nome_titular: 'SEMENTES ESTRELA DO SUL S/A',
    nome_imovel: 'GLEBA B',
    area: 1200
  });
  assert.strictEqual(corpHeuristic.tipo_pessoa, 'PJ', 'Razão social com S/A deve ser inferida como PJ');
  assert.strictEqual(corpHeuristic.is_corporate, true, 'is_corporate deve ser true');
  console.log('  ✅ convertGeoJsonProperties identifica corporação por razão social (S/A)');

  // Caso 4: normalizarFeatureCar
  const carFeat = normalizarFeatureCar({
    properties: {
      codigo_car: 'RS-4314100-TESTE123',
      nom_imovel: 'FAZENDA COOPERATIVA REGIONAL',
      nom_proprietario: 'COOPERATIVA AGROINDUSTRIAL LTDA',
      num_cpf_cnpj: '00.111.222/0001-33',
      num_area: 850
    }
  });
  assert.strictEqual(carFeat.properties.tipo_pessoa, 'PJ', 'Feature CAR PJ deve ter tipo_pessoa PJ');
  assert.strictEqual(carFeat.properties.is_corporate, true, 'Feature CAR PJ deve ter is_corporate true');
  console.log('  ✅ normalizarFeatureCar injeta tipo_pessoa e is_corporate');

  // 2. Validação da Rota HTTP /api/fundiario/car/geojson
  console.log('  🌐 Testando endpoint HTTP /api/fundiario/car/geojson...');
  const baseUrl = 'http://localhost:3000';

  const resAll = await fetch(`${baseUrl}/api/fundiario/car/geojson?uf=RS&municipio=PASSO%20FUNDO&origem=TODOS`);
  assert.strictEqual(resAll.status, 200, 'Endpoint deve retornar 200 OK');
  const dataAll = await resAll.json();
  assert.strictEqual(dataAll.success, true, 'data.success deve ser true');
  assert.ok(dataAll.features.length > 0, 'Deve retornar features para Passo Fundo');

  // Verifica se cada feature possui a propriedade tipo_pessoa
  const sampleFeat = dataAll.features[0];
  assert.ok('tipo_pessoa' in sampleFeat.properties, 'Feature deve possuir propriedade tipo_pessoa');
  assert.ok(['PJ', 'PF', 'INDETERMINADO'].includes(sampleFeat.properties.tipo_pessoa), 'tipo_pessoa deve ser válido');
  console.log(`  ✅ Endpoint retornou ${dataAll.features.length} fazendas com properties.tipo_pessoa presente`);

  // Teste de filtro no servidor ?tipo_pessoa=PJ
  const resPj = await fetch(`${baseUrl}/api/fundiario/car/geojson?uf=RS&municipio=PASSO%20FUNDO&tipo_pessoa=PJ`);
  assert.strictEqual(resPj.status, 200, 'Endpoint com ?tipo_pessoa=PJ deve retornar 200');
  const dataPj = await resPj.json();
  assert.strictEqual(dataPj.success, true);
  const nonPj = dataPj.features.filter(f => f.properties.tipo_pessoa !== 'PJ');
  assert.strictEqual(nonPj.length, 0, 'Filtro ?tipo_pessoa=PJ não deve conter features que não sejam PJ');
  console.log(`  ✅ Endpoint ?tipo_pessoa=PJ filtrou com precisão cirúrgica (${dataPj.features.length} imóveis PJ)`);

  // Teste de filtro no servidor ?tipo_pessoa=PF
  const resPf = await fetch(`${baseUrl}/api/fundiario/car/geojson?uf=RS&municipio=PASSO%20FUNDO&tipo_pessoa=PF`);
  assert.strictEqual(resPf.status, 200, 'Endpoint com ?tipo_pessoa=PF deve retornar 200');
  const dataPf = await resPf.json();
  assert.strictEqual(dataPf.success, true);
  const nonPf = dataPf.features.filter(f => f.properties.tipo_pessoa !== 'PF');
  assert.strictEqual(nonPf.length, 0, 'Filtro ?tipo_pessoa=PF não deve conter features que não sejam PF');
  console.log(`  ✅ Endpoint ?tipo_pessoa=PF filtrou com precisão cirúrgica (${dataPf.features.length} imóveis PF)`);

  // 3. Validação dos Controles de UI no Frontend
  console.log('  🎨 Validando marcação HTML e CSS dos controles de entidade...');
  const htmlContent = fs.readFileSync(path.join(ROOT_DIR, 'client', 'index.html'), 'utf-8');
  assert.ok(htmlContent.includes('id="mapEntityTogglesContainer"'), 'Container de toggles de entidade deve existir');
  assert.ok(htmlContent.includes('id="filterEntityAllBtn"'), 'Botão Todos deve existir');
  assert.ok(htmlContent.includes('id="filterEntityPjBtn"'), 'Botão PJ deve existir');
  assert.ok(htmlContent.includes('id="filterEntityPfBtn"'), 'Botão PF deve existir');
  assert.ok(htmlContent.includes('id="ruralEntityBadge"'), 'Badge de entidade ruralEntityBadge deve existir no drawer');
  assert.ok(htmlContent.includes('id="ruralPjCorporateBlock"'), 'Bloco corporativo ruralPjCorporateBlock deve existir no drawer');
  console.log('  ✅ Controles de interface e blocos do drawer verificados em client/index.html');

  const cssContent = fs.readFileSync(path.join(ROOT_DIR, 'client', 'css', 'styles.css'), 'utf-8');
  assert.ok(cssContent.includes('.map-entity-toggles-container'), 'Estilo do container de entidade deve existir no CSS');
  assert.ok(cssContent.includes('.btn-entity-toggle.pj.active'), 'Estilo ativo PJ deve existir no CSS');
  assert.ok(cssContent.includes('.btn-entity-toggle.pf.active'), 'Estilo ativo PF deve existir no CSS');
  console.log('  ✅ Estilos CSS verificados em client/css/styles.css');

  // 4. Validação do Código JS do MapEngine e App
  const mapEngineCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'js', 'mapEngine.js'), 'utf-8');
  assert.ok(mapEngineCode.includes('tipoPessoaFilter'), 'mapEngine deve possuir estado tipoPessoaFilter');
  assert.ok(mapEngineCode.includes('setEntityFilter'), 'mapEngine deve expor setEntityFilter');
  assert.ok(mapEngineCode.includes("['==', ['get', 'tipo_pessoa'], 'PJ']"), 'mapEngine deve filtrar PJ no WebGL MapLibre');
  console.log('  ✅ Motor MapLibre WebGL devidamente integrado com o filtro de entidade');

  const appCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'js', 'app.js'), 'utf-8');
  assert.ok(appCode.includes('ruralEntityBadge'), 'app.js deve manipular ruralEntityBadge');
  assert.ok(appCode.includes('renderPjCorporateUI'), 'app.js deve possuir renderPjCorporateUI');
  console.log('  ✅ app.js devidamente integrado para renderização do drawer e QSA');

  console.log('\n🎉 [SUCESSO TOTAL] Todas as 4 fases da Segmentação PJ vs PF foram validadas com 100% de conformidade!');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
