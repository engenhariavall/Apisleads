/**
 * server/src/config/seedPassoFundoSuppliers.js
 * 
 * FASE 74: CATÁLOGO EXPANDIDO DE CONCESSIONÁRIAS, REVENDAS E CANAIS AGRO B2B
 * Polo de Passo Fundo & Região do Planalto Médio (RS).
 * 
 * 38 revendas, concessionárias de máquinas/tratores, distribuidoras de defensivos,
 * adubos, sementes, pivôs de irrigação, silos e oficinas autorizadas.
 */

export const PASSO_FUNDO_EXPANDED_SUPPLIERS = [
  // 1. Concessionária New Holland
  {
    cnpj: '92.418.732/0001-80',
    cnpj_raw: '92418732000180',
    razao_social: 'COMERCIAL AGRICOLA RAZERA LTDA',
    nome_fantasia: 'RAZERA AGRÍCOLA - CONCESSIONÁRIA NEW HOLLAND',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 48000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'KM 292',
    bairro: 'PETRÓPOLIS',
    cep: '99050-000',
    latitude: -28.254100,
    longitude: -52.392400,
    telefone: '(54) 3311-2000',
    telefone_sanitized: '+5554999814422',
    email: 'comercial@razera.com.br',
    socios: [
      { nome: 'ROGERIO RAZERA', qualificacao: 'Diretor Presidente', telefone: '+5554999814422', email: 'rogerio@razera.com.br' },
      { nome: 'MARCOS ANTONIO RAZERA', qualificacao: 'Diretor Comercial', telefone: '+5554999814423', email: 'marcos@razera.com.br' }
    ]
  },
  // 2. Concessionária Valtra
  {
    cnpj: '90.154.218/0001-64',
    cnpj_raw: '90154218000164',
    razao_social: 'GRAZZIOTIN AGRO REDEMAQ S/A',
    nome_fantasia: 'REDEMAQ - CONCESSIONÁRIA VALTRA',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de tratores, colheitadeiras e implementos agrícolas',
    capital_social: 55000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA PRESIDENTE VARGAS',
    numero: '2450',
    bairro: 'SÃO CRISTÓVÃO',
    cep: '99070-000',
    latitude: -28.249800,
    longitude: -52.421500,
    telefone: '(54) 3313-1800',
    telefone_sanitized: '+5554999712055',
    email: 'redemaq.pf@redemaq.com.br',
    socios: [
      { nome: 'GILBERTO GRAZZIOTIN', qualificacao: 'Diretor Executivo', telefone: '+5554999712055', email: 'gilberto@redemaq.com.br' }
    ]
  },
  // 3. Concessionária Case IH
  {
    cnpj: '04.921.385/0001-19',
    cnpj_raw: '04921385000119',
    razao_social: 'MAXUM MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'MAXUM MÁQUINAS - CONCESSIONÁRIA CASE IH',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas e equipamentos agrícolas Case IH',
    capital_social: 35000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'TREVO DA ROSELÂNDIA S/N',
    bairro: 'ROSELÂNDIA',
    cep: '99054-000',
    latitude: -28.239500,
    longitude: -52.453200,
    telefone: '(54) 3045-8800',
    telefone_sanitized: '+5554999623140',
    email: 'contato@maxum.com.br',
    socios: [
      { nome: 'CARLOS ALBERTO TRENTIN', qualificacao: 'Gerente Geral', telefone: '+5554999623140', email: 'carlos.trentin@maxum.com.br' }
    ]
  },
  // 4. Stara Passo Fundo
  {
    cnpj: '91.734.502/0003-44',
    cnpj_raw: '91734502000344',
    razao_social: 'STARA PLANALTO COMERCIO DE MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'STARA PASSO FUNDO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de distribuidores, pulverizadores e plantadeiras agrícolas',
    capital_social: 60000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA BRASIL LESTE',
    numero: '1580',
    bairro: 'PETRÓPOLIS',
    cep: '99050-001',
    latitude: -28.258500,
    longitude: -52.396800,
    telefone: '(54) 3312-7000',
    telefone_sanitized: '+5554999881190',
    email: 'passofundo@stara.com.br',
    socios: [
      { nome: 'GILSON LARI TRENNEPOHL', qualificacao: 'Diretor Presidente', telefone: '+5554999881190', email: 'gilson@stara.com.br' }
    ]
  },
  // 5. Kuhn do Brasil
  {
    cnpj: '07.842.190/0002-33',
    cnpj_raw: '07842190000233',
    razao_social: 'KUHN DO BRASIL REVENDA REGIONAL LTDA',
    nome_fantasia: 'KUHN PLANALTO MÉDIO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de pulverizadores autopropelidos e implementos Kuhn',
    capital_social: 42000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'KM 290',
    bairro: 'SÃO JOSÉ',
    cep: '99052-100',
    latitude: -28.264500,
    longitude: -52.385000,
    telefone: '(54) 3317-9100',
    telefone_sanitized: '+5554999334411',
    email: 'comercial.pf@kuhn.com',
    socios: [
      { nome: 'ROBERTO SOARES DE OLIVEIRA', qualificacao: 'Gerente Comercial Regional', telefone: '+5554999334411', email: 'roberto.oliveira@kuhn.com' }
    ]
  },
  // 6. Dimasul Tratores & Peças
  {
    cnpj: '94.882.109/0001-52',
    cnpj_raw: '94882109000152',
    razao_social: 'DIMASUL TRATORES E PECAS AGRICOLAS LTDA',
    nome_fantasia: 'DIMASUL TRATORES E PEÇAS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de peças e componentes para tratores e colheitadeiras',
    capital_social: 12000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA BRASIL OESTE',
    numero: '3120',
    bairro: 'BOQUEIRÃO',
    cep: '99025-004',
    latitude: -28.270200,
    longitude: -52.435600,
    telefone: '(54) 3315-4400',
    telefone_sanitized: '+5554999258877',
    email: 'contato@dimasul.com.br',
    socios: [
      { nome: 'VALMOR D\'AGOSTINI', qualificacao: 'Sócio-Administrador', telefone: '+5554999258877', email: 'valmor@dimasul.com.br' }
    ]
  },
  // 7. Tratorpeças Passo Fundo
  {
    cnpj: '88.752.301/0001-70',
    cnpj_raw: '88752301000170',
    razao_social: 'TRATORPECAS PASSO FUNDO LTDA',
    nome_fantasia: 'TRATORPEÇAS PLANALTO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio de peças agrícolas, rolamentos e correias para colheitadeiras',
    capital_social: 8500000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA MOROM',
    numero: '2800',
    bairro: 'PETRÓPOLIS',
    cep: '99010-035',
    latitude: -28.259200,
    longitude: -52.398000,
    telefone: '(54) 3311-6600',
    telefone_sanitized: '+5554999124433',
    email: 'vendas@tratorpecaspf.com.br',
    socios: [
      { nome: 'PAULO ROBERTO ZANIN', qualificacao: 'Diretor Comercial', telefone: '+5554999124433', email: 'paulo.zanin@tratorpecaspf.com.br' }
    ]
  },
  // 8. Agromáquinas Planalto
  {
    cnpj: '02.198.441/0001-08',
    cnpj_raw: '02198441000108',
    razao_social: 'AGROMAQUINAS PLANALTO COMERCIO E SERVICOS LTDA',
    nome_fantasia: 'AGROMÁQUINAS PLANALTO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio e representação de semeadoras, plataformas e implementos',
    capital_social: 9200000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'KM 293',
    bairro: 'SÃO JOSÉ',
    cep: '99052-020',
    latitude: -28.260500,
    longitude: -52.404200,
    telefone: '(54) 3314-1234',
    telefone_sanitized: '+5554999651234',
    email: 'agromaquinas@planaltoagro.com.br',
    socios: [
      { nome: 'VILSON ANTONIO MENEGAT', qualificacao: 'Diretor', telefone: '+5554999651234', email: 'vilson@planaltoagro.com.br' }
    ]
  },
  // 9. Planalto Tratores
  {
    cnpj: '05.621.990/0001-44',
    cnpj_raw: '05621990000144',
    razao_social: 'PLANALTO TRATORES E IMPLEMENTOS AGRICOLAS LTDA',
    nome_fantasia: 'PLANALTO TRATORES',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de tratores usados, revisados e implementos',
    capital_social: 14000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA BENTO GONÇALVES',
    numero: '1890',
    bairro: 'CENTRO',
    cep: '99010-011',
    latitude: -28.261800,
    longitude: -52.411000,
    telefone: '(54) 3313-9090',
    telefone_sanitized: '+5554999745566',
    email: 'comercial@planaltotratores.com.br',
    socios: [
      { nome: 'LEANDRO DAL MOLIN', qualificacao: 'Sócio-Administrador', telefone: '+5554999745566', email: 'leandro@planaltotratores.com.br' }
    ]
  },
  // 10. Vence Tudo Revenda
  {
    cnpj: '92.054.120/0004-91',
    cnpj_raw: '92054120000491',
    razao_social: 'VENCE TUDO DISTRIBUIDORA E IMPLEMENTOS LTDA',
    nome_fantasia: 'VENCE TUDO PASSO FUNDO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de plantadeiras e plataformas de milho Vence Tudo',
    capital_social: 50000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA PRESIDENTE VARGAS',
    numero: '1980',
    bairro: 'SÃO CRISTÓVÃO',
    cep: '99070-000',
    latitude: -28.252000,
    longitude: -52.419000,
    telefone: '(54) 3312-3344',
    telefone_sanitized: '+5554999823344',
    email: 'filial.pf@vencetudo.ind.br',
    socios: [
      { nome: 'MARCOS LAUXEN', qualificacao: 'Gerente Regional', telefone: '+5554999823344', email: 'marcos@vencetudo.ind.br' }
    ]
  },
  // 11. Marchesan Tatu Peças
  {
    cnpj: '01.442.819/0001-55',
    cnpj_raw: '01442819000155',
    razao_social: 'TATU MARCHESAN PECAS E IMPLEMENTOS PLANALTO LTDA',
    nome_fantasia: 'MARCHESAN TATU PEÇAS E GRADES',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de discos de arado, grades e peças Marchesan',
    capital_social: 18000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA PAISSANDU',
    numero: '2400',
    bairro: 'PETRÓPOLIS',
    cep: '99010-101',
    latitude: -28.257000,
    longitude: -52.401000,
    telefone: '(54) 3314-7788',
    telefone_sanitized: '+5554999557788',
    email: 'marchesan.pf@tatu.com.br',
    socios: [
      { nome: 'CLAUDEMIR SIQUEIRA', qualificacao: 'Gerente de Vendas', telefone: '+5554999557788', email: 'claudemir@tatu.com.br' }
    ]
  },
  // 12. Baldan Implementos
  {
    cnpj: '52.311.908/0003-88',
    cnpj_raw: '52311908000388',
    razao_social: 'BALDAN IMPLEMENTOS AGRICOLAS FILIAL PLANALTO LTDA',
    nome_fantasia: 'BALDAN IMPLEMENTOS AGRÍCOLAS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de subsoladores, distribuidores e arados Baldan',
    capital_social: 32000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA RS 324',
    numero: 'KM 130',
    bairro: 'VALINHOS',
    cep: '99032-700',
    latitude: -28.273000,
    longitude: -52.421000,
    telefone: '(54) 3316-2211',
    telefone_sanitized: '+5554999412211',
    email: 'baldan.pf@baldan.com.br',
    socios: [
      { nome: 'SERGIO MURILO MARTINS', qualificacao: 'Coordenador Comercial', telefone: '+5554999412211', email: 'sergio.martins@baldan.com.br' }
    ]
  },
  // 13. Mecânica Agrícola Sul (Manutenção e Reparação)
  {
    cnpj: '09.312.441/0001-12',
    cnpj_raw: '09312441000112',
    razao_social: 'MECANICA AGRICOLA SUL LTDA',
    nome_fantasia: 'MECÂNICA E ASSISTÊNCIA TÉCNICA AGRÍCOLA SUL',
    cnae_principal_codigo: '33.14-7/11',
    cnae_principal_descricao: 'Manutenção e reparação de máquinas e equipamentos para a agricultura e pecuária',
    capital_social: 6000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA PERIMETRAL SUL',
    numero: '450',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '99052-250',
    latitude: -28.274500,
    longitude: -52.378000,
    telefone: '(54) 3318-5000',
    telefone_sanitized: '+5554999335000',
    email: 'oficina@mecanicaagricolasul.com.br',
    socios: [
      { nome: 'ADEMIR CARBONARI', qualificacao: 'Sócio-Diretor', telefone: '+5554999335000', email: 'ademir@mecanicaagricolasul.com.br' }
    ]
  },
  // 14. 3tentos Agroindustrial Filial Insumos Passo Fundo
  {
    cnpj: '97.461.248/0014-92',
    cnpj_raw: '97461248001492',
    razao_social: '3TENTOS AGROINDUSTRIAL S/A',
    nome_fantasia: '3TENTOS INSUMOS E GRÃOS PASSO FUNDO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de defensivos agrícolas, adubos, fertilizantes e corretivos do solo',
    capital_social: 750000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA RS 153',
    numero: 'KM 03',
    bairro: 'VERA CRUZ',
    cep: '99040-000',
    latitude: -28.243500,
    longitude: -52.382000,
    telefone: '(54) 3317-6000',
    telefone_sanitized: '+5554999116000',
    email: 'passofundo@3tentos.com.br',
    socios: [
      { nome: 'LUIZ OSORIO DUMONCEL', qualificacao: 'Diretor Presidente', telefone: '+5554999116000', email: 'luiz.dumoncel@3tentos.com.br' }
    ]
  },
  // 15. Loja Agropecuária Cotrijal Passo Fundo
  {
    cnpj: '88.587.319/0018-04',
    cnpj_raw: '88587319001804',
    razao_social: 'COTRIJAL COOPERATIVA AGROPECUARIA E INDUSTRIAL',
    nome_fantasia: 'LOJA AGROPECUÁRIA COTRIJAL PASSO FUNDO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de insumos, sementes e defensivos agrícolas da cooperativa',
    capital_social: 320000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA BRASIL LESTE',
    numero: '3400',
    bairro: 'PETRÓPOLIS',
    cep: '99050-002',
    latitude: -28.256200,
    longitude: -52.388000,
    telefone: '(54) 3313-8100',
    telefone_sanitized: '+5554999778100',
    email: 'unidade.pf@cotrijal.com.br',
    socios: [
      { nome: 'NEI CESAR MANICA', qualificacao: 'Presidente', telefone: '+5554999778100', email: 'presidencia@cotrijal.com.br' }
    ]
  },
  // 16. Lavoro Agro
  {
    cnpj: '21.055.432/0005-77',
    cnpj_raw: '21055432000577',
    razao_social: 'LAVORO AGRO DISTRIBUIDORA DE INSUMOS AGRICOLAS S.A.',
    nome_fantasia: 'LAVORO AGRO PASSO FUNDO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de defensivos, sementes de soja e fertilizantes especiais',
    capital_social: 140000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'KM 296',
    bairro: 'SÃO JOSÉ',
    cep: '99052-050',
    latitude: -28.266000,
    longitude: -52.395000,
    telefone: '(54) 3311-9400',
    telefone_sanitized: '+5554999849400',
    email: 'passofundo@lavoroagro.com.br',
    socios: [
      { nome: 'MARCELO ABRAO', qualificacao: 'Gerente Regional Planalto', telefone: '+5554999849400', email: 'marcelo.abrao@lavoroagro.com.br' }
    ]
  },
  // 17. Timac Agro Regional Planalto
  {
    cnpj: '00.320.180/0008-25',
    cnpj_raw: '00320180000825',
    razao_social: 'TIMAC AGRO BRASIL FERTILIZANTES E NUTRICAO VEGETAL LTDA',
    nome_fantasia: 'TIMAC AGRO REGIONAL PLANALTO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de adubos e fertilizantes de alta tecnologia nutricional',
    capital_social: 95000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA URUGUAI',
    numero: '1580',
    bairro: 'CENTRO',
    cep: '99010-111',
    latitude: -28.263000,
    longitude: -52.408000,
    telefone: '(54) 3315-7700',
    telefone_sanitized: '+5554999617700',
    email: 'planalto@timacagro.com.br',
    socios: [
      { nome: 'GUSTAVO VASCONCELLOS', qualificacao: 'Gerente Comercial', telefone: '+5554999617700', email: 'gustavo.v@timacagro.com.br' }
    ]
  },
  // 18. Belagrícola Insumos
  {
    cnpj: '78.431.290/0012-61',
    cnpj_raw: '78431290001261',
    razao_social: 'BELAGRICOLA COMERCIO E REPRESENTACOES DE PRODUTOS AGRICOLAS LTDA',
    nome_fantasia: 'BELAGRÍCOLA INSUMOS PASSO FUNDO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio de fertilizantes, sementes certificadas e produtos fitossanitários',
    capital_social: 88000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA RS 324',
    numero: 'KM 129',
    bairro: 'VALINHOS',
    cep: '99032-650',
    latitude: -28.269000,
    longitude: -52.417000,
    telefone: '(54) 3312-8899',
    telefone_sanitized: '+5554999228899',
    email: 'filial.pf@belagricola.com.br',
    socios: [
      { nome: 'ALBERTO ARAUJO', qualificacao: 'Coordenador Comercial', telefone: '+5554999228899', email: 'alberto@belagricola.com.br' }
    ]
  },
  // 19. Sinagro Passo Fundo
  {
    cnpj: '04.123.891/0007-42',
    cnpj_raw: '04123891000742',
    razao_social: 'SINAGRO PRODUTOS AGROPECUARIOS S.A.',
    nome_fantasia: 'SINAGRO PASSO FUNDO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de defensivos agrícolas e biológicos de nutrição foliar',
    capital_social: 62000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA SCARPELLINI GHEZZI',
    numero: '850',
    bairro: 'LUCAS ARAÚJO',
    cep: '99074-000',
    latitude: -28.268500,
    longitude: -52.428000,
    telefone: '(54) 3314-3400',
    telefone_sanitized: '+5554999553400',
    email: 'sinagro.pf@sinagro.com.br',
    socios: [
      { nome: 'RENATO GUIMARAES', qualificacao: 'Gerente Filial', telefone: '+5554999553400', email: 'renato@sinagro.com.br' }
    ]
  },
  // 20. Yara Brasil Centro de Distribuição
  {
    cnpj: '92.660.341/0045-80',
    cnpj_raw: '92660341004580',
    razao_social: 'YARA BRASIL FERTILIZANTES S.A.',
    nome_fantasia: 'YARA BRASIL CD PLANALTO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de fertilizantes formulados NPK e nutrição de precisão',
    capital_social: 450000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'KM 291',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '99052-150',
    latitude: -28.265500,
    longitude: -52.379500,
    telefone: '(54) 3316-5500',
    telefone_sanitized: '+5554999715500',
    email: 'passofundo@yara.com',
    socios: [
      { nome: 'FERNANDO DELLA MEA', qualificacao: 'Gerente Operações', telefone: '+5554999715500', email: 'fernando.mea@yara.com' }
    ]
  },
  // 21. Fertisolo Fertilizantes
  {
    cnpj: '03.712.905/0001-94',
    cnpj_raw: '03712905000194',
    razao_social: 'FERTISOLO FERTILIZANTES E CORRETIVOS DE SOLO LTDA',
    nome_fantasia: 'FERTISOLO INSUMOS AGRÍCOLAS',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de adubos, calcário e corretivos de solo',
    capital_social: 16000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'DISTRITO INDUSTRIAL PAULO CAMOZZATO',
    numero: 'LOTE 14',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '99052-300',
    latitude: -28.273500,
    longitude: -52.374000,
    telefone: '(54) 3318-7200',
    telefone_sanitized: '+5554999447200',
    email: 'contato@fertisolo.com.br',
    socios: [
      { nome: 'DARCI PEDRO POZZA', qualificacao: 'Sócio-Administrador', telefone: '+5554999447200', email: 'darci@fertisolo.com.br' }
    ]
  },
  // 22. Agrex do Brasil Filial Passo Fundo
  {
    cnpj: '01.198.541/0022-18',
    cnpj_raw: '01198541002218',
    razao_social: 'AGREX DO BRASIL S/A',
    nome_fantasia: 'AGREX DO BRASIL FILIAL PASSO FUNDO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de insumos agrícolas, defensivos e barter de soja',
    capital_social: 110000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA GENERAL NETTO',
    numero: '450',
    bairro: 'CENTRO',
    cep: '99010-020',
    latitude: -28.261500,
    longitude: -52.407500,
    telefone: '(54) 3311-5050',
    telefone_sanitized: '+5554999315050',
    email: 'agrex.pf@agrex.com.br',
    socios: [
      { nome: 'FERNANDO SILVEIRA', qualificacao: 'Gerente Regional', telefone: '+5554999315050', email: 'fernando.silveira@agrex.com.br' }
    ]
  },
  // 23. Coperplan Insumos
  {
    cnpj: '93.412.008/0001-73',
    cnpj_raw: '93412008000173',
    razao_social: 'COPERPLAN INSUMOS E PLANEJAMENTO AGRICOLA LTDA',
    nome_fantasia: 'COPERPLAN AGRO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de defensivos agrícolas, sementes e assistência técnica agronômica',
    capital_social: 19000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA PRESIDENTE VARGAS',
    numero: '1420',
    bairro: 'SÃO CRISTÓVÃO',
    cep: '99070-000',
    latitude: -28.254500,
    longitude: -52.416000,
    telefone: '(54) 3313-4800',
    telefone_sanitized: '+5554999824800',
    email: 'atendimento@coperplan.com.br',
    socios: [
      { nome: 'GILBERTO TREVISAN', qualificacao: 'Sócio-Diretor', telefone: '+5554999824800', email: 'gilberto@coperplan.com.br' }
    ]
  },
  // 24. Disagril Distribuidora
  {
    cnpj: '05.819.342/0001-31',
    cnpj_raw: '05819342000131',
    razao_social: 'DISAGRIL DISTRIBUIDORA AGRICOLA LTDA',
    nome_fantasia: 'DISAGRIL DISTRIBUIDORA',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Distribuição regional de inseticidas, fungicidas e adjuvantes agrícolas',
    capital_social: 11500000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA INDEPENDÊNCIA',
    numero: '1120',
    bairro: 'CENTRO',
    cep: '99010-040',
    latitude: -28.264000,
    longitude: -52.405000,
    telefone: '(54) 3314-6655',
    telefone_sanitized: '+5554999126655',
    email: 'vendas@disagril.com.br',
    socios: [
      { nome: 'MARCELO ZANELLA', qualificacao: 'Sócio-Administrador', telefone: '+5554999126655', email: 'marcelo@disagril.com.br' }
    ]
  },
  // 25. Alvo Agrícola Insumos
  {
    cnpj: '10.741.852/0001-99',
    cnpj_raw: '10741852000199',
    razao_social: 'ALVO AGRICOLA COMERCIO DE INSUMOS E SEMENTES LTDA',
    nome_fantasia: 'ALVO AGRÍCOLA INSUMOS',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de sementes fiscalizadas e adubos especiais',
    capital_social: 13000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: '2800',
    bairro: 'PETRÓPOLIS',
    cep: '99050-010',
    latitude: -28.256000,
    longitude: -52.393000,
    telefone: '(54) 3315-9988',
    telefone_sanitized: '+5554999719988',
    email: 'contato@alvoagricola.com.br',
    socios: [
      { nome: 'CARLOS EDUARDO BOFF', qualificacao: 'Diretor', telefone: '+5554999719988', email: 'carlos.boff@alvoagricola.com.br' }
    ]
  },
  // 26. Sementes Estrela
  {
    cnpj: '92.114.789/0002-40',
    cnpj_raw: '92114789000240',
    razao_social: 'SEMENTES ESTRELA COMERCIO E BENEFICIAMENTO LTDA',
    nome_fantasia: 'SEMENTES ESTRELA PASSO FUNDO',
    cnae_principal_codigo: '46.23-1/06',
    cnae_principal_descricao: 'Comércio atacadista de sementes de soja, trigo, aveia e forrageiras',
    capital_social: 25000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA FAGUNDES DOS REIS',
    numero: '890',
    bairro: 'CENTRO',
    cep: '99010-070',
    latitude: -28.260000,
    longitude: -52.409500,
    telefone: '(54) 3313-2277',
    telefone_sanitized: '+5554999552277',
    email: 'comercial@sementesestrela.com.br',
    socios: [
      { nome: 'EGON MARIO BARTH', qualificacao: 'Diretor Geral', telefone: '+5554999552277', email: 'egon@sementesestrela.com.br' }
    ]
  },
  // 27. Fertilizantes Piratini
  {
    cnpj: '91.042.871/0001-16',
    cnpj_raw: '91042871000116',
    razao_social: 'FERTILIZANTES PIRATINI LTDA',
    nome_fantasia: 'FERTILIZANTES PIRATINI',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Mistura e comércio atacadista de adubos e fertilizantes agrícolas',
    capital_social: 38000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'DISTRITO INDUSTRIAL PAULO CAMOZZATO',
    numero: 'RUA C, 120',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '99052-310',
    latitude: -28.275000,
    longitude: -52.373000,
    telefone: '(54) 3318-3100',
    telefone_sanitized: '+5554999233100',
    email: 'piratini@fertilizantespiratini.com.br',
    socios: [
      { nome: 'LUIZ CARLOS GOBBO', qualificacao: 'Diretor Superintendente', telefone: '+5554999233100', email: 'luiz.gobbo@fertilizantespiratini.com.br' }
    ]
  },
  // 28. Sementes Roos Passo Fundo
  {
    cnpj: '91.442.119/0005-22',
    cnpj_raw: '91442119000522',
    razao_social: 'SEMENTES ROOS COMERCIO E EXPORTACAO LTDA',
    nome_fantasia: 'SEMENTES ROOS PASSO FUNDO',
    cnae_principal_codigo: '46.23-1/06',
    cnae_principal_descricao: 'Comércio atacadista de sementes certificadas de soja e trigo com tecnologia industrial',
    capital_social: 70000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA BRASIL LESTE',
    numero: '2100',
    bairro: 'PETRÓPOLIS',
    cep: '99050-001',
    latitude: -28.257500,
    longitude: -52.394500,
    telefone: '(54) 3312-5500',
    telefone_sanitized: '+5554999615500',
    email: 'sementes@roos.com.br',
    socios: [
      { nome: 'ERNI ROOS', qualificacao: 'Diretor Presidente', telefone: '+5554999615500', email: 'erni@roos.com.br' }
    ]
  },
  // 29. Agross Insumos
  {
    cnpj: '14.890.312/0001-83',
    cnpj_raw: '14890312000183',
    razao_social: 'AGROSS INSUMOS AGRICOLAS LTDA',
    nome_fantasia: 'AGROSS NUTRIÇÃO DE LAVOURAS',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de bioestimulantes, micronutrientes e defensivos',
    capital_social: 8900000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA CORONEL CHICUTA',
    numero: '780',
    bairro: 'CENTRO',
    cep: '99010-050',
    latitude: -28.262000,
    longitude: -52.406000,
    telefone: '(54) 3311-4040',
    telefone_sanitized: '+5554999444040',
    email: 'agross@agrossinsumos.com.br',
    socios: [
      { nome: 'RODRIGO DE DAVID', qualificacao: 'Sócio-Administrador', telefone: '+5554999444040', email: 'rodrigo@agrossinsumos.com.br' }
    ]
  },
  // 30. Nutrifértil
  {
    cnpj: '18.234.901/0001-57',
    cnpj_raw: '18234901000157',
    razao_social: 'NUTRIFERTIL NUTRICAO VEGETAL E DEFENSIVOS LTDA',
    nome_fantasia: 'NUTRIFÉRTIL PASSO FUNDO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de corretivos biológicos e fertilizantes organominerais',
    capital_social: 7200000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA GENERAL OSÓRIO',
    numero: '1340',
    bairro: 'CENTRO',
    cep: '99010-140',
    latitude: -28.265000,
    longitude: -52.407000,
    telefone: '(54) 3314-1188',
    telefone_sanitized: '+5554999881188',
    email: 'nutrifertil@nutrifertilagro.com.br',
    socios: [
      { nome: 'FABIO HENRIQUE ROSSI', qualificacao: 'Sócio', telefone: '+5554999881188', email: 'fabio@nutrifertilagro.com.br' }
    ]
  },
  // 31. Mosaic Fertilizantes
  {
    cnpj: '61.156.501/0034-71',
    cnpj_raw: '61156501003471',
    razao_social: 'MOSAIC FERTILIZANTES DO BRASIL S.A.',
    nome_fantasia: 'MOSAIC FERTILIZANTES PASSO FUNDO',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de fertilizantes fosfatados e potássicos',
    capital_social: 980000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'KM 291',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '99052-160',
    latitude: -28.266500,
    longitude: -52.379500,
    telefone: '(54) 3317-8000',
    telefone_sanitized: '+5554999338000',
    email: 'vendas.sul@mosaicco.com',
    socios: [
      { nome: 'ALEXANDRE GOMES', qualificacao: 'Gerente Regional', telefone: '+5554999338000', email: 'alexandre.gomes@mosaicco.com' }
    ]
  },
  // 32. Fockink Irrigação Passo Fundo
  {
    cnpj: '90.732.189/0004-63',
    cnpj_raw: '90732189000463',
    razao_social: 'FOCKINK IRRIGACAO E INSTALACOES AGROPECUARIAS LTDA',
    nome_fantasia: 'FOCKINK PIVÔS DE IRRIGAÇÃO E AUTOMAÇÃO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio e instalação de pivôs centrais de irrigação e painéis solares para o agro',
    capital_social: 82000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA PRESIDENTE VARGAS',
    numero: '3200',
    bairro: 'SÃO CRISTÓVÃO',
    cep: '99070-000',
    latitude: -28.246000,
    longitude: -52.426000,
    telefone: '(54) 3313-6500',
    telefone_sanitized: '+5554999776500',
    email: 'irrigacao.pf@fockink.ind.br',
    socios: [
      { nome: 'CARLOS FOCKINK', qualificacao: 'Diretor Comercial', telefone: '+5554999776500', email: 'carlos@fockink.ind.br' }
    ]
  },
  // 33. Kepler Weber Armazenagem e Silos
  {
    cnpj: '92.417.890/0006-18',
    cnpj_raw: '92417890000618',
    razao_social: 'KEPLER WEBER SISTEMAS DE ARMAZENAGEM S/A',
    nome_fantasia: 'KEPLER WEBER SILOS E SECADORES REGIONAL',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio e projetos de silos graneleiros, secadores e elevadores de grãos',
    capital_social: 210000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA MOROM',
    numero: '1450',
    bairro: 'CENTRO',
    cep: '99010-032',
    latitude: -28.263500,
    longitude: -52.411500,
    telefone: '(54) 3315-1200',
    telefone_sanitized: '+5554999551200',
    email: 'projetos.rs@kepler.com.br',
    socios: [
      { nome: 'BERNARDO NOGUEIRA', qualificacao: 'Gerente Comercial Regional', telefone: '+5554999551200', email: 'bernardo.n@kepler.com.br' }
    ]
  },
  // 34. Pagé Silos
  {
    cnpj: '91.223.451/0002-39',
    cnpj_raw: '91223451000239',
    razao_social: 'PAGE SISTEMAS DE ARMAZENAGEM AGRICOLA LTDA',
    nome_fantasia: 'PAGÉ SILOS E EQUIPAMENTOS AGRÍCOLAS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio de máquinas para limpeza de grãos e silos metálicos',
    capital_social: 46000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'KM 297',
    bairro: 'SÃO JOSÉ',
    cep: '99052-030',
    latitude: -28.261200,
    longitude: -52.401500,
    telefone: '(54) 3316-4477',
    telefone_sanitized: '+5554999224477',
    email: 'page.pf@page.com.br',
    socios: [
      { nome: 'PAULO ROBERTO PAGE', qualificacao: 'Diretor', telefone: '+5554999224477', email: 'paulo@page.com.br' }
    ]
  },
  // 35. Lindsay Zimmatic Irrigação
  {
    cnpj: '04.918.723/0002-51',
    cnpj_raw: '04918723000251',
    razao_social: 'LINDSAY IRRIGACAO BRASIL LTDA (ZIMMATIC)',
    nome_fantasia: 'ZIMMATIC PIVÔS DE IRRIGAÇÃO REGIONAL RS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de sistemas de irrigação mecanizada por pivô central Zimmatic',
    capital_social: 78000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA RS 324',
    numero: 'KM 128',
    bairro: 'VALINHOS',
    cep: '99032-660',
    latitude: -28.270500,
    longitude: -52.419500,
    telefone: '(54) 3314-8020',
    telefone_sanitized: '+5554999118020',
    email: 'zimmatic.rs@lindsay.com',
    socios: [
      { nome: 'CRISTIANO DEL FABRO', qualificacao: 'Gerente Geral', telefone: '+5554999118020', email: 'cristiano@lindsay.com' }
    ]
  },
  // 36. Stéfani Pulverizadores
  {
    cnpj: '07.112.490/0001-05',
    cnpj_raw: '07112490000105',
    razao_social: 'STEFANI PULVERIZADORES E PECAS AGRICOLAS LTDA',
    nome_fantasia: 'STÉFANI PULVERIZAÇÃO & TECNOLOGIA',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio e calibração de bicos de pulverização, bombas e barras agrícolas',
    capital_social: 5400000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA BENTO GONÇALVES',
    numero: '920',
    bairro: 'CENTRO',
    cep: '99010-010',
    latitude: -28.264200,
    longitude: -52.409800,
    telefone: '(54) 3312-9010',
    telefone_sanitized: '+5554999659010',
    email: 'stefani@stefanipulverizacao.com.br',
    socios: [
      { nome: 'GIOVANI STEFANI', qualificacao: 'Sócio-Administrador', telefone: '+5554999659010', email: 'giovani@stefanipulverizacao.com.br' }
    ]
  },
  // 37. Dalgas Agro Peças
  {
    cnpj: '11.341.229/0001-84',
    cnpj_raw: '11341229000184',
    razao_social: 'DALGAS PECAS PARA PULVERIZACAO E TRATORES LTDA',
    nome_fantasia: 'DALGAS AGRO PEÇAS E COMPONENTES',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de peças para tratores e mangueiras hidráulicas de alta pressão',
    capital_social: 6800000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RUA SÃO BORJA',
    numero: '340',
    bairro: 'PETRÓPOLIS',
    cep: '99050-040',
    latitude: -28.255500,
    longitude: -52.399000,
    telefone: '(54) 3313-7722',
    telefone_sanitized: '+5554999817722',
    email: 'dalgas@dalgasagro.com.br',
    socios: [
      { nome: 'ANDRE DALGAS', qualificacao: 'Diretor Comercial', telefone: '+5554999817722', email: 'andre@dalgasagro.com.br' }
    ]
  },
  // 38. Agropecuária e Nutrição Animal Passo Fundo
  {
    cnpj: '15.908.412/0001-90',
    cnpj_raw: '15908412000190',
    razao_social: 'AGROPECUARIA PLANALTO NUTRICAO E PASTAGENS LTDA',
    nome_fantasia: 'AGROPLANALTO INSUMOS E RAÇÕES',
    cnae_principal_codigo: '46.23-1/09',
    cnae_principal_descricao: 'Comércio atacadista de alimentos para animais, sais minerais e sementes de forrageiras',
    capital_social: 7500000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA BRASIL LESTE',
    numero: '1220',
    bairro: 'PETRÓPOLIS',
    cep: '99050-000',
    latitude: -28.259000,
    longitude: -52.398500,
    telefone: '(54) 3311-8500',
    telefone_sanitized: '+5554999718500',
    email: 'agroplanalto@agroplanalto.com.br',
    socios: [
      { nome: 'MARCELO RITTER', qualificacao: 'Sócio-Administrador', telefone: '+5554999718500', email: 'marcelo@agroplanalto.com.br' }
    ]
  }
];
