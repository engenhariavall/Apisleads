/**
 * Data Fusion Engine: Motor de Fusão e Enriquecimento Cruzado Multissetorial
 * Une base cadastral padrão (Receita/QSA) com variáveis setoriais (INCRA/OAB/CNES/CREA)
 */

import { AgroVertical } from './agroVertical.js';
import { LegalVertical } from './legalVertical.js';
import { HealthVertical } from './healthVertical.js';
import { ConstructionVertical } from './constructionVertical.js';

export class DataFusionEngine {
  /**
   * Detecta automaticamente a vertical mais apropriada para a empresa
   */
  static detectVertical(lead, segmentCnaeMap = {}) {
    const rawCnae = String(lead.cnae_principal_codigo || '');
    const cleanCnae = rawCnae.replace(/[^\d]/g, '');
    const cnaeDesc = (lead.cnae_principal_descricao || '').toLowerCase();
    const razao = (lead.razao_social || '').toLowerCase();
    const nome = (lead.nome_fantasia || '').toLowerCase();
    const combinedText = `${razao} ${nome} ${cnaeDesc}`;

    // 0. Consulta no mapa prévio de segment_cnaes
    if (segmentCnaeMap[rawCnae]) {
      const segId = segmentCnaeMap[rawCnae];
      if (segId === 'seg_agro') return 'AGRO';
      if (segId === 'seg_juridico') return 'JURIDICO';
      if (segId === 'seg_saude') return 'SAUDE';
      if (segId === 'seg_construcao') return 'CONSTRUCAO';
    }

    // 1. Agronegócio & Pecuária (Divisões 01, 02, 03 ou termos agro)
    if (
      cleanCnae.startsWith('01') || cleanCnae.startsWith('02') || cleanCnae.startsWith('03') ||
      cleanCnae.startsWith('283') || cleanCnae.startsWith('4683') || cleanCnae.startsWith('3314') ||
      combinedText.includes('agro') || combinedText.includes('fazenda') || combinedText.includes('agricol') ||
      combinedText.includes('graos') || combinedText.includes('pecuaria') || combinedText.includes('soja') ||
      combinedText.includes('semente') || combinedText.includes('cooperativa') || combinedText.includes('milho') ||
      combinedText.includes('lavoura') || combinedText.includes('gado') || combinedText.includes('bovino')
    ) {
      return 'AGRO';
    }

    // 2. Jurídico & Advocacia (Divisão 69 ou termos jurídicos/contábeis)
    if (
      cleanCnae.startsWith('69') ||
      combinedText.includes('advoga') || combinedText.includes('juridic') || combinedText.includes('sociedade de advogados') ||
      combinedText.includes('contabil') || combinedText.includes('contabilidade') || combinedText.includes('tributar') ||
      combinedText.includes('pericia') || combinedText.includes('consultoria tribut')
    ) {
      return 'JURIDICO';
    }

    // 3. Saúde & Clínicas Médicas (Divisão 86 ou termos de saúde)
    if (
      cleanCnae.startsWith('86') ||
      combinedText.includes('hospital') || combinedText.includes('clinica') || combinedText.includes('saude') ||
      combinedText.includes('medico') || combinedText.includes('medica') || combinedText.includes('laboratorio') ||
      combinedText.includes('diagnostico') || combinedText.includes('oftalmo') || combinedText.includes('odontolog') ||
      combinedText.includes('terapia') || combinedText.includes('medicina') || combinedText.includes('vacina')
    ) {
      return 'SAUDE';
    }

    // 4. Construção Civil & Engenharia (Divisões 41, 42, 43 ou termos de engenharia)
    if (
      cleanCnae.startsWith('41') || cleanCnae.startsWith('42') || cleanCnae.startsWith('43') || cleanCnae.startsWith('71') ||
      combinedText.includes('construtora') || combinedText.includes('engenharia') || combinedText.includes('edificac') ||
      combinedText.includes('incorporadora') || combinedText.includes('paviment') || combinedText.includes('obras') ||
      combinedText.includes('terraplen') || combinedText.includes('concreto')
    ) {
      return 'CONSTRUCAO';
    }

    return 'GERAL';
  }

