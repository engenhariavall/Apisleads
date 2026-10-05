/**
 * client/js/sparksNotificationCenter.js
 * 
 * CENTRAL GLOBAL DE NOTIFICAÇÕES & ALERTAS DO RADAR SPARKS
 * 
 * Funcionalidades:
 * - Monitoramento em tempo real de novos sinais capturados pelos robôs (BNDES, ANA, DOU, etc.).
 * - Alerta visual flutuante em qualquer tela/aba do sistema.
 * - Efeito sonoro harmônico de alto padrão via Web Audio API (SEM arquivos externos).
 * - Integração executiva com WhatsApp de gestores (SEM EMOJIS).
 * - Deep Linking para abertura direta do sinal na plataforma via desktop.
 */

(function () {
  'use strict';

  let lastCheckedTimestamp = new Date(Date.now() - 60000).toISOString();
  let audioContext = null;
  let isAudioMuted = localStorage.getItem('versus_sparks_audio_muted') === 'true';
  const shownSignalIds = new Set();
  let pollingInterval = null;

  /**
   * Inicialização do AudioContext com suporte a interação do usuário
   */
  function initAudioContext() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
      }
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }

  /**
   * Efeito sonoro harmônico profissional via Web Audio API
   * Duplo tom suave senoidal com decaimento exponencial elegante (estilo Bloomberg / Fintech).
   */
  function playExecutiveChime() {
    if (isAudioMuted) return;

    try {
      initAudioContext();
      if (!audioContext) return;

      const now = audioContext.currentTime;

      // Ganho mestre
      const masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(0.12, now);
      masterGain.connect(audioContext.destination);

      // Filtro passa-baixa sutil para aveludar o som
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, now);
      filter.connect(masterGain);

      // Tom 1: C6 (1046.5 Hz)
      const osc1 = audioContext.createOscillator();
      const gain1 = audioContext.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.8, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(filter);
      osc1.start(now);
      osc1.stop(now + 0.36);

      // Tom 2: E6 (1318.51 Hz) iniciando 60ms depois
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.51, now + 0.06);
      gain2.gain.setValueAtTime(0.001, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.65, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      osc2.connect(gain2);
      gain2.connect(filter);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.43);

    } catch (e) {
      console.warn('[SPARKS_SOUND] Áudio suspenso ou bloqueado pelo navegador:', e.message);
    }
  }

  /**
   * Retorna os estilos cromáticos e ícone vetorial corporativo do robô (SEM EMOJIS)
   */
  function getRobotMeta(sparkType) {
    switch (sparkType) {
      case 'CREDITO_BNDES':
        return {
          label: 'Crédito BNDES Finame',
          color: '#F59E0B',
          borderColor: 'rgba(245, 158, 11, 0.45)',
          bgColor: 'rgba(245, 158, 11, 0.08)',
          iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
        };
      case 'OUTORGA_ANA':
        return {
          label: 'Outorga de Água ANA',
          color: '#00D2FF',
          borderColor: 'rgba(0, 210, 255, 0.45)',
          bgColor: 'rgba(0, 210, 255, 0.08)',
          iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00D2FF" stroke-width="2.2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
        };
      case 'EXPANSAO_LEILAO':
        return {
          label: 'Expansão Fundiária',
          color: '#A855F7',
          borderColor: 'rgba(168, 85, 247, 0.45)',
          bgColor: 'rgba(168, 85, 247, 0.08)',
          iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A855F7" stroke-width="2.2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>'
        };
      case 'DOU':
        return {
          label: 'Diário Oficial (DOU)',
          color: '#38BDF8',
          borderColor: 'rgba(56, 189, 248, 0.45)',
          bgColor: 'rgba(56, 189, 248, 0.08)',
          iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
        };
      case 'EVENTO_AGRO':
        return {
          label: 'Feira Agropecuária',
          color: '#EC4899',
          borderColor: 'rgba(236, 72, 153, 0.45)',
          bgColor: 'rgba(236, 72, 153, 0.08)',
          iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="2.2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
        };
      case 'PASSIVO_IBAMA':
      default:
        return {
          label: 'Passivo Ambiental IBAMA',
          color: '#EF4444',
          borderColor: 'rgba(239, 68, 68, 0.45)',
          bgColor: 'rgba(239, 68, 68, 0.08)',
          iconSvg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
        };
    }
  }

  /**
   * Garante a criação do container de notificações no DOM
   */
  function ensureAlertsContainer() {
    let container = document.getElementById('sparksGlobalAlertsContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'sparksGlobalAlertsContainer';
      container.className = 'sparks-global-alerts-container';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Exibe um alerta de sinal em tela com contagem regressiva e botões executivos
   */
  function displaySignalAlert(signal) {
    if (!signal || !signal.id) return;
    if (shownSignalIds.has(signal.id)) return;
    shownSignalIds.add(signal.id);

    const container = ensureAlertsContainer();
    const meta = getRobotMeta(signal.spark_type);

    const titular = signal.titular_identificado || signal.nome_imovel || 'Titular Identificado';
    const local = [signal.municipio, signal.uf].filter(Boolean).join(' / ') || 'Brasil';
    
    let highlightDetail = '';
    if (Number(signal.valor_monetario) > 0) {
      highlightDetail = Number(signal.valor_monetario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } else if (Number(signal.volume_m3h) > 0) {
      highlightDetail = `${signal.volume_m3h} m³/h`;
    }

    const card = document.createElement('div');
    card.className = 'sparks-alert-toast';
    card.id = `sparkToast_${signal.id}`;
    card.style.borderLeftColor = meta.color;

    card.innerHTML = `
      <div class="sparks-toast-head">
        <div class="sparks-toast-meta">
          <span class="sparks-toast-icon">${meta.iconSvg}</span>
          <span class="sparks-toast-tag" style="color: ${meta.color};">${meta.label}</span>
          <span class="sparks-toast-badge-live">AO VIVO</span>
        </div>
        <button type="button" class="sparks-toast-close" title="Fechar notificação">✕</button>
      </div>

      <div class="sparks-toast-body">
        <h5 class="sparks-toast-title">${escapeHtml(signal.trigger_texto || signal.titulo)}</h5>
        <div class="sparks-toast-titular">
          <strong>${escapeHtml(titular)}</strong>
          <span>• ${escapeHtml(local)}</span>
        </div>
        ${highlightDetail ? `<div class="sparks-toast-value" style="color: ${meta.color};">${highlightDetail}</div>` : ''}
      </div>

      <div class="sparks-toast-actions">
        <button type="button" class="sparks-toast-btn primary btn-view-signal" title="Navegar para o sinal e abrir o dossiê completo">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>Ver no Radar</span>
        </button>
        <button type="button" class="sparks-toast-btn secondary btn-wa-notify" title="Notificar gestor via WhatsApp sem custos de API">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <span>WhatsApp Gestor</span>
        </button>
      </div>

      <div class="sparks-toast-timer-bar"></div>
    `;

    // Fecha ao clicar no X
    const btnClose = card.querySelector('.sparks-toast-close');
    btnClose?.addEventListener('click', () => removeToast(card));

    // Ação: Ver no Radar
    const btnView = card.querySelector('.btn-view-signal');
    btnView?.addEventListener('click', () => {
      removeToast(card);
      navigateToSignal(signal.id);
    });

    // Ação: Notificar WhatsApp
    const btnWa = card.querySelector('.btn-wa-notify');
    btnWa?.addEventListener('click', () => {
      openWhatsAppForSignal(signal);
    });

    container.prepend(card);
    playExecutiveChime();

    // Auto-remover após 10 segundos
    const timer = setTimeout(() => {
      removeToast(card);
    }, 10000);

    card._timer = timer;

    // Pausa o timer se o mouse estiver sobre o card
    card.addEventListener('mouseenter', () => clearTimeout(card._timer));
    card.addEventListener('mouseleave', () => {
      card._timer = setTimeout(() => removeToast(card), 4000);
    });
  }

  function removeToast(card) {
    if (!card) return;
    clearTimeout(card._timer);
    card.classList.add('fade-out');
    setTimeout(() => {
      card.remove();
    }, 300);
  }

  /**
   * Navega para a aba Sparks e abre o dossiê do sinal
   */
  function navigateToSignal(signalId) {
    // 1. Alterna para a aba Radar Sparks
    const sparksTabBtn = document.getElementById('tabViewSparks') || document.querySelector('.viewport-tab-btn[data-view="sparks"]');
    if (sparksTabBtn) {
      sparksTabBtn.click();
    }

    // 2. Abre o Dossiê do Sinal
    setTimeout(() => {
      if (window.SparksRadar && typeof window.SparksRadar.openSignalDossier === 'function') {
        window.SparksRadar.openSignalDossier(signalId);
      }
    }, 250);
  }

  /**
   * Dispara mensagem executiva via WhatsApp (SEM EMOJIS)
   */
  function openWhatsAppForSignal(signal) {
    const meta = getRobotMeta(signal.spark_type);
    const titular = signal.titular_identificado || signal.nome_imovel || 'Titular';
    const doc = signal.documento_identificado || 'Nao informado';
    const local = [signal.municipio, signal.uf].filter(Boolean).join(' / ') || 'Brasil';
    const deepLink = `${window.location.origin}/?tab=sparks&signal_id=${signal.id}`;

    let valorLinha = '';
    if (Number(signal.valor_monetario) > 0) {
      valorLinha = `VALOR: ${Number(signal.valor_monetario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    }

    const msg = [
      `[VERSUS SPARKS] ALERTA DE OPORTUNIDADE DETECTADA`,
      `----------------------------------------`,
      `MONITOR: ${meta.label}`,
      `TITULAR: ${titular}`,
      `DOCUMENTO: ${doc}`,
      `LOCALIZACAO: ${local}`,
      valorLinha ? valorLinha.trim() : null,
      `GATILHO: ${signal.trigger_texto || signal.titulo}`,
      `----------------------------------------`,
      `ACESSAR DOSSIE NA PLATAFORMA:`,
      deepLink
    ].filter(Boolean).join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  /**
   * Consulta periódica (polling) de novos sinais no backend
   */
  async function pollLatestSignals() {
    try {
      const res = await fetch(`/api/sparks/signals/latest?since=${encodeURIComponent(lastCheckedTimestamp)}&limit=10`);
      if (!res.ok) return;

      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) return;

      if (json.server_time) {
        lastCheckedTimestamp = json.server_time;
      }

      const signals = json.data;
      if (signals.length > 0) {
        // Exibe notificações em tela (máximo 3 de uma vez para não poluir)
        signals.slice(0, 3).forEach(s => {
          displaySignalAlert(s);
        });

        // Se o usuário estiver com a aba Sparks aberta, atualiza a tabela e KPIs
        const activePane = document.getElementById('paneSparks');
        if (activePane && activePane.style.display !== 'none' && window.SparksRadar) {
          window.SparksRadar.loadSparksData(false);
        }
      }
    } catch (e) {
      // Falha silenciosa de polling
    }
  }

  /**
   * Inicia o ciclo de checagem em segundo plano (a cada 20 segundos)
   */
  function startBackgroundPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    // Primeira checagem após 5 segundos
    setTimeout(pollLatestSignals, 5000);
    pollingInterval = setInterval(pollLatestSignals, 20000);
  }

  /**
   * Trata deep link vindo do WhatsApp (`?tab=sparks&signal_id=sig-...`)
   */
  function handleDeepLinking() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const signalId = params.get('signal_id');

    if (tab === 'sparks' || signalId) {
      // Garante clique na aba Sparks
      setTimeout(() => {
        const btn = document.getElementById('tabViewSparks') || document.querySelector('.viewport-tab-btn[data-view="sparks"]');
        if (btn) btn.click();

        if (signalId) {
          setTimeout(() => {
            if (window.SparksRadar && typeof window.SparksRadar.openSignalDossier === 'function') {
              window.SparksRadar.openSignalDossier(signalId);
            }
          }, 400);
        }
      }, 300);
    }
  }

  /**
   * Botão de Silenciamento de Som na Barra Superior
   */
  function injectAudioControlToggle() {
    const headerRight = document.querySelector('.abm-topbar-right');
    if (!headerRight || document.getElementById('btnSparksAudioToggle')) return;

    const btnSound = document.createElement('button');
    btnSound.type = 'button';
    btnSound.id = 'btnSparksAudioToggle';
    btnSound.className = 'btn-topbar-sound';
    btnSound.title = isAudioMuted ? 'Alertas sonoros desativados (Clique para ativar)' : 'Alertas sonoros ativos (Clique para silenciar)';

    const updateIcon = () => {
      btnSound.innerHTML = isAudioMuted 
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00D2FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
    };

    updateIcon();

    btnSound.addEventListener('click', () => {
      isAudioMuted = !isAudioMuted;
      localStorage.setItem('versus_sparks_audio_muted', isAudioMuted);
      btnSound.title = isAudioMuted ? 'Alertas sonoros desativados (Clique para ativar)' : 'Alertas sonoros ativos (Clique para silenciar)';
      updateIcon();
      if (!isAudioMuted) {
        initAudioContext();
        playExecutiveChime();
      }
    });

    headerRight.prepend(btnSound);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Intercepta o primeiro clique do usuário para destravar AudioContext do browser
  window.addEventListener('click', initAudioContext, { once: true });
  window.addEventListener('keydown', initAudioContext, { once: true });

  // Inicializa quando o DOM estiver carregado
  function init() {
    injectAudioControlToggle();
    startBackgroundPolling();
    handleDeepLinking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expõe API para testes e chamadas manuais
  window.SparksNotificationCenter = {
    triggerAlert: displaySignalAlert,
    playChime: playExecutiveChime,
    checkNow: pollLatestSignals
  };

})();
