/**
 * VERSUS MASTER - PRÉ-LOADER DINÂMICO & MOTOR DE TRANSIÇÃO IMERSIVA
 * Controla telas de loading full-screen (#050814) com mensagens contextuais
 * durante transições de ambiente (1.5s a 2s).
 */

(function (window) {
  'use strict';

  class VersusPreloader {
    constructor() {
      this.overlay = null;
      this.statusTextEl = null;
      this.initDom();
    }

    initDom() {
      if (document.getElementById('versusPreloadOverlay')) {
        this.overlay = document.getElementById('versusPreloadOverlay');
        this.statusTextEl = document.getElementById('versusPreloadStatus');
        return;
      }

      if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => this.initDom());
        return;
      }

      const overlay = document.createElement('div');
      overlay.id = 'versusPreloadOverlay';
      overlay.className = 'versus-preload-overlay';
      overlay.setAttribute('aria-hidden', 'true');

      overlay.innerHTML = `
        <div class="preload-core-stage">
          <div class="versus-quantum-spinner">
            <div class="spinner-outer-ring"></div>
            <div class="spinner-inner-ring"></div>
            <div class="spinner-pulsing-node"></div>
          </div>
          <div class="preload-brand-wrap">
            <div class="preload-brand-title">VERSUS <span>DATA</span></div>
            <div class="preload-status-message" id="versusPreloadStatus">Carregando ambiente...</div>
          </div>
          <div class="preload-progress-track">
            <div class="preload-progress-bar"></div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.overlay = overlay;
      this.statusTextEl = document.getElementById('versusPreloadStatus');
    }

    /**
     * Exibe o pré-loader com uma mensagem inicial
     * @param {string} initialMessage
     */
    show(initialMessage = 'Carregando ecossistema VERSUS...') {
      if (!this.overlay || !document.getElementById('versusPreloadOverlay')) {
        this.initDom();
      }
      if (this.statusTextEl) this.statusTextEl.textContent = initialMessage;
      if (this.overlay) {
        this.overlay.classList.add('active');
        this.overlay.setAttribute('aria-hidden', 'false');
      }
    }

    /**
     * Atualiza o texto dinâmico de status com animação sutil
     * @param {string} newMessage
     */
    updateStatus(newMessage) {
      if (!this.statusTextEl) return;
      this.statusTextEl.style.opacity = '0';
      this.statusTextEl.style.transform = 'translateY(4px)';
      setTimeout(() => {
        this.statusTextEl.textContent = newMessage;
        this.statusTextEl.style.opacity = '1';
        this.statusTextEl.style.transform = 'translateY(0)';
      }, 150);
    }

    /**
     * Esconde o pré-loader
     */
    hide() {
      if (!this.overlay) return;
      this.overlay.classList.remove('active');
      this.overlay.setAttribute('aria-hidden', 'true');
    }

    /**
     * Executa uma transição imersiva completa com etapas de mensagens e redirecionamento
     * @param {string} destinationUrl - URL de destino (ex: '/admin', '/')
     * @param {Array<string>} messages - Lista de mensagens dinâmicas
     * @param {number} totalDurationMs - Duração total (padrão 1800ms)
     */
    transitionTo(destinationUrl, messages = [], totalDurationMs = 1800) {
      const defaultMessages = [
        'Autenticando credenciais no cluster...',
        'Carregando parâmetros de inteligência...',
        'Conectando ao ambiente seguro...'
      ];

      const flowMessages = messages.length > 0 ? messages : defaultMessages;
      this.show(flowMessages[0]);

      const stepDuration = Math.floor(totalDurationMs / flowMessages.length);

      flowMessages.forEach((msg, idx) => {
        if (idx > 0) {
          setTimeout(() => {
            this.updateStatus(msg);
          }, stepDuration * idx);
        }
      });

      setTimeout(() => {
        window.location.replace(destinationUrl);
      }, totalDurationMs);
    }
  }

  // Instância singleton global no window
  window.VersusPreloader = new VersusPreloader();

  // Interceptação automática de cliques em links de transição de ambiente
  document.addEventListener('DOMContentLoaded', () => {
    // Links para API Leads a partir do Admin
    const crmLinks = document.querySelectorAll('a[href="/"], .btn-transition-crm, .nav-item-external');
    crmLinks.forEach(link => {
      // Ignora links que abrem em nova aba
      if (link.target === '_blank') return;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        window.VersusPreloader.transitionTo('/', [
          'Encerrando escopo administrativo...',
          'Sincronizando viewport geoespacial...',
          'Iniciando API Leads...'
        ], 1600);
      });
    });

    // Links para o Admin a partir do API Leads (se houver)
    const adminLinks = document.querySelectorAll('a[href="/admin"], .btn-transition-admin');
    adminLinks.forEach(link => {
      if (link.target === '_blank') return;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        window.VersusPreloader.transitionTo('/admin', [
          'Verificando autorização RBAC...',
          'Isolando ambiente de governança...',
          'Iniciando Cockpit Super Admin...'
        ], 1600);
      });
    });
  });

})(window);