  /**
   * Executa a fusão de dados cadastrais com dados verticais específicos
   */
  static fuseLead(lead, forceVertical = null, segmentCnaeMap = {}) {
    let vertical = forceVertical;
    if (!vertical) {
      if (lead.vertical_type && lead.vertical_type !== 'GERAL' && ['AGRO', 'JURIDICO', 'SAUDE', 'CONSTRUCAO'].includes(lead.vertical_type)) {
        vertical = lead.vertical_type;
      } else {
        vertical = this.detectVertical(lead, segmentCnaeMap);
      }
    }
    let verticalData = null;
    let sectorScore = 75;
    let metaTag = 'B2B_QUALIFICADO';
    let summaryMetric = '';

    switch (vertical) {
      case 'AGRO': {
        verticalData = AgroVertical.enrich(lead);
        // Score setorial ponderado: Hectares (40 pts) + Capital (30 pts) + CAR Validado (20 pts) + Buyer ICP (10 pts)
        const haScore = Math.min(40, (verticalData.hectares_total / 10000) * 40);
        const capScore = Math.min(30, (parseFloat(lead.capital_social || 0) / 5000000) * 30);
        sectorScore = Math.round(haScore + capScore + 20 + (lead.target_type === 'BUYER' ? 10 : 0));
        metaTag = verticalData.hectares_total >= 5000 ? 'AGRO_MEGA_PRODUTOR_5K_HA' : 'AGRO_PRODUTOR_QUALIFICADO';
        summaryMetric = `${verticalData.hectares_formatados} (${verticalData.cultura_codigo})`;
        break;
      }
      case 'JURIDICO': {
        verticalData = LegalVertical.enrich(lead);
        // Score: Processos (45 pts) + Capital (35 pts) + Tribunais Superiores (20 pts)
        const procScore = Math.min(45, (verticalData.processos_ativos / 500) * 45);
        const capScore = Math.min(35, (parseFloat(lead.capital_social || 0) / 2000000) * 35);
        sectorScore = Math.round(procScore + capScore + 20);
        metaTag = verticalData.processos_ativos >= 400 ? 'LEGAL_BANCA_ALTO_VOLUME' : 'LEGAL_ESCRITORIO_BOUTIQUE';
        summaryMetric = `${verticalData.processos_formatados} (${verticalData.oab_seccional})`;
        break;
      }
      case 'SAUDE': {
        verticalData = HealthVertical.enrich(lead);
        // Score: Leitos/Capacidade (40 pts) + CNES Regular (25 pts) + Capital (35 pts)
        const leitosScore = Math.min(40, (verticalData.leitos_totais / 80) * 40);
        const capScore = Math.min(35, (parseFloat(lead.capital_social || 0) / 5000000) * 35);
        sectorScore = Math.round(leitosScore + capScore + 25);
        metaTag = verticalData.leitos_totais >= 30 ? 'HEALTH_ALTA_COMPLEXIDADE_HOSPITAL' : 'HEALTH_CLINICA_ESPECIALIZADA';
        summaryMetric = `${verticalData.leitos_formatados} • CNES: ${verticalData.codigo_cnes}`;
        break;
      }
      case 'CONSTRUCAO': {
        verticalData = ConstructionVertical.enrich(lead);
        // Score: Obras Ativas (40 pts) + Área m2 (35 pts) + CREA Ativo (25 pts)
        const obrasScore = Math.min(40, (verticalData.obras_ativas / 10) * 40);
        const areaScore = Math.min(35, (verticalData.area_construida_m2 / 50000) * 35);
        sectorScore = Math.round(obrasScore + areaScore + 25);
        metaTag = verticalData.obras_ativas >= 5 ? 'CONST_MULTI_OBRAS_INCORPORADORA' : 'CONST_ENGENHARIA_ESPECIALIZADA';
        summaryMetric = `${verticalData.obras_formatadas} (${verticalData.area_formatada})`;
        break;
      }
      default: {
        verticalData = {
          vertical: 'GERAL',
          vertical_name: 'B2B Corporativo Geral',
          porte_mercado: lead.porte || 'DEMAIS',
          capital_formatado: `R$ ${(parseFloat(lead.capital_social || 0)).toLocaleString('pt-BR')}`
        };
        sectorScore = 70;
        metaTag = 'B2B_CORPORATIVO_GERAL';
        summaryMetric = verticalData.capital_formatado;
        break;
      }
    }

    return {
      ...lead,
      vertical_type: vertical,
      vertical_data: verticalData,
      sector_score: Math.min(100, Math.max(30, sectorScore)),
      meta_ads_segment_tag: metaTag,
      vertical_summary_metric: summaryMetric
    };
  }

  /**
   * Executa a fusão em lote para toda a base no banco SQLite
   */
  static fuseAllLeads(db) {
    // Carrega mapa de CNAEs para segmentos conhecidos
    const segmentCnaeRows = db.prepare('SELECT segment_id, cnae_code FROM segment_cnaes').all();
    const segmentCnaeMap = {};
    segmentCnaeRows.forEach(r => {
      segmentCnaeMap[r.cnae_code] = r.segment_id;
    });

    const rawLeads = db.prepare('SELECT * FROM leads').all();
    const updateStmt = db.prepare(`
      UPDATE leads 
      SET vertical_type = ?, vertical_data = ? 
      WHERE id = ?
    `);

    let updatedCount = 0;
    const stats = { AGRO: 0, JURIDICO: 0, SAUDE: 0, CONSTRUCAO: 0, GERAL: 0 };

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const lead of rawLeads) {
        const fused = this.fuseLead(lead, null, segmentCnaeMap);
        updateStmt.run(fused.vertical_type, JSON.stringify(fused.vertical_data), lead.id);
        stats[fused.vertical_type] = (stats[fused.vertical_type] || 0) + 1;
        updatedCount++;
      }
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }

    return {
      success: true,
      total_processed: updatedCount,
      stats
    };
  }
}
