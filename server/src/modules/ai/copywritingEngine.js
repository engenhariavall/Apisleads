/**
 * FRENTE 3: Inteligência Artificial para Geração de Criativos & Copywriting
 * Módulo: Copywriting Contextual Automatizado
 * 
 * Gera automaticamente ângulos estratégicos de campanha, dores, ganchos (hooks),
 * textos persuasivos para anúncios (Frameworks PAS e AIDA), abordagens de WhatsApp
 * e sugestões visuais de criativos baseadas no nicho, porte, localização e perfil do lead.
 */

export function generateContextualCopies(lead, options = {}) {
  if (!lead) return null;

  const segment = detectLeadSegment(lead);
  const companyName = lead.nome_fantasia || lead.razao_social || 'sua empresa';
  const city = lead.municipio || 'sua região';
  const uf = lead.uf || 'Brasil';
  const cityState = `${city} / ${uf}`;
  const capital = parseFloat(lead.capital_social) || 0;
  const isEnterprise = capital >= 5000000;
  const decisor = (Array.isArray(lead.qsa) && lead.qsa[0]?.nome) ? lead.qsa[0].nome : null;

  const segmentData = getNicheKnowledge(segment, city, uf, companyName, decisor, isEnterprise);

  return {
    lead_id: lead.id,
    company_target: companyName,
    cnpj: lead.cnpj,
    detected_segment: segment,
    is_enterprise: isEnterprise,
    location_hook: cityState,
    strategic_angles: segmentData.strategic_angles,
    pain_points: segmentData.pain_points,
    hooks: segmentData.hooks,
    primary_texts: segmentData.primary_texts,
    whatsapp_outbound: segmentData.whatsapp_outbound,
    suggested_creatives: segmentData.suggested_creatives,
    recommended_cta: segmentData.recommended_cta,
    generated_at: new Date().toISOString()
  };
}

/**
 * Gera um pacote de copy e ângulos de campanha para um segmento / audiência inteira
 */
export function generateCampaignCopyPack(filters = {}, sampleLeads = []) {
  let segment = 'B2B_GERAL';
  if (filters.segmento) {
    segment = filters.segmento.toUpperCase();
  } else if (sampleLeads.length > 0) {
    segment = detectLeadSegment(sampleLeads[0]);
  }

  const uf = (Array.isArray(filters.estados) && filters.estados.length > 0) 
    ? filters.estados.join(', ') 
    : 'Brasil';

  const city = (Array.isArray(filters.cidades) && filters.cidades.length > 0) 
    ? filters.cidades.join(', ') 
    : (uf !== 'Brasil' ? `estado de ${uf}` : 'todo o território nacional');

  const segmentData = getNicheKnowledge(segment, city, uf, 'Empresas do Setor', null, true);

  return {
    segment,
    target_location: `${city} (${uf})`,
    sample_leads_count: sampleLeads.length,
    strategic_angles: segmentData.strategic_angles,
    pain_points: segmentData.pain_points,
    hooks: segmentData.hooks,
    primary_texts: segmentData.primary_texts,
    suggested_creatives: segmentData.suggested_creatives,
    recommended_cta: segmentData.recommended_cta,
    generated_at: new Date().toISOString()
  };
}

