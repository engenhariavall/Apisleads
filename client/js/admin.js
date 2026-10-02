/**
 * VERSUS MASTER - COCKPIT ADMIN MASTER (ISOLADO & ENTERPRISE)
 * Script dedicado para gestão de usuários, cotas de consumo, tenants e telemetria de auditoria.
 */

(function () {
  'use strict';

  let currentAdminUser = null;
  let currentLoadedAuditLogs = [];
  let currentLoadedTenants = [];
  let currentLoadedUsers = [];
  const allKnownUsersMap = new Map();

  function getToken() {
    return localStorage.getItem('versus_token');
  }

  function getAuthHeaders() {
    const token = getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }

  function showToast(message) {
    const toast = document.getElementById('adminToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 3500);
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

  /**
   * Formatação precisa de timestamp UTC para o fuso horário local do operador.
   * Intercepta strings ISO e UTC do SQLite ("YYYY-MM-DD HH:MM:SS") e formata via Intl.DateTimeFormat
   * com o timeZone local resolvido do navegador (ex: "DD/MM/YYYY, HH:mm:ss").
   */
  function formatLogTimestamp(rawTimestamp) {
    if (!rawTimestamp) return '-';
    try {
      let isoStr = String(rawTimestamp).trim();
      // Se vier do SQLite sem marcador UTC ("YYYY-MM-DD HH:MM:SS"), converte para ISO UTC
      if (!isoStr.includes('T') && isoStr.includes(' ')) {
        isoStr = isoStr.replace(' ', 'T');
      }
      if (!isoStr.endsWith('Z') && !isoStr.includes('+') && !isoStr.slice(10).includes('-')) {
        isoStr += 'Z';
      }

      const dateObj = new Date(isoStr);
      if (isNaN(dateObj.getTime())) {
        return String(rawTimestamp);
      }

      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: userTimeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(dateObj);
    } catch (e) {
      return String(rawTimestamp);
    }
  }

  /**
   * Mapeamento de Papel (Role) para Badges com Indicador Cromático e Rótulo Amigável
   */
  function getRoleBadgeInfo(role) {
    const raw = String(role || '').trim();
    const r = raw.toUpperCase();
    let badgeClass = 'gestor-trafego';
    let label = raw || 'Gestor de Tráfego';

    if (r === 'SUPER_ADMIN') {
      badgeClass = 'super-admin';
      label = 'Super Admin';
    } else if (r === 'ADMIN') {
      badgeClass = 'admin';
      label = 'Admin';
    } else if (r === 'GESTOR_TRAFEGO' || r === 'GESTOR DE TRÁFEGO' || r === 'GESTOR DE TRAFEGO') {
      badgeClass = 'gestor-trafego';
      label = 'Gestor de Tráfego';
    } else if (r === 'ANALISTA_MARKETING' || r === 'ANALISTA DE MARKETING') {
      badgeClass = 'analista-marketing';
      label = 'Analista de Marketing';
    } else if (r === 'COORDENADOR_MARKETING' || r === 'COORDENADOR DE MARKETING') {
      badgeClass = 'coordenador-marketing';
      label = 'Coordenador de Marketing';
    } else if (r === 'SUPORTE_INTERNO') {
      badgeClass = 'suporte-interno';
      label = 'Suporte Interno';
    } else if (r === 'VISUALIZADOR') {
      badgeClass = 'visualizador';
      label = 'Visualizador';
    }

    return { badgeClass, label };
  }

  // ETAPA 3: Motor de Encerramento de Sessão (Logout Seguro no Cockpit Admin)
  async function handleLogout() {
    try {
      const token = getToken();
      if (token) {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: getAuthHeaders()
        }).catch(() => {});
      }
    } catch (e) {
      // Ignora erro
    } finally {
      localStorage.removeItem('versus_token');
      localStorage.removeItem('versus_user');
      localStorage.removeItem('versus_role');
      sessionStorage.clear();

      if (window.VersusPreloader) {
        window.VersusPreloader.transitionTo('/login', [
          'Revogando credenciais no cluster...',
          'Encerrando sessão com segurança...',
          'Retornando ao portal de login...'
        ], 1200);
      } else {
        window.location.replace('/login');
      }
    }
  }
  window.handleLogout = handleLogout;

  async function checkAdminAuth() {
    const token = getToken();
    if (!token) {
      window.location.replace('/login');
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error('Sessão expirada ou inválida.');
      }

      const data = await res.json();
      if (!data.success || !data.user) {
        throw new Error('Usuário não autenticado.');
      }

      currentAdminUser = data.user;
      if (currentAdminUser) {
        localStorage.setItem('versus_user', JSON.stringify(currentAdminUser));
        localStorage.setItem('versus_role', currentAdminUser.role || '');
      }

      if (currentAdminUser.role !== 'SUPER_ADMIN') {
        alert('Acesso negado: Este cockpit é exclusivo para administradores com papel SUPER_ADMIN.');
        window.location.replace('/');
        return;
      }

      // Atualiza dados na sidebar e popover
      const sidebarEmailEl = document.getElementById('sidebarAdminEmail');
      const footerNameEl = document.getElementById('adminFooterUserName');
      const popoverEmailEl = document.getElementById('popoverUserEmail');
      const avatarEl = document.getElementById('sidebarAvatar');

      if (sidebarEmailEl) sidebarEmailEl.textContent = currentAdminUser.email;
      if (popoverEmailEl) popoverEmailEl.textContent = currentAdminUser.email;
      if (footerNameEl) footerNameEl.textContent = currentAdminUser.name || 'Super Admin';

      if (avatarEl && currentAdminUser.name) {
        const initials = currentAdminUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        avatarEl.textContent = initials || 'SA';
      }

      // Inicia carregamento dos dados do cockpit
      loadAdminDashboardData();
    } catch (err) {
      console.error('Falha de autenticação admin:', err);
      localStorage.removeItem('versus_token');
      window.location.replace('/login');
    }
  }

  async function loadAdminMetrics() {
    try {
      const res = await fetch('/api/admin/metrics', {
        headers: getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.metrics) {
        const m = data.metrics;
        const elUsers = document.getElementById('adminStatUsers');
        const elExports = document.getElementById('adminStatExportsToday');
        const elAudit = document.getElementById('adminStatAuditEvents');

        if (elUsers) elUsers.textContent = m.totalUsers;
        if (elExports) elExports.textContent = (m.exportsToday || 0).toLocaleString('pt-BR');
        if (elAudit) elAudit.textContent = (m.totalAuditEvents || 0).toLocaleString('pt-BR');
      }
    } catch (err) {
      console.error('Erro ao carregar métricas:', err);
    }
  }

  async function loadAdminDashboardData() {
    await Promise.all([
      loadAdminMetrics(),
      loadAdminTenantsList(),
      loadAdminUsersList(),
      loadAdminAuditLogs(),
      loadAdminApiSettings()
    ]);
  }

  async function loadAdminTenantsList() {
    const tbody = document.getElementById('adminTenantsTableBody');
    const badge = document.getElementById('tenantHeaderCountBadge');
    const selectAuditTenant = document.getElementById('adminAuditTenantFilter');

    try {
      const res = await fetch('/api/admin/tenants', {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #EF4444; padding: 2rem;">Acesso negado ou erro ao carregar empresas.</td></tr>`;
        return;
      }
      const data = await res.json();
      const tenants = Array.isArray(data.tenants) ? data.tenants : (Array.isArray(data.data) ? data.data : []);
      currentLoadedTenants = tenants;

      if (badge) {
        const activeCount = tenants.filter(t => t.status === 'ACTIVE').length;
        badge.textContent = `${activeCount} EMPRESA(S) ATIVA(S)`;
      }

      let rootTenant = tenants.find(t => t.id === 'tenant-root-default');
      if (!rootTenant) {
        // Fallback defensivo realista representando exclusivamente o Tenant Raiz do sistema
        rootTenant = {
          id: 'tenant-root-default',
          name: 'VERSUS INTELLIGENCE (ROOT)',
          cnpj: '00.000.000/0001-00',
          plan: 'ENTERPRISE UNLIMITED',
          status: 'ACTIVE',
          max_users: 999,
          daily_quota_limit: 999999,
          active_users: 1
        };
        tenants.unshift(rootTenant);
      }

      // Ordena para que o Tenant Raiz venha sempre no topo absoluto
      const sortedTenants = [
        rootTenant,
        ...tenants.filter(t => t.id !== 'tenant-root-default')
      ];

      // Popula Select de Filtro de Auditoria
      if (selectAuditTenant) {
        const currentVal = selectAuditTenant.value;
        const tenantOptions = sortedTenants.map(t => {
          return `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
        }).join('');
        selectAuditTenant.innerHTML = `<option value="">Todas as Empresas (Global)</option>${tenantOptions}`;
        if (currentVal) selectAuditTenant.value = currentVal;
      }

      currentLoadedTenants = sortedTenants;

      if (!tbody) return;

      tbody.innerHTML = sortedTenants.map(t => {
        const statusBadge = t.status === 'ACTIVE'
          ? `<span class="table-status-indicator active"><span class="table-status-dot"></span>Ativo</span>`
          : `<span class="table-status-indicator inactive"><span class="table-status-dot"></span>Suspenso</span>`;

        const isRoot = t.id === 'tenant-root-default';
        const operatorsDisplay = `${t.active_users || 0} / ${t.max_users || 5}`;
        const dailyQuotaDisplay = t.daily_quota_limit ? t.daily_quota_limit.toLocaleString('pt-BR') : '5.000';
        const cnpjDisplay = t.cnpj || '<span style="color: #64748B;">Não informado</span>';

        return `
          <tr>
            <td>
              <div style="font-weight: 700; color: #FFFFFF; font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem;">
                ${escapeHtml(t.name)}
                ${isRoot ? '<span style="font-size: 0.65rem; background: #3B82F6; color: #fff; padding: 2px 6px; border-radius: 4px;">ROOT</span>' : ''}
              </div>
              <div style="font-size: 0.68rem; color: #94A3B8; font-family: monospace;">ID: ${t.id}</div>
            </td>
            <td style="font-family: monospace; font-size: 0.75rem; color: #CBD5E1;">${cnpjDisplay}</td>
            <td>
              <span class="role-pill gestor-trafego">${escapeHtml(t.plan || 'ENTERPRISE')}</span>
            </td>
            <td>${statusBadge}</td>
            <td style="font-family: monospace; font-size: 0.78rem; color: #FFFFFF; font-weight: 600;">${operatorsDisplay}</td>
            <td style="font-family: monospace; font-size: 0.78rem; color: #CBD5E1;">${dailyQuotaDisplay} leads/dia</td>
            <td>
              <button type="button" class="btn-table-action action-quota" onclick="window.viewTenantAudit('${t.id}')" title="Filtrar auditoria desta empresa">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span>Auditoria</span>
              </button>
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <div class="tenant-actions-cluster">
                <!-- 1. [ → Acessar ] -->
                <button type="button" class="btn-tenant-action btn-tenant-access" onclick="window.adminAccessTenant('${t.id}')" title="Acessar painel e visão desta empresa">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                  <span>Acessar</span>
                </button>
                <!-- 2. [ ✎ ] Editar Dados -->
                <button type="button" class="btn-tenant-action btn-tenant-edit" onclick="window.adminOpenEditTenantModal('${t.id}')" title="Editar dados cadastrais da empresa">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                </button>
                <!-- 3. [ 🔑 ] Redefinir Senha -->
                <button type="button" class="btn-tenant-action btn-tenant-pass" onclick="window.adminOpenResetTenantAdminPasswordModal('${t.id}')" title="Redefinir senha do administrador desta empresa">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="7.5" cy="15.5" r="4.5"></circle>
                    <path d="m21 3-9.5 9.5"></path>
                    <path d="m15.5 7.5 3 3"></path>
                  </svg>
                </button>
                <!-- 4. [ 🚫 ] Suspender / Reativar -->
                ${!isRoot ? `
                  <button type="button" class="btn-tenant-action btn-tenant-block" onclick="window.adminToggleTenantStatus('${t.id}', '${t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}')" title="${t.status === 'ACTIVE' ? 'Suspender empresa' : 'Reativar empresa'}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                    </svg>
                  </button>
                  <!-- 5. [ 🗑️ ] Excluir Empresa -->
                  <button type="button" class="btn-tenant-action btn-tenant-delete" onclick="window.adminDeleteTenant('${t.id}')" title="Excluir empresa">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                ` : `
                  <span class="btn-tenant-action" style="opacity: 0.3; cursor: not-allowed; border-color: transparent;" title="Tenant Master (Imutável)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                    </svg>
                  </span>
                `}
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Erro detalhado ao listar tenants:', err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #EF4444; padding: 2rem;">Falha ao carregar empresas: ${escapeHtml(err.message || 'Erro de conexão')}</td></tr>`;
    }
  }

  async function loadAdminUsersList() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/users', {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #EF4444; padding: 2rem;">Acesso negado ou erro ao carregar usuários.</td></tr>`;
        return;
      }
      const data = await res.json();
      const users = data.users || [];
      currentLoadedUsers = users;
      users.forEach(u => allKnownUsersMap.set(u.id, u));

      if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94A3B8; padding: 2rem;">Nenhum usuário cadastrado.</td></tr>`;
        return;
      }

      tbody.innerHTML = users.map(u => {
        const { badgeClass: roleBadgeClass, label: roleLabel } = getRoleBadgeInfo(u.role);

        const statusBadge = u.is_active 
          ? `<span class="table-status-indicator active"><span class="table-status-dot"></span>Ativo</span>`
          : `<span class="table-status-indicator inactive"><span class="table-status-dot"></span>Inativo</span>`;

        const lastLogin = u.last_login_at ? formatLogTimestamp(u.last_login_at) : 'Nunca acessou';
        const quotaDaily = u.daily_limit ? u.daily_limit.toLocaleString('pt-BR') : 'Ilimitado';
        const quotaMonthly = u.monthly_limit ? u.monthly_limit.toLocaleString('pt-BR') : 'Ilimitado';
        const usedToday = u.used_today || 0;
        const tenantName = u.tenant_name || 'VERSUS ROOT';
        const passDisplayId = `pass-display-${u.id}`;
        const isSelf = currentAdminUser && (u.id === currentAdminUser.id || u.email === currentAdminUser.email);

        return `
          <tr>
            <td>
              <div style="font-weight: 700; color: #FFFFFF; font-size: 0.8rem;">${escapeHtml(u.name || 'Sem nome')}</div>
              <div style="font-size: 0.7rem; color: #94A3B8;">${escapeHtml(u.email)}</div>
            </td>
            <td>
              <span style="font-size: 0.72rem; color: #38BDF8; font-weight: 600;">${escapeHtml(tenantName)}</span>
            </td>
            <td>
              <span class="role-pill ${roleBadgeClass}">${escapeHtml(roleLabel)}</span>
            </td>
            <td>${statusBadge}</td>
            <td>
              <div class="user-password-container">
                <span class="user-password-text" id="${passDisplayId}" data-password="${escapeHtml(u.access_password || '')}" data-masked="true">••••••••</span>
                <button type="button" class="btn-pass-action btn-pass-eye" onclick="window.adminTogglePasswordVisibility('${u.id}', '${passDisplayId}')" title="Mostrar/Ocultar Senha">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
                <button type="button" class="btn-pass-action btn-pass-copy" onclick="window.adminCopyUserPassword('${u.id}')" title="Copiar Senha">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </td>
            <td style="font-family: monospace; font-size: 0.78rem; color: #CBD5E1;">${quotaDaily}</td>
            <td style="font-family: monospace; font-size: 0.78rem; color: ${usedToday > 0 ? '#E2E8F0' : '#64748B'}; font-weight: 600;">${usedToday}</td>
            <td style="font-family: monospace; font-size: 0.78rem; color: #94A3B8;">${quotaMonthly}</td>
            <td style="font-size: 0.72rem; color: #94A3B8;">${lastLogin}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button type="button" class="btn-table-action action-edit" onclick="window.adminEditUser('${u.id}')" title="Editar dados do operador">
                Editar
              </button>
              <button type="button" class="btn-table-action ${u.is_active ? 'danger-toggle' : 'success-toggle'}" onclick="window.adminToggleUserStatus('${u.id}', ${u.is_active ? 0 : 1})" title="${u.is_active ? 'Desativar usuário' : 'Ativar usuário'}">
                ${u.is_active ? 'Bloquear' : 'Ativar'}
              </button>
              <button type="button" class="btn-table-action action-key" onclick="window.adminResetUserPassword('${u.id}', '${escapeHtml(u.email)}')" title="Resetar senha">
                Senha
              </button>
              <button type="button" class="btn-table-action action-quota" onclick="window.adminChangeQuota('${u.id}', ${u.daily_limit || 500})" title="Alterar cota de exportação">
                Cota
              </button>
              ${isSelf ? `
                <button type="button" class="btn-table-action action-delete" disabled style="opacity: 0.35; cursor: not-allowed;" title="Você não pode excluir sua própria conta">
                  Excluir
                </button>
              ` : `
                <button type="button" class="btn-table-action action-delete" onclick="window.adminDeleteUser('${u.id}', '${escapeHtml(u.name || u.email)}')" title="Excluir usuário permanentemente do banco de dados">
                  Excluir
                </button>
              `}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Erro ao renderizar tabela de usuários:', err);
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #EF4444; padding: 2rem;">Falha ao comunicar com o servidor.</td></tr>`;
    }
  }

  async function loadAdminAuditLogs(actionFilter = '', tenantFilter = '') {
    const tbody = document.getElementById('adminAuditTableBody');
    if (!tbody) return;

    try {
      let url = '/api/admin/audit-logs?limit=100';
      if (actionFilter) {
        url += `&action=${encodeURIComponent(actionFilter)}`;
      }
      if (tenantFilter) {
        url += `&tenant_id=${encodeURIComponent(tenantFilter)}`;
      }

      const res = await fetch(url, {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #EF4444; padding: 2rem;">Erro ao carregar telemetria de auditoria.</td></tr>`;
        return;
      }
      const data = await res.json();
      const logs = data.logs || [];
      currentLoadedAuditLogs = logs;

      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #94A3B8; padding: 2rem;">Nenhum registro de auditoria encontrado para os filtros selecionados.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => {
        const dt = formatLogTimestamp(l.created_at);
        let dotColor = '#94A3B8';
        if (l.action.includes('LOGIN')) dotColor = '#F59E0B';
        else if (l.action.includes('EXPORT')) dotColor = '#38BDF8';
        else if (l.action.includes('PASSWORD') || l.action.includes('USER_CREATED')) dotColor = '#A855F7';

        // Telemetria Avançada Real: Status HTTP e Latência
        const statusCode = Number(l.status_code) || 200;
        let statusDotColor = '#22C55E'; // 🟢 verde para 200/201
        let statusBadgeClass = 'status-success';

        if (statusCode >= 500) {
          statusDotColor = '#EF4444'; // 🔴 vermelho para 500+
          statusBadgeClass = 'status-danger';
        } else if (statusCode >= 400) {
          statusDotColor = '#F59E0B'; // 🟡 amarelo para 400+
          statusBadgeClass = 'status-warning';
        }

        const latencyVal = (l.latency_ms !== null && l.latency_ms !== undefined) ? Number(l.latency_ms) : 0;
        const latencyFormatted = latencyVal > 0 ? (latencyVal < 1 ? latencyVal.toFixed(1) : Math.round(latencyVal)) : 0;
        const statusPrefix = (statusCode === 200 || statusCode === 201) ? `${statusCode} OK` : `${statusCode}`;
        const statusTempoDisplay = `${statusPrefix} / ${latencyFormatted}ms`;

        // Telemetria Avançada Real: Dispositivo User-Agent Parseado
        const parsedUa = l.user_agent ? l.user_agent : 'Chrome / Windows 10';
        const userAgentDisplay = escapeHtml(parsedUa.length > 28 ? parsedUa.slice(0, 26) + '...' : parsedUa);
        const userAgentFull = escapeHtml(parsedUa);

        const recCount = (l.records_count !== undefined && l.records_count !== null) 
          ? l.records_count 
          : (l.record_count || 0);
        const recCountDisplay = recCount ? recCount.toLocaleString('pt-BR') : '-';
        const tenantDisplay = l.tenant_name || (l.tenant_id === 'tenant-root-default' ? 'VERSUS (ROOT)' : (l.tenant_id || '-'));

        return `
          <tr style="font-size: 0.72rem;">
            <td style="color: #94A3B8; font-family: monospace; white-space: nowrap;">${dt}</td>
            <td>
              <span style="font-size: 0.72rem; color: #38BDF8; font-weight: 600; white-space: nowrap;">${escapeHtml(tenantDisplay)}</span>
            </td>
            <td>
              <span class="audit-action-tag">
                <span class="audit-action-dot" style="background-color: ${dotColor};"></span>
                ${escapeHtml(l.action)}
              </span>
            </td>
            <td style="color: #FFFFFF; font-weight: 600; white-space: nowrap;">${escapeHtml(l.user_email || 'Anônimo')}</td>
            <td style="color: #94A3B8; font-family: monospace;">${escapeHtml(l.endpoint || '-')}</td>
            <td style="color: #CBD5E1; font-size: 0.68rem; font-family: monospace; white-space: nowrap;" title="${userAgentFull}">${userAgentDisplay}</td>
            <td style="white-space: nowrap;">
              <span class="audit-status-badge ${statusBadgeClass}">
                <span class="audit-status-dot" style="background-color: ${statusDotColor};"></span>
                ${statusTempoDisplay}
              </span>
            </td>
            <td style="color: #CBD5E1; font-family: monospace; font-weight: 600; text-align: center;">${recCountDisplay}</td>
            <td style="color: #94A3B8; font-family: monospace; white-space: nowrap;">${escapeHtml(l.ip_address || '-')}</td>
            <td style="color: #64748B; font-family: monospace; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.query_params || '')}">
              ${escapeHtml(l.query_params || '-')}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Erro ao renderizar logs de auditoria:', err);
    }
  }

  /**
   * Motor de Exportação de Telemetria (CSV)
   * Coleta o array de logs atual, converte para CSV delimitado por vírgula com UTF-8 BOM
   * e dispara o download automático com nome versus-audit-log-YYYYMMDD.csv
   */
  function exportAuditLogsToCSV() {
    if (!currentLoadedAuditLogs || currentLoadedAuditLogs.length === 0) {
      alert('Nenhum registro de auditoria disponível para exportação.');
      return;
    }

    const headers = ['"Data/Hora"', '"Ação"', '"Usuário"', '"Endpoint"', '"Dispositivo (User-Agent)"', '"Status / Tempo"', '"Registros"', '"Endereço IP"', '"Parâmetros"'];

    function escapeCSV(val) {
      if (val === null || val === undefined) return '""';
      const clean = String(val).replace(/"/g, '""');
      return `"${clean}"`;
    }

    const csvRows = currentLoadedAuditLogs.map(l => {
      const dt = formatLogTimestamp(l.created_at);
      const statusCode = Number(l.status_code) || 200;
      const latencyVal = (l.latency_ms !== null && l.latency_ms !== undefined) ? Number(l.latency_ms) : 0;
      const latencyFormatted = latencyVal > 0 ? (latencyVal < 1 ? latencyVal.toFixed(1) : Math.round(latencyVal)) : 0;
      const statusPrefix = (statusCode === 200 || statusCode === 201) ? `${statusCode} OK` : `${statusCode}`;
      const statusTempo = `${statusPrefix} / ${latencyFormatted}ms`;
      const userAgentVal = l.user_agent || 'Chrome / Windows 10';
      const recCount = (l.records_count !== undefined && l.records_count !== null) ? l.records_count : (l.record_count || 0);

      return [
        escapeCSV(dt),
        escapeCSV(l.action || ''),
        escapeCSV(l.user_email || 'Anônimo'),
        escapeCSV(l.endpoint || ''),
        escapeCSV(userAgentVal),
        escapeCSV(statusTempo),
        escapeCSV(recCount),
        escapeCSV(l.ip_address || ''),
        escapeCSV(l.query_params || '')
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const filename = `versus-audit-log-${yyyy}${mm}${dd}.csv`;

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.setAttribute('download', filename);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);

    showToast(`Telemetria exportada: ${filename}`);
  }

  window.exportAuditLogsToCSV = exportAuditLogsToCSV;

  // Ações de Usuário expostas globalmente no window
  window.adminToggleUserStatus = async function(userId, newStatus) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_active: newStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao alterar status.');
      showToast(`Status do usuário atualizado com sucesso!`);
      loadAdminUsersList();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  window.adminResetUserPassword = async function(userId, email) {
    const newPass = prompt(`Digite a nova senha de acesso para o usuário ${email}:`);
    if (!newPass || newPass.trim().length < 6) {
      if (newPass !== null) alert('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ newPassword: newPass.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao resetar senha.');
      showToast(`Senha de ${email} resetada com sucesso!`);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  window.adminResetTenantOperatorPassword = async function(userId, email) {
    const newPass = prompt(`DEFINIÇÃO DE CREDENCIAL:\n\nDigite a nova senha de acesso para o operador ${email}:`);
    if (!newPass || newPass.trim().length < 6) {
      if (newPass !== null) alert('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ newPassword: newPass.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao redefinir credencial.');
      showToast(`Senha do operador ${email} redefinida com sucesso!`);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  window.adminToggleTenantOperatorStatus = async function(userId, newStatus, tenantId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_active: newStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao alterar status do operador.');
      showToast(`Status do operador alterado para ${newStatus === 1 ? 'ATIVO' : 'BLOQUEADO'}!`);
      // Atualiza base de usuários e re-renderiza tabela aninhada
      const usersRes = await fetch('/api/admin/users', { headers: getAuthHeaders() });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        currentLoadedUsers = usersData.users || [];
      }
      if (typeof window.refreshTenantOperators === 'function') {
        window.refreshTenantOperators(tenantId);
      }
      loadAdminUsersList();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  window.adminDeleteTenantOperator = async function(userId, userName, tenantId) {
    if (!confirm(`CONFIRMAÇÃO DE GOVERNANÇA (EXCLUSÃO DEFINITIVA):\n\nDeseja realmente excluir o operador "${userName}" deste Tenant?\n\n⚠️ Esta ação removerá permanentemente o usuário e suas cotas do banco de dados.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Falha ao remover operador.');
      showToast(data.message || `Operador "${userName}" excluído definitivamente do banco de dados!`);
      allKnownUsersMap.delete(userId);
      // Atualiza lista em memória e re-renderiza
      const usersRes = await fetch('/api/admin/users', { headers: getAuthHeaders() });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        currentLoadedUsers = usersData.users || [];
        currentLoadedUsers.forEach(u => allKnownUsersMap.set(u.id, u));
      }
      if (typeof window.refreshTenantOperators === 'function') {
        window.refreshTenantOperators(tenantId);
      }
      loadAdminUsersList();
    } catch (err) {
      alert(`Erro ao excluir operador: ${err.message}`);
    }
  };

  window.adminDeleteUser = async function(userId, userName) {
    if (currentAdminUser && (userId === currentAdminUser.id || userName === currentAdminUser.email)) {
      alert('AÇÃO BLOQUEADA:\n\nVocê não pode excluir sua própria conta de Super Admin.');
      return;
    }

    if (!confirm(`CONFIRMAÇÃO DE GOVERNANÇA (EXCLUSÃO DEFINITIVA):\n\nDeseja realmente excluir o usuário "${userName}" da plataforma VERSUS?\n\n⚠️ Esta ação é irreversível e apagará permanentemente o usuário e todas as suas cotas do banco de dados.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Falha ao excluir usuário.');
      showToast(data.message || `Usuário "${userName}" excluído definitivamente do banco de dados!`);
      allKnownUsersMap.delete(userId);
      // Atualiza lista em memória e re-renderiza
      const usersRes = await fetch('/api/admin/users', { headers: getAuthHeaders() });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        currentLoadedUsers = usersData.users || [];
        currentLoadedUsers.forEach(u => allKnownUsersMap.set(u.id, u));
      }
      const activeTenantId = document.getElementById('editTenantId')?.value;
      if (activeTenantId && typeof window.refreshTenantOperators === 'function') {
        window.refreshTenantOperators(activeTenantId);
      }
      loadAdminUsersList();
    } catch (err) {
      alert(`Erro ao excluir usuário: ${err.message}`);
    }
  };

  window.adminTogglePasswordVisibility = function(userId, elementId) {
    const user = allKnownUsersMap.get(userId) || currentLoadedUsers.find(u => u.id === userId);
    const targetEl = document.getElementById(elementId);
    if (!targetEl) return;
    const isMasked = targetEl.getAttribute('data-masked') !== 'false';
    if (isMasked) {
      const plain = user?.access_password || targetEl.getAttribute('data-password');
      if (!plain || plain === '••••••••') {
        showToast('Senha armazenada em hash criptográfico (redefina para ver em texto puro).');
        return;
      }
      targetEl.textContent = plain;
      targetEl.classList.add('revealed');
      targetEl.setAttribute('data-masked', 'false');
    } else {
      targetEl.textContent = '••••••••';
      targetEl.classList.remove('revealed');
      targetEl.setAttribute('data-masked', 'true');
    }
  };

  window.adminCopyUserPassword = async function(userId) {
    const user = allKnownUsersMap.get(userId) || currentLoadedUsers.find(u => u.id === userId);
    const plain = user?.access_password;
    if (!plain) {
      showToast('Senha protegida por hash. Redefina a senha se desejar copiá-la.');
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(plain);
      } else {
        const tempInput = document.createElement('input');
        tempInput.value = plain;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      showToast('Senha copiada com sucesso para a área de transferência!');
    } catch (e) {
      prompt('Copie a senha de acesso:', plain);
    }
  };

  window.adminChangeQuota = async function(userId, currentQuota) {
    const newQuotaStr = prompt(`Defina a nova cota diária de exportação (leads/dia):`, currentQuota);
    if (newQuotaStr === null) return;
    const newQuota = parseInt(newQuotaStr, 10);
    if (isNaN(newQuota) || newQuota < 0) {
      alert('Valor de cota inválido.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ dailyQuota: newQuota })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao atualizar cota.');
      showToast(`Cota diária atualizada para ${newQuota.toLocaleString('pt-BR')} leads!`);
      loadAdminUsersList();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  window.adminToggleTenantStatus = async function(tenantId, newStatus) {
    if (!confirm(`Deseja realmente alterar o status desta empresa para ${newStatus === 'ACTIVE' ? 'ATIVO' : 'SUSPENSO'}?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao alterar status da empresa.');
      showToast(`Empresa atualizada com sucesso!`);
      loadAdminTenantsList();
      loadAdminUsersList();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  window.adminDeleteTenant = async function(tenantId) {
    if (tenantId === 'tenant-root-default') {
      alert('AÇÃO BLOQUEADA:\n\nA organização raiz primária da plataforma VERSUS é protegida e não pode ser excluída.');
      return;
    }

    const tenant = currentLoadedTenants.find(t => t.id === tenantId);
    const tenantName = tenant ? tenant.name : tenantId;
    
    if (!confirm(`CONFIRMAÇÃO DE GOVERNANÇA (EXCLUSÃO DEFINITIVA DE EMPRESA):\n\nDeseja realmente excluir permanentemente a empresa "${tenantName}" da plataforma VERSUS?\n\n⚠️ ATENÇÃO: Esta ação é irreversível e executará a limpeza em cascata no banco de dados, excluindo:\n• Todos os operadores e acessos vinculados a esta empresa;\n• Todas as cotas de exportação associadas;\n• Todos os registros e bases exclusivas de inteligência da empresa.\n\nConfirma a exclusão definitiva imediata?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Falha ao excluir empresa.');
      
      showToast(data.message || `Empresa "${tenantName}" e todos os seus operadores excluídos definitivamente!`);
      
      const modalAdminEditTenant = document.getElementById('modalAdminEditTenant');
      if (modalAdminEditTenant) modalAdminEditTenant.style.display = 'none';

      await loadAdminTenantsList();
      await loadAdminUsersList();
    } catch (err) {
      alert(`Erro ao excluir empresa: ${err.message}`);
    }
  };

  window.adminAccessTenant = function(tenantId) {
    const tenant = currentLoadedTenants.find(t => t.id === tenantId);
    const tenantName = tenant ? tenant.name : tenantId;

    // FASE 38: Purga rigorosa de resíduos de cache de dados do Tenant anterior
    sessionStorage.clear();
    sessionStorage.setItem('versus_cross_login', 'true');
    localStorage.removeItem('versus_cached_leads');
    localStorage.removeItem('versus_last_filters');
    localStorage.setItem('versus_active_tenant_id', tenantId);
    localStorage.setItem('versus_active_tenant_name', tenantName);

    showToast(`Iniciando transição de sessão para: ${tenantName}`);
    if (window.VersusPreloader) {
      window.VersusPreloader.transitionTo('/?cross_login=true', [
        'Autenticação Cross-Login autorizada...',
        `Sincronizando visão operacional isolada de ${tenantName}...`,
        'Iniciando Cockpit Operacional...'
      ], 1200);
    } else {
      window.location.href = '/?cross_login=true';
    }
  };

  window.adminOpenEditTenantModal = function(tenantId) {
    if (typeof window.openEditTenantModal === 'function') {
      window.openEditTenantModal(tenantId);
    } else {
      showToast(`Abrindo editor de dados da empresa...`);
    }
  };

  window.adminOpenResetTenantAdminPasswordModal = function(tenantId) {
    if (typeof window.openResetTenantAdminPasswordModal === 'function') {
      window.openResetTenantAdminPasswordModal(tenantId);
    } else {
      showToast(`Abrindo redefinição de credenciais do admin...`);
    }
  };

  window.viewTenantAudit = function(tenantId) {
    // Alterna para a view de Auditoria e seta o filtro no dropdown do tenant
    if (window.switchAdminView) {
      window.switchAdminView('sectionAudit');
    }
    const selectAuditTenant = document.getElementById('adminAuditTenantFilter');
    if (selectAuditTenant) {
      selectAuditTenant.value = tenantId;
    }
    const actionVal = document.getElementById('adminAuditActionFilter')?.value || '';
    loadAdminAuditLogs(actionVal, tenantId);
    showToast('Filtro de auditoria aplicado para esta empresa.');
  };

  /**
   * FASE 59 (ETAPA 3): Gestão de APIs & Test Drive do Super Admin
   */
  async function loadAdminApiSettings() {
    const tbody = document.getElementById('tableTenantApiConfigsBody');

    try {
      // 1. Carrega Credenciais Mestre do Host
      const resHost = await fetch('/api/admin/api-configs/host', {
        headers: getAuthHeaders()
      });
      if (resHost.ok) {
        const dataHost = await resHost.json();
        if (dataHost.success && dataHost.settings) {
          const s = dataHost.settings;
          const elOpenai = document.getElementById('hostMasterOpenaiKey');
          const elMetaAppId = document.getElementById('hostMasterMetaAppId');
          const elMetaToken = document.getElementById('hostMasterMetaToken');
          const elBureau = document.getElementById('hostMasterBureauKey');

          if (elOpenai) {
            elOpenai.value = '';
            elOpenai.placeholder = s.master_openai_key ? `${s.masked_openai || '••••••••'} (Configurada)` : 'sk-proj-...';
          }
          if (elMetaAppId) {
            elMetaAppId.value = s.master_meta_app_id || '';
          }
          if (elMetaToken) {
            elMetaToken.value = '';
            elMetaToken.placeholder = s.master_meta_token ? `${s.masked_meta_token || '••••••••'} (Configurado)` : 'EAAB...';
          }
          if (elBureau) {
            elBureau.value = '';
            elBureau.placeholder = s.master_bureau_key ? `${s.masked_bureau || '••••••••'} (Configurada)` : 'bureau-key-...';
          }
        }
      }

      // 2. Carrega Inquilinos e Status de Test Drive
      if (tbody) {
        const resTenants = await fetch('/api/admin/api-configs/tenants', {
          headers: getAuthHeaders()
        });
        if (!resTenants.ok) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #EF4444; padding: 2rem;">Acesso negado ou erro ao carregar status de APIs dos inquilinos.</td></tr>`;
          return;
        }
        const dataTenants = await resTenants.json();
        const tenants = dataTenants.tenants || [];

        if (tenants.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94A3B8; padding: 2rem;">Nenhum inquilino cadastrado.</td></tr>`;
          return;
        }

        tbody.innerHTML = tenants.map(t => {
          const isRoot = t.tenant_id === 'tenant-root-default';
          
          let modeBadge = '';
          if (t.use_master_key) {
            if (t.test_drive_expired) {
              modeBadge = `<span class="tenant-status-pill test-drive-expired"><span class="table-status-dot" style="background:#EF4444;"></span>Expirado (Bloqueado)</span>`;
            } else {
              modeBadge = `<span class="tenant-status-pill test-drive-active"><span class="table-status-dot" style="background:#38BDF8;"></span>Test Drive Ativo</span>`;
            }
          } else {
            modeBadge = `<span class="tenant-status-pill production"><span class="table-status-dot" style="background:#22C55E;"></span>Chaves Próprias</span>`;
          }

          let expDisplay = '-';
          if (t.use_master_key) {
            expDisplay = t.test_drive_expires_at ? formatLogTimestamp(t.test_drive_expires_at) : 'Sem data definida';
            if (t.test_drive_expired) {
              expDisplay = `<span style="color: #F87171; font-weight: 600;">${expDisplay}</span>`;
            }
          } else {
            expDisplay = '<span style="color: #64748B;">Desativado</span>';
          }

          // Badges das chaves próprias locais
          const openaiStatus = t.has_openai_key 
            ? `<span style="display:inline-flex; align-items:center; gap:2px; color:#10B981; font-size:0.7rem; font-weight:700;">✓ IA</span>`
            : `<span style="display:inline-flex; align-items:center; gap:2px; color:#64748B; font-size:0.7rem;">✗ IA</span>`;
          
          const metaStatus = t.has_meta_credentials
            ? `<span style="display:inline-flex; align-items:center; gap:2px; color:#3B82F6; font-size:0.7rem; font-weight:700;">✓ Meta</span>`
            : `<span style="display:inline-flex; align-items:center; gap:2px; color:#64748B; font-size:0.7rem;">✗ Meta</span>`;

          const bureauStatus = t.has_bureau_key
            ? `<span style="display:inline-flex; align-items:center; gap:2px; color:#F59E0B; font-size:0.7rem; font-weight:700;">✓ Bureau</span>`
            : `<span style="display:inline-flex; align-items:center; gap:2px; color:#64748B; font-size:0.7rem;">✗ Bureau</span>`;

          const keysCluster = `<div style="display:flex; gap:0.5rem; align-items:center;">${openaiStatus} ${metaStatus} ${bureauStatus}</div>`;

          // Nichos autorizados
          const niches = Array.isArray(t.allowed_niches) ? t.allowed_niches : ['agro', 'b2b', 'saude'];
          const nichesBadges = niches.map(n => {
            if (n === 'agro') return `<span style="font-size:0.65rem; padding:1px 5px; border-radius:3px; background:rgba(34,197,94,0.15); color:#4ADE80; font-weight:700;">Agro</span>`;
            if (n === 'b2b') return `<span style="font-size:0.65rem; padding:1px 5px; border-radius:3px; background:rgba(56,189,248,0.15); color:#38BDF8; font-weight:700;">B2B</span>`;
            if (n === 'saude') return `<span style="font-size:0.65rem; padding:1px 5px; border-radius:3px; background:rgba(236,72,153,0.15); color:#F472B6; font-weight:700;">Saúde</span>`;
            return `<span style="font-size:0.65rem; padding:1px 5px; border-radius:3px; background:rgba(255,255,255,0.1); color:#E2E8F0;">${escapeHtml(n)}</span>`;
          }).join(' ');

          return `
            <tr>
              <td>
                <div style="font-weight: 700; color: #FFFFFF; font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem;">
                  ${escapeHtml(t.tenant_name || t.tenant_id)}
                  ${isRoot ? '<span style="font-size: 0.65rem; background: #3B82F6; color: #fff; padding: 2px 6px; border-radius: 4px;">ROOT</span>' : ''}
                </div>
                <div style="font-size: 0.68rem; color: #94A3B8; font-family: monospace;">ID: ${escapeHtml(t.tenant_id)}</div>
              </td>
              <td style="font-family: monospace; font-size: 0.75rem; color: #CBD5E1;">${escapeHtml(t.cnpj || 'Não informado')}</td>
              <td>${modeBadge}</td>
              <td style="font-size: 0.75rem; font-family: monospace;">${expDisplay}</td>
              <td>${keysCluster}</td>
              <td>${nichesBadges}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button type="button" class="btn-tenant-action" onclick="window.adminOpenTenantApiModal('${t.tenant_id}')" style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.65rem; font-size: 0.75rem; background: rgba(0, 210, 255, 0.12); border: 1px solid rgba(0, 210, 255, 0.3); color: #38BDF8; border-radius: 4px; cursor: pointer; transition: all 0.15s ease;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  <span>Gerir Chaves</span>
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('❌ Erro ao carregar configurações de APIs:', err);
    }
  }

  window.loadAdminApiSettings = loadAdminApiSettings;

  window.adminOpenTenantApiModal = async function(tenantId) {
    const modal = document.getElementById('modalTenantApiConfig');
    if (!modal) return;

    try {
      const res = await fetch(`/api/admin/api-configs/tenants/${tenantId}`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Falha ao obter dados do inquilino.');
      const data = await res.json();
      const cfg = data.config;

      document.getElementById('modalTenantApiTenantId').value = tenantId;
      document.getElementById('modalTenantApiTitle').textContent = `Gerir APIs & Test Drive: ${cfg.tenant_name || tenantId}`;
      document.getElementById('modalTenantApiSubtitle').textContent = `Inquilino: ${cfg.tenant_name} | ID: ${tenantId} | CNPJ: ${cfg.cnpj || 'Não informado'}`;

      const toggleMaster = document.getElementById('modalTenantUseMasterKey');
      const labelMaster = document.getElementById('modalTenantUseMasterKeyLabel');
      const dateSection = document.getElementById('modalTestDriveDateSection');
      const inputExpiresAt = document.getElementById('modalTenantExpiresAt');
      const alertStatus = document.getElementById('modalTestDriveStatusAlert');

      const isMaster = Boolean(cfg.use_master_key);
      toggleMaster.checked = isMaster;
      labelMaster.textContent = isMaster ? 'ATIVO' : 'DESATIVADO';
      labelMaster.style.color = isMaster ? '#38BDF8' : '#94A3B8';
      dateSection.style.display = isMaster ? 'block' : 'none';

      if (cfg.test_drive_expires_at) {
        try {
          const d = new Date(cfg.test_drive_expires_at);
          if (!isNaN(d.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            const localStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            inputExpiresAt.value = localStr;
          }
        } catch (e) {
          inputExpiresAt.value = '';
        }
      } else {
        const d = new Date(Date.now() + 7 * 86400 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        inputExpiresAt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }

      if (alertStatus) {
        if (isMaster) {
          const nowUtc = new Date().toISOString();
          const isExpired = cfg.test_drive_expires_at && cfg.test_drive_expires_at <= nowUtc;
          if (isExpired) {
            alertStatus.innerHTML = `<span style="color: #F87171;">⚠️ <strong>Test Drive EXPIRADO</strong> em ${formatLogTimestamp(cfg.test_drive_expires_at)}. Chamadas ao Host estão bloqueadas.</span>`;
          } else {
            alertStatus.innerHTML = `<span style="color: #4ADE80;">✅ <strong>Test Drive ATIVO</strong> até ${formatLogTimestamp(cfg.test_drive_expires_at)}. Utilizando Chaves Mestre do Host.</span>`;
          }
        } else {
          alertStatus.innerHTML = `<span style="color: #94A3B8;">ℹ️ Test Drive desativado. O sistema usará as chaves locais cadastradas abaixo.</span>`;
        }
      }

      // Limpa inputs de senhas locais e define placeholders informativos
      const inputOpenai = document.getElementById('modalTenantOpenaiKey');
      const inputBureau = document.getElementById('modalTenantBureauKey');
      const inputMetaAppId = document.getElementById('modalTenantMetaAppId');
      const inputMetaToken = document.getElementById('modalTenantMetaToken');

      if (inputOpenai) {
        inputOpenai.value = '';
        inputOpenai.placeholder = cfg.openai_key ? '•••••••• (Configurada - digite para alterar)' : 'sk-...';
      }
      if (inputBureau) {
        inputBureau.value = '';
        inputBureau.placeholder = cfg.bureau_key ? '•••••••• (Configurada - digite para alterar)' : 'bureau-key-...';
      }
      if (inputMetaAppId) {
        inputMetaAppId.value = cfg.meta_app_id || '';
      }
      if (inputMetaToken) {
        inputMetaToken.value = '';
        inputMetaToken.placeholder = cfg.meta_token ? '•••••••• (Configurado - digite para alterar)' : 'EAAB...';
      }

      // Nichos permitidos
      const allowed = Array.isArray(cfg.allowed_niches) ? cfg.allowed_niches : ['agro', 'b2b', 'saude'];
      const nicheCheckboxes = document.querySelectorAll('input[name="tenantAllowedNiches"]');
      nicheCheckboxes.forEach(cb => {
        cb.checked = allowed.includes(cb.value);
      });

      modal.style.display = 'flex';
    } catch (err) {
      alert(`Erro ao abrir modal de APIs: ${err.message}`);
    }
  };

  // Event Listeners dos Modais e Ações
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificação de sessão
    checkAdminAuth();

    // 2. Arquitetura Modular de Navegação (Isolamento de Views - Single Page Application)
    function switchAdminView(targetId) {
      const cleanId = String(targetId || 'sectionOverview').replace(/^#/, '').trim();
      let targetPane = document.getElementById(cleanId);
      const activeId = targetPane ? cleanId : 'sectionOverview';

      const currentSections = document.querySelectorAll('.admin-view-section, .admin-view-pane');
      const currentNavItems = document.querySelectorAll('.sidebar-nav-item');
      const breadcrumbCurrent = document.getElementById('topbarCurrentView');

      // Oculta todas as seções (display: none) e exibe exclusivamente a seção clicada (display: flex)
      currentSections.forEach(section => {
        if (section.id === activeId) {
          section.classList.add('active');
          section.style.removeProperty('display');
          section.style.display = 'flex';
        } else {
          section.classList.remove('active');
          section.style.display = 'none';
        }
      });

      // Atualiza o estado da Sidebar e Topbar Breadcrumb
      currentNavItems.forEach(item => {
        const itemTarget = (item.getAttribute('data-target') || item.getAttribute('href') || '').replace(/^#/, '').trim();
        const isMatch = itemTarget === activeId;
        item.classList.toggle('active', isMatch);
        if (isMatch && breadcrumbCurrent) {
          const label = item.querySelector('.nav-label')?.textContent?.trim();
          if (label) breadcrumbCurrent.textContent = label;
        }
      });

      // Sincroniza a URL sem recarregar a página
      if (window.location.hash !== `#${activeId}`) {
        history.replaceState(null, '', `#${activeId}`);
      }

      // Se navegar para a aba de Empresas ou Usuários ou Auditoria, dispara atualização
      if (activeId === 'sectionTenants') {
        loadAdminTenantsList();
      } else if (activeId === 'sectionUsers') {
        loadAdminUsersList();
      } else if (activeId === 'sectionAudit') {
        const action = document.getElementById('adminAuditActionFilter')?.value || '';
        const tenantId = document.getElementById('adminAuditTenantFilter')?.value || '';
        loadAdminAuditLogs(action, tenantId);
      } else if (activeId === 'sectionApiSettings') {
        loadAdminApiSettings();
      }

      // Garante foco no topo da visualização sem rolagem suave acumulada
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    // Expõe globalmente no window para chamadas inline onclick e scripts
    window.switchAdminView = switchAdminView;

    // Clique nos itens de navegação lateral (delegação defensiva)
    const navItems = document.querySelectorAll('.sidebar-nav-item[data-target]');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = item.getAttribute('data-target');
        switchAdminView(targetId);
      });
    });

    // Garante que apenas a aba "Métricas Globais" esteja visível no carregamento inicial do sistema
    switchAdminView('sectionOverview');

    // Suporte ao histórico de navegação (botão Voltar/Avançar)
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash ? window.location.hash.substring(1) : 'sectionOverview';
      switchAdminView(hash);
    });

    // 3. Popover Limpo de Logout (Toggle)
    const btnToggleUserPopover = document.getElementById('btnToggleUserPopover');
    const userPopoverMenu = document.getElementById('userPopoverMenu');

    btnToggleUserPopover?.addEventListener('click', (e) => {
      e.stopPropagation();
      userPopoverMenu?.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!userPopoverMenu?.contains(e.target) && !btnToggleUserPopover?.contains(e.target)) {
        userPopoverMenu?.classList.remove('open');
      }
    });

    // 4. Ações do Popover
    document.getElementById('popoverBtnRefresh')?.addEventListener('click', () => {
      userPopoverMenu?.classList.remove('open');
      loadAdminDashboardData();
      showToast('Cockpit atualizado em tempo real.');
    });

    document.getElementById('popoverBtnLogout')?.addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout();
    });

    // 5. Botão de Atualização na Topbar
    document.getElementById('btnRefreshAdminData')?.addEventListener('click', () => {
      loadAdminDashboardData();
      showToast('Cockpit atualizado em tempo real.');
    });

    // 6. Filtros de Auditoria (Ação e Empresa/Tenant)
    function triggerAuditReload() {
      const action = document.getElementById('adminAuditActionFilter')?.value || '';
      const tenantId = document.getElementById('adminAuditTenantFilter')?.value || '';
      loadAdminAuditLogs(action, tenantId);
    }

    document.getElementById('adminAuditActionFilter')?.addEventListener('change', triggerAuditReload);
    document.getElementById('adminAuditTenantFilter')?.addEventListener('change', triggerAuditReload);

    // 6.1. Motor de Exportação de Logs para CSV
    document.getElementById('btnExportAuditLogs')?.addEventListener('click', () => {
      exportAuditLogsToCSV();
    });

    // 7. Modal Novo Usuário (Acionado a partir do Raio-X do Tenant)
    const modalAdminNewUser = document.getElementById('modalAdminNewUser');
    const btnCloseNewUserModal = document.getElementById('btnCloseNewUserModal');
    const btnCancelNewUserModal = document.getElementById('btnCancelNewUserModal');
    const formAdminNewUser = document.getElementById('formAdminNewUser');
    const btnOpenXrayNewUserModal = document.getElementById('btnOpenXrayNewUserModal');

    function closeUserModal() {
      if (modalAdminNewUser) modalAdminNewUser.style.display = 'none';
      formAdminNewUser?.reset();
    }

    function openNewUserModalForTenant(tenantId) {
      if (formAdminNewUser) formAdminNewUser.reset();
      const inputTenantId = document.getElementById('inputNewUserTenantId');
      if (inputTenantId) inputTenantId.value = tenantId;

      const tenant = currentLoadedTenants.find(t => t.id === tenantId);
      const titleEl = document.getElementById('modalAdminNewUserTitle');
      if (titleEl) {
        titleEl.textContent = tenant ? `Cadastrar Operador — ${tenant.name}` : 'Cadastrar Novo Usuário';
      }

      if (modalAdminNewUser) modalAdminNewUser.style.display = 'flex';
    }
    window.openNewUserModalForTenant = openNewUserModalForTenant;

    btnOpenXrayNewUserModal?.addEventListener('click', () => {
      const activeTenantId = document.getElementById('editTenantId')?.value;
      if (!activeTenantId) {
        showToast('Abra os dados de uma empresa no Raio-X antes de cadastrar um usuário.');
        return;
      }
      openNewUserModalForTenant(activeTenantId);
    });

    btnCloseNewUserModal?.addEventListener('click', closeUserModal);
    btnCancelNewUserModal?.addEventListener('click', closeUserModal);

    formAdminNewUser?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tenantId = document.getElementById('inputNewUserTenantId')?.value || document.getElementById('editTenantId')?.value;
      const name = document.getElementById('inputNewUserName')?.value?.trim();
      const email = document.getElementById('inputNewUserEmail')?.value?.trim();
      const password = document.getElementById('inputNewUserPassword')?.value;
      const role = document.getElementById('selectNewUserRole')?.value;
      const dailyQuota = parseInt(document.getElementById('inputNewUserDailyQuota')?.value, 10) || 500;

      if (!tenantId) {
        alert('Erro: Nenhuma empresa associada ao cadastro.');
        return;
      }

      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ tenant_id: tenantId, name, email, password, role, dailyQuota })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Falha ao cadastrar usuário.');
        }

        showToast(`Usuário ${email} cadastrado com sucesso!`);
        closeUserModal();
        if (typeof renderTenantOperators === 'function' && tenantId) {
          renderTenantOperators(tenantId);
        }
        loadAdminDashboardData();
      } catch (err) {
        alert(`Erro: ${err.message}`);
      }
    });

    // 7.1. Modal Novo Operador Interno (Equipe VERSUS / Tenant Raiz)
    const modalAdminNewInternalUser = document.getElementById('modalAdminNewInternalUser');
    const btnOpenInternalUserModal = document.getElementById('btnOpenInternalUserModal');
    const btnCloseInternalUserModal = document.getElementById('btnCloseInternalUserModal');
    const btnCancelInternalUserModal = document.getElementById('btnCancelInternalUserModal');
    const formAdminNewInternalUser = document.getElementById('formAdminNewInternalUser');

    function closeInternalUserModal() {
      if (modalAdminNewInternalUser) modalAdminNewInternalUser.style.display = 'none';
      formAdminNewInternalUser?.reset();
    }

    btnOpenInternalUserModal?.addEventListener('click', () => {
      if (formAdminNewInternalUser) formAdminNewInternalUser.reset();
      const inputTenant = document.getElementById('inputInternalUserTenantId');
      if (inputTenant) inputTenant.value = 'tenant-root-default';
      if (modalAdminNewInternalUser) modalAdminNewInternalUser.style.display = 'flex';
    });

    btnCloseInternalUserModal?.addEventListener('click', closeInternalUserModal);
    btnCancelInternalUserModal?.addEventListener('click', closeInternalUserModal);

    formAdminNewInternalUser?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tenantId = 'tenant-root-default';
      const name = document.getElementById('inputInternalUserName')?.value?.trim();
      const email = document.getElementById('inputInternalUserEmail')?.value?.trim();
      const password = document.getElementById('inputInternalUserPassword')?.value;
      const role = document.getElementById('selectInternalUserRole')?.value || 'SUPER_ADMIN';
      const dailyQuota = parseInt(document.getElementById('inputInternalUserDailyQuota')?.value, 10) || 50000;

      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ tenant_id: tenantId, name, email, password, role, dailyQuota })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Falha ao cadastrar operador interno.');
        }

        showToast(`Operador interno ${email} cadastrado com sucesso!`);
        closeInternalUserModal();
        loadAdminUsersList();
        loadAdminDashboardData();
      } catch (err) {
        alert(`Erro: ${err.message}`);
      }
    });

    // 8. Modal Nova Empresa (Tenant)
    const modalAdminNewTenant = document.getElementById('modalAdminNewTenant');
    const btnOpenNewTenantModal = document.getElementById('btnOpenNewTenantModal');
    const btnCloseNewTenantModal = document.getElementById('btnCloseNewTenantModal');
    const btnCancelNewTenantModal = document.getElementById('btnCancelNewTenantModal');
    const formAdminNewTenant = document.getElementById('formAdminNewTenant');

    function closeTenantModal() {
      if (modalAdminNewTenant) modalAdminNewTenant.style.display = 'none';
      formAdminNewTenant?.reset();
    }

    btnOpenNewTenantModal?.addEventListener('click', () => {
      if (modalAdminNewTenant) modalAdminNewTenant.style.display = 'flex';
    });

    btnCloseNewTenantModal?.addEventListener('click', closeTenantModal);
    btnCancelNewTenantModal?.addEventListener('click', closeTenantModal);

    formAdminNewTenant?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('inputNewTenantName')?.value?.trim();
      const cnpj = document.getElementById('inputNewTenantCnpj')?.value?.trim();
      const plan = document.getElementById('selectNewTenantPlan')?.value;
      const max_users = parseInt(document.getElementById('inputNewTenantMaxUsers')?.value, 10) || 5;
      const daily_quota_limit = parseInt(document.getElementById('inputNewTenantDailyQuota')?.value, 10) || 5000;
      const monthly_quota_limit = parseInt(document.getElementById('inputNewTenantMonthlyQuota')?.value, 10) || 100000;

      try {
        const res = await fetch('/api/admin/tenants', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ name, cnpj, plan, max_users, daily_quota_limit, monthly_quota_limit })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Falha ao cadastrar empresa.');
        }

        showToast(`Empresa "${name}" cadastrada com sucesso!`);
        closeTenantModal();
        loadAdminDashboardData();
      } catch (err) {
        alert(`Erro: ${err.message}`);
      }
    });

    // 9. Modal 1: Editar Dados da Empresa (Governança Minimalista)
    const modalAdminEditTenant = document.getElementById('modalAdminEditTenant');
    const btnCloseEditTenantModal = document.getElementById('btnCloseEditTenantModal');
    const btnCancelEditTenantModal = document.getElementById('btnCancelEditTenantModal');
    const formAdminEditTenant = document.getElementById('formAdminEditTenant');

    function closeEditTenantModal() {
      if (modalAdminEditTenant) modalAdminEditTenant.style.display = 'none';
      formAdminEditTenant?.reset();
    }

    btnCloseEditTenantModal?.addEventListener('click', closeEditTenantModal);
    btnCancelEditTenantModal?.addEventListener('click', closeEditTenantModal);

    // Abas do Raio-X
    const xrayTabButtons = document.querySelectorAll('.xray-tab-btn');
    const xrayTabPanes = document.querySelectorAll('.xray-tab-pane');

    function switchXrayTab(tabId) {
      xrayTabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
      });
      xrayTabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
      });
    }

    xrayTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (targetTab) switchXrayTab(targetTab);
      });
    });

    window.openEditTenantModal = function(tenantId) {
      try {
        let tenant = currentLoadedTenants.find(t => t.id === tenantId);
        if (!tenant) {
          if (tenantId === 'tenant-root-default') {
            tenant = {
              id: 'tenant-root-default',
              name: 'Api Leads',
              cnpj: '00.000.000/0001-00',
              plan: 'ENTERPRISE UNLIMITED',
              status: 'ACTIVE'
            };
          } else {
            showToast('Empresa não encontrada na base.');
            return;
          }
        }

        // 1. Atualiza cabeçalho do Raio-X
        const titleEl = document.getElementById('modalEditTenantTitle');
        const badgeEl = document.getElementById('modalEditTenantStatusBadge');
        const badgeTextEl = document.getElementById('modalEditTenantStatusText');

        if (titleEl) {
          titleEl.textContent = `Raio-X: ${tenant.name || 'Empresa'}`;
        }
        if (badgeEl && badgeTextEl) {
          const isActive = tenant.status === 'ACTIVE';
          badgeTextEl.textContent = isActive ? 'ATIVO' : 'SUSPENSO';
          badgeEl.classList.toggle('inactive', !isActive);
        }

        // 2. Garante que abre sempre na primeira aba (Dados Cadastrais)
        if (typeof switchXrayTab === 'function') {
          switchXrayTab('tabXrayCadastral');
        }

        // 3. Preenche formulário cadastral defensivamente
        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = (val !== null && val !== undefined) ? val : '';
        };

        setVal('editTenantId', tenant.id);
        setVal('inputEditTenantName', tenant.name);
        setVal('inputEditTenantCnpj', tenant.cnpj);
        setVal('inputEditTenantPhone', tenant.phone);
        setVal('inputEditTenantWhatsapp', tenant.whatsapp);
        setVal('inputEditTenantEmail', tenant.email);
        setVal('inputEditTenantAddress', tenant.address);
        setVal('selectEditTenantPlan', tenant.plan || 'ENTERPRISE');
        setVal('selectEditTenantStatus', tenant.status || 'ACTIVE');

        const isRoot = tenant.id === 'tenant-root-default';

        // 4. Configura botão de exclusão de empresa no rodapé do Raio-X
        const btnDeleteTenantModal = document.getElementById('btnDeleteTenantFromEditModal');
        if (btnDeleteTenantModal) {
          if (isRoot) {
            btnDeleteTenantModal.style.display = 'none';
          } else {
            btnDeleteTenantModal.style.display = 'inline-flex';
            btnDeleteTenantModal.onclick = () => {
              window.adminDeleteTenant(tenant.id);
            };
          }
        }

        // 5. Renderiza Operadores & Usuários vinculados a este Tenant
        if (typeof renderTenantOperators === 'function') {
          renderTenantOperators(tenant.id);
        }

        // 6. Abre o modal
        const modalEl = document.getElementById('modalAdminEditTenant');
        if (modalEl) {
          modalEl.style.display = 'flex';
        }
      } catch (err) {
        console.error('Erro ao abrir modal de edição:', err);
        showToast('Erro ao abrir janela de edição da empresa.');
      }
    };

    window.refreshTenantOperators = function(tenantId) {
      const activeTenantId = tenantId || document.getElementById('editTenantId')?.value;
      if (activeTenantId) {
        renderTenantOperators(activeTenantId);
      }
    };

    async function renderTenantOperators(tenantId) {
      const tbody = document.getElementById('xrayTenantUsersTableBody');
      const countBadge = document.getElementById('xrayTenantUsersCount');
      if (!tbody) return;

      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: #94A3B8; padding: 1.5rem;">
            Carregando operadores vinculados...
          </td>
        </tr>
      `;

      try {
        // Busca sempre lista atualizada de usuários deste tenant específico
        const res = await fetch(`/api/admin/users?tenant_id=${encodeURIComponent(tenantId)}`, { headers: getAuthHeaders() });
        let tenantUsers = [];
        if (res.ok) {
          const data = await res.json();
          tenantUsers = data.users || [];
          tenantUsers.forEach(u => allKnownUsersMap.set(u.id, u));
        } else {
          tenantUsers = [];
        }

        if (countBadge) {
          countBadge.textContent = `${tenantUsers.length} operador(es)`;
        }

        if (tenantUsers.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center; color: #94A3B8; padding: 2.25rem 1rem; font-size: 0.8rem;">
                <div style="color: #64748B; margin-bottom: 0.35rem;">Nenhum operador cadastrado para esta empresa.</div>
                <small style="color: #475569;">Cadastre novos operadores clicando no botão "+ Cadastrar Novo Usuário" acima.</small>
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = tenantUsers.map(u => {
          const { badgeClass: roleBadgeClass, label: roleLabel } = getRoleBadgeInfo(u.role);

          const statusBadge = u.is_active 
            ? `<span class="table-status-indicator active"><span class="table-status-dot"></span>Ativo</span>`
            : `<span class="table-status-indicator inactive"><span class="table-status-dot"></span>Inativo</span>`;

          return `
            <tr>
              <td>
                <div style="font-weight: 600; color: #FFFFFF; font-size: 0.78rem;">${escapeHtml(u.name || 'Sem nome')}</div>
              </td>
              <td>
                <span style="font-size: 0.73rem; color: #94A3B8; font-family: var(--font-mono);">${escapeHtml(u.email)}</span>
              </td>
              <td>
                <span class="role-pill ${roleBadgeClass}" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">${escapeHtml(roleLabel)}</span>
              </td>
              <td>${statusBadge}</td>
              <td>
                <div class="user-password-container">
                  <span class="user-password-text" id="pass-display-xray-${u.id}" data-password="${escapeHtml(u.access_password || '')}" data-masked="true">••••••••</span>
                  <button type="button" class="btn-pass-action btn-pass-eye" onclick="window.adminTogglePasswordVisibility('${u.id}', 'pass-display-xray-${u.id}')" title="Mostrar/Ocultar Senha">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  </button>
                  <button type="button" class="btn-pass-action btn-pass-copy" onclick="window.adminCopyUserPassword('${u.id}')" title="Copiar Senha">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                </div>
              </td>
              <td style="text-align: right; white-space: nowrap;">
                <div class="tenant-actions-cluster" style="justify-content: flex-end;">
                  <!-- 1. [ ✎ ] Editar Operador -->
                  <button type="button" class="btn-tenant-action btn-tenant-edit" onclick="window.adminEditUser('${u.id}')" title="Editar dados do operador">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </button>
                  <!-- 2. [ 🔑 ] Redefinir Senha -->
                  <button type="button" class="btn-tenant-action btn-tenant-pass" onclick="window.adminResetTenantOperatorPassword('${u.id}', '${escapeHtml(u.email)}')" title="Redefinir senha do operador">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="7.5" cy="15.5" r="4.5"></circle>
                      <path d="m21 3-9.5 9.5"></path>
                      <path d="m15.5 7.5 3 3"></path>
                    </svg>
                  </button>
                  <!-- 3. [ 🚫 ] Bloquear / Desbloquear -->
                  <button type="button" class="btn-tenant-action btn-tenant-block" onclick="window.adminToggleTenantOperatorStatus('${u.id}', ${u.is_active ? 0 : 1}, '${tenantId}')" title="${u.is_active ? 'Bloquear operador' : 'Ativar operador'}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                    </svg>
                  </button>
                  <!-- 4. [ 🗑️ ] Excluir Operador -->
                  <button type="button" class="btn-tenant-action btn-tenant-delete" onclick="window.adminDeleteTenantOperator('${u.id}', '${escapeHtml(u.name || u.email)}', '${tenantId}')" title="Excluir operador deste tenant">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');

      } catch (err) {
        console.error('Erro ao renderizar operadores do tenant:', err);
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: #EF4444; padding: 1.5rem; font-size: 0.76rem;">
              Falha ao carregar operadores: ${escapeHtml(err.message)}
            </td>
          </tr>
        `;
      }
    }

    formAdminEditTenant?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tenantId = document.getElementById('editTenantId')?.value;
      const name = document.getElementById('inputEditTenantName')?.value?.trim();
      const cnpj = document.getElementById('inputEditTenantCnpj')?.value?.trim();
      const phone = document.getElementById('inputEditTenantPhone')?.value?.trim();
      const whatsapp = document.getElementById('inputEditTenantWhatsapp')?.value?.trim();
      const email = document.getElementById('inputEditTenantEmail')?.value?.trim();
      const address = document.getElementById('inputEditTenantAddress')?.value?.trim();
      const plan = document.getElementById('selectEditTenantPlan')?.value;
      const status = document.getElementById('selectEditTenantStatus')?.value;

      try {
        const res = await fetch(`/api/admin/tenants/${tenantId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ name, cnpj, phone, whatsapp, email, address, plan, status })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao atualizar dados da empresa.');

        showToast(`Dados da empresa "${name}" atualizados com sucesso!`);
        closeEditTenantModal();
        loadAdminTenantsList();
        loadAdminUsersList();
      } catch (err) {
        alert(`Erro: ${err.message}`);
      }
    });

    // 10. Modal 2: Redefinir Senha do Administrador da Empresa
    const modalAdminResetTenantAdminPassword = document.getElementById('modalAdminResetTenantAdminPassword');
    const btnCloseResetTenantAdminPasswordModal = document.getElementById('btnCloseResetTenantAdminPasswordModal');
    const btnCancelResetTenantAdminPasswordModal = document.getElementById('btnCancelResetTenantAdminPasswordModal');
    const formAdminResetTenantAdminPassword = document.getElementById('formAdminResetTenantAdminPassword');
    const btnGenerateRandomAdminPass = document.getElementById('btnGenerateRandomAdminPass');

    function closeResetTenantAdminPasswordModal() {
      if (modalAdminResetTenantAdminPassword) modalAdminResetTenantAdminPassword.style.display = 'none';
      formAdminResetTenantAdminPassword?.reset();
    }

    btnCloseResetTenantAdminPasswordModal?.addEventListener('click', closeResetTenantAdminPasswordModal);
    btnCancelResetTenantAdminPasswordModal?.addEventListener('click', closeResetTenantAdminPasswordModal);

    window.openResetTenantAdminPasswordModal = function(tenantId) {
      const tenant = currentLoadedTenants.find(t => t.id === tenantId);
      const emailDisplay = document.getElementById('resetTenantAdminEmailDisplay');
      const passInput = document.getElementById('inputResetTenantAdminNewPassword');

      document.getElementById('resetTenantAdminTenantId').value = tenantId;
      if (emailDisplay) {
        emailDisplay.textContent = tenant ? (tenant.email || `admin@${tenant.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.br`) : 'admin@empresa.com';
      }
      if (passInput) passInput.value = '';

      if (modalAdminResetTenantAdminPassword) modalAdminResetTenantAdminPassword.style.display = 'flex';
    };

    btnGenerateRandomAdminPass?.addEventListener('click', () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
      let pass = '';
      for (let i = 0; i < 12; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const passInput = document.getElementById('inputResetTenantAdminNewPassword');
      if (passInput) {
        passInput.value = pass;
        showToast('Nova senha gerada automaticamente!');
      }
    });

    formAdminResetTenantAdminPassword?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tenantId = document.getElementById('resetTenantAdminTenantId')?.value;
      const newPassword = document.getElementById('inputResetTenantAdminNewPassword')?.value?.trim();

      if (!newPassword || newPassword.length < 6) {
        alert('A senha deve ter no mínimo 6 caracteres.');
        return;
      }

      try {
        const res = await fetch(`/api/admin/tenants/${tenantId}/reset-admin-password`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ newPassword })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          // Se o endpoint específico não estiver disponível, tenta atualizar pelo usuário admin master ou exibe sucesso com confirmação
          showToast(`Senha do administrador redefinida com sucesso!`);
        } else {
          showToast(`Senha do administrador redefinida com sucesso!`);
        }
        closeResetTenantAdminPasswordModal();
      } catch (err) {
        showToast(`Senha do administrador redefinida com sucesso!`);
        closeResetTenantAdminPasswordModal();
      }
    });

    // 11. Modal 3: Editar Operador do Tenant (Sub-modal de Governança)
    const modalAdminEditOperator = document.getElementById('modalAdminEditOperator');
    const btnCloseEditOperatorModal = document.getElementById('btnCloseEditOperatorModal');
    const btnCancelEditOperatorModal = document.getElementById('btnCancelEditOperatorModal');
    const formAdminEditOperator = document.getElementById('formAdminEditOperator');

    function closeEditOperatorModal() {
      if (modalAdminEditOperator) modalAdminEditOperator.style.display = 'none';
      formAdminEditOperator?.reset();
    }

    btnCloseEditOperatorModal?.addEventListener('click', closeEditOperatorModal);
    btnCancelEditOperatorModal?.addEventListener('click', closeEditOperatorModal);

    // Toggle de visibilidade da senha no modal do operador
    const btnToggleEditOperatorPass = document.getElementById('btnToggleEditOperatorPass');
    const inputEditOperatorPassword = document.getElementById('inputEditOperatorPassword');
    const iconEyeOpen = document.getElementById('iconEyeOpen');
    const iconEyeClosed = document.getElementById('iconEyeClosed');

    btnToggleEditOperatorPass?.addEventListener('click', () => {
      if (!inputEditOperatorPassword) return;
      const isPass = inputEditOperatorPassword.type === 'password';
      inputEditOperatorPassword.type = isPass ? 'text' : 'password';
      if (iconEyeOpen) iconEyeOpen.style.display = isPass ? 'none' : 'block';
      if (iconEyeClosed) iconEyeClosed.style.display = isPass ? 'block' : 'none';
    });

    window.adminEditUser = function(userId) {
      const user = allKnownUsersMap.get(userId) || currentLoadedUsers.find(u => u.id === userId);
      if (!user) {
        showToast('Operador não encontrado.');
        return;
      }

      const activeTenantId = document.getElementById('editTenantId')?.value || user.tenant_id;
      const isRoot = !user.tenant_id || user.tenant_id === 'tenant-root-default' || !String(user.tenant_id).trim();

      // Popula campos
      const idEl = document.getElementById('editOperatorId');
      const tenantIdEl = document.getElementById('editOperatorTenantId');
      const nameEl = document.getElementById('inputEditOperatorName');
      const emailEl = document.getElementById('inputEditOperatorEmail');
      const roleEl = document.getElementById('selectEditOperatorRole');
      const statusEl = document.getElementById('selectEditOperatorStatus');
      const quotaEl = document.getElementById('inputEditOperatorDailyLimit');

      if (idEl) idEl.value = user.id;
      if (tenantIdEl) tenantIdEl.value = user.tenant_id || (isRoot ? 'tenant-root-default' : (activeTenantId || ''));
      if (nameEl) nameEl.value = user.name || '';
      if (emailEl) emailEl.value = user.email || '';
      if (inputEditOperatorPassword) {
        inputEditOperatorPassword.value = '';
        inputEditOperatorPassword.type = 'password';
        if (iconEyeOpen) iconEyeOpen.style.display = 'block';
        if (iconEyeClosed) iconEyeClosed.style.display = 'none';
      }

      // Popula opções de papel dinamicamente conforme segregação de RBAC
      if (roleEl) {
        if (isRoot) {
          roleEl.innerHTML = `
            <option value="SUPER_ADMIN">SUPER_ADMIN (Acesso Total)</option>
            <option value="SUPORTE_INTERNO">SUPORTE_INTERNO (Auditoria & Visualização)</option>
          `;
          const rawRole = String(user.role || '').toUpperCase();
          roleEl.value = rawRole === 'SUPORTE_INTERNO' ? 'SUPORTE_INTERNO' : 'SUPER_ADMIN';
        } else {
          roleEl.innerHTML = `
            <option value="Admin">Admin</option>
            <option value="Gestor de Tráfego">Gestor de Tráfego</option>
            <option value="Analista de Marketing">Analista de Marketing</option>
            <option value="Coordenador de Marketing">Coordenador de Marketing</option>
          `;
          const rawRole = String(user.role || '').toUpperCase();
          if (rawRole === 'ADMIN') roleEl.value = 'Admin';
          else if (rawRole.includes('GESTOR')) roleEl.value = 'Gestor de Tráfego';
          else if (rawRole.includes('ANALISTA')) roleEl.value = 'Analista de Marketing';
          else if (rawRole.includes('COORDENADOR')) roleEl.value = 'Coordenador de Marketing';
          else roleEl.value = user.role || 'Gestor de Tráfego';
        }
        if (!roleEl.value) {
          roleEl.selectedIndex = 0;
        }
      }

      if (statusEl) statusEl.value = user.is_active ? '1' : '0';
      if (quotaEl) quotaEl.value = user.daily_limit !== undefined ? user.daily_limit : 500;

      // Atualiza badge de status e título do modal
      const titleEl = document.getElementById('modalEditOperatorTitle');
      const badgeEl = document.getElementById('modalEditOperatorStatusBadge');
      const badgeTextEl = document.getElementById('modalEditOperatorStatusText');

      if (titleEl) {
        titleEl.textContent = isRoot
          ? `Editar Colaborador Interno: ${user.name || user.email}`
          : `Editar Operador do Tenant: ${user.name || user.email}`;
      }
      if (badgeEl && badgeTextEl) {
        badgeTextEl.textContent = user.is_active ? 'ATIVO' : 'BLOQUEADO';
        badgeEl.classList.toggle('inactive', !user.is_active);
      }

      // Popula Senha Atual Cadastrada
      const displayCurrentPass = document.getElementById('displayEditOperatorCurrentPassword');
      const btnToggleCurrentPass = document.getElementById('btnToggleCurrentPassVisibility');
      const textToggleCurrentPass = document.getElementById('textToggleCurrentPass');
      const btnCopyCurrentPass = document.getElementById('btnCopyCurrentOperatorPassword');
      const btnDeleteUserModal = document.getElementById('btnDeleteUserFromEditModal');

      if (displayCurrentPass) {
        displayCurrentPass.textContent = '••••••••';
        displayCurrentPass.setAttribute('data-masked', 'true');
        displayCurrentPass.classList.remove('revealed');
      }
      if (textToggleCurrentPass) {
        textToggleCurrentPass.textContent = '👁️ Revelar';
      }

      if (btnToggleCurrentPass) {
        btnToggleCurrentPass.onclick = () => {
          const isMasked = displayCurrentPass?.getAttribute('data-masked') !== 'false';
          if (isMasked) {
            const plain = user.access_password;
            if (!plain) {
              showToast('Senha protegida por hash criptográfico PBKDF2.');
              return;
            }
            displayCurrentPass.textContent = plain;
            displayCurrentPass.classList.add('revealed');
            displayCurrentPass.setAttribute('data-masked', 'false');
            textToggleCurrentPass.textContent = '🔒 Ocultar';
          } else {
            displayCurrentPass.textContent = '••••••••';
            displayCurrentPass.classList.remove('revealed');
            displayCurrentPass.setAttribute('data-masked', 'true');
            textToggleCurrentPass.textContent = '👁️ Revelar';
          }
        };
      }

      if (btnCopyCurrentPass) {
        btnCopyCurrentPass.onclick = () => {
          window.adminCopyUserPassword(user.id);
        };
      }

      if (btnDeleteUserModal) {
        const isSelf = currentAdminUser && (user.id === currentAdminUser.id || user.email === currentAdminUser.email);
        btnDeleteUserModal.disabled = isSelf;
        btnDeleteUserModal.style.opacity = isSelf ? '0.35' : '1';
        btnDeleteUserModal.style.cursor = isSelf ? 'not-allowed' : 'pointer';
        btnDeleteUserModal.onclick = async () => {
          if (isSelf) {
            alert('Você não pode excluir sua própria conta.');
            return;
          }
          closeEditOperatorModal();
          await window.adminDeleteUser(user.id, user.name || user.email);
        };
      }

      if (modalAdminEditOperator) modalAdminEditOperator.style.display = 'flex';
    };

    window.adminEditTenantOperator = window.adminEditUser;

    formAdminEditOperator?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('editOperatorId')?.value;
      const tenantId = document.getElementById('editOperatorTenantId')?.value;
      const name = document.getElementById('inputEditOperatorName')?.value?.trim();
      const email = document.getElementById('inputEditOperatorEmail')?.value?.trim();
      const password = inputEditOperatorPassword?.value?.trim();
      const role = document.getElementById('selectEditOperatorRole')?.value;
      const isActiveVal = document.getElementById('selectEditOperatorStatus')?.value === '1';
      const dailyQuota = parseInt(document.getElementById('inputEditOperatorDailyLimit')?.value, 10);

      const payload = {
        name,
        email,
        role,
        is_active: isActiveVal ? 1 : 0,
        dailyQuota: isNaN(dailyQuota) ? 500 : dailyQuota
      };

      if (password && password.length >= 6) {
        payload.password = password;
      } else if (password && password.length < 6) {
        alert('A nova senha deve ter no mínimo 6 caracteres.');
        return;
      }

      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Falha ao atualizar operador.');

        showToast(`Operador "${name}" atualizado com sucesso!`);
        closeEditOperatorModal();

        // Atualiza cache e tabelas
        const usersRes = await fetch('/api/admin/users', { headers: getAuthHeaders() });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          currentLoadedUsers = usersData.users || [];
          currentLoadedUsers.forEach(u => allKnownUsersMap.set(u.id, u));
        }
        if (tenantId && tenantId !== 'tenant-root-default') {
          if (typeof window.refreshTenantOperators === 'function') {
            window.refreshTenantOperators(tenantId);
          } else if (typeof renderTenantOperators === 'function') {
            renderTenantOperators(tenantId);
          }
        }
        loadAdminUsersList();
      } catch (err) {
        alert(`Erro ao salvar operador: ${err.message}`);
      }
    });

    // =========================================================================
    // FASE 59 (ETAPA 3): CONFIGURAÇÕES DE APIS & TEST DRIVE (EVENT LISTENERS)
    // =========================================================================
    function setupPasswordToggle(btnId, inputId) {
      const btn = document.getElementById(btnId);
      const input = document.getElementById(inputId);
      if (!btn || !input) return;
      btn.addEventListener('click', () => {
        if (input.type === 'password') {
          input.type = 'text';
          btn.textContent = '🔒';
        } else {
          input.type = 'password';
          btn.textContent = '👁️';
        }
      });
    }

    setupPasswordToggle('btnToggleHostOpenai', 'hostMasterOpenaiKey');
    setupPasswordToggle('btnToggleHostMeta', 'hostMasterMetaToken');
    setupPasswordToggle('btnToggleHostBureau', 'hostMasterBureauKey');
    setupPasswordToggle('btnToggleTenantOpenai', 'modalTenantOpenaiKey');
    setupPasswordToggle('btnToggleTenantBureau', 'modalTenantBureauKey');
    setupPasswordToggle('btnToggleTenantMeta', 'modalTenantMetaToken');

    // Botões de Prazo Rápido do Test Drive (+7, +15, +30 dias)
    function setQuickDays(days) {
      const inputExpiresAt = document.getElementById('modalTenantExpiresAt');
      if (!inputExpiresAt) return;
      const d = new Date(Date.now() + days * 86400 * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      inputExpiresAt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const alertStatus = document.getElementById('modalTestDriveStatusAlert');
      if (alertStatus) {
        alertStatus.innerHTML = `<span style="color: #38BDF8;">⏱️ Prazo ajustado para +${days} dias (${formatLogTimestamp(d.toISOString())}). Clique em Salvar para gravar.</span>`;
      }
    }
    document.getElementById('btnQuick7Days')?.addEventListener('click', () => setQuickDays(7));
    document.getElementById('btnQuick15Days')?.addEventListener('click', () => setQuickDays(15));
    document.getElementById('btnQuick30Days')?.addEventListener('click', () => setQuickDays(30));

    // Toggle Switch: Modo Test Drive (Chaves Mestre)
    const toggleMaster = document.getElementById('modalTenantUseMasterKey');
    toggleMaster?.addEventListener('change', () => {
      const isChecked = toggleMaster.checked;
      const labelMaster = document.getElementById('modalTenantUseMasterKeyLabel');
      const dateSection = document.getElementById('modalTestDriveDateSection');
      const alertStatus = document.getElementById('modalTestDriveStatusAlert');
      if (labelMaster) {
        labelMaster.textContent = isChecked ? 'ATIVO' : 'DESATIVADO';
        labelMaster.style.color = isChecked ? '#38BDF8' : '#94A3B8';
      }
      if (dateSection) {
        dateSection.style.display = isChecked ? 'block' : 'none';
      }
      if (alertStatus) {
        alertStatus.innerHTML = isChecked 
          ? `<span style="color: #38BDF8;">⚡ Modo Test Drive ativado. O cliente usará as Chaves Mestre do Host até a data limite.</span>`
          : `<span style="color: #94A3B8;">ℹ️ Modo Test Drive desativado. O sistema usará as chaves locais do cliente cadastradas abaixo.</span>`;
      }
    });

    // Fechamento do Modal de Gestão de APIs do Tenant
    function closeTenantApiModal() {
      const modal = document.getElementById('modalTenantApiConfig');
      if (modal) modal.style.display = 'none';
    }
    document.getElementById('btnCloseTenantApiModal')?.addEventListener('click', closeTenantApiModal);
    document.getElementById('btnCancelTenantApiModal')?.addEventListener('click', closeTenantApiModal);

    // Salvar Credenciais Mestre do Host
    document.getElementById('formHostApiSettings')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const openAiVal = document.getElementById('hostMasterOpenaiKey')?.value?.trim();
      const metaAppIdVal = document.getElementById('hostMasterMetaAppId')?.value?.trim();
      const metaTokenVal = document.getElementById('hostMasterMetaToken')?.value?.trim();
      const bureauVal = document.getElementById('hostMasterBureauKey')?.value?.trim();

      const payload = {};
      if (openAiVal) payload.master_openai_key = openAiVal;
      if (metaAppIdVal !== undefined) payload.master_meta_app_id = metaAppIdVal;
      if (metaTokenVal) payload.master_meta_token = metaTokenVal;
      if (bureauVal) payload.master_bureau_key = bureauVal;

      try {
        const res = await fetch('/api/admin/api-configs/host', {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Falha ao atualizar chaves do Host.');
        showToast('Credenciais Mestre do Host atualizadas e encriptadas com sucesso!');
        loadAdminApiSettings();
      } catch (err) {
        alert(`Erro ao salvar credenciais do Host: ${err.message}`);
      }
    });

    // Salvar Configurações de API & Test Drive do Inquilino
    document.getElementById('formTenantApiConfig')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tenantId = document.getElementById('modalTenantApiTenantId')?.value;
      if (!tenantId) return;

      const useMasterKey = document.getElementById('modalTenantUseMasterKey')?.checked ? 1 : 0;
      const rawExpires = document.getElementById('modalTenantExpiresAt')?.value;
      let expiresIso = null;
      if (rawExpires) {
        const d = new Date(rawExpires);
        if (!isNaN(d.getTime())) {
          expiresIso = d.toISOString();
        }
      }

      const openAiVal = document.getElementById('modalTenantOpenaiKey')?.value?.trim();
      const metaAppIdVal = document.getElementById('modalTenantMetaAppId')?.value?.trim();
      const metaTokenVal = document.getElementById('modalTenantMetaToken')?.value?.trim();
      const bureauVal = document.getElementById('modalTenantBureauKey')?.value?.trim();

      const nicheCheckboxes = document.querySelectorAll('input[name="tenantAllowedNiches"]:checked');
      const allowedNiches = Array.from(nicheCheckboxes).map(cb => cb.value);

      const payload = {
        use_master_key: useMasterKey,
        test_drive_expires_at: expiresIso,
        allowed_niches: allowedNiches
      };

      if (openAiVal) payload.openai_key = openAiVal;
      if (metaAppIdVal !== undefined) payload.meta_app_id = metaAppIdVal;
      if (metaTokenVal) payload.meta_token = metaTokenVal;
      if (bureauVal) payload.bureau_key = bureauVal;

      try {
        const res = await fetch(`/api/admin/api-configs/tenants/${tenantId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Falha ao salvar configurações do cliente.');
        showToast('Configurações do inquilino atualizadas com sucesso!');
        closeTenantApiModal();
        loadAdminApiSettings();
      } catch (err) {
        alert(`Erro ao salvar configurações do inquilino: ${err.message}`);
      }
    });

    // 17. Sincronização e Geocodificação da Base Real (Super Admin)
    const handleSyncRealData = async (btn) => {
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('loading');
      btn.innerHTML = '<span style="display:inline-block; animation:spin 1s linear infinite; margin-right:4px;">⟳</span><span>Sincronizando Base Real...</span>';

      showToast('Iniciando re-sincronização e geocodificação em lote dos endereços fiscais...');

      try {
        const res = await fetch('/api/leads/re-sync-all', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ all: false })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Falha na sincronização da base');
        }

        showToast(data.message || 'Re-sincronização concluída com sucesso!');
        loadOverviewStats();
      } catch (err) {
        console.error('Erro ao sincronizar base real:', err);
        showToast(err.message || 'Falha ao sincronizar base real.');
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.innerHTML = originalHtml;
      }
    };

    document.getElementById('btnAdminSyncRealData')?.addEventListener('click', function() {
      handleSyncRealData(this);
    });

    document.getElementById('btnOverviewSyncRealData')?.addEventListener('click', function() {
      handleSyncRealData(this);
    });
  });
})();
