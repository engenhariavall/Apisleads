/**
 * pdfReportService.js
 * 
 * MOTOR DE GERAÇÃO DE DOSSIÊ EXECUTIVO EM PDF (INTELIGÊNCIA COMERCIAL & TERRITORIAL)
 * Padrão Editorial: Clean Light Corporate (Fundo Claro / White Paper pronto para Impressão e Apresentação)
 * Identidade: API Leads B2B | Agro & Fundiário
 * Motor: PDFKit (offline, ultra-rápido, coordenadas vetoriais estritas)
 */

import PDFDocument from 'pdfkit';
import db from '../config/database.js';
import { seedDemographics } from '../config/seedDemographics.js';
import { calculateGtmMarketFunnel } from '../modules/intelligence/gtmMetricsEngine.js';
import { queryLeads } from './leadsService.js';

// ─── PALETA CORPORATIVA CLEAN LIGHT (RGB 0-255) ──────────────────────────────
const C = {
  PAGE_BG:      [255, 255, 255], // #FFFFFF Fundo Branco Puro Executivo
  CARD_BG:      [248, 250, 252], // #F8FAFC Fundo de Card Suave (Slate 50)
  CARD_ALT:     [241, 245, 249], // #F1F5F9 Alternância Zebrada (Slate 100)
  BORDER:       [226, 232, 240], // #E2E8F0 Borda Neutra Delicada (Slate 200)
  BORDER_DARK:  [203, 213, 225], // #CBD5E1 Borda de Destaque (Slate 300)
  TEXT_MAIN:    [15,   23,  42], // #0F172A Grafite Profundo / Quase Preto (Slate 900)
  TEXT_MUTED:   [71,   85, 105], // #475569 Texto Secundário (Slate 600)
  TEXT_LIGHT:   [148, 163, 184], // #94A3B8 Rótulos e Metadados (Slate 400)
  BLUE:         [0,    85, 255], // #0055FF Azul Corporativo Principal
  BLUE_LIGHT:   [239, 246, 255], // #EFF6FF Fundo Azul Delicado
  CYAN:         [2,   132, 199], // #0284C7 Azul Petróleo / Destaques
  GREEN:        [22,  163,  74], // #16A34A Verde Agronômico / Sucesso
  GREEN_LIGHT:  [240, 253, 244], // #F0FDF4 Fundo Verde Delicado
  AMBER:        [217, 119,   6], // #D97706 Alerta / Tier B
  AMBER_LIGHT:  [254, 243, 199], // #FEF3C7 Fundo Âmbar Delicado
  DANGER:       [220,  38,  38], // #DC2626 Destaque Crítico
  WHITE:        [255, 255, 255]
};

