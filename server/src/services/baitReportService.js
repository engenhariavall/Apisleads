import db from '../config/database.js';
import { qsaService } from './qsaService.js';
import { calculateMarketGaps } from './competitorIntelligenceService.js';
import { GeoSpatialEngine } from '../modules/gis/index.js';

/**
 * SERVIÇO DE ISCA DINÂMICA (CAVALO DE TROIA B2B) - Fase 27 (Etapa 4)
 * Gera a página de relatório executivo público com visualização de Market Gaps,
 * telemetria e injeção configurável de tags (Meta Pixel & GTM).
 */
export const baitReportService = {
  /**
   * Obtém os dados contextuais para a página do relatório tático do CNPJ
   * @param {string} rawCnpj 
   * @param {Object} queryParams (ex: pixel_id, gtm_id)
   * @returns {Object}
   */
  async getReportData(rawCnpj, queryParams = {}) {
    let cleanCnpj = qsaService.sanitizeCnpj(rawCnpj);
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      cleanCnpj = String(rawCnpj || '').replace(/\D/g, '').padEnd(14, '0').slice(0, 14);
      if (!cleanCnpj || cleanCnpj.length !== 14) {
        cleanCnpj = '00000000000000';
      }
    }

    // 1. Busca a empresa na base local com múltiplos formatos
    let lead = null;
    try {
      lead = db.prepare(`
        SELECT * FROM leads 
        WHERE cnpj_raw = ? OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
        LIMIT 1
      `).get(cleanCnpj, cleanCnpj);
    } catch (dbErr) {
      console.warn('[BaitReport] Erro ao buscar lead local no banco:', dbErr.message);
    }

    // Se o lead ainda não estiver na base local e tiver 14 dígitos válidos, tenta enriquecer e salvar
    if (!lead && cleanCnpj !== '00000000000000') {
      let resolvedRazao = 'Empresa sob Análise Confidencial';
      let resolvedCidade = 'BRASÍLIA';
      let resolvedUf = 'DF';
      let resolvedPorte = 'DEMAIS';
      let resolvedCapital = 0;

      try {
        const enriched = await qsaService.enrichLeadQsa(cleanCnpj);
        if (enriched?.razao_social) resolvedRazao = enriched.razao_social;
      } catch (_) {}

      try {
        const leadId = `lead_${cleanCnpj}`;
        const targetTenantId = queryParams.t || queryParams.tenant || queryParams.tenant_id || 'tenant-root-default';
        db.prepare(`
          INSERT OR IGNORE INTO leads (
            id, cnpj, cnpj_raw, razao_social, nome_fantasia, 
            cnae_principal_codigo, cnae_principal_descricao, porte, 
            capital_social, municipio, uf, situacao_cadastral, tenant_id
          ) VALUES (?, ?, ?, ?, ?, '0000000', 'Atividades Empresariais', ?, ?, ?, ?, 'ATIVA', ?)
        `).run(
          leadId,
          cleanCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
          cleanCnpj,
          resolvedRazao,
          resolvedRazao,
          resolvedPorte,
          resolvedCapital,
          resolvedCidade,
          resolvedUf,
          targetTenantId
        );

        lead = db.prepare('SELECT * FROM leads WHERE cnpj_raw = ? LIMIT 1').get(cleanCnpj);
      } catch (insertErr) {
        console.warn('[BaitReport] Aviso ao cadastrar lead dinâmico:', insertErr.message);
      }
    }

    if (!lead) {
      lead = {
        cnpj: cleanCnpj,
        razao_social: 'Empresa sob Análise Confidencial',
        nome_fantasia: 'Empresa sob Análise Confidencial',
        municipio: 'BRASÍLIA',
        uf: 'DF',
        situacao_cadastral: 'ATIVA'
      };
    }

    // 2. Calcula os Gaps de Mercado com proteção contra erro
    let topGaps = [];
    try {
      const gaps = calculateMarketGaps({ buffer_km: 60 });
      topGaps = (gaps || []).slice(0, 5);
    } catch (gapErr) {
      console.warn('[BaitReport] Aviso ao calcular gaps de mercado:', gapErr.message);
    }

    // 3. Obtém dados do QSA para personalização com fallback
    let socios = [];
    try {
      socios = qsaService.getSociosByCnpj(cleanCnpj) || [];
    } catch (qsaErr) {
      console.warn('[BaitReport] Aviso ao obter sócios:', qsaErr.message);
    }
    const leadDecisor = (socios && socios.length > 0 && socios[0]?.nome) ? socios[0].nome : 'Liderança Executiva';

    // 4. Parâmetros de rastreamento (Pixel & GTM)
    const metaPixelId = queryParams.pixel_id || process.env.META_PIXEL_ID || null;
    const gtmId = queryParams.gtm_id || process.env.GTM_ID || null;

    // 5. Resolução Multi-Tenant do WhatsApp Inbound para o Relatório do Cavalo de Troia (Fase 35 - Etapa 3)
    const targetTenantId = queryParams.t || queryParams.tenant || queryParams.tenant_id || 'tenant-root-default';
    let tenantRow = null;
    try {
      tenantRow = db.prepare('SELECT id, name, whatsapp_inbound FROM tenants WHERE id = ?').get(targetTenantId);
      if (!tenantRow) {
        tenantRow = db.prepare('SELECT id, name, whatsapp_inbound FROM tenants ORDER BY created_at ASC LIMIT 1').get();
      }
    } catch (tErr) {
      console.warn('[BaitReport] Aviso ao buscar tenant:', tErr.message);
    }
    const tenantWhatsappInbound = tenantRow?.whatsapp_inbound || null;
    const tenantName = tenantRow?.name || 'VERSUS INTELLIGENCE';

    return {
      lead: {
        cnpj: cleanCnpj,
        nome: lead.nome_fantasia || lead.razao_social || 'Empresa Analisada',
        razao_social: lead.razao_social || lead.nome_fantasia || 'Empresa Analisada',
        municipio: lead.municipio || 'Brasil',
        uf: lead.uf || 'BR',
        capital_social: lead.capital_social || 0,
        porte: lead.porte || 'DEMAIS'
      },
      decisor: leadDecisor,
      total_socios: socios.length,
      topGaps,
      metaPixelId,
      gtmId,
      tenantId: tenantRow?.id || targetTenantId,
      tenantName: tenantName,
      whatsappInbound: tenantWhatsappInbound
    };
  },

  /**
   * FASE 40 (ETAPA 1): Motor de Telemetria e Captura (Tripwire)
   * Registra cada acesso ao dossiê público na base de leads e na tabela histórica
   */
  async recordDossierView(rawCnpj, reqMetadata = {}) {
    try {
      let cleanCnpj = String(rawCnpj || '').replace(/\D/g, '');
      if (cleanCnpj.length > 14) cleanCnpj = cleanCnpj.slice(0, 14);
      if (cleanCnpj.length < 14) cleanCnpj = qsaService.sanitizeCnpj(cleanCnpj);
      if (!cleanCnpj || cleanCnpj.length !== 14) return null;

      const ip = reqMetadata.ip || '127.0.0.1';
      const userAgent = reqMetadata.userAgent || '';
      const referrer = reqMetadata.referrer || '';
      const queryParams = reqMetadata.queryParams || {};
      const tenantId = reqMetadata.tenantId || queryParams.t || queryParams.tenant || 'tenant-root-default';
      const nowIso = new Date().toISOString();

      // 1. Atualiza as colunas de telemetria na tabela leads (se a empresa existir na base)
      try {
        const updateLeadStmt = db.prepare(`
          UPDATE leads
          SET 
            visualizacoes_dossie = COALESCE(visualizacoes_dossie, 0) + 1,
            ultimo_acesso_dossie = ?,
            ip_acesso = ?
          WHERE cnpj_raw = ? OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
        `);
        updateLeadStmt.run(nowIso, ip, cleanCnpj, cleanCnpj);
      } catch (leadUpErr) {
        console.warn('[BaitReport Telemetry] Aviso ao atualizar leads:', leadUpErr.message);
      }

      // 2. Insere evento no log detalhado lead_dossier_views
      const viewId = `view_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      try {
        const insertViewStmt = db.prepare(`
          INSERT INTO lead_dossier_views (id, lead_cnpj, tenant_id, ip_address, user_agent, referrer, query_params, viewed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertViewStmt.run(viewId, cleanCnpj, tenantId, ip, userAgent, referrer, JSON.stringify(queryParams), nowIso);
      } catch (viewErr) {
        console.warn('[BaitReport Telemetry] Aviso ao registrar lead_dossier_views:', viewErr.message);
      }

      return {
        success: true,
        view_id: viewId,
        cnpj: cleanCnpj,
        viewed_at: nowIso
      };
    } catch (err) {
      console.error('[BaitReport Telemetry] Erro crítico no registro de telemetria:', err.message);
      return null;
    }
  },

  /**
   * FASE 40 (ETAPA 1): Consulta status de engajamento do dossiê para um lead específico
   */
  getLeadTrackingData(rawCnpj, tenantId = null) {
    let cleanCnpj = String(rawCnpj || '').replace(/\D/g, '');
    if (cleanCnpj.length > 14) cleanCnpj = cleanCnpj.slice(0, 14);
    if (cleanCnpj.length < 14) cleanCnpj = qsaService.sanitizeCnpj(cleanCnpj);
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      return {
        has_access: false,
        visualizacoes_dossie: 0,
        ultimo_acesso_dossie: null,
        ip_acesso: null,
        history: []
      };
    }

    let leadRow = null;
    try {
      const tenantClause = tenantId ? ' AND tenant_id = ?' : '';
      const sql = `
        SELECT visualizacoes_dossie, ultimo_acesso_dossie, ip_acesso
        FROM leads
        WHERE (cnpj_raw = ? OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?)${tenantClause}
        LIMIT 1
      `;
      const stmt = db.prepare(sql);
      leadRow = tenantId ? stmt.get(cleanCnpj, cleanCnpj, tenantId) : stmt.get(cleanCnpj, cleanCnpj);
    } catch (dbErr) {
      console.warn('[BaitReport Telemetry] Erro ao consultar lead:', dbErr.message);
    }

    let history = [];
    try {
      const histStmt = db.prepare(`
        SELECT id, ip_address, user_agent, referrer, query_params, viewed_at
        FROM lead_dossier_views
        WHERE lead_cnpj = ?
        ORDER BY viewed_at DESC
        LIMIT 10
      `);
      history = histStmt.all(cleanCnpj) || [];
    } catch (hErr) {
      console.warn('[BaitReport Telemetry] Erro ao consultar histórico de views:', hErr.message);
    }

    const viewsCount = leadRow?.visualizacoes_dossie || (history.length > 0 ? history.length : 0);
    const lastAccess = leadRow?.ultimo_acesso_dossie || (history.length > 0 ? history[0].viewed_at : null);
    const lastIp = leadRow?.ip_acesso || (history.length > 0 ? history[0].ip_address : null);

    return {
      has_access: viewsCount > 0,
      visualizacoes_dossie: viewsCount,
      ultimo_acesso_dossie: lastAccess,
      ip_acesso: lastIp,
      history
    };
  },

  /**
   * Renderiza o HTML enxuto, responsivo e de alto padrão (Padrão VERSUS)
   * @param {Object} data 
   * @returns {string} HTML final
   */
  renderReportHtml(data = {}) {
    const lead = data?.lead || {
      cnpj: '00000000000000',
      nome: 'Empresa sob Análise Confidencial',
      razao_social: 'Empresa sob Análise Confidencial',
      municipio: 'Brasil',
      uf: 'BR',
      capital_social: 0,
      porte: 'DEMAIS'
    };
    const decisor = data?.decisor || 'Liderança Executiva';
    const topGaps = data?.topGaps || [];
    const metaPixelId = data?.metaPixelId || null;
    const gtmId = data?.gtmId || null;

    const safeCompanyName = String(lead.nome || '').replace(/['"\\]/g, ' ');

    // Injeção opcional do Meta Pixel
    const metaPixelScript = metaPixelId ? `
      <!-- Meta Pixel Code -->
      <script>
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${metaPixelId}');
      fbq('track', 'PageView');
      fbq('trackCustom', 'ViewTrojanB2BReport', {
        cnpj: '${lead.cnpj || ''}',
        company: '${safeCompanyName}'
      });
      </script>
      <noscript><img height="1" width="1" style="display:none"
      src="https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1"/></noscript>
      <!-- End Meta Pixel Code -->
    ` : '';

    // Injeção opcional do Google Tag Manager
    const gtmHeadScript = gtmId ? `
      <!-- Google Tag Manager -->
      <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','${gtmId}');</script>
      <!-- End Google Tag Manager -->
    ` : '';

    const gtmBodyScript = gtmId ? `
      <!-- Google Tag Manager (noscript) -->
      <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}"
      height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
      <!-- End Google Tag Manager (noscript) -->
    ` : '';

    const formattedCnpj = lead.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

    const gapRowsHtml = (topGaps && topGaps.length > 0) ? topGaps.map((gap, i) => `
      <tr>
        <td style="padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(148, 163, 184, 0.08);"><span class="badge-rank">#${i + 1} VAZIO</span></td>
        <td style="padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(148, 163, 184, 0.08); font-weight: 700; color: #FFFFFF;">${gap.municipio || gap.nome || 'Microrregião'} - ${gap.uf || ''}</td>
        <td style="padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(148, 163, 184, 0.08); font-family: 'JetBrains Mono', monospace; color: #94A3B8; font-size: 0.75rem;">${gap.distancia_km ? Math.round(gap.distancia_km) + ' km' : 'Alta dispersão'}</td>
        <td style="padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(148, 163, 184, 0.08); text-align: right;"><span class="badge-score">${gap.gap_score ? Math.round(gap.gap_score) + ' pts' : 'Alta Oportunidade'}</span></td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="4" style="text-align: center; padding: 1.5rem; color: #64748B; font-size: 0.75rem;">
          Nenhum vazio concorrencial desassistido detectado para esta microrregião.
        </td>
      </tr>
    `;

    const cleanWa = String(data?.whatsappInbound || '').replace(/\D/g, '');
    const fullWaNumber = cleanWa ? (cleanWa.startsWith('55') ? cleanWa : (cleanWa.length <= 11 ? `55${cleanWa}` : cleanWa)) : '';
    const waBase = fullWaNumber ? `https://wa.me/${fullWaNumber}` : 'https://wa.me/';
    const waUrl = `${waBase}?text=${encodeURIComponent('Olá! Acessei o dossiê confidencial de gaps de mercado da ' + lead.nome + ' e gostaria de agendar a sessão estratégica.')}`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dossiê Confidencial de Inteligência Territorial — ${lead.nome}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
  ${gtmHeadScript}
  ${metaPixelScript}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #050814;
      color: #F8FAFC;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2.5rem 1rem;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      width: 100%;
      max-width: 820px;
    }
    .top-terminal-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0.85rem;
      background: #0B1224;
      border: 1px solid rgba(0, 85, 255, 0.3);
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      color: #94A3B8;
      margin-bottom: 1rem;
      letter-spacing: 0.05em;
    }
    .security-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: #EF4444;
      font-weight: 700;
      text-transform: uppercase;
    }
    .doc-card {
      background: #0B1224;
      border: 1px solid rgba(0, 85, 255, 0.3);
      border-radius: 4px;
      padding: 1.75rem;
      margin-bottom: 1.25rem;
    }
    .doc-header-strip {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      padding-bottom: 1rem;
      margin-bottom: 1.25rem;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .doc-title-block h1 {
      font-size: 1.25rem;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: -0.02em;
      line-height: 1.3;
    }
    .doc-title-block p {
      font-size: 0.78rem;
      color: #94A3B8;
      margin-top: 0.35rem;
      line-height: 1.45;
    }
    .doc-meta-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.62rem;
      color: #64748B;
      text-align: right;
      line-height: 1.4;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .meta-item {
      background: #080D1C;
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 4px;
      padding: 0.75rem 0.9rem;
    }
    .meta-item .label {
      font-size: 0.62rem;
      color: #64748B;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .meta-item .value {
      font-size: 0.85rem;
      font-weight: 700;
      color: #FFFFFF;
      margin-top: 0.2rem;
      word-break: break-word;
    }
    .meta-item .subvalue {
      font-size: 0.68rem;
      color: #94A3B8;
      margin-top: 0.15rem;
      font-family: 'JetBrains Mono', monospace;
    }
    .section-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      padding-bottom: 0.4rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    }
    .section-title h2 {
      font-size: 0.85rem;
      font-weight: 800;
      color: #FFFFFF;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .section-title .section-tag {
      font-size: 0.65rem;
      font-family: 'JetBrains Mono', monospace;
      color: #3B82F6;
      font-weight: 600;
    }
    .gap-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0.5rem;
    }
    .gap-table th {
      text-align: left;
      font-size: 0.65rem;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.6rem 0.85rem;
      background: #080D1C;
      border-top: 1px solid rgba(148, 163, 184, 0.12);
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      font-weight: 700;
    }
    .gap-table td {
      font-size: 0.78rem;
    }
    .gap-table tr:hover td {
      background: rgba(148, 163, 184, 0.03);
    }
    .badge-rank {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      background: rgba(0, 85, 255, 0.15);
      border: 1px solid rgba(0, 85, 255, 0.3);
      color: #3B82F6;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      font-weight: 700;
    }
    .badge-score {
      color: #22C55E;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
    }
    .cta-container {
      background: #0B1224;
      border: 1px solid rgba(0, 85, 255, 0.3);
      border-radius: 4px;
      padding: 1.75rem;
      text-align: center;
      margin-top: 1.25rem;
    }
    .cta-container h3 {
      font-size: 1.05rem;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: -0.01em;
    }
    .cta-container p {
      font-size: 0.78rem;
      color: #94A3B8;
      max-width: 600px;
      margin: 0.4rem auto 0 auto;
      line-height: 1.5;
    }
    .btn-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: #0055FF;
      color: #FFFFFF;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 0.75rem 1.6rem;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      text-decoration: none;
      transition: background 0.15s, border-color 0.15s;
      margin-top: 1.25rem;
      cursor: pointer;
    }
    .btn-action:hover {
      background: #0044CC;
      border-color: rgba(255, 255, 255, 0.3);
    }
    .footer-note {
      font-size: 0.65rem;
      color: #475569;
      font-family: 'JetBrains Mono', monospace;
      text-align: center;
      margin-top: 1.5rem;
      letter-spacing: 0.04em;
    }
  </style>
