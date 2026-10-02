/**
 * client/js/copilotActionBus.js
 * 
 * BARRAMENTO UNIVERSAL DE AÇÕES DE INTERFACE DO COPILOTO VERSUS 2.0 (UI ACTION DISPATCHER)
 * 
 * Permite ao agente de IA controlar dinamicamente a interface do usuário:
 * 1. FLY_TO_COORDS: Move a câmera 3D do MapLibre WebGL para centróides de fazendas, gaps ou sinais.
 * 2. OPEN_DRAWER: Abre instantaneamente o Right Drawer (Visão Geral, QSA ou Dossiê Rural).
 * 3. SWITCH_TAB: Alterna a viewport central entre Mapa WebGL, Tabela, Funil GTM e Concorrentes.
 * 4. APPLY_FILTER: Aplica filtros avançados em formulários e dispara re-renderização.
 * 5. TRIGGER_EXPORT: Inicia download de audiências para Meta Ads / CSV.
 * 6. OPEN_SWEEP_MODAL: Abre o modal executivo de Varredura de Concorrentes.
 */

(function () {
  'use strict';

  const CopilotActionBus = {
    /**
     * Notificação HUD discreta de ação executada
     */
    notify(message, type = 'info') {
      const existingHud = document.getElementById('copilotActionHud');
      if (existingHud) existingHud.remove();

      const hud = document.createElement('div');
      hud.id = 'copilotActionHud';
      hud.className = 'copilot-action-hud';
      hud.innerHTML = `
        <div class="hud-content">
          <svg class="hud-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polyline>
          </svg>
          <span class="hud-text">${message}</span>
        </div>
      `;

      document.body.appendChild(hud);
      setTimeout(() => {
        if (hud && hud.parentNode) {
          hud.classList.add('hud-fade-out');
          setTimeout(() => hud.remove(), 400);
        }
      }, 3500);
    },

    /**
     * Despacha uma lista de ações sequenciais ou ação única
     */
    async dispatch(actionOrList) {
      if (!actionOrList) return;

      const actions = Array.isArray(actionOrList) ? actionOrList : [actionOrList];
      for (const act of actions) {
        if (!act || !act.type) continue;
        console.log(`🎮 [ACTION BUS] Executando comando de interface: ${act.type}`, act.payload);

        try {
          switch (act.type) {
            case 'FLY_TO_COORDS':
              await this.executeFlyTo(act.payload || {});
              break;

            case 'OPEN_DRAWER':
              this.executeOpenDrawer(act.payload || {});
              break;

            case 'SWITCH_TAB':
              this.executeSwitchTab(act.payload || {});
              break;

            case 'APPLY_FILTER':
              this.executeApplyFilter(act.payload || {});
              break;

            case 'TRIGGER_EXPORT':
              this.executeTriggerExport(act.payload || {});
              break;

            case 'OPEN_SWEEP_MODAL':
              this.executeOpenSweepModal(act.payload || {});
              break;

            default:
              console.warn(`[ACTION BUS] Tipo de ação desconhecido: ${act.type}`);
          }

          if (act.rationale) {
            this.notify(act.rationale);
          }
        } catch (err) {
          console.error(`[ACTION BUS] Erro ao executar ${act.type}:`, err);
        }
      }
    },

    /**
     * Voo da Câmera 3D do MapLibre WebGL para coordenadas geodésicas
     */
    async executeFlyTo(payload = {}) {
      const lat = parseFloat(payload.lat);
      const lng = parseFloat(payload.lng);
      const zoom = parseFloat(payload.zoom) || 12;

      if (isNaN(lat) || isNaN(lng)) {
        console.warn('[ACTION BUS] Coordenadas inválidas para FLY_TO_COORDS:', payload);
        return;
      }

      // Garante que o mapa esteja visível
      this.executeSwitchTab({ aba: 'map' });

      // Obtém instância MapLibre
      const map = window.MapEngine?.getMap?.() || window.mapEngine?.getMap?.();
      if (!map) {
        console.warn('[ACTION BUS] Instância do MapEngine não disponível.');
        return;
      }

      const performFly = () => {
        try {
          map.flyTo({
            center: [lng, lat],
            zoom: zoom,
            pitch: 35,
            bearing: 0,
            speed: 1.5,
            curve: 1.2,
            essential: true
          });
        } catch (e) {
          console.warn('[ACTION BUS] Falha no flyTo do mapa:', e.message);
        }
      };

      if (map.isStyleLoaded && map.isStyleLoaded()) {
        performFly();
      } else if (typeof map.once === 'function') {
        map.once('style.load', performFly);
      } else {
        setTimeout(performFly, 500);
      }
    },

    /**
     * Abre o Inspetor de Leads (Right Drawer)
     */
    executeOpenDrawer(payload = {}) {
      const { identificador, leadId, aba_dossie = 'rural' } = payload;
      const targetId = String(identificador || leadId || '').toLowerCase().trim();

      const ruralProps = Array.isArray(window.ruralPropertiesData) ? window.ruralPropertiesData : [];
      const leads = Array.isArray(window.allLeads) ? window.allLeads : (window.state?.currentLeads || []);

      let targetRural = null;
      let targetLead = null;

      if (targetId === 'primeiro' || targetId === 'top1' || !targetId) {
        targetRural = ruralProps[0] || null;
        if (!targetRural) targetLead = leads[0] || null;
      } else {
        targetRural = ruralProps.find(p =>
          (p.nome_titular && p.nome_titular.toLowerCase().includes(targetId)) ||
          (p.nome_imovel && p.nome_imovel.toLowerCase().includes(targetId)) ||
          (p.id_sigef && p.id_sigef.toLowerCase().includes(targetId)) ||
          (p.id && String(p.id).toLowerCase() === targetId) ||
          (p.cpf_cnpj_titular && p.cpf_cnpj_titular.includes(targetId))
        );

        if (!targetRural) {
          targetLead = leads.find(l =>
            (l.razao_social && l.razao_social.toLowerCase().includes(targetId)) ||
            (l.nome_fantasia && l.nome_fantasia.toLowerCase().includes(targetId)) ||
            (l.cnpj && l.cnpj.includes(targetId)) ||
            (l.id && String(l.id).toLowerCase() === targetId)
          );
        }
      }

      if (targetRural && typeof window.inspectRuralPropertyInDrawer === 'function') {
        window.inspectRuralPropertyInDrawer(targetRural);
      } else if (targetLead && typeof window.openLeadDetailsDrawer === 'function') {
        window.openLeadDetailsDrawer(targetLead);
      }

      // Foca a aba do dossiê solicitada
      if (aba_dossie) {
        setTimeout(() => {
          const tabBtn = document.querySelector(`.drawer-tab-btn[data-tab="${aba_dossie}"]`);
          if (tabBtn) tabBtn.click();
        }, 150);
      }
    },

    /**
     * Alterna a Viewport Central (Abas da Tela Principal) - Suporte Global a Todas as Rotas
     */
    executeSwitchTab(payload = {}) {
      const rawTab = (payload.aba || payload.tab || 'table').toLowerCase().trim();
      let tabKey = 'table';
      if (rawTab.includes('map') || rawTab.includes('webgl') || rawTab.includes('espacial')) tabKey = 'map';
      else if (rawTab.includes('gtm') || rawTab.includes('funil') || rawTab.includes('indicador')) tabKey = 'gtm';
      else if (rawTab.includes('concorrente') || rawTab.includes('competitor') || rawTab.includes('gap')) tabKey = 'competitors';
      else if (rawTab.includes('spark') || rawTab.includes('radar') || rawTab.includes('sinal') || rawTab.includes('sinais')) tabKey = 'sparks';
      else tabKey = 'table';

      // Garante desativação de tela cheia do mapa se estiver navegando para outra aba
      if (tabKey !== 'map') {
        const paneMap = document.getElementById('paneMap');
        if (paneMap) {
          paneMap.classList.remove('map-fullscreen-active');
        }
        if (window.MapEngine?.exitFullscreen) {
          try { window.MapEngine.exitFullscreen(); } catch (e) {}
        }
      }

      // 1. Busca botão real de aba com seletores precisos (.viewport-tab-btn e IDs diretos)
      const tabBtn = document.querySelector(
        `.viewport-tab-btn[data-view="${tabKey}"], #tabView${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}, .view-tab-btn[data-view="${tabKey}"], [data-tab="${tabKey}"]`
      );
      if (tabBtn && typeof tabBtn.click === 'function') {
        tabBtn.click();
      }

      // 2. Garante alternância visual dos painéis no DOM
      const panes = {
        table: document.getElementById('paneTable'),
        map: document.getElementById('paneMap'),
        gtm: document.getElementById('paneGtm'),
        competitors: document.getElementById('paneCompetitors'),
        sparks: document.getElementById('paneSparks')
      };
      Object.keys(panes).forEach(k => {
        if (panes[k]) {
          panes[k].style.display = (k === tabKey) ? 'flex' : 'none';
          panes[k].classList.toggle('active', k === tabKey);
        }
      });

      // Se navegou para a tabela e ela estiver com aviso de vazio por filtros residuais,
      // limpa os filtros residuais para garantir exibição imediata dos dados
      if (tabKey === 'table') {
        const emptyState = document.querySelector('#paneTable .empty-state, #paneTable .table-empty-notice');
        const clearBtn = document.getElementById('btnClearFilters') || document.querySelector('#paneTable button[onclick*="limpar"]');
        if (emptyState && clearBtn) {
          clearBtn.click();
        } else if (typeof window.fetchLeads === 'function') {
          window.fetchLeads();
        }
      }

      // Se mudou para o mapa, redimensiona para garantir renderização WebGL perfeita
      if (tabKey === 'map') {
        setTimeout(() => {
          window.MapEngine?.getMap?.()?.resize?.();
        }, 200);
      }
    },

    /**
     * Aplica filtros aos formulários e engatilha busca
     */
    executeApplyFilter(payload = {}) {
      let applied = false;

      if (payload.uf) {
        const el = document.getElementById('filterState');
        if (el) { el.value = payload.uf; applied = true; }
      }
      if (payload.municipio) {
        const el = document.getElementById('filterMunicipio');
        if (el) { el.value = payload.municipio; applied = true; }
      }
      if (payload.cultura) {
        const el = document.getElementById('filterCrop');
        if (el) { el.value = payload.cultura; applied = true; }
      }
      if (payload.score_minimo !== undefined && payload.score_minimo !== null) {
        const el = document.getElementById('filterScore');
        if (el) { el.value = payload.score_minimo; applied = true; }
      }
      if (payload.status_car) {
        const el = document.getElementById('filterCarStatus');
        if (el) { el.value = payload.status_car; applied = true; }
      }

      // Dispara evento de submit ou botão filtrar se disponível
      const filterBtn = document.getElementById('btnApplyFilters') || document.getElementById('btnFiltrar');
      if (filterBtn && typeof filterBtn.click === 'function') {
        filterBtn.click();
      } else if (typeof window.applyCurrentFilters === 'function') {
        window.applyCurrentFilters();
      }
    },

    /**
     * Dispara download de audiência Meta Ads
     */
    executeTriggerExport(payload = {}) {
      if (window.AiCopilot && typeof window.AiCopilot.downloadMetaAdsCsv === 'function') {
        const ruralProps = Array.isArray(window.ruralPropertiesData) ? window.ruralPropertiesData : [];
        window.AiCopilot.downloadMetaAdsCsv(ruralProps);
      } else {
        const btnExport = document.getElementById('btnExportMetaAds') || document.getElementById('btnExportCsv');
        if (btnExport && typeof btnExport.click === 'function') btnExport.click();
      }
    },

    /**
     * Abre o modal executivo de Varredura de Concorrentes
     */
    executeOpenSweepModal(payload = {}) {
      const modal = document.getElementById('modalCompetitorSweep');
      if (modal) {
        modal.classList.add('active');
        if (payload.uf) {
          const ufSelect = document.getElementById('sweepUfSelect');
          if (ufSelect) ufSelect.value = payload.uf;
        }
      }
    }
  };

  window.CopilotActionBus = CopilotActionBus;
})();
