/**
 * tests/test_phase47_step3_full_country_mesh_and_tabs.js
 * 
 * Bateria de Testes: FASE 47 - ETAPA 3 (ABAS DE CATEGORIA & EXPANSÃO NACIONAL DE MALHA FUNDIÁRIA)
 * Valida:
 * 1. Isolamento das Tabelas: Leads B2B e Produtores Rurais separados por aba/origem
 * 2. Injeção de Propriedade Rural: POST /api/leads/rural persiste fazenda com tag ORIGEM: RURAL / SIGEF
 * 3. Filtro por Categoria: Query filter com origem=EMPRESAS oculta fazendas; origem=RURAL_SIGEF exibe apenas fazendas
 * 4. Expansão Nacional da Malha: Geração e Ingestão de malha calibrada para qualquer município do Brasil (RS, GO, MT, etc.)
 * 5. Cobertura dos 27 Estados: Validação de centróides e coordenadas estaduais completas
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import { queryLeads, createRuralPropertyLead } from '../server/src/services/leadsService.js';
import { syncRegionalCadastralMesh, getRuralGeoJson } from '../server/src/services/geoFundiarioService.js';
import { UF_CENTROIDS } from '../server/src/modules/gis/index.js';

console.log('🚀 Iniciando Bateria de Testes: Abas de Categoria e Expansão Territorial Nacional...');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

const testTenant = 'tenant-test-country-mesh-tabs';

async function runTests() {
  // Insere tenant para satisfazer foreign keys
  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit)
    VALUES (?, 'Tenant Teste Malha Nacional', '88.777.666/0001-55', 'ENTERPRISE', 'ACTIVE', 10, 1000, 10000)
  `).run(testTenant);

  // Limpa registros prévios do tenant de teste
  db.prepare('DELETE FROM leads WHERE tenant_id = ?').run(testTenant);
  db.prepare('DELETE FROM propriedades_rurais WHERE tenant_id = ?').run(testTenant);

  // 1. Cadastra uma empresa comum B2B
  db.prepare(`
    INSERT INTO leads (
      id, tenant_id, cnpj, cnpj_raw, razao_social, nome_fantasia,
      cnae_principal_codigo, cnae_principal_descricao, porte, situacao_cadastral,
      municipio, uf, origem, tag, target_type, capital_social, created_at
    ) VALUES (
      'lead-b2b-01', ?, '11.222.333/0001-44', '11222333000144',
      'Distribuidora de Peças Agrícolas Alfa Ltda', 'Alfa Peças',
      '4661-3/00', 'Comércio atacadista de máquinas e equipamentos agrícolas', 'DEMAIS', 'ATIVA',
      'PASSO FUNDO', 'RS', 'RECEITA_FEDERAL', 'ORIGEM: RECEITA_FEDERAL', 'BUYER', 500000, datetime('now')
    )
  `).run(testTenant);

  // Teste 1: Cobertura dos 27 Estados da Federação no Motor GIS
  it('Deve conter centróides válidos para todas as 27 UFs do Brasil', () => {
    const expectedUfs = [
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
      'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
      'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    ];
    for (const uf of expectedUfs) {
      assert(UF_CENTROIDS[uf], `Centróide para a UF ${uf} deve existir`);
      assert(typeof UF_CENTROIDS[uf].lat === 'number', `Latitude da UF ${uf} deve ser numérica`);
      assert(typeof UF_CENTROIDS[uf].lng === 'number', `Longitude da UF ${uf} deve ser numérica`);
    }
  });

  // Teste 2: Injeção de Propriedade Rural na Tabela de Leads com Tag SIGEF
  await itAsync('Deve injetar propriedade rural com tag "ORIGEM: RURAL / SIGEF" e isolamento de origem', async () => {
    const propData = {
      id_sigef: 'SIGEF-RS-CRUZALTA-999',
      nome_imovel: 'Fazenda Estrela do Sul',
      municipio: 'CRUZ ALTA',
      uf: 'RS',
      area_hectares: 3200,
      nome_titular: 'Rubens Dornelles Schneider',
      cpf_cnpj_titular: '04.991.234/0001-88',
      whatsapp_validado: '+555599881122',
      email_validado: 'rubens@estreladosul.com.br',
      centroide_lat: -28.6389,
      centroide_lng: -53.6064
    };

    const created = await createRuralPropertyLead(propData, testTenant);
    assert.strictEqual(created.origem, 'RURAL_SIGEF');
    assert.strictEqual(created.tag, 'ORIGEM: RURAL / SIGEF');
    assert.strictEqual(created.razao_social, 'Fazenda Estrela do Sul (Rubens Dornelles Schneider)');
    assert.strictEqual(created.uf, 'RS');
    assert.strictEqual(created.municipio, 'CRUZ ALTA');
  });

  // Teste 3: Filtro da Tabela - Aba [ 🏢 Empresas B2B ] não deve mostrar o produtor rural
  it('Aba padrão EMPRESAS deve retornar apenas empresas comerciais, omitindo produtores rurais', () => {
    const res = queryLeads({ tenant_id: testTenant, origem: 'EMPRESAS' });
    assert.strictEqual(res.total_count, 1, 'Deve conter apenas 1 lead na aba Empresas');
    assert.strictEqual(res.data[0].id, 'lead-b2b-01');
    assert.notStrictEqual(res.data[0].origem, 'RURAL_SIGEF');
  });

  // Teste 4: Filtro da Tabela - Aba [ 🌾 Produtores Rurais ] deve mostrar exclusivamente produtores rurais
  it('Aba RURAL_SIGEF deve retornar exclusivamente produtores rurais e fazendas', () => {
    const res = queryLeads({ tenant_id: testTenant, origem: 'RURAL_SIGEF' });
    assert.strictEqual(res.total_count, 1, 'Deve conter 1 lead na aba Produtores Rurais');
    assert.strictEqual(res.data[0].origem, 'RURAL_SIGEF');
    assert.strictEqual(res.data[0].tag, 'ORIGEM: RURAL / SIGEF');
  });

  // Teste 5: Filtro da Tabela - Aba [ Ver Todos ] deve unificar a visão
  it('Aba TODOS deve unificar empresas B2B e produtores rurais', () => {
    const res = queryLeads({ tenant_id: testTenant, origem: 'TODOS' });
    assert.strictEqual(res.total_count, 2, 'Deve conter os 2 registros (empresa B2B e produtor rural)');
  });

  // Teste 6: Ingestão de Malha Regional Completa para Cidades do Rio Grande do Sul (Passo Fundo / Cruz Alta)
  await itAsync('Deve sincronizar malha robusta (>5 parcelas) para município do RS sob demanda', async () => {
    const res = await syncRegionalCadastralMesh({ uf: 'RS', municipio: 'PASSO FUNDO' }, testTenant);
    assert(res.success, 'Sync regional deve retornar sucesso');
    assert(res.total_ingested >= 8, `Deve ingerir cluster robusto (obtido: ${res.total_ingested})`);

    const geojson = await getRuralGeoJson({ uf: 'RS', municipio: 'PASSO FUNDO' }, testTenant);
    assert(geojson.features.length >= 8, 'GeoJSON deve conter todas as parcelas ingeridas no banco');
    assert.strictEqual(geojson.features[0].properties.uf, 'RS');
    assert.strictEqual(geojson.features[0].properties.municipio, 'PASSO FUNDO');
  });

  // Teste 7: Ingestão de Malha Regional para Rio Verde/GO com cluster completo
  await itAsync('Deve sincronizar e disponibilizar parcelas rurais robustas para Rio Verde / GO', async () => {
    const res = await syncRegionalCadastralMesh({ uf: 'GO', municipio: 'RIO VERDE' }, testTenant);
    assert(res.success, 'Sync regional de Rio Verde deve retornar sucesso');
    assert(res.total_ingested >= 8, `Deve conter cluster ampliado de Rio Verde (obtido: ${res.total_ingested})`);

    const geojson = await getRuralGeoJson({ uf: 'GO', municipio: 'RIO VERDE' }, testTenant);
    assert(geojson.features.length >= 8, 'GeoJSON de Rio Verde deve refletir a malha expandida');
  });

  // Teste 8: Auto-Injeção - Qualquer fazenda mapeada alimenta a aba Produtores Rurais sem sujar Empresas B2B
  await itAsync('Qualquer malha pesquisada alimenta automaticamente a aba Produtores Rurais mantendo Empresas B2B isolada', async () => {
    // Aguarda microtarefas assíncronas de gravação de leads
    await new Promise(resolve => setTimeout(resolve, 300));

    // Na aba Empresas B2B, deve permanecer apenas a empresa original B2B
    const empresasRes = queryLeads({ tenant_id: testTenant, origem: 'EMPRESAS' });
    assert.strictEqual(empresasRes.total_count, 1, 'Aba Empresas B2B deve conter apenas 1 empresa comercial isolada');
    assert.strictEqual(empresasRes.data[0].id, 'lead-b2b-01');

    // Na aba Produtores Rurais, todas as fazendas ingeridas no teste devem estar presentes
    const ruralRes = queryLeads({ tenant_id: testTenant, origem: 'RURAL_SIGEF', page_size: 50 });
    assert(ruralRes.total_count >= 10, `Aba Produtores Rurais deve conter as fazendas mapeadas automaticamente (obtido: ${ruralRes.total_count})`);
    assert(ruralRes.data.every(r => r.origem === 'RURAL_SIGEF'), 'Todos os leads na aba Rural devem ter origem RURAL_SIGEF');
  });

  console.log(`\n========================================`);
  console.log(`Resultados dos Testes: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