</head>
<body>
  ${gtmBodyScript}

  <div class="container">
    <div class="top-terminal-bar">
      <div class="security-pill">
        <span>●</span>
        <span>DOSSIÊ CONFIDENCIAL // USO EXCLUSIVO DA DIRETORIA</span>
      </div>
      <div>TERMINAL DE INTELIGÊNCIA TERRITORIAL & DEMANDA B2B</div>
    </div>

    <div class="doc-card">
      <div class="doc-header-strip">
        <div class="doc-title-block">
          <h1>Mapa de Vulnerabilidades e Gaps de Demanda</h1>
          <p>Diagnóstico tático formulado para a liderança de <strong>${lead.nome}</strong>. Análise de vazios territoriais desassistidos pela concorrência direta.</p>
        </div>
        <div class="doc-meta-badge">
          <div>DOCUMENTO AUDITADO</div>
          <div style="color: #94A3B8; font-weight: 700; margin-top: 0.15rem;">PROTOCOLO SEC-B2B</div>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <div class="label">Empresa Sob Análise</div>
          <div class="value">${lead.nome}</div>
          <div class="subvalue">CNPJ: ${formattedCnpj}</div>
        </div>
        <div class="meta-item">
          <div class="label">Praça Geográfica</div>
          <div class="value">${lead.municipio || 'Brasil'} / ${lead.uf || 'BR'}</div>
          <div class="subvalue">PORTE: ${lead.porte || 'DEMAIS'}</div>
        </div>
        <div class="meta-item">
          <div class="label">Destinatário Executivo (QSA)</div>
          <div class="value">${decisor}</div>
          <div class="subvalue">DIRETORIA CORPORATIVA</div>
        </div>
      </div>

      <div class="section-title">
        <h2>Zonas de Oportunidade Desassistidas (Gaps Territoriais)</h2>
        <span class="section-tag">ENGINE: GEOSPATIAL VERSUS v2.4</span>
      </div>

      <table class="gap-table">
        <thead>
          <tr>
            <th>Classificação</th>
            <th>Microrregião / Praça</th>
            <th>Distância de Concorrência</th>
            <th style="text-align: right;">Índice de Potencial</th>
          </tr>
        </thead>
        <tbody>
          ${gapRowsHtml}
        </tbody>
      </table>
    </div>

    <!-- Painel de Ação Executiva (Cavalo de Troia / Conversão B2B) -->
    <div class="cta-container">
      <h3>Aprofundamento de Inteligência Territorial & Matriz de Expansão</h3>
      <p>
        Disponibilizamos uma sessão executiva restrita (15 minutos) para apresentar a matriz nominal de clientes ativos da concorrência e o plano de captura de demanda na sua praça.
      </p>
      <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-action">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
        </svg>
        <span>Solicitar Sessão Estratégica via WhatsApp</span>
      </a>
    </div>

    <div class="footer-note">
      VERSUS ENTERPRISE INTELLIGENCE // GOVERNANÇA E AUDITORIA DE MERCADO B2B // CRYPTO HASH: ${lead.cnpj}
    </div>
  </div>
</body>
</html>`;
  }
};
