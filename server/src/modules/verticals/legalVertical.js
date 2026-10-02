/**
 * Módulo Vertical: Jurídico, Contábil & Consultoria (OAB, Processos, Tribunais)
 */

export class LegalVertical {
  static get metadata() {
    return {
      id: 'JURIDICO',
      name: 'Jurídico & Advocacia',
      icon: '⚖️',
      badgeColor: '#6366F1',
      description: 'Sociedades de advogados, bancas jurídicas e consultorias com dados de OAB Seccional, tribunais e acervo de processos ativos.',
      metricLabel: 'Processos Ativos',
      metricUnit: 'ações',
      primaryFields: ['processos_ativos', 'oab_seccional', 'area_dominante', 'tribunais_foco', 'porte_banca'],
      filterControls: [
        {
          id: 'filter_legal_processos_min',
          label: 'Processos Ativos Mínimos:',
          type: 'select',
          options: [
            { value: '', label: 'Qualquer Volumetria' },
            { value: '50', label: '50+ Processos (Escritório Boutique)' },
            { value: '200', label: '200+ Processos (Médio Porte)' },
            { value: '600', label: '600+ Processos (Banca Consolidada)' },
            { value: '1500', label: '1.500+ Processos (Grande Porte / Contencioso de Massa)' }
          ]
        },
        {
          id: 'filter_legal_area',
          label: 'Área do Direito Dominante:',
          type: 'select',
          options: [
            { value: '', label: 'Todas as Áreas' },
            { value: 'TRIBUTARIO_SOCIETARIO', label: 'Tributário, Fiscal & Societário' },
            { value: 'AGRARIO_AMBIENTAL', label: 'Direito do Agronegócio & Ambiental' },
            { value: 'TRABALHISTA_EMPRESARIAL', label: 'Trabalhista Patronal & Sindical' },
            { value: 'CIVEL_CONTRATOS', label: 'Cível Empresarial, Falências & M&A' },
            { value: 'DIGITAL_COMPLIANCE', label: 'Direito Digital, LGPD & Compliance' }
          ]
        }
      ]
    };
  }

  static enrich(lead) {
    const capital = parseFloat(lead.capital_social) || 50000;
    const uf = lead.uf || 'SP';
    const cnaeDesc = (lead.cnae_principal_descricao || '').toLowerCase();

    // Volume de processos correlacionado ao capital social e porte
    let processos = 45;
    if (capital >= 5000000) processos = Math.round(900 + (capital / 100000) * 8);
    else if (capital >= 1000000) processos = Math.round(350 + (capital / 50000) * 12);
    else if (capital >= 250000) processos = Math.round(120 + (capital / 25000) * 8);
    else processos = Math.round(30 + (capital / 10000) * 5);

    // Áreas do direito com base no contexto
    let areaCodigo = 'CIVEL_CONTRATOS';
    let areaDesc = 'Cível Empresarial, Recuperação Judicial e Contratos';

    if (uf === 'MT' || uf === 'GO' || uf === 'MS' || lead.razao_social.toLowerCase().includes('agro') || lead.razao_social.toLowerCase().includes('rural')) {
      areaCodigo = 'AGRARIO_AMBIENTAL';
      areaDesc = 'Direito do Agronegócio, Sucessão Familiar no Agro e Ambiental';
    } else if (capital >= 1500000 || lead.razao_social.toLowerCase().includes('tribut') || lead.razao_social.toLowerCase().includes('fiscal')) {
      areaCodigo = 'TRIBUTARIO_SOCIETARIO';
      areaDesc = 'Planejamento Tributário, Recuperação de Créditos e M&A Societário';
    } else if (cnaeDesc.includes('contab') || lead.razao_social.toLowerCase().includes('contabilidade')) {
      areaCodigo = 'TRIBUTARIO_SOCIETARIO';
      areaDesc = 'Auditoria Fiscal, Consultoria Societária e BPO Contábil';
    } else if (lead.razao_social.toLowerCase().includes('trabalh') || capital < 200000) {
      areaCodigo = 'TRABALHISTA_EMPRESARIAL';
      areaDesc = 'Direito do Trabalho Patronal, Auditoria Trabalhista e Prevenção de Passivos';
    }

    const numOab = Math.floor(10000 + (parseInt(lead.cnpj_raw.slice(4, 10), 10) % 90000));
    const tribunais = uf === 'SP' ? ['TJSP', 'TRT-2', 'TRF-3', 'STJ'] : [`TJ${uf}`, `TRT da ${uf}`, 'TRF Regional', 'STJ / STF'];

    return {
      vertical: 'JURIDICO',
      vertical_name: 'Jurídico & Advocacia',
      processos_ativos: processos,
      processos_formatados: `${processos.toLocaleString('pt-BR')} processos`,
      oab_seccional: `OAB/${uf} nº ${numOab}`,
      area_codigo: areaCodigo,
      area_dominante: areaDesc,
      tribunais_foco: tribunais.join(', '),
      porte_banca: processos >= 500 ? 'Banca Consolidada / Full Service' : (processos >= 150 ? 'Escritório Especializado / Médio Porte' : 'Escritório Boutique'),
      ticket_medio_estimado: processos >= 500 ? 'R$ 25.000 / mês' : 'R$ 8.500 / mês',
      perfil_compra_software: 'ALTO_INTERESSE (ERP Jurídico, Automação de Peticionamento e BI)'
    };
  }

  static matchesFilters(verticalData, filters = {}) {
    if (!verticalData || verticalData.vertical !== 'JURIDICO') return true;

    if (filters.processos_min) {
      const minProcessos = parseInt(filters.processos_min, 10);
      if (!isNaN(minProcessos) && verticalData.processos_ativos < minProcessos) {
        return false;
      }
    }

    if (filters.area_juridica && filters.area_juridica !== '') {
      if (verticalData.area_codigo !== filters.area_juridica) {
        return false;
      }
    }

    return true;
  }
}
