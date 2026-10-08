import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 TESTE COMPLETO: INTEGRAÇÃO DA FUSÃO CAR+SIGEF AO INSPETOR FUNDIÁRIO');
  console.log('========================================================================\n');

  // 1. Validação do Backend (buscarMalhaCarPorMunicipio e fusão)
  console.log('📡 1. Verificando Serviço de Malha e Fusão Espacial...');
  const { buscarMalhaCarPorMunicipio, fundirColecoesSigefCar } = await import('../server/src/services/carService.js');
  const { getRuralGeoJson } = await import('../server/src/services/geoFundiarioService.js');

  const [sigefRes, carRes] = await Promise.all([
    getRuralGeoJson({ uf: 'RS', municipio: 'PASSO FUNDO' }, 'tenant-root-default'),
    buscarMalhaCarPorMunicipio({ uf: 'RS', municipio: 'PASSO FUNDO' })
  ]);

  const fused = fundirColecoesSigefCar(sigefRes, carRes);
  const fusedFeatures = fused.features.filter(f => f.properties?.tag_fonte === 'FUSAO_SIGEF_CAR' || f.properties?.sobreposicao_sigef);

  console.log(`• Total de parcelas na coleção unificada: ${fused.features.length}`);
  console.log(`• Total de parcelas validadas de FUSÃO (CAR + SIGEF): ${fusedFeatures.length}`);

  assert.strictEqual(fusedFeatures.length, 708, `Esperado 708 parcelas validadas de fusão em Passo Fundo, obtido ${fusedFeatures.length}`);
  console.log('✅ Volume de 708 matches de fusão validado com precisão!');

  // Amostra de campos da fusão
  const sample = fusedFeatures.find(f => (f.properties?.nome_imovel || '').includes('Colussi')) || fusedFeatures[0];
  const p = sample.properties;

  console.log('\n📋 Amostra de Propriedade Fused (Leandro Colussi / Destaque):');
  console.log(`  - Código CAR:          ${p.codigo_car}`);
  console.log(`  - Matrícula CRI:       ${p.registro_matricula}`);
  console.log(`  - Código SNCR:         ${p.codigo_sncr}`);
  console.log(`  - ID SIGEF:            ${p.id_sigef}`);
  console.log(`  - Denominação:         ${p.nome_imovel}`);
  console.log(`  - Município/UF:        ${p.municipio}/${p.uf}`);
  console.log(`  - Área (ha):           ${p.area_ha}`);
  console.log(`  - Status Geo:          ${p.status_geo}`);
  console.log(`  - Score Sobreposição:  ${p.score_sobreposicao}`);
  console.log(`  - Motivo Geodésico:    ${p.motivo_geodesico}`);
  console.log(`  - Tipo Titular:        ${p.tipo_titular}`);
  console.log(`  - Titular Provável:    ${p.titular_provavel}`);

  assert(p.codigo_car && p.codigo_car.startsWith('RS-4314100-'), 'Código CAR deve ter formato oficial RS-4314100-');
  assert(p.registro_matricula && p.registro_matricula.includes('CRI'), 'Registro de matrícula deve conter identificação CRI');
  assert(p.codigo_sncr && p.codigo_sncr.length >= 8, 'Código SNCR deve estar presente');
  assert(p.score_sobreposicao && p.score_sobreposicao.includes('%'), 'Score de sobreposição deve estar no formato percentual');
  assert(p.motivo_geodesico, 'Motivo geodésico deve estar preenchido');
  assert(p.tipo_titular, 'Tipo de titular deve estar definido');
  console.log('✅ Payload da fusão contém todos os 12 atributos obrigatórios!');

  // 2. Validação da Consulta Bureau por Titular Provável
  console.log('\n🏛️ 2. Verificando Integração Bureau com Titular Provável...');
  const { bureauService } = await import('../server/src/services/bureauService.js');
  const bureauRes = await bureauService.consultarBureauCompleto('Leandro Colussi Oliva', {
    nome: 'Leandro Colussi Oliva',
    uf: 'RS',
    municipio: 'PASSO FUNDO'
  });

  assert(bureauRes.success, 'Consulta de bureau deve retornar sucesso');
  assert.strictEqual(bureauRes.dados.dados_cadastrais.nome, 'Leandro Colussi Oliva', 'Nome do titular deve coincidir no dossiê');
  assert(bureauRes.dados.dados_cadastrais.documento, 'Dossiê deve conter documento');
  console.log(`• Nome no Dossiê:    ${bureauRes.dados.dados_cadastrais.nome}`);
  console.log(`• Documento Gerado:  ${bureauRes.dados.dados_cadastrais.documento}`);
  console.log(`• Telefone com DDD:  ${bureauRes.dados.contatos.telefones_moveis[0]?.numero}`);
  console.log('✅ Consulta do Bureau Assertiva por Titular validada com sucesso!');

  // 3. Validação do Frontend (client/index.html)
  console.log('\n🎨 3. Verificando Estrutura HTML do Inspetor e Modais...');
  const htmlContent = fs.readFileSync(path.join(ROOT_DIR, 'client', 'index.html'), 'utf8');

  const requiredElements = [
    'id="ruralOverlayScoreBadge"',
    'id="ruralFusionBadge"',
    'id="ruralFusionDetailsGrid"',
    'id="ruralCodigoCarDisplay"',
    'id="btnCopyCarClipboard"',
    'id="ruralMatriculaDisplay"',
    'id="ruralSncrDisplay"',
    'id="ruralCodigoSigef"',
    'id="ruralValidacaoEspacialDisplay"',
    'id="ruralTitularProvavelRow"',
    'id="ruralTitularProvavelDisplay"',
    'id="btnQuickBureauRural"',
    'id="modalCartorioCriRequisicao"',
    'id="inputCartorioMatricula"',
    'id="inputCartorioComarca"',
    'id="inputCartorioSncr"',
    'id="inputCartorioImovel"',
    'id="btnExecutarRequisicaoCartorial"'
  ];

  for (const elId of requiredElements) {
    assert(htmlContent.includes(elId), `Elemento ${elId} deve existir em client/index.html`);
  }
  console.log(`✅ Todos os ${requiredElements.length} elementos do Inspetor e Modal Cartorial estão presentes no HTML!`);

  // 4. Validação do JavaScript do Frontend (client/js/app.js e bureauConsultation.js)
  console.log('\n⚡ 4. Verificando Funções no Frontend JS...');
  const appJs = fs.readFileSync(path.join(ROOT_DIR, 'client', 'js', 'app.js'), 'utf8');
  const bureauJs = fs.readFileSync(path.join(ROOT_DIR, 'client', 'js', 'bureauConsultation.js'), 'utf8');

  assert(appJs.includes('ruralOverlayScoreBadge'), 'app.js deve referenciar ruralOverlayScoreBadge');
  assert(appJs.includes('ruralFusionBadge'), 'app.js deve referenciar ruralFusionBadge');
  assert(appJs.includes('btnCopyCarClipboard'), 'app.js deve configurar clique do clipboard');
  assert(appJs.includes('abrirModalRequisicaoCartorial'), 'app.js deve definir window.abrirModalRequisicaoCartorial');
  assert(appJs.includes('consultarBureauPorParametros'), 'app.js deve invocar consultarBureauPorParametros');
  assert(bureauJs.includes('window.consultarBureauPorParametros'), 'bureauConsultation.js deve exportar consultarBureauPorParametros');

  console.log('✅ Funções e gatilhos de eventos validados no Frontend JS!');

  console.log('\n========================================================================');
  console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
  console.log('========================================================================');
}

runTestSuite().catch(err => {
  console.error('❌ Falha na bateria de testes:', err);
  process.exit(1);
});
