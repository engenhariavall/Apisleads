/**
 * TESTE AUTOMATIZADO E2E: FASE 16 — INTELIGÊNCIA CADASTRAL PROFUNDA
 * (Taxonomia Proprietária, Vitalidade Anti-Zumbi & Auditoria Google Street View)
 */

import assert from 'assert';
import { resolveRealCategory } from './server/src/modules/intelligence/categoryResolver.js';
import { calculateVitalityIndex } from './server/src/modules/intelligence/vitalityEngine.js';

const BASE_URL = 'http://localhost:3000';

async function runPhase16Tests() {
  console.log('🧪 Iniciando Bateria de Testes da Fase 16 (Inteligência Cadastral Profunda)...\n');
  let testsPassed = 0;
  let testsTotal = 0;

  function pass(desc) {
    testsTotal++;
    testsPassed++;
    console.log(`✅ [PASS] ${desc}`);
  }

  function fail(desc, err) {
    testsTotal++;
    console.error(`❌ [FAIL] ${desc}`, err);
    process.exit(1);
  }

  try {
    // -------------------------------------------------------------------------
    // TESTES UNITÁRIOS 1: Motor de Taxonomia Proprietária (categoryResolver)
    // -------------------------------------------------------------------------
    console.log('--- Testes Unitários: categoryResolver ---');

    // Caso 1: Convergência Total (Agro puro)
    const leadAgroPuro = {
      razao_social: 'SLC AGRICOLA S.A.',
      nome_fantasia: 'SLC AGRICOLA',
      cnae_principal_codigo: '0111-3/01',
      cnae_principal_descricao: 'Cultivo de soja',
      cnaes_secundarios: ['0111-3/02', '0112-1/01']
    };
    const catAgro = resolveRealCategory(leadAgroPuro);
    assert.strictEqual(catAgro.categoria_id, 'AGRO', 'Deveria classificar como AGRO');
    assert.strictEqual(catAgro.categoria_real, 'Agronegócio & Produção Rural');
    assert.strictEqual(catAgro.divergencia_cadastral, false, 'Não deve haver divergência quando há convergência');
    pass('categoryResolver classifica corretamente empresa com CNAE primário agro');

    // Caso 2: Resolução de Divergência Cadastral (Holding que é de fato Agropecuária)
    const leadHoldingAgro = {
      razao_social: 'SANTA RITA PARTICIPACOES E EMPREENDIMENTOS LTDA',
      nome_fantasia: 'FAZENDA SANTA RITA AGROPECUARIA',
      cnae_principal_codigo: '6462-0/00',
      cnae_principal_descricao: 'Holdings de instituições não-financeiras',
      cnaes_secundarios: [
        { codigo: '0151-2/01', descricao: 'Criação de bovinos para corte' },
        { codigo: '0111-3/01', descricao: 'Cultivo de soja' }
      ]
    };
    const catHoldingAgro = resolveRealCategory(leadHoldingAgro);
    assert.strictEqual(catHoldingAgro.categoria_id, 'AGRO', 'Deveria identificar atividade real como AGRO');
    assert.strictEqual(catHoldingAgro.divergencia_cadastral, true, 'Deveria apontar divergência de CNAE');
    assert.ok(catHoldingAgro.nivel_confianca >= 80, 'Nível de confiança deve ser alto');
    pass('categoryResolver detecta e resolve divergência cadastral de Holding operando Fazenda');

    // Caso 3: Divergência de Consultoria operando Clínica Médica
    const leadClinica = {
      razao_social: 'MED ASSESSORIA E GESTAO INTEGRADA LTDA',
      nome_fantasia: 'CENTRO MEDICO E CLINICA SAO JOSE',
      cnae_principal_codigo: '7020-4/00',
      cnae_principal_descricao: 'Atividades de consultoria em gestão empresarial',
      cnaes_secundarios: [{ codigo: '8630-5/01', descricao: 'Atividade médica ambulatorial' }]
    };
    const catClinica = resolveRealCategory(leadClinica);
    assert.strictEqual(catClinica.categoria_id, 'SAUDE');
    assert.strictEqual(catClinica.divergencia_cadastral, true);
    pass('categoryResolver identifica atividade real de Clínica de Saúde mascarada sob consultoria');

    // Caso 4: Construtora e Engenharia
    const leadConstrucao = {
      razao_social: 'MRV ENGENHARIA E PARTICIPACOES S.A.',
      nome_fantasia: 'MRV CONSTRUTORA',
      cnae_principal_codigo: '4120-4/00',
      cnae_principal_descricao: 'Construção de edifícios'
    };
    const catConstrucao = resolveRealCategory(leadConstrucao);
    assert.strictEqual(catConstrucao.categoria_id, 'CONSTRUCAO');
    assert.strictEqual(catConstrucao.divergencia_cadastral, false);
    pass('categoryResolver classifica corretamente Engenharia & Construção Civil');

    // -------------------------------------------------------------------------
    // TESTES UNITÁRIOS 2: Índice de Vitalidade Cadastral (vitalityEngine)
    // -------------------------------------------------------------------------
    console.log('\n--- Testes Unitários: vitalityEngine ---');

    // Caso 1: Operação Ativa (Móvel WhatsApp + QSA 2+ sócios + Coordenadas + Capital)
    const leadOperacaoAtiva = {
      telefone: '(11) 98765-4321',
      qsa: [
        { nome: 'Carlos Silva', qualificacao: 'Diretor' },
        { nome: 'Ana Souza', qualificacao: 'Sócia-Administradora' }
      ],
      latitude: -23.5505,
      longitude: -46.6333,
      cep: '01310-100',
      logradouro: 'Avenida Paulista',
      numero: '1000',
      municipio: 'São Paulo',
      capital_social: 1500000,
      situacao_cadastral: 'ATIVA'
    };
    const vitAtiva = calculateVitalityIndex(leadOperacaoAtiva);
    assert.strictEqual(vitAtiva.vitality_status, 'OPERACAO_ATIVA');
    assert.ok(vitAtiva.vitality_score >= 70, 'Score deve ser >= 70 para ativa');
    assert.strictEqual(vitAtiva.icon, '🟢');
    pass('vitalityEngine atribui score >= 70 e status OPERACAO_ATIVA para empresa completa');

    // Caso 2: Em Transição (Telefone Fixo + 1 Sócio)
    const leadTransicao = {
      telefone: '(11) 3214-5500',
      qsa: [{ nome: 'Roberto Alves', qualificacao: 'Titular' }],
      latitude: null,
      longitude: null,
      cep: '01310-100',
      logradouro: 'Rua das Flores',
      numero: '50',
      municipio: 'São Paulo',
      capital_social: 10000,
      situacao_cadastral: 'ATIVA'
    };
    const vitTransicao = calculateVitalityIndex(leadTransicao);
    assert.strictEqual(vitTransicao.vitality_status, 'EM_TRANSICAO');
    assert.ok(vitTransicao.vitality_score >= 40 && vitTransicao.vitality_score < 70);
    assert.strictEqual(vitTransicao.icon, '🟡');
    pass('vitalityEngine atribui status EM_TRANSICAO para empresa com telefone fixo e QSA parcial');

    // Caso 3: Zumbi Presumida (Sem telefone + Sem QSA + Sem endereço válido)
    const leadZumbi = {
      telefone: null,
      qsa: [],
      latitude: null,
      longitude: null,
      cep: null,
      logradouro: null,
      numero: null,
      capital_social: 0,
      situacao_cadastral: 'INAPTA'
    };
    const vitZumbi = calculateVitalityIndex(leadZumbi);
    assert.strictEqual(vitZumbi.vitality_status, 'ZUMBI_PRESUMIDA');
    assert.ok(vitZumbi.vitality_score < 40);
    assert.strictEqual(vitZumbi.icon, '🔴');
    pass('vitalityEngine detecta ZUMBI_PRESUMIDA com pontuação baixa');

    // -------------------------------------------------------------------------
    // TESTES DE INTEGRAÇÃO & ENDPOINTS RESTful
    // -------------------------------------------------------------------------
    console.log('\n--- Testes de Integração com a API ---');

    // Endpoint 1: POST /api/leads/filter enriquece com categoria_real e vitality
    const filterRes = await fetch(`${BASE_URL}/api/leads/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_size: 10 })
    });
    assert.strictEqual(filterRes.status, 200, 'POST /api/leads/filter deve responder 200');
    const filterData = await filterRes.json();
    assert.ok(Array.isArray(filterData.data) && filterData.data.length > 0, 'Deve retornar lista de leads');

    const firstLead = filterData.data[0];
    assert.ok(firstLead.categoria_real, 'Lead deve possuir o atributo categoria_real');
    assert.ok(firstLead.taxonomy, 'Lead deve possuir metadados de taxonomia');
    assert.ok(firstLead.vitality, 'Lead deve possuir metadados de vitalidade cadastral');
    assert.ok(typeof firstLead.vitality.vitality_score === 'number', 'Vitality score deve ser numérico');
    pass('POST /api/leads/filter retorna categoria_real e vitality enriquecidos');

    // Endpoint 2: GET /api/leads/:id traz detalhes e metadados de auditoria
    const targetLeadId = firstLead.id;
    const detailRes = await fetch(`${BASE_URL}/api/leads/${targetLeadId}`);
    assert.strictEqual(detailRes.status, 200, 'GET /api/leads/:id deve responder 200');
    const detailJson = await detailRes.json();
    const leadDetail = detailJson.data;
    assert.strictEqual(leadDetail.id, targetLeadId);
    assert.ok(leadDetail.categoria_real, 'Detalhe deve conter categoria_real');
    assert.ok(leadDetail.vitality, 'Detalhe deve conter vitality');
    pass('GET /api/leads/:id retorna detalhes com taxonomia e vitalidade');

    // Endpoint 3: POST /api/leads/:id/audit marcação CONFIRMED
    const auditConfirmedRes = await fetch(`${BASE_URL}/api/leads/${targetLeadId}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audit_status: 'CONFIRMED', operator: 'AUDITOR_TESTE' })
    });
    assert.strictEqual(auditConfirmedRes.status, 200);
    const auditConfirmedJson = await auditConfirmedRes.json();
    assert.strictEqual(auditConfirmedJson.success, true);
    assert.strictEqual(auditConfirmedJson.data.audit_status, 'CONFIRMED');
    assert.ok(auditConfirmedJson.data.audited_at, 'Deve ter registrado audited_at');
    pass('POST /api/leads/:id/audit persiste status CONFIRMED no SQLite');

    // Endpoint 4: POST /api/leads/:id/audit marcação DIVERGENT_CNAE
    const auditDivRes = await fetch(`${BASE_URL}/api/leads/${targetLeadId}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audit_status: 'DIVERGENT_CNAE' })
    });
    assert.strictEqual(auditDivRes.status, 200);
    const auditDivJson = await auditDivRes.json();
    assert.strictEqual(auditDivJson.data.audit_status, 'DIVERGENT_CNAE');
    pass('POST /api/leads/:id/audit persiste status DIVERGENT_CNAE');

    // Endpoint 5: POST /api/leads/:id/audit marcação ZOMBIE_POINT
    const auditZombieRes = await fetch(`${BASE_URL}/api/leads/${targetLeadId}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audit_status: 'ZOMBIE_POINT' })
    });
    assert.strictEqual(auditZombieRes.status, 200);
    const auditZombieJson = await auditZombieRes.json();
    assert.strictEqual(auditZombieJson.data.audit_status, 'ZOMBIE_POINT');
    pass('POST /api/leads/:id/audit persiste status ZOMBIE_POINT');

    console.log('\n========================================');
    console.log(`🎯 RESULTADO FASE 16: ${testsPassed}/${testsTotal} testes aprovados.`);
    console.log('========================================\n');
  } catch (err) {
    fail('Erro crítico durante a execução dos testes da Fase 16', err);
  }
}

runPhase16Tests();
