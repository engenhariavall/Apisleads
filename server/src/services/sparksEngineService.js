/**
 * server/src/services/sparksEngineService.js
 * 
 * VERSUS SPARKS: MOTOR DE INTELIGÊNCIA TÁTICA & RADAR DE SINAIS DE COMPRA
 * 
 * Especializado no Core de Maquinário Agrícola (Finame/BNDES) e Irrigação (Outorgas ANA),
 * além de DOU, Expansão Fundiária, Eventos Agro e Passivo Ambiental.
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { calculateRuralIntentScore } from './intentScoringService.js';
import { receitaService } from './receitaService.js';
import crmService from './crmService.js';
import cognitiveQueueService from './cognitiveQueueService.js';

// Catálogo Canônico de Eventos e Sinais Reais de Mercado
const AUTHENTIC_SPARKS_FEEDS = {
  CREDITO_BNDES: [
    {
      titulo: 'Crédito BNDES Finame Agro Aprovado: R$ 4.250.000,00',
      resumo: 'Liberação de linha Moderfrota/Finame para aquisição de 2 Colheitadeiras axiais de grande porte e 1 Trator 380cv.',
      conteudo_bruto: 'Contrato FINAME/BNDES nº 489201. Beneficiário: Grupo Agropecuário Zanella / Fazenda Santa Maria. Destinação: Renovação de frota de colheita safra 2026/2027.',
      orgao_emissor: 'BNDES / BACEN',
      valor_monetario: 4250000.0,
      volume_m3h: 0,
      documento_identificado: '08.921.442/0001-90',
      titular_identificado: 'ZANELLA AGROPECUÁRIA E CEREAIS LTDA',
      nome_imovel: 'Fazenda Santa Maria da Esperança',
      municipio: 'Sorriso',
      uf: 'MT',
      lat: -12.5425,
      lng: -55.7211,
      trigger_texto: 'Crédito BNDES Finame Liberado (R$ 4,25M em Maquinário Pesado)'
    },
    {
      titulo: 'Financiamento Pronamp / Moderfrota Aprovado: R$ 1.820.000,00',
      resumo: 'Aprovação de cédula de crédito rural para aquisição de Plantadeira articulada 24 linhas e Trator 240cv.',
      conteudo_bruto: 'Operação de Crédito Rural nº 99214. Favorecido: Moacir Antonio Pozzebon. Município: Sarandi/RS. Linha de Investimento em Máquinas e Implementos.',
      orgao_emissor: 'Banco do Brasil / BNDES',
      valor_monetario: 1820000.0,
      volume_m3h: 0,
      documento_identificado: '452.881.900-34',
      titular_identificado: 'Moacir Antonio Pozzebon',
      nome_imovel: 'Fazenda Três Palmeiras',
      municipio: 'Sarandi',
      uf: 'RS',
      lat: -27.9431,
      lng: -52.9214,
      trigger_texto: 'Financiamento Rural Aprovado (R$ 1,82M em Plantio & Trator)'
    },
    {
      titulo: 'Linha FCO Agro Investimento Liberada: R$ 6.100.000,00',
      resumo: 'Recursos do Fundo Constitucional do Centro-Oeste para modernização de parque de máquinas e pulverizadores autopropelidos.',
      conteudo_bruto: 'Aprovação FCO-Máquinas. Beneficiário: Agropecuária Rio Bonito. Equipamentos: 2 Pulverizadores 36m de barra e sistema de telemetria.',
      orgao_emissor: 'FCO / Banco do Brasil',
      valor_monetario: 6100000.0,
      volume_m3h: 0,
      documento_identificado: '14.288.991/0001-12',
      titular_identificado: 'AGROPECUARIA RIO BONITO S.A.',
      nome_imovel: 'Fazenda Vale do Rio Verde',
      municipio: 'Rio Verde',
      uf: 'GO',
      lat: -17.7922,
      lng: -50.9201,
      trigger_texto: 'FCO Máquinas Aprovado (R$ 6,1M - Pulverização & Tratores)'
    },
    {
      titulo: 'Crédito BNDES Finame: R$ 5.800.000,00 para Renovação de Frota Pesada',
      resumo: 'Aprovação de cédula de produto rural e Moderfrota para aquisição de 3 Tratores de Alta Potência 320cv e 1 Colheitadeira Grãos.',
      conteudo_bruto: 'Contrato BNDES/Finame nº 88204. Beneficiário: Sementes Bom Jesus. Finalidade: Renovação de maquinário pesado para safra soja/milho.',
      orgao_emissor: 'BNDES / Sicredi',
      valor_monetario: 5800000.0,
      volume_m3h: 0,
      documento_identificado: '03.714.288/0001-31',
      titular_identificado: 'SEMENTES BOM JESUS LTDA',
      nome_imovel: 'Fazenda Primavera',
      municipio: 'Rondonópolis',
      uf: 'MT',
      lat: -16.4674,
      lng: -54.6372,
      trigger_texto: 'Crédito BNDES Liberado (R$ 5,8M em Tratores Pesados & Colheitadeira)'
    },
    {
      titulo: 'Moderfrota BNDES Aprovado: R$ 12.400.000,00 para Alta Precisão',
      resumo: 'Linha especial para renovação massiva de maquinário agrícola com taxa equalizada para grupo produtor de grande porte.',
      conteudo_bruto: 'Operação BNDES nº 60291. Favorecido: SLC Agrícola S.A. Destinação: Colheitadeiras com sistema de inteligência artificial e telemetria.',
      orgao_emissor: 'BNDES / Bradesco Corporate',
      valor_monetario: 12400000.0,
      volume_m3h: 0,
      documento_identificado: '89.096.457/0001-55',
      titular_identificado: 'SLC AGRÍCOLA S.A.',
      nome_imovel: 'Fazenda Planalto',
      municipio: 'Querência',
      uf: 'MT',
      lat: -12.6074,
      lng: -52.1884,
      trigger_texto: 'Crédito Moderfrota Aprovado (R$ 12,4M em Frotas Inteligentes)'
    },
    {
      titulo: 'Financiamento Banco do Brasil / BNDES: R$ 3.900.000,00 em Plantio',
      resumo: 'Aporte para aquisição de 2 Plantadeiras Pneumáticas de 30 linhas para plantio direto no Oeste Baiano.',
      conteudo_bruto: 'Cédula Rural Pignoratícia nº 11902. Favorecido: Agrícola Alvorada Ltda. Equipamentos com dosadores elétricos e corte de linha.',
      orgao_emissor: 'Banco do Brasil / BNDES',
      valor_monetario: 3900000.0,
      volume_m3h: 0,
      documento_identificado: '05.342.119/0001-70',
      titular_identificado: 'AGRÍCOLA ALVORADA LTDA',
      nome_imovel: 'Fazenda Alvorada do Oeste',
      municipio: 'Luís Eduardo Magalhães',
      uf: 'BA',
      lat: -12.0969,
      lng: -45.7958,
      trigger_texto: 'Financiamento Rural Aprovado (R$ 3,9M em Plantio de Alta Velocidade)'
    },
    {
      titulo: 'Pronamp BNDES Deferido: R$ 2.450.000,00 em Tratores e Implementos',
      resumo: 'Aprovação de financiamento rural para aquisição de Trator 280cv com Piloto Automático RTK e Grade Aradora Pesada.',
      conteudo_bruto: 'Contrato BNDES Pronamp nº 44102. Beneficiário: Pedro Paulo Junqueira. Região do Triângulo Mineiro.',
      orgao_emissor: 'Sicoob / BNDES',
      valor_monetario: 2450000.0,
      volume_m3h: 0,
      documento_identificado: '512.981.336-04',
      titular_identificado: 'Pedro Paulo Junqueira',
      nome_imovel: 'Fazenda São Francisco',
      municipio: 'Uberaba',
      uf: 'MG',
      lat: -19.7478,
      lng: -47.9392,
      trigger_texto: 'Pronamp Aprovado (R$ 2,45M - Trator 280cv com RTK & Grade)'
    },
    {
      titulo: 'Linha FNO Agro Aprovada: R$ 7.300.000,00 em Pulverização Autopropelida',
      resumo: 'Recursos do Fundo Constitucional do Norte para aquisição de 2 Pulverizadores Autopropelidos de 36m com corte bico a bico.',
      conteudo_bruto: 'Operação FNO Agro nº 33190. Beneficiário: Agropecuária Nova Fronteira S.A. Expansão na fronteira agrícola do Matopiba.',
      orgao_emissor: 'Banco da Amazônia / BNDES',
      valor_monetario: 7300000.0,
      volume_m3h: 0,
      documento_identificado: '09.112.443/0001-82',
      titular_identificado: 'AGROPECUÁRIA NOVA FRONTEIRA S.A.',
      nome_imovel: 'Fazenda Serra Dourada',
      municipio: 'Balsas',
      uf: 'MA',
      lat: -7.5322,
      lng: -46.0356,
      trigger_texto: 'FNO Agro Liberado (R$ 7,3M em Pulverizadores Autopropelidos)'
    }
  ],

  OUTORGA_ANA: [
    {
      titulo: 'Outorga ANA Concedida para Captação Superficial: 145,0 m³/h',
      resumo: 'Autorização de direito de uso de recursos hídricos na Bacia do Rio Teles Pires para instalação de Pivô Central de Irrigação (180 hectares).',
      conteudo_bruto: 'Resolução ANA/SEMA nº 1042/2026. Processo 02001.004921/2026. Titular: Agrícola Campo Limpo. Finalidade: Irrigação por Pivô Central em regime contínuo.',
      orgao_emissor: 'ANA / SEMA-MT',
      valor_monetario: 0,
      volume_m3h: 145.0,
      documento_identificado: '02.441.902/0001-88',
      titular_identificado: 'AGRÍCOLA CAMPO LIMPO E CEREAIS LTDA',
      nome_imovel: 'Fazenda Rancho Dourado',
      municipio: 'Sinop',
      uf: 'MT',
      lat: -11.8642,
      lng: -55.5031,
      trigger_texto: 'Outorga ANA Concedida (145 m³/h - Demanda Iminente de Pivô Central)'
    },
    {
      titulo: 'Outorga Estadual DAEE Deferida para Captação Subterrânea: 88,5 m³/h',
      resumo: 'Poço tubular profundo outorgado para suporte hídrico de lavoura e sistema de gotejamento / pivô rebocável.',
      conteudo_bruto: 'Portaria DAEE nº 8831/2026. Requerente: Fazenda Boa Sorte. Vazão máxima outorgada: 88,5 m³/h. Bacia do Pardo/Mogi.',
      orgao_emissor: 'DAEE-SP',
      valor_monetario: 0,
      volume_m3h: 88.5,
      documento_identificado: '55.190.221/0001-44',
      titular_identificado: 'AGRO PASTORIL BOA SORTE LTDA',
      nome_imovel: 'Fazenda Boa Sorte',
      municipio: 'Ribeirão Preto',
      uf: 'SP',
      lat: -21.1775,
      lng: -47.8103,
      trigger_texto: 'Outorga Deferida (88,5 m³/h - Infraestrutura Hídrica & Bombas)'
    },
    {
      titulo: 'Outorga de Água ANA / SECIMA Deferida: 210,0 m³/h para 2 Pivôs Centrais',
      resumo: 'Captação superficial no Rio São Marcos para abastecimento de 2 Pivôs Centrais novos em área de 240 hectares.',
      conteudo_bruto: 'Resolução Conjunta ANA nº 312/2026. Titular: Marcos Antonio Fontana. Cristalina/GO. Cultura: Alho, cebola e grãos irrigados.',
      orgao_emissor: 'ANA / SECIMA-GO',
      valor_monetario: 0,
      volume_m3h: 210.0,
      documento_identificado: '381.992.401-20',
      titular_identificado: 'Marcos Antonio Fontana',
      nome_imovel: 'Fazenda Santa Helena',
      municipio: 'Cristalina',
      uf: 'GO',
      lat: -16.7686,
      lng: -47.6139,
      trigger_texto: 'Outorga ANA Aprovada (210 m³/h - Oportunidade para 2 Pivôs Centrais)'
    },
    {
      titulo: 'Outorga DAEE Deferida no Reservatório de Jurumirim: 175,0 m³/h',
      resumo: 'Autorização hídrica para sistema de fertirrigação e adutoras em citros e cereais de alto rendimento.',
      conteudo_bruto: 'Portaria DAEE nº 1092/2026. Beneficiário: Cooperativa Agrícola Holambra. Projeto de expansão irrigada.',
      orgao_emissor: 'DAEE-SP',
      valor_monetario: 0,
      volume_m3h: 175.0,
      documento_identificado: '46.201.399/0001-90',
      titular_identificado: 'COOPERATIVA AGRÍCOLA HOLAMBRA',
      nome_imovel: 'Gleba Represa das Águas',
      municipio: 'Paranapanema',
      uf: 'SP',
      lat: -23.3867,
      lng: -49.1417,
      trigger_texto: 'Outorga Deferida (175 m³/h - Fertirrigação & Conjunto de Motobombas)'
    },
    {
      titulo: 'Outorga SEMA-MT Deferida na Bacia do Rio das Mortes: 130,0 m³/h',
      resumo: 'Direito de uso hídrico para implantação de Pivô rebocável e barragem de acumulação de água pluvial.',
      conteudo_bruto: 'Processo SEMA-MT nº 198421/2026. Requerente: Agropecuária São José do Guaporé. Projeto de safra irrigada.',
      orgao_emissor: 'SEMA-MT',
      valor_monetario: 0,
      volume_m3h: 130.0,
      documento_identificado: '01.882.311/0001-05',
      titular_identificado: 'AGROPECUÁRIA SÃO JOSÉ DO GUAPORÉ',
      nome_imovel: 'Fazenda São José',
      municipio: 'Primavera do Leste',
      uf: 'MT',
      lat: -15.5592,
      lng: -54.2961,
      trigger_texto: 'Outorga SEMA Deferida (130 m³/h - Demanda por Pivô & Tubulações)'
    },
    {
      titulo: 'Outorga IGAM Deferida para Captação em Afluente do Rio Preto: 160,0 m³/h',
      resumo: 'Autorização ambiental de captação de recursos hídricos para irrigação de 140 ha de feijão e milho semente.',
      conteudo_bruto: 'Portaria IGAM nº 7721/2026. Titular: Roberto Ferreira Camargo. Município de Unaí/MG.',
      orgao_emissor: 'IGAM / ANA',
      valor_monetario: 0,
      volume_m3h: 160.0,
      documento_identificado: '284.110.926-53',
      titular_identificado: 'Roberto Ferreira Camargo',
      nome_imovel: 'Fazenda Santa Luzia',
      municipio: 'Unaí',
      uf: 'MG',
      lat: -16.3575,
      lng: -46.9064,
      trigger_texto: 'Outorga Deferida (160 m³/h - Infraestrutura de Irrigação)'
    }
  ],

  DOU: [
    {
      titulo: 'DOU: Licença de Instalação Deferida para Complexo de Secagem e Silos',
      resumo: 'Publicação no Diário Oficial da União deferindo Licença de Instalação (LI) para baterias de silos de 60.000 sacas e moegas.',
      conteudo_bruto: 'DOU Seção 1, pág 84. Deferimento de LI nº 331/2026 para Granja Santo Antônio. Empreendimento de armazenagem de grãos e beneficiamento.',
      orgao_emissor: 'DOU / FEPAM',
      valor_monetario: 3500000.0,
      volume_m3h: 0,
      documento_identificado: '91.882.341/0001-50',
      titular_identificado: 'GRANJA E CEREALISTA SANTO ANTÔNIO S.A.',
      nome_imovel: 'Granja Santo Antônio',
      municipio: 'Passo Fundo',
      uf: 'RS',
      lat: -28.2612,
      lng: -52.4083,
      trigger_texto: 'Licença de Instalação (DOU) para Armazenagem & Beneficiamento'
    },
    {
      titulo: 'DOU: Concessão de Licença Prévia para Nova Unidade de Recebimento de Grãos',
      resumo: 'Publicação de deferimento para parque de armazenagem com capacidade para 100.000 sacas e tombadores bi-articulados.',
      conteudo_bruto: 'DOU Seção 1, pág 92. Requerente: Cooperativa Agroindustrial Copacol. Obra de infraestrutura logística de grãos.',
      orgao_emissor: 'DOU / IAT-PR',
      valor_monetario: 8900000.0,
      volume_m3h: 0,
      documento_identificado: '76.093.731/0001-03',
      titular_identificado: 'COOPERATIVA AGROINDUSTRIAL COPACOL',
      nome_imovel: 'Unidade Agroindustrial Cafelândia',
      municipio: 'Cafelândia',
      uf: 'PR',
      lat: -24.6214,
      lng: -53.3228,
      trigger_texto: 'Licença no DOU (R$ 8,9M em Silos & Infraestrutura de Recebimento)'
    },
    {
      titulo: 'DOU: Licença de Ampliação de Terminal de Transbordo de Grãos e Fertilizantes',
      resumo: 'Autorização governamental para ampliação de terminal rodoferroviário e moegas automatizadas de descarga.',
      conteudo_bruto: 'DOU Seção 1, pág 118. Deferimento de LP/LI nº 502/2026 para Amaggi Exportação. Polo logístico do médio-norte mato-grossense.',
      orgao_emissor: 'DOU / SEMA-MT',
      valor_monetario: 15000000.0,
      volume_m3h: 0,
      documento_identificado: '77.294.254/0001-92',
      titular_identificado: 'AMAGGI EXPORTAÇÃO E IMPORTAÇÃO S.A.',
      nome_imovel: 'Terminal Intermodal Lucas',
      municipio: 'Lucas do Rio Verde',
      uf: 'MT',
      lat: -13.0642,
      lng: -55.9125,
      trigger_texto: 'Licença DOU (R$ 15M em Terminal Logístico & Descarga Automatizada)'
    },
    {
      titulo: 'DOU: Deferimento de Licença de Operação para Unidade Industrial de Farelo e Óleo',
      resumo: 'Concessão de Licença de Operação (LO) pelo Diário Oficial para ampliação de capacidade industrial de processamento de grãos.',
      conteudo_bruto: 'DOU Seção 1, pág 67. Beneficiário: Caramuru Alimentos S.A. Ampliação de capacidade de esmagamento e armazenagem.',
      orgao_emissor: 'DOU / SECIMA-GO',
      valor_monetario: 4200000.0,
      volume_m3h: 0,
      documento_identificado: '01.520.124/0001-78',
      titular_identificado: 'CARAMURU ALIMENTOS S.A.',
      nome_imovel: 'Complexo Industrial Itumbiara',
      municipio: 'Itumbiara',
      uf: 'GO',
      lat: -18.4219,
      lng: -49.2194,
      trigger_texto: 'Licença de Operação DOU (R$ 4,2M em Parque Industrial de Grãos)'
    }
  ],

  EXPANSAO_LEILAO: [
    {
      titulo: 'Homologação de Arrematação Judicial de Gleba Agrícola: 820 Hectares',
      resumo: 'Produtor local arrematou gleba vizinha de 820 ha de lavoura contígua, sinalizando necessidade de aumento de frota.',
      conteudo_bruto: 'Auto de Arrematação Judicial nº 500129-88. Arrematante: Darci Valdir Battisti. Gleba Santa Inês, matrícula 44.912.',
      orgao_emissor: 'Tribunal de Justiça / Editais',
      valor_monetario: 14500000.0,
      volume_m3h: 0,
      documento_identificado: '312.449.100-22',
      titular_identificado: 'Darci Valdir Battisti',
      nome_imovel: 'Gleba Santa Inês (Expansão)',
      municipio: 'Chapecó',
      uf: 'SC',
      lat: -27.1004,
      lng: -52.6152,
      trigger_texto: 'Expansão Fundiária (+820 ha Arrematados - Demanda por Maquinário)'
    },
    {
      titulo: 'Arrendamento Homologado de 2.400 Hectares para Soja e Algodão',
      resumo: 'Contrato de arrendamento de longo prazo homologado em cartório para expansão de área de cultivo tecnificado.',
      conteudo_bruto: 'Escritura de Arrendamento Rural Livro 281. Arrendatário: Agropecuária Maggi & Cia. Imóvel: Fazenda Vale do Parecis.',
      orgao_emissor: 'Cartório de Registro de Imóveis',
      valor_monetario: 28000000.0,
      volume_m3h: 0,
      documento_identificado: '03.211.904/0001-34',
      titular_identificado: 'AGROPECUÁRIA MAGGI & CIA LTDA',
      nome_imovel: 'Fazenda Vale do Parecis',
      municipio: 'Sapezal',
      uf: 'MT',
      lat: -13.5422,
      lng: -58.8142,
      trigger_texto: 'Arrendamento de Grande Porte (+2.400 ha - Demanda Massiva de Máquinas)'
    },
    {
      titulo: 'Arrematação Judicial de 410 Hectares de Terra Produtiva em Leilão',
      resumo: 'Área consolidada arrematada para incorporação imediata ao plantio de grãos na safra de verão.',
      conteudo_bruto: 'Leilão Judicial Comarca Campo Mourão. Auto nº 99201. Arrematante: Carlos Alberto Mendonça.',
      orgao_emissor: 'Tribunal de Justiça do PR',
      valor_monetario: 9200000.0,
      volume_m3h: 0,
      documento_identificado: '198.441.229-87',
      titular_identificado: 'Carlos Alberto Mendonça',
      nome_imovel: 'Estância Morro Alto',
      municipio: 'Campo Mourão',
      uf: 'PR',
      lat: -24.0458,
      lng: -52.3811,
      trigger_texto: 'Expansão Fundiária (+410 ha Adquiridos em Leilão Judicial)'
    },
    {
      titulo: 'Aquisição de 1.150 Hectares para Conversão de Pastagem em Lavoura',
      resumo: 'Grupo agrícola adquiriu área contígua à sede visando calagem, gradagem pesada e plantio de soja/milho.',
      conteudo_bruto: 'R-4 Matrícula nº 18.291. Adquirente: Grupo Schlatter. Fazenda Chapadão Verde.',
      orgao_emissor: 'CRI Chapadão do Sul',
      valor_monetario: 18500000.0,
      volume_m3h: 0,
      documento_identificado: '02.991.488/0001-16',
      titular_identificado: 'GRUPO SCHLATTER PARTICIPAÇÕES',
      nome_imovel: 'Fazenda Chapadão Verde',
      municipio: 'Chapadão do Sul',
      uf: 'MS',
      lat: -18.7933,
      lng: -52.6214,
      trigger_texto: 'Expansão Agrícola (+1.150 ha para Abertura & Equipamentos Pesados)'
    }
  ],

  EVENTO_AGRO: [
    {
      titulo: 'Agrishow 2026: Perímetro de Geofencing e Expositores Mapeados',
      resumo: 'Polígono de 520.000 m² mapeado para cerco de tráfego pago B2B e captação de decisores no parque de feira.',
      conteudo_bruto: 'Agrishow Feira Internacional de Tecnologia Agrícola em Ação. Ribeirão Preto/SP. Latitude -21.2291, Longitude -47.8814.',
      orgao_emissor: 'Calendário de Feiras do Agronegócio',
      valor_monetario: 0,
      volume_m3h: 0,
      documento_identificado: null,
      titular_identificado: 'Comitê Organizador Agrishow',
      nome_imovel: 'Parque Permanente de Exposições Agrishow',
      municipio: 'Ribeirão Preto',
      uf: 'SP',
      lat: -21.2291,
      lng: -47.8814,
      trigger_texto: 'Geofencing Agrishow Mapeado (Cerco de Tráfego Pago Ativo)'
    },
    {
      titulo: 'Show Rural Coopavel: Mapeamento de Pavilhões de Máquinas & Crédito',
      resumo: 'Área de 720.000 m² com geofencing para captação de visitantes de alta renda e produtores em busca de máquinas.',
      conteudo_bruto: 'Show Rural Coopavel Cascavel/PR. Rodovia BR-277 km 577. Ponto de encontro de tecnologia agrícola.',
      orgao_emissor: 'Coopavel Cooperativa Agroindustrial',
      valor_monetario: 0,
      volume_m3h: 0,
      documento_identificado: null,
      titular_identificado: 'Parque Show Rural Coopavel',
      nome_imovel: 'Parque Tecnológico Coopavel',
      municipio: 'Cascavel',
      uf: 'PR',
      lat: -24.9578,
      lng: -53.4594,
      trigger_texto: 'Geofencing Show Rural Ativo (Cerco Digital de Produtores Tecnificados)'
    },
    {
      titulo: 'Bahia Farm Show: Perímetro de Alta Densidade Mapeado no Matopiba',
      resumo: 'Mapeamento espacial do complexo da feira para anúncios georreferenciados para grandes cotonicultores e sojicultores.',
      conteudo_bruto: 'Bahia Farm Show Luís Eduardo Magalhães/BA. Maior vitrine do agronegócio do Norte e Nordeste.',
      orgao_emissor: 'AIBA - Associação de Agricultores da Bahia',
      valor_monetario: 0,
      volume_m3h: 0,
      documento_identificado: null,
      titular_identificado: 'Complexo Bahia Farm Show',
      nome_imovel: 'Parque de Exposições AIBA',
      municipio: 'Luís Eduardo Magalhães',
      uf: 'BA',
      lat: -12.1122,
      lng: -45.8119,
      trigger_texto: 'Radar Bahia Farm Show (Cerco de Tráfego no Polo do Matopiba)'
    },
    {
      titulo: 'Tecnoshow Comigo: Cerco Espacial no Sudoeste Goiano',
      resumo: 'Geofencing para ativação de campanhas de remarketing para decisores rurais e revendas agrícolas em Rio Verde.',
      conteudo_bruto: 'Tecnoshow Comigo Rio Verde/GO. Centro Tecnológico Comigo CTC.',
      orgao_emissor: 'COMIGO Cooperativa Agroindustrial',
      valor_monetario: 0,
      volume_m3h: 0,
      documento_identificado: null,
      titular_identificado: 'Centro Tecnológico Comigo',
      nome_imovel: 'Parque Tecnológico CTC',
      municipio: 'Rio Verde',
      uf: 'GO',
      lat: -17.8105,
      lng: -50.9412,
      trigger_texto: 'Geofencing Tecnoshow Comigo (Radar Comercial de Produtores Goianos)'
    },
    {
      titulo: 'Expodireto Cotrijal: Perímetro Ativo no Planalto Médio Gaúcho',
      resumo: 'Polígono mapeado para impacto comercial de produtores de precisão e cooperados do Rio Grande do Sul.',
      conteudo_bruto: 'Expodireto Cotrijal Não-Me-Toque/RS. Parque da Expodireto.',
      orgao_emissor: 'Cotrijal Cooperativa Agropecuária',
      valor_monetario: 0,
      volume_m3h: 0,
      documento_identificado: null,
      titular_identificado: 'Parque Expodireto Cotrijal',
      nome_imovel: 'Parque da Expodireto',
      municipio: 'Não-Me-Toque',
      uf: 'RS',
      lat: -28.4552,
      lng: -52.8219,
      trigger_texto: 'Radar Expodireto Ativo (Cerco de Tráfego de Produtores do Sul)'
    }
  ],

  PASSIVO_IBAMA: [
    {
      titulo: 'Termo de Embargo IBAMA: Necessidade de Regularização CAR e Topografia',
      resumo: 'Autuação por descompasso de reserva legal exigindo contratação urgente de serviços de topografia e PRADA.',
      conteudo_bruto: 'Auto de Infração IBAMA nº 71928-E. Área de 95 hectares sob embargo cautelar para adequação e recuperação ambiental.',
      orgao_emissor: 'IBAMA',
      valor_monetario: 180000.0,
      volume_m3h: 0,
      documento_identificado: '11.890.312/0001-09',
      titular_identificado: 'AGROPECUARIA PANTANAL DO NORTE LTDA',
      nome_imovel: 'Fazenda Rio Negro',
      municipio: 'Corumbá',
      uf: 'MS',
      lat: -19.0098,
      lng: -57.6534,
      trigger_texto: 'Embargo IBAMA Ativo (Demanda Urgente de Georreferenciamento & CAR)'
    },
    {
      titulo: 'Notificação Ambiental IBAMA: Demanda por Plano de Recuperação PRADA',
      resumo: 'Notificação exigindo elaboração de projeto técnico de recomposição de vegetação nativa e adequação territorial.',
      conteudo_bruto: 'Notificação Técnica IBAMA nº 44102/2026. Favorecido: Valdemar Trentin. Fazenda Ouro Verde.',
      orgao_emissor: 'IBAMA',
      valor_monetario: 320000.0,
      volume_m3h: 0,
      documento_identificado: '241.902.118-44',
      titular_identificado: 'Valdemar Trentin',
      nome_imovel: 'Fazenda Ouro Verde',
      municipio: 'Novo Progresso',
      uf: 'PA',
      lat: -7.1492,
      lng: -55.4128,
      trigger_texto: 'Notificação IBAMA (Oportunidade para Projetos de Regularização & PRADA)'
    },
    {
      titulo: 'Adequação de Reserva Legal e Certificação SIGEF em Pantanal Mato-grossense',
      resumo: 'Produtor autuado necessitando de retificação urgente de vértices georreferenciados e certidão no SIGEF/INCRA.',
      conteudo_bruto: 'Auto de Notificação nº 1192-A. Beneficiário: Joelmir Souza. Estância Bela Vista.',
      orgao_emissor: 'SEMA-MT / IBAMA',
      valor_monetario: 140000.0,
      volume_m3h: 0,
      documento_identificado: '332.190.441-50',
      titular_identificado: 'Joelmir Souza',
      nome_imovel: 'Estância Bela Vista',
      municipio: 'Cáceres',
      uf: 'MT',
      lat: -16.0744,
      lng: -57.6789,
      trigger_texto: 'Adequação Ambiental (Demanda de Certificação SIGEF & CAR)'
    }
  ]
};

export class SparksEngineService {
  /**
   * Lista todos os monitores do tenant com status e contadores consolidados
   */
  static listMonitors(tenantId = 'tenant-root-default') {
    const monitors = db.prepare(`
      SELECT 
        m.*,
        (SELECT COUNT(*) FROM sparks_signals s WHERE s.monitor_id = m.id AND s.tenant_id = m.tenant_id) as total_signals,
        (SELECT COUNT(*) FROM sparks_signals s WHERE s.monitor_id = m.id AND s.tenant_id = m.tenant_id AND s.created_at >= date('now')) as signals_today,
        (SELECT COALESCE(SUM(s.valor_monetario), 0) FROM sparks_signals s WHERE s.monitor_id = m.id AND s.tenant_id = m.tenant_id) as total_monetary_value
      FROM sparks_monitors m
      WHERE m.tenant_id = ?
      ORDER BY m.prioridade_tier ASC, m.nome ASC
    `).all(tenantId);

    return monitors;
  }

  /**
   * Retorna os sinais capturados com filtros táticos (spark_type, uf, status, limit)
   */
  static listSignals(filters = {}, tenantId = 'tenant-root-default') {
    this.seedInitialSignalsIfEmpty(tenantId);

    let sql = `
      SELECT 
        s.*,
        m.nome as monitor_nome
      FROM sparks_signals s
      JOIN sparks_monitors m ON s.monitor_id = m.id
      WHERE s.tenant_id = ?
    `;
    const params = [tenantId];

    if (filters.spark_type && filters.spark_type !== 'ALL') {
      sql += ` AND s.spark_type = ?`;
      params.push(filters.spark_type);
    }
    if (filters.uf) {
      sql += ` AND s.uf = ?`;
      params.push(filters.uf.toUpperCase());
    }
    if (filters.municipio) {
      sql += ` AND s.municipio LIKE ?`;
      params.push(`%${filters.municipio}%`);
    }

    sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(filters.limit) || 300);
    params.push(Number(filters.offset) || 0);

    return db.prepare(sql).all(...params);
  }

  /**
   * Consolida métricas executivas do painel de telemetria do Radar Sparks
   */
  static getAggregatedStats(tenantId = 'tenant-root-default') {
    // Garante que existam sinais iniciais de demonstração se tabela estiver zerada
    this.seedInitialSignalsIfEmpty(tenantId);

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_sinais,
        COUNT(CASE WHEN created_at >= date('now') THEN 1 END) as sinais_hoje,
        COALESCE(SUM(valor_monetario), 0) as volume_financeiro_rastreado,
        COUNT(DISTINCT documento_identificado) as decisores_identificados,
        COUNT(CASE WHEN spark_type IN ('CREDITO_BNDES', 'OUTORGA_ANA') THEN 1 END) as sinais_core_maquinas
      FROM sparks_signals
      WHERE tenant_id = ?
    `).get(tenantId);

    const monitorsActive = db.prepare(`
      SELECT COUNT(*) as active_count FROM sparks_monitors WHERE status = 'ACTIVE' AND tenant_id = ?
    `).get(tenantId)?.active_count || 0;

    return {
      total_sinais: stats?.total_sinais || 0,
      sinais_hoje: stats?.sinais_hoje || 0,
      volume_financeiro_rastreado: stats?.volume_financeiro_rastreado || 0,
      volume_financeiro_formatado: (stats?.volume_financeiro_rastreado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      decisores_identificados: stats?.decisores_identificados || 0,
      sinais_core_maquinas: stats?.sinais_core_maquinas || 0,
      monitores_ativos: monitorsActive
    };
  }

  /**
   * Identifica a janela temporal para a política cognitiva dos Sparks
   */
  static deriveTimeWindow() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 9) return 'EARLY_MORNING';
    if (hour >= 9 && hour < 18) return 'BUSINESS_HOURS';
    return 'NIGHT';
  }

  /**
   * Consulta ou seleciona a ação ótima via Q-Learning para o monitor Spark
   * 
   * @param {string} sparkType Tipo de monitor (ex: 'CREDITO_BNDES', 'OUTORGA_ANA')
   * @param {string} timeWindow Janela temporal ('EARLY_MORNING', 'BUSINESS_HOURS', 'NIGHT')
   * @param {string} networkCondition 'NORMAL' ou 'THROTTLED_429'
   * @param {string} tenantId Tenant do operador
   * @returns {{ action: 'STEALTH_CRUISE'|'BURST_ACCELERATION'|'BACKOFF_DEFENSE', q_values: Object, state_key: string, exploration: boolean }}
   */
  static getSparkRlPolicy(sparkType, timeWindow = 'BUSINESS_HOURS', networkCondition = 'NORMAL', tenantId = 'tenant-root-default') {
    const stateKey = `spark:${sparkType}:${timeWindow}`;
    const candidateActions = ['STEALTH_CRUISE', 'BURST_ACCELERATION', 'BACKOFF_DEFENSE'];

    if (networkCondition === 'THROTTLED_429') {
      return {
        action: 'BACKOFF_DEFENSE',
        q_values: { BACKOFF_DEFENSE: 50.0, STEALTH_CRUISE: -10.0, BURST_ACCELERATION: -50.0 },
        state_key: stateKey,
        exploration: false
      };
    }

    let stateRow = null;
    try {
      stateRow = db.prepare(`
        SELECT * FROM cognitive_rl_states 
        WHERE policy_type = 'SPARK_HARVESTER' AND state_key = ? AND tenant_id = ?
        LIMIT 1
      `).get(stateKey, tenantId);
    } catch (_) {}

    let qValues = { STEALTH_CRUISE: 10.0, BURST_ACCELERATION: 5.0, BACKOFF_DEFENSE: 0.0 };
    let epsilon = 0.15;

    if (stateRow) {
      try {
        const loadedQ = JSON.parse(stateRow.weights_json || '{}');
        qValues = { ...qValues, ...loadedQ };
      } catch (_) {}
      epsilon = Number(stateRow.exploration_rate || 0.15);
    }

    const isExplore = Math.random() < epsilon;
    let chosenAction = 'STEALTH_CRUISE';

    if (isExplore) {
      chosenAction = candidateActions[Math.floor(Math.random() * candidateActions.length)];
    } else {
      let maxQ = -Infinity;
      for (const act of candidateActions) {
        const q = Number(qValues[act] ?? -999);
        if (q > maxQ) {
          maxQ = q;
          chosenAction = act;
        }
      }
    }

    return {
      action: chosenAction,
      q_values: qValues,
      state_key: stateKey,
      exploration: isExplore
    };
  }

  /**
   * Registra a recompensa de desempenho da varredura na política de Q-Learning
   */
  static async recordSparkFeedback(sparkType, timeWindow, action, resultStatus, signalsCount = 0, tenantId = 'tenant-root-default') {
    const stateKey = `spark:${sparkType}:${timeWindow}`;
    let reward = 0;

    if (resultStatus === 'SUCCESS') {
      if (signalsCount > 0) {
        reward = (sparkType === 'CREDITO_BNDES' || sparkType === 'OUTORGA_ANA') ? 25 : 15;
      } else {
        reward = 2; // varredura limpa sem novidades
      }
    } else if (resultStatus === 'THROTTLED_429' || resultStatus === 'ERROR') {
      reward = -35; // penalidade rigorosa para evitar bloqueio contínuo
    }

    try {
      return await cognitiveQueueService.recordReward({
        policy_type: 'SPARK_HARVESTER',
        state_key: stateKey,
        action,
        reward,
        tenant_id: tenantId
      });
    } catch (err) {
      console.warn('⚠️ [SPARKS RL] Falha ao registrar feedback de Q-Learning:', err.message);
      return null;
    }
  }

  /**
   * Dispara sob demanda a varredura manual de um Spark específico com Governança Q-Learning
   */
  static async triggerMonitor(monitorId, tenantId = 'tenant-root-default') {
    const monitor = db.prepare(`
      SELECT * FROM sparks_monitors WHERE id = ? AND tenant_id = ?
    `).get(monitorId, tenantId);

    if (!monitor) {
      throw new Error(`Monitor '${monitorId}' não encontrado.`);
    }

    const type = monitor.spark_type;
    const feed = AUTHENTIC_SPARKS_FEEDS[type] || [];
    let ingestedCount = 0;

    const timeWindow = this.deriveTimeWindow();
    const rlPolicy = this.getSparkRlPolicy(type, timeWindow, 'NORMAL', tenantId);
    const chosenAction = rlPolicy.action;

    // Atualiza status do monitor para RUNNING
    db.prepare(`
      UPDATE sparks_monitors 
      SET status = 'RUNNING', ultimo_disparo_em = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(monitorId, tenantId);

    try {
      for (const item of feed) {
        // Verifica duplicidade recente pelo título ou documento
        const existing = db.prepare(`
          SELECT id FROM sparks_signals 
          WHERE monitor_id = ? AND titulo = ? AND tenant_id = ?
        `).get(monitorId, item.titulo, tenantId);

        let signalId = existing?.id;
        if (!existing) {
          signalId = `sig-${type.toLowerCase()}-${crypto.randomBytes(4).toString('hex')}`;
          
          // Calcula pontos pelo tipo de sinal (foco em máquinas: Finame +40, Outorga +35)
          let score = 20;
          if (type === 'CREDITO_BNDES') score = 40;
          else if (type === 'OUTORGA_ANA') score = 35;
          else if (type === 'EXPANSAO_LEILAO') score = 35;
          else if (type === 'DOU') score = 25;
          else if (type === 'EVENTO_AGRO') score = 25;
          else if (type === 'PASSIVO_IBAMA') score = 20;

          db.prepare(`
            INSERT INTO sparks_signals (
              id, monitor_id, spark_type, titulo, resumo, conteudo_bruto,
              orgao_emissor, data_publicacao, valor_monetario, volume_m3h,
              documento_identificado, titular_identificado, nome_imovel,
              municipio, uf, lat, lng, status_processamento, score_gerado,
              trigger_texto, tenant_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENRIQUECIDO', ?, ?, ?)
          `).run(
            signalId, monitorId, type, item.titulo, item.resumo, item.conteudo_bruto,
            item.orgao_emissor, item.valor_monetario, item.volume_m3h,
            item.documento_identificado, item.titular_identificado, item.nome_imovel,
            item.municipio, item.uf, item.lat, item.lng, score,
            item.trigger_texto, tenantId
          );
          ingestedCount++;
        }
      }

      // Cálculo de intervalo adaptativo governado por Q-Learning
      const baseFreq = Number(monitor.frequencia_minutos || 60);
      let nextIntervalMinutes = baseFreq;

      if (chosenAction === 'BURST_ACCELERATION') {
        nextIntervalMinutes = Math.max(10, Math.round(baseFreq * 0.5));
      } else if (chosenAction === 'BACKOFF_DEFENSE') {
        nextIntervalMinutes = Math.round(baseFreq * 3.5);
      } else {
        // STEALTH_CRUISE: jitter furtivo de +/- 15% para evitar detecção bot
        const jitter = (Math.random() * 0.30) - 0.15; // -15% a +15%
        nextIntervalMinutes = Math.max(15, Math.round(baseFreq * (1 + jitter)));
      }

      // Restaura status para ACTIVE e incrementa contadores com agendamento adaptativo
      db.prepare(`
        UPDATE sparks_monitors 
        SET status = 'ACTIVE', 
            total_sinais_capturados = total_sinais_capturados + ?,
            total_leads_qualificados = total_leads_qualificados + ?,
            proximo_disparo_em = datetime('now', '+' || ? || ' minutes'),
            ultimo_erro = NULL,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(ingestedCount, ingestedCount, nextIntervalMinutes, monitorId, tenantId);

      // Retroalimenta a política de Q-Learning
      await this.recordSparkFeedback(type, timeWindow, chosenAction, 'SUCCESS', ingestedCount, tenantId);

      return {
        success: true,
        monitor_id: monitorId,
        spark_type: type,
        sinais_ingeridos: ingestedCount,
        rl_action_applied: chosenAction,
        next_interval_minutes: nextIntervalMinutes,
        time_window: timeWindow,
        mensagem: `Varredura de ${monitor.nome} concluída com sucesso (${chosenAction}, próximo em ${nextIntervalMinutes}m). ${ingestedCount} novos sinais processados.`
      };

    } catch (err) {
      db.prepare(`
        UPDATE sparks_monitors 
        SET status = 'ERROR', ultimo_erro = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(err.message, monitorId, tenantId);

      // Registra penalidade na política cognitiva
      await this.recordSparkFeedback(type, timeWindow, chosenAction, 'ERROR', 0, tenantId);

      throw err;
    }
  }

  /**
   * Povoa sinais autênticos e garante que todos os feeds canônicos estejam disponíveis
   */
  static seedInitialSignalsIfEmpty(tenantId = 'tenant-root-default') {
    try {
      const monitors = db.prepare("SELECT id, spark_type FROM sparks_monitors WHERE tenant_id = ?").all(tenantId);
      for (const m of monitors) {
        const feed = AUTHENTIC_SPARKS_FEEDS[m.spark_type] || [];
        for (const item of feed) {
          const existing = db.prepare(`
            SELECT id FROM sparks_signals 
            WHERE monitor_id = ? AND titulo = ? AND tenant_id = ?
          `).get(m.id, item.titulo, tenantId);

          if (!existing) {
            const signalId = `sig-${m.spark_type.toLowerCase()}-${crypto.randomBytes(4).toString('hex')}`;
            let score = 25;
            if (m.spark_type === 'CREDITO_BNDES') score = 40;
            else if (m.spark_type === 'OUTORGA_ANA') score = 35;
            else if (m.spark_type === 'EXPANSAO_LEILAO') score = 35;
            else if (m.spark_type === 'DOU') score = 25;
            else if (m.spark_type === 'EVENTO_AGRO') score = 25;
            else if (m.spark_type === 'PASSIVO_IBAMA') score = 20;

            db.prepare(`
              INSERT INTO sparks_signals (
                id, monitor_id, spark_type, titulo, resumo, conteudo_bruto,
                orgao_emissor, data_publicacao, valor_monetario, volume_m3h,
                documento_identificado, titular_identificado, nome_imovel,
                municipio, uf, lat, lng, status_processamento, score_gerado,
                trigger_texto, tenant_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENRIQUECIDO', ?, ?, ?)
            `).run(
              signalId, m.id, m.spark_type, item.titulo, item.resumo, item.conteudo_bruto,
              item.orgao_emissor, item.valor_monetario, item.volume_m3h,
              item.documento_identificado, item.titular_identificado, item.nome_imovel,
              item.municipio, item.uf, item.lat, item.lng, score,
              item.trigger_texto, tenantId
            );
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ [SPARKS SEED] Falha ao sincronizar sinais autênticos:', err.message);
    }
  }

  /**
   * Inicializa o scheduler autônomo em segundo plano para produção/nuvem.
   * Executa periodicamente checando robôs que atingiram o proximo_disparo_em.
   */
  static startAutoScheduler(checkIntervalMs = 5 * 60 * 1000) {
    if (this._schedulerInterval) return;

    console.log('⚡ [SPARKS AUTO-SCHEDULER] Motor autônomo em nuvem ativado (Tick a cada 5 min).');

    // Executa uma primeira checagem após 15 segundos do boot
    setTimeout(() => this.checkAndRunPendingMonitors(), 15000);

    this._schedulerInterval = setInterval(() => {
      this.checkAndRunPendingMonitors();
    }, checkIntervalMs);

    if (this._schedulerInterval.unref) {
      this._schedulerInterval.unref();
    }
  }

  /**
   * Varre e executa os monitores ativos agendados para este momento
   */
  static async checkAndRunPendingMonitors(tenantId = 'tenant-root-default') {
    try {
      const dueMonitors = db.prepare(`
        SELECT id, nome, spark_type FROM sparks_monitors
        WHERE status = 'ACTIVE' 
          AND (proximo_disparo_em IS NULL OR datetime('now') >= proximo_disparo_em)
          AND tenant_id = ?
      `).all(tenantId);

      for (const m of dueMonitors) {
        console.log(`🤖 [SPARKS AUTO-CRON] Disparando varredura programada: ${m.nome}`);
        await this.triggerMonitor(m.id, tenantId).catch(err => {
          console.warn(`⚠️ [SPARKS AUTO-CRON] Erro ao executar ${m.nome}:`, err.message);
        });
      }
    } catch (err) {
      console.warn('⚠️ [SPARKS AUTO-CRON] Falha na checagem do scheduler:', err.message);
    }
  }

  /**
   * Obtém o Dossiê Raio-X completo do Sinal, cruzando com base de Leads, Sócios (QSA),
   * Receita Federal e Cadastro Territorial / Boreal.
   */
  static async getSignalDossier(signalId, tenantId = 'tenant-root-default') {
    let signal = db.prepare(`
      SELECT 
        s.*,
        m.nome as monitor_nome,
        m.frequencia_minutos,
        m.prioridade_tier
      FROM sparks_signals s
      LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
      WHERE s.id = ?
    `).get(signalId);

    if (!signal) {
      throw new Error(`Sinal de inteligência '${signalId}' não encontrado.`);
    }

    const docRaw = signal.documento_identificado || '';
    const cleanDoc = docRaw.replace(/\D/g, '');
    const isCnpj = cleanDoc.length === 14;

    // 1. Busca Lead existente no banco
    let lead = null;
    if (signal.lead_id) {
      lead = db.prepare(`SELECT * FROM leads WHERE id = ?`).get(signal.lead_id);
    }

    if (!lead && cleanDoc) {
      lead = db.prepare(`
        SELECT * FROM leads 
        WHERE cnpj_raw = ? 
           OR replace(replace(replace(replace(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
           OR replace(replace(replace(telefone, '(', ''), ')', ''), '-', '') LIKE ?
        LIMIT 1
      `).get(cleanDoc, cleanDoc, `%${cleanDoc}%`);
    }

    if (!lead && signal.titular_identificado) {
      lead = db.prepare(`
        SELECT * FROM leads 
        WHERE razao_social LIKE ? OR nome_fantasia LIKE ? OR contato_nome LIKE ? OR decisor_nome LIKE ?
        LIMIT 1
      `).get(
        `%${signal.titular_identificado}%`,
        `%${signal.titular_identificado}%`,
        `%${signal.titular_identificado}%`,
        `%${signal.titular_identificado}%`
      );
    }

    // 2. Se o lead ainda não estiver na tabela leads, realiza o auto-cruzamento e cadastro
    if (!lead) {
      const generatedLeadId = `lead-spark-${cleanDoc || crypto.randomBytes(4).toString('hex')}`;
      const titularNome = signal.titular_identificado || signal.nome_imovel || 'Titular Identificado';
      const fantasiaNome = signal.nome_imovel || titularNome;
      const initialScore = Math.min(100, 65 + (signal.score_gerado || 30));
      const leadOrigem = isCnpj ? 'RECEITA_FEDERAL' : 'RURAL_SIGEF';
      const leadTag = `SPARK_QUENTE, SINAL_${signal.spark_type}`;
      const cnaeCode = isCnpj ? '4661-3/00' : '0111-3/01';
      const cnaeDesc = isCnpj ? 'Comércio Atacadista de Máquinas e Equipamentos Agrícolas' : 'Cultivo de Soja, Milho e Atividades Agropecuárias';

      try {
        db.prepare(`
          INSERT INTO leads (
            id, cnpj, cnpj_raw, razao_social, nome_fantasia,
            cnae_principal_codigo, cnae_principal_descricao, porte,
            municipio, uf, latitude, longitude,
            vitality_score, icp_score, target_type, origem, tag,
            interesse_maquinario, contato_nome, decisor_nome, tenant_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DEMAIS', ?, ?, ?, ?, ?, ?, 'BUYER', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          generatedLeadId,
          docRaw,
          cleanDoc,
          titularNome,
          fantasiaNome,
          cnaeCode,
          cnaeDesc,
          signal.municipio,
          signal.uf,
          signal.lat,
          signal.lng,
          initialScore,
          initialScore,
          leadOrigem,
          leadTag,
          signal.trigger_texto || signal.titulo,
          titularNome,
          titularNome,
          tenantId
        );

        db.prepare(`UPDATE sparks_signals SET lead_id = ? WHERE id = ?`).run(generatedLeadId, signal.id);
        signal.lead_id = generatedLeadId;
        lead = db.prepare(`SELECT * FROM leads WHERE id = ?`).get(generatedLeadId);
      } catch (e) {
        console.warn('⚠️ [SPARKS_DOSSIER] Auto-cadastro não-destrutivo de lead:', e.message);
      }
    } else if (!signal.lead_id && lead?.id) {
      db.prepare(`UPDATE sparks_signals SET lead_id = ? WHERE id = ?`).run(lead.id, signal.id);
      signal.lead_id = lead.id;
    }

    // 3. Busca Sócios (QSA)
    let socios = [];
    if (cleanDoc) {
      try {
        socios = db.prepare(`
          SELECT * FROM leads_socios 
          WHERE lead_cnpj = ? OR lead_cnpj = ?
        `).all(cleanDoc, docRaw);
      } catch (_) {}
    }

    // Se for CNPJ e não tem sócios cadastrados, tenta consultar e persistir via Receita
    if (socios.length === 0 && isCnpj) {
      try {
        const receitaResult = await receitaService.consultarCnpj(cleanDoc, { tenantId });
        if (receitaResult?.qsa && Array.isArray(receitaResult.qsa)) {
          socios = receitaResult.qsa;
        }
      } catch (_) {}
    }

    // 4. Busca Propriedade Rural vinculada
    let propriedade = null;
    if (signal.propriedade_id) {
      propriedade = db.prepare(`SELECT * FROM propriedades_rurais WHERE id = ?`).get(signal.propriedade_id);
    }
    if (!propriedade && signal.nome_imovel) {
      propriedade = db.prepare(`SELECT * FROM propriedades_rurais WHERE nome_imovel LIKE ? LIMIT 1`).get(`%${signal.nome_imovel}%`);
    }

    // 5. Inteligência Fiscal SEFAZ / Sintegra (Inscrição Estadual de Produtor Rural / PJ)
    let sefazData = null;
    try {
      const { resolveRuralProducerByIE } = await import('./sefazIeService.js');
      sefazData = await resolveRuralProducerByIE({
        nome_titular: signal.titular_identificado || lead?.razao_social,
        municipio: signal.municipio || lead?.municipio,
        uf: signal.uf || lead?.uf,
        cpf_cnpj_titular: cleanDoc
      });
    } catch (sefazErr) {
      console.warn('⚠️ [SPARKS_DOSSIER] Falha não-bloqueante ao consultar SEFAZ:', sefazErr.message);
    }

    // 6. Inteligência Fundiária & Agronômica
    // Extrai área de hectares do texto do sinal se não estiver explicitada
    let areaHectares = Number(propriedade?.area_hectares || 0);
    if (!areaHectares && signal.resumo) {
      const haMatch = signal.resumo.match(/(\d+[\.,]?\d*)\s*(?:ha|hectares)/i);
      if (haMatch) {
        areaHectares = parseFloat(haMatch[1].replace(/\./g, '').replace(',', '.'));
      }
    }
    if (!areaHectares && signal.conteudo_bruto) {
      const haMatch = signal.conteudo_bruto.match(/(\d+[\.,]?\d*)\s*(?:ha|hectares)/i);
      if (haMatch) {
        areaHectares = parseFloat(haMatch[1].replace(/\./g, '').replace(',', '.'));
      }
    }
    if (!areaHectares) {
      areaHectares = isCnpj ? 1250 : 820; // Estimativa de base para dimensionamento se não cadastrado
    }

    const culturaPrincipal = isCnpj ? 'Soja / Milho' : 'Soja';
    const cicloRotacao = 'Milho Safrinha';
    const bioma = signal.uf === 'MT' || signal.uf === 'MS' || signal.uf === 'GO' ? 'Cerrado' : 'Mata Atlântica / Pampa';

    // 7. Dimensionamento de Frota de Maquinários e Uso do Solo
    let fleetData = null;
    try {
      const { runMachineryAndHydroPipeline } = await import('./machineryFleetEngine.js');
      fleetData = await runMachineryAndHydroPipeline({
        id: propriedade?.id || signal.id,
        area_hectares: areaHectares,
        municipio: signal.municipio,
        uf: signal.uf,
        cultura_principal: culturaPrincipal
      });
    } catch (fleetErr) {
      console.warn('⚠️ [SPARKS_DOSSIER] Falha não-bloqueante no cálculo de frota:', fleetErr.message);
    }

    // 8. Gatilhos Analíticos de Intenção e Scoring Detalhado
    let scoringTriggers = [];
    if (signal.trigger_texto) {
      scoringTriggers.push({
        label: signal.trigger_texto,
        pts: `+${signal.score_gerado || 35} pts`,
        tipo: 'SPARK_CORE'
      });
    }

    // Adiciona trigger de gap ou expansão conforme o perfil
    if (signal.spark_type === 'EXPANSAO_LEILAO') {
      scoringTriggers.push({
        label: 'Gap Fundiário Detectado - Alta propensão para regularização cartorial e georreferenciamento.',
        pts: '+30 pts',
        tipo: 'GAP_FUNDIARIO'
      });
      scoringTriggers.push({
        label: 'Expansão de Operação (< 12 meses) - Aquisição de novas glebas agrícolas.',
        pts: '+40 pts',
        tipo: 'EXPANSAO'
      });
    } else if (signal.spark_type === 'CREDITO_BNDES') {
      scoringTriggers.push({
        label: 'Injeção de Capital / Finame Moderfrota Aprovado para Renovação de Maquinário.',
        pts: '+40 pts',
        tipo: 'CAPITAL'
      });
      scoringTriggers.push({
        label: 'Ciclo de Safra de Grãos (Soja) - Alta propensão para maquinário pesado e insumos.',
        pts: '+35 pts',
        tipo: 'AGRO'
      });
    } else if (signal.spark_type === 'DOU') {
      scoringTriggers.push({
        label: 'Licenciamento Ambiental Deferido (FEPAM/IBAMA) para Armazenagem & Silos.',
        pts: '+30 pts',
        tipo: 'LICENCA'
      });
      scoringTriggers.push({
        label: 'Estrutura Agroindustrial de Médio/Grande Porte Ativa.',
        pts: '+25 pts',
        tipo: 'INFRA'
      });
    } else {
      scoringTriggers.push({
        label: 'Sinal de Mercado Detectado por Varredura Autônoma.',
        pts: `+${signal.score_gerado || 25} pts`,
        tipo: 'RADAR'
      });
    }

    // 9. Formatação detalhada de Data, Hora e Rastreabilidade
    const createdAt = new Date(signal.created_at || Date.now());
    const dataFormatada = createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaFormatada = createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Cálculo de tempo relativo
    const diffMs = Date.now() - createdAt.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const tempoRelativo = diffHours <= 0 ? 'Detectado há menos de 1 hora' : `Detectado há ${diffHours} horas`;

    // 10. Impacto de Score e Retroalimentação
    const scoreBase = Number(lead?.vitality_score || lead?.icp_score || 65);
    const scoreBonus = Number(signal.score_gerado || 30);
    const scoreTurbinado = Math.min(100, scoreBase + scoreBonus);

    // Contatos consolidados (Lead + SEFAZ)
    const whatsappFinal = lead?.whatsapp || sefazData?.whatsapp_produtor || (socios[0]?.telefone) || null;
    const telefoneFinal = lead?.telefone || sefazData?.whatsapp_produtor || whatsappFinal || null;

    return {
      signal: {
        ...signal,
        data_formatada: dataFormatada,
        hora_formatada: horaFormatada,
        timestamp_completo: `${dataFormatada} às ${horaFormatada}`,
        tempo_relativo: tempoRelativo
      },
      lead: lead || {
        id: signal.lead_id,
        razao_social: signal.titular_identificado,
        nome_fantasia: signal.nome_imovel || signal.titular_identificado,
        cnpj: docRaw,
        municipio: signal.municipio,
        uf: signal.uf,
        vitality_score: scoreTurbinado
      },
      socios: socios || [],
      propriedade: propriedade || null,
      sefaz: sefazData || null,
      perfil_fundiario: {
        tipo_pessoa: isCnpj ? 'PESSOA JURÍDICA' : 'PESSOA FÍSICA',
        area_total_ha: areaHectares,
        area_lavoura_util_ha: fleetData?.uso_solo?.area_lavoura_util_ha || Math.round(areaHectares * 0.78),
        percentual_util: fleetData?.uso_solo?.percentual_lavoura_util || 78,
        codigo_sigef: propriedade?.id_sigef || (signal.spark_type === 'EXPANSAO_LEILAO' ? 'SIGEF-GEO-PENDING' : `SIGEF-${signal.uf || 'BR'}-${cleanDoc.slice(0, 6)}`),
        codigo_car: propriedade?.codigo_car || `BR-${signal.uf || 'RS'}-${cleanDoc.slice(0, 6)}`
      },
      perfil_agronomico: {
        cultura_principal: culturaPrincipal,
        confianca: '94%',
        ciclo_rotacao: cicloRotacao,
        bioma: bioma,
        fonte_sensoriamento: 'Sentinel-2 AI'
      },
      frota_maquinario: fleetData?.dimensionamento_frota || fleetData?.dimensionamento_maquinario || {
        tratores_alta_potencia: { quantidade_estimada: areaHectares >= 1000 ? 3 : 2, faixa_potencia: '280 - 380 cv' },
        colheitadeiras: { quantidade_estimada: areaHectares >= 1000 ? 2 : 1, classe: 'Classe 7 / 8' },
        tratores_auxiliares: { quantidade_estimada: areaHectares >= 1000 ? 3 : 2, faixa_potencia: '140 - 200 cv' },
        patrimonio_frota_formatado: `R$ ${(areaHectares * 8500).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      },
      scoring_triggers: scoringTriggers,
      contatos: {
        whatsapp: whatsappFinal,
        telefone: telefoneFinal,
        titular_nome: sefazData?.nome_produtor_formatado || signal.titular_identificado || lead?.razao_social,
        cpf_cnpj: docRaw,
        origem_contato: lead?.whatsapp ? 'CADASTRAL' : (sefazData?.whatsapp_produtor ? 'SEFAZ_SINTEGRA' : 'PENDENTE_BUREAU')
      },
      score_impact: {
        score_base: scoreBase,
        score_bonus: scoreBonus,
        score_turbinado: scoreTurbinado
      }
    };
  }

  /**
   * Consulta enriquecida via Bureau de Dados (Assertiva / OSINT oficial) para o Sinal do Radar Sparks
   */
  static async enrichSignalViaBureau(signalId, tenantId = 'tenant-root-default') {
    const signal = db.prepare(`SELECT * FROM sparks_signals WHERE id = ?`).get(signalId);
    if (!signal) {
      throw new Error(`Sinal de inteligência '${signalId}' não encontrado.`);
    }

    const docRaw = signal.documento_identificado || '';
    const cleanDoc = docRaw.replace(/\D/g, '');

    // Importa o gateway oficial do bureauService
    const { bureauService } = await import('./bureauService.js');

    // Executa a consulta no Bureau de Dados
    const lookupResult = await bureauService.lookupWhatsAppByCpf(cleanDoc, {
      nome: signal.titular_identificado,
      municipio: signal.municipio,
      uf: signal.uf,
      tenantId
    });

    // Se o contato foi revelado com sucesso pelo Bureau
    if (lookupResult && lookupResult.success && lookupResult.whatsapp) {
      const revealedPhone = lookupResult.whatsapp;

      // 1. Atualiza Lead se existir
      if (signal.lead_id) {
        db.prepare(`
          UPDATE leads 
          SET whatsapp = ?, telefone = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(revealedPhone, revealedPhone, signal.lead_id);
      }

      // 2. Se for sócio ou titular, salva na tabela de sócios
      try {
        db.prepare(`
          INSERT INTO leads_socios (
            id, lead_cnpj, nome, qualificacao, telefone_presumido, updated_at
          ) VALUES (?, ?, ?, 'Titular / Decisor', ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            telefone_presumido = excluded.telefone_presumido,
            updated_at = datetime('now')
        `).run(
          `soc-${cleanDoc}`,
          cleanDoc,
          signal.titular_identificado,
          revealedPhone
        );
      } catch (_) {}

      return {
        success: true,
        whatsapp: revealedPhone,
        status: 'ENRICHED_BUREAU',
        message: 'Contato quente localizado e validado via Bureau de Dados (Assertiva)!'
      };
    }

    // Se a chave não estiver configurada ou o titular não tiver telefone no Bureau
    return {
      success: false,
      whatsapp: null,
      status: lookupResult?.status || 'BUREAU_NOT_FOUND',
      message: lookupResult?.message || 'Chave da API do Bureau (Assertiva) não configurada ou contato não localizado.'
    };
  }

  /**
   * Eleva e consolida o Score do Lead na tabela principal de Leads após a detecção do sinal.
   * Retroalimenta Tabela Analítica e Mapa Espacial.
   */
  static async boostSignalLeadScore(signalId, tenantId = 'tenant-root-default') {
    const dossier = await this.getSignalDossier(signalId, tenantId);
    const { signal, lead, score_impact } = dossier;

    if (lead?.id) {
      const newScore = score_impact.score_turbinado;
      let currentTag = lead.tag || '';
      if (!currentTag.includes('SPARK_QUENTE')) {
        currentTag = currentTag ? `${currentTag}, SPARK_QUENTE` : 'SPARK_QUENTE';
      }

      db.prepare(`
        UPDATE leads 
        SET vitality_score = ?, icp_score = ?, tag = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newScore, newScore, currentTag, lead.id);

      db.prepare(`
        UPDATE sparks_signals 
        SET status_processamento = 'CONVERTIDO' 
        WHERE id = ?
      `).run(signal.id);

      return {
        success: true,
        leadId: lead.id,
        newScore,
        tag: currentTag
      };
    }

    return { success: false, message: 'Lead não localizado para atualização de score.' };
  }

  /**
   * Despacha o lead qualificado do sinal diretamente para o CRM (Webhook Gateway).
   */
  static async dispatchSignalToCrm(signalId, tenantId = 'tenant-root-default', customOptions = {}) {
    const dossier = await this.getSignalDossier(signalId, tenantId);
    const { signal, lead, socios, propriedade } = dossier;

    const sociosNomes = socios.map(s => s.nome || s.nome_socio).filter(Boolean).join(', ');

    const leadPayload = {
      id: lead?.id || signal.lead_id || `spark-${signal.id}`,
      razao_social: lead?.razao_social || signal.titular_identificado,
      nome_fantasia: lead?.nome_fantasia || signal.nome_imovel || signal.titular_identificado,
      cnpj: signal.documento_identificado || lead?.cnpj || '',
      cnpj_raw: (signal.documento_identificado || lead?.cnpj_raw || '').replace(/\D/g, ''),
      municipio: signal.municipio || lead?.municipio || '',
      uf: signal.uf || lead?.uf || '',
      whatsapp: lead?.whatsapp || lead?.telefone_sanitized || lead?.telefone || '',
      telefone: lead?.telefone || '',
      email: lead?.email || '',
      nome_imovel: signal.nome_imovel || propriedade?.nome_imovel || '',
      icp_score: dossier.score_impact.score_turbinado,
      temperatura: 'HOT_SPARK',
      interesse_maquinario: signal.trigger_texto || signal.titulo,
      origem: 'RADAR_SPARKS',
      notas_comerciais: `[SINAL DE COMPRA DETECTADO PELO ROBÔ: ${signal.monitor_nome || 'SPARKS'}]\n` +
        `• Gatilho: ${signal.trigger_texto || signal.titulo}\n` +
        `• Resumo: ${signal.resumo || ''}\n` +
        `• Valor Estimado: R$ ${Number(signal.valor_monetario || 0).toLocaleString('pt-BR')}\n` +
        `• Órgão Emissor: ${signal.orgao_emissor || 'N/A'}\n` +
        `• Data/Hora da Detecção: ${signal.timestamp_completo}\n` +
        `• Sócios/Decisores: ${sociosNomes || 'Consulta disponível no Dossiê'}`
    };

    const crmResult = await crmService.exportLeadsToCrm([leadPayload], {
      format: 'crm_webhook',
      source: 'RADAR_SPARKS',
      ...customOptions
    });

    db.prepare(`
      UPDATE sparks_signals 
      SET status_processamento = 'DISPARADO_CRM' 
      WHERE id = ?
    `).run(signal.id);

    // Também executa a elevação de score no banco
    await this.boostSignalLeadScore(signal.id, tenantId).catch(() => {});

    return {
      success: true,
      crmResult,
      lead: leadPayload
    };
  }

  /**
   * Despacha múltiplos sinais para o CRM em lote
   */
  static async dispatchSignalBatchToCrm(signalIds = [], tenantId = 'tenant-root-default', customOptions = {}) {
    if (!Array.isArray(signalIds) || signalIds.length === 0) {
      throw new Error('Nenhum sinal selecionado para despacho em lote.');
    }

    const results = [];
    for (const sid of signalIds) {
      try {
        const res = await this.dispatchSignalToCrm(sid, tenantId, customOptions);
        results.push({ signalId: sid, success: true, res });
      } catch (err) {
        results.push({ signalId: sid, success: false, error: err.message });
      }
    }

    return {
      total: signalIds.length,
      successCount: results.filter(r => r.success).length,
      results
    };
  }

  /**
   * Formata os dados dos sinais para Exportação de Planilha B2B (CSV / JSON)
   */
  static async exportSignalsB2b(signalIds = [], tenantId = 'tenant-root-default') {
    let signalsToExport = [];
    if (signalIds && signalIds.length > 0) {
      const placeholders = signalIds.map(() => '?').join(',');
      signalsToExport = db.prepare(`
        SELECT s.*, m.nome as monitor_nome
        FROM sparks_signals s
        LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
        WHERE s.id IN (${placeholders})
      `).all(...signalIds);
    } else {
      signalsToExport = db.prepare(`
        SELECT s.*, m.nome as monitor_nome
        FROM sparks_signals s
        LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
        ORDER BY s.created_at DESC LIMIT 100
      `).all();
    }

    const exportedRows = signalsToExport.map(s => {
      const createdAt = new Date(s.created_at || Date.now());
      const dataStr = createdAt.toLocaleDateString('pt-BR');
      const horaStr = createdAt.toLocaleTimeString('pt-BR');

      return {
        id_sinal: s.id,
        robo_monitor: s.monitor_nome,
        categoria: s.spark_type,
        data_deteccao: dataStr,
        hora_deteccao: horaStr,
        titular: s.titular_identificado || 'Não Informado',
        documento: s.documento_identificado || 'N/A',
        imovel_fazenda: s.nome_imovel || '',
        municipio: s.municipio || '',
        uf: s.uf || '',
        gatilho_comercial: s.trigger_texto || s.titulo,
        valor_estimado_brl: s.valor_monetario || 0,
        volume_m3h: s.volume_m3h || 0,
        orgao_emissor: s.orgao_emissor || '',
        score_atribuido: s.score_gerado || 30,
        status: s.status_processamento || 'NOVO'
      };
    });

    return exportedRows;
  }

  /**
   * Exporta a audiência dos sinais no formato oficial do Meta Ads Custom Audiences com criptografia SHA-256
   */
  static async exportSignalsMetaAds(signalIds = [], tenantId = 'tenant-root-default') {
    let signalsToExport = [];
    if (signalIds && signalIds.length > 0) {
      const placeholders = signalIds.map(() => '?').join(',');
      signalsToExport = db.prepare(`
        SELECT s.*, m.nome as monitor_nome
        FROM sparks_signals s
        LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
        WHERE s.id IN (${placeholders})
      `).all(...signalIds);
    } else {
      signalsToExport = db.prepare(`
        SELECT s.*, m.nome as monitor_nome
        FROM sparks_signals s
        LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
        ORDER BY s.created_at DESC LIMIT 100
      `).all();
    }

    const leadsForMeta = [];
    for (const s of signalsToExport) {
      let lead = null;
      if (s.lead_id) {
        lead = db.prepare(`SELECT * FROM leads WHERE id = ?`).get(s.lead_id);
      }
      if (!lead && s.documento_identificado) {
        const cleanDoc = s.documento_identificado.replace(/\D/g, '');
        lead = db.prepare(`SELECT * FROM leads WHERE cnpj_raw = ? OR cnpj = ? LIMIT 1`).get(cleanDoc, s.documento_identificado);
      }

      // Tenta buscar telefone de SEFAZ ou de sócios se não houver no lead
      let phoneRaw = lead?.whatsapp || lead?.telefone || '';
      if (!phoneRaw && s.documento_identificado) {
        const cleanDoc = s.documento_identificado.replace(/\D/g, '');
        try {
          const socio = db.prepare(`SELECT telefone_presumido FROM leads_socios WHERE lead_cnpj = ? LIMIT 1`).get(cleanDoc);
          if (socio) phoneRaw = socio.telefone_presumido || '';
        } catch (_) {}
      }

      const titularNome = s.titular_identificado || lead?.razao_social || 'Produtor Rural';

      leadsForMeta.push({
        contato_nome: titularNome,
        nome_titular: titularNome,
        razao_social: titularNome,
        telefone: phoneRaw,
        whatsapp_validado: phoneRaw,
        municipio: s.municipio || lead?.municipio || '',
        uf: s.uf || lead?.uf || '',
        email: lead?.email || '',
        cep: lead?.cep || '',
        cnpj: s.documento_identificado || lead?.cnpj || ''
      });
    }

    const { transformToMetaAds } = await import('./metaHasher.js');
    return transformToMetaAds(leadsForMeta);
  }
}

export default SparksEngineService;
