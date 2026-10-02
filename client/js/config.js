/**
 * Módulo de Configuração de Ambiente e Resiliência HTTP do Frontend (Padrão VERSUS)
 * 
 * Fornece:
 * 1. Detecção dinâmica de ambiente (Local, Vercel com Proxy, ou VPS Standalone)
 * 2. buildApiUrl: montagem segura de endpoints
 * 3. fetchWithTimeout: wrapper resiliente com AbortController (timeout padrão: 10s),
 *    tratamento de falhas de rede (502, 503, 504, timeout, network failure),
 *    desbloqueio automático de spinners e disparo de Toast de alerta contextuais.
 */

(function (global) {
  function getApiBaseUrl() {
    if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__.API_BASE_URL) {
      return window.__ENV__.API_BASE_URL.replace(/\/$/, '');
    }
    return '';
  }

  const API_BASE_URL = getApiBaseUrl();

  function buildApiUrl(endpoint) {
    if (!endpoint) return '';
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (!API_BASE_URL) {
      return cleanEndpoint;
    }
    return `${API_BASE_URL}${cleanEndpoint}`;
  }


  /**
   * Dispara toast de erro amigável se a função showToast ou toastAlert existir no DOM
   */
  function notifyNetworkIssue(customMessage) {
    const msg = customMessage || 'Conexão instável com a API. Verifique sua rede ou tente novamente em instantes.';
    if (typeof window !== 'undefined') {
      // 1. Tenta função showToast do app.js ou relatorio.js
      if (typeof window.showToast === 'function') {
        window.showToast(msg, 'error');
        return;
      }
      // 2. Fallback direto no container de toast
      const toastEl = document.getElementById('toastAlert') || document.getElementById('toastNotice');
      if (toastEl) {
        toastEl.textContent = msg;
        toastEl.className = 'toast-alert visible error';
        setTimeout(() => {
          toastEl.className = 'toast-alert';
        }, 5000);
      } else {
        console.warn('⚠️ Alerta de Conectividade:', msg);
      }
    }
  }

  /**
   * Reseta possíveis spinners de carregamento travados na interface
   */
  function unlockUiLoadingStates() {
    if (typeof document === 'undefined') return;
    
    // Desbloqueia botões de ação do header
    const btnSync = document.getElementById('btnSyncRealData');
    if (btnSync) {
      btnSync.disabled = false;
      const text = btnSync.querySelector('.sync-text');
      if (text) text.textContent = 'Sincronizar Base Real';
    }

    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
      btnRefresh.classList.remove('refresh-spin');
    }

    const btnExportGef = document.getElementById('btnExportGeofencingMeta');
    if (btnExportGef) {
      btnExportGef.disabled = false;
      const text = btnExportGef.querySelector('.btn-text');
      if (text) text.textContent = 'EXPORTAR GEOFENCING PARA O META ADS';
    }

    // Oculta spinners de carregamento de tabela caso existam
    const loadingIndicators = document.querySelectorAll('.loading-indicator, .table-loading');
    loadingIndicators.forEach(el => {
      el.style.display = 'none';
    });
  }

  /**
   * Wrapper global resiliente de fetch com AbortController e timeout
   * @param {string} url Endpoint ou URL completa
   * @param {RequestInit} options Opções de requisição do fetch
   * @param {number} timeoutMs Tempo limite em ms (padrão: 10000ms)
   * @returns {Promise<Response>}
   */
  async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const fullUrl = buildApiUrl(url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const mergedOptions = {
      ...options,
      signal: controller.signal
    };

    try {
      const response = await fetch(fullUrl, mergedOptions);
      clearTimeout(timeoutId);

      // Tratamento de falhas de infraestrutura HTTP na VPS
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        unlockUiLoadingStates();
        notifyNetworkIssue('O servidor da API está temporariamente indisponível. Aguarde a reinicialização.');
        throw new Error(`Erro de infraestrutura do servidor (${response.status})`);
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      unlockUiLoadingStates();

      if (err.name === 'AbortError') {
        notifyNetworkIssue('Tempo limite de conexão esgotado (timeout de 10s). A requisição foi cancelada.');
        throw new Error(`Requisição cancelada por timeout (${timeoutMs}ms): ${fullUrl}`);
      }

      // Falha de conexão/offline
      if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
        notifyNetworkIssue('Falha de conexão com a API. Verifique sua conexão com a internet ou o status da VPS.');
      }

      throw err;
    }
  }

  const AppConfig = {
    API_BASE_URL,
    buildApiUrl,
    fetchWithTimeout,
    notifyNetworkIssue,
    unlockUiLoadingStates
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppConfig;
  }
  if (typeof global !== 'undefined') {
    global.AppConfig = AppConfig;
    global.buildApiUrl = buildApiUrl;
    global.fetchWithTimeout = fetchWithTimeout;
    global.API_BASE_URL = API_BASE_URL;
  }
})(typeof window !== 'undefined' ? window : globalThis);