export function detectLeadSegment(lead) {
  const cnaeDesc = (lead.cnae_principal_descricao || '').toLowerCase();
  const cnaeCode = String(lead.cnae_principal_codigo || '');
  const segmento = (lead.segmento || '').toUpperCase();

  if (segmento.includes('AGRO') || cnaeCode.startsWith('01') || cnaeDesc.includes('agrícola') || cnaeDesc.includes('soja') || cnaeDesc.includes('bovino') || cnaeDesc.includes('cultivo') || cnaeDesc.includes('pecuária')) {
    return 'AGRO';
  }
  if (segmento.includes('SAUDE') || cnaeCode.startsWith('86') || cnaeDesc.includes('hospital') || cnaeDesc.includes('médic') || cnaeDesc.includes('saúde') || cnaeDesc.includes('clínica') || cnaeDesc.includes('odontolog')) {
    return 'SAUDE';
  }
  if (segmento.includes('CONSTRU') || cnaeCode.startsWith('41') || cnaeCode.startsWith('42') || cnaeCode.startsWith('43') || cnaeDesc.includes('construção') || cnaeDesc.includes('engenharia') || cnaeDesc.includes('incorporação')) {
    return 'CONSTRUCAO';
  }
  if (segmento.includes('TECH') || cnaeCode.startsWith('62') || cnaeCode.startsWith('63') || cnaeDesc.includes('software') || cnaeDesc.includes('tecnologia') || cnaeDesc.includes('dados') || cnaeDesc.includes('sistemas')) {
    return 'TECH';
  }
  if (segmento.includes('JURID') || cnaeCode.startsWith('69') || cnaeDesc.includes('advocacia') || cnaeDesc.includes('jurídic') || cnaeDesc.includes('contabil') || cnaeDesc.includes('auditoria')) {
    return 'JURIDICO_FINANCEIRO';
  }
  if (segmento.includes('INDUS') || cnaeCode.startsWith('2') || cnaeCode.startsWith('3') || cnaeDesc.includes('fabricação') || cnaeDesc.includes('indústria') || cnaeDesc.includes('metalúrgic') || cnaeDesc.includes('máquinas')) {
    return 'INDUSTRIA';
  }
  if (cnaeCode.startsWith('49') || cnaeCode.startsWith('52') || cnaeDesc.includes('transporte') || cnaeDesc.includes('logística') || cnaeDesc.includes('armazen')) {
    return 'LOGISTICA';
  }
  return 'B2B_GERAL';
}

