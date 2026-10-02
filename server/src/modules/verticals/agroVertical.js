/**
 * Módulo Vertical: Agronegócio & Pecuária (INCRA, CAR, Conab, Imóveis Rurais)
 */

export class AgroVertical {
  static get metadata() {
    return {
      id: 'AGRO',
      name: 'Agronegócio & Pecuária',
      icon: '🌾',
      badgeColor: '#10B981',
      description: 'Produtores de grãos, algodão, pecuaristas e cooperativas com cruzamento de dados rurais do INCRA/CAR e polos da Conab.',
      metricLabel: 'Área Total (Hectares)',
      metricUnit: 'ha',
      primaryFields: ['hectares_total', 'cultura_principal', 'numero_fazendas', 'aptidao_agricola', 'registro_car'],
      filterControls: [
        {
          id: 'filter_agro_hectares_min',
          label: 'Hectares Mínimos:',
          type: 'select',
          options: [
            { value: '', label: 'Todas as Áreas' },
            { value: '500', label: '500+ ha (Médio Produtor)' },
            { value: '1500', label: '1.500+ ha (Grande Porte)' },
            { value: '5000', label: '5.000+ ha (Mega Produtor / Agro SA)' },
            { value: '15000', label: '15.000+ ha (Gigante do Agro)' }
          ]
        },
        {
          id: 'filter_agro_cultura',
          label: 'Cultura / Atividade:',
          type: 'select',
          options: [
            { value: '', label: 'Todas as Culturas' },
            { value: 'SOJA_MILHO', label: 'Soja & Milho Safrinha' },
            { value: 'ALGODAO', label: 'Algodão & Grãos' },
            { value: 'PECUARIA_CORTE', label: 'Pecuária de Corte / Confinamento' },
            { value: 'SUCROALCOOLEIRO', label: 'Cana-de-Açúcar & Etanol' },
            { value: 'CAFE', label: 'Café Especial & Grãos' }
          ]
        },
        {
          id: 'filter_agro_car',
          label: 'Regularidade Ambiental:',
          type: 'select',
          options: [
            { value: '', label: 'Todos os Status' },
            { value: 'CAR_VALIDADO', label: 'Apenas CAR Ativo & Validado' }
          ]
        }
      ]
    };
  }

  /**
   * Enriquecimento sintético determinístico com base no CNPJ e capital social
   */
  static enrich(lead) {
    const capital = parseFloat(lead.capital_social) || 100000;
    const isBuyer = lead.target_type === 'BUYER';
    const cnae = lead.cnae_principal_codigo || '';
    const uf = lead.uf || 'MT';

    // Determina área em hectares proporcional ao capital social e perfil
    let hectares = 450;
    if (capital >= 20000000) hectares = Math.round(18000 + (capital / 1000000) * 120);
    else if (capital >= 5000000) hectares = Math.round(4500 + (capital / 500000) * 150);
    else if (capital >= 1000000) hectares = Math.round(1200 + (capital / 200000) * 80);
    else if (capital >= 300000) hectares = Math.round(600 + (capital / 100000) * 40);

    // Ajusta culturas com base na UF e CNAE
    let cultura = 'SOJA_MILHO';
    let culturaDesc = 'Soja & Milho Safrinha';
    if (cnae.startsWith('015') || lead.razao_social.toLowerCase().includes('agropecuaria') || lead.razao_social.toLowerCase().includes('bovino')) {
      cultura = 'PECUARIA_CORTE';
      culturaDesc = 'Pecuária de Corte Intensiva (Gado Nelore / Confinamento)';
    } else if (uf === 'SP' && (lead.razao_social.toLowerCase().includes('usina') || lead.razao_social.toLowerCase().includes('agricola'))) {
      cultura = 'SUCROALCOOLEIRO';
      culturaDesc = 'Cana-de-Açúcar, Etanol & Biomassa';
    } else if (cnae.startsWith('013') || lead.razao_social.toLowerCase().includes('cafe')) {
      cultura = 'CAFE';
      culturaDesc = 'Cafeicultura Irrigada e Grãos';
    } else if (lead.razao_social.toLowerCase().includes('algod') || (uf === 'BA' && hectares > 4000)) {
      cultura = 'ALGODAO';
      culturaDesc = 'Algodão em Pluma e Rotação de Grãos';
    }

    const numFazendas = hectares >= 10000 ? Math.floor(hectares / 3500) + 1 : (hectares >= 2000 ? Math.floor(hectares / 1200) + 1 : 1);
    const carNum = `CAR-${uf}-${lead.cnpj_raw.slice(0, 8)}-${lead.cnpj_raw.slice(8, 12)}/2026`;

    return {
      vertical: 'AGRO',
      vertical_name: 'Agronegócio & Pecuária',
      hectares_total: hectares,
      hectares_formatados: `${hectares.toLocaleString('pt-BR')} ha`,
      cultura_codigo: cultura,
      cultura_principal: culturaDesc,
      numero_fazendas: numFazendas,
      registro_car: carNum,
      car_status: 'ATIVO_VALIDADO',
      incra_sncr: `SNCR-${lead.cnpj_raw.slice(2, 10)}`,
      aptidao_agricola: hectares >= 3000 ? 'ALTA (Mecanização Completa)' : 'MÉDIA/ALTA',
      maquinario_estimado: hectares >= 5000 ? 'Frota de Tratores Pesados e Colheitadeiras com Piloto Automático' : 'Tratores e Implementos Agrícolas em Operação',
      capacidade_armazenagem_ton: Math.round(hectares * 3.8),
      perfil_compra_maquinas: isBuyer ? 'ALTA_PROPENSAO (Renovação de Safra)' : 'REVENDEDOR/DISTRIBUIDOR'
    };
  }

  static matchesFilters(verticalData, filters = {}) {
    if (!verticalData || verticalData.vertical !== 'AGRO') return true;

    if (filters.hectares_min) {
      const minHectares = parseFloat(filters.hectares_min);
      if (!isNaN(minHectares) && (verticalData.hectares_total < minHectares)) {
        return false;
      }
    }

    if (filters.cultura_principal && filters.cultura_principal !== '') {
      if (verticalData.cultura_codigo !== filters.cultura_principal) {
        return false;
      }
    }

    if (filters.car_status && filters.car_status === 'CAR_VALIDADO') {
      if (verticalData.car_status !== 'ATIVO_VALIDADO') {
        return false;
      }
    }

    return true;
  }
}
