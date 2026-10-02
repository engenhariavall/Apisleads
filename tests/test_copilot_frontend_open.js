/**
 * tests/test_copilot_frontend_open.js
 * Teste de validação da Abertura do Copiloto (Frontend)
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Simula ambiente DOM mínimo
class MockDOMElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: new Set(className.split(' ').filter(Boolean)),
      add(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
      toggle(cls, force) {
        if (force !== undefined) {
          if (force) this._classes.add(cls); else this._classes.delete(cls);
          return force;
        }
        if (this._classes.has(cls)) {
          this._classes.delete(cls);
          return false;
        }
        this._classes.add(cls);
        return true;
      },
      contains(cls) { return this._classes.has(cls); }
    };
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.parentNode = null;
    this.children = [];
    this.textContent = '';
    this.value = '';
    this.dataset = {};
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  
  addEventListener(event, handler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  dispatchEvent(event) {
    event.target = this;
    let curr = this;
    while (curr) {
      if (curr.listeners[event.type]) {
        for (const h of curr.listeners[event.type]) {
          h(event);
          if (event._stopped) break;
        }
      }
      if (event._stopped) break;
      curr = curr.parentNode;
    }
  }

  closest(selector) {
    let curr = this;
    const selectors = selector.split(',').map(s => s.trim());
    while (curr) {
      for (const sel of selectors) {
        if (sel.startsWith('#') && curr.id === sel.slice(1)) return curr;
        if (sel.startsWith('.') && curr.classList.contains(sel.slice(1))) return curr;
        if (sel.startsWith('[data-action="') && curr.getAttribute('data-action') === sel.match(/\[data-action="([^"]+)"\]/)?.[1]) return curr;
        if (sel.toUpperCase() === curr.tagName) return curr;
      }
      curr = curr.parentNode;
    }
    return null;
  }

  contains(other) {
    let curr = other;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
  }
}

class MockDocument extends MockDOMElement {
  constructor() {
    super('DOCUMENT');
    this.elementsById = {};
    this.allElements = [];
  }

  getElementById(id) {
    return this.elementsById[id] || null;
  }

  querySelectorAll(selector) {
    const selectors = selector.split(',').map(s => s.trim());
    return this.allElements.filter(el => {
      for (const sel of selectors) {
        if (sel.startsWith('#') && el.id === sel.slice(1)) return true;
        if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) return true;
      }
      return false;
    });
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  register(el) {
    if (el.id) this.elementsById[el.id] = el;
    this.allElements.push(el);
    el.parentNode = this;
    return el;
  }
}

function runTests() {
  console.log('--- TESTE: ABERTURA DO COPILOTO (FRONTEND) ---');

  const mockDoc = new MockDocument();
  const mockWindow = {
    addEventListener: () => {},
    setInterval: () => {},
    setTimeout: (fn) => fn(),
    document: mockDoc
  };

  // Cria estrutura de elementos simulados
  const drawer = mockDoc.register(new MockDOMElement('div', 'aiCopilotDrawer', 'ai-copilot-drawer'));
  drawer.style.display = 'none';

  const btnFloating = mockDoc.register(new MockDOMElement('button', 'btnFloatingCopilot', 'btn-floating-copilot btn-copiloto'));
  btnFloating.setAttribute('data-action', 'open-copilot');
  btnFloating.textContent = 'Copiloto';

  const btnInspector = mockDoc.register(new MockDOMElement('button', 'btnInspectorCopiloto', 'btn-direct-download btn-copiloto'));
  btnInspector.textContent = 'Copiloto IA';

  const btnRural = mockDoc.register(new MockDOMElement('button', 'btnRuralCopiloto', 'btn-direct-download btn-copiloto'));
  btnRural.textContent = 'Consultar Copiloto IA';

  const btnClose = mockDoc.register(new MockDOMElement('button', 'btnCloseCopilot', 'btn-copilot-icon'));
  drawer.appendChild(btnClose);

  const input = mockDoc.register(new MockDOMElement('textarea', 'copilotInput'));
  drawer.appendChild(input);

  const messages = mockDoc.register(new MockDOMElement('div', 'copilotMessages'));
  drawer.appendChild(messages);

  // Carrega código do aiCopilot.js sob sandbox
  const code = fs.readFileSync(path.join(__dirname, '../client/js/aiCopilot.js'), 'utf8');

  const context = {
    window: mockWindow,
    document: mockDoc,
    console: console,
    setInterval: () => {},
    setTimeout: (fn) => fn(),
    Event: class MockEvent {
      constructor(type) {
        this.type = type;
        this.defaultPrevented = false;
        this._stopped = false;
      }
      preventDefault() { this.defaultPrevented = true; }
      stopPropagation() { this._stopped = true; }
    }
  };

  vm.createContext(context);
  vm.runInContext(code, context);

  const AiCopilot = context.window.AiCopilot;
  assert(AiCopilot, 'AiCopilot deve estar definido no window');
  assert(typeof context.window.openCopilot === 'function', 'window.openCopilot deve ser função');
  assert(typeof context.window.closeCopilot === 'function', 'window.closeCopilot deve ser função');
  assert(typeof context.window.toggleCopilot === 'function', 'window.toggleCopilot deve ser função');
  console.log('✅ 1. aiCopilot.js inicializado e exportado com sucesso no escopo global.');

  function createClickEvent() {
    return new context.Event('click');
  }

  // TESTE 1: Clique no botão flutuante abre o Drawer
  assert.strictEqual(AiCopilot.isOpen, false, 'Inicialmente isOpen deve ser false');
  btnFloating.dispatchEvent(createClickEvent());
  assert.strictEqual(AiCopilot.isOpen, true, 'Após 1 clique no botão flutuante, isOpen deve ser true');
  assert.strictEqual(drawer.style.display, 'flex', 'Após clique, display deve ser flex');
  assert(drawer.classList.contains('active'), 'Drawer deve ter classe active');
  assert(drawer.classList.contains('open'), 'Drawer deve ter classe open');
  console.log('✅ 2. Clique em #btnFloatingCopilot abriu o drawer com display: flex e classes active/open.');

  // TESTE 2: Segundo clique no botão flutuante fecha o Drawer (toggle)
  btnFloating.dispatchEvent(createClickEvent());
  assert.strictEqual(AiCopilot.isOpen, false, 'Após 2º clique, isOpen deve ser false');
  assert.strictEqual(drawer.style.display, 'none', 'Após 2º clique, display deve ser none');
  assert(!drawer.classList.contains('active'), 'Drawer não deve ter classe active');
  console.log('✅ 3. Segundo clique em #btnFloatingCopilot fechou o drawer corretamente (toggle funcional sem duplo disparo).');

  // TESTE 3: Clique no botão do Inspetor de Leads (#btnInspectorCopiloto)
  btnInspector.dispatchEvent(createClickEvent());
  assert.strictEqual(AiCopilot.isOpen, true, 'Clique em #btnInspectorCopiloto deve abrir o drawer');
  assert.strictEqual(drawer.style.display, 'flex', 'Display deve ser flex');
  console.log('✅ 4. Clique em #btnInspectorCopiloto (no Inspetor de Lead) abriu o chat com sucesso.');

  // TESTE 4: Clique no botão de fechar (#btnCloseCopilot)
  btnClose.dispatchEvent(createClickEvent());
  assert.strictEqual(AiCopilot.isOpen, false, 'Clique em #btnCloseCopilot deve fechar o drawer');
  assert.strictEqual(drawer.style.display, 'none', 'Display deve ser none');
  console.log('✅ 5. Clique no botão fechar (#btnCloseCopilot) fechou o drawer.');

  // TESTE 5: Clique no botão de Propriedade Rural (#btnRuralCopiloto)
  btnRural.dispatchEvent(createClickEvent());
  assert.strictEqual(AiCopilot.isOpen, true, 'Clique em #btnRuralCopiloto deve abrir o drawer');
  console.log('✅ 6. Clique em #btnRuralCopiloto abriu o chat com sucesso.');

  // TESTE 6: Teste com botão genérico contendo apenas texto "Copiloto"
  AiCopilot.close();
  const genericBtn = mockDoc.register(new MockDOMElement('button', '', 'btn-custom'));
  genericBtn.textContent = 'Acessar Copiloto Inteligente';
  genericBtn.dispatchEvent(createClickEvent());
  assert.strictEqual(AiCopilot.isOpen, true, 'Elemento contendo texto "Copiloto" deve abrir o chat');
  console.log('✅ 7. Botão genérico com texto "Copiloto" interceptado e abriu o chat com sucesso.');

  // TESTE 7: Verificação dos métodos globais
  context.window.closeCopilot();
  assert.strictEqual(AiCopilot.isOpen, false, 'closeCopilot fechou');
  context.window.openCopilot();
  assert.strictEqual(AiCopilot.isOpen, true, 'openCopilot abriu');
  context.window.toggleCopilot();
  assert.strictEqual(AiCopilot.isOpen, false, 'toggleCopilot fechou');
  console.log('✅ 8. Métodos globais window.openCopilot, closeCopilot, toggleCopilot funcionam perfeitamente.');

  console.log('\n🎉 TODOS OS TESTES DE FRONTEND DO COPILOTO PASSARAM COM SUCESSO!\n');
}

runTests();