function getNicheKnowledge(segment, city, uf, companyName, decisor, isEnterprise) {
  const decisorGreeting = decisor ? `Olá, ${decisor}!` : `Olá!`;

  switch (segment) {
    case 'AGRO':
      return {
        strategic_angles: [
          { angle: 'Produtividade & Rendimento por Hectare', focus: 'Como tecnologia e insumos de ponta blindam a margem antes da colheita.' },
          { angle: 'Previsibilidade Logística & Escoamento', focus: 'Redução de perdas de armazenagem e gargalos no frete das safras.' },
          { angle: 'Gestão de Custo Operacional (Maquinário)', focus: 'Manutenção preventiva e economia de combustível na frota agrícola.' }
        ],
        pain_points: [
          'Oscilação volátil de custos de fertilizantes e diesel',
          'Atrasos no escoamento que comprometem o preço do grão',
          'Falta de assistência técnica especializada presente na região'
        ],
        hooks: [
          `🌾 Produtores e cooperativas agrícolas de ${city}: a janela da safra começou.`,
          `Como grandes operações do Agro em ${uf} estão economizando até 22% em custos operacionais.`,
          `O gargalo que faz fazendas de alto padrão perderem margem no pós-colheita.`
        ],
        primary_texts: [
          {
            framework: 'PAS (Problema - Agitação - Solução)',
            title: 'Eficiência de Safra & Margem Líquida',
            text: `Gerenciar uma grande operação agrícola em ${uf} exige decisões rápidas. Um atraso de fornecimento no momento do plantio ou do escoamento custa caro na ponta da colheita.\n\nNossa tecnologia e fornecimento dedicado foram desenvolvidos sob medida para quem produz em escala. Mais previsibilidade, menos tempo de máquina parada.\n\nDescubra como estruturar a próxima safra com segurança. Fale com nosso time técnico.`
          },
          {
            framework: 'AIDA (Atenção - Interesse - Desejo - Ação)',
            title: 'Inovação no Agronegócio',
            text: `Atenção produtores rurais de ${city}:\n\nO mercado de commodities não perdoa ineficiências operacionais. É por isso que os maiores grupos agrícolas de ${uf} utilizam nossa metodologia para elevar o rendimento por hectare e manter fornecedores confiáveis.\n\nTenha acesso exclusivo à nossa tabela e condições especiais corporativas.`
          }
        ],
        whatsapp_outbound: `${decisorGreeting} Notei a liderança da ${companyName} no agronegócio em ${city}. Preparamos um comparativo de eficiência operacional e redução de custos para a safra atual que pode ser de grande valor para seus diretores. Posso enviar o resumo de 2 minutos aqui?`,
        suggested_creatives: [
          'Foto autêntica de maquinário moderno em campo no amanhecer, texto direto: "Rendimento Máximo por Hectare em ' + uf + '"',
          'Gráfico comparativo de ROI entre custos tradicionais vs nossa solução integrada.'
        ],
        recommended_cta: 'Fale com Especialista no WhatsApp'
      };

    case 'SAUDE':
      return {
        strategic_angles: [
          { angle: 'Qualidade Clínica & Conformidade Regulatória', focus: 'Atendimento hospitalar sem risco sanitário com suprimentos de padrão internacional.' },
          { angle: 'Eficiência de Escalas & Redução de Glosas', focus: 'Otimização de faturamento e agilidade no atendimento de pacientes.' },
          { angle: 'Tecnologia Médica de Alta Precisão', focus: 'Equipamentos modernos para elevar o ticket médio e a confiança da instituição.' }
        ],
        pain_points: [
          'Glosas hospitalares que corroem a margem das clínicas',
          'Ruptura de estoque de insumos críticos de emergência',
          'Exigências rigorosas de auditoria da ANVISA e órgãos reguladores'
        ],
        hooks: [
          `🏥 Gestores e diretores de saúde em ${city}:`,
          `Como instituições médicas em ${uf} reduziram em até 35% o tempo de liberação e custos com insumos.`,
          `A segurança de contar com suprimentos hospitalares de alto padrão com entrega imediata.`
        ],
        primary_texts: [
          {
            framework: 'PAS (Problema - Agitação - Solução)',
            title: 'Excelência Hospitalar sem Glosas',
            text: `Na gestão de saúde, qualquer imprevisto com fornecedores impacta diretamente o paciente e o faturamento. Clínicas de referência em ${uf} não podem depender de prazos incertos.\n\nOferecemos infraestrutura de ponta e insumos com homologação estrita para que sua equipe clínica se concentre no que mais importa: salvar vidas com máxima eficiência.\n\nAgende um diagnóstico com nossos consultores da área médica.`
          },
          {
            framework: 'AIDA (Atenção - Interesse - Desejo - Ação)',
            title: 'Padrão Ouro em Saúde',
            text: `Instituições de saúde em ${city}:\n\nEleve a reputação da sua clínica com soluções corporativas desenhadas para hospitais modernos. Reduza custos operacionais sem abrir mão da precisão técnica que seus médicos exigem.\n\nConheça nosso catálogo homologado para o setor de saúde.`
          }
        ],
        whatsapp_outbound: `${decisorGreeting} Acompanho o trabalho de referência da ${companyName} na área da saúde em ${city}. Desenvolvemos uma solução focada em redução de custos operacionais e garantia de conformidade para instituições médicas em ${uf}. Teria 5 minutos para conversar esta semana?`,
        suggested_creatives: [
          'Foto executiva de ambiente clínico clean com médico consultando tablet, badge "Homologado Padrão Ouro"',
          'Infográfico demonstrando redução do ciclo de faturamento hospitalar.'
        ],
        recommended_cta: 'Falar com Consultor Médico'
      };

    case 'TECH':
      return {
        strategic_angles: [
          { angle: 'Escala Rápida & Produtividade de Engenharia', focus: 'Redução de tempo de entrega e arquitetura resiliente.' },
          { angle: 'Segurança de Dados & Governança LGPD', focus: 'Blindagem de infraestrutura contra vazamentos e instabilidade.' },
          { angle: 'Otimização de Custos de Cloud & Infraestrutura', focus: 'Redução de gastos desnecessários com servidores e licenças.' }
        ],
        pain_points: [
          'Dificuldade de reter e contratar engenheiros sêniores',
          'Contas de nuvem e ferramentas que escalam sem controle',
          'Débito técnico que trava o lançamento de novos produtos'
        ],
        hooks: [
          `💻 CTOs e líderes de tecnologia em ${city}:`,
          `Como scale-ups e empresas de tech em ${uf} estão acelerando o roadmap sem inflar o headcount.`,
          `O segredo para cortar 30% em custos de infraestrutura de nuvem sem perder performance.`
        ],
        primary_texts: [
          {
            framework: 'PAS (Problema - Agitação - Solução)',
            title: 'Escala Tecnológica sem Débito Técnico',
            text: `Sua equipe de produto gasta mais tempo apagando incêndios do que inovando? O crescimento acelerado costuma criar gargalos de infraestrutura difíceis de reverter.\n\nDesenvolvemos tecnologia robusta que simplifica a operação da ${companyName}, garantindo alta disponibilidade e velocidade de entrega.\n\nVeja uma demonstração técnica com nossos arquitetos de software.`
          },
          {
            framework: 'AIDA (Atenção - Interesse - Desejo - Ação)',
            title: 'Modernização de Stack B2B',
            text: `Líderes de TI em ${city}:\n\nO mercado exige entregas contínuas e segurança inabalável. Conheça as melhores práticas adotadas por líderes em ${uf} para modernizar seus sistemas com retorno de investimento garantido.\n\nSolicite um benchmark de arquitetura gratuito.`
          }
        ],
        whatsapp_outbound: `${decisorGreeting} Vi a expansão da ${companyName} no setor de tecnologia. Criamos um blueprint de aceleração de entrega e redução de custos de infraestrutura que tem gerado excelentes resultados para empresas em ${city}. Posso compartilhar uma prévia?`,
        suggested_creatives: [
          'Dark mode dashboard com métricas de tempo de resposta e uptime 99.99%, typography moderna',
          'Diagrama de arquitetura limpa com selos de segurança e velocidade.'
        ],
        recommended_cta: 'Agendar Demonstração Técnica'
      };

    case 'CONSTRUCAO':
      return {
        strategic_angles: [
          { angle: 'Cumprimento de Prazos de Obras & Cronograma', focus: 'Eliminação de atrasos por falta de materiais ou fornecedores inexperientes.' },
          { angle: 'Controle de Custos de Insumos & Orçamento', focus: 'Garantia de preços estáveis para evitar estouro de orçamento no canteiro.' },
          { angle: 'Conformidade Técnica & Qualidade Estrutural', focus: 'Materiais com laudos e certificações ABNT rigorosas.' }
        ],
        pain_points: [
          'Atrasos na entrega de materiais que paralisam o canteiro',
          'Variação súbita nos preços de aço, cimento e concreto',
          'Perdas e desperdícios de matéria-prima durante a execução'
        ],
        hooks: [
          `🏗️ Construtoras e incorporadoras em ${city}:`,
          `Como grandes obras em ${uf} garantem cronograma impecável com suprimento pontual.`,
          `A estratégia para blindar o orçamento da sua próxima edificação contra variações de preço.`
        ],
        primary_texts: [
          {
            framework: 'PAS (Problema - Agitação - Solução)',
            title: 'Obras no Prazo e Custo Sob Controle',
            text: `Canteiro de obras parado é prejuízo na certa. Na construção civil de ${uf}, contar com fornecedores pontuais é a diferença entre o lucro e o estouro do orçamento.\n\nGarantimos fornecimento com logística dedicada e laudos técnicos para grandes empreendimentos em ${city}.\n\nSolicite agora uma cotação corporativa com condições exclusivas para construtoras.`
          },
          {
            framework: 'AIDA (Atenção - Interesse - Desejo - Ação)',
            title: 'Engenharia de Alto Padrão',
            text: `Incorporadores de ${city}:\n\nConstruir com qualidade e margem garantida exige parcerias estratégicas. Atendemos as maiores construtoras de ${uf} com fornecimento industrial de alta performance.\n\nFale com nossos engenheiros de aplicação.`
          }
        ],
        whatsapp_outbound: `${decisorGreeting} Acompanho as obras e o crescimento da ${companyName} em ${city}. Desenvolvemos um modelo de fornecimento programado com preços travados que tem evitado estouros de orçamento para construtoras em ${uf}. Teria 3 minutos para entender nosso modelo?`,
        suggested_creatives: [
          'Foto de obra em andamento com drone no pôr do sol, texto: "Cronograma em Dia: Fornecimento Garantido para ' + uf + '"',
          'Tabela comparativa de prazos de entrega com selo de pontualidade 100%.'
        ],
        recommended_cta: 'Solicitar Cotação para Obras'
      };

    default: // B2B_GERAL / INDUSTRIA / JURIDICO
      return {
        strategic_angles: [
          { angle: 'Eficiência Operacional & Retorno de Investimento (ROI)', focus: 'Redução de custos ocultos e aumento imediato da margem líquida.' },
          { angle: 'Crescimento Previsível & Escala Comercial', focus: 'Como gerar novos clientes corporativos qualificados com previsibilidade.' },
          { angle: 'Governança & Parcerias Estratégicas de Longo Prazo', focus: 'Segurança contratual e fornecedores de alta confiabilidade.' }
        ],
        pain_points: [
          'Dificuldade de bater metas comerciais dependendo apenas de indicações',
          'Processos manuais que sobrecarregam as lideranças da empresa',
          'Pressão por resultados em mercados cada vez mais competitivos'
        ],
        hooks: [
          `💼 Decisores da ${companyName} e líderes empresariais de ${city}:`,
          `A metodologia que empresas líderes em ${uf} utilizam para acelerar resultados comerciais.`,
          `O passo a passo para desbloquear novas frentes de faturamento no seu setor este trimestre.`
        ],
        primary_texts: [
          {
            framework: 'PAS (Problema - Agitação - Solução)',
            title: 'Aceleração Comercial com ROI Garantido',
            text: `Crescer no mercado B2B sem um motor previsível de oportunidades comerciais custa caro e gera estresse nas lideranças da empresa em ${city}.\n\nNossa metodologia entrega inteligência, dados e soluções práticas que já transformaram a performance de companhias em todo o ${uf}.\n\nConverse com nossos especialistas estratégicos e conheça nosso plano sob medida para sua operação.`
          },
          {
            framework: 'AIDA (Atenção - Interesse - Desejo - Ação)',
            title: 'Liderança de Mercado B2B',
            text: `Atenção diretores de ${city}:\n\nAs empresas que mais crescem em ${uf} não esperam o mercado reagir: elas constroem vantagens competitivas todos os dias. Descubra como elevar o padrão dos seus resultados com soluções corporativas comprovadas.\n\nSolicite uma reunião de alinhamento estratégico.`
          }
        ],
        whatsapp_outbound: `${decisorGreeting} Acompanho a atuação sólida da ${companyName} no mercado de ${city}. Desenvolvemos uma abordagem focada em retorno financeiro e eficiência para empresas do seu porte em ${uf}. Teria disponibilidade para um bate-papo rápido esta semana?`,
        suggested_creatives: [
          'Foto executiva moderna em sala de reunião com iluminação sofisticada, texto: "Previsibilidade e Resultados B2B em ' + uf + '"',
          'Card clean com gráfico ascendente e métricas de ROI destacadas.'
        ],
        recommended_cta: 'Agendar Conversa Estratégica'
      };
  }
}
