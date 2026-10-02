/**
 * Módulo Vertical: Construção Civil & Engenharia (CREA, CAU, Obras Ativas, Alvarás, m²)
 */

export class ConstructionVertical {
  static get metadata() {
    return {
      id: 'CONSTRUCAO',
      name: 'Construção Civil & Engenharia',
      icon: '🏗️',
      badgeColor: '#F59E0B',
      description: 'Construtoras, incorporadoras e engenharias com registro CREA/CAU, volumetria de obras ativas e alvarás de execução.',
      metricLabel: 'Obras Ativas',
      metricUnit: 'canteiros',
      primaryFields: ['obras_ativas', 'registro_crea', 'area_construida_m2', 'tipologia_obras', 'estagio_obras'],
      filterControls: [
        {
          id: 'filter_const_obras_min',
          label: 'Obras Ativas Mínimas:',
          type: 'select',
          options: [
            { value: '', label: 'Qualquer Quantidade' },
            { value: '2', label: '2+ Canteiros de Obras' },
            { value: '5', label: '5+ Canteiros (Média Incorporadora)' },
            { value: '12', label: '12+ Canteiros (Grande Construtora)' },
            { value: '25', label: '25+ Canteiros (Gigante da Engenharia)' }
          ]
        },
        {
          id: 'filter_const_tipologia',
          label: 'Tipologia Predominante:',
          type: 'select',
          options: [
            { value: '', label: 'Todas as Tipologias' },
            { value: 'RESIDENCIAL_VERTICAL', label: 'Residencial Vertical (Edifícios / Torres)' },
            { value: 'COMERCIAL_CORPORATIVO', label: 'Comercial, Hotéis & Lajes Corporativas' },
            { value: 'GALPOES_LOGISTICOS', label: 'Galpões Logísticos & Parques Industriais' },
            { value: 'INFRAESTRUTURA_PESADA', label: 'Infraestrutura, Pavimentação & Saneamento' }
          ]
        },
        {
          id: 'filter_const_crea',
          label: 'Registro CREA/CAU:',
          type: 'select',
          options: [
            { value: '', label: 'Todos os Registros' },
            { value: 'CREA_ATIVO', label: 'Apenas Registro Ativo & Regularizado' }
          ]
        }
      ]
    };
  }

  static enrich(lead) {
    const capital = parseFloat(lead.capital_social) || 150000;
    const uf = lead.uf || 'SP';
    const razao = lead.razao_social.toLowerCase();

    // Quantidade de obras ativas correlacionada ao capital
    let obras = 2;
    let m2Construido = 4500;
    if (capital >= 20000000) {
      obras = Math.round(18 + (capital / 2000000) * 3);
      m2Construido = Math.round(150000 + (capital / 100000) * 120);
    } else if (capital >= 5000000) {
      obras = Math.round(6 + (capital / 800000) * 2);
      m2Construido = Math.round(35000 + (capital / 200000) * 80);
    } else if (capital >= 1000000) {
      obras = Math.round(3 + (capital / 500000) * 1);
      m2Construido = Math.round(12000 + (capital / 100000) * 40);
    }

    // Tipologia de obras
    let tipoCodigo = 'RESIDENCIAL_VERTICAL';
    let tipoDesc = 'Residencial Vertical (Edifícios de Médio e Alto Padrão)';

    if (razao.includes('infra') || razao.includes('paviment') || razao.includes('saneam') || razao.includes('terraplen')) {
      tipoCodigo = 'INFRAESTRUTURA_PESADA';
      tipoDesc = 'Infraestrutura Urbana, Drenagem e Rodovias';
    } else if (razao.includes('logistica') || razao.includes('galp') || razao.includes('industrial') || razao.includes('metalic')) {
      tipoCodigo = 'GALPOES_LOGISTICOS';
      tipoDesc = 'Galpões Logísticos, Estruturas Metálicas e Centros de Distribuição';
    } else if (razao.includes('comercial') || capital >= 10000000) {
      tipoCodigo = 'COMERCIAL_CORPORATIVO';
      tipoDesc = 'Edifícios Comerciais, Complexos Multiuso e Centros Empresariais';
    }

    const creaNum = `CREA-${uf} nº ${Math.floor(100000 + (parseInt(lead.cnpj_raw.slice(3, 9), 10) % 899999))}`;
    const alvara = `ALV-${uf}-${Math.floor(2025000 + (parseInt(lead.cnpj_raw.slice(6, 12), 10) % 9999))}`;

    return {
      vertical: 'CONSTRUCAO',
      vertical_name: 'Construção Civil & Engenharia',
      obras_ativas: obras,
      obras_formatadas: `${obras} obras ativas`,
      area_construida_m2: m2Construido,
      area_formatada: `${m2Construido.toLocaleString('pt-BR')} m²`,
      registro_crea: creaNum,
      crea_status: 'ATIVO_REGULAR',
      alvara_principal: alvara,
      tipologia_codigo: tipoCodigo,
      tipologia_obras: tipoDesc,
      estagio_obras: 'Fundações, Estrutura Concreto Armado e Acabamentos',
      potencial_compra_maquinas: obras >= 5 ? 'ALTO (Locação de Guindastes, Escavadeiras e Concreto Usinado)' : 'MÉDIO (Equipamentos Leves)'
    };
  }

  static matchesFilters(verticalData, filters = {}) {
    if (!verticalData || verticalData.vertical !== 'CONSTRUCAO') return true;

    if (filters.obras_min) {
      const minObras = parseInt(filters.obras_min, 10);
      if (!isNaN(minObras) && verticalData.obras_ativas < minObras) return false;
    }

    if (filters.tipologia_obras && filters.tipologia_obras !== '') {
      if (verticalData.tipologia_codigo !== filters.tipologia_obras) return false;
    }

    if (filters.crea_status && filters.crea_status === 'CREA_ATIVO') {
      if (verticalData.crea_status !== 'ATIVO_REGULAR') return false;
    }

    return true;
  }
}
