/**
 * test_phase1_autonomous_memory.js
 * Validação de Engenharia da FASE 1: Memória Contínua, Persistência de Sessão e Contexto Rico
 */

import assert from 'assert';
import { aiCopilotService } from '../server/src/services/aiCopilotService.js';

console.log('=============================================================');
console.log('🧪 TESTES DA FASE 1: MEMÓRIA CONTÍNUA, PERSISTÊNCIA & CONTEXTO');
console.log('=============================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
  }
}

// 1. Teste de Injeção de Contexto Rico no System Prompt do Backend
runTest('1. buildSystemPrompt injeta aba ativa, filtros, viewport e propriedade inspecionada', () => {
  const context = {
    active_tab: 'map',
    has_active_filters: true,
    active_filters: { uf: 'MT', cultura: 'Milho', score_min: 70 },
    map_viewport: { center: [-55.72, -12.55], zoom: 7.5 },
    total_properties_in_memory: 350,
    total_leads_in_memory: 120,
    inspected_property: {
      tipo: 'rural',
      sigef: 'BR.MT.00192',
      nome: 'Fazenda Santa Rita',
      titular: 'João da Silva',
      municipio: 'Sorriso/MT',
      score: 88,
      classificacao: 'HOT'
    },
    properties: [
      {
        id: 'prop-1',
        id_sigef: 'BR.MT.00192',
        nome_imovel: 'Fazenda Santa Rita',
        nome_titular: 'João da Silva',
        municipio: 'Sorriso',
        uf: 'MT',
        area_hectares: 2500,
        status_geo: 'CERTIFICADO',
        intent_score: 88,
        intent_classification: 'HOT',
        dados_agronomicos: { crop_type: 'Milho' },
        whatsapp_validado: '+5566999999999'
      }
    ]
  };

  const prompt = aiCopilotService.buildSystemPrompt(context);

  assert(prompt.includes('Mapa Espacial WebGL (map)'), 'Deveria identificar a aba ativa como Mapa');
  assert(prompt.includes('Fazenda Santa Rita'), 'Deveria listar a propriedade inspecionada');
  assert(prompt.includes('Sorriso/MT'), 'Deveria incluir o município/UF da propriedade inspecionada');
  assert(prompt.includes('"cultura": "Milho"'), 'Deveria incluir os filtros ativos');
  assert(prompt.includes('Zoom: 7.5'), 'Deveria incluir o zoom do viewport do mapa');
  assert(prompt.includes('Total de Propriedades Rurais Carregadas: 350'), 'Deveria conter contagem total em memória');
});

// 2. Simulação de sessionStorage e ciclo de vida do Copiloto no Frontend
runTest('2. Simulação de sessionStorage (versus_copilot_history_v1) e Restauração de Sessão', () => {
  const STORAGE_KEY = 'versus_copilot_history_v1';
  const mockStorage = {};

  const sessionStorageMock = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; }
  };

  // Simula o estado do AiCopilot
  const copilotSim = {
    sessionMessages: [],
    history: [],
    saveHistoryToSession() {
      const toSave = this.sessionMessages.slice(-40);
      sessionStorageMock.setItem(STORAGE_KEY, JSON.stringify(toSave));
    },
    loadHistoryFromSession() {
      const raw = sessionStorageMock.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return false;
      this.sessionMessages = parsed;
      this.history = this.sessionMessages
        .filter(m => m.type !== 'card' && (m.role === 'user' || m.role === 'assistant') && m.content)
        .map(m => ({ role: m.role, content: m.content }))
        .slice(-20);
      return true;
    },
    appendMessage(role, content, model = null, saveToStorage = true) {
      if (saveToStorage) {
        this.sessionMessages.push({ type: 'msg', role, content, model, timestamp: Date.now() });
        this.saveHistoryToSession();
      }
    },
    renderActionCard({ icon, title, message, buttonLabel }, saveToStorage = true) {
      if (saveToStorage) {
        this.sessionMessages.push({
          type: 'card',
          icon: icon || '⚡',
          title: title || 'Ação Executada',
          message: message || '',
          buttonLabel: buttonLabel || null,
          timestamp: Date.now()
        });
        this.saveHistoryToSession();
      }
    },
    clearChat() {
      this.history = [];
      this.sessionMessages = [];
      sessionStorageMock.removeItem(STORAGE_KEY);
      this.appendMessage('assistant', 'Conversa reiniciada. Sou o Copiloto da Plataforma VERSUS.', null, true);
    }
  };

  // Turno 1: Usuário envia mensagem
  copilotSim.appendMessage('user', 'Filtrar fazendas de soja no RS com score acima de 80');
  copilotSim.appendMessage('assistant', 'Filtro executado com sucesso no mapa e na tabela.', 'gpt-4o-mini');
  copilotSim.renderActionCard({
    icon: '🌾',
    title: 'Filtro Agro Aplicado',
    message: 'RS — Soja — Score ≥ 80'
  });

  // Valida se foi salvo no sessionStorage
  assert(sessionStorageMock.getItem(STORAGE_KEY) !== null, 'Deveria ter salvo dados no mockStorage');
  const savedData = JSON.parse(sessionStorageMock.getItem(STORAGE_KEY));
  assert.strictEqual(savedData.length, 3, 'Deveriam existir 3 itens salvos na sessão (user msg, bot msg, card)');
  assert.strictEqual(savedData[0].role, 'user');
  assert.strictEqual(savedData[1].role, 'assistant');
  assert.strictEqual(savedData[2].type, 'card');

  // Simulação de F5 (Recriação de Instância)
  const copilotSimAfterF5 = {
    sessionMessages: [],
    history: [],
    loadHistoryFromSession() {
      const raw = sessionStorageMock.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return false;
      this.sessionMessages = parsed;
      this.history = this.sessionMessages
        .filter(m => m.type !== 'card' && (m.role === 'user' || m.role === 'assistant') && m.content)
        .map(m => ({ role: m.role, content: m.content }))
        .slice(-20);
      return true;
    }
  };

  const restored = copilotSimAfterF5.loadHistoryFromSession();
  assert.strictEqual(restored, true, 'Restauração pós-F5 deveria retornar true');
  assert.strictEqual(copilotSimAfterF5.sessionMessages.length, 3, 'Deveria reconstituir as 3 mensagens/cards');
  assert.strictEqual(copilotSimAfterF5.history.length, 2, 'Deveria reconstituir as 2 mensagens de diálogo para o LLM');
  assert.strictEqual(copilotSimAfterF5.history[0].role, 'user');
  assert.strictEqual(copilotSimAfterF5.history[1].role, 'assistant');

  // Teste de Limpeza / Novo Tópico
  copilotSim.clearChat();
  assert.strictEqual(copilotSim.sessionMessages.length, 1, 'Após limpar, deve conter apenas a mensagem de boas-vindas');
  const storageAfterClear = JSON.parse(sessionStorageMock.getItem(STORAGE_KEY));
  assert.strictEqual(storageAfterClear.length, 1, 'Storage deve conter apenas a nova mensagem de boas-vindas');
  assert(storageAfterClear[0].content.includes('Conversa reiniciada'), 'Mensagem deve ser de reinício');
});

console.log('\n-------------------------------------------------------------');
console.log(`📊 RESULTADO FASE 1: ${passedTests}/${totalTests} TESTES APROVADOS (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('-------------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