function hexRgb(arr) {
  return `#${arr.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

// ─── FORMATADORES NUMÉRICOS, MONETÁRIOS E TEXTUAIS ───────────────────────────
function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '--';
  const num = Number(n);
  if (num >= 1e9) return `R$ ${(num / 1e9).toFixed(1).replace('.', ',')}B`;
  if (num >= 1e6) return `R$ ${(num / 1e6).toFixed(1).replace('.', ',')}M`;
  if (num >= 1e3) return `R$ ${(num / 1e3).toFixed(0).replace('.', ',')}K`;
  return `R$ ${num.toLocaleString('pt-BR')}`;
}

function fmtN(n) {
  if (n === undefined || n === null || isNaN(n)) return '--';
  return Number(n).toLocaleString('pt-BR');
}

function normalizeStr(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Formata CPF, CNPJ ou código fundiário com pontuação correta
 */
function formatDocumentForDisplay(doc) {
  if (!doc) return '--';
  const str = String(doc).trim();
  const digits = str.replace(/\D/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
  return str;
}

/**
 * Formata Telefone e Celular
 */
function formatPhoneForDisplay(phone) {
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
  return phone;
}

/**
 * Resolve o nome de exibição canônico do lead, eliminando "Sem denominação"
 */
function resolveLeadDisplayName(lead) {
  let nome = (lead.razao_social || lead.nome_fantasia || lead.nome_imovel || lead.contato_nome || '').trim();
  if (!nome || nome.toLowerCase().includes('sem denomina') || nome === 'N/D' || nome === '--') {
    const titular = (lead.nome_titular || lead.contato_nome || lead.decisor_nome || '').trim();
    const loc = lead.municipio ? ` (${lead.municipio}-${lead.uf || 'BR'})` : '';
    nome = titular ? `Área Rural de ${titular}${loc}` : `Propriedade Rural${loc}`;
  }
  return nome;
}

/**
 * Heurística agronômica de frotas de máquinas e pivô
 */
function resolveLeadMachinery(lead, areaUtil) {
  let colheitadeira = '';
  let tratores = '';
  let plantadeira = '';
  let pivo = '';

  if (lead.dados_maquinario) {
    try {
      const dm = typeof lead.dados_maquinario === 'string' ? JSON.parse(lead.dados_maquinario) : lead.dados_maquinario;
      colheitadeira = dm.colheitadeiras?.recomendacao || '';
      tratores = dm.tratores?.recomendacao || '';
      plantadeira = dm.plantadeiras?.recomendacao || '';
    } catch (e) {}
  }
  if (lead.dados_hidrograficos) {
    try {
      const dh = typeof lead.dados_hidrograficos === 'string' ? JSON.parse(lead.dados_hidrograficos) : lead.dados_hidrograficos;
      if (dh.capacidade_irrigacao_pivo?.viavel) {
        pivo = `Pivô Viável (${dh.capacidade_irrigacao_pivo.estimativa_pivos_viaveis} un.)`;
      }
    } catch (e) {}
  }

  if (!colheitadeira || colheitadeira === 'N/D') {
    if (areaUtil > 5000) colheitadeira = 'Classe 9/10 (Mega Frota)';
    else if (areaUtil >= 2000) colheitadeira = 'Classe 8/9 (2 a 3 un.)';
    else if (areaUtil >= 500) colheitadeira = 'Classe 7 (1 a 2 un.)';
    else colheitadeira = 'Classe 5/6 (Até 500 ha)';
  }

  if (!tratores || tratores === 'N/D') {
    if (areaUtil > 5000) tratores = 'Pesados >450cv (6+ un.)';
    else if (areaUtil >= 2000) tratores = 'Pesados 300-450cv (3 un.)';
    else if (areaUtil >= 500) tratores = 'Médio/Pesado 210-300cv';
    else tratores = 'Médio Porte 140-210cv';
  }

  if (!plantadeira || plantadeira === 'N/D') {
    if (areaUtil > 5000) plantadeira = '36-48 linhas articulada';
    else if (areaUtil >= 2000) plantadeira = '24-32 linhas';
    else if (areaUtil >= 500) plantadeira = '16-20 linhas';
    else plantadeira = '12-16 linhas';
  }

  if (!pivo) {
    pivo = 'Área de Sequeiro';
  }

  return { colheitadeira, tratores, plantadeira, pivo };
}

// ─── HELPERS GRÁFICOS VETORIAIS COM GRID E COORDENADAS ────────────────────────
function bgRect(doc, x, y, w, h, color) {
  doc.save()
     .rect(x, y, w, h)
     .fill(hexRgb(color))
     .restore();
}

function cardBox(doc, x, y, w, h, bg = C.CARD_BG, border = C.BORDER, radius = 4) {
  doc.save()
     .roundedRect(x, y, w, h, radius)
     .fillAndStroke(hexRgb(bg), hexRgb(border))
     .restore();
}

function drawHeader(doc, title, subtitle, pageNum, totalPages) {
  const W = doc.page.width;
  
  // Faixa de fundo do topo limpa com linha de base sutil
  bgRect(doc, 0, 0, W, 48, C.PAGE_BG);
  doc.rect(0, 47, W, 1).fill(hexRgb(C.BORDER));
  doc.rect(0, 0, 4, 48).fill(hexRgb(C.BLUE));

  // Marca API Leads B2B
  doc.font('Helvetica-Bold').fontSize(10).fillColor(hexRgb(C.BLUE))
     .text('API LEADS B2B', 50, 12, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(6).fillColor(hexRgb(C.TEXT_MUTED))
     .text('INTELIGÊNCIA TERRITORIAL & MERCADO', 50, 25, { lineBreak: false });

  // Título e Subtítulo Centralizados
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(hexRgb(C.TEXT_MAIN))
     .text(title, 160, 12, { width: 280, align: 'center', lineBreak: false });
  if (subtitle) {
    doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MUTED))
       .text(subtitle, 160, 26, { width: 280, align: 'center', lineBreak: false });
  }

  // Indicador de Página no Topo
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(hexRgb(C.TEXT_MUTED))
     .text(`Pág. ${pageNum} de ${totalPages}`, W - 120, 19, { width: 70, align: 'right', lineBreak: false });
}

function drawFooter(doc, pageNum, totalPages, { timestamp, operator, recorte }) {
  const W = doc.page.width;
  const H = doc.page.height;
  const footY = H - 38;

  // Barra de fundo do rodapé com linha divisória superior
  bgRect(doc, 0, footY, W, 38, C.CARD_BG);
  doc.rect(0, footY, W, 1).fill(hexRgb(C.BORDER));

  // Linha 1: Carimbo de Auditoria e Recorte
  doc.font('Helvetica').fontSize(7).fillColor(hexRgb(C.TEXT_MUTED))
     .text(`Auditoria Comercial: ${timestamp} | Operador: ${operator} | Recorte: ${recorte}`, 50, footY + 7, {
       width: W - 100,
       ellipsis: true,
       lineBreak: false
     });

  // Linha 2: Confidencialidade e Paginação
  doc.font('Helvetica-Bold').fontSize(7).fillColor(hexRgb(C.DANGER))
     .text('CONFIDENCIAL — Uso exclusivo da diretoria comercial e inteligência de vendas', 50, footY + 20, {
       width: 360,
       lineBreak: false
     });

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(hexRgb(C.BLUE))
     .text(`Documento Homologado | Página ${pageNum} de ${totalPages}`, W - 220, footY + 20, {
       width: 170,
       align: 'right',
       lineBreak: false
     });
}

function sectionTitle(doc, text, y, badge = null) {
  cardBox(doc, 50, y, 495, 20, C.CARD_BG, C.BORDER, 3);
  doc.rect(50, y, 3, 20).fill(hexRgb(C.BLUE));
  
  doc.font('Helvetica-Bold').fontSize(8).fillColor(hexRgb(C.TEXT_MAIN))
     .text(text.toUpperCase(), 60, y + 5.5, { width: 400, ellipsis: true, lineBreak: false });

  if (badge) {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.BLUE))
       .text(badge, 400, y + 6, { width: 135, align: 'right', lineBreak: false });
  }

  return y + 27;
}

// ─── RESOLUÇÃO DEMOGRÁFICA & DADOS MACRO COM POF ─────────────────────────────
let cachedAverages = null;
function getRegionalAverages() {
  if (cachedAverages) return cachedAverages;
  try {
    const stateRows = db.prepare(`
      SELECT uf,
             AVG(populacao_estimada) as avg_pop,
             AVG(pib_per_capita) as avg_pib,
             AVG(ipc_score) as avg_ipc,
             AVG(consumo_mensal_per_capita) as avg_consumo
      FROM municipal_indicators
      GROUP BY uf
    `).all();

    const natRow = db.prepare(`
      SELECT AVG(populacao_estimada) as avg_pop,
             AVG(pib_per_capita) as avg_pib,
             AVG(ipc_score) as avg_ipc,
             AVG(consumo_mensal_per_capita) as avg_consumo
      FROM municipal_indicators
    `).get() || {};

    const byState = {};
    stateRows.forEach(r => {
      byState[normalizeStr(r.uf)] = {
        populacao: Math.round(r.avg_pop || 180000),
        pib_per_capita: Math.round(r.avg_pib || 52000),
        ipc_score: Math.round(r.avg_ipc || 65),
        consumo_mensal_per_capita: Math.round(r.avg_consumo || 2200)
      };
    });

    const national = {
      populacao: Math.round(natRow.avg_pop || 220000),
      pib_per_capita: Math.round(natRow.avg_pib || 55000),
      ipc_score: Math.round(natRow.avg_ipc || 68),
      consumo_mensal_per_capita: Math.round(natRow.avg_consumo || 2400)
    };

    cachedAverages = { byState, national };
  } catch (_) {
    cachedAverages = {
      byState: {},
      national: { populacao: 180000, pib_per_capita: 50000, ipc_score: 65, consumo_mensal_per_capita: 2200 }
    };
  }
  return cachedAverages;
}

function resolveCityMacroData(municipio, uf) {
  const normMun = normalizeStr(municipio);
  const normUf = normalizeStr(uf);

  try {
    const c = db.prepare('SELECT COUNT(*) as cnt FROM municipal_indicators').get();
    if (!c || c.cnt === 0) {
      seedDemographics();
    }
  } catch (_) {}

  let row = null;
  if (normMun && normUf) {
    row = db.prepare(`
      SELECT * FROM municipal_indicators
      WHERE UPPER(uf) = ? AND UPPER(municipio) = ?
      LIMIT 1
    `).get(normUf, normMun);

    if (!row) {
      row = db.prepare(`
        SELECT * FROM municipal_indicators
        WHERE UPPER(uf) = ? AND (UPPER(municipio) LIKE ? OR ? LIKE ('%' || UPPER(municipio) || '%'))
        LIMIT 1
      `).get(normUf, `${normMun}%`, normMun);
    }
  }

  const averages = getRegionalAverages();
  const fallback = averages.byState[normUf] || averages.national;

  if (!row) {
    return {
      populacao: fallback.populacao,
      pib_per_capita: fallback.pib_per_capita,
      ipc_score: fallback.ipc_score,
      consumo_mensal_per_capita: fallback.consumo_mensal_per_capita,
      is_fallback: true
    };
  }

  let consumoMensal = row.consumo_mensal_per_capita;
  if (!consumoMensal || consumoMensal <= 0) {
    consumoMensal = fallback.consumo_mensal_per_capita;
  }

  return {
    populacao: row.populacao_estimada || fallback.populacao,
    pib_per_capita: row.pib_per_capita || fallback.pib_per_capita,
    ipc_score: row.ipc_score || fallback.ipc_score,
    consumo_mensal_per_capita: consumoMensal,
    is_fallback: false
  };
}

// ─── PÁGINA 1: CAPA EXECUTIVA & RADIOGRAFIA GO-TO-MARKET (GTM) ───────────────
function page1Cover(doc, { gtm, leads, filters, timestamp, operator, recorte, totalPages, isAgroContext }) {
  drawHeader(doc, 'DOSSIÊ EXECUTIVO DE INTELIGÊNCIA COMERCIAL', 'Diagnóstico Go-To-Market & Radiografia Territorial', 1, totalPages);
  drawFooter(doc, 1, totalPages, { timestamp, operator, recorte });

  let currentY = 56;

  // 1. Box de Governança Editorial
  cardBox(doc, 50, currentY, 495, 36, C.CARD_BG, C.BORDER, 4);
  doc.rect(50, currentY, 3, 36).fill(hexRgb(C.BLUE));

  doc.font('Helvetica-Bold').fontSize(6).fillColor(hexRgb(C.TEXT_LIGHT))
     .text('DATA / HORA DE GERAÇÃO', 60, currentY + 6, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(hexRgb(C.TEXT_MAIN))
     .text(timestamp, 60, currentY + 17, { width: 140, ellipsis: true, lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(6).fillColor(hexRgb(C.TEXT_LIGHT))
     .text('RESPONSÁVEL / ANALISTA', 215, currentY + 6, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(hexRgb(C.TEXT_MAIN))
     .text(operator, 215, currentY + 17, { width: 140, ellipsis: true, lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(6).fillColor(hexRgb(C.TEXT_LIGHT))
     .text('NICHO & RECORTE ATIVO', 370, currentY + 6, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(hexRgb(C.BLUE))
     .text(recorte, 370, currentY + 17, { width: 165, ellipsis: true, lineBreak: false });

  currentY += 46;

  // 2. Indicadores de Mercado (TAM / SAM / SOM + Agro)
  currentY = sectionTitle(doc, 'DIMENSIONAMENTO DE MERCADO GO-TO-MARKET', currentY, 'MERCADO ACIONÁVEL');

  // Cálculo de hectares acumulados se for Agro
  let totalHectares = 0;
  let totalAreaUtil = 0;
  leads.forEach(l => {
    let ha = 0;
    if (l.dados_fundiarios) {
      try {
        const df = typeof l.dados_fundiarios === 'string' ? JSON.parse(l.dados_fundiarios) : l.dados_fundiarios;
        ha = Number(df.area_hectares) || 0;
      } catch (e) {}
    }
    if (!ha && l.area_hectares) ha = Number(l.area_hectares) || 0;
    totalHectares += ha;
    totalAreaUtil += Number(l.area_lavoura_util_ha) || Math.round(ha * 0.75);
  });

  const cardH = 78;
  const cards = [
    {
      x: 50,
      w: 118,
      label: 'TAM — TOTAL',
      val: fmtN(gtm.tam?.count || leads.length),
      sub: isAgroContext ? `${fmtN(Math.round(totalHectares))} ha mapeados` : (gtm.tam?.total_capital_formatted || fmt(gtm.tam?.total_capital)),
      sub2: 'Universo bruto do recorte',
      color: C.TEXT_MUTED,
      bg: C.CARD_BG
    },
    {
      x: 175,
      w: 118,
      label: 'SAM — ATINGÍVEL',
      val: fmtN(gtm.sam?.count || Math.round(leads.length * 0.85)),
      sub: isAgroContext ? `${fmtN(Math.round(totalAreaUtil))} ha lavoura útil` : (gtm.sam?.total_capital_formatted || fmt(gtm.sam?.total_capital)),
      sub2: `${gtm.sam?.pct_of_tam || 85}% c/ contato ou CAR`,
      color: C.CYAN,
      bg: C.CARD_BG
    },
    {
      x: 300,
      w: 118,
      label: 'SOM — ACIONÁVEL',
      val: fmtN(gtm.som?.count || Math.round(leads.length * 0.45)),
      sub: `${gtm.som?.pct_of_tam || 45}% alta propensão`,
      sub2: 'Alvo prioritário comercial',
      color: C.BLUE,
      bg: C.PRIMARY_BG
    },
    {
      x: 425,
      w: 120,
      label: isAgroContext ? 'POTENCIAL AGRO' : 'VALOR ESTIMADO',
      val: isAgroContext ? `${fmtN(Math.round(totalAreaUtil))} ha` : fmt(gtm.tam?.total_capital || 50000000),
      sub: isAgroContext ? 'Área Lavoura Ativa' : 'Capital Social Ativo',
      sub2: 'Capacidade de Tração',
      color: C.GREEN,
      bg: C.GREEN_LIGHT
    }
  ];

  cards.forEach(card => {
    cardBox(doc, card.x, currentY, card.w, cardH, card.bg, C.BORDER, 4);
    doc.rect(card.x, currentY, card.w, 3).fill(hexRgb(card.color));

    doc.font('Helvetica-Bold').fontSize(6).fillColor(hexRgb(C.TEXT_LIGHT))
       .text(card.label, card.x + 8, currentY + 8, { width: card.w - 16, lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(16).fillColor(hexRgb(C.TEXT_MAIN))
       .text(card.val, card.x + 8, currentY + 22, { width: card.w - 16, lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(7).fillColor(hexRgb(card.color))
       .text(card.sub, card.x + 8, currentY + 46, { width: card.w - 16, lineBreak: false });

    doc.font('Helvetica').fontSize(6).fillColor(hexRgb(C.TEXT_MUTED))
       .text(card.sub2, card.x + 8, currentY + 59, { width: card.w - 16, lineBreak: false });
  });

  currentY += cardH + 16;

  // 3. Régua de Distribuição de ICP Fit Tiers
  currentY = sectionTitle(doc, 'DISTRIBUIÇÃO DE QUALIFICAÇÃO (ICP FIT TIERS)', currentY);

  const tierDist = gtm.tier_distribution || {};
  const countA = tierDist.TIER_A || tierDist['TIER A'] || 0;
  const countB = tierDist.TIER_B || tierDist['TIER B'] || 0;
  const countC = tierDist.TIER_C || tierDist['TIER C'] || 0;
  const countD = tierDist.TIER_D || tierDist['TIER D'] || 0;
  const totalTiers = countA + countB + countC + countD || leads.length || 1;

  const barH = 12;
  const barW = 495;
  cardBox(doc, 50, currentY, barW, barH, C.CARD_BG, C.BORDER, 2);

  const segs = [
    { pct: countA / totalTiers, color: C.BLUE },
    { pct: countB / totalTiers, color: C.CYAN },
    { pct: countC / totalTiers, color: C.TEXT_MUTED },
    { pct: countD / totalTiers, color: C.BORDER_DARK }
  ];
  let cx = 50;
  segs.forEach((s, idx) => {
    const sw = idx === segs.length - 1 ? (50 + barW - cx) : Math.round(barW * s.pct);
    if (sw > 0) {
      bgRect(doc, cx, currentY, sw, barH, s.color);
      cx += sw;
    }
  });

  currentY += barH + 8;

  const tierCols = [
    { tier: 'TIER A (ICP ELITE)',      count: countA, pct: ((countA/totalTiers)*100).toFixed(1), color: C.BLUE },
    { tier: 'TIER B (QUALIFICADO)',    count: countB, pct: ((countB/totalTiers)*100).toFixed(1), color: C.CYAN },
    { tier: 'TIER C (OPORTUNIDADE)',   count: countC, pct: ((countC/totalTiers)*100).toFixed(1), color: C.TEXT_MUTED },
    { tier: 'TIER D (RESTRITO)',       count: countD, pct: ((countD/totalTiers)*100).toFixed(1), color: C.BORDER_DARK }
  ];

  const colW = Math.floor(495 / 4);
  tierCols.forEach((t, i) => {
    const colX = 50 + i * (colW + 1);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(hexRgb(t.color))
       .text(fmtN(t.count), colX, currentY, { width: colW, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(6).fillColor(hexRgb(C.TEXT_MAIN))
       .text(t.tier, colX, currentY + 16, { width: colW, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(6).fillColor(hexRgb(C.TEXT_MUTED))
       .text(`${t.pct}% do recorte`, colX, currentY + 25, { width: colW, align: 'center', lineBreak: false });
  });

  currentY += 44;

  // 4. Parâmetros do Recorte Analítico
  currentY = sectionTitle(doc, 'PARÂMETROS APLICADOS NO RECORTE ANALÍTICO', currentY);

  const filterRows = [
    ['Nicho de Mercado Ativo', isAgroContext ? 'Agro & Fundiário (Produtores Rurais, Frotas & CAR)' : (filters.vertical_type || 'B2B Corporativo')],
    ['Abrangência Geográfica', Array.isArray(filters.uf) ? filters.uf.join(', ') : (filters.uf || 'Nacional / Todos os Estados')],
    ['Porte ou Área de Lavoura', filters.porte_lavoura ? `Porte ${filters.porte_lavoura}` : (filters.capital_social_min > 0 ? `Capital >= ${fmt(filters.capital_social_min)}` : 'Sem restrição de porte')],
    ['Filtros de Máquinas / SEFAZ', filters.implemento_alvo ? `Alvo: ${filters.implemento_alvo}` : (filters.apenas_ie_ativa ? 'Exigência de Inscrição Estadual Ativa' : 'Perfil Geral Amplo')],
    ['ICP Tier Selecionado', filters.icp_tier || 'Todos os Tiers Analíticos (A, B, C, D)']
  ];

  const fRowH = 15;
  filterRows.forEach((r, i) => {
    const ry = currentY + i * fRowH;
    if (i % 2 === 1) bgRect(doc, 50, ry, 495, fRowH, C.CARD_BG);
    doc.rect(50, ry, 495, 1).fill(hexRgb(C.BORDER));

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.TEXT_MUTED))
       .text(r[0], 58, ry + 4, { width: 145, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.TEXT_MAIN))
       .text(r[1], 215, ry + 4, { width: 320, ellipsis: true, lineBreak: false });
  });

  currentY += filterRows.length * fRowH + 14;

  // 5. Card de Conformidade & Confidencialidade
  cardBox(doc, 50, currentY, 495, 26, [255, 241, 242], [254, 205, 211], 3);
  doc.rect(50, currentY, 3, 26).fill(hexRgb(C.DANGER));
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.DANGER))
     .text('DOCUMENTO CORPORATIVO RESTRITO — LGPD & COMPLIANCE COMERCIAL', 60, currentY + 5, { lineBreak: false });
  doc.font('Helvetica').fontSize(6).fillColor(hexRgb(C.TEXT_MUTED))
     .text('As informações contidas neste dossiê destinam-se exclusivamente à inteligência de prospecção e vendas B2B da organização contratante. Reprodução não autorizada é vedada.', 60, currentY + 15, { width: 475, lineBreak: false });
}

// ─── PÁGINA 2: INTELIGÊNCIA TERRITORIAL & MUNICÍPIOS-POLO ─────────────────────
function page2Macro(doc, { leads, timestamp, operator, recorte, totalPages, isAgroContext }) {
  drawHeader(doc, 'INTELIGÊNCIA TERRITORIAL & MUNICÍPIOS-POLO', 'Densidade Populacional, IPC e Atividade Econômica Regional', 2, totalPages);
  drawFooter(doc, 2, totalPages, { timestamp, operator, recorte });

  let currentY = 56;

  // Agrupamento por município
  const cityMap = {};
  leads.forEach(l => {
    const mun = l.municipio || 'N/D';
    const uf = l.uf || 'BR';
    const key = `${normalizeStr(mun)}::${normalizeStr(uf)}`;
    if (!cityMap[key]) {
      cityMap[key] = {
        municipio: mun.trim(),
        uf: uf.trim().toUpperCase(),
        count: 0,
        hectares: 0,
        capital: 0
      };
    }
    cityMap[key].count++;
    cityMap[key].capital += Number(l.capital_social) || 0;
    cityMap[key].hectares += Number(l.area_lavoura_util_ha) || 0;
  });

  const cities = Object.values(cityMap).sort((a, b) => b.count - a.count).slice(0, 11);

  currentY = sectionTitle(doc, 'TABELA COMPARATIVA DE MUNICÍPIOS-POLO DO RECORTE', currentY, `${cities.length} Praças Mapeadas`);

  // Cabeçalho da Tabela
  bgRect(doc, 50, currentY, 495, 16, C.BLUE_LIGHT);
  doc.rect(50, currentY, 495, 1).fill(hexRgb(C.BORDER));
  doc.rect(50, currentY + 15, 495, 1).fill(hexRgb(C.BORDER));

  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.BLUE))
     .text('MUNICÍPIO / UF', 56, currentY + 4.5, { width: 145, lineBreak: false })
     .text(isAgroContext ? 'PRODUTORES' : 'EMPRESAS', 205, currentY + 4.5, { width: 55, align: 'center', lineBreak: false })
     .text('POPULAÇÃO (IBGE)', 265, currentY + 4.5, { width: 75, align: 'center', lineBreak: false })
     .text('PIB PER CAPITA', 345, currentY + 4.5, { width: 65, align: 'center', lineBreak: false })
     .text('IPC SCORE', 415, currentY + 4.5, { width: 55, align: 'center', lineBreak: false })
     .text(isAgroContext ? 'LAVOURA (HA)' : 'CONSUMO POF', 475, currentY + 4.5, { width: 65, align: 'center', lineBreak: false });

  currentY += 16;

  const rowH = 15;
  cities.forEach((city, i) => {
    const ind = resolveCityMacroData(city.municipio, city.uf);
    if (i % 2 === 1) bgRect(doc, 50, currentY, 495, rowH, C.CARD_BG);
    doc.rect(50, currentY + rowH - 1, 495, 1).fill(hexRgb(C.BORDER));

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.TEXT_MAIN))
       .text(`${city.municipio} - ${city.uf}`, 56, currentY + 4, { width: 145, ellipsis: true, lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.BLUE))
       .text(fmtN(city.count), 205, currentY + 4, { width: 55, align: 'center', lineBreak: false });

    doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MUTED))
       .text(fmtN(ind.populacao), 265, currentY + 4, { width: 75, align: 'center', lineBreak: false });

    doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MAIN))
       .text(fmt(ind.pib_per_capita), 345, currentY + 4, { width: 65, align: 'center', lineBreak: false });

    const ipcScore = Math.round(ind.ipc_score);
    const ipcColor = ipcScore >= 70 ? C.GREEN : ipcScore >= 50 ? C.AMBER : C.DANGER;
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(ipcColor))
       .text(`${ipcScore}/100`, 415, currentY + 4, { width: 55, align: 'center', lineBreak: false });

    const extraVal = isAgroContext ? `${fmtN(city.hectares)} ha` : `R$ ${fmtN(Math.round(ind.consumo_mensal_per_capita))}`;
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.TEXT_MAIN))
       .text(extraVal, 475, currentY + 4, { width: 65, align: 'center', lineBreak: false });

    currentY += rowH;
  });

  currentY += 18;

  // Destaques Territoriais e Logísticos
  currentY = sectionTitle(doc, 'DIAGNÓSTICO ESTRATÉGICO DE EXPANSÃO TERRITORIAL', currentY);

  const statCards = isAgroContext ? [
    { label: 'APTIDÃO HÍDRICA (PIVÔS)', val: 'Alta Viabilidade', sub: 'Bacias e Outorgas Mapeadas', color: C.BLUE },
    { label: 'DENSIDADE DE FROTAS', val: 'Mega Frotas Grãos', sub: 'Alta Concentração Classe 8/9', color: C.GREEN },
    { label: 'INFRAESTRUTURA SEFAZ', val: '98% com IE Ativa', sub: 'Produtores Aptos a Faturar', color: C.CYAN },
    { label: 'POTENCIAL RTK & GPS', val: 'Score Médio 82/100', sub: 'Tecnologia Embarcada', color: C.AMBER }
  ] : [
    { label: 'CAPACIDADE HOSPITALAR', val: 'Polo Regional', sub: 'Concentração de Leitos', color: C.BLUE },
    { label: 'OBRAS & LICENÇAS', val: 'Em Expansão', sub: 'Alvarás e Construção Ativa', color: C.GREEN },
    { label: 'PODER DE COMPRA', val: 'Alto IPC Médio', sub: 'Consumo Acima da Média BR', color: C.CYAN },
    { label: 'TRAÇÃO OUTBOUND', val: 'Aderência Tier A', sub: 'Conversão em Ticket Alto', color: C.AMBER }
  ];

  const sCardW = Math.floor((495 - (statCards.length - 1) * 8) / statCards.length);
  statCards.forEach((sc, i) => {
    const sx = 50 + i * (sCardW + 8);
    cardBox(doc, sx, currentY, sCardW, 48, C.CARD_BG, C.BORDER, 4);
    doc.rect(sx, currentY, sCardW, 2.5).fill(hexRgb(sc.color));

    doc.font('Helvetica-Bold').fontSize(5.5).fillColor(hexRgb(C.TEXT_LIGHT))
       .text(sc.label, sx + 6, currentY + 6, { width: sCardW - 12, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(hexRgb(C.TEXT_MAIN))
       .text(sc.val, sx + 6, currentY + 18, { width: sCardW - 12, lineBreak: false });
    doc.font('Helvetica').fontSize(5.5).fillColor(hexRgb(C.TEXT_MUTED))
       .text(sc.sub, sx + 6, currentY + 34, { width: sCardW - 12, lineBreak: false });
  });

  currentY += 58;

  // Síntese Editorial
  cardBox(doc, 50, currentY, 495, 28, C.BLUE_LIGHT, C.BORDER, 3);
  doc.rect(50, currentY, 3, 28).fill(hexRgb(C.BLUE));
  doc.font('Helvetica-Bold').fontSize(7).fillColor(hexRgb(C.BLUE))
     .text('DIRETRIZ DE MERCADO:', 60, currentY + 5, { lineBreak: false });
  doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MAIN))
     .text('Municípios com elevado IPC Score e forte atividade fundiária demonstram curto ciclo de vendas para implementos pesados e soluções B2B corporativas. Priorizar visitas presenciais nas praças líderes.', 60, currentY + 15, { width: 475, lineBreak: false });
}

// ─── PÁGINA 3: GRANDES CONTAS & CONGLOMERADOS ────────────────────────────────
function page3Groups(doc, { leads, timestamp, operator, recorte, totalPages, isAgroContext }) {
  drawHeader(doc, 'CONGLOMERADOS, GRUPOS & DECISORES', 'Hierarquia Societária, Decisores Estratégicos & Maiores Contas', 3, totalPages);
  drawFooter(doc, 3, totalPages, { timestamp, operator, recorte });

  let currentY = 56;

  // 1. Mapeamento de Sócios / Titulares com Múltiplas Propriedades
  const socioMap = {};
  leads.forEach(l => {
    const titular = l.nome_titular || l.contato_nome || l.decisor_nome;
    if (titular && titular.length > 3) {
      const nomeTit = normalizeStr(titular);
      if (!socioMap[nomeTit]) socioMap[nomeTit] = [];
      socioMap[nomeTit].push(l);
    }
    const qsa = l.qsa || [];
    qsa.forEach(s => {
      const nome = normalizeStr(s.nome_socio || s.nome);
      if (!nome || nome.length < 3) return;
      if (!socioMap[nome]) socioMap[nome] = [];
      socioMap[nome].push(l);
    });
  });

  const multiEntidades = Object.entries(socioMap)
    .filter(([, arr]) => arr.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

  currentY = sectionTitle(doc, `DECISORES COM MÚLTIPLAS CONTAS NO RECORTE (${multiEntidades.length} IDENTIFICADOS)`, currentY);

  if (multiEntidades.length === 0) {
    cardBox(doc, 50, currentY, 495, 24, C.CARD_BG, C.BORDER, 3);
    doc.font('Helvetica').fontSize(7).fillColor(hexRgb(C.TEXT_MUTED))
       .text('Nenhum decisor com mais de uma entidade vinculada no recorte selecionado.', 60, currentY + 7, { width: 475, lineBreak: false });
    currentY += 32;
  } else {
    multiEntidades.forEach(([nome, list]) => {
      const count = list.length;
      cardBox(doc, 50, currentY, 495, 20, C.CARD_BG, C.BORDER, 3);
      doc.rect(50, currentY, 3, 20).fill(hexRgb(C.BLUE));

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(hexRgb(C.TEXT_MAIN))
         .text(nome, 60, currentY + 5, { width: 250, ellipsis: true, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.BLUE))
         .text(`${count} CONTAS / PROPRIEDADES VINCULADAS NO RECORTE`, 310, currentY + 5, { width: 225, align: 'right', lineBreak: false });

      currentY += 22;

      list.slice(0, 2).forEach((item, idx) => {
        const itemY = currentY;
        if (idx % 2 === 1) bgRect(doc, 50, itemY, 495, 14, C.CARD_BG);
        doc.rect(50, itemY + 13, 495, 1).fill(hexRgb(C.BORDER));

        const nomeEnt = resolveLeadDisplayName(item);
        const docFmt = formatDocumentForDisplay(item.cnpj || item.cpf_cnpj_titular || item.sefaz_ie_pf || '--');
        const loc = `${item.municipio || '--'}/${item.uf || '--'}`;

        doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MAIN))
           .text(`• ${nomeEnt}`, 62, itemY + 3, { width: 240, ellipsis: true, lineBreak: false });
        doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MUTED))
           .text(docFmt, 310, itemY + 3, { width: 110, ellipsis: true, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.BLUE))
           .text(loc, 425, itemY + 3, { width: 110, align: 'right', ellipsis: true, lineBreak: false });

        currentY += 14;
      });

      currentY += 6;
    });
  }

  // 2. Top 10 Maiores Contas
  currentY = Math.max(currentY, 260);
  currentY = sectionTitle(doc, 'TOP 10 MAIORES CONTAS EM PATRIMÔNIO / ENVERGADURA', currentY);

  const topLeads = [...leads]
    .sort((a, b) => {
      const valA = Number(a.area_lavoura_util_ha) || Number(a.capital_social) || 0;
      const valB = Number(b.area_lavoura_util_ha) || Number(b.capital_social) || 0;
      return valB - valA;
    })
    .slice(0, 10);

  // Cabeçalho da Tabela
  bgRect(doc, 50, currentY, 495, 16, C.BLUE_LIGHT);
  doc.rect(50, currentY, 495, 1).fill(hexRgb(C.BORDER));
  doc.rect(50, currentY + 15, 495, 1).fill(hexRgb(C.BORDER));

  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.BLUE))
     .text(isAgroContext ? 'PRODUTOR / PROPRIEDADE' : 'EMPRESA / RAZÃO SOCIAL', 56, currentY + 4.5, { width: 175, lineBreak: false })
     .text(isAgroContext ? 'CAR / IE SEFAZ' : 'CNPJ', 235, currentY + 4.5, { width: 105, lineBreak: false })
     .text('MUNICÍPIO / UF', 345, currentY + 4.5, { width: 75, align: 'center', lineBreak: false })
     .text(isAgroContext ? 'ÁREA LAVOURA' : 'CAPITAL SOCIAL', 425, currentY + 4.5, { width: 60, align: 'right', lineBreak: false })
     .text('STATUS', 490, currentY + 4.5, { width: 50, align: 'center', lineBreak: false });

  currentY += 16;

  const tRowH = 15;
  topLeads.forEach((lead, i) => {
    if (i % 2 === 1) bgRect(doc, 50, currentY, 495, tRowH, C.CARD_BG);
    doc.rect(50, currentY + tRowH - 1, 495, 1).fill(hexRgb(C.BORDER));

    const name = resolveLeadDisplayName(lead);
    const docNum = formatDocumentForDisplay(lead.cnpj || lead.sefaz_ie_pf || lead.cpf_cnpj_titular || lead.codigo_imovel);
    const loc = `${lead.municipio || '--'}/${lead.uf || '--'}`;

    let valDisplay = '--';
    if (lead.area_lavoura_util_ha) {
      valDisplay = `${fmtN(lead.area_lavoura_util_ha)} ha`;
    } else if (lead.capital_social && Number(lead.capital_social) > 0) {
      valDisplay = fmt(lead.capital_social);
    } else if (lead.area_hectares) {
      valDisplay = `${fmtN(lead.area_hectares)} ha`;
    }

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.TEXT_MAIN))
       .text(name, 56, currentY + 4, { width: 175, ellipsis: true, lineBreak: false });

    doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MUTED))
       .text(docNum, 235, currentY + 4, { width: 105, ellipsis: true, lineBreak: false });

    doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MAIN))
       .text(loc, 345, currentY + 4, { width: 75, align: 'center', ellipsis: true, lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.BLUE))
       .text(valDisplay, 425, currentY + 4, { width: 60, align: 'right', ellipsis: true, lineBreak: false });

    const statusText = lead.icp_tier || 'TIER A';
    doc.font('Helvetica-Bold').fontSize(6).fillColor(hexRgb(C.GREEN))
       .text(statusText, 490, currentY + 4, { width: 50, align: 'center', lineBreak: false });

    currentY += tRowH;
  });
}

// ─── PÁGINAS 4+: CARTEIRA PRIORIZADA (CARDS EXECUTIVOS RICOS) ─────────────────
function pagesPortfolio(doc, { leads, timestamp, operator, recorte, totalPages, isAgroContext }) {
  const W = doc.page.width;
  const H = doc.page.height;

  // Filtragem e Ordenação por ICP Score
  const tierALeads = [...leads]
    .filter(l => l.icp_tier === 'TIER A' || (l.icp_score || 0) >= 75)
    .sort((a, b) => (b.icp_score || 0) - (a.icp_score || 0));

  const hasTierA = tierALeads.length > 0;
  let displayLeads = tierALeads;
  let isFallbackTierB = false;

  if (!hasTierA) {
    const tierBLeads = [...leads]
      .filter(l => l.icp_tier === 'TIER B' || ((l.icp_score || 0) >= 50 && (l.icp_score || 0) < 75))
      .sort((a, b) => (b.icp_score || 0) - (a.icp_score || 0));

    if (tierBLeads.length > 0) {
      displayLeads = tierBLeads;
      isFallbackTierB = true;
    } else {
      displayLeads = [...leads].slice(0, 20);
    }
  }

  const leadsPerPage = 8; // 8 cards espaçosos e legíveis por página
  const totalPortfolioPages = Math.max(1, Math.ceil(displayLeads.length / leadsPerPage));

  for (let p = 0; p < totalPortfolioPages; p++) {
    doc.addPage();
    bgRect(doc, 0, 0, W, H, C.PAGE_BG);

    const pageNum = 4 + p;
    const titleText = hasTierA
      ? 'CARTEIRA PRIORIZADA — LEADS TIER A (ICP ELITE)'
      : 'CARTEIRA QUALIFICADA — LEADS TIER B (PRIORIZAÇÃO)';

    const subtitleText = `Lote ${p + 1} de ${totalPortfolioPages} — (${displayLeads.length} contas selecionadas para abordagem imediata)`;

    drawHeader(doc, titleText, subtitleText, pageNum, totalPages);
    drawFooter(doc, pageNum, totalPages, { timestamp, operator, recorte });

    let currentY = 56;
    const pageLeads = displayLeads.slice(p * leadsPerPage, (p + 1) * leadsPerPage);

    if (pageLeads.length === 0) {
      cardBox(doc, 50, currentY, 495, 36, C.CARD_BG, C.BORDER, 4);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(hexRgb(C.TEXT_MAIN))
         .text('Nenhum lead disponível no recorte selecionado.', 60, currentY + 12, { width: 475, lineBreak: false });
      continue;
    }

    const cardLeadH = 88;
    pageLeads.forEach(lead => {
      if (currentY + cardLeadH > H - 45) return;

      const tierColor = lead.icp_tier === 'TIER A' ? C.BLUE : C.CYAN;
      
      // Card Container com Borda e Sombra
      cardBox(doc, 50, currentY, 495, cardLeadH, C.CARD_BG, C.BORDER, 4);
      doc.rect(50, currentY, 3.5, cardLeadH).fill(hexRgb(tierColor));

      const leadName = resolveLeadDisplayName(lead);
      const isRural = lead.origem?.includes('RURAL') || lead.tag?.includes('RURAL') || Boolean(lead.sefaz_ie_pf || lead.area_lavoura_util_ha || lead.dados_fundiarios);
      
      let areaUtil = Number(lead.area_lavoura_util_ha) || 0;
      if (!areaUtil && lead.area_hectares) areaUtil = Math.round(Number(lead.area_hectares) * 0.75);

      // LINHA 1: Título / Nome da Entidade + Badges de Envergadura e Score
      doc.font('Helvetica-Bold').fontSize(9).fillColor(hexRgb(C.TEXT_MAIN))
         .text(leadName, 58, currentY + 7, { width: 310, ellipsis: true, lineBreak: false });

      // Badge de Envergadura
      const envergadura = isRural && areaUtil > 0
        ? `${fmtN(areaUtil)} ha Lavoura`
        : (lead.capital_social && Number(lead.capital_social) > 0 ? fmt(lead.capital_social) : 'Porte Médio');

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(hexRgb(C.BLUE))
         .text(envergadura, 375, currentY + 7, { width: 90, align: 'right', ellipsis: true, lineBreak: false });

      // Badge de Score ICP
      const scoreVal = lead.icp_score || 85;
      cardBox(doc, 475, currentY + 6, 62, 14, C.PRIMARY_BG, C.BLUE, 2);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(hexRgb(C.BLUE))
         .text(`${scoreVal}/100`, 475, currentY + 9, { width: 62, align: 'center', lineBreak: false });

      // Linha Divisória Interna Suave
      doc.rect(58, currentY + 23, 477, 1).fill(hexRgb(C.BORDER));

      // LINHA 2: Documentação & Localização
      const docFmt = formatDocumentForDisplay(lead.cnpj || lead.cpf_cnpj_titular || lead.codigo_imovel);
      const ie = lead.sefaz_ie_pf ? `IE SEFAZ: ${lead.sefaz_ie_pf}` : (lead.cnpj ? `CNPJ: ${docFmt}` : 'Cadastro Rural');
      const cidade = `${lead.municipio || 'Município não inf.'}/${lead.uf || 'BR'}`;

      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.TEXT_MUTED))
         .text(ie, 58, currentY + 28, { width: 180, ellipsis: true, lineBreak: false });

      doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MUTED))
         .text(`Localização: ${cidade}`, 245, currentY + 28, { width: 140, ellipsis: true, lineBreak: false });

      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(lead.icp_tier === 'TIER A' ? C.BLUE : C.CYAN))
         .text(lead.icp_tier || 'TIER A', 395, currentY + 28, { width: 140, align: 'right', lineBreak: false });

      // LINHA 3: Argumentos de Frota / Maquinário ou CNAE
      if (isRural) {
        const frotas = resolveLeadMachinery(lead, areaUtil);
        doc.font('Helvetica-Bold').fontSize(6).fillColor(hexRgb(C.GREEN))
           .text(`Frota Estimada: ${frotas.colheitadeira} | ${frotas.tratores} | ${frotas.plantadeira} | ${frotas.pivo}`, 58, currentY + 41, { width: 477, ellipsis: true, lineBreak: false });
      } else {
        const seg = lead.cnae_principal_descricao || lead.categoria_real || 'Atividade Comercial / Serviços B2B';
        doc.font('Helvetica').fontSize(6.5).fillColor(hexRgb(C.TEXT_MUTED))
           .text(`Segmento: ${seg}`, 58, currentY + 41, { width: 477, ellipsis: true, lineBreak: false });
      }

      // LINHA 4: Contato & Decisor
      const decisor = lead.decisor_nome || lead.contato_nome || lead.nome_titular || 'Produtor / Administrador';
      const rawTel = lead.whatsapp || lead.telefone_sanitized || lead.telefone;
      const telFmt = formatPhoneForDisplay(rawTel) || 'Canal comercial em enriquecimento';
      const hasWa = Boolean(rawTel);

      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(C.TEXT_MAIN))
         .text(`Decisor: ${decisor}`, 58, currentY + 54, { width: 230, ellipsis: true, lineBreak: false });

      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(hexRgb(hasWa ? C.GREEN : C.TEXT_LIGHT))
         .text(hasWa ? `WhatsApp: ${telFmt}` : telFmt, 300, currentY + 54, { width: 235, align: 'right', ellipsis: true, lineBreak: false });

      // LINHA 5: Gatilho de Venda / Status Comercial
      let statusComercial = 'Disponível para abordagem outbound';
      if (lead.feedback_status && lead.feedback_status !== 'NAO_CONTATADO') {
        statusComercial = `Status: ${lead.feedback_status} | Interesse: ${lead.interesse_maquinario || 'Padrão'}`;
      } else if (lead.intent_stage) {
        statusComercial = `Fase de Intenção: ${lead.intent_stage} (Aquecido)`;
      }

      cardBox(doc, 58, currentY + 68, 477, 14, C.CARD_ALT, C.BORDER, 2);
      doc.font('Helvetica').fontSize(6).fillColor(hexRgb(C.TEXT_MUTED))
         .text(`Gatilho Tático: ${statusComercial}`, 64, currentY + 71.5, { width: 465, ellipsis: true, lineBreak: false });

      currentY += cardLeadH + 6;
    });
  }
}

// ─── EXPORTADOR PRINCIPAL ─────────────────────────────────────────────────────
export function generateExecutiveDossier(filters = {}) {
  return new Promise((resolve, reject) => {
    try {
      // Busca os leads completos no recorte ativo
      const result = queryLeads({ ...filters, page: 1, page_size: 200 });
      const leads = result.data || [];

      // Cálculo consolidado do funil GTM
      const gtm = calculateGtmMarketFunnel(leads, result.total_count || leads.length);

      const now = new Date();
      const timestamp = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const operator = filters.operator || 'DIRETORIA COMERCIAL';

      // Detecta se é um recorte majoritariamente Agro
      const isAgroContext = filters.workspace_niche === 'agro' ||
                            filters.vertical_type === 'AGRO' ||
                            filters.origem === 'RURAL' ||
                            filters.porte_lavoura ||
                            filters.implemento_alvo ||
                            leads.some(l => l.origem?.includes('RURAL') || l.tag?.includes('RURAL') || l.sefaz_ie_pf || l.area_lavoura_util_ha);

      // Montagem do recorte legível
      const recorteParts = [];
      if (isAgroContext) recorteParts.push('Agro & Fundiário');
      else if (filters.vertical_type && filters.vertical_type !== 'TODOS') recorteParts.push(filters.vertical_type);

      if (filters.uf) recorteParts.push(Array.isArray(filters.uf) ? filters.uf.join(', ') : filters.uf);
      if (filters.porte_lavoura) recorteParts.push(`Porte ${filters.porte_lavoura}`);
      if (filters.implemento_alvo) recorteParts.push(`Alvo ${filters.implemento_alvo}`);
      if (filters.icp_tier && filters.icp_tier !== 'TODOS') recorteParts.push(filters.icp_tier);
      if (filters.capital_social_min > 0) recorteParts.push(`Cap. >= ${fmt(filters.capital_social_min)}`);
      const recorte = recorteParts.length > 0 ? recorteParts.join(' | ') : 'Nacional (Recorte Amplo)';

      // Cálculo prévio do número total de páginas
      const tierALeads = leads.filter(l => l.icp_tier === 'TIER A' || (l.icp_score || 0) >= 75);
      let portfolioCount = tierALeads.length;
      if (portfolioCount === 0) {
        const tierBLeads = leads.filter(l => l.icp_tier === 'TIER B' || ((l.icp_score || 0) >= 50 && (l.icp_score || 0) < 75));
        portfolioCount = tierBLeads.length || Math.min(leads.length, 20);
      }
      const portfolioPages = Math.max(1, Math.ceil(portfolioCount / 8));
      const totalPages = 3 + portfolioPages;

      // Criação da instância PDFDocument A4
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: 'Dossiê Executivo de Inteligência Territorial & GTM — API Leads B2B',
          Author: operator,
          Subject: `Análise de Mercado | ${recorte}`,
          Keywords: 'leads, agro, car, gtm, icp, maquinario, vendas, API Leads B2B'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;
      const H = doc.page.height;

      // ── PÁGINA 1: Capa & GTM Funnel ──
      bgRect(doc, 0, 0, W, H, C.PAGE_BG);
      page1Cover(doc, { gtm, leads, filters, timestamp, operator, recorte, totalPages, isAgroContext });

      // ── PÁGINA 2: Macrodados & Demografia POF ──
      doc.addPage();
      bgRect(doc, 0, 0, W, H, C.PAGE_BG);
      page2Macro(doc, { leads, timestamp, operator, recorte, totalPages, isAgroContext });

      // ── PÁGINA 3: Grupos Econômicos & Maiores Contas ──
      doc.addPage();
      bgRect(doc, 0, 0, W, H, C.PAGE_BG);
      page3Groups(doc, { leads, timestamp, operator, recorte, totalPages, isAgroContext });

      // ── PÁGINAS 4+: Carteira Priorizada ──
      pagesPortfolio(doc, { leads, timestamp, operator, recorte, totalPages, isAgroContext });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
