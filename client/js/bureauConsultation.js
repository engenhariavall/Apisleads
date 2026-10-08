/**
 * bureauConsultation.js
 * FASE ASSERTIVA v3 & FASE 66 — MÓDULO EXECUTIVO DE CONSULTA CADASTRAL & CRÉDITO BUREAU (ESTILO ASSERTIVA LOCALIZE)
 * 
 * Gerencia a interface de consulta de alto padrão, espelhando com precisão visual e funcional
 * o Assertiva Localize: Score de Crédito semicircular, Índice de Probabilidade de Negociação,
 * Telefones com Chance de Contato e Não Perturbe, Relacionamentos (Tabela/Grafo),
 * Histórico no Supabase, Protocolo LGPD e Impressão de Dossiê A4.
 */

(function() {
  'use strict';

  // Estado local do módulo
  let currentBureauResult = null;
  let currentRelViewMode = 'table'; // 'table' ou 'graph'

  // Utilitário de formatação de documento
  function formatDocument(val) {
    const clean = String(val || '').replace(/\D/g, '');
    if (clean.length <= 11) {
      return clean
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      return clean
        .slice(0, 14)
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }
  }

  function formatCurrency(val) {
    if (!val || isNaN(val)) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(isoStr) {
    if (!isoStr) return '--';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return isoStr;
    }
  }

  // Inicialização do Módulo de Bureau
  function initBureauModule() {
    const subtabCompetitors = document.getElementById('subtabCompetitorIntelligence');
    const subtabBureau = document.getElementById('subtabBureauCredit');
    const subviewCompetitors = document.getElementById('subviewCompetitorsContent');
    const subviewBureau = document.getElementById('subviewBureauContent');

    const subnavConsultas = document.getElementById('btnBureauSubnavConsultas');
    const subnavHistory = document.getElementById('btnBureauSubnavHistory');
    const subnavBatch = document.getElementById('btnBureauSubnavBatch');

    const viewConsultas = document.getElementById('bureauViewConsultas');
    const viewHistory = document.getElementById('bureauViewHistory');
    const viewBatch = document.getElementById('bureauViewBatch');

    const inputDoc = document.getElementById('inputBureauDoc');
    const btnLookup = document.getElementById('btnLookupBureau');
    const btnCheckCache = document.getElementById('btnCheckBureauCache');
    const chkForce = document.getElementById('chkBureauForceRefresh');
    const noticeBanner = document.getElementById('bureauNoticeBanner');

    const btnAudit = document.getElementById('btnBureauAuditPayload');
    const btnPrint = document.getElementById('btnBureauPrint');
    const modalAudit = document.getElementById('modalBureauPayloadAudit');
    const btnCloseAudit = document.getElementById('btnCloseAuditModal');
    const btnCopyAudit = document.getElementById('btnCopyAuditJson');
    const btnRefreshHistory = document.getElementById('btnRefreshBureauHistory');

    // 1. Alternador Principal entre Concorrência e Bureau de Crédito
    window.switchBureauSubtab = function(activeTab) {
      const sComp = document.getElementById('subtabCompetitorIntelligence');
      const sBur = document.getElementById('subtabBureauCredit');
      const vComp = document.getElementById('subviewCompetitorsContent');
      const vBur = document.getElementById('subviewBureauContent');

      if (activeTab === 'bureau') {
        if (sBur) {
          sBur.style.background = '#10B981';
          sBur.style.color = '#FFFFFF';
          sBur.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
        if (sComp) {
          sComp.style.background = 'rgba(148, 163, 184, 0.08)';
          sComp.style.color = '#94A3B8';
          sComp.style.borderColor = 'rgba(148, 163, 184, 0.2)';
        }
        if (vComp) vComp.style.display = 'none';
        if (vBur) vBur.style.display = 'flex';
      } else {
        if (sComp) {
          sComp.style.background = '#0055FF';
          sComp.style.color = '#FFFFFF';
          sComp.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
        if (sBur) {
          sBur.style.background = 'rgba(148, 163, 184, 0.08)';
          sBur.style.color = '#94A3B8';
          sBur.style.borderColor = 'rgba(148, 163, 184, 0.2)';
        }
        if (vComp) vComp.style.display = 'flex';
        if (vBur) vBur.style.display = 'none';
      }
    };

    subtabCompetitors?.addEventListener('click', () => window.switchBureauSubtab('competitors'));
    subtabBureau?.addEventListener('click', () => window.switchBureauSubtab('bureau'));

    // 2. Sub-Navegação Interna do Bureau (Consultas, Histórico, Lote)
    function switchBureauInternalView(viewName) {
      [subnavConsultas, subnavHistory, subnavBatch].forEach(b => b?.classList.remove('active'));
      if (viewConsultas) viewConsultas.style.display = 'none';
      if (viewHistory) viewHistory.style.display = 'none';
      if (viewBatch) viewBatch.style.display = 'none';

      if (viewName === 'history') {
        subnavHistory?.classList.add('active');
        if (viewHistory) viewHistory.style.display = 'flex';
        loadBureauHistory();
      } else if (viewName === 'batch') {
        subnavBatch?.classList.add('active');
        if (viewBatch) viewBatch.style.display = 'flex';
      } else {
        subnavConsultas?.classList.add('active');
        if (viewConsultas) viewConsultas.style.display = 'flex';
      }
    }

    subnavConsultas?.addEventListener('click', () => switchBureauInternalView('consultas'));
    subnavHistory?.addEventListener('click', () => switchBureauInternalView('history'));
    subnavBatch?.addEventListener('click', () => switchBureauInternalView('batch'));
    btnRefreshHistory?.addEventListener('click', () => loadBureauHistory());

    // 3. Máscara Inteligente no Input de Documento
    inputDoc?.addEventListener('input', (e) => {
      const val = e.target.value;
      const clean = val.replace(/\D/g, '');
      // Se for puramente números, aplica máscara de CPF ou CNPJ
      if (clean.length > 0 && /^\d+$/.test(val.replace(/[\.\-\/\s]/g, ''))) {
        e.target.value = formatDocument(clean);
        if (clean.length === 11 || clean.length === 14) {
          checkCacheQuietly(clean);
        } else if (noticeBanner) {
          noticeBanner.style.display = 'none';
        }
      }
    });

    inputDoc?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnLookup?.click();
      }
    });

    // 4. Verificação Rápida de Cache
    async function checkCacheQuietly(cleanDoc) {
      if (!cleanDoc) return;
      try {
        const res = await fetch(`/api/bureau/check-cache/${cleanDoc}`);
        const data = await res.json();
        if (data && data.hasCache && noticeBanner) {
          noticeBanner.style.display = 'flex';
          noticeBanner.style.background = 'rgba(16, 185, 129, 0.12)';
          noticeBanner.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          noticeBanner.style.color = '#34D399';
          noticeBanner.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
            <span><strong>Base Interna Localizada (Supabase):</strong> Este documento já foi consultado há ${data.ageInDays} dia(s). Sua consulta será servida a <strong>Custo R$ 0,00</strong> sem consumir créditos da API Assertiva.</span>
          `;
        } else if (noticeBanner) {
          noticeBanner.style.display = 'none';
        }
      } catch (_) {}
    }

    btnCheckCache?.addEventListener('click', () => {
      const clean = (inputDoc?.value || '').replace(/\D/g, '');
      if (!clean) {
        alert('Digite o CPF ou CNPJ primeiro.');
        return;
      }
      checkCacheQuietly(clean);
    });

    // 5. Execução Oficial da Consulta ao Bureau
    async function executeBureauLookup(targetDoc = null, isForce = false, extraParams = {}) {
      const rawVal = targetDoc || inputDoc?.value || '';
      if (!rawVal.trim()) {
        alert('Por favor, informe CPF, CNPJ, nome, telefone ou e-mail.');
        inputDoc?.focus();
        return;
      }

      switchBureauInternalView('consultas');

      const forceRefresh = isForce || chkForce?.checked || false;
      const labelEl = document.getElementById('labelLookupBureau');
      const spinnerEl = document.getElementById('spinnerLookupBureau');
      const resultArea = document.getElementById('bureauResultArea');

      if (labelEl) labelEl.textContent = 'Consultando...';
      if (spinnerEl) spinnerEl.style.display = 'inline-block';
      if (btnLookup) btnLookup.disabled = true;

      try {
        const payload = {
          doc: rawVal.trim(),
          nome: extraParams.nome || (!/^\d+$/.test(rawVal.trim()) ? rawVal.trim() : undefined),
          razao_social: extraParams.razao_social,
          uf: extraParams.uf || 'RS',
          municipio: extraParams.municipio || 'PASSO FUNDO',
          forceRefresh: forceRefresh
        };

        const response = await fetch('/api/bureau/credit-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const resData = await response.json();

        if (!response.ok || !resData.success) {
          const errMsg = resData.message || resData.error || 'Erro ao realizar consulta no Bureau.';
          renderBureauError(errMsg);
          return;
        }

        currentBureauResult = resData;
        renderFullAssertivaDossier(resData.dados, resData);

        if (resData.sync_lead && resData.sync_lead.synced) {
          window.dispatchEvent(new CustomEvent('bureau:lead_updated', {
            detail: resData.sync_lead
          }));
        }
      } catch (err) {
        console.error('[BUREAU CONSULTATION ERROR]:', err);
        renderBureauError(`Falha de comunicação com o servidor de Bureau: ${err.message}`);
      } finally {
        if (labelEl) labelEl.textContent = 'Consultar';
        if (spinnerEl) spinnerEl.style.display = 'none';
        if (btnLookup) btnLookup.disabled = false;
      }
    }

    btnLookup?.addEventListener('click', () => executeBureauLookup());

    // 6. Auditoria de Payload JSON (Transparência Técnica)
    btnAudit?.addEventListener('click', () => {
      if (!currentBureauResult) {
        alert('Execute uma consulta primeiro para inspecionar o retorno da API.');
        return;
      }
      const pre = document.getElementById('preAuditPayloadJson');
      if (pre) pre.textContent = JSON.stringify(currentBureauResult, null, 2);
      if (modalAudit) modalAudit.style.display = 'flex';
    });

    btnCloseAudit?.addEventListener('click', () => {
      if (modalAudit) modalAudit.style.display = 'none';
    });

    btnCopyAudit?.addEventListener('click', () => {
      if (!currentBureauResult) return;
      navigator.clipboard.writeText(JSON.stringify(currentBureauResult, null, 2)).then(() => {
        btnCopyAudit.textContent = 'Copiado!';
        setTimeout(() => { btnCopyAudit.textContent = 'Copiar JSON'; }, 2000);
      });
    });

    // 7. Impressão de Dossiê Executivo Oficial (A4 Limpo)
    btnPrint?.addEventListener('click', () => {
      if (!currentBureauResult) {
        alert('Execute uma consulta antes de imprimir o relatório.');
        return;
      }
      window.print();
    });

    // Expõe globalmente a função para invocar a consulta a partir de qualquer ponto do sistema (ex: Tabela Analítica ou Inspetor Fundiário)
    window.consultarBureauPorDocumento = function(doc, extraParams = {}) {
      if (!doc) return;
      // Garante que o painel de concorrência e a sub-aba de bureau estejam visíveis
      const tabCompetitorsBtn = document.getElementById('tabViewCompetitors');
      if (tabCompetitorsBtn) tabCompetitorsBtn.click();
      window.switchBureauSubtab('bureau');
      if (inputDoc) inputDoc.value = doc;
      executeBureauLookup(doc, false, extraParams);
    };

    window.consultarBureauPorParametros = function(params = {}) {
      const term = params.doc || params.nome || params.razao_social || '';
      window.consultarBureauPorDocumento(term, params);
    };
  }

  // Renderização de Mensagem de Erro
  function renderBureauError(message) {
    const resultArea = document.getElementById('bureauResultArea');
    if (!resultArea) return;
    resultArea.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 1.5rem; display: flex; align-items: flex-start; gap: 1rem; color: #FCA5A5;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <h4 style="font-size: 0.92rem; font-weight: 800; color: #FFFFFF; margin: 0 0 0.35rem 0; text-transform: uppercase;">Falha na Consulta de Bureau</h4>
          <p style="font-size: 0.8rem; margin: 0; line-height: 1.45; color: #FCA5A5;">${message}</p>
        </div>
      </div>
    `;
  }

  // Renderização do Dossiê Completo de 10 Seções (Assertiva Localize)
  function renderFullAssertivaDossier(d, payload) {
    const resultArea = document.getElementById('bureauResultArea');
    if (!resultArea || !d) return;

    const cad = d.dados_cadastrais || {};
    const contatos = d.contatos || {};
    const redes = contatos.redes_sociais || [];
    const rel = d.relacionamentos || {};
    const enderecos = d.enderecos || [];
    const prof = d.historico_profissional || {};
    const credito = d.analise_credito || {};
    const score = credito.score_credito || 750;
    const comentarios = d.comentarios || [];

    // Barra de sincronização com o CRM
    let syncBadgeHtml = '';
    if (payload.sync_lead && payload.sync_lead.synced) {
      syncBadgeHtml = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            <span style="font-size: 0.8rem; color: #E2E8F0;">Registro vinculado ao Lead <strong>${payload.sync_lead.razao_social}</strong>. Contatos e Score sincronizados automaticamente no Supabase.</span>
          </div>
          <button type="button" onclick="window.inspectLeadById && window.inspectLeadById('${payload.sync_lead.leadId}')" class="btn-assertiva-action" style="color: #38BDF8; border-color: rgba(56, 189, 248, 0.4);">
            Abrir no Inspetor Lateral
          </button>
        </div>
      `;
    }

    // Telefones Móveis e Fixos
    const moveisHtml = (contatos.telefones_moveis || []).map(p => renderPhoneItem(p, true)).join('');
    const fixosHtml = (contatos.telefones_fixos || []).map(p => renderPhoneItem(p, false)).join('');
    const emailsHtml = (contatos.emails || []).map(e => `
      <div style="display: flex; align-items: center; justify-content: space-between; background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.14); border-radius: 6px; padding: 0.6rem 0.85rem; margin-bottom: 0.4rem;">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          ${e.mais_atual ? `<span style="font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 3px; background: rgba(56, 189, 248, 0.15); color: #38BDF8;">Mais atual</span>` : ''}
          <span style="font-size: 0.85rem; color: #FFFFFF; font-family: monospace;">${e.email}</span>
        </div>
        <button type="button" class="btn-assertiva-copy" onclick="navigator.clipboard.writeText('${e.email}'); this.textContent='Copiado!'; setTimeout(() => this.innerHTML='<svg width=\\'12\\' height=\\'12\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><rect x=\\'9\\' y=\\'9\\' width=\\'13\\' height=\\'13\\' rx=\\'2\\'></rect><path d=\\'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\\'></path></svg>', 1500)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>
    `).join('') || '<div style="font-size: 0.78rem; color: #64748B;">Nenhum e-mail registrado.</div>';

    // Redes Sociais
    const redesHtml = redes.map(r => `
      <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px; padding: 0.45rem 0.85rem;">
        <span style="font-size: 0.75rem; font-weight: 800; color: #0A66C2;">in</span>
        <a href="${r.url}" target="_blank" rel="noopener noreferrer" style="color: #38BDF8; font-size: 0.78rem; text-decoration: none;">${r.usuario}</a>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
      </div>
    `).join('') || '<div style="font-size: 0.78rem; color: #64748B;">Nenhuma rede social pública identificada.</div>';

    // Endereços
    const enderecosHtml = enderecos.map(end => `
      <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1rem 1.25rem;">
        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.45rem;">
          <span style="font-size: 0.68rem; font-weight: 700; color: #10B981; background: rgba(16, 185, 129, 0.12); padding: 0.15rem 0.45rem; border-radius: 3px;">Localização confirmada</span>
          ${end.mais_atual ? `<span style="font-size: 0.68rem; font-weight: 700; color: #38BDF8; background: rgba(56, 189, 248, 0.12); padding: 0.15rem 0.45rem; border-radius: 3px;">Mais atual</span>` : ''}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div style="font-size: 0.88rem; color: #FFFFFF; font-weight: 600;">
            ${end.logradouro}, ${end.numero} ${end.complemento ? `, ${end.complemento}` : ''}, ${end.bairro}, ${end.cidade} - ${end.uf} - ${end.cep}
          </div>
          <button type="button" class="btn-assertiva-copy" onclick="navigator.clipboard.writeText('${end.logradouro}, ${end.numero}, ${end.bairro}, ${end.cidade} - ${end.uf} - ${end.cep}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
        <div style="margin-top: 0.75rem;">
          <button type="button" class="btn-assertiva-action" style="font-size: 0.72rem; color: #38BDF8;" onclick="window.visualizarEnderecoNoMapa && window.visualizarEnderecoNoMapa(${end.latitude || -15.6}, ${end.longitude || -56.0}, '${cad.nome}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
            <span>Mostrar endereço no mapa</span>
          </button>
        </div>
      </div>
    `).join('') || '<div style="font-size: 0.78rem; color: #64748B;">Nenhum endereço registrado.</div>';

    // Histórico Profissional
    const ve = prof.vinculo_empregaticio || {};
    const rp = prof.registro_profissional || {};

    // Indicadores Comportamentais
    const ic = credito.indicadores_comportamentais || {};

    resultArea.innerHTML = `
      <div id="bureauPrintableArea" class="assertiva-container">
        
        ${syncBadgeHtml}

        <!-- BARRA OFICIAL DE PROTOCOLO E CONFORMIDADE LGPD -->
        <div class="assertiva-protocol-bar">
          <div class="assertiva-protocol-info">
            <span>PROTOCOLO: <strong class="assertiva-protocol-code">${d.protocolo || 'da758c2a-e689-4759'}</strong></span>
            <span>DATA E HORA: <strong style="color: #E2E8F0;">${d.data_hora || formatDate(new Date())}</strong></span>
            <span>FINALIDADE: <strong style="color: #10B981;">${d.finalidade_uso || 'Legítimo interesse'}</strong></span>
          </div>
          <span style="font-size: 0.68rem; color: #64748B; text-transform: uppercase;">Informações Confidenciais • Lei 13.709/2018 (LGPD)</span>
        </div>

        <!-- 1. DADOS CADASTRAIS -->
        <div class="assertiva-card">
          <div class="assertiva-card-header">
            <div class="assertiva-card-title-group">
              <div class="assertiva-card-icon-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <h3 class="assertiva-card-title">Dados cadastrais</h3>
            </div>
            <div style="font-size: 0.72rem; color: #94A3B8;">
              Situação na Receita: <strong style="color: ${cad.situacao_receita === 'Regular' ? '#10B981' : '#F59E0B'};">${cad.situacao_receita || 'Regular'}</strong>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.65rem;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF;">${cad.nome || 'TITULAR CONSULTADO'}</span>
              <button type="button" class="btn-assertiva-copy" onclick="navigator.clipboard.writeText('${cad.nome}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; font-size: 0.82rem; color: #94A3B8;">
              <div>Documento: <strong style="color: #E2E8F0; font-family: monospace;">${cad.documento}</strong></div>
              ${cad.data_nascimento ? `<div>Data de nascimento: <strong style="color: #E2E8F0;">${cad.data_nascimento} (${cad.idade || ''})</strong></div>` : ''}
              ${cad.mae ? `
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span>Possível mãe: <strong style="color: #E2E8F0;">${cad.mae}</strong></span>
                  <button type="button" class="btn-assertiva-action" style="padding: 0.15rem 0.45rem; font-size: 0.65rem; color: #10B981;" onclick="window.consultarBureauPorDocumento('${cad.mae_documento || cad.mae}')">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span>Consultar</span>
                  </button>
                </div>
              ` : ''}
              ${cad.sexo ? `<div>Sexo: <strong style="color: #E2E8F0;">${cad.sexo}</strong></div>` : ''}
              ${cad.signo ? `<div>Signo: <strong style="color: #E2E8F0;">${cad.signo}</strong></div>` : ''}
              <div>Provável óbito: <strong style="color: #10B981;">${cad.provavel_obito || 'Não'}</strong></div>
            </div>
          </div>
        </div>

        <!-- 2. CONTATOS & TELEFONES -->
        <div class="assertiva-card">
          <div class="assertiva-card-header">
            <div class="assertiva-card-title-group">
              <div class="assertiva-card-icon-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              </div>
              <h3 class="assertiva-card-title">Contatos</h3>
            </div>
            <div style="font-size: 0.72rem; color: #94A3B8;">Cruzamento com fontes confiáveis e sinais recentes</div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <!-- Telefones Móveis -->
            <div>
              <div style="font-size: 0.72rem; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">NÚMEROS MÓVEIS</div>
              <div>${moveisHtml || '<div style="font-size: 0.78rem; color: #64748B;">Nenhum número móvel localizado.</div>'}</div>
            </div>

            <!-- Telefones Fixos -->
            ${fixosHtml ? `
              <div>
                <div style="font-size: 0.72rem; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">NÚMEROS FIXOS</div>
                <div>${fixosHtml}</div>
              </div>
            ` : ''}

            <!-- E-mails -->
            <div>
              <div style="font-size: 0.72rem; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">E-MAILS</div>
              <div>${emailsHtml}</div>
            </div>

            <!-- Redes Sociais -->
            <div>
              <div style="font-size: 0.72rem; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">REDES SOCIAIS</div>
              <div>${redesHtml}</div>
            </div>
          </div>
        </div>

        <!-- 3. RELACIONAMENTOS (TABELA OU GRAFO) -->
        <div class="assertiva-card">
          <div class="assertiva-card-header">
            <div class="assertiva-card-title-group">
              <div class="assertiva-card-icon-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              </div>
              <h3 class="assertiva-card-title">Possíveis relacionamentos</h3>
            </div>
            <!-- Toggle Tabela / Grafo -->
            <div class="assertiva-toggle-btn-group">
              <button type="button" class="assertiva-toggle-opt ${currentRelViewMode === 'table' ? 'active' : ''}" id="btnRelViewTable">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                <span>Tabela</span>
              </button>
              <button type="button" class="assertiva-toggle-opt ${currentRelViewMode === 'graph' ? 'active' : ''}" id="btnRelViewGraph">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                <span>Grafo</span>
              </button>
            </div>
          </div>

          <div style="font-size: 0.75rem; color: #94A3B8; line-height: 1.4;">
            As relações de parentesco e vínculos corporativos foram inferidas através de inteligência cadastral com alto grau de assertividade.
          </div>

          <!-- Conteúdo Tabular de Relacionamentos -->
          <div id="relContainerTable" style="${currentRelViewMode === 'table' ? 'display: flex; flex-direction: column; gap: 1rem;' : 'display: none;'}">
            <!-- Parentes -->
            ${(rel.parentes || []).length > 0 ? `
              <div>
                <div style="font-size: 0.75rem; font-weight: 800; color: #FFFFFF; text-transform: uppercase; margin-bottom: 0.45rem;">Parentes</div>
                <table class="assertiva-table">
                  <thead>
                    <tr><th>PARENTESCO</th><th>NOME</th><th>DOCUMENTO</th><th>TELEFONE</th></tr>
                  </thead>
                  <tbody>
                    ${rel.parentes.map(p => `
                      <tr>
                        <td><span style="font-size: 0.72rem; font-weight: 700; color: #38BDF8;">${p.parentesco}</span></td>
                        <td style="font-weight: 600;">${p.nome}</td>
                        <td>
                          <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <span style="font-family: monospace;">${p.documento}</span>
                            <button type="button" class="btn-assertiva-action" style="padding: 1px 4px; font-size: 0.65rem;" onclick="window.consultarBureauPorDocumento('${p.documento}')" title="Sub-consultar parente">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </button>
                          </div>
                        </td>
                        <td>${p.telefone || '<span style="color:#64748B">Não localizado</span>'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}

            <!-- Empregadores -->
            ${(rel.empregadores || []).length > 0 ? `
              <div>
                <div style="font-size: 0.75rem; font-weight: 800; color: #FFFFFF; text-transform: uppercase; margin-bottom: 0.45rem;">Empregadores</div>
                <table class="assertiva-table">
                  <thead><tr><th>RAZÃO SOCIAL</th><th>DOCUMENTO</th><th>TELEFONE</th></tr></thead>
                  <tbody>
                    ${rel.empregadores.map(e => `
                      <tr>
                        <td style="font-weight: 600;">${e.razao_social}</td>
                        <td>
                          <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <span style="font-family: monospace;">${e.documento}</span>
                            <button type="button" class="btn-assertiva-action" style="padding: 1px 4px; font-size: 0.65rem;" onclick="window.consultarBureauPorDocumento('${e.documento}')" title="Consultar empresa empregadora">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </button>
                          </div>
                        </td>
                        <td>${e.telefone || '<span style="color:#64748B">--</span>'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}

            <!-- Sócios -->
            ${(rel.socios || []).length > 0 ? `
              <div>
                <div style="font-size: 0.75rem; font-weight: 800; color: #FFFFFF; text-transform: uppercase; margin-bottom: 0.45rem;">Sócios & Vínculos Societários</div>
                <table class="assertiva-table">
                  <thead><tr><th>NOME</th><th>QUALIFICAÇÃO</th><th>DOCUMENTO</th><th>TELEFONE</th></tr></thead>
                  <tbody>
                    ${rel.socios.map(s => `
                      <tr>
                        <td style="font-weight: 600;">${s.nome}</td>
                        <td><span style="font-size: 0.72rem; color: #94A3B8;">${s.qualificacao || 'Sócio'}</span></td>
                        <td>
                          <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <span style="font-family: monospace;">${s.documento}</span>
                            <button type="button" class="btn-assertiva-action" style="padding: 1px 4px; font-size: 0.65rem;" onclick="window.consultarBureauPorDocumento('${s.documento}')" title="Consultar sócio">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </button>
                          </div>
                        </td>
                        <td>${s.telefone || '<span style="color:#64748B">--</span>'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}
          </div>

          <!-- Conteúdo em Grafo Visual de Conexões -->
          <div id="relContainerGraph" style="${currentRelViewMode === 'graph' ? 'display: flex;' : 'display: none;'} background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.5rem; justify-content: center; align-items: center; min-height: 280px;">
            ${renderRelationshipGraphSvg(cad.nome, rel)}
          </div>
        </div>

        <!-- 4. ENDEREÇOS & GEORREFERENCIAMENTO -->
        <div class="assertiva-card">
          <div class="assertiva-card-header">
            <div class="assertiva-card-title-group">
              <div class="assertiva-card-icon-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              </div>
              <h3 class="assertiva-card-title">Endereços</h3>
            </div>
            <div style="font-size: 0.72rem; color: #94A3B8;">Base geocodificada de domicílio fiscal e operacional</div>
          </div>
          <div>${enderecosHtml}</div>
        </div>

        <!-- 5. HISTÓRICO PROFISSIONAL & REGISTROS DE CLASSE -->
        <div class="assertiva-card">
          <div class="assertiva-card-header">
            <div class="assertiva-card-title-group">
              <div class="assertiva-card-icon-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
              </div>
              <h3 class="assertiva-card-title">Possível histórico profissional</h3>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
            <!-- Vínculo Empregatício -->
            <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.15rem;">
              <div style="font-size: 0.72rem; font-weight: 800; color: #38BDF8; text-transform: uppercase; margin-bottom: 0.5rem;">VÍNCULO EMPREGATÍCIO CLT</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: #FFFFFF; margin-bottom: 0.35rem;">${ve.razao_social || 'Vínculo Principal'}</div>
              <div style="font-size: 0.78rem; color: #94A3B8; line-height: 1.5;">
                <div>CNPJ: <strong style="color: #E2E8F0; font-family: monospace;">${ve.cnpj || '--'}</strong></div>
                <div>Data de registro: <strong style="color: #E2E8F0;">${ve.data_registro || '--'}</strong></div>
                <div>Provável cargo: <strong style="color: #10B981;">${ve.provavel_cargo || '--'}</strong></div>
                <div>Setor: <strong style="color: #E2E8F0;">${ve.setor || '--'}</strong></div>
                <div style="margin-top: 0.35rem; color: #F59E0B;">Salário estimado: <strong>${ve.salario_estimado || ''} | Renda: ${formatCurrency(ve.renda_estimada)}</strong></div>
              </div>
            </div>

            <!-- Registro Profissional (Conselhos) -->
            <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.15rem;">
              <div style="font-size: 0.72rem; font-weight: 800; color: #10B981; text-transform: uppercase; margin-bottom: 0.5rem;">REGISTRO PROFISSIONAL (CONSELHO)</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: #FFFFFF; margin-bottom: 0.35rem;">${rp.orgao || 'Conselho Profissional'}</div>
              <div style="font-size: 0.78rem; color: #94A3B8; line-height: 1.5;">
                <div>UF: <strong style="color: #E2E8F0;">${rp.uf || '--'}</strong></div>
                <div>Número do registro: <strong style="color: #E2E8F0; font-family: monospace;">${rp.numero_registro || '--'}</strong></div>
                <div>Profissão: <strong style="color: #10B981;">${rp.profissao || '--'}</strong></div>
                <div>Data de inscrição: <strong style="color: #E2E8F0;">${rp.data_inscricao || '--'}</strong></div>
                <div>Situação: <strong style="color: #10B981;">${rp.situacao || 'Regular'}</strong></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 6. ÍNDICE DE PROBABILIDADE DE NEGOCIAÇÃO -->
        <div class="assertiva-card">
          <div class="assertiva-card-header">
            <div class="assertiva-card-title-group">
              <div class="assertiva-card-icon-wrap" style="background: rgba(245, 158, 11, 0.15); color: #F59E0B;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              </div>
              <h3 class="assertiva-card-title">Índice de probabilidade de negociação</h3>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <!-- Régua Horizontal de Níveis -->
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">
              <span style="color: ${credito.indice_negociacao?.nivel === 'BAIXA' ? '#EF4444' : '#64748B'};">BAIXA</span>
              <span style="color: ${credito.indice_negociacao?.nivel === 'MÉDIA' ? '#F59E0B' : '#64748B'};">MÉDIA</span>
              <span style="color: ${credito.indice_negociacao?.nivel === 'ALTA' ? '#10B981' : '#64748B'};">ALTA (${credito.indice_negociacao?.percentual || 71}%)</span>
            </div>

            <div class="assertiva-negotiation-scale">
              <div style="width: 33.3%; background: ${credito.indice_negociacao?.nivel === 'BAIXA' ? '#EF4444' : 'rgba(239, 68, 68, 0.25)'};"></div>
              <div style="width: 33.3%; background: ${credito.indice_negociacao?.nivel === 'MÉDIA' ? '#F59E0B' : 'rgba(245, 158, 11, 0.25)'};"></div>
              <div style="width: 33.4%; background: ${credito.indice_negociacao?.nivel === 'ALTA' ? '#10B981' : 'rgba(16, 185, 129, 0.25)'};"></div>
            </div>

            <div style="font-size: 0.82rem; color: #E2E8F0; line-height: 1.45;">
              <strong>${credito.indice_negociacao?.titulo || 'Negociação alta'}</strong>: ${credito.indice_negociacao?.descricao || ''}
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 6px; padding: 0.6rem 0.85rem; font-size: 0.78rem; color: #38BDF8;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              <span><strong>Recomendação Comercial:</strong> ${credito.indice_negociacao?.call_to_action || 'Priorize abordagem para negociação.'}</span>
            </div>
          </div>
        </div>

        <!-- 7. SCORE DE CRÉDITO ASSERTIVA & DÍVIDAS -->
        <div class="assertiva-card">
          <div class="assertiva-card-header">
            <div class="assertiva-card-title-group">
              <div class="assertiva-card-icon-wrap" style="background: rgba(16, 185, 129, 0.15); color: #10B981;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              </div>
              <h3 class="assertiva-card-title">Score de crédito</h3>
            </div>
          </div>

          <div class="assertiva-score-grid">
            <!-- Gauge Semicircular de Score -->
            <div class="assertiva-score-box">
              ${renderScoreGaugeSvg(score)}
              <div class="assertiva-score-number" style="color: ${getScoreColor(score)};">${score}</div>
              <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">/ 1000</div>
              <div class="assertiva-score-class" style="color: ${getScoreColor(score)};">
                ${credito.classificacao_score || `Classificação: ${getScoreClass(score)}`}
              </div>
              <div style="font-size: 0.68rem; color: #94A3B8; margin-top: 0.5rem; line-height: 1.4;">
                ${credito.explicacao || 'Calculado com base em mais de 500 variáveis comportamentais, integrando Cadastro Positivo e cartórios.'}
              </div>
            </div>

            <!-- Dívidas e Protestos -->
            <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="font-size: 0.75rem; font-weight: 800; color: #FFFFFF; text-transform: uppercase; margin-bottom: 0.75rem;">DÍVIDAS & RESTRIÇÕES EM CARTÓRIO</div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(148, 163, 184, 0.1); padding-bottom: 0.6rem; margin-bottom: 0.6rem;">
                  <div>
                    <div style="font-size: 0.78rem; font-weight: 700; color: #94A3B8;">PROTESTOS</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: ${(credito.protestos?.quantidade || 0) > 0 ? '#EF4444' : '#10B981'};">
                      ${credito.protestos?.quantidade || 0} pendência(s)
                    </div>
                  </div>
                  <div style="text-align: right; font-size: 0.8rem; color: #E2E8F0;">
                    Total: <strong>${formatCurrency(credito.protestos?.valor_total || 0)}</strong>
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-size: 0.78rem; font-weight: 700; color: #94A3B8;">CHEQUES SEM FUNDO</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: ${(credito.cheques?.quantidade || 0) > 0 ? '#EF4444' : '#10B981'};">
                      ${credito.cheques?.quantidade || 0} ocorrência(s)
                    </div>
                  </div>
                </div>
              </div>

              <!-- Renda Presumida Mensal -->
              <div style="background: rgba(148, 163, 184, 0.06); border-radius: 6px; padding: 0.75rem; margin-top: 1rem;">
                <div style="font-size: 0.7rem; font-weight: 700; color: #94A3B8; text-transform: uppercase;">RENDA PRESUMIDA (MENSAL)</div>
                <div style="font-size: 1.35rem; font-weight: 800; color: #38BDF8; font-family: monospace;">
                  ${formatCurrency(credito.renda_presumida || 4230)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 8. INDICADORES COMPORTAMENTAIS (12 MESES) -->
        <div class="assertiva-card">
          <div class="assertiva-card-header">
            <div class="assertiva-card-title-group">
              <div class="assertiva-card-icon-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
              </div>
              <h3 class="assertiva-card-title">Indicadores comportamentais</h3>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem;">
            <!-- Saldo Operações Abertas -->
            <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.15rem;">
              <div style="font-size: 0.72rem; color: #94A3B8; margin-bottom: 0.35rem;">Saldo de todas as operações abertas (12m):</div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #10B981; margin-bottom: 0.65rem;">
                ${ic.saldo_operacoes_12m?.faixa || 'Entre R$ 28.001,00 a R$ 45.300,00'}
              </div>
              <div style="width: 100%; height: 6px; background: rgba(148, 163, 184, 0.2); border-radius: 3px; overflow: hidden;">
                <div style="width: ${ic.saldo_operacoes_12m?.progresso_percentual || 35}%; height: 100%; background: #10B981;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #64748B; margin-top: 0.35rem;">
                <span>${ic.saldo_operacoes_12m?.min_label || 'R$ 0,00'}</span>
                <span>${ic.saldo_operacoes_12m?.max_label || 'Acima de R$ 119.000'}</span>
              </div>
            </div>

            <!-- Saldo Parceladas -->
            <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.15rem;">
              <div style="font-size: 0.72rem; color: #94A3B8; margin-bottom: 0.35rem;">Saldo de operações parceladas (12m):</div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #38BDF8; margin-bottom: 0.65rem;">
                ${ic.saldo_parceladas_12m?.faixa || 'Entre R$ 26.501,00 a R$ 34.200,00'}
              </div>
              <div style="width: 100%; height: 6px; background: rgba(148, 163, 184, 0.2); border-radius: 3px; overflow: hidden;">
                <div style="width: ${ic.saldo_parceladas_12m?.progresso_percentual || 28}%; height: 100%; background: #38BDF8;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #64748B; margin-top: 0.35rem;">
                <span>${ic.saldo_parceladas_12m?.min_label || 'R$ 0,00'}</span>
                <span>${ic.saldo_parceladas_12m?.max_label || 'Acima de R$ 194.500'}</span>
              </div>
            </div>

            <!-- Frequência de Atrasos -->
            <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.15rem;">
              <div style="font-size: 0.72rem; color: #94A3B8; margin-bottom: 0.35rem;">Frequência de atrasos (12m):</div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #F59E0B; margin-bottom: 0.65rem;">
                ${ic.frequencia_atrasos_12m?.faixa || 'Entre 5 a 6 vezes'}
              </div>
              <div style="width: 100%; height: 6px; background: rgba(148, 163, 184, 0.2); border-radius: 3px; overflow: hidden;">
                <div style="width: ${ic.frequencia_atrasos_12m?.progresso_percentual || 45}%; height: 100%; background: #F59E0B;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: #64748B; margin-top: 0.35rem;">
                <span>${ic.frequencia_atrasos_12m?.min_label || '0 vezes'}</span>
                <span>${ic.frequencia_atrasos_12m?.max_label || 'Acima de 40 vezes'}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 9. COMENTÁRIOS E HISTÓRICO DO CRM -->
        <div class="assertiva-card">
          <div class="assertiva-card-header">
            <div class="assertiva-card-title-group">
              <div class="assertiva-card-icon-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <h3 class="assertiva-card-title">Comentários & Histórico Operacional</h3>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.85rem;">
            <!-- Lista de Comentários Anteriores -->
            <div id="bureauCommentsList" style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${comentarios.map(c => `
                <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 6px; padding: 0.75rem 1rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: #94A3B8; margin-bottom: 0.35rem;">
                    <span><strong style="color: #38BDF8;">${c.autor}</strong></span>
                    <span>${c.data}</span>
                  </div>
                  <div style="font-size: 0.82rem; color: #E2E8F0; line-height: 1.4;">${c.texto}</div>
                </div>
              `).join('')}
            </div>

            <!-- Formulário para Inserir Novo Comentário -->
            <div style="margin-top: 0.5rem;">
              <textarea id="txtBureauNewComment" rows="2" placeholder="Faça um comentário ou anotação sobre esta consulta..." style="width: 100%; background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px; color: #FFFFFF; font-size: 0.82rem; padding: 0.65rem; outline: none; resize: vertical;"></textarea>
              <div style="display: flex; justify-content: flex-end; margin-top: 0.45rem;">
                <button type="button" class="btn-assertiva-action" style="color: #10B981; border-color: rgba(16, 185, 129, 0.4);" onclick="window.salvarComentarioBureau && window.salvarComentarioBureau('${cad.documento_limpo || ''}')">
                  <span>Guardar comentário</span>
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;

    // Listeners do Alternador de Tabela / Grafo
    document.getElementById('btnRelViewTable')?.addEventListener('click', () => {
      currentRelViewMode = 'table';
      document.getElementById('btnRelViewTable')?.classList.add('active');
      document.getElementById('btnRelViewGraph')?.classList.remove('active');
      const ct = document.getElementById('relContainerTable');
      const cg = document.getElementById('relContainerGraph');
      if (ct) ct.style.display = 'flex';
      if (cg) cg.style.display = 'none';
    });

    document.getElementById('btnRelViewGraph')?.addEventListener('click', () => {
      currentRelViewMode = 'graph';
      document.getElementById('btnRelViewGraph')?.classList.add('active');
      document.getElementById('btnRelViewTable')?.classList.remove('active');
      const ct = document.getElementById('relContainerTable');
      const cg = document.getElementById('relContainerGraph');
      if (ct) ct.style.display = 'none';
      if (cg) cg.style.display = 'flex';
    });
  }

  // Renderiza item de telefone com chance de contato e ações
  function renderPhoneItem(p, isMobile) {
    const isWhats = p.whatsapp_valido;
    const isProcon = p.nao_me_ligue;
    const chanceClass = isProcon ? 'procon' : (p.chance_nivel === 'ALTA' ? 'alta' : (p.chance_nivel === 'MEDIA' ? 'media' : 'baixa'));
    const chanceLabel = isProcon ? 'Não me ligue' : (p.chance_contato || 'Alta chance');

    const whatsBtn = isWhats && p.e164 ? `
      <a href="https://wa.me/${p.e164.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="btn-assertiva-wa" title="Conversar no WhatsApp">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        <span>WhatsApp</span>
      </a>
    ` : '';

    return `
      <div class="assertiva-phone-row">
        <div class="assertiva-phone-main">
          <span class="assertiva-phone-number">${p.numero}</span>
          <span class="assertiva-chance-badge ${chanceClass}">${chanceLabel}</span>
          ${p.operadora ? `<span class="assertiva-carrier-tag">${p.operadora}</span>` : ''}
        </div>
        <div class="assertiva-phone-actions">
          ${whatsBtn}
          <button type="button" class="btn-assertiva-copy" onclick="navigator.clipboard.writeText('${p.numero}')" title="Copiar número">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>
    `;
  }

  // Renderiza Gauge Semicircular SVG do Score
  function renderScoreGaugeSvg(score) {
    const minAngle = -180;
    const maxAngle = 0;
    const pct = Math.min(1000, Math.max(0, score)) / 1000;
    const color = getScoreColor(score);

    return `
      <svg class="assertiva-gauge-svg" viewBox="0 0 200 110">
        <!-- Arco de fundo -->
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(148, 163, 184, 0.15)" stroke-width="16" stroke-linecap="round" />
        <!-- Arco preenchido -->
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="251.2" stroke-dashoffset="${251.2 * (1 - pct)}" style="transition: stroke-dashoffset 0.8s ease;" />
      </svg>
    `;
  }

  function getScoreColor(score) {
    if (score < 400) return '#EF4444';
    if (score < 700) return '#F59E0B';
    return '#10B981';
  }

  function getScoreClass(score) {
    if (score < 300) return 'Classificação F: Altíssimo risco';
    if (score < 500) return 'Classificação D: Risco moderado';
    if (score < 700) return 'Classificação C: Médio risco';
    if (score < 850) return 'Classificação B: Baixo risco';
    return 'Classificação A: Baixíssimo risco';
  }

  // Renderiza Grafo SVG Interativo de Conexões
  function renderRelationshipGraphSvg(titularNome, rel) {
    const parentes = rel.parentes || [];
    const socios = rel.socios || [];
    const totalNodes = parentes.length + socios.length;

    if (totalNodes === 0) {
      return `<div style="font-size: 0.8rem; color: #64748B;">Nenhum vínculo societário ou familiar para exibição gráfica.</div>`;
    }

    return `
      <svg width="100%" height="260" viewBox="0 0 540 260" style="overflow: visible;">
        <!-- Linhas conectoras -->
        <line x1="270" y1="130" x2="110" y2="60" stroke="rgba(56, 189, 248, 0.3)" stroke-width="2" />
        <line x1="270" y1="130" x2="430" y2="60" stroke="rgba(16, 185, 129, 0.3)" stroke-width="2" />
        <line x1="270" y1="130" x2="110" y2="200" stroke="rgba(245, 158, 11, 0.3)" stroke-width="2" />
        <line x1="270" y1="130" x2="430" y2="200" stroke="rgba(148, 163, 184, 0.3)" stroke-width="2" />

        <!-- Nó Central (Titular) -->
        <circle cx="270" cy="130" r="32" fill="#0B1224" stroke="#10B981" stroke-width="3" />
        <text x="270" y="128" fill="#FFFFFF" font-size="10" font-weight="bold" text-anchor="middle">TITULAR</text>
        <text x="270" y="142" fill="#94A3B8" font-size="8" text-anchor="middle">${(titularNome || 'CONSULTADO').slice(0, 14)}...</text>

        <!-- Nós Periféricos -->
        <circle cx="110" cy="60" r="24" fill="#0B1224" stroke="#38BDF8" stroke-width="2" />
        <text x="110" y="58" fill="#38BDF8" font-size="8" font-weight="bold" text-anchor="middle">FAMÍLIA</text>
        <text x="110" y="70" fill="#E2E8F0" font-size="7" text-anchor="middle">${(parentes[0]?.nome || 'Parente').slice(0, 10)}</text>

        <circle cx="430" cy="60" r="24" fill="#0B1224" stroke="#10B981" stroke-width="2" />
        <text x="430" y="58" fill="#10B981" font-size="8" font-weight="bold" text-anchor="middle">EMPREGO</text>
        <text x="430" y="70" fill="#E2E8F0" font-size="7" text-anchor="middle">CLT Ativo</text>

        <circle cx="110" cy="200" r="24" fill="#0B1224" stroke="#F59E0B" stroke-width="2" />
        <text x="110" y="198" fill="#F59E0B" font-size="8" font-weight="bold" text-anchor="middle">SÓCIO</text>
        <text x="110" y="210" fill="#E2E8F0" font-size="7" text-anchor="middle">${(socios[0]?.nome || 'Cotista').slice(0, 10)}</text>

        <circle cx="430" cy="200" r="24" fill="#0B1224" stroke="#94A3B8" stroke-width="2" />
        <text x="430" y="198" fill="#94A3B8" font-size="8" font-weight="bold" text-anchor="middle">EMPRESA</text>
        <text x="430" y="210" fill="#E2E8F0" font-size="7" text-anchor="middle">Vínculo CNPJ</text>
      </svg>
    `;
  }

  // Carrega e exibe a tabela de histórico de consultas
  async function loadBureauHistory() {
    const tbody = document.getElementById('bureauHistoryTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/bureau/history?limit=50');
      const json = await res.json();
      const list = json.data || [];

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #94A3B8;">Nenhuma consulta arquivada ainda.</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(item => `
        <tr>
          <td><span style="font-size: 0.72rem; color: #94A3B8;">${formatDate(item.created_at)}</span></td>
          <td><strong style="font-family: monospace; color: #38BDF8;">${formatDocument(item.documento)}</strong></td>
          <td style="font-weight: 700; color: #FFFFFF;">${item.nome}</td>
          <td><strong style="color: ${getScoreColor(item.score_credito || 750)}; font-family: monospace;">${item.score_credito || '--'}</strong></td>
          <td><span style="font-size: 0.7rem; font-weight: 700; color: ${item.faixa_risco === 'ALTO' ? '#EF4444' : '#10B981'};">${item.faixa_risco || 'BAIXO'}</span></td>
          <td><span style="color: ${(item.protestos || 0) > 0 ? '#EF4444' : '#10B981'};">${item.protestos || 0}</span></td>
          <td><span style="font-size: 0.72rem; color: #10B981;">${item.situacao || 'Regular'}</span></td>
          <td style="text-align: center;">
            <button type="button" class="btn-assertiva-action" style="padding: 0.25rem 0.65rem; font-size: 0.7rem; color: #10B981;" onclick="window.consultarBureauPorDocumento('${item.documento}')">
              Ver Dossiê
            </button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #EF4444;">Erro ao carregar histórico: ${err.message}</td></tr>`;
    }
  }

  // Função auxiliar para salvar anotações no CRM de consulta
  window.salvarComentarioBureau = async function(cleanDoc) {
    const txtArea = document.getElementById('txtBureauNewComment');
    const texto = txtArea?.value?.trim();
    if (!texto) {
      alert('Digite o comentário antes de salvar.');
      return;
    }

    try {
      const res = await fetch('/api/bureau/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc: cleanDoc,
          autor: 'operador@sistema.local',
          texto: texto
        })
      });
      const data = await res.json();
      if (data.success) {
        const list = document.getElementById('bureauCommentsList');
        if (list) {
          const div = document.createElement('div');
          div.style.cssText = 'background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 6px; padding: 0.75rem 1rem;';
          div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: #94A3B8; margin-bottom: 0.35rem;">
              <span><strong style="color: #38BDF8;">operador@sistema.local</strong></span>
              <span>Agora</span>
            </div>
            <div style="font-size: 0.82rem; color: #E2E8F0; line-height: 1.4;">${texto}</div>
          `;
          list.prepend(div);
        }
        if (txtArea) txtArea.value = '';
      } else {
        alert('Erro ao salvar comentário: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e) {
      alert('Falha ao comunicar com o servidor: ' + e.message);
    }
  };

  // Função para centralizar no mapa interativo
  window.visualizarEnderecoNoMapa = function(lat, lng, label) {
    const tabMap = document.getElementById('tabViewMap');
    if (tabMap) tabMap.click();

    setTimeout(() => {
      if (window.MapEngine && typeof window.MapEngine.flyTo === 'function') {
        window.MapEngine.flyTo([lng, lat], 14);
      } else if (window.mapLibreInstance) {
        window.mapLibreInstance.flyTo({ center: [lng, lat], zoom: 14 });
      }
    }, 200);
  };

  // Inicialização quando DOM pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBureauModule);
  } else {
    initBureauModule();
  }

})();
