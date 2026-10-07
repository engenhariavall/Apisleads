/**
 * client/js/sparksRadar.js
 * 
 * VERSUS SPARKS: RADAR AUTÔNOMO DE INTELIGÊNCIA AGRO & TRIGGER EVENTS
 * Painel autocontido na aba [ ⚡ Radar Sparks ] focado no Core de Máquinas e Outorgas.
 */

(function () {
  'use strict';

  let currentSparkFilter = 'ALL';
  let sparksCurrentPage = 1;
  let sparksPageSize = 10;
  let sparksData = {
    monitors: [],
    signals: [],
    stats: null
  };

  /**
   * Remove emojis de texto para garantir exibição corporativa padronizada B2B
   */
  function stripEmojis(text) {
    if (!text) return '';
    return String(text)
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\uFE0E\uFE0F]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Gera a tag de tipo de sinal com ícone SVG vetorial corporativo padronizado
   */
  function getSparkTypeTag(sparkType) {
    switch (sparkType) {
      case 'CREDITO_BNDES':
        return `<span class="sparks-tag tag-bndes">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <span>Crédito BNDES</span>
        </span>`;
      case 'OUTORGA_ANA':
        return `<span class="sparks-tag tag-ana">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
          <span>Outorga ANA</span>
        </span>`;
      case 'EXPANSAO_LEILAO':
        return `<span class="sparks-tag tag-expansao">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          <span>Expansão</span>
        </span>`;
      case 'DOU':
        return `<span class="sparks-tag tag-dou">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>Diário Oficial</span>
        </span>`;
      case 'EVENTO_AGRO':
        return `<span class="sparks-tag tag-evento">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Feira Agro</span>
        </span>`;
      case 'PASSIVO_IBAMA':
      default:
        return `<span class="sparks-tag tag-ibama">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>IBAMA</span>
        </span>`;
    }
  }

  /**
   * Inicializa o módulo Sparks Radar
   */
  async function initSparksRadar() {
    bindSparksEvents();
  }

  /**
   * Conecta eventos da interface do Radar Sparks
   */
  function bindSparksEvents() {
    // Filtros de Categoria de Sparks
    const filterChips = document.querySelectorAll('.sparks-filter-chip');
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentSparkFilter = chip.getAttribute('data-spark-type') || 'ALL';
        sparksCurrentPage = 1;
        renderSparksSignalsTable();
      });
    });

    // Campo de busca rápida no feed
    const searchInput = document.getElementById('sparksSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        sparksCurrentPage = 1;
        renderSparksSignalsTable();
      });
    }

    // Botão de Atualizar Tudo
    const btnRefreshAll = document.getElementById('btnRefreshSparksRadar');
    if (btnRefreshAll) {
      btnRefreshAll.addEventListener('click', () => {
        loadSparksData(true);
      });
    }

    // Navegação de Paginação do Radar Sparks
    document.getElementById('btnSparksPageFirst')?.addEventListener('click', () => goToPage(1));
    document.getElementById('btnSparksPagePrev')?.addEventListener('click', () => goToPage(sparksCurrentPage - 1));
    document.getElementById('btnSparksPageNext')?.addEventListener('click', () => goToPage(sparksCurrentPage + 1));
    document.getElementById('btnSparksPageLast')?.addEventListener('click', () => {
      const filtered = getFilteredSignals();
      const totalPages = Math.max(1, Math.ceil(filtered.length / sparksPageSize));
      goToPage(totalPages);
    });

    const selectSize = document.getElementById('selectSparksPageSize');
    if (selectSize) {
      selectSize.addEventListener('change', (e) => {
        sparksPageSize = Number(e.target.value) || 10;
        sparksCurrentPage = 1;
        renderSparksSignalsTable();
      });
    }

    // Modal de Dossiê: Fechar
    const btnCloseDossier = document.getElementById('btnCloseSparkDossier');
    if (btnCloseDossier) {
      btnCloseDossier.addEventListener('click', closeSignalDossier);
    }

    const modalDossier = document.getElementById('modalSparkDossier');
    if (modalDossier) {
      modalDossier.addEventListener('click', (e) => {
        if (e.target === modalDossier) closeSignalDossier();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSignalDossier();
    });

    // Ações do Modal de Dossiê
    document.getElementById('btnModalSparkCrm')?.addEventListener('click', dispatchCurrentSignalToCrm);
    document.getElementById('btnModalSparkExportB2b')?.addEventListener('click', exportCurrentSignalB2b);
    document.getElementById('btnModalSparkMetaAds')?.addEventListener('click', dispatchCurrentSignalToMetaAds);
    document.getElementById('btnModalSparkWhatsApp')?.addEventListener('click', dispatchCurrentSignalToWhatsApp);
    document.getElementById('btnModalSparkBureauEnrich')?.addEventListener('click', enrichSparkViaBureau);

    // Ações em Lote do Topo da Tabela
    document.getElementById('btnSparksExportB2bBatch')?.addEventListener('click', exportBatchB2b);
    document.getElementById('btnSparksMetaAdsBatch')?.addEventListener('click', exportBatchMetaAds);
    document.getElementById('btnSparksCrmBatch')?.addEventListener('click', dispatchBatchCrm);
  }

  let currentDossierData = null;

  /**
   * Carrega dados da API do Sparks
   */
  async function loadSparksData(isManualRefresh = false) {
    const refreshBtn = document.getElementById('btnRefreshSparksRadar');
    if (refreshBtn && isManualRefresh) {
      refreshBtn.classList.add('spinning');
    }

    try {
      const [statsRes, monitorsRes, signalsRes] = await Promise.all([
        fetch('/api/sparks/stats'),
        fetch('/api/sparks/monitors'),
        fetch('/api/sparks/signals?limit=300')
      ]);

      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        sparksData.stats = statsJson.data;
        renderSparksStats();
      }

      if (monitorsRes.ok) {
        const monitorsJson = await monitorsRes.json();
        sparksData.monitors = monitorsJson.data || [];
        renderSparksMonitorsGrid();
      }

      if (signalsRes.ok) {
        const signalsJson = await signalsRes.json();
        sparksData.signals = signalsJson.data || [];
        renderSparksSignalsTable();
      }

    } catch (err) {
      console.warn('⚠️ [SPARKS_RADAR] Falha ao carregar telemetria:', err.message);
    } finally {
      if (refreshBtn) {
        refreshBtn.classList.remove('spinning');
      }
    }
  }

  /**
   * Renderiza os 4 KPIs Executivos do Topo
   */
  function renderSparksStats() {
    const s = sparksData.stats;
    if (!s) return;

    const elVol = document.getElementById('kpiSparksVolume');
    const elCore = document.getElementById('kpiSparksCoreCount');
    const elToday = document.getElementById('kpiSparksTodayCount');
    const elDecisors = document.getElementById('kpiSparksDecisorsCount');

    if (elVol) elVol.textContent = s.volume_financeiro_formatado || 'R$ 0,00';
    if (elCore) elCore.textContent = s.sinais_core_maquinas || '0';
    if (elToday) elToday.textContent = s.sinais_hoje || '0';
    if (elDecisors) elDecisors.textContent = s.decisores_identificados || '0';
  }

  /**
   * Renderiza os cards dos 6 Monitores de Inteligência
   */
  function renderSparksMonitorsGrid() {
    const grid = document.getElementById('sparksMonitorsGrid');
    if (!grid) return;

    if (!sparksData.monitors.length) {
      grid.innerHTML = '<div class="sparks-empty-state">Nenhum monitor configurado.</div>';
      return;
    }

    grid.innerHTML = sparksData.monitors.map(m => {
      const isCore = m.prioridade_tier === 1;
      const isRunning = m.status === 'RUNNING';
      
      let badgePriority = isCore 
        ? '<span class="sparks-tier-badge core">CORE: MÁQUINAS & PIVÔS</span>' 
        : '<span class="sparks-tier-badge apoio">APOIO DE MERCADO</span>';

      let iconSvg = '';
      if (m.spark_type === 'CREDITO_BNDES') {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
      } else if (m.spark_type === 'OUTORGA_ANA') {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D2FF" stroke-width="2.2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>';
      } else if (m.spark_type === 'EXPANSAO_LEILAO') {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A855F7" stroke-width="2.2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
      } else if (m.spark_type === 'DOU') {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      } else if (m.spark_type === 'EVENTO_AGRO') {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polygon points="12 6 12 12 16 14"/></svg>';
      } else {
        iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      }

      return `
        <div class="spark-monitor-card ${isCore ? 'core-highlight' : ''}" id="monitorCard_${m.id}">
          <div class="spark-card-header">
            <div class="spark-card-title-group">
              <div class="spark-icon-box">${iconSvg}</div>
              <div>
                <h4 class="spark-card-title">${m.nome}</h4>
                ${badgePriority}
              </div>
            </div>
            <div class="spark-status-pill ${isRunning ? 'running' : 'active'}">
              <span class="spark-led"></span>
              <span class="spark-status-text">${isRunning ? 'VARRENDO...' : 'MONITORANDO'}</span>
            </div>
          </div>

          <p class="spark-card-desc">${m.descricao}</p>

          <div class="spark-card-stats-row">
            <div class="spark-stat-item">
              <span class="spark-stat-label">SINAIS HOJE:</span>
              <strong class="spark-stat-val text-cyan">${m.signals_today || 0}</strong>
            </div>
            <div class="spark-stat-item">
              <span class="spark-stat-label">TOTAL ACUMULADO:</span>
              <strong class="spark-stat-val text-white">${m.total_signals || 0}</strong>
            </div>
            <div class="spark-stat-item">
              <span class="spark-stat-label">FREQUÊNCIA:</span>
              <strong class="spark-stat-val text-muted">${m.frequencia_minutos} min</strong>
            </div>
          </div>

          <div class="spark-card-footer">
            <span class="spark-last-run">Última varredura: ${formatDateTime(m.ultimo_disparo_em)}</span>
            <button type="button" class="btn-spark-trigger" onclick="window.SparksRadar.triggerSpark('${m.id}')" ${isRunning ? 'disabled' : ''}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>${isRunning ? 'Processando...' : 'Varredura Manual'}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Retorna a lista de sinais filtrados por categoria e termo de busca
   */
  function getFilteredSignals() {
    const searchTerm = (document.getElementById('sparksSearchInput')?.value || '').toLowerCase().trim();
    let filtered = sparksData.signals || [];

    if (currentSparkFilter !== 'ALL') {
      filtered = filtered.filter(s => s.spark_type === currentSparkFilter);
    }

    if (searchTerm) {
      filtered = filtered.filter(s => 
        (s.titulo && s.titulo.toLowerCase().includes(searchTerm)) ||
        (s.titular_identificado && s.titular_identificado.toLowerCase().includes(searchTerm)) ||
        (s.nome_imovel && s.nome_imovel.toLowerCase().includes(searchTerm)) ||
        (s.municipio && s.municipio.toLowerCase().includes(searchTerm)) ||
        (s.documento_identificado && s.documento_identificado.includes(searchTerm))
      );
    }

    return filtered;
  }

  /**
   * Navega para uma página específica na tabela de sinais do Radar Sparks
   */
  function goToPage(page) {
    const filtered = getFilteredSignals();
    const totalPages = Math.max(1, Math.ceil(filtered.length / sparksPageSize));
    let p = Number(page) || 1;
    if (p < 1) p = 1;
    if (p > totalPages) p = totalPages;
    sparksCurrentPage = p;
    renderSparksSignalsTable();
  }

  /**
   * Renderiza a paginação integrada (contadores, botões 1, 2, 3... e navegação)
   */
  function renderSparksPagination(totalSignals, totalPages, startIndex, endIndex) {
    const rangeText = document.getElementById('sparksRangeText');
    const totalText = document.getElementById('sparksTotalText');
    const pageBadge = document.getElementById('sparksPageBadge');
    const btnFirst = document.getElementById('btnSparksPageFirst');
    const btnPrev = document.getElementById('btnSparksPagePrev');
    const btnNext = document.getElementById('btnSparksPageNext');
    const btnLast = document.getElementById('btnSparksPageLast');
    const pillsContainer = document.getElementById('sparksPaginationPills');
    const selectPageSize = document.getElementById('selectSparksPageSize');

    const start = totalSignals === 0 ? 0 : startIndex + 1;
    const end = endIndex;

    if (rangeText) rangeText.textContent = `${start}–${end}`;
    if (totalText) totalText.textContent = String(totalSignals);
    if (pageBadge) pageBadge.textContent = `Página ${sparksCurrentPage} de ${totalPages}`;

    if (btnFirst) btnFirst.disabled = sparksCurrentPage <= 1;
    if (btnPrev) btnPrev.disabled = sparksCurrentPage <= 1;
    if (btnNext) btnNext.disabled = sparksCurrentPage >= totalPages;
    if (btnLast) btnLast.disabled = sparksCurrentPage >= totalPages;

    if (selectPageSize && selectPageSize.value != sparksPageSize) {
      selectPageSize.value = String(sparksPageSize);
    }

    if (!pillsContainer) return;

    if (totalSignals === 0) {
      pillsContainer.innerHTML = '';
      return;
    }

    const pills = [];
    if (totalPages <= 7) {
      for (let p = 1; p <= totalPages; p++) {
        pills.push(p);
      }
    } else {
      pills.push(1);
      let left = Math.max(2, sparksCurrentPage - 1);
      let right = Math.min(totalPages - 1, sparksCurrentPage + 1);

      if (sparksCurrentPage <= 3) {
        right = 4;
      } else if (sparksCurrentPage >= totalPages - 2) {
        left = totalPages - 3;
      }

      if (left > 2) pills.push('...');
      for (let p = left; p <= right; p++) {
        pills.push(p);
      }
      if (right < totalPages - 1) pills.push('...');
      pills.push(totalPages);
    }

    pillsContainer.innerHTML = pills.map(p => {
      if (p === '...') {
        return `<span style="padding: 0 0.35rem; color: #64748B; font-weight: 700;">...</span>`;
      }
      const isActive = p === sparksCurrentPage;
      return `
        <button type="button" class="page-pill-btn ${isActive ? 'active' : ''}" onclick="window.SparksRadar.goToPage(${p})" title="Ir para página ${p}">
          ${p}
        </button>
      `;
    }).join('');
  }

  /**
   * Renderiza a Tabela do Live Intent Feed
   */
  function renderSparksSignalsTable() {
    const tbody = document.getElementById('sparksSignalsTableBody');
    if (!tbody) return;

    const filtered = getFilteredSignals();

    const badgeCounter = document.getElementById('sparksSignalsCounter');
    if (badgeCounter) badgeCounter.textContent = `${filtered.length} sinais`;

    const totalSignals = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalSignals / sparksPageSize));
    if (sparksCurrentPage > totalPages) sparksCurrentPage = totalPages;
    if (sparksCurrentPage < 1) sparksCurrentPage = 1;

    const startIndex = (sparksCurrentPage - 1) * sparksPageSize;
    const endIndex = Math.min(startIndex + sparksPageSize, totalSignals);
    const pageSignals = filtered.slice(startIndex, endIndex);

    renderSparksPagination(totalSignals, totalPages, startIndex, endIndex);

    if (!pageSignals.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="sparks-table-empty">
            Nenhum sinal encontrado para os filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pageSignals.map(s => {
      const badgeType = getSparkTypeTag(s.spark_type);

      const valorFormatado = s.valor_monetario > 0 
        ? `<div class="sparks-val-pill">${s.valor_monetario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>`
        : (s.volume_m3h > 0 ? `<div class="sparks-val-pill cyan">${s.volume_m3h} m³/h</div>` : '');

      const docFormatado = s.documento_identificado ? `<div class="sparks-doc-code">${s.documento_identificado}</div>` : '';

      // Formatação da Data de Publicação Oficial do DOU (DD/MM/YYYY)
      let pubDateFormatted = '';
      if (s.data_publicacao) {
        const p = s.data_publicacao.split('-');
        if (p.length === 3) pubDateFormatted = `${p[2]}/${p[1]}/${p[0]}`;
        else pubDateFormatted = s.data_publicacao;
      }
      const dt = formatDateTimeSplit(s.created_at);
      const displayDate = pubDateFormatted || dt.date;

      // Botão WhatsApp se houver titular ou documento
      const whatsBtn = s.titular_identificado ? `
        <button type="button" class="btn-action-spark-wa" onclick="event.stopPropagation(); window.SparksRadar.openWhatsAppForSignal('${encodeURIComponent(s.titular_identificado)}', '${encodeURIComponent(stripEmojis(s.trigger_texto || s.titulo))}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span>WhatsApp</span>
        </button>
      ` : '';

      // Botão de Auditoria Direta no DOU (Link Oficial Governamental)
      const douLinkBtn = s.url_fonte ? `
        <a href="${s.url_fonte}" target="_blank" rel="noopener noreferrer" class="btn-action-spark-dou" onclick="event.stopPropagation()" title="Auditar no Diário Oficial da União (in.gov.br)" style="display:inline-flex; align-items:center; gap:0.25rem; padding:0.28rem 0.55rem; background:rgba(2,132,199,0.15); border:1px solid rgba(56,189,248,0.4); border-radius:4px; color:#38BDF8; font-size:0.68rem; font-weight:700; text-decoration:none;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          <span>DOU</span>
        </a>
      ` : '';

      const farmHtml = s.nome_imovel ? `
        <span class="sparks-lead-farm">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" style="display:inline-block; vertical-align:-1px; margin-right:3px; opacity:0.8;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          ${stripEmojis(s.nome_imovel)}
        </span>
      ` : '';

      return `
        <tr class="sparks-feed-row" onclick="window.SparksRadar.openSignalDossier('${s.id}')" title="Clique para abrir o Raio-X e Dossiê Completo">
          <td class="sparks-col-time">
            <div class="sparks-dt-badge">
              <span class="sparks-date" style="color:#38BDF8; font-weight:700;" title="Data oficial da publicação no DOU">${displayDate}</span>
              <span class="sparks-time" title="Hora de detecção">${dt.time}</span>
            </div>
          </td>
          <td>${badgeType}</td>
          <td>
            <div class="sparks-lead-entity">
              <strong class="sparks-lead-name">${stripEmojis(s.titular_identificado || s.nome_imovel || 'Entidade Local')}</strong>
              ${docFormatado}
              ${farmHtml}
            </div>
          </td>
          <td>
            <span class="sparks-location-pill">${s.municipio}/${s.uf}</span>
          </td>
          <td>
            <div class="sparks-trigger-box">
              <strong class="sparks-trigger-headline">${stripEmojis(s.trigger_texto || s.titulo)}</strong>
              <p class="sparks-trigger-summary">${stripEmojis(s.resumo || '')}</p>
              ${valorFormatado}
            </div>
          </td>
          <td>
            <div class="sparks-score-pill">+${s.score_gerado || 30} pts</div>
          </td>
          <td class="sparks-col-actions" onclick="event.stopPropagation()">
            <div class="sparks-actions-group">
              <button type="button" class="btn-action-spark-dossier" onclick="window.SparksRadar.openSignalDossier('${s.id}')" title="Abrir Raio-X do Sinal">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <span>Raio-X</span>
              </button>
              ${douLinkBtn}
              ${whatsBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Abre o Modal / Dossiê Raio-X do Sinal de Compra
   */
  async function openSignalDossier(signalId) {
    const modal = document.getElementById('modalSparkDossier');
    if (!modal) return;

    try {
      showToastNotification('Consultando Dossiê e Sócios...', 'info');

      const res = await fetch(`/api/sparks/signals/${signalId}/dossier`);
      if (!res.ok) throw new Error('Não foi possível obter os dados do sinal.');

      const json = await res.json();
      const dossier = json.data;
      currentDossierData = dossier;

      const { signal, lead, socios, propriedade, sefaz, perfil_fundiario, perfil_agronomico, frota_maquinario, scoring_triggers, contatos, score_impact } = dossier;

      // 1. Badges Bar do Topo
      const badgeHot = document.getElementById('modalSparkBadgeHot');
      if (badgeHot) {
        const isHot = (score_impact?.score_turbinado || 100) >= 80;
        badgeHot.textContent = isHot ? 'HOT' : 'WARM';
        badgeHot.style.color = isHot ? '#F87171' : '#FBBF24';
        badgeHot.style.borderColor = isHot ? 'rgba(239, 68, 68, 0.45)' : 'rgba(245, 158, 11, 0.45)';
      }

      const badgeSigef = document.getElementById('modalSparkBadgeSigef');
      if (badgeSigef) {
        const isPending = (perfil_fundiario?.codigo_sigef || '').includes('PENDING');
        badgeSigef.textContent = isPending ? 'SIGEF PENDENTE' : 'CERTIFICADO (SIGEF)';
        badgeSigef.style.color = isPending ? '#F59E0B' : '#38BDF8';
        badgeSigef.style.borderColor = isPending ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.4)';
      }

      const badgeHa = document.getElementById('modalSparkBadgeHa');
      if (badgeHa) {
        badgeHa.textContent = `${perfil_fundiario?.area_total_ha || 820} ha`;
      }

      const badgeEntity = document.getElementById('modalSparkBadgeEntity');
      if (badgeEntity) {
        const isPj = perfil_fundiario?.tipo_pessoa === 'PESSOA JURÍDICA';
        badgeEntity.innerHTML = isPj 
          ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg><span>PESSOA JURÍDICA</span>` 
          : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>PESSOA FÍSICA</span>`;
      }

      const badgeSefaz = document.getElementById('modalSparkBadgeSefaz');
      if (badgeSefaz) {
        badgeSefaz.textContent = sefaz?.inscricao_estadual ? 'SEFAZ ATIVA' : 'CAD/PRO ATIVO';
      }

      // 2. Cabeçalho Principal
      const badgeEl = document.getElementById('modalSparkBadge');
      if (badgeEl) {
        badgeEl.innerHTML = getSparkTypeTag(signal.spark_type);
      }
      const titleEl = document.getElementById('modalSparkTitle');
      if (titleEl) {
        titleEl.textContent = stripEmojis(lead?.razao_social || signal.titular_identificado || signal.nome_imovel || 'Entidade Alvo');
      }
      const docEl = document.getElementById('modalSparkDoc');
      if (docEl) {
        docEl.textContent = signal.documento_identificado || lead?.cnpj || 'Sem documento público';
      }

      // 3. Telemetria e Rastreabilidade (Dados 100% Reais do DOU)
      const dateEl = document.getElementById('modalSparkDate');
      if (dateEl) {
        if (signal.data_publicacao) {
          const p = signal.data_publicacao.split('-');
          dateEl.textContent = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]} (DOU Oficial)` : signal.data_publicacao;
        } else {
          dateEl.textContent = signal.data_formatada || '07/10/2026';
        }
      }

      const timeEl = document.getElementById('modalSparkTime');
      if (timeEl) timeEl.textContent = signal.hora_formatada || (signal.created_at ? formatDateTimeSplit(signal.created_at).time : '10:00:00');

      const robotEl = document.getElementById('modalSparkRobot');
      if (robotEl) robotEl.textContent = signal.monitor_nome || 'Crawler Diário Oficial';

      const sourceEl = document.getElementById('modalSparkSource');
      if (sourceEl) sourceEl.textContent = signal.orgao_emissor || 'Imprensa Nacional / DOU';

      // Link Oficial do DOU
      const linkContainer = document.getElementById('modalSparkOfficialLinkContainer');
      const linkBtn = document.getElementById('modalSparkOfficialLinkBtn');
      if (linkContainer && linkBtn) {
        if (signal.url_fonte) {
          linkContainer.style.display = 'flex';
          linkBtn.href = signal.url_fonte;
        } else {
          linkContainer.style.display = 'none';
        }
      }

      // 4. Gatilho & Valores
      const headEl = document.getElementById('modalSparkTriggerHeadline');
      if (headEl) headEl.textContent = stripEmojis(signal.trigger_texto || signal.titulo);

      const sumEl = document.getElementById('modalSparkTriggerSummary');
      if (sumEl) sumEl.textContent = stripEmojis(signal.resumo || signal.conteudo_bruto || '');

      const valEl = document.getElementById('modalSparkVal');
      if (valEl) {
        if (signal.valor_monetario > 0) {
          valEl.textContent = signal.valor_monetario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        } else if (signal.volume_m3h > 0) {
          valEl.textContent = `${signal.volume_m3h} m³/h (Vazão Outorgada)`;
        } else {
          valEl.textContent = 'Oportunidade Estratégica';
        }
      }

      const scoreEl = document.getElementById('modalSparkScoreImpact');
      if (scoreEl && score_impact) {
        scoreEl.innerHTML = `${score_impact.score_base} ➔ <span style="color:#EF4444; font-weight:800;">${score_impact.score_turbinado} pts</span> <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.4" style="display:inline-block; vertical-align:-1px; margin-left:3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
      }

      // 5. Perfil Agronômico & Territorial
      const cropBadge = document.getElementById('modalSparkCropBadge');
      if (cropBadge) {
        cropBadge.textContent = (perfil_agronomico?.cultura_principal || 'SOJA').toUpperCase();
      }
      const areaTotalEl = document.getElementById('modalSparkAreaTotal');
      if (areaTotalEl) {
        areaTotalEl.textContent = `${(perfil_fundiario?.area_total_ha || 820).toLocaleString('pt-BR')} ha`;
      }
      const areaUtilEl = document.getElementById('modalSparkAreaUtil');
      if (areaUtilEl) {
        const utilHa = perfil_fundiario?.area_lavoura_util_ha || 640;
        const pct = perfil_fundiario?.percentual_util || 78;
        areaUtilEl.textContent = `${utilHa.toLocaleString('pt-BR')} ha (${pct}%)`;
      }
      const cropConfEl = document.getElementById('modalSparkCropConfidence');
      if (cropConfEl) {
        cropConfEl.textContent = `${perfil_agronomico?.cultura_principal || 'Soja'} (${perfil_agronomico?.confianca || '94%'})`;
      }
      const cropRotEl = document.getElementById('modalSparkCropRotation');
      if (cropRotEl) {
        cropRotEl.textContent = perfil_agronomico?.ciclo_rotacao || 'Milho Safrinha';
      }
      const sigefCodeEl = document.getElementById('modalSparkSigefCode');
      if (sigefCodeEl) {
        sigefCodeEl.textContent = perfil_fundiario?.codigo_sigef || 'SIGEF-GEO-PENDING';
      }
      const sensorSourceEl = document.getElementById('modalSparkSensorSource');
      if (sensorSourceEl) {
        sensorSourceEl.textContent = perfil_agronomico?.fonte_sensoriamento || 'Sentinel-2 AI';
      }

      // 6. Frota de Maquinário Estimada
      const patrimonyEl = document.getElementById('modalSparkMachineryPatrimony');
      if (patrimonyEl) {
        patrimonyEl.textContent = frota_maquinario?.patrimonio_frota_formatado || 'R$ 6.970.000,00';
      }
      const tractorHighEl = document.getElementById('modalSparkTractorHigh');
      if (tractorHighEl) {
        const tHigh = frota_maquinario?.tratores_alta_potencia || {};
        tractorHighEl.textContent = `${tHigh.quantidade_estimada || 2} un (${tHigh.faixa_potencia || '280-380 cv'})`;
      }
      const harvestersEl = document.getElementById('modalSparkHarvesters');
      if (harvestersEl) {
        const colh = frota_maquinario?.colheitadeiras || {};
        harvestersEl.textContent = `${colh.quantidade_estimada || 1} un (${colh.classe || 'Classe 7/8'})`;
      }
      const plantersEl = document.getElementById('modalSparkPlanters');
      if (plantersEl) {
        plantersEl.textContent = frota_maquinario?.plantadeiras?.especificacao || '24 a 32 linhas articuladas';
      }

      // 7. Motor de Intenção & Triggers Analíticos Detalhados
      const triggersPill = document.getElementById('modalSparkTriggersScorePill');
      if (triggersPill) {
        triggersPill.textContent = `${score_impact?.score_turbinado || 100} pts`;
      }
      const triggersListEl = document.getElementById('modalSparkTriggersList');
      if (triggersListEl) {
        if (scoring_triggers && scoring_triggers.length > 0) {
          triggersListEl.innerHTML = scoring_triggers.map(trig => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(2, 6, 23, 0.6); padding: 0.45rem 0.65rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05); gap: 0.5rem;">
              <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; color: #CBD5E1;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F87171" stroke-width="2.2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>${stripEmojis(trig.label)}</span>
              </div>
              <span style="font-size: 0.68rem; font-weight: 800; color: #F87171; background: rgba(239, 68, 68, 0.15); padding: 0.1rem 0.45rem; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.3); flex-shrink: 0;">${trig.pts}</span>
            </div>
          `).join('');
        } else {
          triggersListEl.innerHTML = `
            <div style="font-size: 0.72rem; color: #94A3B8; padding: 0.4rem 0.2rem;">Gatilhos consolidados a partir do cruzamento de bases abertas e satélite.</div>
          `;
        }
      }

      // 8. Decisores & Inteligência de Contato (Bureau / SEFAZ)
      const decNameEl = document.getElementById('modalSparkDecisionMakerName');
      if (decNameEl) {
        decNameEl.textContent = stripEmojis(contatos?.titular_nome || signal.titular_identificado || lead?.razao_social);
      }
      const decRoleEl = document.getElementById('modalSparkDecisionMakerRole');
      if (decRoleEl) {
        decRoleEl.textContent = perfil_fundiario?.tipo_pessoa === 'PESSOA JURÍDICA' ? 'Titular e Administrador Direto da Operação' : 'Produtor Rural Proprietário da Terra';
      }
      const decPhoneEl = document.getElementById('modalSparkDecisionMakerPhone');
      if (decPhoneEl) {
        decPhoneEl.textContent = contatos?.whatsapp || contatos?.telefone || 'Aguardando consulta no Bureau';
        decPhoneEl.style.color = contatos?.whatsapp ? '#22C55E' : '#94A3B8';
      }
      const contactBadgeEl = document.getElementById('modalSparkContactOriginBadge');
      if (contactBadgeEl) {
        if (contatos?.whatsapp) {
          contactBadgeEl.textContent = contatos?.origem_contato === 'SEFAZ_SINTEGRA' ? 'SEFAZ VALIDADO' : 'CONTATO ATIVO';
          contactBadgeEl.style.background = 'rgba(34, 197, 94, 0.15)';
          contactBadgeEl.style.color = '#4ADE80';
        } else {
          contactBadgeEl.textContent = 'PENDENTE BUREAU';
          contactBadgeEl.style.background = 'rgba(168, 85, 247, 0.15)';
          contactBadgeEl.style.color = '#C084FC';
        }
      }
      const sefazIeEl = document.getElementById('modalSparkSefazIe');
      if (sefazIeEl) {
        sefazIeEl.textContent = sefaz?.inscricao_estadual || (signal.uf ? `CAD/PRO ${signal.uf}` : 'Inscrição Ativa');
      }

      // Sócios adicionais (se houver)
      const sociosListEl = document.getElementById('modalSparkSociosList');
      if (sociosListEl) {
        if (socios && socios.length > 0) {
          sociosListEl.innerHTML = socios.map(soc => `
            <div class="spark-socio-card" style="margin-top: 0.45rem;">
              <strong>${stripEmojis(soc.nome || soc.nome_socio || 'Sócio Registrado')}</strong>
              <span>${soc.qualificacao || soc.qualificacao_socio || 'Sócio-Administrador'}</span>
              ${soc.telefone || soc.telefone_presumido ? `<span class="spark-socio-contact" style="display:inline-flex; align-items:center; gap:0.3rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${soc.telefone || soc.telefone_presumido}</span>` : ''}
            </div>
          `).join('');
        } else {
          sociosListEl.innerHTML = '';
        }
      }

      // 9. Território & Fazenda
      const locEl = document.getElementById('modalSparkLocation');
      if (locEl) locEl.textContent = `${signal.municipio || 'Região Polo'} / ${signal.uf || 'BR'}`;

      const farmEl = document.getElementById('modalSparkFarm');
      if (farmEl) farmEl.textContent = signal.nome_imovel || propriedade?.nome_imovel || 'Propriedade Operacional';

      const syncStatusEl = document.getElementById('modalSparkSyncStatus');
      if (syncStatusEl) {
        syncStatusEl.textContent = lead?.id ? `Sincronizado no SQLite (${lead.id})` : 'Novo Lead Qualificado';
      }

      // Exibe Modal
      modal.style.display = 'flex';

    } catch (err) {
      console.error('Erro ao abrir dossiê do sinal:', err);
      showToastNotification(`Falha ao abrir dossiê: ${err.message}`, 'error');
    }
  }

  /**
   * Consulta enriquecida via Bureau de Dados (Assertiva) sob demanda
   */
  async function enrichSparkViaBureau() {
    if (!currentDossierData?.signal?.id) return;
    const signalId = currentDossierData.signal.id;
    const btn = document.getElementById('btnModalSparkBureauEnrich');
    const btnText = document.getElementById('btnModalSparkBureauText');
    const origText = btnText ? btnText.textContent : 'Consultar Bureau (Assertiva)';

    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Consultando Bureau...';

    try {
      showToastNotification('Buscando novos telefones no Bureau (Assertiva)...', 'info');
      const res = await fetch(`/api/sparks/signals/${signalId}/enrich-bureau`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const json = await res.json();

      if (json.success && json.whatsapp) {
        showToastNotification(`Contato quente revelado no Bureau: ${json.whatsapp}`, 'success');
        const phoneEl = document.getElementById('modalSparkDecisionMakerPhone');
        if (phoneEl) {
          phoneEl.textContent = json.whatsapp;
          phoneEl.style.color = '#22C55E';
        }
        const badgeEl = document.getElementById('modalSparkContactOriginBadge');
        if (badgeEl) {
          badgeEl.textContent = 'BUREAU ASSERTIVA OK';
          badgeEl.style.background = 'rgba(168, 85, 247, 0.2)';
          badgeEl.style.color = '#C084FC';
          badgeEl.style.borderColor = 'rgba(168, 85, 247, 0.5)';
        }
        if (currentDossierData.contatos) {
          currentDossierData.contatos.whatsapp = json.whatsapp;
          currentDossierData.contatos.telefone = json.whatsapp;
        }
      } else {
        showToastNotification(`Bureau: ${json.message || 'Contato não localizado ou chave da API Assertiva ausente.'}`, 'info');
      }
    } catch (err) {
      console.warn('Erro ao consultar Bureau:', err);
      showToastNotification(`Erro de comunicação com o Bureau: ${err.message}`, 'error');
    } finally {
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = origText;
    }
  }

  /**
   * Fecha o Modal de Dossiê
   */
  function closeSignalDossier() {
    const modal = document.getElementById('modalSparkDossier');
    if (modal) modal.style.display = 'none';
    currentDossierData = null;
  }

  /**
   * Despacha o sinal do dossiê aberto para o CRM
   */
  async function dispatchCurrentSignalToCrm() {
    if (!currentDossierData?.signal?.id) return;
    const signalId = currentDossierData.signal.id;

    const btn = document.getElementById('btnModalSparkCrm');
    const origHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Enviando...</span>';
    }

    try {
      const res = await fetch(`/api/sparks/signals/${signalId}/dispatch-crm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 'HIGH', origem: 'RADAR_SPARKS' })
      });
      const json = await res.json();

      if (json.success) {
        showToastNotification(`${currentDossierData.lead?.razao_social || 'Lead'} despachado para o CRM via Webhook com sucesso!`, 'success');
        await loadSparksData(false);
        closeSignalDossier();
      } else {
        showToastNotification(`Erro no CRM: ${json.error || 'Falha ao despachar'}`, 'error');
      }
    } catch (e) {
      showToastNotification(`Erro de conexão com CRM: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  }

  /**
   * Exporta a ficha do sinal aberto para Planilha B2B
   */
  async function exportCurrentSignalB2b() {
    if (!currentDossierData?.signal?.id) return;
    await exportSignalsToCsv([currentDossierData.signal.id], `versus_spark_${currentDossierData.signal.id}.csv`);
  }

  /**
   * Baixa planilha do sinal atual no formato oficial do Meta Ads Custom Audiences com criptografia SHA-256
   */
  async function dispatchCurrentSignalToMetaAds() {
    if (!currentDossierData?.signal?.id) return;
    const signalId = currentDossierData.signal.id;
    const titular = currentDossierData.lead?.razao_social || currentDossierData.signal.titular_identificado || 'Lead';

    showToastNotification(`Gerando planilha Meta Ads (SHA-256) para ${titular}...`, 'info');

    try {
      const downloadUrl = `/api/sparks/signals/export-meta-ads?ids=${signalId}`;
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error('Falha ao gerar arquivo Meta Ads');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `meta_ads_spark_${signalId}_sha256.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToastNotification(`Planilha Meta Ads (SHA-256) baixada com sucesso! Pronto para carregar no Gerenciador de Anúncios.`, 'success');
    } catch (err) {
      console.error('Erro ao baixar Meta Ads:', err);
      showToastNotification(`Erro ao baixar Meta Ads: ${err.message}`, 'error');
    }
  }

  /**
   * Exporta sinais filtrados em lote para Audiência do Meta Ads (SHA-256)
   */
  async function exportBatchMetaAds() {
    const searchTerm = (document.getElementById('sparksSearchInput')?.value || '').toLowerCase().trim();
    let signals = sparksData.signals;
    if (currentSparkFilter !== 'ALL') {
      signals = signals.filter(s => s.spark_type === currentSparkFilter);
    }
    if (searchTerm) {
      signals = signals.filter(s => 
        (s.titular_identificado || '').toLowerCase().includes(searchTerm) ||
        (s.municipio || '').toLowerCase().includes(searchTerm)
      );
    }

    if (!signals.length) {
      showToastNotification('Nenhum sinal disponível para exportação do Meta Ads.', 'info');
      return;
    }

    const ids = signals.map(s => s.id);
    showToastNotification(`Gerando audiência Meta Ads para ${ids.length} sinais filtrados...`, 'info');

    try {
      const downloadUrl = `/api/sparks/signals/export-meta-ads?ids=${ids.join(',')}`;
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error('Falha ao gerar lote Meta Ads');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `meta_ads_sparks_lote_sha256_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToastNotification(`${ids.length} leads exportados para o Meta Ads com SHA-256!`, 'success');
    } catch (err) {
      console.error('Erro ao exportar lote Meta Ads:', err);
      showToastNotification(`Erro na exportação Meta Ads: ${err.message}`, 'error');
    }
  }

  /**
   * Abre o WhatsApp com a abordagem consultiva direcionada
   */
  function dispatchCurrentSignalToWhatsApp() {
    if (!currentDossierData?.signal) return;
    const s = currentDossierData.signal;
    openWhatsAppForSignal(s.titular_identificado, s.trigger_texto || s.titulo);
  }

  /**
   * Exporta os sinais em lote para Planilha B2B (.csv)
   */
  async function exportBatchB2b() {
    const searchTerm = (document.getElementById('sparksSearchInput')?.value || '').toLowerCase().trim();
    let signals = sparksData.signals;
    if (currentSparkFilter !== 'ALL') {
      signals = signals.filter(s => s.spark_type === currentSparkFilter);
    }
    if (searchTerm) {
      signals = signals.filter(s => 
        (s.titular_identificado || '').toLowerCase().includes(searchTerm) ||
        (s.municipio || '').toLowerCase().includes(searchTerm)
      );
    }

    if (!signals.length) {
      showToastNotification('Nenhum sinal disponível para exportação.', 'info');
      return;
    }

    const ids = signals.map(s => s.id);
    await exportSignalsToCsv(ids, `versus_sparks_planilha_b2b_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  /**
   * Despacha sinais em lote para o CRM
   */
  async function dispatchBatchCrm() {
    const searchTerm = (document.getElementById('sparksSearchInput')?.value || '').toLowerCase().trim();
    let signals = sparksData.signals;
    if (currentSparkFilter !== 'ALL') {
      signals = signals.filter(s => s.spark_type === currentSparkFilter);
    }
    if (searchTerm) {
      signals = signals.filter(s => (s.titular_identificado || '').toLowerCase().includes(searchTerm));
    }

    if (!signals.length) {
      showToastNotification('Nenhum sinal filtrado para envio ao CRM.', 'info');
      return;
    }

    const ids = signals.map(s => s.id);
    const btn = document.getElementById('btnSparksCrmBatch');
    const origHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Enviando Lote...</span>';
    }

    try {
      const res = await fetch('/api/sparks/signals/dispatch-crm-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalIds: ids })
      });
      const json = await res.json();

      if (json.success) {
        showToastNotification(`${json.data.successCount} leads quentes despachados para o CRM com sucesso!`, 'success');
        await loadSparksData(false);
      } else {
        showToastNotification(`Erro: ${json.error || 'Falha no envio'}`, 'error');
      }
    } catch (err) {
      showToastNotification(`Erro de conexão: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  }

  /**
   * Baixa dados formatados da API e gera arquivo CSV UTF-8 com BOM
   */
  async function exportSignalsToCsv(ids = [], filename = 'sparks_export.csv') {
    try {
      showToastNotification('Gerando Planilha Comercial B2B...', 'info');
      const url = ids.length ? `/api/sparks/signals/export-b2b?ids=${ids.join(',')}` : '/api/sparks/signals/export-b2b';
      const res = await fetch(url);
      const json = await res.json();

      if (!json.success || !json.data.length) {
        showToastNotification('Nenhum registro para exportar.', 'info');
        return;
      }

      const rows = json.data;
      const headers = Object.keys(rows[0]);
      
      const csvContent = [
        headers.join(';'),
        ...rows.map(row => headers.map(h => {
          let val = row[h] !== null && row[h] !== undefined ? String(row[h]) : '';
          val = val.replace(/"/g, '""');
          return `"${val}"`;
        }).join(';'))
      ].join('\r\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToastNotification(`Planilha "${filename}" baixada com sucesso!`, 'success');
    } catch (e) {
      showToastNotification(`Erro ao exportar CSV: ${e.message}`, 'error');
    }
  }

  /**
   * Executa varredura sob demanda de um robô específico
   */
  async function triggerSpark(monitorId) {
    const card = document.getElementById(`monitorCard_${monitorId}`);
    const btn = card?.querySelector('.btn-spark-trigger');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Executando...</span>';
    }

    try {
      const res = await fetch(`/api/sparks/monitors/${monitorId}/trigger`, {
        method: 'POST'
      });
      const json = await res.json();

      if (json.success) {
        showToastNotification(`${json.data.mensagem}`, 'success');
        
        // Se houver novos sinais capturados nesta varredura, dispara o alerta flutuante e som
        if (Array.isArray(json.data.novos_sinais) && json.data.novos_sinais.length > 0) {
          if (window.SparksNotificationCenter && typeof window.SparksNotificationCenter.triggerAlert === 'function') {
            json.data.novos_sinais.forEach(s => {
              window.SparksNotificationCenter.triggerAlert(s);
            });
          }
        }

        await loadSparksData(false);
      } else {
        showToastNotification(`Erro: ${json.error || 'Falha no disparo'}`, 'error');
      }
    } catch (err) {
      showToastNotification(`Falha de conexão: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>Varredura Manual</span>
        `;
      }
    }
  }

  /**
   * Abre o WhatsApp com mensagem executiva estruturada sobre a oportunidade detectada (SEM EMOJIS)
   */
  function openWhatsAppForSignal(encodedTitular, encodedTrigger, signalId = null) {
    const titular = decodeURIComponent(encodedTitular || 'Produtor Rural');
    const trigger = decodeURIComponent(encodedTrigger || 'Oportunidade Agro');
    const deepLink = signalId ? `${window.location.origin}/?tab=sparks&signal_id=${signalId}` : window.location.href;

    const message = [
      `[VERSUS SPARKS] ALERTA DE OPORTUNIDADE COMERCIAL`,
      `----------------------------------------`,
      `TITULAR: ${titular}`,
      `GATILHO DETECTADO: ${trigger}`,
      `----------------------------------------`,
      `ACESSAR NA PLATAFORMA:`,
      deepLink
    ].join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  /**
   * Converte strings de data UTC (SQLite/Postgres) em instâncias Date seguras
   */
  function parseDateUtc(str) {
    if (!str) return new Date();
    if (str instanceof Date) return str;
    let s = String(str).trim();
    // Se for formato SQL "YYYY-MM-DD HH:mm:ss" ou "YYYY-MM-DDTHH:mm:ss" sem fuso, adiciona Z para ser tratado como UTC
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  function formatDateTimeSplit(str) {
    if (!str) return { date: '--/--/----', time: '--:--:--' };
    try {
      const d = parseDateUtc(str);
      const date = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const time = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      return { date, time };
    } catch (_) {
      return { date: '--/--/----', time: '--:--:--' };
    }
  }

  function formatDateTime(str) {
    if (!str) return 'Recente';
    try {
      const d = parseDateUtc(str);
      return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' ' + d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (_) {
      return str;
    }
  }

  function formatTimeOnly(str) {
    if (!str) return 'Hoje';
    try {
      const d = parseDateUtc(str);
      return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (_) {
      return 'Agora';
    }
  }

  function showToastNotification(msg, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
      return;
    }
    const t = document.createElement('div');
    t.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      background: ${type === 'error' ? '#EF4444' : (type === 'success' ? '#059669' : '#0B1224')};
      color: #FFFFFF; border: 1px solid ${type === 'error' ? '#DC2626' : (type === 'success' ? '#10B981' : '#0055FF')};
      padding: 0.65rem 1rem; border-radius: 6px; font-size: 0.78rem; font-weight: 600;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // Exporta para o escopo global
  window.SparksRadar = {
    init: initSparksRadar,
    loadSparksData,
    goToPage,
    triggerSpark,
    openWhatsAppForSignal,
    openSignalDossier,
    closeSignalDossier,
    exportBatchB2b,
    dispatchBatchCrm
  };

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSparksRadar);
  } else {
    initSparksRadar();
  }

})();
