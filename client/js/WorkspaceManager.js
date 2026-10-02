/**
 * client/js/WorkspaceManager.js
 * 
 * FASE 59 — ETAPA 3: WORKSPACES CONTEXTUAIS & GESTÃO DINÂMICA DE NICHOS
 * 
 * Controla o estado de nicho ativo no frontend e aplica renderização condicional
 * baseada em atributos de dados (`data-niche`) e nas permissões contratuais do Tenant (`allowed_niches`).
 * 
 * Comportamento:
 * - Popula o Dropdown de "Nicho Ativo" no Header da aplicação com base em `allowed_niches`.
 * - Ao trocar para nicho diferente de 'agro' (ex: 'b2b', 'saude'):
 *   - Oculta os controles de "Buscar Malha (SIGEF)", "Inspecionar Local", toggles de fontes e filtros agro.
 *   - Limpa/reseta as camadas fundiárias do mapa WebGL.
 * - Ao retornar para 'agro':
 *   - Restaura os controles e camadas agrícolas.
 * - Sincroniza estado com `localStorage` e emite evento customizado `workspace:changed`.
 */

(function () {
  'use strict';

  const NICHE_DEFINITIONS = {
    agro: {
      id: 'agro',
      name: 'Agronegócio & Fundiário',
      label: 'Agro & Fundiário',
      icon: 'agro',
      description: 'Mapeamento fundiário SIGEF/CAR, sensoriamento remoto e intent scoring de produtores'
    },
    b2b: {
      id: 'b2b',
      name: 'Empresas B2B Geral',
      label: 'B2B Corporativo',
      icon: 'b2b',
      description: 'Inteligência de mercado, prospecção CNAE, QSA de sócios e vazios de concorrência'
    },
    saude: {
      id: 'saude',
      name: 'Saúde & Clínicas',
      label: 'Saúde & Clínicas',
      icon: 'saude',
      description: 'Hospitais, clínicas especializadas, consultórios e infraestrutura de saúde'
    }
  };

  const DEFAULT_ALLOWED = ['agro'];
  const STORAGE_KEY = 'versus_active_workspace';

  class WorkspaceManagerClass {
    constructor() {
      this.currentNiche = 'agro';
      this.allowedNiches = [...DEFAULT_ALLOWED];
      this.initialized = false;
    }

    /**
     * Inicializa o gerenciador com os nichos permitidos para o inquilino
     * @param {string[]} [allowed] Lista opcional de nichos permitidos
     */
    async init(allowed) {
      if (Array.isArray(allowed) && allowed.length > 0) {
        this.allowedNiches = allowed;
      } else {
        this.discoverAllowedNiches();
      }

      // Restaura nicho salvo ou usa o primeiro permitido
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && this.allowedNiches.includes(saved)) {
        this.currentNiche = saved;
      } else {
        this.currentNiche = this.allowedNiches[0] || 'agro';
      }

      this.renderDropdown();
      this.applyNicheState(this.currentNiche, false);
      this.initialized = true;

      console.log(`🧭 [WORKSPACE] WorkspaceManager inicializado no nicho: "${this.currentNiche}". Permitidos:`, this.allowedNiches);
    }

    discoverAllowedNiches() {
      // O nicho operacional é estritamente fixo pelo Tenant (Agro & Fundiário)
      this.allowedNiches = ['agro'];
    }

    /**
     * Popula ou atualiza o select no Header
     */
    renderDropdown() {
      const select = document.getElementById('selectActiveWorkspace');
      if (!select) return;

      select.innerHTML = '';
      this.allowedNiches.forEach(nicheKey => {
        const def = NICHE_DEFINITIONS[nicheKey] || {
          id: nicheKey,
          label: `${nicheKey.toUpperCase()}`,
          icon: nicheKey
        };
        const opt = document.createElement('option');
        opt.value = def.id;
        opt.textContent = def.label;
        if (def.id === this.currentNiche) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });

      // Se houver apenas 1 nicho, desabilita visualmente o dropdown
      if (this.allowedNiches.length <= 1) {
        select.disabled = true;
        select.title = 'Nicho exclusivo contratado para a sua empresa.';
      } else {
        select.disabled = false;
        select.title = 'Alternar Nicho de Inteligência';
      }

      // Listener de troca
      if (!select._workspaceListenerAdded) {
        select.addEventListener('change', (e) => {
          this.switchNiche(e.target.value);
        });
        select._workspaceListenerAdded = true;
      }
    }

    /**
     * Alterna o nicho ativo
     * @param {string} newNiche
     */
    switchNiche(newNiche) {
      if (!newNiche || newNiche === this.currentNiche) return;

      if (!this.allowedNiches.includes(newNiche)) {
        console.warn(`[WORKSPACE] Nicho "${newNiche}" não autorizado para este inquilino.`);
        return;
      }

      const previous = this.currentNiche;
      this.currentNiche = newNiche;
      localStorage.setItem(STORAGE_KEY, newNiche);

      // Sincroniza select se alterado via código
      const select = document.getElementById('selectActiveWorkspace');
      if (select && select.value !== newNiche) {
        select.value = newNiche;
      }

      this.applyNicheState(newNiche, true, previous);

      // Dispara evento customizado
      const event = new CustomEvent('workspace:changed', {
        detail: {
          niche: newNiche,
          previousNiche: previous,
          definition: NICHE_DEFINITIONS[newNiche]
        }
      });
      window.dispatchEvent(event);
      document.dispatchEvent(event);

      if (typeof window.showToast === 'function') {
        window.showToast(`Nicho alterado para ${NICHE_DEFINITIONS[newNiche]?.name || newNiche}.`);
      }
    }

    /**
     * Aplica o estado visual e limpa/restaura camadas do WebGL
     * @param {string} niche
     * @param {boolean} notify
     * @param {string} [previousNiche]
     */
    applyNicheState(niche, notify = false, previousNiche = null) {
      // 1. Atualiza atributos no DOM principal
      document.body.setAttribute('data-niche', niche);
      const appContainer = document.getElementById('versusWorkspace') || document.getElementById('app');
      if (appContainer) {
        appContainer.setAttribute('data-niche', niche);
      }

      const isAgro = niche === 'agro';

      // 2. Elementos com atributo data-niche explícito
      const nicheTaggedElements = document.querySelectorAll('[data-niche]');
      nicheTaggedElements.forEach(el => {
        if (el === document.body || el === appContainer) return;
        const targetNiche = el.getAttribute('data-niche');
        if (targetNiche === niche) {
          if (typeof el.style?.removeProperty === 'function') {
            el.style.removeProperty('display');
          } else if (el.style) {
            el.style.display = '';
          }
        } else {
          if (el.style) el.style.display = 'none';
        }
      });

      // 3. Controles específicos do Agro (Buscar Malha, Pin-Drop, Legenda e Toggles)
      const agroControls = [
        document.getElementById('btnToggleFundiarioLayer'),
        document.getElementById('btnSearchMeshToggle'),
        document.getElementById('btnInspectPinToggle'),
        document.getElementById('mapMeshSearchPanel'),
        document.getElementById('toggleSigefLayerBtn')?.parentElement?.parentElement,
        document.getElementById('badgeCountRural')?.parentElement?.parentElement
      ];

      agroControls.forEach(el => {
        if (!el) return;
        if (isAgro) {
          if (typeof el.style?.removeProperty === 'function') {
            el.style.removeProperty('display');
          } else if (el.style) {
            el.style.display = '';
          }
        } else {
          if (el.style) el.style.display = 'none';
        }
      });

      // 4. Interação com o motor do Mapa WebGL
      if (!isAgro) {
        // Se trocou de agro para outro nicho, oculta/limpa polígonos fundiários
        if (window.MapFundiarioEngine?.clearFundiario) {
          window.MapFundiarioEngine.clearFundiario();
        } else if (window.MapFundiarioEngine?.setFundiarioVisibility) {
          window.MapFundiarioEngine.setFundiarioVisibility(false);
        }
      } else {
        // Se retornou ao agro, reativa a visibilidade padrão se disponível
        if (window.MapFundiarioEngine?.setFundiarioVisibility) {
          window.MapFundiarioEngine.setFundiarioVisibility(true);
        }
      }
    }

    getActiveNiche() {
      return this.currentNiche;
    }

    getAllowedNiches() {
      return [...this.allowedNiches];
    }
  }

  // Instância singleton global
  window.WorkspaceManager = new WorkspaceManagerClass();

  // Inicialização defensiva ao carregar o DOM
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('selectActiveWorkspace') || document.querySelector('.abm-topbar')) {
      window.WorkspaceManager.init();
    }
  });

})();
