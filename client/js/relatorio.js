// Lógica do Relatório de Gestão em Tempo Real — API Leads (Padrão VERSUS)
let checklistData = null;
let currentTab = 'fases';
let currentFilter = 'all';
let searchQuery = '';
let expandedPhases = {};

// Função de Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadChecklistData();

  // Auto-refresh a cada 15 segundos em tempo real
  setInterval(() => {
    loadChecklistData(true);
  }, 15000);

  // Registro seguro do Service Worker corporativo (PWA Offline-Ready)
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('🛡️ [PWA] Service Worker registrado no Relatório (escopo):', reg.scope))
        .catch(err => console.warn('⚠️ [PWA] Falha no registro do Service Worker:', err));
    });
  }
});

// Event Listeners
function initEventListeners() {
  // Botão de atualização manual
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      btnRefresh.classList.add('refresh-spin');
      loadChecklistData().finally(() => {
        setTimeout(() => btnRefresh.classList.remove('refresh-spin'), 600);
      });
    });
  }

  // Copiar link do relatório
  const btnShare = document.getElementById('btnShare');
  if (btnShare) {
    btnShare.addEventListener('click', () => {
      navigator.clipboard.writeText(window.location.href);
      showToast('Link do relatório copiado para a área de transferência!');
    });
  }

  // Imprimir relatório
  const btnPrint = document.getElementById('btnPrint');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // Abas de navegação
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-tab');
      renderActiveTab();
    });
  });

  // Filtro de status das fases
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      renderPhasesList();
    });
  });

  // Busca textual
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderPhasesList();
    });
  }
}

// Carrega os dados da API
async function loadChecklistData(isBackground = false) {
  try {
    const fetchFn = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;
    const response = await fetchFn('/api/checklist?t=' + Date.now(), {}, 8000);
    if (!response.ok) throw new Error('Falha na resposta do servidor');
    checklistData = await response.json();


    // Na primeira carga, expande as fases ativas
    if (!isBackground && Object.keys(expandedPhases).length === 0) {
      checklistData.phases.forEach(p => {
        if (!p.isCompleted) expandedPhases[p.id] = true;
      });
    }

    renderDashboard();
  } catch (error) {
    console.error('Erro ao carregar dados do checklist:', error);
    if (!isBackground) {
      showToast('Falha ao sincronizar relatório de gestão');
    }
  }
}

// Renderiza o Dashboard Completo
function renderDashboard() {
  if (!checklistData) return;
  const { stats, phases, punchIns, timeclock } = checklistData;

  // Atualiza Timestamp de Sincronização
  const syncTimeEl = document.getElementById('syncTime');
  if (syncTimeEl) syncTimeEl.textContent = stats.updatedAt || '--:--:--';

  // Atualiza Status do Turno no Topbar
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  if (statusPill && statusText) {
    statusText.textContent = stats.workdayStatus || 'Turno Ativo';
    statusPill.className = 'status-pill';

    if (stats.timeclock?.exitTime) {
      statusPill.classList.add('completed');
    } else if (stats.timeclock?.lunchInTime) {
      statusPill.classList.add('afternoon');
    } else if (stats.timeclock?.lunchOutTime) {
      statusPill.classList.add('lunch');
    } else {
      statusPill.classList.add('morning');
    }
  }

  // KPIs Executivos
  const kpiProgressVal = document.getElementById('kpiProgressVal');
  const kpiProgressFill = document.getElementById('kpiProgressFill');
  if (kpiProgressVal) kpiProgressVal.textContent = `${stats.completionPercent}%`;
  if (kpiProgressFill) kpiProgressFill.style.width = `${stats.completionPercent}%`;

  const kpiCompletedPhases = document.getElementById('kpiCompletedPhases');
  if (kpiCompletedPhases) kpiCompletedPhases.textContent = stats.completedPhases;

  const kpiPendingPhases = document.getElementById('kpiPendingPhases');
  if (kpiPendingPhases) kpiPendingPhases.textContent = stats.pendingPhases;

  const kpiTasksVal = document.getElementById('kpiTasksVal');
  if (kpiTasksVal) kpiTasksVal.textContent = `${stats.completedTasks} / ${stats.totalTasks}`;

  const activePhaseName = document.getElementById('activePhaseName');
  if (activePhaseName) activePhaseName.textContent = stats.currentActivePhaseTitle;

  // Renderiza os 4 Marcos Diários do Ponto Eletrônico
  renderTimeclockMarks(stats.timeclock);

  // Renderiza a aba ativa
  renderActiveTab();
}

