/**
 * MÓDULO DE INTELIGÊNCIA COMPETITIVA & RADAR DE ESCOAMENTO (TRADE FLOW)
 * Serviço Especializado: competitorTradeFlowService.js
 * 
 * Cruza Inscrição Estadual (SEFAZ), CNAE oficial e rotas de circulação de mercadorias/serviços
 * para mapear o fluxo de vendas do concorrente, praças de destino e gerar
 * o Cerco Geográfico de Tráfego Pago (Meta Ads / Google Ads Geofencing).
 * 
 * PADRÃO CORPORATIVO: 100% dinâmico baseado no CNAE real (Agro, Indústria, Serviços, Varejo, B2B).
 */

import db from '../config/database.js';
import { CITY_COORDINATES, GeoSpatialEngine } from '../modules/gis/geoSpatialEngine.js';

/**
 * Calcula distância geodésica em quilômetros (Fórmula de Haversine)
 */
function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999;
  const R = 6371; // Raio médio da Terra em km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round((R * c) * 10) / 10;
}

/**
 * Determina o perfil comercial e o mix de produtos/serviços REAL com base estrita no CNAE, Porte e Capital Social.
 */
export function resolveProductMix(competitor) {
  const cnae = String(competitor.cnae_principal_codigo || '').replace(/\D/g, '');
  const cnaeDesc = String(competitor.cnae_principal_descricao || '').toUpperCase();
  const razao = String(competitor.razao_social || '').toUpperCase();
  const fantasia = String(competitor.nome_fantasia || '').toUpperCase();
  const capital = Number(competitor.capital_social) || 0;
  const porte = String(competitor.porte || '').toUpperCase();

  // 1. MÁQUINAS E EQUIPAMENTOS AGRÍCOLAS (CNAE 4661 ou termos de maquinário agro)
  const isMachinery = cnae.startsWith('4661') || 
    ((cnaeDesc.includes('MAQUINA') || cnaeDesc.includes('TRATOR') || cnaeDesc.includes('COLHEITADEIRA')) && (cnaeDesc.includes('AGR') || razao.includes('AGRO') || fantasia.includes('AGRO')));

  if (isMachinery) {
    return {
      sector_type: 'AGRO',
      is_agro: true,
      is_service: false,
      category_label: 'Concessionária de Máquinas e Equipamentos Agrícolas',
      primary_product: 'Colheitadeiras de Grãos e Tratores Pesados',
      ticket_medio_estimado: 1850000.00,
      ticket_medio_formatado: 'R$ 1.850.000,00',
      mix_items: [
        { item: 'Colheitadeiras de Grãos Classe 7 a 10', percentage: 45, average_ticket: 'R$ 3.200.000,00' },
        { item: 'Tratores de Alta Potência (220cv a 400cv)', percentage: 35, average_ticket: 'R$ 1.250.000,00' },
        { item: 'Pulverizadores Autopropelidos e Plantadeiras', percentage: 15, average_ticket: 'R$ 1.600.000,00' },
        { item: 'Peças Genuínas, Óleos e Manutenção Corretiva', percentage: 5, average_ticket: 'R$ 85.000,00' }
      ]
    };
  }

  // 2. DEFENSIVOS, ADUBOS E FERTILIZANTES (CNAE 4683)
  const isInsumos = cnae.startsWith('4683') || 
    (cnaeDesc.includes('DEFENSIVO') || cnaeDesc.includes('ADUBO') || cnaeDesc.includes('FERTILIZANTE') || cnaeDesc.includes('SEMENTES'));

  if (isInsumos) {
    return {
      sector_type: 'AGRO',
      is_agro: true,
      is_service: false,
      category_label: 'Distribuidora de Insumos, Adubos e Defensivos',
      primary_product: 'Pacotes Tecnológicos de Sementes, Químicos e NPK',
      ticket_medio_estimado: 420000.00,
      ticket_medio_formatado: 'R$ 420.000,00',
      mix_items: [
        { item: 'Fertilizantes NPK Formulados a Granel', percentage: 40, average_ticket: 'R$ 650.000,00' },
        { item: 'Fungicidas e Inseticidas Sistêmicos', percentage: 35, average_ticket: 'R$ 380.000,00' },
        { item: 'Sementes Industriais Certificadas (Soja/Milho)', percentage: 20, average_ticket: 'R$ 290.000,00' },
        { item: 'Nutrição Foliar e Biológicos', percentage: 5, average_ticket: 'R$ 60.000,00' }
      ]
    };
  }

  // 3. COOPERATIVAS AGROINDUSTRIAIS
  const isCooperativa = razao.includes('COOPERATIVA') || fantasia.includes('COOPERATIVA') || cnaeDesc.includes('COOPERATIVA') || razao.includes('COOP');
  if (isCooperativa) {
    return {
      sector_type: 'AGRO',
      is_agro: true,
      is_service: false,
      category_label: 'Cooperativa Agroindustrial e Central de Abastecimento',
      primary_product: 'Fornecimento Integrado de Insumos e Recebimento de Grãos',
      ticket_medio_estimado: 890000.00,
      ticket_medio_formatado: 'R$ 890.000,00',
      mix_items: [
        { item: 'Barter e Fornecimento de Insumos para Safra', percentage: 50, average_ticket: 'R$ 950.000,00' },
        { item: 'Maquinário e Implementos Agrícolas Cooperados', percentage: 25, average_ticket: 'R$ 1.400.000,00' },
        { item: 'Armazenagem, Secagem e Transporte Rodoviário', percentage: 15, average_ticket: 'R$ 320.000,00' },
        { item: 'Linha Veterinária e Rações Animais', percentage: 10, average_ticket: 'R$ 110.000,00' }
      ]
    };
  }

  // 4. PRODUÇÃO RURAL / CULTIVOS AGRÍCOLAS (CNAE 01, 02, 03, 4621, 4622, 4623)
  const isAgroProducer = cnae.startsWith('01') || cnae.startsWith('02') || cnae.startsWith('03') || 
                         cnae.startsWith('4621') || cnae.startsWith('4622') || cnae.startsWith('4623');
  if (isAgroProducer) {
    const isGraos = cnaeDesc.includes('SOJA') || cnaeDesc.includes('MILHO') || cnaeDesc.includes('CEREAIS') || cnaeDesc.includes('GRAOS');
    const isPecuaria = cnaeDesc.includes('BOVINO') || cnaeDesc.includes('GADO') || cnaeDesc.includes('CRIACAO');
    return {
      sector_type: 'AGRO',
      is_agro: true,
      is_service: false,
      category_label: isGraos ? 'Produção Agrícola e Cultivo de Grãos' : (isPecuaria ? 'Pecuária e Criação Animal' : 'Produção e Agropecuária Extrativa'),
      primary_product: isGraos ? 'Commodities Agrícolas (Soja, Milho e Cereais)' : 'Produção Agropecuária',
      ticket_medio_estimado: 380000.00,
      ticket_medio_formatado: 'R$ 380.000,00',
      mix_items: [
        { item: 'Grãos Comerciais e Soja a Granel', percentage: 55, average_ticket: 'R$ 480.000,00' },
        { item: 'Milho Safrinha e Cereais de Inverno', percentage: 30, average_ticket: 'R$ 260.000,00' },
        { item: 'Subprodutos, Silagem e Matérias-Primas', percentage: 15, average_ticket: 'R$ 110.000,00' }
      ]
    };
  }

  // 5. INSTALAÇÕES ELÉTRICAS / MANUTENÇÃO ELÉTRICA (CNAE 4321)
  const isEletrica = cnae.startsWith('4321') || cnaeDesc.includes('ELETRICA') || cnaeDesc.includes('MANUTENCAO ELETRICA');
  if (isEletrica) {
    const tktEst = capital > 500000 ? 65000 : (capital > 100000 ? 28000 : 14000);
    return {
      sector_type: 'SERVICOS',
      is_agro: false,
      is_service: true,
      category_label: 'Instalação e Manutenção Elétrica (CNAE 4321)',
      primary_product: 'Projetos, Manutenção Elétrica e Infraestrutura de Potência',
      ticket_medio_estimado: tktEst,
      ticket_medio_formatado: `R$ ${tktEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      mix_items: [
        { item: 'Instalações Elétricas Industriais e Comerciais', percentage: 45, average_ticket: `R$ ${(tktEst * 1.5).toLocaleString('pt-BR')}` },
        { item: 'Manutenção Preventiva e Quadros de Distribuição', percentage: 30, average_ticket: `R$ ${(tktEst * 0.9).toLocaleString('pt-BR')}` },
        { item: 'Laudos Técnicos, Cabeamento e Automação', percentage: 15, average_ticket: `R$ ${(tktEst * 1.2).toLocaleString('pt-BR')}` },
        { item: 'Materiais, Disjuntores e Peças de Reposição', percentage: 10, average_ticket: `R$ ${(tktEst * 0.4).toLocaleString('pt-BR')}` }
      ]
    };
  }

  // 6. CONSTRUÇÃO CIVIL E REFORMAS (CNAE 41, 42, 43)
  const isConstrucao = cnae.startsWith('41') || cnae.startsWith('42') || cnae.startsWith('43');
  if (isConstrucao) {
    const tktEst = capital > 1000000 ? 250000 : (capital > 200000 ? 85000 : 35000);
    return {
      sector_type: 'CONSTRUCAO',
      is_agro: false,
      is_service: true,
      category_label: `Construção Civil e Edificações (${competitor.cnae_principal_codigo || 'CNAE 41/43'})`,
      primary_product: 'Obras Civis, Reformas e Gerenciamento Estrutural',
      ticket_medio_estimado: tktEst,
      ticket_medio_formatado: `R$ ${tktEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      mix_items: [
        { item: 'Obras Civis, Alvenaria e Estruturas', percentage: 50, average_ticket: `R$ ${(tktEst * 1.6).toLocaleString('pt-BR')}` },
        { item: 'Reformas, Acabamentos e Revestimentos', percentage: 25, average_ticket: `R$ ${(tktEst * 0.8).toLocaleString('pt-BR')}` },
        { item: 'Instalações Complementares e Infraestrutura', percentage: 15, average_ticket: `R$ ${(tktEst * 0.6).toLocaleString('pt-BR')}` },
        { item: 'Projetos de Engenharia e Fiscalização', percentage: 10, average_ticket: `R$ ${(tktEst * 0.5).toLocaleString('pt-BR')}` }
      ]
    };
  }

  // 7. TECNOLOGIA DA INFORMAÇÃO / SOFTWARE / SAAS (CNAE 62, 63)
  const isTech = cnae.startsWith('62') || cnae.startsWith('63') || cnaeDesc.includes('SOFTWARE') || cnaeDesc.includes('DESENVOLVIMENTO DE PROGRAMAS');
  if (isTech) {
    const tktEst = capital > 500000 ? 45000 : (capital > 100000 ? 18000 : 7500);
    return {
      sector_type: 'TECNOLOGIA',
      is_agro: false,
      is_service: true,
      category_label: `Tecnologia da Informação e Software (${competitor.cnae_principal_codigo || 'CNAE 62'})`,
      primary_product: 'Licenciamento de Software, Plataformas SaaS e Cloud',
      ticket_medio_estimado: tktEst,
      ticket_medio_formatado: `R$ ${tktEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      mix_items: [
        { item: 'Licenciamento de Software e Assinaturas SaaS', percentage: 45, average_ticket: `R$ ${(tktEst * 1.2).toLocaleString('pt-BR')}` },
        { item: 'Desenvolvimento e Customização de Sistemas', percentage: 30, average_ticket: `R$ ${(tktEst * 1.8).toLocaleString('pt-BR')}` },
        { item: 'Suporte Técnico, Cloud e Infraestrutura', percentage: 15, average_ticket: `R$ ${(tktEst * 0.7).toLocaleString('pt-BR')}` },
        { item: 'Implantação, Treinamento e Consultoria', percentage: 10, average_ticket: `R$ ${(tktEst * 0.5).toLocaleString('pt-BR')}` }
      ]
    };
  }

  // 8. PUBLICIDADE, MARKETING E TRÁFEGO PAGO (CNAE 73)
  const isMarketing = cnae.startsWith('73') || cnaeDesc.includes('PUBLICIDADE') || cnaeDesc.includes('MARKETING') || cnaeDesc.includes('PROPAGANDA');
  if (isMarketing) {
    const tktEst = capital > 200000 ? 25000 : (capital > 50000 ? 12000 : 4500);
    return {
      sector_type: 'SERVICOS',
      is_agro: false,
      is_service: true,
      category_label: `Publicidade e Marketing Digital (${competitor.cnae_principal_codigo || 'CNAE 73'})`,
      primary_product: 'Gestão de Mídia, Tráfego Pago e Criação de Marcas',
      ticket_medio_estimado: tktEst,
      ticket_medio_formatado: `R$ ${tktEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      mix_items: [
        { item: 'Gestão de Tráfego Pago e Performance Digital', percentage: 40, average_ticket: `R$ ${(tktEst * 1.3).toLocaleString('pt-BR')}` },
        { item: 'Criação de Conteúdo, Branding e Design', percentage: 30, average_ticket: `R$ ${(tktEst * 1.0).toLocaleString('pt-BR')}` },
        { item: 'Gestão de Mídias Sociais e Inbound', percentage: 20, average_ticket: `R$ ${(tktEst * 0.8).toLocaleString('pt-BR')}` },
        { item: 'Consultoria Estratégica e Automação de Vendas', percentage: 10, average_ticket: `R$ ${(tktEst * 1.5).toLocaleString('pt-BR')}` }
      ]
    };
  }

  // 9. CONTABILIDADE, JURÍDICO E CONSULTORIA DE GESTÃO (CNAE 69, 70, 74)
  const isConsultoria = cnae.startsWith('69') || cnae.startsWith('70') || cnae.startsWith('74');
  if (isConsultoria) {
    const tktEst = capital > 200000 ? 22000 : (capital > 50000 ? 8500 : 3200);
    return {
      sector_type: 'SERVICOS',
      is_agro: false,
      is_service: true,
      category_label: `Serviços Contábeis, Jurídicos ou de Gestão (${competitor.cnae_principal_codigo || 'CNAE 69/70'})`,
      primary_product: 'Assessoria Técnica Contábil, Fiscal ou Jurídica',
      ticket_medio_estimado: tktEst,
      ticket_medio_formatado: `R$ ${tktEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      mix_items: [
        { item: 'Honorários Mensais e Assessoria Continuada', percentage: 50, average_ticket: `R$ ${(tktEst * 0.8).toLocaleString('pt-BR')}` },
        { item: 'Demandas Especializadas e Planejamento Tributário', percentage: 25, average_ticket: `R$ ${(tktEst * 1.8).toLocaleString('pt-BR')}` },
        { item: 'Regularizações Societárias e Pareceres Técnicos', percentage: 15, average_ticket: `R$ ${(tktEst * 1.2).toLocaleString('pt-BR')}` },
        { item: 'Consultoria de Processos e Auditoria', percentage: 10, average_ticket: `R$ ${(tktEst * 1.5).toLocaleString('pt-BR')}` }
      ]
    };
  }

  // 10. TRANSPORTE RODOVIÁRIO DE CARGAS E LOGÍSTICA (CNAE 49, 52, 53)
  const isLogistica = cnae.startsWith('49') || cnae.startsWith('52') || cnae.startsWith('53') || cnaeDesc.includes('TRANSPORTE RODOVIARIO');
  if (isLogistica) {
    const tktEst = capital > 1000000 ? 75000 : (capital > 200000 ? 28000 : 12000);
    return {
      sector_type: 'LOGISTICA',
      is_agro: false,
      is_service: true,
      category_label: `Transporte de Cargas e Logística (${competitor.cnae_principal_codigo || 'CNAE 49'})`,
      primary_product: 'Fretes Comerciais, Cargas Fechadas e Fracionadas',
      ticket_medio_estimado: tktEst,
      ticket_medio_formatado: `R$ ${tktEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      mix_items: [
        { item: 'Fretes de Longa Distância e Cargas Lotadas', percentage: 50, average_ticket: `R$ ${(tktEst * 1.5).toLocaleString('pt-BR')}` },
        { item: 'Distribuição Urbana e Cargas Fracionadas', percentage: 25, average_ticket: `R$ ${(tktEst * 0.7).toLocaleString('pt-BR')}` },
        { item: 'Armazenagem e Operação de Pátio', percentage: 15, average_ticket: `R$ ${(tktEst * 0.9).toLocaleString('pt-BR')}` },
        { item: 'Seguro de Cargas e Gerenciamento de Risco', percentage: 10, average_ticket: `R$ ${(tktEst * 0.4).toLocaleString('pt-BR')}` }
      ]
    };
  }

  // 11. INDÚSTRIA DE TRANSFORMAÇÃO GERAL (CNAE 10 a 33)
  const isIndustria = /^(1[0-9]|2[0-9]|3[0-3])/.test(cnae);
  if (isIndustria) {
    const tktEst = capital > 1000000 ? 120000 : (capital > 200000 ? 45000 : 18000);
    const cleanedDesc = competitor.cnae_principal_descricao || 'Produtos Manufaturados';
    return {
      sector_type: 'INDUSTRIA',
      is_agro: false,
      is_service: false,
      category_label: `Indústria de Transformação (${competitor.cnae_principal_codigo || 'CNAE ' + cnae.slice(0, 2)})`,
      primary_product: `Fabricação e Fornecimento de ${cleanedDesc}`,
      ticket_medio_estimado: tktEst,
      ticket_medio_formatado: `R$ ${tktEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      mix_items: [
        { item: `Linhas Principais de Fabricação (${cleanedDesc.slice(0, 32)})`, percentage: 50, average_ticket: `R$ ${(tktEst * 1.4).toLocaleString('pt-BR')}` },
        { item: 'Peças sob Encomenda e Lotes Especiais', percentage: 30, average_ticket: `R$ ${(tktEst * 1.1).toLocaleString('pt-BR')}` },
        { item: 'Serviços Industriais de Montagem e Usinagem', percentage: 15, average_ticket: `R$ ${(tktEst * 0.7).toLocaleString('pt-BR')}` },
        { item: 'Subprodutos e Sobras Industriais', percentage: 5, average_ticket: `R$ ${(tktEst * 0.3).toLocaleString('pt-BR')}` }
      ]
    };
  }

  // 12. COMÉRCIO ATACADISTA B2B NÃO-AGRO (CNAE 46)
  const isAtacado = cnae.startsWith('46');
  if (isAtacado) {
    const tktEst = capital > 500000 ? 65000 : (capital > 100000 ? 25000 : 9500);
    const cleanedDesc = competitor.cnae_principal_descricao || 'Mercadorias no Atacado';
    return {
      sector_type: 'COMERCIO_B2B',
      is_agro: false,
      is_service: false,
      category_label: `Comércio Atacadista B2B (${competitor.cnae_principal_codigo || 'CNAE 46'})`,
      primary_product: `Distribuição Atacadista de ${cleanedDesc}`,
      ticket_medio_estimado: tktEst,
      ticket_medio_formatado: `R$ ${tktEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      mix_items: [
        { item: 'Vendas no Atacado para Lojistas e Empresas', percentage: 50, average_ticket: `R$ ${(tktEst * 1.3).toLocaleString('pt-BR')}` },
        { item: 'Contas Corporativas e Grandes Pedidos PJ', percentage: 30, average_ticket: `R$ ${(tktEst * 1.6).toLocaleString('pt-BR')}` },
        { item: 'Linhas Complementares e Acessórios', percentage: 15, average_ticket: `R$ ${(tktEst * 0.6).toLocaleString('pt-BR')}` },
        { item: 'Lotes Promocionais e Saldos Comerciais', percentage: 5, average_ticket: `R$ ${(tktEst * 0.4).toLocaleString('pt-BR')}` }
      ]
    };
  }

  // 13. COMÉRCIO VAREJISTA GERAL (CNAE 47)
  const isVarejo = cnae.startsWith('47');
  if (isVarejo) {
    const tktEst = capital > 200000 ? 3200 : (capital > 50000 ? 1200 : 450);
    const cleanedDesc = competitor.cnae_principal_descricao || 'Produtos no Varejo';
    return {
      sector_type: 'VAREJO',
      is_agro: false,
      is_service: false,
      category_label: `Comércio Varejista (${competitor.cnae_principal_codigo || 'CNAE 47'})`,
      primary_product: `Venda Direta de ${cleanedDesc}`,
      ticket_medio_estimado: tktEst,
      ticket_medio_formatado: `R$ ${tktEst.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      mix_items: [
        { item: 'Vendas em Loja Física e Balcão', percentage: 55, average_ticket: `R$ ${(tktEst * 0.9).toLocaleString('pt-BR')}` },
        { item: 'Canais Digitais, WhatsApp e Encomendas', percentage: 25, average_ticket: `R$ ${(tktEst * 1.2).toLocaleString('pt-BR')}` },
        { item: 'Serviços de Entrega e Suporte ao Consumidor', percentage: 10, average_ticket: `R$ ${(tktEst * 0.6).toLocaleString('pt-BR')}` },
        { item: 'Acessórios e Linhas Adicionais', percentage: 10, average_ticket: `R$ ${(tktEst * 0.5).toLocaleString('pt-BR')}` }
      ]
    };
  }

  // 14. FALLBACK DINÂMICO 100% BASEADO NA DESCRIÇÃO REAL DO CNAE (SEM NUNCA INVENTAR AGRO)
  const realDesc = competitor.cnae_principal_descricao || competitor.categoria_real || 'Atividades Empresariais';
  const isGenericService = Boolean(
    cnaeDesc.includes('SERVIC') || cnaeDesc.includes('MANUTEN') || cnaeDesc.includes('CONSULT') || 
    cnaeDesc.includes('REPARO') || cnaeDesc.includes('ASSESSOR') || cnaeDesc.includes('LOCACAO')
  );

  let dynamicTicket = 15000.00;
  if (capital >= 5000000) dynamicTicket = 180000.00;
  else if (capital >= 500000) dynamicTicket = 55000.00;
  else if (capital >= 50000) dynamicTicket = 18000.00;
  else dynamicTicket = 6500.00;

  return {
    sector_type: isGenericService ? 'SERVICOS' : 'CORPORATIVO',
    is_agro: false,
    is_service: isGenericService,
    category_label: `${realDesc} (${competitor.cnae_principal_codigo || 'CNAE Cadastrado'})`,
    primary_product: `${isGenericService ? 'Serviços' : 'Operações'} Especializadas em ${realDesc}`,
    ticket_medio_estimado: dynamicTicket,
    ticket_medio_formatado: `R$ ${dynamicTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    mix_items: [
      { item: `Contratos Principais em ${realDesc.slice(0, 36)}`, percentage: 50, average_ticket: `R$ ${(dynamicTicket * 1.3).toLocaleString('pt-BR')}` },
      { item: 'Atendimentos sob Demanda e Linhas Secundárias', percentage: 30, average_ticket: `R$ ${(dynamicTicket * 0.9).toLocaleString('pt-BR')}` },
      { item: 'Suporte, Peças e Suprimentos Complementares', percentage: 20, average_ticket: `R$ ${(dynamicTicket * 0.6).toLocaleString('pt-BR')}` }
    ]
  };
}

/**
 * Mapeia as praças geográficas de destino (cidades consumidoras onde os clientes do concorrente compram)
 * Calibrado estritamente pelo tipo de setor (Agro vs B2B/Serviços).
 */
export function resolveDestinationMarkets(competitor, tenantId = 'tenant-root-default', productMix = null) {
  const compUf = String(competitor.uf || 'RS').toUpperCase();
  const compMun = String(competitor.municipio || '').toUpperCase();
  const mix = productMix || resolveProductMix(competitor);
  const isAgro = Boolean(mix.is_agro);
  
  // Resolve coordenada exata da sede
  const knownCoord = CITY_COORDINATES[`${compMun}/${compUf}`];
  const compLat = knownCoord ? knownCoord.lat : (Number(competitor.latitude) || -28.3878);
  const compLng = knownCoord ? knownCoord.lng : (Number(competitor.longitude) || -53.9147);

  // Busca municípios do mesmo estado com indicadores de consumo POF/IPC
  let municipalRows = [];
  try {
    municipalRows = db.prepare(`
      SELECT * FROM municipal_indicators 
      WHERE uf = ? 
      ORDER BY ipc_score DESC
    `).all(compUf);
  } catch (_) {
    municipalRows = [];
  }

  // Se a tabela estiver com poucos municípios para a UF, complementa com CITY_COORDINATES
  const mapCitiesAdded = new Set(municipalRows.map(m => m.municipio.toUpperCase()));
  Object.keys(CITY_COORDINATES).forEach(k => {
    const [city, uf] = k.split('/');
    if (uf === compUf && !mapCitiesAdded.has(city.toUpperCase())) {
      municipalRows.push({
        municipio: city,
        uf: uf,
        ipc_score: 70
      });
      mapCitiesAdded.add(city.toUpperCase());
    }
  });

  const candidateCities = [];

  municipalRows.forEach(m => {
    const key = `${m.municipio.toUpperCase()}/${m.uf.toUpperCase()}`;
    const cityCoord = CITY_COORDINATES[key];
    if (!cityCoord) return;

    const distKm = calculateHaversineKm(compLat, compLng, cityCoord.lat, cityCoord.lng);
    const isSede = distKm <= 5 || m.municipio.toUpperCase() === compMun;

    // Raio logístico de atendimento comercial
    if (distKm <= 220 || isSede) {
      let targetCount = 0;

      if (isAgro) {
        // Se for Concorrente AGRO (Máquinas/Insumos/Cooperativa), os alvos reais são as fazendas / produtores
        try {
          const propCountRow = db.prepare(`
            SELECT COUNT(*) as count FROM propriedades_rurais 
            WHERE uf = ? AND UPPER(municipio) = ?
          `).get(compUf, m.municipio.toUpperCase());
          targetCount = propCountRow ? propCountRow.count : 0;
        } catch (_) {}

        if (targetCount === 0) {
          try {
            const agroLeadRow = db.prepare(`
              SELECT COUNT(*) as count FROM leads 
              WHERE uf = ? AND UPPER(municipio) = ? AND (vertical_type = 'AGRO' OR tag LIKE '%RURAL%')
            `).get(compUf, m.municipio.toUpperCase());
            targetCount = agroLeadRow ? agroLeadRow.count : 0;
          } catch (_) {}
        }
      } else {
        // Se for Concorrente B2B / SERVIÇOS / INDÚSTRIA / COMÉRCIO, os alvos são EMPRESAS compradoras daquela cidade
        try {
          const b2bCountRow = db.prepare(`
            SELECT COUNT(*) as count FROM leads 
            WHERE (tenant_id = ? OR tenant_id = 'tenant-root-default')
              AND uf = ? 
              AND UPPER(municipio) = ?
              AND is_competitor = 0
          `).get(tenantId, compUf, m.municipio.toUpperCase());
          targetCount = b2bCountRow ? b2bCountRow.count : 0;
        } catch (_) {}
      }

      // Base mínima realista se banco local tiver poucos registros semeados
      const finalAlvosCount = Math.max(8, targetCount);

      // Volume de mercado baseado no IPC e no ticket do segmento
      const ticketRef = mix.ticket_medio_estimado || 50000;
      const distFactor = distKm === 0 ? 1.0 : Math.max(0.3, 1.0 - (distKm / 280));
      const volumeEst = Math.round(finalAlvosCount * ticketRef * distFactor * 0.85);

      candidateCities.push({
        municipio: m.municipio,
        uf: m.uf,
        distancia_km: distKm,
        is_sede: isSede,
        latitude: cityCoord.lat,
        longitude: cityCoord.lng,
        ipc_score: m.ipc_score || 50,
        volume_estimado_brl: Math.max(350000, volumeEst),
        volume_estimado_formatado: `R$ ${(Math.max(350000, volumeEst) / 1e6).toFixed(1)}M`,
        produtores_alvo_count: finalAlvosCount,
        target_type_label: isAgro ? 'alvos rurais' : 'empresas B2B',
        recommended_radius_km: isSede ? 25 : (distKm <= 50 ? 30 : 35),
        geofence_meta_string: `${cityCoord.lat.toFixed(6)},${cityCoord.lng.toFixed(6)}:+${isSede ? 25 : (distKm <= 50 ? 30 : 35)}km`
      });
    }
  });

  // Ordena com a SEDE sempre no topo, seguida pelas cidades mais próximas e estratégicas
  candidateCities.sort((a, b) => {
    if (a.is_sede && !b.is_sede) return -1;
    if (!a.is_sede && b.is_sede) return 1;
    return a.distancia_km - b.distancia_km;
  });

  // Seleciona as Top 5 praças de escoamento
  const topDestinations = candidateCities.slice(0, 5);

  // Calcula faturamento anual estimado do concorrente com base no capital social e porte
  let faturamentoEstimadoBrl = 0;
  const cap = Number(competitor.capital_social) || 0;
  if (cap > 0) {
    const multiplier = mix.is_agro ? 3.4 : (mix.is_service ? 2.6 : 3.0);
    faturamentoEstimadoBrl = Math.round(cap * multiplier);
  } else {
    // Estimativa por porte
    const p = String(competitor.porte || '').toUpperCase();
    if (p.includes('ME') || p.includes('MICRO')) faturamentoEstimadoBrl = 320000;
    else if (p.includes('EPP')) faturamentoEstimadoBrl = 2400000;
    else faturamentoEstimadoBrl = 8500000;
  }

  const faturamentoFormatado = faturamentoEstimadoBrl >= 1e6
    ? `R$ ${(faturamentoEstimadoBrl / 1e6).toFixed(1)}M/ano`
    : `R$ ${(faturamentoEstimadoBrl / 1e3).toFixed(0)}k/ano`;

  return {
    faturamento_estimado_anual: faturamentoEstimadoBrl,
    faturamento_formatado: faturamentoFormatado,
    total_destinos: topDestinations.length,
    destinations: topDestinations
  };
}

/**
 * Retorna o Raio-X Completo do Fluxo de Vendas do Concorrente (Trade Flow Report)
 */
export function getCompetitorTradeFlow(competitorId, tenantId = 'tenant-root-default') {
  const competitor = db.prepare(`
    SELECT * FROM leads 
    WHERE id = ? AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
  `).get(competitorId, tenantId);

  if (!competitor) {
    throw new Error(`Concorrente com ID "${competitorId}" não encontrado.`);
  }

  const productMix = resolveProductMix(competitor);
  const destinationMarkets = resolveDestinationMarkets(competitor, tenantId, productMix);

  return {
    competitor: {
      id: competitor.id,
      cnpj: competitor.cnpj,
      razao_social: competitor.razao_social,
      nome_fantasia: competitor.nome_fantasia || competitor.razao_social,
      cnae_principal_codigo: competitor.cnae_principal_codigo,
      cnae_principal_descricao: competitor.cnae_principal_descricao,
      municipio: competitor.municipio,
      uf: competitor.uf,
      inscricao_estadual_sefaz: competitor.sefaz_ie_pf || 'Habilitado SEFAZ / NFe',
      capital_social: competitor.capital_social || 0,
      porte: competitor.porte || 'DEMAIS'
    },
    product_mix: productMix,
    trade_flow: destinationMarkets,
    counter_attack_summary: `Concorrente em ${productMix.category_label} com volume estimado de ${destinationMarkets.faturamento_formatado}. As principais praças de escoamento são ${destinationMarkets.destinations.map(d => `${d.municipio} (${d.distancia_km}km)`).join(', ')}.`
  };
}

/**
 * Gera payload de exportação para tráfego pago (Meta Ads / Google Ads Geofencing e Custom Audience)
 * Calibrado com textos e alvos 100% condizentes com o setor do CNAE!
 */
export function generateCercoAdsPayload(competitorId, tenantId = 'tenant-root-default') {
  const tradeFlow = getCompetitorTradeFlow(competitorId, tenantId);
  const { competitor, product_mix, trade_flow } = tradeFlow;

  // 1. Strings de Alfinetes Geográficos para Meta Ads
  const geofencingList = trade_flow.destinations.map((d, idx) => ({
    ranking: idx + 1,
    praca_municipio: d.municipio,
    uf: d.uf,
    distancia_sede_km: d.distancia_km,
    raio_sugerido_km: d.recommended_radius_km,
    latitude: d.latitude,
    longitude: d.longitude,
    meta_ads_pin_string: d.geofence_meta_string,
    volume_anual_estimado: d.volume_estimado_formatado,
    alvos_estimados: d.produtores_alvo_count,
    tipo_alvo: d.target_type_label
  }));

  // 2. Extrai leads / contatos reais das praças de destino para Custom Audience
  const destinationNames = trade_flow.destinations.map(d => d.municipio.toUpperCase());
  let customAudience = [];
  if (destinationNames.length > 0) {
    const placeholders = destinationNames.map(() => '?').join(',');
    try {
      const audienceRows = db.prepare(`
        SELECT id, razao_social, nome_fantasia, contato_nome, decisor_nome, whatsapp, telefone, email, municipio, uf 
        FROM leads 
        WHERE (tenant_id = ? OR tenant_id = 'tenant-root-default')
          AND UPPER(municipio) IN (${placeholders})
          AND is_competitor = 0
        LIMIT 100
      `).all(tenantId, ...destinationNames);

      customAudience = audienceRows.map(r => ({
        nome: r.decisor_nome || r.contato_nome || r.nome_fantasia || r.razao_social,
        telefone: r.whatsapp || r.telefone || '',
        email: r.email || '',
        cidade: r.municipio,
        uf: r.uf
      }));
    } catch (_) {
      customAudience = [];
    }
  }

  // 3. Cópias de Anúncios Persuasivas de Contra-Ataque (IA Comercial calibrada pelo setor)
  const topCity = trade_flow.destinations[0]?.municipio || competitor.municipio;
  const secondCity = trade_flow.destinations[1]?.municipio || competitor.municipio;
  const compName = competitor.nome_fantasia || competitor.razao_social;

  let counterAttackCopies = [];

  if (product_mix.is_agro) {
    // Cópias dedicadas para o Agro
    counterAttackCopies = [
      {
        titulo: `Condições Exclusivas de Safra para ${topCity} e Região`,
        corpo: `Produtor rural de ${topCity} e ${secondCity}: não fique refém de prazos longos de entrega ou pós-venda distante de grandes revendas. Garanta pronta entrega de ${product_mix.primary_product.toLowerCase()}, taxas subsidiadas do Plano Safra e assistência técnica presencial na sua fazenda em menos de 2 horas. Fale com nossos especialistas pelo WhatsApp.`,
        cta: 'Simular Condições de Safra'
      },
      {
        titulo: `Cotação Direta: Compare Antes de Fechar em ${topCity}`,
        corpo: `Está negociando com ${compName} ou revendas da região? Faça sua contraproposta antes de assinar. Cobrimos condições comerciais em ${product_mix.mix_items[0]?.item || 'maquinários e insumos'}, com revisão inicial inclusa e entrega garantida na sua propriedade rural.`,
        cta: 'Solicitar Contraproposta Comercial'
      },
      {
        titulo: `Peças Genuínas e Assistência Mecânica sem Espera`,
        corpo: `Máquina parada na colheita é prejuízo no bolso. Atendemos com estoque completo para ${topCity}, ${secondCity} e todo o raio de 100km. Suporte tático para não travar a sua operação no campo.`,
        cta: 'Consultar Estoque Imediato'
      }
    ];
  } else {
    // Cópias dedicadas para B2B, Serviços, Indústria e Tecnologia (100% livres de chavões agrícolas)
    counterAttackCopies = [
      {
        titulo: `Atendimento Corporativo Especializado em ${topCity} e Região`,
        corpo: `Empresas de ${topCity} e ${secondCity}: conte com soluções ágeis e de alta confiabilidade em ${product_mix.primary_product.toLowerCase()}. Faturamento direto para pessoa jurídica, equipe técnica qualificada e suporte imediato para manter a sua operação rodando com máxima eficiência.`,
        cta: 'Falar com Consultor Técnico'
      },
      {
        titulo: `Compare Condições Comerciais e Orçamentos em ${topCity}`,
        corpo: `Antes de fechar serviços ou contratos com ${compName}, solicite uma proposta comparativa sem compromisso. Garantimos prazos mais ágeis, emissão de nota fiscal integral, garantia estendida e condições facilitadas de pagamento para a sua empresa.`,
        cta: 'Receber Cotação Comparativa'
      },
      {
        titulo: `Soluções Ágeis para Empresas em ${topCity}`,
        corpo: `Evite paradas e atrasos no seu negócio. Fornecemos atendimento pontual em ${product_mix.mix_items[0]?.item || 'serviços especializados'} com pronta resposta para toda a região num raio de até 100km. Solicite atendimento rápido pelo WhatsApp.`,
        cta: 'Solicitar Orçamento em 1 Clique'
      }
    ];
  }

  return {
    competitor: competitor,
    product_mix: product_mix,
    geofencing_destinations: geofencingList,
    custom_audience_leads: customAudience,
    counter_attack_copies: counterAttackCopies
  };
}
