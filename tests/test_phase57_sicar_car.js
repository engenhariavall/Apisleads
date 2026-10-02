/**
 * tests/test_phase57_sicar_car.js
 * 
 * Bateria de Testes E2E e Unitários da FASE 57: INTEGRAÇÃO SICAR / CAR
 * - Etapa 1: carService.js (normalização, fusão multi-fonte, tag_fonte)
 * - Etapa 2: SQLite Schema, Colunas, Índices e Persistência Resiliente (Bugfix MT)
 * - Etapa 3: Identificação Visual e Suporte no Frontend (Camadas e Dossier)
 * - Etapa 4: Intent Scoring Ambiental (Gap +40, Pendência +35, Conforme +20)
 * - Etapa 5: Copiloto IA (Tool filtrarPassivoAmbiental e Fallback Heurístico)
 */

import assert from 'node:assert';
import db from '../server/src/config/database.js';
import { 
  normalizarFeatureCar, 
  fundirColecoesSigefCar,
  buscarMalhaCarPorMunicipio 
} from '../server/src/services/carService.js';
import { saveOrUpdateRuralProperty } from '../server/src/services/geoFundiarioService.js';
import { calculateRuralIntentScore } from '../server/src/services/intentScoringService.js';
import { COPILOT_TOOLS, aiCopilotService } from '../server/src/services/aiCopilotService.js';

console.log('================================================================');
console.log('🧪 INICIANDO HOMOLOGAÇÃO DA FASE 57 — INTEGRAÇÃO SICAR / CAR');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