// Renderiza os 4 Marcos do Ponto Eletrônico
function renderTimeclockMarks(timeclock) {
  if (!timeclock) return;

  // 1º Marco: Início do Turno
  const mark1Time = document.getElementById('mark1Time');
  const mark1Badge = document.getElementById('mark1Badge');
  const mark1Card = document.getElementById('mark1Card');
  if (mark1Time) mark1Time.textContent = timeclock.entryTime || '--:--';
  if (timeclock.entryTime && mark1Card) {
    mark1Card.className = 'mark-card confirmed';
    mark1Badge.textContent = 'Confirmado';
    mark1Badge.className = 'mark-badge green';
  }

  // 2º Marco: Pausa para Almoço
  const mark2Time = document.getElementById('mark2Time');
  const mark2Badge = document.getElementById('mark2Badge');
  const mark2Card = document.getElementById('mark2Card');
  if (mark2Time) mark2Time.textContent = timeclock.lunchOutTime || '--:--';
  if (timeclock.lunchOutTime && mark2Card) {
    mark2Card.className = 'mark-card confirmed';
    mark2Badge.textContent = 'Registrado';
    mark2Badge.className = 'mark-badge amber';
  } else if (mark2Card) {
    mark2Card.className = 'mark-card waiting';
    mark2Badge.textContent = 'Aguardando';
    mark2Badge.className = 'mark-badge gray';
  }

  // 3º Marco: Retorno do Almoço
  const mark3Time = document.getElementById('mark3Time');
  const mark3Badge = document.getElementById('mark3Badge');
  const mark3Card = document.getElementById('mark3Card');
  if (mark3Time) mark3Time.textContent = timeclock.lunchInTime || '--:--';
  if (timeclock.lunchInTime && mark3Card) {
    mark3Card.className = 'mark-card confirmed';
    mark3Badge.textContent = 'Registrado';
    mark3Badge.className = 'mark-badge cyan';
  } else if (mark3Card) {
    mark3Card.className = 'mark-card waiting';
    mark3Badge.textContent = 'Aguardando';
    mark3Badge.className = 'mark-badge gray';
  }

  // 4º Marco: Fim de Turno / Saída
  const mark4Time = document.getElementById('mark4Time');
  const mark4Badge = document.getElementById('mark4Badge');
  const mark4Card = document.getElementById('mark4Card');
  if (mark4Time) mark4Time.textContent = timeclock.exitTime || '--:--';
  if (timeclock.exitTime && mark4Card) {
    mark4Card.className = 'mark-card confirmed';
    mark4Badge.textContent = 'Encerrado';
    mark4Badge.className = 'mark-badge purple';
  } else if (mark4Card) {
    mark4Card.className = 'mark-card waiting';
    mark4Badge.textContent = 'Aguardando';
    mark4Badge.className = 'mark-badge gray';
  }
}

// Renderiza a aba atual
function renderActiveTab() {
  const container = document.getElementById('tabContentContainer');
  if (!container || !checklistData) return;

  const toolbar = document.getElementById('phasesToolbar');

  if (currentTab === 'fases') {
    if (toolbar) toolbar.style.display = 'flex';
    renderPhasesList();
  } else {
    if (toolbar) toolbar.style.display = 'none';
    if (currentTab === 'ponto') {
      renderPontoTimeline(container);
    } else if (currentTab === 'roadmap') {
      renderRoadmapList(container);
    } else if (currentTab === 'markdown') {
      renderRawMarkdown(container);
    }
  }
}

