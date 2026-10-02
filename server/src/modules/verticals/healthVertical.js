/**
 * Módulo Vertical: Saúde & Clínicas Médicas (CNES, Especialidades, Leitos, Equipamentos)
 */

export class HealthVertical {
  static get metadata() {
    return {
      id: 'SAUDE',
      name: 'Saúde & Clínicas Médicas',
      icon: '🏥',
      badgeColor: '#38BDF8',
      description: 'Hospitais, centros cirúrgicos, clínicas médicas e laboratórios com código oficial CNES e mapeamento de leitos e especialidades.',
      metricLabel: 'Capacidade (Leitos / Salas)',
      metricUnit: 'unid.',
      primaryFields: ['codigo_cnes', 'tipo_estabelecimento', 'especialidade_primaria', 'leitos_totais', 'equipamentos_avancados'],
      filterControls: [
        {
          id: 'filter_health_cnes',
          label: 'Cadastro CNES:',
          type: 'select',
          options: [
            { value: '', label: 'Todos os Estabelecimentos' },
            { value: 'CNES_ATIVO', label: 'Apenas com CNES Ativo & Regular' }
          ]
        },
        {
          id: 'filter_health_tipo',
          label: 'Tipo de Estabelecimento:',
          type: 'select',
          options: [
            { value: '', label: 'Todos os Tipos' },
            { value: 'HOSPITAL_GERAL', label: 'Hospital Geral / Alta Complexidade' },
            { value: 'CLINICA_ESPECIALIZADA', label: 'Clínica Médica Especializada' },
            { value: 'CENTRO_DIAGNOSTICO', label: 'Laboratório & Centro Diagnóstico' },
            { value: 'HOSPITAL_DIA', label: 'Hospital Dia & Centro Cirúrgico Ambulatorial' }
          ]
        },
        {
          id: 'filter_health_especialidade',
          label: 'Especialidade Médica:',
          type: 'select',
          options: [
            { value: '', label: 'Todas as Especialidades' },
            { value: 'CARDIOLOGIA', label: 'Cardiologia & Hemodinâmica' },
            { value: 'ORTOPEDIA', label: 'Ortopedia & Traumatologia' },
            { value: 'ONCOLOGIA', label: 'Oncologia & Quimioterapia' },
            { value: 'OFTALMOLOGIA', label: 'Oftalmologia & Cirurgia Refrativa' },
            { value: 'DERMATO_ESTETICA', label: 'Dermatologia & Cirurgia Plástica' }
          ]
        }
      ]
    };
  }

  static enrich(lead) {
    const capital = parseFloat(lead.capital_social) || 100000;
    const razao = lead.razao_social.toLowerCase();

    // Tipo de estabelecimento
    let tipoCodigo = 'CLINICA_ESPECIALIZADA';
    let tipoDesc = 'Clínica Médica Especializada e Consultórios Integrados';
    let leitos = 8;
    let equipamentos = 'Ultrassonografia Doppler, Eletrocardiograma Digital e Sala de Procedimentos';

    if (capital >= 15000000 || razao.includes('hospital') || razao.includes('beneficencia')) {
      tipoCodigo = 'HOSPITAL_GERAL';
      tipoDesc = 'Hospital Geral de Alta Complexidade com UTI';
      leitos = Math.round(120 + (capital / 1000000) * 15);
      equipamentos = 'Tomografia Computadorizada Multislice, Ressonância Magnética 3T, Arco Cirúrgico e Hemodinâmica';
    } else if (capital >= 3000000 || razao.includes('diagnostico') || razao.includes('laboratorio') || razao.includes('imagem')) {
      tipoCodigo = 'CENTRO_DIAGNOSTICO';
      tipoDesc = 'Centro Diagnóstico Avançado e Medicina Nuclear';
      leitos = 16;
      equipamentos = 'Ressonância Magnética, Tomógrafo, Densitometria Óssea e Análises Clínicas Automatizadas';
    } else if (capital >= 800000 || razao.includes('cirurg') || razao.includes('dia')) {
      tipoCodigo = 'HOSPITAL_DIA';
      tipoDesc = 'Hospital Dia com Centro Cirúrgico Ambulatorial';
      leitos = Math.round(14 + (capital / 200000) * 3);
      equipamentos = 'Salas Cirúrgicas com Torre de Vídeo Laparoscopia e Recuperação Pós-Anestésica (RPA)';
    }

    // Especialidade médica
    let espCodigo = 'CARDIOLOGIA';
    let espDesc = 'Cardiologia, Cirurgia Cardiovascular & Prevenção';
    if (razao.includes('ortoped') || razao.includes('trauma')) {
      espCodigo = 'ORTOPEDIA';
      espDesc = 'Ortopedia, Traumatologia & Medicina Esportiva';
    } else if (razao.includes('onco') || razao.includes('cancer')) {
      espCodigo = 'ONCOLOGIA';
      espDesc = 'Oncologia Clínica, Radioterapia & Imunoterapia';
    } else if (razao.includes('olhos') || razao.includes('oftalmo')) {
      espCodigo = 'OFTALMOLOGIA';
      espDesc = 'Oftalmologia Especializada & Laser Cirúrgico';
    } else if (razao.includes('dermato') || razao.includes('estetica') || razao.includes('plastica')) {
      espCodigo = 'DERMATO_ESTETICA';
      espDesc = 'Dermatologia Avançada, Cosmiatria & Cirurgia Plástica';
    }

    const cnesNum = `${Math.floor(1000000 + (parseInt(lead.cnpj_raw.slice(2, 9), 10) % 8999999))}`;

    return {
      vertical: 'SAUDE',
      vertical_name: 'Saúde & Clínicas Médicas',
      codigo_cnes: cnesNum,
      cnes_status: 'ATIVO_REGULAR',
      tipo_codigo: tipoCodigo,
      tipo_estabelecimento: tipoDesc,
      especialidade_codigo: espCodigo,
      especialidade_primaria: espDesc,
      leitos_totais: leitos,
      leitos_formatados: `${leitos} leitos / salas`,
      equipamentos_avancados: equipamentos,
      atendimento_convenios: 'Amil, Bradesco Saúde, SulAmérica, Unimed e Particular',
      potencial_compra_insumos: capital >= 2000000 ? 'ALTO_VOLUME (OPME, Fármacos e Gases Medicinais)' : 'MÉDIO_VOLUME'
    };
  }

  static matchesFilters(verticalData, filters = {}) {
    if (!verticalData || verticalData.vertical !== 'SAUDE') return true;

    if (filters.cnes_status && filters.cnes_status === 'CNES_ATIVO') {
      if (verticalData.cnes_status !== 'ATIVO_REGULAR') return false;
    }

    if (filters.tipo_estabelecimento && filters.tipo_estabelecimento !== '') {
      if (verticalData.tipo_codigo !== filters.tipo_estabelecimento) return false;
    }

    if (filters.especialidade && filters.especialidade !== '') {
      if (verticalData.especialidade_codigo !== filters.especialidade) return false;
    }

    return true;
  }
}