async function it(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Erro: ${err.message}`);
    failCount++;
  }
}

async function run() {
  // ─────────────────────────────────────────────────────────────────────────────
  // ETAPA 1: carService (Normalização e Algoritmo de Fusão)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('🌿 ETAPA 1: Fundação do Serviço CAR & Algoritmo de Fusão');

  await it('1.1 normalizarFeatureCar deve padronizar propriedades brutas do SICAR para schema GeoJSON', () => {
    const rawCarFeature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[ -52.6, -27.1 ], [ -52.59, -27.1 ], [ -52.59, -27.09 ], [ -52.6, -27.1 ]]]
      },
      properties: {
        cod_imovel: 'SC-4204202-A1B2C3D4E5F6G7H8',
        num_area: '145.5',
        nom_munici: 'Chapecó',
        des_condic: 'Aguardando Análise',
        ind_status: 'PE',
        val_area_p: '15.2',
        val_area_r: '29.1',
        cpf_cnpj: '***.456.789-**',
        nome_prop: 'Produtor Rural Minifúndio'
      }
    };

    const norm = normalizarFeatureCar(rawCarFeature, { uf: 'SC', municipio: 'Chapecó' });
    assert.strictEqual(norm.type, 'Feature');
    assert.strictEqual(norm.properties.codigo_car, 'SC-4204202-A1B2C3D4E5F6G7H8');
    assert.strictEqual(norm.properties.area_hectares, 145.5);
    assert.strictEqual(norm.properties.status_car, 'PENDENTE');
    assert.strictEqual(norm.properties.tag_fonte, 'SICAR');
    assert.strictEqual(norm.properties.source, 'CAR');
    assert.strictEqual(norm.properties.tem_passivo_ambiental, true);
    assert.strictEqual(norm.properties.area_app_ha, 15.2);
    assert.strictEqual(norm.properties.area_reserva_legal_ha, 29.1);
  });

  await it('1.2 fundirColecoesSigefCar deve classificar proveniências (SICAR, SIGEF, FUSAO_SIGEF_CAR)', () => {
    // Mock SIGEF: parcela certificada
    const sigefColl = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[ -52.601, -27.101 ], [ -52.599, -27.101 ], [ -52.599, -27.099 ], [ -52.601, -27.101 ]]]
          },
          properties: {
            id_sigef: 'SIGEF-001',
            nome_imovel: 'Fazenda Santa Maria',
            centroide_lat: -27.100,
            centroide_lng: -52.600,
            area_hectares: 250
          }
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[ -50.0, -25.0 ], [ -49.9, -25.0 ], [ -49.9, -24.9 ], [ -50.0, -25.0 ]]]
          },
          properties: {
            id_sigef: 'SIGEF-SOLITARIO',
            nome_imovel: 'Fazenda Isolada',
            centroide_lat: -24.95,
            centroide_lng: -49.95,
            area_hectares: 500
          }
        }
      ]
    };

    // Mock CAR: um correspondente próximo (<= 0.5km) e um minifúndio exclusivo
    const carColl = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[ -52.602, -27.102 ], [ -52.598, -27.102 ], [ -52.598, -27.098 ], [ -52.602, -27.102 ]]]
          },
          properties: {
            codigo_car: 'CAR-001',
            status_car: 'ATIVO',
            centroide_lat: -27.101, // ~150 metros do SIGEF-001 -> DEVE FUNDIR
            centroide_lng: -52.601,
            area_app_ha: 30,
            area_reserva_legal_ha: 50
          }
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[ -53.0, -28.0 ], [ -52.9, -28.0 ], [ -52.9, -27.9 ], [ -53.0, -28.0 ]]]
          },
          properties: {
            codigo_car: 'CAR-MINIFUNDIO-SUL',
            status_car: 'PENDENTE',
            centroide_lat: -27.95,
            centroide_lng: -52.95,
            area_hectares: 18.5
          }
        }
      ]
    };

    const fused = fundirColecoesSigefCar(sigefColl, carColl);
    assert.strictEqual(fused.features.length, 3, 'Deve conter 1 fusão + 1 sigef isolado + 1 car isolado');

    const fusaoItem = fused.features.find(f => f.properties.tag_fonte === 'FUSAO_SIGEF_CAR');
    assert.ok(fusaoItem, 'Deve ter gerado item FUSAO_SIGEF_CAR');
    assert.strictEqual(fusaoItem.properties.id_sigef, 'SIGEF-001');
    assert.strictEqual(fusaoItem.properties.codigo_car, 'CAR-001');
    assert.strictEqual(fusaoItem.properties.status_car, 'ATIVO');

    const sigefItem = fused.features.find(f => f.properties.id_sigef === 'SIGEF-SOLITARIO');
    assert.strictEqual(sigefItem.properties.tag_fonte, 'SIGEF');
    assert.strictEqual(sigefItem.properties.alerta_ambiental, 'SEM_CAR_MAPEADO');

    const carItem = fused.features.find(f => f.properties.codigo_car === 'CAR-MINIFUNDIO-SUL');
    assert.strictEqual(carItem.properties.tag_fonte, 'SICAR');
    assert.strictEqual(carItem.properties.status_car, 'PENDENTE');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ETAPA 2: SQLite Schema & Bugfix de Persistência
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🗄️ ETAPA 2: Schema SQLite & Persistência Multi-Fonte');

  await it('2.1 Tabela propriedades_rurais deve conter as 8 novas colunas do CAR', () => {
    const tableInfo = db.prepare(`PRAGMA table_info(propriedades_rurais)`).all();
    const columnNames = tableInfo.map(c => c.name);

    const requiredCols = [
      'codigo_car',
      'status_car',
      'condicao_car',
      'tag_fonte',
      'area_app_ha',
      'area_reserva_legal_ha',
      'tem_passivo_ambiental',
      'alerta_ambiental'
    ];

    for (const col of requiredCols) {
      assert.ok(columnNames.includes(col), `Coluna ${col} deve existir em propriedades_rurais`);
    }
  });

  await it('2.2 Bugfix MT: saveOrUpdateRuralProperty deve persistir registro originário de CAR com segurança (sem falha de NOT NULL)', async () => {
    const carPropertyData = {
      // Propositalmente sem nome_imovel e sem nome_titular para testar o fallback do Bugfix MT
      municipio: 'Sinop',
      uf: 'MT',
      area_hectares: 85.0,
      geometria_poligono: JSON.stringify({ 
        type: 'Polygon', 
        coordinates: [[[-55.5, -11.8], [-55.4, -11.8], [-55.4, -11.7], [-55.5, -11.8]]] 
      }),
      codigo_car: 'MT-5107909-TESTE-BUGFIX-SINOP',
      status_car: 'PENDENTE',
      tag_fonte: 'SICAR',
      area_app_ha: 12.5,
      area_reserva_legal_ha: 17.0,
      tem_passivo_ambiental: true,
      alerta_ambiental: 'PASSIVO_AMBIENTAL_APP_RL'
    };

    const saved = await saveOrUpdateRuralProperty(carPropertyData);
    assert.ok(saved && saved.id, 'Deve salvar ou atualizar a propriedade sem lançar erro de NOT NULL');
    
    // Consulta o registro persistido no banco para verificar colunas CAR e fallbacks
    const row = db.prepare('SELECT * FROM propriedades_rurais WHERE id = ?').get(saved.id);
    assert.ok(row, 'Registro deve existir no banco de dados');
    assert.strictEqual(row.tag_fonte, 'SICAR');
    assert.strictEqual(row.codigo_car, 'MT-5107909-TESTE-BUGFIX-SINOP');
    assert.strictEqual(row.status_car, 'PENDENTE');
    assert.ok(row.nome_imovel.includes('Imóvel Rural'), 'Deve aplicar fallback elegante no nome_imovel');
    assert.ok(row.nome_titular.includes('não informado'), 'Deve aplicar fallback elegante no nome_titular');

    // Limpa registro de teste do banco de dados
    db.prepare('DELETE FROM propriedades_rurais WHERE id = ?').run(saved.id);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ETAPA 4: Intent Scoring Ambiental
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🎯 ETAPA 4: Intent Scoring Ambiental & Gaps de Regularização');

  await it('4.1 Sem CAR mapeado deve somar +40 pts com trigger de urgência regulatória', () => {
    const titular = {};
    const propSemCar = {
      status_geo: 'CERTIFICADO',
      codigo_car: null,
      tag_fonte: 'SIGEF',
      alerta_ambiental: 'SEM_CAR_MAPEADO'
    };

    const res = calculateRuralIntentScore(titular, propSemCar);
    assert.ok(res.intent_score >= 40, `Score esperado >= 40, recebido: ${res.intent_score}`);
    assert.ok(
      res.intent_triggers.some(t => t.includes('Vazio Regulatório Ambiental (Sem CAR)')),
      'Deve conter trigger de Vazio Regulatório'
    );
  });

  await it('4.2 CAR Pendente ou com Passivo deve somar +35 pts com trigger de oportunidade de consultoria', () => {
    const titular = {};
    const propPendente = {
      status_geo: 'CERTIFICADO',
      codigo_car: 'PR-4100000-XYZ',
      status_car: 'PENDENTE',
      tag_fonte: 'SICAR',
      tem_passivo_ambiental: 1
    };

    const res = calculateRuralIntentScore(titular, propPendente);
    assert.ok(res.intent_score >= 35, `Score esperado >= 35, recebido: ${res.intent_score}`);
    assert.ok(
      res.intent_triggers.some(t => t.includes('Pendência Ambiental SICAR')),
      'Deve conter trigger de Pendência Ambiental SICAR'
    );
  });

  await it('4.3 CAR Validado e Conforme deve somar +20 pts com trigger de Conformidade Verde', () => {
    const titular = {};
    const propAtiva = {
      status_geo: 'CERTIFICADO',
      codigo_car: 'RS-4300000-ABC',
      status_car: 'ATIVO',
      tag_fonte: 'FUSAO_SIGEF_CAR',
      tem_passivo_ambiental: 0
    };

    const res = calculateRuralIntentScore(titular, propAtiva);
    assert.ok(res.intent_score >= 20, `Score esperado >= 20, recebido: ${res.intent_score}`);
    assert.ok(
      res.intent_triggers.some(t => t.includes('Conformidade Verde (CAR Validado)')),
      'Deve conter trigger de Conformidade Verde'
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ETAPA 5: IA Copilot & Function Calling
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🤖 ETAPA 5: IA Copilot — Tool filtrarPassivoAmbiental & Detecção Semântica');

  await it('5.1 COPILOT_TOOLS deve expor a ferramenta filtrarPassivoAmbiental com os parâmetros corretos', () => {
    const carTool = COPILOT_TOOLS.find(t => 
      (t.function && t.function.name === 'filtrarPassivoAmbiental') || 
      t.name === 'filtrarPassivoAmbiental'
    );
    assert.ok(carTool, 'Tool filtrarPassivoAmbiental deve estar registrada em COPILOT_TOOLS');
    
    const fnDecl = carTool.function || carTool;
    const propKeys = Object.keys(fnDecl.parameters?.properties || {});
    assert.ok(propKeys.includes('mostrar_apenas_sicar'), 'Deve conter prop mostrar_apenas_sicar');
    assert.ok(propKeys.includes('status_car'), 'Deve conter prop status_car');
  });

  await it('5.2 aiCopilotService deve disparar trigger_car_filter via fallback semântico para prompts de CAR e passivo', async () => {
    const prompt = 'Filtrar propriedades com CAR pendente e passivo ambiental em Sorriso MT';
    const response = await aiCopilotService.processChat({ prompt, context: {} });
    
    assert.ok(response, 'Deve retornar resposta estruturada');
    assert.strictEqual(response.action, 'trigger_car_filter', 'Action disparada deve ser trigger_car_filter');
    const payload = response.action_payload || response.actionPayload;
    assert.ok(payload, 'Deve incluir action_payload');
    assert.strictEqual(payload.status_car, 'PENDENTE');
    assert.strictEqual(payload.uf, 'MT');
  });

  console.log('\n================================================================');
  console.log(`📊 RESULTADO FINAL: ${passCount} Passaram | ${failCount} Falharam`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Erro fatal no runner de testes:', err);
  process.exit(1);
});
