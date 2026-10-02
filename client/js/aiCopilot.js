/**
 * aiCopilot.js
 * FASE 54 — COPILOTO DE IA (FUNCTION CALLING / AGENTE AUTÔNOMO)
 * 
 * Componente do Chat Inteligente com Function Calling e Action Dispatcher.
 * Permite ao Copiloto acionar ações reais na plataforma VERSUS:
 * 1. Exportar e baixar planilhas formatadas para Meta Ads.
 * 2. Aplicar filtros na malha fundiária (culturas e UFs).
 * 3. Gerar abordagem comercial SDR e isolar o titular no Drawer.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'versus_copilot_history_v1';

  const AiCopilot = {
    isOpen: false,
    isWaiting: false,
    history: [],
    sessionMessages: [],
    // FASE COPILOTO — ÁUDIO (WHISPER STT & OPENAI TTS)
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    currentAudio: null,
    messageAudio: null,
    liveAudio: null,
    currentPlayingBtn: null,
    btnMic: null,
    silenceTimer: null,
    silenceDelayMs: 2800,

    init() {
      this.bindDOMElements();
      this.bindEvents();
      this.sessionMessages = [];
      const hasRestored = this.loadHistoryFromSession();
      if (!hasRestored) {
        this.sessionMessages = [{
          role: 'assistant',
          content: 'Olá, operador. Sou o **Copiloto da Plataforma VERSUS**. Tenho acesso aos leads e propriedades rurais em memória. Como posso auxiliá-lo agora?',
          timestamp: Date.now()
        }];
        this.saveHistoryToSession();
      }
      this.updateContextSummary();
      this.attachTtsToExistingMessages();

      // Monitora alterações na base de propriedades rurais
      window.addEventListener('ruralDataUpdated', () => this.updateContextSummary());
      setInterval(() => this.updateContextSummary(), 3500);

      console.log('[AI COPILOT] Copiloto VERSUS Executor inicializado com Function Calling, Memória Contínua e Voz.');
    },

    bindDOMElements() {
      this.drawer = document.getElementById('aiCopilotDrawer');
      this.btnFloating = document.getElementById('btnFloatingCopilot') || document.getElementById('btnCopiloto') || document.querySelector('.btn-copiloto, .btn-floating-copilot');
      this.btnClose = document.getElementById('btnCloseCopilot');
      this.btnClear = document.getElementById('btnCopilotClearChat');
      this.form = document.getElementById('copilotForm');
      this.input = document.getElementById('copilotInput');
      this.sendBtn = document.getElementById('btnCopilotSend');
      this.btnMic = document.getElementById('btnCopilotMic');
      this.messagesContainer = document.getElementById('copilotMessages');
      this.contextSummary = document.getElementById('copilotContextSummary');
      this.quickChips = document.getElementById('copilotQuickChips');
      this.btnLiveToggle = document.getElementById('btnCopilotLiveToggle');
      this.voiceStatus = document.getElementById('copilotVoiceStatus');
      this.audioBar = document.getElementById('copilotAudioBar');
      this.audioRecTimer = document.getElementById('audioRecTimer');
      this.btnAudioCancel = document.getElementById('btnAudioCancel');
      this.btnAudioSend = document.getElementById('btnAudioSend');
    },

    bindEvents() {
      // Delegação global robusta no document: captura qualquer elemento de acionamento do Copiloto
      document.addEventListener('click', (e) => {
        // Ignora cliques dentro do próprio chat (exceto botões de fechar e limpar do header)
        if (this.drawer && this.drawer.contains(e.target) && !e.target.closest('#btnCloseCopilot, #btnCopilotClearChat, #btnCopilotLiveToggle')) {
          return;
        }

        // 1. Botão de Fechar
        const closeBtn = e.target.closest('#btnCloseCopilot, [data-action="close-copilot"]');
        if (closeBtn) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[AI COPILOT] Botão de fechar clicado:', closeBtn);
          this.close();
          return;
        }

        // 2. Gatilhos por ID, Classe CSS ou data-action
        const trigger = e.target.closest(
          '#btnFloatingCopilot, #btnCopiloto, #btnInspectorCopiloto, #btnRuralCopiloto, ' +
          '.btn-copiloto, .btn-floating-copilot, [data-action="open-copilot"], [data-action="toggle-copilot"]'
        );

        if (trigger) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[AI COPILOT] Clique interceptado via seletor do Copiloto:', trigger);
          this.toggle();
          return;
        }

        // 3. Fallback inteligente: elemento botão/link contendo texto "Copiloto" (fora do drawer do chat)
        const textBtn = e.target.closest('button, a, .btn, .btn-direct-download');
        if (textBtn && textBtn.textContent && textBtn.textContent.includes('Copiloto')) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[AI COPILOT] Clique interceptado pelo texto "Copiloto":', textBtn);
          this.toggle();
          return;
        }
      });

      // Modo de Conversação Contínua ao Vivo (Live Mode estilo Gemini Live)
      if (this.btnLiveToggle) {
        this.btnLiveToggle.addEventListener('click', (e) => {
          e.preventDefault();
          this.toggleLiveMode();
        });
      }

      // Microfone (Speech-to-Text)
      if (this.btnMic) {
        this.btnMic.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleVoiceRecording();
        });
      }

      // Ações da Barra de Áudio Estilo WhatsApp
      if (this.btnAudioCancel) {
        this.btnAudioCancel.addEventListener('click', (e) => {
          e.preventDefault();
          this.cancelVoiceRecording();
        });
      }

      if (this.btnAudioSend) {
        this.btnAudioSend.addEventListener('click', (e) => {
          e.preventDefault();
          this.confirmVoiceRecordingAndSend();
        });
      }

      // Limpar conversa
      if (this.btnClear) {
        this.btnClear.addEventListener('click', () => this.clearChat());
      }

      // Envio do formulário
      if (this.form) {
        this.form.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleSend();
        });
      }

      // Enter para enviar (Shift+Enter para quebra de linha)
      if (this.input) {
        this.input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSend();
          }
        });

        // Auto-expansão suave sem barra de rolagem (altura adaptável de 50px a 120px)
        this.input.addEventListener('input', () => {
          this.input.style.height = 'auto';
          const newH = Math.min(Math.max(this.input.scrollHeight, 50), 120);
          this.input.style.height = newH + 'px';
        });
      }

      // Quick Chips (Sugestões rápidas)
      if (this.quickChips) {
        this.quickChips.addEventListener('click', (e) => {
          const chip = e.target.closest('.copilot-chip');
          if (chip && chip.dataset.prompt) {
            if (this.input) this.input.value = chip.dataset.prompt;
            this.handleSend();
          }
        });
      }
    },

    toggle() {
      try {
        if (!this.drawer) {
          this.drawer = document.getElementById('aiCopilotDrawer');
        }
        const isVisibleInDom = Boolean(
          this.drawer && (
            this.drawer.classList.contains('active') ||
            this.drawer.classList.contains('open') ||
            (this.drawer.style.display !== 'none' && this.drawer.style.display !== '')
          )
        );
        console.log(`[AI COPILOT] toggle() acionado. Visível no DOM: ${isVisibleInDom}, Estado interno isOpen: ${this.isOpen}`);
        if (isVisibleInDom) {
          this.close();
        } else {
          this.open();
        }
      } catch (err) {
        console.error(' [AI COPILOT ERROR] Exceção capturada no toggle:', err);
      }
    },

    open() {
      try {
        console.log('[AI COPILOT] Invocando open()...');
        if (!this.drawer) {
          this.drawer = document.getElementById('aiCopilotDrawer');
        }
        if (!this.drawer) {
          console.error(' [AI COPILOT ERROR] Elemento #aiCopilotDrawer é nulo ou não encontrado no DOM.');
          return;
        }

        this.isOpen = true;
        this.drawer.style.display = 'flex';
        this.drawer.classList.add('active', 'open');
        this.drawer.setAttribute('aria-hidden', 'false');

        // Garante sobreposição visual com z-index de primeira camada sobre MapLibre e Right Drawer
        this.drawer.style.zIndex = '99995';

        const allButtons = document.querySelectorAll(
          '#btnFloatingCopilot, #btnCopiloto, #btnInspectorCopiloto, #btnRuralCopiloto, .btn-copiloto, .btn-floating-copilot'
        );
        allButtons.forEach(b => b.classList.add('copilot-active', 'active'));

        this.updateContextSummary();

        if (this.input) {
          setTimeout(() => {
            try { this.input.focus(); } catch (e) {}
          }, 80);
        }

        this.scrollToBottom();
        console.log(' [AI COPILOT] Painel do Copiloto aberto com sucesso.');
      } catch (err) {
        console.error(' [AI COPILOT ERROR] Exceção capturada ao abrir o Copiloto:', err);
      }
    },

    close() {
      try {
        console.log('[AI COPILOT] Invocando close()...');
        if (!this.drawer) {
          this.drawer = document.getElementById('aiCopilotDrawer');
        }
        if (!this.drawer) {
          console.error(' [AI COPILOT ERROR] Elemento #aiCopilotDrawer é nulo ao fechar.');
          return;
        }

        this.isOpen = false;
        this.drawer.classList.remove('active', 'open');
        this.drawer.style.display = 'none';
        this.drawer.setAttribute('aria-hidden', 'true');

        const allButtons = document.querySelectorAll(
          '#btnFloatingCopilot, #btnCopiloto, #btnInspectorCopiloto, #btnRuralCopiloto, .btn-copiloto, .btn-floating-copilot'
        );
        allButtons.forEach(b => b.classList.remove('copilot-active', 'active'));
        console.log(' [AI COPILOT] Painel do Copiloto fechado com sucesso.');
      } catch (err) {
        console.error(' [AI COPILOT ERROR] Exceção capturada ao fechar o Copiloto:', err);
      }
    },

    /**
     * FASE 1: Persistência de Sessão no sessionStorage (versus_copilot_history_v1)
     */
    saveHistoryToSession() {
      try {
        if (!window.sessionStorage) return;
        // Salva até os últimos 40 itens na fila de sessão
        const toSave = Array.isArray(this.sessionMessages) ? this.sessionMessages.slice(-40) : [];
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch (err) {
        console.warn('[AI COPILOT] Falha ao persistir no sessionStorage:', err);
      }
    },

    loadHistoryFromSession() {
      try {
        if (!window.sessionStorage) return false;
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return false;

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return false;

        this.sessionMessages = parsed;
        if (this.messagesContainer) {
          this.messagesContainer.innerHTML = '';
          this.sessionMessages.forEach(item => {
            if (item.type === 'card') {
              this.renderActionCard({
                icon: item.icon,
                title: item.title,
                message: item.message,
                buttonLabel: item.buttonLabel
              }, false);
            } else {
              this.appendMessage(item.role || 'assistant', item.content || '', item.model || null, false);
            }
          });
        }

        // Reconstrói this.history para os envios de chat (somente mensagens role user/assistant)
        this.history = this.sessionMessages
          .filter(m => m.type !== 'card' && (m.role === 'user' || m.role === 'assistant') && m.content)
          .map(m => ({ role: m.role, content: m.content }))
          .slice(-20);

        console.log(`[AI COPILOT] ${this.sessionMessages.length} mensagens restauradas do sessionStorage (${STORAGE_KEY}).`);
        return true;
      } catch (err) {
        console.error('[AI COPILOT] Falha ao restaurar histórico do sessionStorage:', err);
        return false;
      }
    },

    clearChat() {
      this.history = [];
      this.sessionMessages = [];
      try {
        if (window.sessionStorage) {
          window.sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {}

      if (this.currentAudio) {
        try { this.currentAudio.pause(); } catch(e) {}
        this.currentAudio = null;
        this.currentPlayingBtn = null;
      }

      if (this.messagesContainer) {
        this.messagesContainer.innerHTML = '';
        this.appendMessage('assistant', 'Conversa reiniciada. Sou o **Copiloto da Plataforma VERSUS**. Memória resetada para um novo tópico. Como posso auxiliá-lo agora?', null, true);
      }

      if (typeof showToast === 'function') {
        showToast('Novo tópico iniciado. Memória do Copiloto resetada.');
      }
    },

    updateContextSummary() {
      if (!this.contextSummary) return;

      const ruralProps = Array.isArray(window.ruralPropertiesData) ? window.ruralPropertiesData : [];
      const leads = Array.isArray(window.allLeads) ? window.allLeads : [];

      if (ruralProps.length > 0) {
        const withWa = ruralProps.filter(p => p.whatsapp_validado).length;
        this.contextSummary.textContent = `${ruralProps.length} propriedades rurais (${withWa} com WhatsApp)`;
      } else if (leads.length > 0) {
        this.contextSummary.textContent = `${leads.length} leads B2B carregados`;
      } else {
        this.contextSummary.textContent = `Aguardando seleção/filtro na tela`;
      }
    },

    /**
     * FASE 1: Telemetria de Estado Rica (Snapshot em tempo real do front-end)
     */
    gatherActiveContext() {
      const ruralProps = Array.isArray(window.ruralPropertiesData) ? window.ruralPropertiesData : [];
      const leads = Array.isArray(window.allLeads) ? window.allLeads : [];
      const inspected = window.currentInspectedRuralProperty || null;
      const inspectedLead = window.currentInspectedLead || null;

      // 1. Identificação da aba ativa no momento
      let activeTab = 'table';
      const activeTabBtn = document.querySelector('.viewport-tab-btn.active');
      if (activeTabBtn && activeTabBtn.getAttribute('data-view')) {
        activeTab = activeTabBtn.getAttribute('data-view');
      } else {
        const paneMap = document.getElementById('paneMap');
        if (paneMap && (paneMap.classList.contains('active') || paneMap.style.display === 'flex' || paneMap.style.display === 'block')) {
          activeTab = 'map';
        }
      }

      // 2. Snapshot de Filtros Ativos
      const activeFilters = {};
      if (window.state && window.state.filters) {
        Object.entries(window.state.filters).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '' && v !== 'all') {
            activeFilters[k] = v;
          }
        });
      }
      const filterStateEl = document.getElementById('filterState');
      if (filterStateEl && filterStateEl.value) activeFilters.uf = filterStateEl.value;
      const filterMunicipioEl = document.getElementById('filterMunicipio');
      if (filterMunicipioEl && filterMunicipioEl.value) activeFilters.municipio = filterMunicipioEl.value;
      const filterCropEl = document.getElementById('filterCrop');
      if (filterCropEl && filterCropEl.value) activeFilters.cultura = filterCropEl.value;
      const filterScoreEl = document.getElementById('filterScore');
      if (filterScoreEl && filterScoreEl.value) activeFilters.score_min = filterScoreEl.value;
      const filterCarStatusEl = document.getElementById('filterCarStatus');
      if (filterCarStatusEl && filterCarStatusEl.value) activeFilters.status_car = filterCarStatusEl.value;

      const hasActiveFilters = Object.keys(activeFilters).length > 0;

      // 3. Viewport do Mapa Espacial (MapLibre GL JS)
      let mapViewport = null;
      try {
        const map = window.MapEngine?.getMap?.() || window.mapEngine?.getMap?.();
        if (map && typeof map.getCenter === 'function') {
          const center = map.getCenter();
          const zoom = map.getZoom();
          mapViewport = {
            center: [Number(center.lng.toFixed(4)), Number(center.lat.toFixed(4))],
            zoom: Number(zoom.toFixed(2))
          };
        }
      } catch (e) {}

      // 4. Lead ou Imóvel Inspecionado no momento
      let inspectedData = null;
      if (inspected) {
        inspectedData = {
          tipo: 'rural',
          id: inspected.id,
          sigef: inspected.id_sigef,
          nome: inspected.nome_imovel,
          titular: inspected.nome_titular,
          municipio: `${inspected.municipio}/${inspected.uf}`,
          area_ha: inspected.area_hectares,
          score: inspected.intent_score,
          classificacao: inspected.intent_classification,
          cultura: inspected.dados_agronomicos?.crop_type || null,
          whatsapp: inspected.whatsapp_validado || null
        };
      } else if (inspectedLead) {
        inspectedData = {
          tipo: 'b2b',
          id: inspectedLead.id,
          razao_social: inspectedLead.razao_social || inspectedLead.nome,
          cnpj: inspectedLead.cnpj,
          municipio: `${inspectedLead.municipio}/${inspectedLead.uf}`,
          telefone: inspectedLead.telefone_validado || inspectedLead.telefone
        };
      }

      // Amostra compactada das propriedades rurais para token limit
      const propertiesSample = ruralProps.slice(0, 15).map(p => ({
        id: p.id,
        id_sigef: p.id_sigef,
        nome_imovel: p.nome_imovel,
        nome_titular: p.nome_titular,
        cpf_cnpj_titular: p.cpf_cnpj_titular,
        municipio: p.municipio,
        uf: p.uf,
        area_hectares: p.area_hectares,
        status_geo: p.status_geo,
        intent_score: p.intent_score,
        intent_classification: p.intent_classification,
        dados_agronomicos: p.dados_agronomicos,
        whatsapp_validado: p.whatsapp_validado
      }));

      return {
        active_tab: activeTab,
        has_active_filters: hasActiveFilters,
        active_filters: activeFilters,
        map_viewport: mapViewport,
        total_properties_in_memory: ruralProps.length,
        total_leads_in_memory: leads.length,
        inspected_property: inspectedData,
        properties: propertiesSample
      };
    },

    async handleSend() {
      if (!this.input || this.isWaiting) return;
      const text = this.input.value.trim();
      if (!text) return;

      this.input.value = '';
      this.input.style.height = '50px';
      this.appendMessage('user', text);
      this.history.push({ role: 'user', content: text });

      this.isWaiting = true;
      if (this.sendBtn) this.sendBtn.disabled = true;

      // Indicador de digitação
      const typingEl = this.appendTypingIndicator();

      try {
        const context = this.gatherActiveContext();
        const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : { 'Content-Type': 'application/json' };

        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt: text,
            context,
            history: this.history
          })
        });

        const data = await res.json();
        typingEl.remove();

        // FASE 59 (ETAPA 4): Interceptação de Test Drive Expirado (HTTP 403)
        if (res.status === 403 || data.error === 'TEST_DRIVE_EXPIRED') {
          const expiredMsg = data.message || 'O seu Test Drive expirou. Contate o suporte para ativar as suas próprias chaves e continuar a faturar.';
          this.appendMessage('assistant', `**Acesso Bloqueado:** ${expiredMsg}`);
          if (typeof window.handleTestDriveExpired === 'function') {
            window.handleTestDriveExpired(expiredMsg);
          }
          return;
        }

        if (res.ok && data.success) {
          const reply = data.reply || 'Resposta recebida do assistente.';
          this.appendMessage('assistant', reply, data.model);
          this.history.push({ role: 'assistant', content: reply });

          if (this.isLiveMode) {
            this.speakLiveResponse(reply, data.spoken_response);
          }

          // FASE COPILOTO 2.0: Despacho de UI Actions Universais (Câmera 3D, Abas, Drawer, Filtros)
          if (data.ui_actions && Array.isArray(data.ui_actions) && data.ui_actions.length > 0) {
            if (window.CopilotActionBus && typeof window.CopilotActionBus.dispatch === 'function') {
              window.CopilotActionBus.dispatch(data.ui_actions);
            }
          }

          // FASE 54 & COPILOTO 2.0: Motor de Interceptação / Action Dispatcher
          if (data.action) {
            this.dispatchAction(data.action, data.action_payload || {});
          }

          // REDE DE SEGURANÇA CLIENT-SIDE: Garante alternância de aba visual no painel mesmo se o payload vier sem actions
          const rLower = (reply || '').toLowerCase();
          const hasNoServerActions = (!data.ui_actions || data.ui_actions.length === 0) && (!data.action || data.action === '');
          if (hasNoServerActions) {
            if (rLower.includes('mapa espacial') || rLower.includes('mapa webgl')) {
              console.log('[AI COPILOT] Reconciliação client-side: alternando para mapa espacial');
              if (window.CopilotActionBus && typeof window.CopilotActionBus.executeSwitchTab === 'function') {
                window.CopilotActionBus.executeSwitchTab({ aba: 'map' });
              } else {
                const btn = document.getElementById('tabViewMap') || document.querySelector('.viewport-tab-btn[data-view="map"]');
                if (btn) btn.click();
              }
            } else if (rLower.includes('tabela analítica') || (rLower.includes('tabela') && rLower.includes('alternando'))) {
              if (window.CopilotActionBus && typeof window.CopilotActionBus.executeSwitchTab === 'function') {
                window.CopilotActionBus.executeSwitchTab({ aba: 'table' });
              } else {
                const btn = document.getElementById('tabViewTable') || document.querySelector('.viewport-tab-btn[data-view="table"]');
                if (btn) btn.click();
              }
            }
          }
        } else {
          const errorMsg = data.error || 'Erro ao processar sua solicitação com a IA.';
          this.appendMessage('assistant', `**Aviso:** ${errorMsg}`);
        }
      } catch (err) {
        typingEl.remove();
        console.error('Falha no Copiloto IA:', err);
        this.appendMessage('assistant', '**Erro de Conexão:** Não foi possível contactar o servidor do Copiloto.');
      } finally {
        this.isWaiting = false;
        if (this.sendBtn) this.sendBtn.disabled = false;
        if (this.input) this.input.focus();
        this.scrollToBottom();
      }
    },

    /**
     * Action Dispatcher (Motor de Execução Autônoma)
     */
    dispatchAction(action, payload = {}) {
      console.log(`[COPILOT ACTION DISPATCHER] Executando ação autônoma: ${action}`, payload);

      switch (action) {
        case 'trigger_export_meta_ads':
          this.executeMetaAdsExportAction(payload);
          break;

        case 'trigger_export_comercial':
          this.executeCommercialExportAction(payload);
          break;

        case 'trigger_filter_agro':
          this.executeFilterAgroAction(payload);
          break;

        case 'trigger_car_filter':
          // FASE 57 — ETAPA 5: Filtro Ambiental SICAR/CAR
          this.executeCarFilterAction(payload);
          break;

        case 'trigger_sdr_outbound':
          this.executeSdrOutboundAction(payload);
          break;

        case 'trigger_schedule_scraping':
          this.executeScheduleScrapingAction(payload);
          break;

        case 'trigger_crm_export':
          // FASE 56: CRM Webhook Gateway
          this.executeCrmExportAction(payload);
          break;

        case 'trigger_sync_meta_ads':
          // FASE 54/56: Sincronização Direta com Meta Marketing API
          this.executeSyncMetaAdsAction(payload);
          break;

        case 'trigger_inspect_lead':
          // FASE 4: Automação Universal de UI — Inspecionar Lead no Drawer
          this.executeInspectLeadAction(payload);
          break;

        case 'trigger_switch_tab':
          // FASE 4: Automação Universal de UI — Alternar Viewport Central
          this.executeSwitchTabAction(payload);
          break;

        case 'trigger_clear_filters':
          // FASE 4: Automação Universal de UI — Limpar Filtros
          this.executeClearFiltersAction(payload);
          break;

        case 'trigger_visual_audit':
          // FASE 4: Automação Universal de UI — Auditoria Visual (Satélite / Street View)
          this.executeVisualAuditAction(payload);
          break;

        case 'trigger_consult_sparks':
          this.executeConsultSparksAction(payload);
          break;

        case 'trigger_competitor_sweep':
          this.executeCompetitorSweepAction(payload);
          break;

        case 'trigger_analyze_gaps':
          this.executeAnalyzeGapsAction(payload);
          break;

        case 'trigger_enrich_bureau':
          this.executeEnrichBureauAction(payload);
          break;

        case 'trigger_rl_feedback':
          if (window.CopilotActionBus) {
            window.CopilotActionBus.notify('Feedback de Reforço registrado no LinUCB.');
          }
          break;

        case 'trigger_dispatch_ui':
          if (window.CopilotActionBus && payload.actions) {
            window.CopilotActionBus.dispatch(payload.actions);
          }
          break;

        default:
          console.warn(`Ação desconhecida recebida do Copiloto: ${action}`);
      }
    },

    /**
     * Sincronização Direta com a Meta Marketing API (Custom Audiences)
     */
    async executeSyncMetaAdsAction(payload = {}) {
      const { audience_name, tipo_lead = 'agro', lead_ids } = payload;

      const loadingCard = this.renderActionCard({
        icon: '⏳',
        title: 'Sincronizando com Meta Ads...',
        message: 'Criptografando registros com SHA-256 e conectando à Graph API do Meta Ads...',
      });

      try {
        const headers = typeof window.getApiHeaders === 'function'
          ? window.getApiHeaders()
          : { 'Content-Type': 'application/json' };

        let idsToSend = Array.isArray(lead_ids) && lead_ids.length > 0
          ? lead_ids
          : (Array.isArray(window.ruralPropertiesData)
              ? window.ruralPropertiesData.map(p => p.id).filter(Boolean)
              : []);

        const res = await fetch('/api/integrations/meta/sync', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            audience_name: audience_name || `Audience Agro - ${new Date().toISOString().slice(0, 10)}`,
            lead_ids: idsToSend,
            tipo: tipo_lead
          })
        });

        const data = await res.json();
        if (loadingCard && loadingCard.parentNode) loadingCard.remove();

        // FASE 59 (ETAPA 4): Interceptação de Test Drive Expirado (HTTP 403)
        if (res.status === 403 || data.error === 'TEST_DRIVE_EXPIRED') {
          const expiredMsg = data.message || 'O seu Test Drive expirou. Contate o suporte para ativar as suas próprias chaves e continuar a faturar.';
          this.renderActionCard({
            icon: '',
            title: 'Test Drive Expirado',
            message: `<strong>Bloqueio de Faturamento:</strong> ${expiredMsg}`
          });
          if (typeof window.handleTestDriveExpired === 'function') {
            window.handleTestDriveExpired(expiredMsg);
          }
          return;
        }

        if (data.success) {
          this.renderActionCard({
            icon: '',
            title: 'Público Sincronizado no Meta Ads!',
            message: `<strong>${data.records_synced || 0}</strong> leads criptografados em SHA-256 e injetados com sucesso.<br>` +
              `Público: <strong>${data.audience_name || 'Custom Audience'}</strong><br>` +
              `Audience ID: <code>${data.audience_id}</code><br>` +
              `Taxa de Pareamento: <strong>${data.estimated_match_rate}</strong><br>` +
              (data.is_simulated ? '<span style="color:#38bdf8;font-size:11px;">Modo de Homologação / Sandbox Ativo</span>' : '<span style="color:#10b981;font-size:11px;">Meta Ads Live Conectado</span>'),
            buttonLabel: 'Ver no Gerenciador',
            onClick: () => window.open(`https://adsmanager.facebook.com/adsmanager/audiences`, '_blank')
          });
          if (typeof showToast === 'function') showToast(`${data.records_synced || 0} leads sincronizados no Meta Ads.`);
        } else {
          this.renderActionCard({
            icon: '',
            title: 'Falha na Sincronização Meta Ads',
            message: data.error || data.message || 'Erro ao sincronizar com Meta Ads.'
          });
          if (typeof showToast === 'function') showToast('Falha na sincronização com Meta Ads.');
        }
      } catch (err) {
        if (loadingCard && loadingCard.parentNode) loadingCard.remove();
        console.error('[SYNC_META_ADS_ACTION_ERROR]', err);
        this.renderActionCard({
          icon: '',
          title: 'Erro de Conexão com Meta API',
          message: err.message || 'Falha de rede ao conectar com o serviço do Meta Ads.'
        });
      }
    },

    /**
     * Despacho Canônico: Meta Ads Oficial (SHA-256 / E.164)
     */
    async executeMetaAdsExportAction(payload = {}) {
      if (typeof window.executeExport === 'function') {
        await window.executeExport('meta_ads');
      } else {
        await this.downloadCanonicalExport('meta_ads');
      }

      this.renderActionCard({
        icon: '🎯',
        title: 'Despacho Meta Ads Gerado',
        message: 'A planilha oficial criptografada em <strong>SHA-256</strong> para o Meta Ads (Custom Audiences) foi gerada e o download iniciado.',
        buttonLabel: '⬇️ Baixar Novamente',
        onClick: () => this.executeMetaAdsExportAction(payload)
      });

      if (typeof showToast === 'function') {
        showToast('🎯 Despacho Meta Ads gerado com sucesso!');
      }
    },

    /**
     * Despacho Canônico: Comercial B2B / Máquinas (Sem notação científica + Links WhatsApp Web)
     */
    async executeCommercialExportAction(payload = {}) {
      if (typeof window.executeExport === 'function') {
        await window.executeExport('comercial_b2b_maquinas');
      } else {
        await this.downloadCanonicalExport('comercial_b2b_maquinas');
      }

      this.renderActionCard({
        icon: '🚜',
        title: 'Despacho Comercial Gerado',
        message: 'A planilha comercial atualizada com <strong>links de WhatsApp Web</strong> e <strong>frotas estimadas</strong> (sem notação científica) foi gerada com sucesso.',
        buttonLabel: '⬇️ Baixar Novamente',
        onClick: () => this.executeCommercialExportAction(payload)
      });

      if (typeof showToast === 'function') {
        showToast('🚜 Despacho Comercial gerado com sucesso!');
      }
    },

    /**
     * Fallback para download de exportação canônica via API
     */
    async downloadCanonicalExport(format) {
      try {
        const payload = {
          format,
          lead_ids: (window.state && window.state.selectAllFiltered) ? [] : (window.state && window.state.selectedLeadIds ? Array.from(window.state.selectedLeadIds) : []),
          filters: (window.state && (window.state.selectAllFiltered || !window.state.selectedLeadIds || window.state.selectedLeadIds.size === 0)) ? (window.state.filters || null) : null
        };

        const headers = { 'Content-Type': 'application/json' };
        if (window.state && window.state.auth && window.state.auth.token) {
          headers['Authorization'] = `Bearer ${window.state.auth.token}`;
        }

        const res = await fetch('/api/leads/export', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Falha ao exportar planilha');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const today = new Date().toISOString().slice(0, 10);
        a.download = format === 'comercial_b2b_maquinas'
          ? `despacho-comercial-implementos-${today}.csv`
          : `meta-ads-audiences-sha256-${today}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error('[COPILOT EXPORT ERROR]', err);
        if (typeof showToast === 'function') showToast(`Erro ao exportar: ${err.message}`);
      }
    },

    /**
     * Ação 2: Filtra a Malha Fundiária no Mapa e Tabela Analítica (FASE 2)
     */
    executeFilterAgroAction(payload) {
      const {
        cultura,
        uf,
        municipio,
        score_minimo,
        classificacao_intencao,
        area_minima_ha,
        apenas_whatsapp,
        matching_count
      } = payload;

      let filterDesc = [];
      if (score_minimo !== undefined && score_minimo !== null) filterDesc.push(`Score Mínimo: <strong>>= ${score_minimo} pts</strong>`);
      if (classificacao_intencao && classificacao_intencao !== 'ALL') filterDesc.push(`Intenção: <strong>${classificacao_intencao}</strong>`);
      if (cultura) filterDesc.push(`Cultura: <strong>${cultura}</strong>`);
      if (municipio) filterDesc.push(`Município: <strong>${municipio}</strong>`);
      if (uf) filterDesc.push(`Estado: <strong>${uf}</strong>`);
      if (area_minima_ha) filterDesc.push(`Área: <strong>>= ${area_minima_ha} ha</strong>`);
      if (apenas_whatsapp) filterDesc.push(`WhatsApp Validado`);

      // 1. Atualiza o barramento unificado de filtros da plataforma VERSUS (FASE 2)
      if (typeof window.setVersusFilters === 'function') {
        window.setVersusFilters({
          cultura: cultura || null,
          uf: (uf || '').toUpperCase() || null,
          municipio: municipio || null,
          score_min: score_minimo !== undefined && score_minimo !== null ? Number(score_minimo) : null,
          intent_classification: (classificacao_intencao && classificacao_intencao !== 'ALL') ? classificacao_intencao : null,
          area_min_ha: area_minima_ha ? Number(area_minima_ha) : null,
          apenas_whatsapp: Boolean(apenas_whatsapp),
          origem: 'RURAL_SIGEF'
        }, 'copilot');
      }

      // 2. Dispara busca regional no mapEngine se houver UF ou Município
      if ((uf || municipio) && window.mapEngine && typeof window.mapEngine.executeRegionalMeshSearch === 'function') {
        window.mapEngine.executeRegionalMeshSearch(uf || '', municipio || '');
      } else if ((uf || municipio) && typeof window.carregarMalha === 'function') {
        window.carregarMalha(uf || '', municipio || '');
      }

      // 3. Filtra dinamicamente as propriedades em memória e seleciona a mais relevante no Drawer
      let matchingProps = [];
      if (Array.isArray(window.ruralPropertiesData)) {
        matchingProps = window.ruralPropertiesData.filter(p => {
          if (score_minimo !== undefined && score_minimo !== null && (Number(p.intent_score) || 0) < Number(score_minimo)) return false;
          if (classificacao_intencao && classificacao_intencao !== 'ALL' && (p.intent_classification || '').toUpperCase() !== classificacao_intencao.toUpperCase()) return false;
          if (cultura && !(p.dados_agronomicos?.crop_type || '').toLowerCase().includes(cultura.toLowerCase())) return false;
          if (uf && (p.uf || '').toUpperCase() !== uf.toUpperCase()) return false;
          if (municipio && !(p.municipio || '').toLowerCase().includes(municipio.toLowerCase())) return false;
          if (area_minima_ha && (Number(p.area_hectares) || 0) < Number(area_minima_ha)) return false;
          if (apenas_whatsapp && !p.whatsapp_validado) return false;
          return true;
        });

        if (matchingProps.length > 0 && typeof window.inspectRuralPropertyInDrawer === 'function') {
          window.inspectRuralPropertyInDrawer(matchingProps[0]);
        }
      }

      const totalMatches = matchingProps.length > 0 ? matchingProps.length : (matching_count || 0);

      this.renderActionCard({
        icon: '',
        title: 'Filtro Especialista Aplicado',
        message: `${filterDesc.join(' • ') || 'Malha regional atualizada no mapa WebGL.'}<br>` +
          (totalMatches > 0 ? `<strong>${totalMatches} propriedades</strong> qualificadas no painel.` : 'Malha visual e tabela atualizadas com sucesso.'),
        buttonLabel: 'Restaurar Filtros',
        onClick: () => {
          if (typeof window.clearVersusFilters === 'function') {
            window.clearVersusFilters('copilot_card');
          } else if (window.state && window.state.filters) {
            delete window.state.filters.min_intent_score;
            window.state.filters.intent_stage = 'ALL';
            if (typeof window.applyFilters === 'function') window.applyFilters();
          }
          if (typeof showToast === 'function') showToast('Filtros restaurados para o padrão.');
        }
      });

      if (typeof showToast === 'function') {
        showToast(`Filtro aplicado: ${filterDesc.join(', ') || 'Malha atualizada'}`);
      }
    },

    /**
     * FASE 57 — ETAPA 5: Filtro Ambiental SICAR/CAR
     * Acionado pela action trigger_car_filter do Copiloto.
     * 1. Configura as camadas via MapFundiarioEngine (SIGEF visível/oculta, CAR sempre ativo)
     * 2. Se UF/município, dispara busca regional no mapEngine
     * 3. Renderiza card tático verde no chat com status do filtro
     */
    executeCarFilterAction(payload = {}) {
      const {
        uf,
        municipio,
        status_car = 'TODOS_PENDENTES',
        mostrar_apenas_sicar = false
      } = payload;

      // ─── 0. Sincroniza barramento unificado de filtros (FASE 2) ───────────────
      if (typeof window.setVersusFilters === 'function') {
        window.setVersusFilters({
          uf: (uf || '').toUpperCase() || null,
          municipio: municipio || null,
          status_car,
          origem: 'RURAL_SIGEF'
        }, 'copilot');
      }

      // ─── 1. Configura visibilidade das camadas no MapFundiarioEngine ──────────
      const engine = window.MapFundiarioEngine;
      // Salva estado anterior para o botão "Limpar Filtro"
      const prevSigefVisible = engine?.getSigefVisible?.() ?? true;
      const prevCarVisible   = engine?.getCarVisible?.()   ?? true;

      if (engine) {
        // CAR sempre ativo nesta view
        if (engine.setCarVisible) engine.setCarVisible(true);

        // Se pediu "mostrar apenas SICAR" → oculta SIGEF
        if (mostrar_apenas_sicar && engine.setSigefVisible) {
          engine.setSigefVisible(false);
        }

        // Sincroniza visual dos botões toggle no mapa
        const btnSigef = document.getElementById('toggleSigefLayerBtn');
        const btnCar   = document.getElementById('toggleCarLayerBtn');
        const sigefActive = !mostrar_apenas_sicar;

        const sigefActiveStyle   = 'display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;padding:0.1rem 0.35rem;border-radius:4px;background:rgba(56,189,248,0.18);border:1px solid rgba(56,189,248,0.35);font-size:0.6rem;font-weight:800;color:#38BDF8;transition:all 0.18s;';
        const sigefInactiveStyle = 'display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;padding:0.1rem 0.35rem;border-radius:4px;background:rgba(100,116,139,0.12);border:1px solid rgba(100,116,139,0.25);font-size:0.6rem;font-weight:800;color:#475569;transition:all 0.18s;opacity:0.55;text-decoration:line-through;';
        const carActiveStyle     = 'display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;padding:0.1rem 0.35rem;border-radius:4px;background:rgba(34,197,94,0.18);border:1px solid rgba(34,197,94,0.35);font-size:0.6rem;font-weight:800;color:#4ADE80;transition:all 0.18s;';

        if (btnSigef) btnSigef.style.cssText = sigefActive ? sigefActiveStyle : sigefInactiveStyle;
        if (btnCar)   btnCar.style.cssText   = carActiveStyle;
      }

      // ─── 2. Busca regional se UF ou município fornecidos ──────────────────────
      if ((uf || municipio) && window.mapEngine && typeof window.mapEngine.executeRegionalMeshSearch === 'function') {
        window.mapEngine.executeRegionalMeshSearch(uf || '', municipio || '');
      }

      // ─── 3. Filtro visual em memória — destaca propriedades com passivo ───────
      if (Array.isArray(window.ruralPropertiesData)) {
        const passivos = window.ruralPropertiesData.filter(p => {
          if (uf && p.uf !== uf) return false;
          const pStatus = (p.status_car || '').toUpperCase();
          const temPassivo = Boolean(p.tem_passivo_ambiental);
          const semCar = !p.codigo_car;
          if (status_car === 'TODOS_PENDENTES') {
            return semCar || temPassivo || ['PENDENTE','SUSPENSO','CANCELADO','NOTIFICADO'].includes(pStatus);
          }
          if (status_car === 'SEM_CAR') return semCar;
          return pStatus === status_car;
        });

        // Abre o mais quente com passivo no drawer
        if (passivos.length > 0 && typeof window.inspectRuralPropertyInDrawer === 'function') {
          const hotPassivo = passivos.sort((a, b) => (b.intent_score || 0) - (a.intent_score || 0))[0];
          window.inspectRuralPropertyInDrawer(hotPassivo);
        }
      }

      // ─── 4. Card tático no chat ───────────────────────────────────────────────
      const statusLabels = {
        PENDENTE: 'CAR Pendente',
        SUSPENSO: 'CAR Suspenso',
        CANCELADO: 'CAR Cancelado',
        SEM_CAR: 'Sem CAR Mapeado',
        TODOS_PENDENTES: 'Qualquer Pendência Ambiental'
      };
      const statusLabel = statusLabels[status_car] || 'Pendência Ambiental';
      const ufPart  = uf ? ` · ${uf}` : '';
      const munPart = municipio ? ` · ${municipio}` : '';

      this.renderActionCard({
        icon: '',
        title: `Filtro Ambiental Aplicado${ufPart}${munPart}`,
        message:
          `<strong>${statusLabel}</strong> isolado no mapa WebGL.<br>` +
          `<span style="font-size:0.65rem;color:#94A3B8;">` +
          `<span style="color:#4ADE80;">●</span> Verde = SICAR/CAR &nbsp;` +
          `<span style="color:#F59E0B;">●</span> Âmbar = SIGEF+CAR (Fusão) &nbsp;` +
          `<span style="color:#38BDF8;">●</span> Ciano = SIGEF puro` +
          `</span><br><br>` +
          `<em style="font-size:0.65rem;color:#64748B;">Targets prioritários: Consultoria Florestal · Crédito Rural Verde · PRA · Assessoria Jurídica.</em>`,
        buttonLabel: '↩ Limpar Filtro CAR',
        onClick: () => {
          if (typeof window.clearVersusFilters === 'function') {
            window.clearVersusFilters('copilot_car_card');
          }
          // Restaura estado anterior das camadas
          if (engine) {
            if (engine.setSigefVisible) engine.setSigefVisible(prevSigefVisible);
            if (engine.setCarVisible)   engine.setCarVisible(prevCarVisible);
            const btnSigef2 = document.getElementById('toggleSigefLayerBtn');
            const btnCar2   = document.getElementById('toggleCarLayerBtn');
            const sigefActiveStyle2 = 'display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;padding:0.1rem 0.35rem;border-radius:4px;background:rgba(56,189,248,0.18);border:1px solid rgba(56,189,248,0.35);font-size:0.6rem;font-weight:800;color:#38BDF8;transition:all 0.18s;';
            const carActiveStyle2   = 'display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;padding:0.1rem 0.35rem;border-radius:4px;background:rgba(34,197,94,0.18);border:1px solid rgba(34,197,94,0.35);font-size:0.6rem;font-weight:800;color:#4ADE80;transition:all 0.18s;';
            if (btnSigef2) btnSigef2.style.cssText = sigefActiveStyle2;
            if (btnCar2)   btnCar2.style.cssText   = carActiveStyle2;
          }
          if (typeof showToast === 'function') showToast('↩ Filtro Ambiental CAR removido. Malha completa restaurada.');
        }
      });

      if (typeof showToast === 'function') {
        showToast(`Filtro Ambiental Aplicado: ${statusLabel}${ufPart}${munPart}`);
      }
    },

    /**
     * Ação 4 (Fase 56): Injeta leads no CRM via Webhook
     */
    async executeCrmExportAction(payload = {}) {
      const { tipo_lead = 'all', lead_ids = [] } = payload;

      // Card de loading imediato
      const loadingCard = document.createElement('div');
      loadingCard.className = 'copilot-action-card';
      loadingCard.innerHTML = `
        <div class="action-card-header">
          
          <span>Injetando Leads no CRM...</span>
        </div>
        <div class="action-card-body">Disparando payload para o Webhook configurado. Aguarde...</div>
      `;
      if (this.messagesContainer) {
        this.messagesContainer.appendChild(loadingCard);
        this.scrollToBottom();
      }

      try {
        const headers = typeof window.getApiHeaders === 'function'
          ? window.getApiHeaders()
          : { 'Content-Type': 'application/json' };

        // Coleta IDs dos leads/propriedades em memória se não fornecidos
        let idsToSend = Array.isArray(lead_ids) && lead_ids.length > 0
          ? lead_ids
          : (Array.isArray(window.ruralPropertiesData)
              ? window.ruralPropertiesData.map(p => p.id).filter(Boolean)
              : []);

        const res = await fetch('/api/crm/export', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            lead_ids: idsToSend,
            tipo_lead,
          })
        });

        const data = await res.json();
        loadingCard.remove();

        // CRM não configurado — aviso amigável
        if (!data.configured) {
          this.renderActionCard({
            icon: '',
            title: 'CRM não configurado',
            message: `Defina a variável <code>CRM_WEBHOOK_URL</code> no arquivo <code>.env</code> do servidor para ativar o envio automático para o seu CRM (RD Station, HubSpot, Pipefy, etc.).`,
            buttonLabel: 'Ver documentação',
            onClick: () => window.open('https://docs.versus.ai/crm-webhook', '_blank')
          });
          if (typeof showToast === 'function') showToast('Configure CRM_WEBHOOK_URL no .env para ativar o envio.');
          return;
        }

        // Sucesso
        if (data.success) {
          this.renderActionCard({
            icon: '',
            title: 'Leads injetados no CRM com sucesso.',
            message: `<strong>${data.total_processed || 0}</strong> registros enviados para o funil de vendas via Webhook.` +
              (data.tipo_lead ? ` Tipo: <strong>${data.tipo_lead}</strong>.` : ''),
          });
          if (typeof showToast === 'function') showToast(`${data.total_processed || 0} leads injetados no CRM com sucesso.`);
        } else {
          this.renderActionCard({
            icon: '',
            title: 'Falha na injeção CRM',
            message: data.error || data.message || 'Erro ao enviar leads para o CRM.'
          });
          if (typeof showToast === 'function') showToast('Falha ao injetar leads no CRM.');
        }
      } catch (err) {
        if (loadingCard.parentNode) loadingCard.remove();
        console.error('[CRM_EXPORT_ACTION_ERROR]', err);
        this.renderActionCard({
          icon: '',
          title: 'Erro de Conexão — CRM Export',
          message: `Não foi possível conectar ao servidor: <code>${err.message}</code>`
        });
      }
    },

    /**
     * Ação 3: Isola Dossiê SDR e Prepara Abordagem
     */
    executeSdrOutboundAction(payload) {
      const properties = Array.isArray(window.ruralPropertiesData) ? window.ruralPropertiesData : [];
      let targetProp = null;

      if (payload.id_propriedade) {
        targetProp = properties.find(p => p.id === payload.id_propriedade || p.id_sigef === payload.id_propriedade);
      }
      if (!targetProp) {
        targetProp = properties.find(p => p.intent_classification === 'HOT') || properties[0];
      }

      if (targetProp && typeof window.inspectRuralPropertyInDrawer === 'function') {
        window.inspectRuralPropertyInDrawer(targetProp);
      }

      const phone = targetProp?.whatsapp_validado || payload.phone;
      const cleanPhone = phone ? phone.replace(/\D/g, '') : null;
      const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(payload.copy || 'Olá! Gostaria de conversar sobre sua propriedade.')}` : null;

      this.renderActionCard({
        icon: '',
        title: 'Abordagem SDR Pronta',
        message: `Dossiê de <strong>${targetProp?.nome_titular || 'Produtor Prioritário'}</strong> aberto no Drawer. Mensagem de abordagem personalizada gerada.`,
        buttonLabel: waLink ? ' Iniciar Conversa no WhatsApp' : ' Inspecionar Dossiê',
        onClick: () => {
          if (waLink) window.open(waLink, '_blank');
          else if (targetProp && window.inspectRuralPropertyInDrawer) window.inspectRuralPropertyInDrawer(targetProp);
        }
      });

      if (typeof showToast === 'function') {
        showToast('Dossiê SDR aberto e copy de WhatsApp preparada.');
      }
    },

    /**
     * Ação 4 (FASE 55): Agenda Varredura Noturna Cadenciada (Job Queue)
     */
    executeScheduleScrapingAction(payload) {
      const estado = (payload.estado || 'RS').toUpperCase();
      const cultura = payload.cultura_foco || 'Soja';
      const total = payload.total_agendado || (payload.scheduleResult && payload.scheduleResult.total_agendado) || payload.quantidade_municipios || 5;
      const delayMin = payload.delay_intervalo_minutos || 5;

      this.renderActionCard({
        icon: '',
        title: 'Varredura Noturna Agendada',
        message: `<strong>${total} municípios</strong> na fila para processamento cadenciado (${estado} - ${cultura}).<br><span style="font-size: 0.8rem; color: #94A3B8;">Cadência defensiva: ~${delayMin} min entre cidades para evasão de rate limits do SIGEF/INCRA.</span>`
      });

      if (typeof showToast === 'function') {
        showToast(`Varredura noturna agendada: ${total} municípios (${estado})`);
      }
    },

    /**
     * FASE 4: Aplica micro-animação luminosa (UI Glow) para evidenciar ações do agente
     */
    highlightElement(el) {
      if (!el) return;
      el.classList.remove('copilot-agent-highlight');
      void el.offsetWidth; // Força reflow para reiniciar keyframe
      el.classList.add('copilot-agent-highlight');
      setTimeout(() => {
        el.classList.remove('copilot-agent-highlight');
      }, 2000);
    },

    /**
     * FASE 4: Automação Universal de UI — Inspecionar Lead no Right Drawer
     */
    executeInspectLeadAction(payload = {}) {
      const { identificador = 'primeiro', aba_dossie = 'rural' } = payload;
      const idLower = String(identificador).toLowerCase().trim();

      const ruralProps = Array.isArray(window.ruralPropertiesData) ? window.ruralPropertiesData : [];
      const leads = Array.isArray(window.allLeads) ? window.allLeads : (window.state?.currentLeads || []);

      let targetRural = null;
      let targetLead = null;

      if (idLower === 'primeiro' || idLower === 'primeira' || idLower === 'top1') {
        targetRural = ruralProps[0] || null;
        if (!targetRural) targetLead = leads[0] || null;
      } else if (idLower === 'segundo' || idLower === 'segunda') {
        targetRural = ruralProps[1] || null;
        if (!targetRural) targetLead = leads[1] || null;
      } else if (idLower === 'terceiro' || idLower === 'terceira') {
        targetRural = ruralProps[2] || null;
        if (!targetRural) targetLead = leads[2] || null;
      } else {
        targetRural = ruralProps.find(p =>
          (p.nome_titular && p.nome_titular.toLowerCase().includes(idLower)) ||
          (p.nome_imovel && p.nome_imovel.toLowerCase().includes(idLower)) ||
          (p.id_sigef && p.id_sigef.toLowerCase().includes(idLower)) ||
          (p.id && String(p.id).toLowerCase() === idLower) ||
          (p.cpf_cnpj_titular && p.cpf_cnpj_titular.includes(idLower))
        );

        if (!targetRural) {
          targetLead = leads.find(l =>
            (l.razao_social && l.razao_social.toLowerCase().includes(idLower)) ||
            (l.nome_fantasia && l.nome_fantasia.toLowerCase().includes(idLower)) ||
            (l.cnpj && l.cnpj.includes(idLower)) ||
            (l.id && String(l.id).toLowerCase() === idLower)
          );
        }
      }

      if (!targetRural && !targetLead) {
        targetRural = ruralProps[0] || null;
        if (!targetRural) targetLead = leads[0] || null;
      }

      let openedName = 'Registro selecionado';

      if (targetRural && typeof window.inspectRuralPropertyInDrawer === 'function') {
        window.inspectRuralPropertyInDrawer(targetRural);
        openedName = targetRural.nome_imovel || targetRural.nome_titular || 'Propriedade Rural';
      } else if (targetLead && typeof window.openLeadDetailsDrawer === 'function') {
        window.openLeadDetailsDrawer(targetLead);
        openedName = targetLead.razao_social || targetLead.nome_fantasia || 'Lead B2B';
      }

      // Aplica Glow no Right Drawer
      const drawer = document.getElementById('rightDrawer') || document.querySelector('.right-drawer');
      if (drawer) {
        this.highlightElement(drawer);
      }

      // Se foi solicitada uma aba específica do dossiê
      if (aba_dossie) {
        setTimeout(() => {
          const tabBtn = document.querySelector(`.drawer-tab-btn[data-tab="${aba_dossie}"]`);
          if (tabBtn) tabBtn.click();
        }, 150);
      }

      this.renderActionCard({
        icon: '',
        title: 'Inspetor Aberto Autonomamente',
        message: `Ficha tática de <strong>${openedName}</strong> carregada no painel lateral.<br><span style="font-size: 0.75rem; color: #94A3B8;">Aba em foco: ${aba_dossie.replace('_', ' ').toUpperCase()}</span>`
      });

      if (typeof showToast === 'function') {
        showToast(`Ficha de ${openedName} aberta no Inspetor.`);
      }
    },

    /**
     * FASE 4: Automação Universal de UI — Alternar Viewport Central
     */
    executeSwitchTabAction(payload = {}) {
      const { aba = 'table' } = payload;
      if (window.CopilotActionBus && typeof window.CopilotActionBus.executeSwitchTab === 'function') {
        window.CopilotActionBus.executeSwitchTab(payload);
      } else {
        const targetBtn = document.querySelector(`.viewport-tab-btn[data-view="${aba}"]`);
        if (targetBtn) targetBtn.click();
      }

      const paneMap = {
        map: document.getElementById('paneMap'),
        table: document.getElementById('paneTable'),
        gtm: document.getElementById('paneGtm'),
        competitors: document.getElementById('paneCompetitors'),
        sparks: document.getElementById('paneSparks')
      };
      if (paneMap[aba]) {
        this.highlightElement(paneMap[aba]);
      }

      const tabNames = { 
        map: 'Mapa WebGL', 
        table: 'Tabela Analítica', 
        gtm: 'Funil GTM', 
        competitors: 'Análise de Concorrentes',
        sparks: 'Radar Sparks'
      };
      const tabName = tabNames[aba] || aba;

      const art = (aba === 'table') ? 'a' : 'o';
      this.renderActionCard({
        icon: '',
        title: 'Visualização Central Alternada',
        message: `A tela foi alternada automaticamente para ${art} **${tabName}**.`
      });

      if (typeof showToast === 'function') {
        showToast(`Visualização: ${tabName}`);
      }
    },

    /**
     * FASE 4: Automação Universal de UI — Limpar Filtros
     */
    executeClearFiltersAction() {
      if (typeof window.clearVersusFilters === 'function') {
        window.clearVersusFilters('copilot_robotics');
      } else if (window.state && window.state.filters) {
        delete window.state.filters.min_intent_score;
        window.state.filters.intent_stage = 'ALL';
        if (typeof window.applyFilters === 'function') window.applyFilters();
      }

      const tablePane = document.getElementById('paneTable');
      if (tablePane) this.highlightElement(tablePane);

      this.renderActionCard({
        icon: '',
        title: 'Filtros Resetados',
        message: 'Todos os filtros de busca foram limpos. A base completa de dados e malha fundiária foi restaurada.'
      });

      if (typeof showToast === 'function') {
        showToast('Filtros restaurados para a visão padrão.');
      }
    },

    /**
     * FASE 4: Automação Universal de UI — Auditoria Visual (Satélite / Street View)
     */
    executeVisualAuditAction(payload = {}) {
      const { tipo_auditoria = 'satelite' } = payload;
      const inspected = window.currentInspectedRuralProperty;

      let lat = null;
      let lng = null;

      if (inspected) {
        lat = inspected.centroide_lat || inspected.latitude;
        lng = inspected.centroide_lng || inspected.longitude;
      }

      if (!lat || !lng) {
        try {
          const map = window.MapEngine?.getMap?.() || window.mapEngine?.getMap?.();
          if (map) {
            const center = map.getCenter();
            lng = center.lng;
            lat = center.lat;
          }
        } catch (_) {}
      }

      let mapUrl = '';
      if (lat && lng) {
        if (tipo_auditoria === 'streetview') {
          mapUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
        } else {
          mapUrl = `https://www.google.com/maps/@${lat},${lng},17z/data=!3m1!1e3`;
        }
        try {
          window.open(mapUrl, '_blank');
        } catch (_) {}
      }

      this.renderActionCard({
        icon: '',
        title: 'Auditoria Visual Espacial',
        message: inspected
          ? `Disparada inspeção externa de satélite em alta resolução para <strong>${inspected.nome_imovel || 'Imóvel'}</strong> (${lat ? Number(lat).toFixed(4) : ''}, ${lng ? Number(lng).toFixed(4) : ''}).`
          : 'Disparada inspeção de satélite nas coordenadas geodésicas do viewport ativo.',
        buttonLabel: 'Reabrir Google Maps Satélite',
        onClick: () => {
          if (mapUrl) window.open(mapUrl, '_blank');
        }
      });

      if (typeof showToast === 'function') {
        showToast('Satélite externo aberto em nova aba.');
      }
    },

    /**
     * FASE COPILOTO 2.0: Ação de Consulta do Radar Sparks
     */
    executeConsultSparksAction(payload = {}) {
      const count = payload.total_encontrados || (payload.signals ? payload.signals.length : 0);
      const iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
      this.renderActionCard({
        icon: iconSvg,
        title: 'Radar Sparks: Sinais de Compra',
        message: `Foram identificados <strong>${count} sinais táticos</strong> (Financiamentos BNDES, Outorgas ANA ou Licenças DOU).`,
        buttonLabel: 'Visualizar no Radar Sparks',
        onClick: () => {
          if (window.CopilotActionBus) window.CopilotActionBus.executeSwitchTab({ aba: 'sparks' });
        }
      });
    },

    /**
     * FASE COPILOTO 2.0: Ação de Varredura de Concorrentes
     */
    executeCompetitorSweepAction(payload = {}) {
      const iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>`;
      this.renderActionCard({
        icon: iconSvg,
        title: `Varredura de Concorrentes (${payload.uf || 'Geral'})`,
        message: `Mapeadas <strong>${payload.total_competitors || 0} unidades</strong> e detectados <strong>${payload.total_gaps || 0} Gaps de Mercado</strong> no raio de ${payload.buffer_km || 50} km.`,
        buttonLabel: 'Abrir Módulo de Concorrentes',
        onClick: () => {
          if (window.CopilotActionBus) window.CopilotActionBus.executeSwitchTab({ aba: 'competitors' });
        }
      });
    },

    /**
     * FASE COPILOTO 2.0: Ação de Gaps Territoriais
     */
    executeAnalyzeGapsAction(payload = {}) {
      const count = payload.count || (payload.gaps ? payload.gaps.length : 0);
      const iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
      this.renderActionCard({
        icon: iconSvg,
        title: 'Gaps Territoriais de Mercado',
        message: `Identificadas <strong>${count} zonas de oportunidade</strong> desatendidas pela concorrência.`,
        buttonLabel: 'Visualizar Gaps',
        onClick: () => {
          if (window.CopilotActionBus) window.CopilotActionBus.executeSwitchTab({ aba: 'competitors' });
        }
      });
    },

    /**
     * FASE COPILOTO 2.0: Ação de Enriquecimento de Decisor via Bureau
     */
    executeEnrichBureauAction(payload = {}) {
      const res = payload.bureau_result || {};
      const zapText = res.whatsapp ? `WhatsApp Validado: <code>${res.whatsapp}</code>` : `${res.message || 'Contato consultado no Bureau'}`;
      const iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
      this.renderActionCard({
        icon: iconSvg,
        title: 'Bureau de Decisores Oficial',
        message: zapText,
        buttonLabel: 'Ver Ficha do Lead',
        onClick: () => {
          if (window.CopilotActionBus && payload.cpf_ou_cnpj) {
            window.CopilotActionBus.executeOpenDrawer({ identificador: payload.cpf_ou_cnpj, aba_dossie: 'socios_qsa' });
          }
        }
      });
    },

    /**
     * Envia feedback de aprendizado por reforço (LinUCB)
     */
    async sendRlFeedback(eventType, score, responseContent, btn) {
      try {
        const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : { 'Content-Type': 'application/json' };
        await fetch('/api/copilot/feedback', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            event_type: eventType,
            reward_score: score,
            payload: { response_preview: (responseContent || '').slice(0, 150) }
          })
        });

        if (btn) {
          btn.style.color = eventType === 'UPVOTE' ? '#10b981' : '#f59e0b';
          btn.style.borderColor = eventType === 'UPVOTE' ? '#10b981' : '#f59e0b';
          btn.disabled = true;
        }

        if (window.CopilotActionBus && typeof window.CopilotActionBus.notify === 'function') {
          window.CopilotActionBus.notify(eventType === 'UPVOTE' ? 'Feedback registrado (+50 pts RL)' : 'Feedback registrado (-50 pts RL)');
        }
      } catch (e) {
        console.warn('Falha ao enviar feedback de RL:', e.message);
      }
    },

    /**
     * Gera e baixa arquivo CSV estruturado para Meta Ads
     */
    downloadMetaAdsCsv(properties = []) {
      const headers = ['fn', 'ln', 'phone', 'email', 'city', 'state', 'country', 'property_name', 'area_ha', 'crop_type', 'intent_score', 'intent_tier'];
      
      const rows = properties.map(p => {
        const fullName = (p.nome_titular || '').trim();
        const parts = fullName.split(' ');
        const fn = parts[0] || '';
        const ln = parts.slice(1).join(' ') || '';
        const phone = p.whatsapp_validado ? p.whatsapp_validado.replace(/\D/g, '') : '';
        const email = p.email_validado || '';
        const city = p.municipio || '';
        const state = p.uf || '';
        const country = 'BR';
        const propName = (p.nome_imovel || '').replace(/,/g, ' ');
        const area = p.area_hectares || '';
        const crop = p.dados_agronomicos?.crop_type || '';
        const score = p.intent_score || 0;
        const tier = p.intent_classification || 'COLD';

        return [fn, ln, phone, email, city, state, country, propName, area, crop, score, tier]
          .map(val => `"${String(val).replace(/"/g, '""')}"`)
          .join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Meta_Ads_Audiences_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    /**
     * Renderiza um Card de Ação Tática no Chat (Feedback Visual)
     */
    renderActionCard({ icon, title, message, buttonLabel, onClick }, saveToStorage = true) {
      if (saveToStorage) {
        if (!Array.isArray(this.sessionMessages)) this.sessionMessages = [];
        this.sessionMessages.push({
          type: 'card',
          icon: icon || '',
          title: title || 'Ação Executada',
          message: message || '',
          buttonLabel: buttonLabel || null,
          timestamp: Date.now()
        });
        this.saveHistoryToSession();
      }

      if (!this.messagesContainer) return;

      const card = document.createElement('div');
      card.className = 'copilot-action-card';

      let buttonHtml = '';
      if (buttonLabel) {
        buttonHtml = `<button type="button" class="btn-action-card">${buttonLabel}</button>`;
      }

      card.innerHTML = `
        <div class="action-card-header">
          <span style="font-size: 1rem;">${icon}</span>
          <span>${title}</span>
        </div>
        <div class="action-card-body">
          ${message}
        </div>
        ${buttonHtml}
      `;

      if (buttonLabel && typeof onClick === 'function') {
        const btn = card.querySelector('.btn-action-card');
        if (btn) btn.addEventListener('click', onClick);
      }

      this.messagesContainer.appendChild(card);
      this.scrollToBottom();
      return card;
    },

    appendMessage(role, content, model = null, saveToStorage = true) {
      if (saveToStorage) {
        if (!Array.isArray(this.sessionMessages)) this.sessionMessages = [];
        this.sessionMessages.push({
          type: 'msg',
          role,
          content,
          model,
          timestamp: Date.now()
        });
        this.saveHistoryToSession();
      }

      if (!this.messagesContainer) return null;

      const msgDiv = document.createElement('div');
      msgDiv.className = `copilot-msg copilot-msg-${role}`;

      if (role === 'assistant') {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'copilot-msg-avatar';
        avatarDiv.innerHTML = '<span class="copilot-avatar-monogram">V</span>';
        msgDiv.appendChild(avatarDiv);
      }

      const bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'copilot-msg-bubble';
      bubbleDiv.innerHTML = this.formatMarkdown(content);

      if (role === 'assistant' && content) {
        const footerDiv = document.createElement('div');
        footerDiv.className = 'copilot-msg-footer';

        // Botão de Áudio (OpenAI Text-to-Speech)
        const ttsBtn = document.createElement('button');
        ttsBtn.type = 'button';
        ttsBtn.className = 'copilot-tts-btn';
        ttsBtn.title = 'Ouvir resposta por voz (OpenAI TTS)';
        ttsBtn.innerHTML = `
          <svg class="tts-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </svg>
          <span class="tts-label">Ouvir</span>
        `;
        ttsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.playTtsAudio(content, ttsBtn);
        });
        footerDiv.appendChild(ttsBtn);

        // Botão de Upvote (RL Feedback Positivo +50 pts)
        const upvoteBtn = document.createElement('button');
        upvoteBtn.type = 'button';
        upvoteBtn.className = 'copilot-feedback-btn copilot-upvote-btn';
        upvoteBtn.title = 'Recomendação assertiva / Aprovar (+50 pts RL)';
        upvoteBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
          </svg>
        `;
        upvoteBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.sendRlFeedback('UPVOTE', 50, content, upvoteBtn);
        });
        footerDiv.appendChild(upvoteBtn);

        // Botão de Downvote (RL Feedback Negativo -50 pts)
        const downvoteBtn = document.createElement('button');
        downvoteBtn.type = 'button';
        downvoteBtn.className = 'copilot-feedback-btn copilot-downvote-btn';
        downvoteBtn.title = 'Recomendação descalibrada (-50 pts RL)';
        downvoteBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
          </svg>
        `;
        downvoteBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.sendRlFeedback('DOWNVOTE', -50, content, downvoteBtn);
        });
        footerDiv.appendChild(downvoteBtn);

        if (model) {
          const badge = document.createElement('div');
          badge.className = 'copilot-model-badge';
          badge.textContent = model === 'versus-local-agent' ? 'Agente Local' : model;
          footerDiv.appendChild(badge);
        }

        bubbleDiv.appendChild(footerDiv);
      }

      msgDiv.appendChild(bubbleDiv);
      this.messagesContainer.appendChild(msgDiv);
      this.scrollToBottom();

      return msgDiv;
    },

    appendTypingIndicator() {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'copilot-msg copilot-msg-assistant copilot-typing';
      
      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'copilot-msg-avatar';
      avatarDiv.innerHTML = '<span class="copilot-avatar-monogram">V</span>';
      msgDiv.appendChild(avatarDiv);

      const bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'copilot-msg-bubble';
      bubbleDiv.innerHTML = `
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      `;
      msgDiv.appendChild(bubbleDiv);
      this.messagesContainer.appendChild(msgDiv);
      this.scrollToBottom();
      return msgDiv;
    },

    formatMarkdown(text) {
      if (!text) return '';

      let formatted = text
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
      formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
      formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      formatted = formatted.replace(/^&gt; (.*$)/gim, '<blockquote>$1</blockquote>');
      formatted = this.parseMarkdownTables(formatted);
      formatted = formatted.replace(/\n/g, '<br>');

      return formatted;
    },

    parseMarkdownTables(text) {
      const lines = text.split('\n');
      let inTable = false;
      let tableHtml = '';
      const resultLines = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('|') && line.endsWith('|')) {
          if (!inTable) {
            inTable = true;
            tableHtml = '<div class="copilot-table-wrapper"><table class="copilot-table">';
          }

          if (/^\|[\s:-|-]+\|$/.test(line)) {
            continue;
          }

          const cols = line.split('|').slice(1, -1).map(c => c.trim());
          const isHeader = !tableHtml.includes('<tbody>') && !tableHtml.includes('<tr>');

          if (isHeader) {
            tableHtml += '<thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
          } else {
            tableHtml += '<tr>' + cols.map(c => `<td>${c}</td>`).join('') + '</tr>';
          }
        } else {
          if (inTable) {
            inTable = false;
            tableHtml += '</tbody></table></div>';
            resultLines.push(tableHtml);
            tableHtml = '';
          }
          resultLines.push(lines[i]);
        }
      }

      if (inTable) {
        tableHtml += '</tbody></table></div>';
        resultLines.push(tableHtml);
      }

      return resultLines.join('\n');
    },

    /**
     * Vincula o botão de TTS à mensagem inicial do chat se já existir no DOM
     */
    attachTtsToExistingMessages() {
      if (!this.messagesContainer || typeof this.messagesContainer.querySelector !== 'function') return;
      const initialAssistantBubble = this.messagesContainer.querySelector('.copilot-msg-assistant .copilot-msg-bubble');
      if (initialAssistantBubble && typeof initialAssistantBubble.querySelector === 'function' && !initialAssistantBubble.querySelector('.copilot-tts-btn')) {
        const textContent = initialAssistantBubble.textContent.trim();
        const footerDiv = document.createElement('div');
        footerDiv.className = 'copilot-msg-footer';

        const ttsBtn = document.createElement('button');
        ttsBtn.type = 'button';
        ttsBtn.className = 'copilot-tts-btn';
        ttsBtn.title = 'Ouvir resposta por voz (OpenAI TTS)';
        ttsBtn.innerHTML = `
          <svg class="tts-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </svg>
          <span class="tts-label">Ouvir</span>
        `;
        ttsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.playTtsAudio(textContent, ttsBtn);
        });

        footerDiv.appendChild(ttsBtn);
        initialAssistantBubble.appendChild(footerDiv);
      }
    },

    /**
     * Alterna o Modo de Conversação Contínua ao Vivo (Estilo Gemini Live)
     */
    toggleLiveMode() {
      this.isLiveMode = !this.isLiveMode;
      if (this.btnLiveToggle) {
        this.btnLiveToggle.classList.toggle('live-active', this.isLiveMode);
        this.btnLiveToggle.title = this.isLiveMode 
          ? 'Modo Conversação ao Vivo ATIVO (Clique para encerrar)' 
          : 'Modo Conversação Contínua ao Vivo (Voz)';
      }
      if (this.voiceStatus) {
        this.voiceStatus.textContent = this.isLiveMode ? 'Ao Vivo (Ouvindo...)' : 'Modo Normal';
        this.voiceStatus.style.color = this.isLiveMode ? '#10B981' : '#64748B';
      }

      if (this.isLiveMode) {
        if (typeof showToast === 'function') {
          showToast('Modo Conversação ao Vivo ativado. Fale normalmente com o Copiloto.');
        }
        this.startVoiceRecording();
      } else {
        if (typeof showToast === 'function') {
          showToast('Modo Conversação ao Vivo encerrado.');
        }
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (this.currentAudio) {
          try { this.currentAudio.pause(); } catch(e) {}
          this.currentAudio = null;
        }
        this.stopVoiceRecording();
      }
    },

    /**
     * Alterna a gravação de voz pontual (Speech-to-Text)
     */
    async toggleVoiceRecording() {
      if (this.isRecording) {
        this.confirmVoiceRecordingAndSend();
      } else {
        await this.startVoiceRecording();
      }
    },

    /**
     * Exibe a barra de gravação estilo WhatsApp e esconde o campo de texto
     */
    showAudioBar() {
      if (this.form) this.form.style.display = 'none';
      if (this.audioBar) this.audioBar.style.display = 'flex';
      this.startAudioTimer();
      if (this.btnMic) this.btnMic.classList.add('recording');
    },

    /**
     * Oculta a barra de áudio e restaura o formulário
     */
    hideAudioBar() {
      this.stopAudioTimer();
      if (this.audioBar) this.audioBar.style.display = 'none';
      if (this.form) this.form.style.display = 'flex';
      if (this.btnMic) this.btnMic.classList.remove('recording', 'transcribing');
    },

    /**
     * Controla o cronômetro visual da gravação de áudio (00:00)
     */
    startAudioTimer() {
      this.stopAudioTimer();
      this.audioSeconds = 0;
      if (this.audioRecTimer) this.audioRecTimer.textContent = '00:00';
      this.audioTimerInterval = setInterval(() => {
        this.audioSeconds++;
        const mins = String(Math.floor(this.audioSeconds / 60)).padStart(2, '0');
        const secs = String(this.audioSeconds % 60).padStart(2, '0');
        if (this.audioRecTimer) this.audioRecTimer.textContent = `${mins}:${secs}`;
      }, 1000);
    },

    stopAudioTimer() {
      if (this.audioTimerInterval) {
        clearInterval(this.audioTimerInterval);
        this.audioTimerInterval = null;
      }
      this.audioSeconds = 0;
    },

    /**
     * Inicia a captura de voz: prioriza Web Speech API Nativa do navegador (custo zero, sem erro 401)
     */
    async startVoiceRecording() {
      this.recordedVoiceText = '';
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      // 1. RECONHECIMENTO NATIVO DO NAVEGADOR COM VAD (VOICE ACTIVITY DETECTION)
      if (SpeechRecognition) {
        try {
          if (this.recognitionInstance) {
            try { this.recognitionInstance.abort(); } catch(e) {}
          }

          const recognition = new SpeechRecognition();
          recognition.lang = 'pt-BR';
          recognition.continuous = Boolean(this.isLiveMode);
          recognition.interimResults = true;
          this.recognitionInstance = recognition;
          this.isRecording = true;

          recognition.onstart = () => {
            this.showAudioBar();
          };

          recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }

            const current = (finalTranscript || interimTranscript).trim();
            if (current) {
              this.recordedVoiceText = current;
              if (this.input) this.input.value = current;

              // VAD (Voice Activity Detection): ao detectar pausa na fala de 2.8s para respirar e raciocinar, envia automaticamente sem cortes precoces
              if (this.silenceTimer) clearTimeout(this.silenceTimer);
              const delay = this.silenceDelayMs || 2800;
              this.silenceTimer = setTimeout(() => {
                console.log(`[AI COPILOT VAD] Pausa na fala confirmada (${delay}ms). Disparando envio...`);
                this.silenceTimer = null;
                this.confirmVoiceRecordingAndSend();
              }, delay);
            }
          };

          recognition.onerror = (event) => {
            console.warn('[AI COPILOT SPEECH ERROR]', event.error);
            if (event.error === 'not-allowed') {
              if (typeof showToast === 'function') showToast('Permissão de microfone negada no navegador.');
              this.cancelVoiceRecording();
            }
          };

          recognition.onend = () => {
            // Se o usuário ainda estiver respirando/pensando (silenceTimer ativo),
            // ou se estivermos no Modo Ao Vivo, o Chrome fecha o microfone por silêncio natural.
            // Reiniciamos o recognition para manter a escuta sem cortar o usuário prematuramente!
            if (this.silenceTimer && this.isRecording) {
              try {
                recognition.start();
                return;
              } catch(e) {
                // Já reiniciando
              }
              return;
            }

            this.isRecording = false;
            if (this.silenceTimer) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = null;
            }
            // Se detectou fala antes de encerrar e não há timer pendente, despacha
            if (this.recordedVoiceText && this.recordedVoiceText.trim()) {
              this.confirmVoiceRecordingAndSend();
            } else if (!this.isLiveMode) {
              this.hideAudioBar();
            }
          };

          recognition.start();
          return;
        } catch (err) {
          console.warn('[AI COPILOT] Web Speech falhou, recorrendo ao MediaRecorder:', err);
        }
      }

      // 2. FALLBACK VIA MEDIARECORDER (WHISPER API)
      await this.startMediaRecorderFallback();
    },

    /**
     * Fallback de gravação binária para navegadores que não suportam SpeechRecognition
     */
    async startMediaRecorderFallback() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const msg = 'Seu navegador não suporta captura de microfone.';
        if (typeof showToast === 'function') showToast(msg);
        else alert(msg);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let mimeType = 'audio/webm;codecs=opus';
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = MediaRecorder.isTypeSupported('audio/webm')
              ? 'audio/webm'
              : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
          }
        } else {
          mimeType = '';
        }

        const options = mimeType ? { mimeType } : {};
        this.mediaRecorder = new MediaRecorder(stream, options);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          try { stream.getTracks().forEach(track => track.stop()); } catch(e) {}
          this.handleAudioRecordingComplete(mimeType);
        };

        this.mediaRecorder.start(250);
        this.isRecording = true;
        this.showAudioBar();
      } catch (err) {
        console.error('[AI COPILOT MEDIARECORDER ERROR]', err);
        this.isRecording = false;
        this.hideAudioBar();
        const msg = err.name === 'NotAllowedError'
          ? 'Permissão de microfone negada no navegador.'
          : `Falha ao iniciar microfone: ${err.message}`;
        if (typeof showToast === 'function') showToast(msg);
        else alert(msg);
      }
    },

    /**
     * Cancela a gravação em andamento e descarta o áudio
     */
    cancelVoiceRecording() {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      this.isRecording = false;
      this.recordedVoiceText = '';
      if (this.recognitionInstance) {
        try { this.recognitionInstance.abort(); } catch(e) {}
        this.recognitionInstance = null;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch(e) {}
      }
      this.audioChunks = [];
      this.hideAudioBar();
    },

    /**
     * Conclui a gravação e dispara o envio do comando falado
     */
    confirmVoiceRecordingAndSend() {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      this.isRecording = false;
      if (this.recognitionInstance) {
        try { this.recognitionInstance.stop(); } catch(e) {}
        this.recognitionInstance = null;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch(e) {}
      }
      this.hideAudioBar();

      // Envia a mensagem transcrita
      if (this.input && this.input.value && this.input.value.trim()) {
        this.handleSend();
      }
    },

    /**
     * Interrompe a gravação se estiver ativa
     */
    stopVoiceRecording() {
      this.confirmVoiceRecordingAndSend();
    },

    /**
     * Restaura estado normal do microfone
     */
    resetMicState() {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      this.isRecording = false;
      this.hideAudioBar();
    },

    /**
     * Higieniza profundamente qualquer texto para leitura falada 100% natural,
     * eliminando asteriscos, vírgulas lidas por extenso, markdown e termos cifrados.
     */
    cleanTextForNaturalSpeech(text) {
      if (!text || typeof text !== 'string') return '';
      let clean = String(text);

      // 0. Remove prefixos robóticos de sistema ("Interface Atualizada:", "Ação Executada:", etc.)
      clean = clean.replace(/^(Interface Atualizada|Ação Executada|Filtro Aplicado|Dossiê Tático Aberto|Radar Sparks|Varredura Noturna Agendada|Despacho Comercial|Despacho Meta Ads|Sincronização Direta|Auditoria Visual Espacial)[:\s-]*/i, '');

      // 1. Remove blocos de código e markdown pesado
      clean = clean.replace(/```[\s\S]*?```/g, '');
      clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      clean = clean.replace(/https?:\/\/\S+/g, '');

      // 2. Remove formatações markdown e símbolos que sintetizadores lêem ("asterisco", "cerquilha")
      clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');
      clean = clean.replace(/\*([^*]+)\*/g, '$1');
      clean = clean.replace(/__([^_]+)__/g, '$1');
      clean = clean.replace(/_([^_]+)_/g, '$1');
      clean = clean.replace(/`([^`]+)`/g, '$1');
      clean = clean.replace(/^#+\s+/gm, '');
      clean = clean.replace(/^[•\->*#\s]+/gm, '');
      clean = clean.replace(/[*_#~|><\^\\\/]/g, ' ');
      clean = clean.replace(/[\(\)\[\]\{\}]/g, ' ');

      // 3. Converte abreviações agronômicas e comerciais para fala natural
      clean = clean.replace(/\b(\d+)\s*ha\b/gi, '$1 hectares');
      clean = clean.replace(/\bha\b/gi, 'hectares');
      clean = clean.replace(/\bR\$\s*/gi, 'reais ');
      clean = clean.replace(/\bkm\b/gi, 'quilômetros');
      clean = clean.replace(/\bCAR\b/g, 'Cár');
      clean = clean.replace(/\bSICAR\b/g, 'Sicár');
      clean = clean.replace(/\bSIGEF\b/g, 'Sigéfi');
      clean = clean.replace(/\bINCRA\b/g, 'Íncra');
      clean = clean.replace(/\bRS\b/g, 'Rio Grande do Sul');
      clean = clean.replace(/\bMT\b/g, 'Mato Grosso');
      clean = clean.replace(/\bMS\b/g, 'Mato Grosso do Sul');
      clean = clean.replace(/\bGO\b/g, 'Goiás');
      clean = clean.replace(/\bPR\b/g, 'Paraná');
      clean = clean.replace(/\bSP\b/g, 'São Paulo');
      clean = clean.replace(/\bMG\b/g, 'Minas Gerais');

      // 4. Corrige concordância de gênero para abas e termos de tela
      clean = clean.replace(/para a Mapa Espacial/gi, 'pro Mapa Espacial');
      clean = clean.replace(/para a Mapa/gi, 'pro Mapa');
      clean = clean.replace(/pro a Mapa/gi, 'pro Mapa');
      clean = clean.replace(/para o Tabela/gi, 'pra Tabela');

      // 5. Converte frases robóticas de navegação em tom gaúcho autêntico
      if (/Alternando visualização central (pro|para o) Mapa/i.test(clean)) {
        return 'Buenas! Alternando agora pro Mapa Espacial pra ti.';
      }
      if (/Alternando visualização central (pra|para a) Tabela/i.test(clean)) {
        return 'Buenas! Alternando agora pra Tabela Analítica pra ti.';
      }
      if (/Alternando visualização central/i.test(clean)) {
        clean = clean.replace(/Alternando visualização central (para|pro|pra)/i, 'Buenas! Alternando agora');
        if (!clean.endsWith('pra ti.')) clean += ' pra ti.';
      }

      // 6. Se o texto contiver tópicos e for longo, foca nas 2 primeiras sentenças para conversa humana fluida
      const sentences = clean.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
      if (sentences.length > 2) {
        clean = sentences.slice(0, 2).join('. ') + '.';
      }

      // 7. Suavização de pontuação
      clean = clean.replace(/[:;]/g, ',');
      clean = clean.replace(/,{2,}/g, ',');
      clean = clean.replace(/\.{2,}/g, '.');
      clean = clean.replace(/\s+/g, ' ').trim();

      return clean;
    },

    /**
     * Higieniza o texto do relatório para o botão "Ouvir" lendo a EXPLICAÇÃO COMPLETA,
     * sem JAMAIS truncar sentenças, traduzindo siglas agronômicas e formatando para voz contínua.
     */
    prepareFullTextForListening(text) {
      if (!text || typeof text !== 'string') return '';
      let clean = String(text);

      // 1. Remove blocos de código e markdown pesado
      clean = clean.replace(/```[\s\S]*?```/g, '');
      clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      clean = clean.replace(/https?:\/\/\S+/g, '');

      // 2. Remove tags markdown preservando o texto interno integralmente
      clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');
      clean = clean.replace(/\*([^*]+)\*/g, '$1');
      clean = clean.replace(/__([^_]+)__/g, '$1');
      clean = clean.replace(/_([^_]+)_/g, '$1');
      clean = clean.replace(/`([^`]+)`/g, '$1');
      clean = clean.replace(/^#+\s+/gm, '');
      clean = clean.replace(/^[•\->*#\s]+/gm, '');
      clean = clean.replace(/[*_#~|><\^\\\/]/g, ' ');
      clean = clean.replace(/[\(\)\[\]\{\}]/g, ' ');

      // 3. Traduz siglas agronômicas, cadastrais e de mercado para pronúncia fonética perfeita
      clean = clean.replace(/\bGTM\b/g, 'Gê Tê Eme');
      clean = clean.replace(/\bB2B\b/gi, 'Bê dois Bê');
      clean = clean.replace(/\bCAR\b/g, 'Cár');
      clean = clean.replace(/\bSICAR\b/g, 'Sicár');
      clean = clean.replace(/\bSIGEF\b/g, 'Sigéfi');
      clean = clean.replace(/\bINCRA\b/g, 'Íncra');
      clean = clean.replace(/\bQSA\b/g, 'Q S A');
      clean = clean.replace(/\bSDR\b/g, 'S D R');
      clean = clean.replace(/\bCRM\b/g, 'C R M');
      clean = clean.replace(/\bAPI\b/g, 'A P I');
      clean = clean.replace(/\b(\d+)\s*ha\b/gi, '$1 hectares');
      clean = clean.replace(/\bha\b/gi, 'hectares');
      clean = clean.replace(/\bR\$\s*/gi, 'reais ');
      clean = clean.replace(/\bkm\b/gi, 'quilômetros');
      clean = clean.replace(/\bRS\b/g, 'Rio Grande do Sul');
      clean = clean.replace(/\bMT\b/g, 'Mato Grosso');
      clean = clean.replace(/\bMS\b/g, 'Mato Grosso do Sul');
      clean = clean.replace(/\bGO\b/g, 'Goiás');
      clean = clean.replace(/\bPR\b/g, 'Paraná');
      clean = clean.replace(/\bSP\b/g, 'São Paulo');
      clean = clean.replace(/\bMG\b/g, 'Minas Gerais');

      // 4. Suavização de pontuação para pausas naturais e respiração (sem cortar frases!)
      clean = clean.replace(/[:;]/g, '. ');
      clean = clean.replace(/,{2,}/g, ',');
      clean = clean.replace(/\.{2,}/g, '.');
      clean = clean.replace(/\s+/g, ' ').trim();

      // Limite seguro de 4000 caracteres para síntese contínua via OpenAI TTS
      return clean.slice(0, 4000);
    },

    /**
     * Vocaliza a resposta do assistente: prioriza OpenAI TTS (/api/ai/tts - Voz Nova/Alloy)
     * e possui fallback gracioso para síntese nativa com vozes brasileiras de qualidade.
     */
    async speakLiveResponse(text, spokenAlternative) {
      // 1. Pausa e cancela qualquer escuta no microfone imediatamente
      // para impedir loop de eco (o microfone gravar o próprio alto-falante)
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      this.isRecording = false;
      if (this.recognitionInstance) {
        try { this.recognitionInstance.abort(); } catch(e) {}
        this.recognitionInstance = null;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch(e) {}
      }
      this.hideAudioBar();

      if (this.liveAudio) {
        try { this.liveAudio.pause(); } catch(e) {}
        this.liveAudio = null;
      }
      if (this.messageAudio) {
        try { this.messageAudio.pause(); } catch(e) {}
        this.messageAudio = null;
        if (this.currentPlayingBtn) {
          this.updateTtsButtonState(this.currentPlayingBtn, 'idle');
          this.currentPlayingBtn = null;
        }
      }
      this.currentAudio = null;

      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch(e) {}
      }

      if (this.voiceStatus && this.isLiveMode) {
        this.voiceStatus.textContent = 'Falando...';
        this.voiceStatus.style.color = '#38BDF8';
      }

      const speechText = this.cleanTextForNaturalSpeech(spokenAlternative || text);
      if (!speechText) return;

      console.log(`[AI COPILOT LIVE VOICE] Vocalizando resposta natural: "${speechText}"`);

      // 1. TENTA PRIMEIRO VIA OPENAI TTS (/api/ai/tts - Voz Nova Ultra-Realista com Retry)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : { 'Content-Type': 'application/json' };
          const ttsRes = await fetch('/api/ai/tts', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              text: speechText,
              voice: 'nova',
              speed: 1.0
            })
          });

          if (ttsRes.ok) {
            const audioBlob = await ttsRes.blob();
            if (audioBlob && audioBlob.size > 1000) {
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              this.liveAudio = audio;
              this.currentAudio = audio;

              audio.onended = () => {
                this.liveAudio = null;
                this.currentAudio = null;
                setTimeout(() => {
                  try { URL.revokeObjectURL(audioUrl); } catch(e) {}
                }, 2000);
                if (this.voiceStatus && this.isLiveMode) {
                  this.voiceStatus.textContent = 'Ao Vivo (Ouvindo...)';
                  this.voiceStatus.style.color = '#10B981';
                }
                // Ao terminar de falar no modo Ao Vivo, reabre a escuta após 600ms (se não houver áudio de mensagem tocando)
                if (this.isLiveMode && !this.isRecording && !this.messageAudio) {
                  setTimeout(() => {
                    if (this.isLiveMode && !this.liveAudio && !this.messageAudio) this.startVoiceRecording();
                  }, 600);
                }
              };

              audio.onerror = (e) => {
                console.warn('[AI COPILOT TTS] Erro ao reproduzir elemento Audio:', e);
                this.liveAudio = null;
                this.currentAudio = null;
                setTimeout(() => {
                  try { URL.revokeObjectURL(audioUrl); } catch(e) {}
                }, 2000);
                this.fallbackNativeSpeech(speechText);
              };

              await audio.play();
              return;
            }
          }
        } catch (err) {
          console.warn(`[AI COPILOT TTS] Tentativa ${attempt + 1} OpenAI TTS falhou (${err.message})...`);
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 350));
          }
        }
      }

      // 2. FALLBACK PARA SÍNTESE NATIVA DO NAVEGADOR COM VOZ BRASILEIRA NATURAL
      this.fallbackNativeSpeech(speechText);
    },

    /**
     * Fallback de síntese nativa com seleção da melhor voz brasileira (Natural/Neural/Google)
     */
    fallbackNativeSpeech(speechText) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const voices = window.speechSynthesis.getVoices() || [];
      const bestVoice = voices.find(v => v.lang === 'pt-BR' && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Francisca') || v.name.includes('Online')))
        || voices.find(v => v.lang === 'pt-BR')
        || voices.find(v => v.lang && v.lang.startsWith('pt'));

      // Se não houver voz em português no Windows/navegador, NÃO fale com voz inglesa/estrangeira!
      if (!bestVoice || !bestVoice.lang || !bestVoice.lang.startsWith('pt')) {
        console.warn('[AI COPILOT] Nenhuma voz pt-BR disponível no sintetizador nativo do sistema. Omitindo áudio nativo para evitar sotaque estrangeiro distorcido.');
        if (this.voiceStatus && this.isLiveMode) {
          this.voiceStatus.textContent = 'Ao Vivo (Ouvindo...)';
          this.voiceStatus.style.color = '#10B981';
        }
        if (this.isLiveMode && !this.isRecording) {
          setTimeout(() => {
            if (this.isLiveMode && !this.currentAudio) this.startVoiceRecording();
          }, 600);
        }
        return;
      }

      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.lang = 'pt-BR';
      utterance.voice = bestVoice;
      utterance.rate = 1.06;
      utterance.pitch = 1.0;

      // Ao terminar de falar, se o Modo Ao Vivo continuar ativo, reabre a escuta automaticamente!
      utterance.onend = () => {
        if (this.voiceStatus && this.isLiveMode) {
          this.voiceStatus.textContent = 'Ao Vivo (Ouvindo...)';
          this.voiceStatus.style.color = '#10B981';
        }
        if (this.isLiveMode && !this.isRecording) {
          setTimeout(() => {
            if (this.isLiveMode && !this.currentAudio) this.startVoiceRecording();
          }, 600);
        }
      };

      utterance.onerror = () => {
        if (this.voiceStatus && this.isLiveMode) {
          this.voiceStatus.textContent = 'Ao Vivo (Ouvindo...)';
          this.voiceStatus.style.color = '#10B981';
        }
        if (this.isLiveMode && !this.isRecording) {
          setTimeout(() => {
            if (this.isLiveMode && !this.currentAudio) this.startVoiceRecording();
          }, 600);
        }
      };

      window.speechSynthesis.speak(utterance);
    },

    /**
     * Processa a gravação completa do MediaRecorder e chama Whisper API
     */
    async handleAudioRecordingComplete(mimeType) {
      try {
        const audioBlob = new Blob(this.audioChunks, { type: mimeType || 'audio/webm' });
        if (!audioBlob || audioBlob.size < 500) {
          this.resetMicState();
          return;
        }

        const extension = mimeType && mimeType.includes('mp4') ? 'mp4' : 'webm';
        const formData = new FormData();
        formData.append('audio', audioBlob, `audio_input.${extension}`);
        formData.append('language', 'pt');

        const headers = typeof window.getApiHeaders === 'function' ? window.getApiHeaders() : {};
        delete headers['Content-Type'];

        const res = await fetch('/api/ai/transcribe', {
          method: 'POST',
          headers,
          body: formData
        });

        const data = await res.json();

        if (res.status === 403 || data.error === 'TEST_DRIVE_EXPIRED') {
          const expiredMsg = data.message || 'O seu Test Drive expirou. Contate o suporte para ativar as suas próprias chaves.';
          this.appendMessage('assistant', `**Acesso Bloqueado:** ${expiredMsg}`);
          return;
        }

        if (res.ok && data.success && data.text && data.text.trim()) {
          const transcribedText = data.text.trim();
          console.log(`[AI COPILOT WHISPER] Transcrição concluída: "${transcribedText}"`);
          if (this.input) {
            this.input.value = transcribedText;
          }
          this.handleSend();
        } else {
          const err = data.message || data.error || 'Não foi possível transcrever o áudio.';
          if (typeof showToast === 'function') showToast(`Transcrição: ${err}`);
        }
      } catch (err) {
        console.error('[AI COPILOT TRANSCRIBE ERROR]', err);
        if (typeof showToast === 'function') showToast('Erro ao enviar áudio para transcrição.');
      } finally {
        this.resetMicState();
      }
    },

    /**
     * Executa síntese de voz (TTS) para uma mensagem do assistente
     */
    async playTtsAudio(text, btnElement) {
      if (!text || typeof text !== 'string') return;

      // Se este mesmo botão já está tocando, pausa e reseta
      if (this.currentPlayingBtn === btnElement && this.messageAudio) {
        this.messageAudio.pause();
        this.messageAudio.currentTime = 0;
        this.messageAudio = null;
        this.currentAudio = null;
        this.currentPlayingBtn = null;
        this.updateTtsButtonState(btnElement, 'idle');
        // Se estava em modo Ao Vivo, pode voltar a escutar após pausar manualmente
        if (this.isLiveMode && !this.isRecording && !this.liveAudio) {
          setTimeout(() => {
            if (this.isLiveMode && !this.messageAudio && !this.liveAudio) this.startVoiceRecording();
          }, 600);
        }
        return;
      }

      // Se há outro áudio de mensagem ativo, interrompe o anterior
      if (this.messageAudio) {
        this.messageAudio.pause();
        this.messageAudio = null;
        if (this.currentPlayingBtn) {
          this.updateTtsButtonState(this.currentPlayingBtn, 'idle');
        }
      }

      // Se a IA estava falando uma resposta curta no modo Ao Vivo, interrompe para dar prioridade ao clique do usuário
      if (this.liveAudio) {
        this.liveAudio.pause();
        this.liveAudio = null;
      }
      this.currentAudio = null;

      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch(e) {}
      }

      // REGRA CRÍTICA DE DESACOPLAMENTO:
      // Se o usuário clicou em 'Ouvir' uma mensagem de relatório enquanto o modo Ao Vivo está ativo,
      // DEVE-SE pausar e abortar o microfone imediatamente para impedir que o microfone capture o som do alto-falante
      // gerando falso VAD, erros [AI COPILOT SPEECH ERROR] aborted ou mensagens fantasmas!
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      if (this.recognitionInstance) {
        try { this.recognitionInstance.abort(); } catch(e) {}
        this.recognitionInstance = null;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch(e) {}
      }
      this.isRecording = false;
      this.hideAudioBar();

      this.updateTtsButtonState(btnElement, 'loading');

      try {
        let audioUrl = btnElement.dataset.audioUrl;

        if (!audioUrl) {
          // Usa a função dedicada para leitura COMPLETA de relatórios e mensagens, sem truncamento de frases!
          const cleanText = this.prepareFullTextForListening(text);
          if (!cleanText) {
            this.updateTtsButtonState(btnElement, 'idle');
            return;
          }

          console.log(`[AI COPILOT FULL TTS] Gerando áudio completo do relatório (${cleanText.length} caracteres)...`);

          const headers = typeof window.getApiHeaders === 'function'
            ? window.getApiHeaders()
            : { 'Content-Type': 'application/json' };

          const res = await fetch('/api/ai/tts', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              text: cleanText,
              voice: 'nova',
              speed: 1.0
            })
          });

          // Bloqueio de Test Drive Expirado (HTTP 403)
          if (res.status === 403) {
            let errData = {};
            try { errData = await res.json(); } catch(e) {}
            const expiredMsg = errData.message || 'O seu Test Drive expirou. Contate o suporte para ativar as suas próprias chaves.';
            this.appendMessage('assistant', `**Acesso Bloqueado:** ${expiredMsg}`);
            if (typeof window.handleTestDriveExpired === 'function') {
              window.handleTestDriveExpired(expiredMsg);
            }
            this.updateTtsButtonState(btnElement, 'idle');
            return;
          }

          if (!res.ok) {
            throw new Error(`Falha na síntese de voz (HTTP ${res.status})`);
          }

          const blob = await res.blob();
          audioUrl = URL.createObjectURL(blob);
          btnElement.dataset.audioUrl = audioUrl;
        }

        const audio = new Audio(audioUrl);
        this.messageAudio = audio;
        this.currentAudio = audio;
        this.currentPlayingBtn = btnElement;

        const onAudioFinish = () => {
          this.messageAudio = null;
          this.currentAudio = null;
          this.currentPlayingBtn = null;
          this.updateTtsButtonState(btnElement, 'idle');

          // Quando a leitura do relatório/mensagem terminar, se o modo Ao Vivo estiver ativo,
          // reabre a escuta do microfone com segurança após um delay de respiração!
          if (this.isLiveMode && !this.isRecording && !this.liveAudio) {
            if (this.voiceStatus) {
              this.voiceStatus.textContent = 'Ao Vivo (Ouvindo...)';
              this.voiceStatus.style.color = '#10B981';
            }
            setTimeout(() => {
              if (this.isLiveMode && !this.messageAudio && !this.liveAudio) {
                this.startVoiceRecording();
              }
            }, 600);
          }
        };

        audio.onended = onAudioFinish;

        audio.onerror = (e) => {
          console.error('[AI COPILOT TTS PLAY ERROR]', e);
          onAudioFinish();
          if (typeof showToast === 'function') showToast('Falha ao reproduzir áudio.');
        };

        await audio.play();
        this.updateTtsButtonState(btnElement, 'playing');
      } catch (err) {
        console.error('[AI COPILOT TTS ERROR]', err);
        if (this.messageAudio) {
          this.messageAudio = null;
        }
        this.currentAudio = null;
        this.currentPlayingBtn = null;
        this.updateTtsButtonState(btnElement, 'idle');
        if (typeof showToast === 'function') showToast(`Erro de áudio: ${err.message}`);
      }
    },

    /**
     * Atualiza o estado visual do botão de TTS (idle, loading, playing)
     */
    updateTtsButtonState(btn, state) {
      if (!btn) return;
      btn.classList.remove('loading', 'playing');
      const labelEl = btn.querySelector('.tts-label');
      const iconEl = btn.querySelector('.tts-icon');

      if (state === 'loading') {
        btn.classList.add('loading');
        if (labelEl) labelEl.textContent = 'Gerando...';
      } else if (state === 'playing') {
        btn.classList.add('playing');
        if (labelEl) labelEl.textContent = 'Pausar';
        if (iconEl) {
          iconEl.innerHTML = `
            <rect x="6" y="4" width="4" height="16" fill="currentColor"></rect>
            <rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>
          `;
        }
      } else {
        if (labelEl) labelEl.textContent = 'Ouvir';
        if (iconEl) {
          iconEl.innerHTML = `
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          `;
        }
      }
    },

    scrollToBottom() {
      if (this.messagesContainer) {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      }
    }
  };

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AiCopilot.init());
  } else {
    AiCopilot.init();
  }

  window.AiCopilot = AiCopilot;
  window.openCopilot = () => AiCopilot.open();
  window.closeCopilot = () => AiCopilot.close();
  window.toggleCopilot = () => AiCopilot.toggle();
})();
