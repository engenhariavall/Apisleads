import { getLeadsByIds, getAllLeadsMatchingFilter } from '../services/leadsService.js';
import { transformToMetaAds, removeAccents, hashEmail, normalizeAndHashPhone, hashCity, hashState, normalizeAndHashZip, hashCountry, sha256 } from '../services/metaHasher.js';
import { enrichLeadsWithEconomicGroups } from '../modules/intelligence/index.js';
import { qsaService } from '../services/qsaService.js';
import { contactEnrichmentService } from '../services/contactEnrichmentService.js';
import { getTenantFromRequest } from '../middleware/authMiddleware.js';
import db from '../config/database.js';

function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Formata CPF, CNPJ ou código fundiário como texto explícito no Excel,
 * impedindo conversão automática para notação científica (ex: 7,69E+10).
 */
function formatDocumentForExcel(doc) {
  if (!doc) return '';
  const str = String(doc).trim();
  const digits = str.replace(/\D/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
  if (str.includes('/') || str.includes('-') || str.includes('.')) {
    return str;
  }
  return `="${str}"`;
}

/**
 * Formata Telefone e WhatsApp como texto (XX) XXXXX-XXXX no Excel,
 * impedindo conversão automática para notação científica (ex: 5,55E+12).
 */
function formatPhoneForExcel(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 0) {
    return `="${digits}"`;
  }
  return '';
}

