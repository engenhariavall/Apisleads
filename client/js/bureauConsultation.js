/**
 * bureauConsultation.js
 * FASE ASSERTIVA v3 — MÓDULO EXECUTIVO DE CONSULTA CADASTRAL & CRÉDITO BUREAU (ESTILO SERASA)
 * 
 * Gerencia a interface de consulta de CPF e CNPJ, termômetro de score de crédito,
 * histórico de protestos, telefones validados com WhatsApp e sincronização global
 * com o CRM sob diretrizes estritas de anti-desperdício de créditos.
 */

(function() {
  'use strict';

  // Estado local do módulo
  let currentBureauResult = null;

  // Utilitário de formatação de documento
  function formatDocument(val) {
    const clean = String(val || '').replace(/\D/g, '');
    if (clean.length <= 11) {
      // CPF: 000.000.000-00
      return clean
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      // CNPJ: 00.000.000/0000-00
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

  // Inicialização ao carregar o DOM
  function initBureauModule() {
    const subtabCompetitors = document.getElementById('subtabCompetitorIntelligence');
    const subtabBureau = document.getElementById('subtabBureauCredit');
    const subviewCompetitors = document.getElementById('subviewCompetitorsContent');
    const subviewBureau = document.getElementById('subviewBureauContent');

    const inputDoc = document.getElementById('inputBureauDoc');
    const btnLookup = document.getElementById('btnLookupBureau');
    const btnCheckCache = document.getElementById('btnCheckBureauCache');
    const chkForce = document.getElementById('chkBureauForceRefresh');
    const noticeBanner = document.getElementById('bureauNoticeBanner');

    // 1. Alternância de Sub-Abas Táticas
    function switchSubtab(activeTab) {
      if (activeTab === 'bureau') {
        if (subtabBureau) {
          subtabBureau.style.background = '#0055FF';
          subtabBureau.style.color = '#FFFFFF';
          subtabBureau.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
        if (subtabCompetitors) {
          subtabCompetitors.style.background = 'rgba(148, 163, 184, 0.08)';
          subtabCompetitors.style.color = '#94A3B8';
          subtabCompetitors.style.borderColor = 'rgba(148, 163, 184, 0.2)';
        }
        if (subviewBureau) subviewBureau.style.display = 'flex';
        if (subviewCompetitors) subviewCompetitors.style.display = 'none';
      } else {
        if (subtabCompetitors) {
          subtabCompetitors.style.background = '#0055FF';
          subtabCompetitors.style.color = '#FFFFFF';
          subtabCompetitors.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
        if (subtabBureau) {
          subtabBureau.style.background = 'rgba(148, 163, 184, 0.08)';
          subtabBureau.style.color = '#94A3B8';
          subtabBureau.style.borderColor = 'rgba(148, 163, 184, 0.2)';
        }
        if (subviewCompetitors) subviewCompetitors.style.display = 'flex';
        if (subviewBureau) subviewBureau.style.display = 'none';
      }
    }

    subtabCompetitors?.addEventListener('click', () => switchSubtab('competitors'));
    subtabBureau?.addEventListener('click', () => switchSubtab('bureau'));

    // 2. Máscara Inteligente no Input de Documento (CPF / CNPJ)
    inputDoc?.addEventListener('input', (e) => {
      const clean = e.target.value.replace(/\D/g, '');
      e.target.value = formatDocument(clean);

      // Verificação passiva de cache ao digitar documento completo
      if (clean.length === 11 || clean.length === 14) {
        checkCacheQuietly(clean);
      } else if (noticeBanner) {
        noticeBanner.style.display = 'none';
      }
    });

    inputDoc?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnLookup?.click();
      }
    });

    // 3. Verificação Rápida de Cache
    async function checkCacheQuietly(cleanDoc) {
      if (!cleanDoc || (cleanDoc.length !== 11 && cleanDoc.length !== 14)) return;
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
            <span><strong>Base Interna Localizada:</strong> Este documento já foi consultado há ${data.ageInDays} dia(s). Sua consulta será servida a <strong>Custo R$ 0,00</strong> sem consumir créditos da API Assertiva.</span>
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

    // 4. Execução da Consulta Oficial ao Bureau
    btnLookup?.addEventListener('click', async () => {
      const rawVal = inputDoc?.value || '';
      const cleanDoc = rawVal.replace(/\D/g, '');

      if (!cleanDoc || (cleanDoc.length !== 11 && cleanDoc.length !== 14)) {
        alert('Por favor, informe um CPF válido (11 dígitos) ou CNPJ válido (14 dígitos).');
        inputDoc?.focus();
        return;
      }

      const forceRefresh = chkForce?.checked || false;
      const labelEl = document.getElementById('labelLookupBureau');
      const spinnerEl = document.getElementById('spinnerLookupBureau');
      const resultArea = document.getElementById('bureauResultArea');

      // Estado de Carregamento
      if (labelEl) labelEl.textContent = 'Consultando Bureau...';
      if (spinnerEl) spinnerEl.style.display = 'inline-block';
      if (btnLookup) btnLookup.disabled = true;

      try {
        const response = await fetch('/api/bureau/credit-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doc: cleanDoc,
            forceRefresh
          })
        });

        const resData = await response.json();

        if (!response.ok || !resData.success) {
          const errMsg = resData.message || resData.error || 'Erro ao realizar consulta no Bureau.';
          renderBureauError(errMsg);
          return;
        }

        currentBureauResult = resData;
        renderBureauResult(resData);

        // Se houve sincronização automática com lead do CRM
        if (resData.sync_lead && resData.sync_lead.synced) {
          // Notifica globalmente para atualizar a tabela analítica e o drawer
          window.dispatchEvent(new CustomEvent('bureau:lead_updated', {
            detail: {
              doc: cleanDoc,
              leadId: resData.sync_lead.leadId,
              whatsapp: resData.dados?.whatsapp_principal,
              score: resData.dados?.score_credito,
              status: 'VERIFICADO_ASSERTIVA'
            }
          }));
        }

      } catch (err) {
        console.error('❌ [BUREAU CONSULTATION ERROR]:', err);
        renderBureauError(`Falha de comunicação com o servidor de Bureau: ${err.message}`);
      } finally {
        if (labelEl) labelEl.textContent = 'Consultar Bureau Oficial';
        if (spinnerEl) spinnerEl.style.display = 'none';
        if (btnLookup) btnLookup.disabled = false;
      }
    });
  }

  // Renderização de Erro Estruturado
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

  // Renderização do Painel Completo de Resultados (Estilo Serasa / Mesa de Crédito)
  function renderBureauResult(payload) {
    const resultArea = document.getElementById('bureauResultArea');
    if (!resultArea) return;

    const d = payload.dados || {};
    const isCpf = d.tipo_documento === 'CPF';
    const docFmt = formatDocument(d.documento_limpo);
    const score = Number(d.score_credito || 750);

    // Cor e Badge de Risco do Score
    let scoreColor = '#10B981'; // Verde Esmeralda
    let scoreBg = 'rgba(16, 185, 129, 0.12)';
    let scoreBorder = 'rgba(16, 185, 129, 0.3)';
    let riscoTexto = 'BAIXO RISCO DE INADIMPLÊNCIA';

    if (score < 400) {
      scoreColor = '#EF4444'; // Vermelho
      scoreBg = 'rgba(239, 68, 68, 0.12)';
      scoreBorder = 'rgba(239, 68, 68, 0.3)';
      riscoTexto = 'ALTO RISCO DE INADIMPLÊNCIA';
    } else if (score < 700) {
      scoreColor = '#F59E0B'; // Âmbar
      scoreBg = 'rgba(245, 158, 11, 0.12)';
      scoreBorder = 'rgba(245, 158, 11, 0.3)';
      riscoTexto = 'MÉDIO RISCO DE INADIMPLÊNCIA';
    }

    const protestosQtd = Number(d.qtd_protestos || 0);
    const protestosValor = Number(d.valor_protestos || 0);

    // Lista de Telefones
    const telefones = Array.isArray(d.telefones) ? d.telefones : [];
    let phonesHtml = '';
    if (telefones.length === 0) {
      phonesHtml = `<div style="font-size: 0.78rem; color: #94A3B8; padding: 0.5rem 0;">Nenhum telefone localizado na base de dados para este documento.</div>`;
    } else {
      phonesHtml = telefones.map(p => {
        const isWhats = p.whatsapp_valido;
        const whatsBtn = isWhats && p.e164 ? `
          <a href="https://wa.me/${p.e164.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" style="padding: 0.3rem 0.65rem; background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 4px; color: #34D399; font-size: 0.7rem; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem; transition: background 0.2s;" onmouseenter="this.style.background='rgba(16, 185, 129, 0.3)'" onmouseleave="this.style.background='rgba(16, 185, 129, 0.18)'">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            <span>Conversar</span>
          </a>
        ` : '';

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.75rem; background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 6px; margin-bottom: 0.45rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-family: monospace; font-size: 0.85rem; font-weight: 700; color: #FFFFFF;">${p.formatado || p.numero}</span>
              <span style="font-size: 0.65rem; font-weight: 700; padding: 0.12rem 0.4rem; border-radius: 3px; background: rgba(148, 163, 184, 0.1); color: #94A3B8; text-transform: uppercase;">${p.tipo || 'TELEFONE'}</span>
              ${isWhats ? `<span style="font-size: 0.65rem; font-weight: 700; padding: 0.12rem 0.45rem; border-radius: 3px; background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3); text-transform: uppercase;">WhatsApp Confirmado</span>` : ''}
            </div>
            <div>${whatsBtn}</div>
          </div>
        `;
      }).join('');
    }

    // Quadro Societário (QSA)
    const qsa = Array.isArray(d.qsa) ? d.qsa : [];
    let qsaHtml = '';
    if (qsa.length > 0) {
      qsaHtml = `
        <div style="margin-top: 1.25rem;">
          <h5 style="font-size: 0.78rem; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.65rem 0;">Quadro Societário & Administradores (QSA)</h5>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.65rem;">
            ${qsa.map(s => `
              <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 6px; padding: 0.65rem 0.85rem;">
                <div style="font-size: 0.8rem; font-weight: 700; color: #FFFFFF; margin-bottom: 0.2rem;">${s.nome || s.nome_socio || 'SÓCIO TITULAR'}</div>
                <div style="font-size: 0.7rem; color: #94A3B8;">${s.qual || s.qualificacao || 'Sócio-Administrador'}</div>
                ${s.cpf_cnpj_socio ? `<div style="font-size: 0.68rem; font-family: monospace; color: #64748B; margin-top: 0.15rem;">Doc: ${s.cpf_cnpj_socio}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Informação de Sincronização com o CRM
    let syncBadgeHtml = '';
    if (payload.sync_lead && payload.sync_lead.synced) {
      syncBadgeHtml = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span style="font-size: 0.8rem; color: #E2E8F0;">Registro vinculado ao Lead <strong>${payload.sync_lead.razao_social || 'do CRM'}</strong>. Dados e selo atualizados automaticamente em todas as abas.</span>
          </div>
          <button type="button" onclick="window.inspectLeadById && window.inspectLeadById('${payload.sync_lead.leadId}')" style="padding: 0.35rem 0.85rem; background: #0055FF; color: #FFFFFF; border: none; border-radius: 4px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
            Abrir no Inspetor Lateral
          </button>
        </div>
      `;
    }

    // HTML Completo do Painel Executivo
    resultArea.innerHTML = `
      <div style="background: #0B1224; border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 10px; padding: 1.5rem; box-shadow: 0 15px 35px -5px rgba(0, 0, 0, 0.5); animation: fadeIn 0.25s ease-out;">
        
        ${syncBadgeHtml}

        <!-- Topo: Identificação do Titular e Selo Oficial -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid rgba(148, 163, 184, 0.12); padding-bottom: 1.25rem; margin-bottom: 1.25rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem;">
              <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin: 0; letter-spacing: 0.02em;">
                ${d.razao_social || 'TITULAR CONSULTADO'}
              </h3>
              <span style="background: rgba(148, 163, 184, 0.1); color: #94A3B8; border: 1px solid rgba(148, 163, 184, 0.2); font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 4px; text-transform: uppercase;">
                ${d.tipo_documento}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.78rem; color: #94A3B8;">
              <span style="font-family: monospace; color: #E2E8F0;">Documento: <strong>${docFmt}</strong></span>
              <span>Situação na Receita: <strong style="color: #34D399;">${d.situacao_cadastral || 'REGULAR'}</strong></span>
              ${d.nome_fantasia ? `<span>Fantasia: <em>${d.nome_fantasia}</em></span>` : ''}
            </div>
          </div>

          <!-- Selo Oficial de Verificação Bureau -->
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; padding: 0.65rem 1rem; display: flex; align-items: center; gap: 0.65rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
            <div>
              <div style="font-size: 0.75rem; font-weight: 800; color: #10B981; letter-spacing: 0.05em; text-transform: uppercase;">VERIFICADO BUREAU</div>
              <div style="font-size: 0.65rem; color: #94A3B8;">Assertiva Soluções • ${formatDate(payload.selo_verificacao?.data_verificacao)}</div>
            </div>
          </div>
        </div>

        <!-- Grid de 4 Indicadores Executivos -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          
          <!-- Card 1: Score de Crédito -->
          <div style="background: #070D1E; border: 1px solid ${scoreBorder}; border-radius: 8px; padding: 1.15rem; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-size: 0.7rem; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em;">Score de Crédito</span>
                <span style="font-size: 0.62rem; font-weight: 800; padding: 0.1rem 0.4rem; border-radius: 3px; background: ${scoreBg}; color: ${scoreColor};">${d.faixa_risco || 'BAIXO'}</span>
              </div>
              <div style="font-size: 2.2rem; font-weight: 900; color: ${scoreColor}; font-family: monospace; line-height: 1;">
                ${score} <span style="font-size: 0.9rem; font-weight: 600; color: #64748B;">/ 1000</span>
              </div>
            </div>
            <!-- Termômetro Barra de Progresso -->
            <div style="margin-top: 0.85rem;">
              <div style="width: 100%; height: 6px; background: rgba(148, 163, 184, 0.15); border-radius: 3px; overflow: hidden;">
                <div style="width: ${(score / 1000) * 100}%; height: 100%; background: ${scoreColor}; border-radius: 3px; transition: width 0.6s ease-in-out;"></div>
              </div>
              <div style="font-size: 0.65rem; color: #94A3B8; margin-top: 0.4rem;">${riscoTexto}</div>
            </div>
          </div>

          <!-- Card 2: Restrições & Protestos -->
          <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.15rem; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <span style="font-size: 0.7rem; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 0.5rem;">Protestos em Cartório</span>
              <div style="font-size: 1.5rem; font-weight: 800; color: ${protestosQtd > 0 ? '#EF4444' : '#10B981'}; font-family: monospace;">
                ${protestosQtd === 0 ? 'Nada Consta' : `${protestosQtd} Ocorrência(s)`}
              </div>
            </div>
            <div style="font-size: 0.75rem; color: #94A3B8; margin-top: 0.85rem;">
              Valor Total: <strong style="color: ${protestosValor > 0 ? '#EF4444' : '#FFFFFF'};">${formatCurrency(protestosValor)}</strong>
            </div>
          </div>

          <!-- Card 3: Capacidade Financeira Presumida -->
          <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.15rem; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <span style="font-size: 0.7rem; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 0.5rem;">
                ${isCpf ? 'Renda Presumida' : 'Faturamento Presumido'}
              </span>
              <div style="font-size: 1.5rem; font-weight: 800; color: #00D2FF; font-family: monospace;">
                ${formatCurrency(d.renda_faturamento_presumido || (isCpf ? 8500 : 150000))}
              </div>
            </div>
            <div style="font-size: 0.68rem; color: #94A3B8; margin-top: 0.85rem;">
              Capacidade de aporte e liquidez estimada por modelo preditivo.
            </div>
          </div>

          <!-- Card 4: Status da Transação & Custo -->
          <div style="background: #070D1E; border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 1.15rem; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <span style="font-size: 0.7rem; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 0.5rem;">Custo desta Consulta</span>
              <div style="font-size: 1.5rem; font-weight: 800; color: ${payload.cached ? '#34D399' : '#0055FF'}; font-family: monospace;">
                ${payload.cached ? 'R$ 0,00' : '1 Consulta'}
              </div>
            </div>
            <div style="font-size: 0.68rem; color: #94A3B8; margin-top: 0.85rem;">
              Origem: <strong style="color: #FFFFFF;">${payload.cached ? 'Cache Local (Anti-Desperdício)' : 'Assertiva API Oficial'}</strong>
            </div>
          </div>

        </div>

        <!-- Seção de Canais de Comunicação & Telefones Validados -->
        <div style="background: rgba(148, 163, 184, 0.04); border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00D2FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              <h4 style="font-size: 0.85rem; font-weight: 800; color: #FFFFFF; text-transform: uppercase; margin: 0; letter-spacing: 0.04em;">Canais de Comunicação Validados (Localize v3)</h4>
            </div>
            <span style="font-size: 0.7rem; color: #94A3B8;">${telefones.length} contato(s) identificado(s)</span>
          </div>
          <div>${phonesHtml}</div>
        </div>

        ${qsaHtml}

      </div>
    `;
  }

  // Listener Global de Sincronização de Lead com Bureau
  // Atualiza a Tabela Analítica e o Inspetor Lateral sem precisar de reload
  window.addEventListener('bureau:lead_updated', (e) => {
    const detail = e.detail || {};
    console.log('🔄 [BUREAU EVENT] Lead sincronizado com Bureau:', detail);

    // 1. Atualiza na tabela analítica de leads se estiver visível
    const tableBody = document.getElementById('leadsTableBody');
    if (tableBody && detail.leadId) {
      const row = tableBody.querySelector(`tr[data-lead-id="${detail.leadId}"]`) || tableBody.querySelector(`tr[data-cnpj="${detail.doc}"]`);
      if (row) {
        // Encontra célula de telefone e insere o selo VERIFICADO BUREAU
        const phoneCell = row.querySelector('.col-phone') || row.querySelector('td:nth-child(5)');
        if (phoneCell && detail.whatsapp) {
          phoneCell.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.2rem;">
              <span style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: #FFFFFF;">${detail.whatsapp}</span>
              <span style="display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.6rem; font-weight: 800; color: #10B981; background: rgba(16, 185, 129, 0.12); padding: 0.1rem 0.35rem; border-radius: 3px; border: 1px solid rgba(16, 185, 129, 0.3); text-transform: uppercase; width: fit-content;" title="Validado via Assertiva Soluções v3">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                VERIFICADO BUREAU
              </span>
            </div>
          `;
        }
      }
    }

    // 2. Atualiza o Drawer se estiver aberto com esse lead
    const drawer = document.getElementById('rightDrawer') || document.querySelector('.lead-drawer');
    if (drawer && detail.whatsapp) {
      const drawerPhoneEl = drawer.querySelector('#drawerLeadPhone') || drawer.querySelector('.drawer-phone-val');
      if (drawerPhoneEl) {
        drawerPhoneEl.innerHTML = `
          <span>${detail.whatsapp}</span>
          <span style="display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.62rem; font-weight: 800; color: #10B981; background: rgba(16, 185, 129, 0.12); padding: 0.1rem 0.4rem; border-radius: 3px; border: 1px solid rgba(16, 185, 129, 0.3); text-transform: uppercase; margin-left: 0.5rem;">
            VERIFICADO BUREAU
          </span>
        `;
      }
    }
  });

  // Função Pública para abrir diretamente a consulta do Bureau a partir de qualquer ponto da UI
  window.openBureauConsultation = function(doc) {
    // 1. Alterna para a aba Concorrência & Consulta
    const tabBtn = document.getElementById('tabViewCompetitors');
    if (tabBtn) tabBtn.click();

    // 2. Alterna para a sub-aba de Bureau
    const subtabBureau = document.getElementById('subtabBureauCredit');
    if (subtabBureau) subtabBureau.click();

    // 3. Preenche e dispara a busca
    const inputDoc = document.getElementById('inputBureauDoc');
    const btnLookup = document.getElementById('btnLookupBureau');
    if (inputDoc && doc) {
      inputDoc.value = formatDocument(doc);
      if (btnLookup) {
        setTimeout(() => btnLookup.click(), 100);
      }
    }
  };

  // Inicializa quando o documento estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBureauModule);
  } else {
    initBureauModule();
  }

})();