// Renderiza Lista de Fases
function renderPhasesList() {
  const container = document.getElementById('tabContentContainer');
  if (!container || !checklistData) return;

  let filtered = checklistData.phases;

  // Filtro de status
  if (currentFilter === 'completed') {
    filtered = filtered.filter(p => p.isCompleted);
  } else if (currentFilter === 'pending') {
    filtered = filtered.filter(p => !p.isCompleted);
  }

  // Filtro de busca
  if (searchQuery) {
    filtered = filtered.filter(p => {
      const matchTitle = p.title.toLowerCase().includes(searchQuery);
      const matchItems = p.items.some(i => i.text.toLowerCase().includes(searchQuery));
      return matchTitle || matchItems;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: #64748B;">
        <p style="font-size: 1.1rem; font-weight: 600;">Nenhuma fase encontrada</p>
        <p style="font-size: 0.8rem; margin-top: 0.5rem;">Tente ajustar os filtros ou termo de busca.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(phase => {
    const isExpanded = !!expandedPhases[phase.id];
    const completedCount = phase.items.filter(i => i.checked).length;
    const totalCount = phase.items.length;
    const isDone = phase.isCompleted;

    return `
      <div class="phase-card ${isDone ? 'completed' : ''}">
        <div class="phase-header" onclick="togglePhase(${phase.id})">
          <div class="phase-title-group">
            <div class="phase-icon ${isDone ? 'completed' : 'pending'}">
              ${isDone ? '✓' : phase.id}
            </div>
            <div>
              <div class="phase-title-text">${phase.title}</div>
              <div class="phase-items-count">${completedCount} de ${totalCount} tarefas concluídas</div>
            </div>
          </div>
          <div style="font-size: 0.8rem; color: #64748B; transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.2s;">
            ▼
          </div>
        </div>
        ${isExpanded ? `
          <div class="phase-body">
            <div class="task-list">
              ${phase.items.map(item => `
                <div>
                  <div class="task-item ${item.checked ? 'checked' : ''}">
                    <div class="checkbox-custom ${item.checked ? 'checked' : ''}">
                      ${item.checked ? '✓' : ''}
                    </div>
                    <span>${item.text}</span>
                  </div>
                  ${item.subitems && item.subitems.length > 0 ? `
                    <div class="subtask-list">
                      ${item.subitems.map(sub => `
                        <div class="subtask-item">${sub}</div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Alternar expansão da fase
window.togglePhase = function(phaseId) {
  expandedPhases[phaseId] = !expandedPhases[phaseId];
  renderPhasesList();
};

// Renderiza Linha do Tempo do Ponto
function renderPontoTimeline(container) {
  const { punchIns } = checklistData;

  container.innerHTML = `
    <div class="timeline-list">
      ${punchIns.map(punch => `
        <div class="timeline-item">
          <div class="timeline-left">
            <div class="timeline-icon-box">
              ${punch.icon}
            </div>
            <div>
              <div class="timeline-desc">${punch.description}</div>
              <div class="timeline-stamp">${punch.timestamp}</div>
            </div>
          </div>
          <div class="mark-badge ${
            punch.type === 'start' ? 'green' :
            punch.type === 'pause' ? 'amber' :
            punch.type === 'resume' ? 'cyan' :
            punch.type === 'end' ? 'purple' : 'gray'
          }">
            ${punch.type.toUpperCase()}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Renderiza Roadmap
function renderRoadmapList(container) {
  const { roadmapItems } = checklistData;

  container.innerHTML = `
    <div class="task-list">
      ${roadmapItems.map(item => `
        <div class="mark-card" style="padding: 1.15rem; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
            <div class="checkbox-custom ${item.checked ? 'checked' : ''}" style="margin-top: 3px;">
              ${item.checked ? '✓' : ''}
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.9rem; color: #fff;">${item.title}</div>
              <div style="font-size: 0.8rem; color: #94A3B8; margin-top: 0.25rem;">${item.description}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Renderiza Markdown Bruto
function renderRawMarkdown(container) {
  container.innerHTML = `
    <div class="markdown-box">${escapeHtml(checklistData.rawMarkdown)}</div>
  `;
}

// Utilitário para escapar HTML
function escapeHtml(string) {
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}

// Toast de Notificação
function showToast(message) {
  const toast = document.getElementById('toastNotice');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}