export function exportLeads(req, res) {
  try {
    const { lead_ids, filters, format = 'standard', include_manual = true } = req.body || {};
    const tenantId = getTenantFromRequest(req);

    let leads = [];

    // BLINDAGEM COMERCIAL ABSOLUTA: Concorrentes NUNCA participam de exportação B2B ou Meta Ads
    const safeFilters = { ...(filters || {}), tenant_id: tenantId, include_competitors: false, only_competitors: false };

    // Se foram passados IDs específicos (ex: seleção na tabela), exporta esses IDs com trava estrita anti-concorrente e por tenant
    if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      leads = getLeadsByIds(lead_ids, false, tenantId); // allowCompetitors = false, tenantId
    } else {
      // Caso contrário, exporta todos os que batem com os filtros ativos com blindagem
      leads = getAllLeadsMatchingFilter(safeFilters);
    }

    // FASE 47: Injeção de Contatos Quentes Manuais (Warm-up Audiences para Tráfego Pago)
    if (include_manual !== false) {
      try {
        const manualStmt = db.prepare(`
          SELECT * FROM leads 
          WHERE tenant_id = ? AND (origem = 'MANUAL' OR tag = 'ORIGEM: MANUAL') AND (is_competitor = 0 OR is_competitor IS NULL)
          ORDER BY created_at DESC
        `);
        const manualLeads = manualStmt.all(tenantId);
        if (manualLeads && manualLeads.length > 0) {
          const existingIds = new Set(leads.map(l => l.id));
          const existingEmails = new Set(leads.map(l => (l.email || '').trim().toLowerCase()).filter(Boolean));
          const existingPhones = new Set(leads.map(l => (l.telefone_sanitized || l.telefone || '').replace(/\D/g, '')).filter(Boolean));

          for (const ml of manualLeads) {
            const mlEmail = (ml.email || '').trim().toLowerCase();
            const mlPhone = (ml.telefone_sanitized || ml.telefone || '').replace(/\D/g, '');
            const isDuplicate = existingIds.has(ml.id) || 
                                (mlEmail && existingEmails.has(mlEmail)) || 
                                (mlPhone && existingPhones.has(mlPhone));
            if (!isDuplicate) {
              leads.push(ml);
            }
          }
        }
      } catch (err) {
        console.warn('Injeção de leads manuais na exportação:', err.message);
      }
    }

    // Filtragem defensiva final em memória para garantia matemática de 100% de exclusão
    leads = leads.filter(l => !l.is_competitor || Number(l.is_competitor) === 0);

    if (leads.length === 0) {
      return res.status(400).json({ error: 'Nenhum lead qualificado para os critérios fornecidos.' });
    }

    // Enriquece com dados de grupo econômico antes de exportar
    leads = enrichLeadsWithEconomicGroups(leads);

    const timestamp = new Date().toISOString().slice(0, 10);
    let csvContent = '\uFEFF'; // UTF-8 BOM para garantir acentuação correta no Excel / Meta Ads

    if (format === 'abm_rural') {
      // ─────────────────────────────────────────────────────────────
      // FASE 52 — Pipeline de Exportação ABM (Meta Ads)
      // Colunas: NOME | CPF_CNPJ | TELEFONE_WHATSAPP | CULTURA_PRINCIPAL | SCORE | madid_clean
      // Regra: TELEFONE_WHATSAPP só aparece quando enriquecido via Bureau (não-vazio e diferente de 'Contato não localizado')
      // madid_clean = CPF/CNPJ sem pontuação, pronto para dar "Match" no Gerenciador de Anúncios
      // Concorrentes: NUNCA exportados (blindagem aplicada acima)
      // ─────────────────────────────────────────────────────────────
      const abmHeaders = ['NOME', 'CPF_CNPJ', 'TELEFONE_WHATSAPP', 'CULTURA_PRINCIPAL', 'SCORE', 'madid_clean'];
      csvContent += abmHeaders.join(',') + '\r\n';

      leads.forEach(l => {
        // NOME: razão social ou nome fantasia ou titular (para rurais SIGEF)
        const nome = (l.nome_fantasia || l.razao_social || l.nome_titular || '').trim();

        // CPF_CNPJ: preserva formatação original do banco
        const cpfCnpj = (l.cnpj || l.cpf_cnpj_titular || l.cnpj_raw || '').trim();

        // madid_clean: remove qualquer pontuação/máscara — usado para match no Ad Manager
        const madidClean = cpfCnpj.replace(/[^\d]/g, '');

        // TELEFONE_WHATSAPP: apenas se enriquecido via Bureau (campo bureau_whatsapp ou whatsapp_enriquecido)
        const rawWhatsapp = (l.bureau_whatsapp || l.whatsapp_enriquecido || '').trim();
        const telefoneWhatsapp = (
          rawWhatsapp &&
          rawWhatsapp !== 'Contato não localizado' &&
          rawWhatsapp !== 'N/A' &&
          rawWhatsapp.length > 4
        ) ? rawWhatsapp : '';

        // CULTURA_PRINCIPAL: extrai do campo de dados agronômicos (Fase 49)
        let culturaPrincipal = '';
        if (l.dados_agronomicos) {
          try {
            const agro = typeof l.dados_agronomicos === 'string'
              ? JSON.parse(l.dados_agronomicos)
              : l.dados_agronomicos;
            culturaPrincipal = agro.crop_type || '';
          } catch (e) {
            culturaPrincipal = '';
          }
        }
        // Fallback: vertical_data para empresas B2B do agronegócio
        if (!culturaPrincipal && l.vertical_type === 'AGRO') {
          culturaPrincipal = 'AGRO';
        }

        // SCORE: icp_score ou predictive_score ou intent_score (preferência nesta ordem)
        const score = l.icp_score || l.predictive_score || l.intent_score || 0;

        csvContent += [
          escapeCsvField(nome),
          escapeCsvField(cpfCnpj),
          escapeCsvField(telefoneWhatsapp),
          escapeCsvField(culturaPrincipal),
          escapeCsvField(String(score)),
          escapeCsvField(madidClean)
        ].join(',') + '\r\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="abm-rural-meta-ads-${timestamp}.csv"`);
    } else if (format === 'custom_audiences_raw') {
      // Formato Mastigado para Custom Audiences do Meta Ads & Google Ads
      // Colunas: fn, ln, email, phone, city, state, country, company, cnpj
      const headers = ['fn', 'ln', 'email', 'phone', 'city', 'state', 'country', 'company', 'cnpj'];
      csvContent += headers.join(',') + '\r\n';

      leads.forEach(l => {
        // FASE 47: Tratamento específico para Lead de Injeção Manual (Warm-up Audience)
        if (l.origem === 'MANUAL' || l.tag === 'ORIGEM: MANUAL') {
          const contactName = l.contato_nome || l.nome_fantasia || l.razao_social || 'Contato Quente';
          const { firstName, lastName } = contactEnrichmentService.parseName(contactName);
          const email = (l.email || '').trim().toLowerCase();
          let phone = l.telefone_sanitized || l.telefone || '';
          let digitsPhone = phone.replace(/\D/g, '');
          if (digitsPhone && !digitsPhone.startsWith('55') && (digitsPhone.length === 10 || digitsPhone.length === 11)) {
            digitsPhone = '55' + digitsPhone;
          }
          const compName = (l.razao_social && l.razao_social !== contactName) ? l.razao_social : (l.nome_fantasia || 'Lead Manual');

          csvContent += [
            escapeCsvField(firstName),
            escapeCsvField(lastName),
            escapeCsvField(email),
            escapeCsvField(digitsPhone ? '+' + digitsPhone : ''),
            escapeCsvField(removeAccents(l.municipio || '').trim().toLowerCase() || 'brasil'),
            escapeCsvField((l.uf || 'BR').trim().toLowerCase().slice(0, 2)),
            escapeCsvField('br'),
            escapeCsvField(compName),
            escapeCsvField(l.cnpj || 'MANUAL')
          ].join(',') + '\r\n';
          return;
        }

        const cleanCnpj = String(l.cnpj_raw || l.cnpj || '').replace(/\D/g, '');
        const socios = cleanCnpj ? qsaService.getSociosByCnpj(cleanCnpj) : [];
        const cleanCity = removeAccents(l.municipio || '').trim().toLowerCase();
        const cleanState = (l.uf || 'BR').trim().toLowerCase().slice(0, 2);
        const companyName = (l.nome_fantasia || l.razao_social || '').trim();

        // Se a empresa possui sócios persistidos, gera uma linha por decisor enriquecido
        if (socios && socios.length > 0) {
          socios.forEach(s => {
            const { firstName, lastName } = contactEnrichmentService.parseName(s.nome);
            const email = (s.email_presumido || l.email || '').trim().toLowerCase();
            let phone = s.telefone_presumido || l.telefone || '';
            let digitsPhone = phone.replace(/\D/g, '');
            if (digitsPhone && !digitsPhone.startsWith('55') && (digitsPhone.length === 10 || digitsPhone.length === 11)) {
              digitsPhone = '55' + digitsPhone;
            }

            csvContent += [
              escapeCsvField(firstName),
              escapeCsvField(lastName),
              escapeCsvField(email),
              escapeCsvField(digitsPhone ? '+' + digitsPhone : ''),
              escapeCsvField(cleanCity),
              escapeCsvField(cleanState),
              escapeCsvField('br'),
              escapeCsvField(companyName),
              escapeCsvField(l.cnpj)
            ].join(',') + '\r\n';
          });
        } else {
          // Fallback caso não haja sócios detalhados: usa dados da empresa
          const nameTokens = contactEnrichmentService.parseName(companyName);
          let phone = l.telefone || '';
          let digitsPhone = phone.replace(/\D/g, '');
          if (digitsPhone && !digitsPhone.startsWith('55') && (digitsPhone.length === 10 || digitsPhone.length === 11)) {
            digitsPhone = '55' + digitsPhone;
          }

          csvContent += [
            escapeCsvField(nameTokens.firstName),
            escapeCsvField(nameTokens.lastName),
            escapeCsvField((l.email || '').trim().toLowerCase()),
            escapeCsvField(digitsPhone ? '+' + digitsPhone : ''),
            escapeCsvField(cleanCity),
            escapeCsvField(cleanState),
            escapeCsvField('br'),
            escapeCsvField(companyName),
            escapeCsvField(l.cnpj)
          ].join(',') + '\r\n';
        }
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="publicos-meta-google-ads-${timestamp}.csv"`);
    } else if (format === 'meta_ads' || format === 'meta_ads_agro') {
      // ─────────────────────────────────────────────────────────────
      // PIPELINE OFICIAL META ADS CUSTOM AUDIENCES COM HASHING SHA-256
      // Formato estrito para Gerenciador de Anúncios (Facebook / Instagram)
      // Headers: email,phone,fn,ln,ct,st,zip,country,value
      // PII hasheado em SHA-256 (64 hex chars); value aberto para Lookalike Baseado em Valor
      // Multiplicação de sócios via QSA para aumento de taxa de correspondência (Match Rate)
      // ─────────────────────────────────────────────────────────────
      const headers = ['email', 'phone', 'fn', 'ln', 'ct', 'st', 'zip', 'country', 'value'];
      csvContent += headers.join(',') + '\r\n';

      leads.forEach(l => {
        // Cálculo de valor patrimonial / faturamento estimado para LAL
        let val = 50000;
        if (l.capital_social && Number(l.capital_social) > 0) {
          val = Math.round(Number(l.capital_social));
        } else if (l.area_lavoura_util_ha && Number(l.area_lavoura_util_ha) > 0) {
          val = Math.round(Number(l.area_lavoura_util_ha) * 15000);
        } else if (l.area_hectares && Number(l.area_hectares) > 0) {
          val = Math.round(Number(l.area_hectares) * 10000);
        }

        const cleanCity = hashCity(l.municipio || l.cidade || '');
        const cleanState = hashState(l.uf || l.estado || 'BR');
        const cleanZip = normalizeAndHashZip(l.cep || '');
        const cleanCountry = 'br';

        const cleanCnpj = String(l.cnpj_raw || l.cnpj || '').replace(/\D/g, '');
        let socios = [];
        if (cleanCnpj && cleanCnpj.length === 14) {
          try {
            socios = qsaService.getSociosByCnpj(cleanCnpj);
          } catch (e) {
            socios = [];
          }
        }

        // Se tiver sócios mapeados no QSA, gera uma linha qualificada por decisor
        if (socios && socios.length > 0) {
          socios.forEach(s => {
            const { firstName, lastName } = contactEnrichmentService.parseName(s.nome);
            const emailHash = hashEmail(s.email_presumido || l.email || '');
            const phoneHash = normalizeAndHashPhone(s.telefone_presumido || l.whatsapp || l.telefone_sanitized || l.telefone || '');
            const fnHash = firstName ? sha256(removeAccents(firstName).trim().toLowerCase()) : '';
            const lnHash = lastName ? sha256(removeAccents(lastName).trim().toLowerCase()) : '';

            csvContent += [
              escapeCsvField(emailHash),
              escapeCsvField(phoneHash),
              escapeCsvField(fnHash),
              escapeCsvField(lnHash),
              escapeCsvField(cleanCity),
              escapeCsvField(cleanState),
              escapeCsvField(cleanZip),
              escapeCsvField(cleanCountry),
              escapeCsvField(String(val))
            ].join(',') + '\r\n';
          });
        } else {
          // Contato do lead / produtor / titular
          const contactName = l.decisor_nome || l.contato_nome || l.nome_titular || l.nome_fantasia || l.razao_social || 'Produtor Rural';
          const { firstName, lastName } = contactEnrichmentService.parseName(contactName);
          const emailHash = hashEmail(l.email || l.email_validado || '');
          const phoneHash = normalizeAndHashPhone(l.whatsapp || l.telefone_sanitized || l.telefone || l.whatsapp_validado || l.bureau_whatsapp || '');
          const fnHash = firstName ? sha256(removeAccents(firstName).trim().toLowerCase()) : '';
          const lnHash = lastName ? sha256(removeAccents(lastName).trim().toLowerCase()) : '';

          csvContent += [
            escapeCsvField(emailHash),
            escapeCsvField(phoneHash),
            escapeCsvField(fnHash),
            escapeCsvField(lnHash),
            escapeCsvField(cleanCity),
            escapeCsvField(cleanState),
            escapeCsvField(cleanZip),
            escapeCsvField(cleanCountry),
            escapeCsvField(String(val))
          ].join(',') + '\r\n';
        }
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="meta-ads-audiences-sha256-${timestamp}.csv"`);
    } else if (format === 'comercial_b2b_maquinas') {
      // ─────────────────────────────────────────────────────────────
      // PIPELINE DE DESPACHO COMERCIAL B2B (EXCEL & VENDAS)
      // Formato pronto para SDR/Vendedor com link direto de WhatsApp e argumentos de frota
      // Blindado contra notação científica (E+) e com zero valores N/D
      // ─────────────────────────────────────────────────────────────
      const headers = [
        'PRODUTOR_OU_EMPRESA',
        'TIPO_CADASTRO',
        'ICP_TIER',
        'SCORE_QUALIFICACAO',
        'DOCUMENTO_CPF_CNPJ',
        'INSCRICAO_ESTADUAL_SEFAZ',
        'DECISOR_CONTATO',
        'WHATSAPP_DIRETO',
        'LINK_WHATSAPP_WEB',
        'MUNICIPIO',
        'UF',
        'AREA_TOTAL_HA',
        'AREA_LAVOURA_UTIL_HA',
        'COLHEITADEIRA_ESTIMADA',
        'TRATORES_ESTIMADOS',
        'PLANTADEIRA_ESTIMADA',
        'POTENCIAL_PILOTO_GPS_RTK',
        'CAPACIDADE_PIVO_IRRIGACAO',
        'FEEDBACK_STATUS',
        'INTERESSE_DECLARADO',
        'NOTAS_COMERCIAL'
      ];
      csvContent += headers.map(escapeCsvField).join(';') + '\r\n';

      leads.forEach(l => {
        let nome = (l.razao_social || l.nome_fantasia || l.nome_imovel || l.contato_nome || '').trim();
        if (!nome || nome.toLowerCase().includes('sem denomina') || nome === 'N/D') {
          const titular = (l.nome_titular || l.razao_social || l.decisor_nome || '').trim();
          const loc = l.municipio ? ` (${l.municipio}-${l.uf || 'BR'})` : '';
          nome = titular ? `Área Rural de ${titular}${loc}` : `Propriedade Rural${loc}`;
        }

        const rawDoc = (l.cnpj || l.cnpj_raw || l.cpf_cnpj_titular || l.codigo_imovel || '').trim();
        const doc = formatDocumentForExcel(rawDoc);
        const ie = (l.sefaz_ie_pf || l.inscricao_estadual || '').trim();
        const decisor = (l.decisor_nome || l.contato_nome || l.nome_titular || 'Produtor / Titular').trim();
        
        let rawPhone = (l.whatsapp || l.telefone_sanitized || l.telefone || l.whatsapp_validado || l.bureau_whatsapp || '').replace(/\D/g, '');
        const displayPhone = formatPhoneForExcel(rawPhone);
        
        let waPhone = rawPhone;
        if (waPhone && !waPhone.startsWith('55') && (waPhone.length === 10 || waPhone.length === 11)) {
          waPhone = '55' + waPhone;
        }
        const waLink = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent('Olá, tudo bem? Gostaria de conversar sobre as soluções de máquinas e implementos para sua lavoura.')}` : '';

        let areaTotal = 0;
        let areaUtil = 0;

        if (l.dados_fundiarios) {
          try {
            const df = typeof l.dados_fundiarios === 'string' ? JSON.parse(l.dados_fundiarios) : l.dados_fundiarios;
            areaTotal = Number(df.area_hectares) || 0;
          } catch (e) {}
        }
        if (l.area_hectares && !areaTotal) {
          areaTotal = Number(l.area_hectares) || 0;
        }

        if (l.area_lavoura_util_ha) {
          areaUtil = Number(l.area_lavoura_util_ha) || 0;
        } else if (areaTotal > 0) {
          areaUtil = Math.round(areaTotal * 0.75);
        }

        // Determinação do Tipo de Cadastro, ICP Tier e Score
        const isRural = Boolean(l.origem?.includes('RURAL') || l.vertical_type === 'AGRO' || l.decisor_cpf || (rawDoc.length === 11 && !rawDoc.includes('/')));
        const isPJ = rawDoc.length === 14 || (rawDoc.includes('/') && !rawDoc.startsWith('BR-'));
        const tipoCadastro = isRural ? (isPJ ? 'PRODUTOR_RURAL_PJ' : 'PRODUTOR_RURAL_PF') : 'EMPRESA_B2B_PJ';

        let icpTier = l.icp_tier;
        let icpScore = l.icp_score || l.intent_score || l.score_vitalidade || 0;
        if (!icpTier) {
          if (areaUtil >= 2000 || icpScore >= 80 || l.intent_classification === 'HOT') {
            icpTier = 'TIER A';
            if (!icpScore) icpScore = 88;
          } else if (areaUtil >= 500 || icpScore >= 60 || l.intent_classification === 'WARM') {
            icpTier = 'TIER B';
            if (!icpScore) icpScore = 72;
          } else {
            icpTier = 'TIER C';
            if (!icpScore) icpScore = 50;
          }
        }

        let colheitadeira = '';
        let tratores = '';
        let plantadeira = '';
        let rtkScore = '';
        let pivo = '';

        if (l.dados_maquinario) {
          try {
            const dm = typeof l.dados_maquinario === 'string' ? JSON.parse(l.dados_maquinario) : l.dados_maquinario;
            colheitadeira = dm.colheitadeiras?.recomendacao || '';
            tratores = dm.tratores?.recomendacao || '';
            plantadeira = dm.plantadeiras?.recomendacao || '';
            rtkScore = dm.piloto_gps_rtk ? `${dm.piloto_gps_rtk.score_aderencia}/100 (Econ: R$ ${Number(dm.piloto_gps_rtk.economia_estimada_safra_brl || 0).toLocaleString('pt-BR')})` : '';
          } catch (e) {}
        }
        if (l.dados_hidrograficos) {
          try {
            const dh = typeof l.dados_hidrograficos === 'string' ? JSON.parse(l.dados_hidrograficos) : l.dados_hidrograficos;
            pivo = dh.capacidade_irrigacao_pivo?.viavel ? `${dh.capacidade_irrigacao_pivo.estimativa_pivos_viaveis} pivôs (${dh.capacidade_irrigacao_pivo.potencial_irrigado_ha} ha)` : '';
          } catch (e) {}
        }

        // Heurística agronômica automática para preenchimento de frotas (ZERO N/D)
        if (!colheitadeira || colheitadeira === 'N/D') {
          if (areaUtil > 5000) colheitadeira = 'Frota Mega Grãos Classe 9/10 (4+ unidades)';
          else if (areaUtil >= 2000) colheitadeira = 'Classe 8/9 (2 a 3 unidades)';
          else if (areaUtil >= 500) colheitadeira = 'Classe 7 (1 a 2 unidades)';
          else colheitadeira = 'Classe 5/6 (Até 500 ha)';
        }

        if (!tratores || tratores === 'N/D') {
          if (areaUtil > 5000) tratores = '450-570 cv Pesados Articulados (6+ unid.)';
          else if (areaUtil >= 2000) tratores = '350-450 cv Articulados (4 a 6 unid.)';
          else if (areaUtil >= 500) tratores = '210-350 cv Alta Potência (3 a 4 unid.)';
          else tratores = '140-210 cv Médio Porte (2 unid.)';
        }

        if (!plantadeira || plantadeira === 'N/D') {
          if (areaUtil > 5000) plantadeira = '36-48 linhas Articuladas Pantográficas';
          else if (areaUtil >= 2000) plantadeira = '24-36 linhas Alta Eficiência';
          else if (areaUtil >= 500) plantadeira = '18-24 linhas Precisão';
          else plantadeira = '12-16 linhas Convencional';
        }

        if (!rtkScore || rtkScore === 'N/D') {
          if (areaUtil >= 2000) rtkScore = '98/100 (Econ: R$ 280.000+/safra)';
          else if (areaUtil >= 500) rtkScore = '92/100 (Econ: R$ 120.000/safra)';
          else rtkScore = '80/100 (Econ: R$ 45.000/safra)';
        }

        if (!pivo || pivo === 'N/D') {
          if (areaUtil >= 2000) pivo = 'Alto Potencial (3 a 5 pivôs centrais viáveis)';
          else if (areaUtil >= 500) pivo = 'Médio Potencial (1 a 2 pivôs centrais)';
          else pivo = 'Baixo Potencial Hídrico / Área de Sequeiro';
        }

        let feedbackNotas = '';
        if (l.feedback_comercial) {
          try {
            const fc = typeof l.feedback_comercial === 'string' ? JSON.parse(l.feedback_comercial) : l.feedback_comercial;
            feedbackNotas = fc.notas || '';
          } catch (e) {}
        }

        csvContent += [
          escapeCsvField(nome),
          escapeCsvField(tipoCadastro),
          escapeCsvField(icpTier),
          escapeCsvField(String(icpScore)),
          escapeCsvField(doc),
          escapeCsvField(ie),
          escapeCsvField(decisor),
          escapeCsvField(displayPhone),
          escapeCsvField(waLink),
          escapeCsvField(l.municipio || ''),
          escapeCsvField(l.uf || ''),
          escapeCsvField(String(areaTotal)),
          escapeCsvField(String(areaUtil)),
          escapeCsvField(colheitadeira),
          escapeCsvField(tratores),
          escapeCsvField(plantadeira),
          escapeCsvField(rtkScore),
          escapeCsvField(pivo),
          escapeCsvField(l.feedback_status || 'NAO_CONTATADO'),
          escapeCsvField(l.interesse_maquinario || 'PADRAO_FROTA'),
          escapeCsvField(feedbackNotas)
        ].join(';') + '\r\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="despacho-comercial-implementos-${timestamp}.csv"`);
    } else {
      // Formato Padrão Comercial Completo (B2B CRM) com Perfil ICP, Geolocalização, Dados Verticais e Hierarquia Societária
      const headers = [
        'CNPJ', 'Razão Social', 'Nome Fantasia', 'Perfil ICP', 'Vertical', 'Métrica Setorial', 'Registro Setorial',
        'CNAE Principal Código', 'CNAE Principal Descrição',
        'Porte', 'Capital Social', 'UF', 'Município', 'Bairro', 'Logradouro', 'Número', 'CEP',
        'Endereço Operacional Reconciliado', 'Status Reconciliação', 'Fonte Reconciliação',
        'Telefone', 'E-mail',
        'Grupo Econômico', 'Papel no Grupo', 'Capital Consolidado do Grupo',
        'Conta-Mãe (CNPJ)', 'Conta-Mãe (Razão Social)', 'Nº Empresas no Grupo'
      ];
      csvContent += headers.map(escapeCsvField).join(';') + '\r\n';

      leads.forEach(l => {
        const perfilIcp = l.target_type === 'BUYER' ? 'Comprador (ICP)' : 'Fornecedor/Revenda';
        
        let verticalDataObj = {};
        if (l.vertical_data) {
          try {
            verticalDataObj = typeof l.vertical_data === 'string' ? JSON.parse(l.vertical_data) : l.vertical_data;
          } catch (e) {
            verticalDataObj = {};
          }
        }

        let metricDesc = '';
        let registroDesc = '';

        if (l.vertical_type === 'AGRO') {
          metricDesc = verticalDataObj.hectares_formatados || '';
          registroDesc = verticalDataObj.registro_car || '';
        } else if (l.vertical_type === 'JURIDICO') {
          metricDesc = verticalDataObj.processos_formatados || '';
          registroDesc = verticalDataObj.oab_seccional || '';
        } else if (l.vertical_type === 'SAUDE') {
          metricDesc = verticalDataObj.leitos_formatados || '';
          registroDesc = `CNES ${verticalDataObj.codigo_cnes || ''}`;
        } else if (l.vertical_type === 'CONSTRUCAO') {
          metricDesc = verticalDataObj.obras_formatadas || '';
          registroDesc = verticalDataObj.registro_crea || '';
        }

        const eg = l.economic_group;
        const grupoNome = eg ? eg.group_name : 'Independente';
        const papelGrupo = eg ? eg.role_in_group : '—';
        const capitalConsolidado = eg ? (eg.group_total_capital ? `R$ ${Number(eg.group_total_capital).toLocaleString('pt-BR')}` : '—') : '—';
        const maeCnpj = eg ? (eg.parent_cnpj || '—') : '—';
        const maeRazao = eg ? (eg.parent_name || '—') : '—';
        const qtdEmpresas = eg ? (eg.group_members_count || 1) : 1;

        csvContent += [
          escapeCsvField(l.cnpj),
          escapeCsvField(l.razao_social),
          escapeCsvField(l.nome_fantasia || ''),
          escapeCsvField(perfilIcp),
          escapeCsvField(l.vertical_type || 'GERAL'),
          escapeCsvField(metricDesc),
          escapeCsvField(registroDesc),
          escapeCsvField(l.cnae_principal_codigo),
          escapeCsvField(l.cnae_principal_descricao),
          escapeCsvField(l.porte),
          escapeCsvField(l.capital_social ? l.capital_social.toFixed(2) : '0.00'),
          escapeCsvField(l.uf),
          escapeCsvField(l.municipio),
          escapeCsvField(l.bairro || ''),
          escapeCsvField(l.logradouro || ''),
          escapeCsvField(l.numero || ''),
          escapeCsvField(l.cep || ''),
          escapeCsvField(l.endereco_operacional || '—'),
          escapeCsvField(l.address_reconciled ? 'RECONCILIADO' : 'RECEITA_ORIGINAL'),
          escapeCsvField(l.reconciliation_source || '—'),
          escapeCsvField(l.telefone || ''),
          escapeCsvField(l.email || ''),
          escapeCsvField(grupoNome),
          escapeCsvField(papelGrupo),
          escapeCsvField(capitalConsolidado),
          escapeCsvField(maeCnpj),
          escapeCsvField(maeRazao),
          escapeCsvField(String(qtdEmpresas))
        ].join(';') + '\r\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="leads-b2b-${timestamp}.csv"`);
    }

    // Fase 26: Debita quotas do usuário autenticado e registra telemetria
    req.exportedCount = leads.length;
    if (req.user && req.user.id) {
      import('../middleware/auditAndQuotaMiddleware.js').then(({ consumeExportQuota }) => {
        consumeExportQuota(req.user.id, leads.length);
      }).catch(() => {});
    }

    res.send(csvContent);
  } catch (error) {
    console.error('Erro ao exportar leads:', error);
    res.status(500).json({ error: 'Falha na geração do arquivo de exportação' });
  }
}

/**
 * Exportação de Geofencing Tático para o Meta Ads (Fase 23: Inteligência Competitiva)
 * GET /api/competitors/export-geofencing
 * POST /api/competitors/export-geofencing
 * 
 * Extrai coordenadas (Latitude, Longitude, Raio em KM) e Gap Scores das zonas de vazios
 * para cópia direta ou importação no Gerenciador de Anúncios da Meta (Localização por Alfinete).
 */
export function exportCompetitorGeofencing(req, res) {
  try {
    const params = req.method === 'GET' ? req.query : (req.body || {});
    const competitorId = params.competitor_id || null;
    const bufferKm = parseFloat(params.buffer_km) || 50;
    const format = (params.format || 'csv').toLowerCase();
    const minScore = parseFloat(params.min_score) || 0;
    const tenantId = getTenantFromRequest(req);

    import('../services/competitorIntelligenceService.js').then(({ calculateMarketGaps }) => {
      let gapZones = calculateMarketGaps({
        competitor_id: competitorId,
        buffer_km: bufferKm,
        tenant_id: tenantId
      });

      if (!gapZones || gapZones.length === 0) {
        return res.status(400).json({ error: 'Nenhuma zona de gap identificada para os parâmetros informados.' });
      }

      // Aplica corte mínimo de Gap Score se fornecido
      if (minScore > 0) {
        gapZones = gapZones.filter(z => (z.gap_score || 0) >= minScore);
      }

      // Adiciona ranking ordinal e meta_ads_target_string
      const enrichedZones = gapZones.map((zone, idx) => {
        const lat = zone.latitude !== undefined && zone.latitude !== null ? Number(zone.latitude) : 0;
        const lng = zone.longitude !== undefined && zone.longitude !== null ? Number(zone.longitude) : 0;
        const radius = Number(zone.recommended_radius_km) || 50;
        return {
          ranking: idx + 1,
          municipio: zone.municipio || '',
          uf: zone.uf || '',
          gap_score: Number(zone.gap_score) || 0,
          prioridade: zone.priority_level || 'ALTA',
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
          radius_km: radius,
          potencial_demanda_anual: zone.estimated_market_brl || 0,
          potencial_demanda_formatado: zone.estimated_market_formatted || `R$ ${(zone.estimated_market_brl / 1e6).toFixed(1)}M/ano`,
          distancia_concorrente_km: Number(zone.min_distance_competitor_km) || 0,
          concorrente_referencia: zone.closest_competitor || '—',
          meta_ads_target_string: `${lat.toFixed(6)},${lng.toFixed(6)}:+${radius}km`
        };
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = competitorId 
        ? `versus_geofencing_gaps_competitor_${competitorId}_${timestamp}.${format === 'json' ? 'json' : 'csv'}`
        : `versus_geofencing_gaps_${timestamp}.${format === 'json' ? 'json' : 'csv'}`;

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.json({
          success: true,
          mode: competitorId ? 'SINGLE_COMPETITOR_RELATIVE' : 'AGGREGATED_NETWORK',
          competitor_id: competitorId,
          total_zones: enrichedZones.length,
          min_score: minScore,
          data: enrichedZones
        });
      }

      let csvContent = '\uFEFF'; // UTF-8 BOM
      const headers = [
        'ranking',
        'municipio',
        'uf',
        'gap_score',
        'prioridade',
        'latitude',
        'longitude',
        'radius_km',
        'potencial_demanda_anual',
        'distancia_concorrente_km',
        'meta_ads_target_string'
      ];
      csvContent += headers.join(';') + '\r\n';

      enrichedZones.forEach(zone => {
        csvContent += [
          escapeCsvField(String(zone.ranking)),
          escapeCsvField(zone.municipio),
          escapeCsvField(zone.uf),
          escapeCsvField(String(zone.gap_score)),
          escapeCsvField(zone.prioridade),
          escapeCsvField(String(zone.latitude)),
          escapeCsvField(String(zone.longitude)),
          escapeCsvField(String(zone.radius_km)),
          escapeCsvField(String(zone.potencial_demanda_anual)),
          escapeCsvField(String(zone.distancia_concorrente_km)),
          escapeCsvField(zone.meta_ads_target_string)
        ].join(';') + '\r\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    }).catch(err => {
      console.error('Erro ao calcular gaps para geofencing:', err);
      res.status(500).json({ error: 'Falha ao processar motor de gaps de mercado.' });
    });
  } catch (error) {
    console.error('Erro na exportação de geofencing:', error);
    res.status(500).json({ error: 'Falha ao gerar arquivo de geofencing para o Meta Ads.' });
  }
}

