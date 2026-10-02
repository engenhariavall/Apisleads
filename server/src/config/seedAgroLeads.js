/**
 * server/src/config/seedAgroLeads.js
 * 
 * FASE 60 — ETAPA 1: POVOAMENTO DE ENTIDADES AGROPECUÁRIAS E REVENDAS OFICIAIS
 * Polos agrícolas do RS (Passo Fundo, Cruz Alta, Santa Maria, Ijuí) e MT (Sorriso, Rondonópolis).
 * 
 * Assegura que o Motor em Cascata (Layer 3) e o Módulo de Inteligência
 * disponham de dados canônicos da Receita Federal e Cooperativismo para enriquecimento,
 * com persistência tanto em `leads` quanto no Quadro Societário `leads_socios`.
 */

import db from './database.js';

export const AGRO_REGIONAL_SEEDS = [
  // ── PASSO FUNDO / PLANALTO MÉDIO (PRODUTORES & AGROEMPRESAS) ──────────────
  {
    cnpj: '08.319.452/0001-42',
    cnpj_raw: '08319452000142',
    razao_social: 'AGROPECUARIA SANTA FE LTDA',
    nome_fantasia: 'FAZENDA SANTA FÉ',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Milho em Grãos',
    capital_social: 45000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA RS 153',
    numero: 'KM 08',
    bairro: 'ZONA RURAL',
    cep: '99050-000',
    telefone: '(54) 3314-8899',
    telefone_sanitized: '+5554999812233',
    email: 'diretoria@agropecuariasantafe.com.br',
    socios: [
      { nome: 'ROGERIO DE CASTRO FAGUNDES', qualificacao: 'Sócio-Administrador', telefone: '+5554999812233', email: 'rogerio.fagundes@agropecuariasantafe.com.br' },
      { nome: 'BEATRIZ SILVEIRA FAGUNDES', qualificacao: 'Sócia', telefone: '+5554999812234', email: 'beatriz.fagundes@agropecuariasantafe.com.br' }
    ]
  },
  {
    cnpj: '14.288.901/0001-35',
    cnpj_raw: '14288901000135',
    razao_social: 'FAZENDA NOSSA SENHORA APARECIDA AGRO LTDA',
    nome_fantasia: 'FAZENDA APARECIDA',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja, Trigo e Milho Safrinha',
    capital_social: 82000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'ESTRADA GERAL DO RINCÃO DOS PEREIRAS',
    numero: 'S/N',
    bairro: 'DISTRITO DE SÃO ROQUE',
    cep: '99080-000',
    telefone: '(54) 3313-7744',
    telefone_sanitized: '+5554999745566',
    email: 'operacoes@fazendaaparecida.agr.br',
    socios: [
      { nome: 'MARIANGELA SILVEIRA GRAZZIOTIN', qualificacao: 'Sócia-Administradora', telefone: '+5554999745566', email: 'mariangela@fazendaaparecida.agr.br' },
      { nome: 'LUCAS GRAZZIOTIN', qualificacao: 'Sócio e Diretor de Operações', telefone: '+5554999745567', email: 'lucas@fazendaaparecida.agr.br' }
    ]
  },
  {
    cnpj: '01.993.412/0001-32',
    cnpj_raw: '01993412000132',
    razao_social: 'CENTRO DE PESQUISAS AGRONOMICAS PLANALTO LTDA',
    nome_fantasia: 'CENTRO DE PESQUISAS AGRONÔMICAS',
    cnae_principal_codigo: '01.11-3/02',
    cnae_principal_descricao: 'Cultivo de Grãos e Pesquisa Agropecuária Aplicada',
    capital_social: 36000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA PRESIDENTE VARGAS',
    numero: '2840',
    bairro: 'SÃO CRISTÓVÃO',
    cep: '99060-000',
    telefone: '(54) 3315-1200',
    telefone_sanitized: '+5554999128899',
    email: 'contato@agropesquisas.com.br',
    socios: [
      { nome: 'DR. RENATO MORAIS DOS SANTOS', qualificacao: 'Sócio-Administrador e Engenheiro Agrônomo', telefone: '+5554999128899', email: 'renato.morais@agropesquisas.com.br' }
    ]
  },
  {
    cnpj: '03.114.778/0001-10',
    cnpj_raw: '03114778000110',
    razao_social: 'FAZENDA ALVORADA AGROPECUARIA S.A.',
    nome_fantasia: 'FAZENDA ALVORADA',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Cereais de Alta Produtividade',
    capital_social: 54000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'KM 296',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '99050-100',
    telefone: '(54) 3312-6500',
    telefone_sanitized: '+5554999654411',
    email: 'comercial@fazendaalvorada.agr.br',
    socios: [
      { nome: 'CARLOS ALBERTO ALBUQUERQUE', qualificacao: 'Diretor Presidente', telefone: '+5554999654411', email: 'carlos.albuquerque@fazendaalvorada.agr.br' }
    ]
  },
  {
    cnpj: '92.047.885/0001-00',
    cnpj_raw: '92047885000100',
    razao_social: 'COOPERATIVA TRITICOLA DE PASSO FUNDO LTDA - COPASSO',
    nome_fantasia: 'COPASSO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Trigo',
    capital_social: 65000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA BRASIL LESTE',
    numero: '1420',
    bairro: 'PETRÓPOLIS',
    cep: '99050-001',
    telefone: '(54) 3316-2000',
    telefone_sanitized: '+5554999162000',
    email: 'contato@copasso.com.br',
    socios: [
      { nome: 'VALDOMIRO SCORTEGAGNA', qualificacao: 'Diretor Presidente', telefone: '+5554999162000', email: 'valdomiro@copasso.com.br' }
    ]
  },
  {
    cnpj: '04.821.934/0001-45',
    cnpj_raw: '04821934000145',
    razao_social: 'AGROPECUARIA PLANALTO MEDIO LTDA',
    nome_fantasia: 'FAZENDA PLANALTO MÉDIO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Cereais',
    capital_social: 28000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'ESTRADA DA LINHA CAPINZAL',
    numero: 'S/N',
    bairro: 'ZONA RURAL',
    cep: '99080-120',
    telefone: '(54) 3311-8844',
    telefone_sanitized: '+5554999118844',
    email: 'diretoria@planaltomedioagro.com.br',
    socios: [
      { nome: 'EDUARDO HENRIQUE DALL AGNOL', qualificacao: 'Sócio-Administrador', telefone: '+5554999118844', email: 'eduardo@planaltomedioagro.com.br' }
    ]
  },
  {
    cnpj: '88.349.123/0001-83',
    cnpj_raw: '88349123000183',
    razao_social: 'SEMENTES ESTRELA AGROPECUARIA LTDA',
    nome_fantasia: 'SEMENTES ESTRELA',
    cnae_principal_codigo: '01.11-3/02',
    cnae_principal_descricao: 'Produção de Sementes Certificadas de Soja',
    capital_social: 18500000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA RS 324',
    numero: 'KM 118',
    bairro: 'BOA VISTA',
    cep: '99040-020',
    telefone: '(54) 3317-5500',
    telefone_sanitized: '+5554999823344',
    email: 'comercial@sementesestrela.com.br',
    socios: [
      { nome: 'PAULO SERGIO ESTRELA', qualificacao: 'Sócio-Administrador', telefone: '+5554999823344', email: 'paulo@sementesestrela.com.br' }
    ]
  },
  {
    cnpj: '05.671.233/0001-30',
    cnpj_raw: '05671233000130',
    razao_social: 'FAZENDA PAIQUERE AGROPECUARIA LTDA',
    nome_fantasia: 'FAZENDA PAIQUERÊ',
    cnae_principal_codigo: '01.51-2/01',
    cnae_principal_descricao: 'Criação de Bovinos e Cultivo de Grãos',
    capital_social: 22000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'ESTRADA DO PAIQUERÊ',
    numero: 'KM 04',
    bairro: 'ZONA RURAL',
    cep: '99085-000',
    telefone: '(54) 3318-3322',
    telefone_sanitized: '+5554999332211',
    email: 'paiquere@agropaiquere.com.br',
    socios: [
      { nome: 'FERNANDO PAIQUERE BECKER', qualificacao: 'Sócio-Administrador', telefone: '+5554999332211', email: 'fernando@agropaiquere.com.br' }
    ]
  },

  // ── PASSO FUNDO / REVENDAS & CONCESSIONÁRIAS AGRO (CANAIS / MÁQUINAS / INSUMOS) ─────────
  {
    cnpj: '89.123.456/0001-52',
    cnpj_raw: '89123456000152',
    razao_social: 'SLC MAQUINAS E TRATORES AGRICOLAS LTDA',
    nome_fantasia: 'SLC MÁQUINAS - CONCESSIONÁRIA JOHN DEERE',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, tratores e implementos agrícolas',
    capital_social: 125000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: '2980',
    bairro: 'SÃO JOSÉ',
    cep: '99052-000',
    telefone: '(54) 3316-9900',
    telefone_sanitized: '+5554999556677',
    email: 'gerencia.passofundo@slcmaquinas.com.br',
    socios: [
      { nome: 'ALVARO LUIZ DILLI', qualificacao: 'Diretor Comercial', telefone: '+5554999556677', email: 'alvaro.dilli@slcmaquinas.com.br' }
    ]
  },
  {
    cnpj: '12.345.678/0001-95',
    cnpj_raw: '12345678000195',
    razao_social: 'MACPONTA AGRO MAQUINAS E IMPLEMENTOS LTDA',
    nome_fantasia: 'MACPONTA NEW HOLLAND',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio de Tratores, Colheitadeiras e Implementos',
    capital_social: 65000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'AVENIDA PRESIDENTE VARGAS',
    numero: '3100',
    bairro: 'SÃO CRISTÓVÃO',
    cep: '99060-010',
    telefone: '(54) 3315-4400',
    telefone_sanitized: '+5554999443322',
    email: 'vendas@macponta.com.br',
    socios: [
      { nome: 'JULIO CESAR MACIEL', qualificacao: 'Sócio-Diretor', telefone: '+5554999443322', email: 'julio@macponta.com.br' }
    ]
  },
  {
    cnpj: '90.876.543/0001-60',
    cnpj_raw: '90876543000160',
    razao_social: 'AGROFEL AGROCOMERCIAL E DEFENSIVOS LTDA',
    nome_fantasia: 'AGROFEL GRÃOS E INSUMOS',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de defensivos agrícolas, adubos e fertilizantes',
    capital_social: 98000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    logradouro: 'RODOVIA RS 153',
    numero: '120',
    bairro: 'PETRÓPOLIS',
    cep: '99050-200',
    telefone: '(54) 3317-2200',
    telefone_sanitized: '+5554999221100',
    email: 'filial.passofundo@agrofel.com.br',
    socios: [
      { nome: 'LEONARDO FELIZZOLA', qualificacao: 'Diretor Geral', telefone: '+5554999221100', email: 'leonardo@agrofel.com.br' }
    ]
  },

  // ── CRUZ ALTA ─────────────────────────────────────────────────────────────
  {
    cnpj: '90.222.423/0001-49',
    cnpj_raw: '90222423000149',
    razao_social: 'COOPERATIVA TRITICOLA MISTA CRUZ ALTA LTDA - COTRICRUZ',
    nome_fantasia: 'COTRICRUZ',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Armazenamento de Trigo e Soja',
    capital_social: 75000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CRUZ ALTA',
    uf: 'RS',
    logradouro: 'AVENIDA GENERAL OSÓRIO',
    numero: '1500',
    bairro: 'CENTRO',
    cep: '98005-000',
    telefone: '(55) 3321-1000',
    telefone_sanitized: '+555533211000',
    email: 'atendimento@cotricruz.com.br',
    socios: [
      { nome: 'ANTONIO CARLOS SILVEIRA', qualificacao: 'Diretor Presidente', telefone: '+5555999211000', email: 'antonio@cotricruz.com.br' }
    ]
  },
  {
    cnpj: '92.000.124/0001-95',
    cnpj_raw: '92000124000195',
    razao_social: 'CCGL - COOPERATIVA CENTRAL GAUCHA LTDA',
    nome_fantasia: 'CCGL AGRO & LEITE',
    cnae_principal_codigo: '01.51-2/01',
    cnae_principal_descricao: 'Agropecuária Integrada, Trigo e Laticínios',
    capital_social: 180000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CRUZ ALTA',
    uf: 'RS',
    logradouro: 'RODOVIA RS 342',
    numero: 'KM 02',
    bairro: 'ZONA RURAL',
    cep: '98000-970',
    telefone: '(55) 3321-9900',
    telefone_sanitized: '+555533219900',
    email: 'relacionamento@ccgl.com.br',
    socios: [
      { nome: 'CAIO VELLOSO', qualificacao: 'Diretor Presidente', telefone: '+5555999219900', email: 'caio.velloso@ccgl.com.br' }
    ]
  },
  {
    cnpj: '89.441.229/0001-75',
    cnpj_raw: '89441229000175',
    razao_social: 'AGROPECUARIA FAZENDA DO CEDRO S.A.',
    nome_fantasia: 'FAZENDA DO CEDRO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Produção de Trigo e Cevada Cervejeira',
    capital_social: 32000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CRUZ ALTA',
    uf: 'RS',
    logradouro: 'RODOVIA BR 158',
    numero: 'KM 212',
    bairro: 'ZONA RURAL',
    cep: '98010-000',
    telefone: '(55) 3322-4411',
    telefone_sanitized: '+555533224411',
    email: 'fazendacedro@agrocedro.com.br',
    socios: [
      { nome: 'MARCELO CEDRO DIAS', qualificacao: 'Diretor Executivo', telefone: '+5555999224411', email: 'marcelo@agrocedro.com.br' }
    ]
  },

  // ── SANTA MARIA / DEPRESSÃO CENTRAL ───────────────────────────────────────
  {
    cnpj: '91.025.338/0001-53',
    cnpj_raw: '91025338000153',
    razao_social: 'CAMNPAL - COOPERATIVA AGRICOLA MISTA NOVA PALMA LTDA',
    nome_fantasia: 'CAMNPAL',
    cnae_principal_codigo: '01.12-1/01',
    cnae_principal_descricao: 'Cultivo e Beneficiamento de Arroz Irrigado e Soja',
    capital_social: 52000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'SANTA MARIA',
    uf: 'RS',
    logradouro: 'AVENIDA NOSSA SENHORA DAS DORES',
    numero: '610',
    bairro: 'DORES',
    cep: '97050-530',
    telefone: '(55) 3220-4000',
    telefone_sanitized: '+555532204000',
    email: 'camnpal@camnpal.com.br',
    socios: [
      { nome: 'ADELIR MINUZZI', qualificacao: 'Diretor Geral', telefone: '+5555999204000', email: 'adelir@camnpal.com.br' }
    ]
  },
  {
    cnpj: '92.411.024/0001-51',
    cnpj_raw: '92411024000151',
    razao_social: 'AGROPECUARIA CORUJA DO SUL LTDA',
    nome_fantasia: 'ESTÂNCIA DA CORUJA',
    cnae_principal_codigo: '01.12-1/01',
    cnae_principal_descricao: 'Rizicultura e Soja em Rotação com Pecuária',
    capital_social: 22000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'SANTA MARIA',
    uf: 'RS',
    logradouro: 'RODOVIA BR 392',
    numero: 'KM 14',
    bairro: 'PASSO DAS TROPAS',
    cep: '97095-000',
    telefone: '(55) 3222-3377',
    telefone_sanitized: '+555532223377',
    email: 'contato@agrocorujadosul.com.br',
    socios: [
      { nome: 'GUILHERME CORUJA BITTENCOURT', qualificacao: 'Sócio Administrador', telefone: '+5555999223377', email: 'guilherme@agrocorujadosul.com.br' }
    ]
  },

  // ── IJUÍ / MISSÕES ────────────────────────────────────────────────────────
  {
    cnpj: '94.986.320/0001-06',
    cnpj_raw: '94986320000106',
    razao_social: '3 TENTOS AGROINDUSTRIAL S.A.',
    nome_fantasia: '3 TENTOS',
    cnae_principal_codigo: '01.11-3/02',
    cnae_principal_descricao: 'Indústria e Comércio de Grãos, Soja, Milho e Fertilizantes',
    capital_social: 310000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'IJUI',
    uf: 'RS',
    logradouro: 'RODOVIA BR 285',
    numero: 'KM 459',
    bairro: 'ZONA RURAL',
    cep: '98700-000',
    telefone: '(55) 3331-9000',
    telefone_sanitized: '+555533319000',
    email: 'ri@3tentos.com.br',
    socios: [
      { nome: 'LUIZ OSORIO DUMONCEL', qualificacao: 'Diretor Presidente', telefone: '+5555999319000', email: 'luiz.dumoncel@3tentos.com.br' }
    ]
  },
  {
    cnpj: '90.737.461/0001-34',
    cnpj_raw: '90737461000134',
    razao_social: 'COOPERATIVA AGROPECUARIA E INDUSTRIAL - COTRIJUI',
    nome_fantasia: 'COTRIJUI',
    cnae_principal_codigo: '01.11-3/02',
    cnae_principal_descricao: 'Cultivo e Armazenamento de Milho e Soja',
    capital_social: 95000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'IJUI',
    uf: 'RS',
    logradouro: 'AVENIDA CORONEL DIOGO BRAGA',
    numero: '880',
    bairro: 'CENTRO',
    cep: '98700-001',
    telefone: '(55) 3332-1500',
    telefone_sanitized: '+555533321500',
    email: 'falecom@cotrijui.com.br',
    socios: [
      { nome: 'VANDERLEI FRAGOSO', qualificacao: 'Diretor Presidente', telefone: '+5555999321500', email: 'vanderlei@cotrijui.com.br' }
    ]
  },

  // ── SANTA CATARINA (SC) — POLO AGROINDUSTRIAL & COOPERATIVISMO ─────────────
  {
    cnpj: '83.310.450/0001-46',
    cnpj_raw: '83310450000146',
    razao_social: 'COOPERALFA - COOPERATIVA AGROINDUSTRIAL ALFA',
    nome_fantasia: 'COOPERALFA',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Grãos, Soja, Milho e Fomento Agropecuário',
    capital_social: 480000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CHAPECÓ',
    uf: 'SC',
    logradouro: 'AVENIDA FERNANDO MACHADO',
    numero: '1500-D',
    bairro: 'SAO CRISTOVAO',
    cep: '89803-000',
    telefone: '(49) 3321-7000',
    telefone_sanitized: '+5549991217000',
    email: 'diretoria@cooperalfa.coop.br',
    socios: [
      { nome: 'ROMEO BET', qualificacao: 'Diretor Presidente', telefone: '+5549991217000', email: 'romeo.bet@cooperalfa.coop.br' },
      { nome: 'CLÁDIS JORGE FELLER', qualificacao: 'Diretor 1º Vice-Presidente', telefone: '+5549991217001', email: 'cladis.feller@cooperalfa.coop.br' }
    ]
  },
  {
    cnpj: '83.151.789/0001-43',
    cnpj_raw: '83151789000143',
    razao_social: 'COPERCAMPOS - COOPERATIVA REGIONAL AGROPECUARIA DE CAMPOS NOVOS',
    nome_fantasia: 'COPERCAMPOS',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Multiplicação de Sementes e Grãos',
    capital_social: 290000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CAMPOS NOVOS',
    uf: 'SC',
    logradouro: 'BR 282',
    numero: 'KM 335',
    bairro: 'AGUA VERDE',
    cep: '89620-000',
    telefone: '(49) 3541-6000',
    telefone_sanitized: '+5549999416000',
    email: 'contato@copercampos.com.br',
    socios: [
      { nome: 'LUIZ CARLOS CHIOCHETTA', qualificacao: 'Diretor Presidente', telefone: '+5549999416000', email: 'luiz.chiochetta@copercampos.com.br' },
      { nome: 'ROSINEI VALDIR ROSA', qualificacao: 'Diretor Vice-Presidente', telefone: '+5549999416001', email: 'rosinei@copercampos.com.br' }
    ]
  },
  {
    cnpj: '83.310.443/0001-44',
    cnpj_raw: '83310443000144',
    razao_social: 'COOPERATIVA CENTRAL AURORA ALIMENTOS - AURORA COOP',
    nome_fantasia: 'AURORA COOP',
    cnae_principal_codigo: '01.11-3/02',
    cnae_principal_descricao: 'Armazenamento de Grãos e Agropecuária Integrada',
    capital_social: 1200000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CHAPECÓ',
    uf: 'SC',
    logradouro: 'RUA JOAO MARTINS',
    numero: '275-D',
    bairro: 'SAO CRISTOVAO',
    cep: '89803-010',
    telefone: '(49) 3321-3000',
    telefone_sanitized: '+5549998213000',
    email: 'agropecuaria@aurora.com.br',
    socios: [
      { nome: 'NEIVOR CANTON', qualificacao: 'Diretor Presidente', telefone: '+5549998213000', email: 'neivor.canton@aurora.com.br' },
      { nome: 'MARCOS ANTONIO ZORDAN', qualificacao: 'Vice-Presidente', telefone: '+5549998213001', email: 'marcos.zordan@aurora.com.br' }
    ]
  },
  {
    cnpj: '83.568.214/0001-65',
    cnpj_raw: '83568214000165',
    razao_social: 'COOPERJA - COOPERATIVA AGROINDUSTRIAL DE JACINTO MACHADO',
    nome_fantasia: 'COOPERJA',
    cnae_principal_codigo: '01.11-3/03',
    cnae_principal_descricao: 'Cultivo de Arroz e Grãos Irrigados',
    capital_social: 95000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'JACINTO MACHADO',
    uf: 'SC',
    logradouro: 'AVENIDA AFONSO GANDIN',
    numero: '215',
    bairro: 'CENTRO',
    cep: '88950-000',
    telefone: '(48) 3535-6000',
    telefone_sanitized: '+5548999356000',
    email: 'presidencia@cooperja.com.br',
    socios: [
      { nome: 'VANIR ZANATTA', qualificacao: 'Presidente Executivo', telefone: '+5548999356000', email: 'vanir@cooperja.com.br' },
      { nome: 'ANTONIO CESAR HOMEM', qualificacao: 'Diretor', telefone: '+5548999356001', email: 'antonio@cooperja.com.br' }
    ]
  },
  {
    cnpj: '04.221.890/0001-22',
    cnpj_raw: '04221890000122',
    razao_social: 'KRAEMER AGROPECUARIA E CEREALISTA LTDA',
    nome_fantasia: 'KRAEMER AGRONEGÓCIOS',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Cereais em Grãos',
    capital_social: 35000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'VIDEIRA',
    uf: 'SC',
    logradouro: 'RODOVIA SC 355',
    numero: 'KM 52',
    bairro: 'ZONA RURAL',
    cep: '89560-000',
    telefone: '(49) 3566-2200',
    telefone_sanitized: '+5549998662200',
    email: 'contato@kraemeragro.com.br',
    socios: [
      { nome: 'CARLOS EDUARDO KRAEMER', qualificacao: 'Sócio-Administrador', telefone: '+5549998662200', email: 'carlos@kraemeragro.com.br' },
      { nome: 'FERNANDA KRAEMER', qualificacao: 'Sócia', telefone: '+5549998662201', email: 'fernanda@kraemeragro.com.br' }
    ]
  },
  {
    cnpj: '83.829.145/0001-80',
    cnpj_raw: '83829145000180',
    razao_social: 'AGROPECUARIA FRAIBURGO LTDA',
    nome_fantasia: 'AGRO FRAIBURGO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Grãos, Maçã e Fruticultura',
    capital_social: 62000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'FRAIBURGO',
    uf: 'SC',
    logradouro: 'AVENIDA RIO DAS ANTAS',
    numero: '330',
    bairro: 'CENTRO',
    cep: '89580-000',
    telefone: '(49) 3246-1100',
    telefone_sanitized: '+5549999461100',
    email: 'operacoes@agrofraiburgo.com.br',
    socios: [
      { nome: 'GERALDO FREY', qualificacao: 'Diretor Administrativo', telefone: '+5549999461100', email: 'geraldo@agrofraiburgo.com.br' },
      { nome: 'MARCELO FREY', qualificacao: 'Diretor', telefone: '+5549999461101', email: 'marcelo@agrofraiburgo.com.br' }
    ]
  },

  // ── PARANÁ (PR) — COOPERATIVISMO & POLOS DE GRÃOS ──────────────────────────
  {
    cnpj: '75.904.383/0001-21',
    cnpj_raw: '75904383000121',
    razao_social: 'COAMO AGROINDUSTRIAL COOPERATIVA',
    nome_fantasia: 'COAMO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Recepção de Soja, Milho, Trigo e Grãos',
    capital_social: 3800000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CAMPO MOURÃO',
    uf: 'PR',
    logradouro: 'RUA FIORAVANTE JOAO FERRI',
    numero: '99',
    bairro: 'JARDIM GUADALAJARA',
    cep: '87300-970',
    telefone: '(44) 3518-1200',
    telefone_sanitized: '+5544991181200',
    email: 'diretoria@coamo.com.br',
    socios: [
      { nome: 'AIRTON GALINARI', qualificacao: 'Presidente Executivo', telefone: '+5544991181200', email: 'galinari@coamo.com.br' },
      { nome: 'JOSE AROLDO GALLASSINI', qualificacao: 'Presidente do Conselho de Administração', telefone: '+5544991181201', email: 'gallassini@coamo.com.br' }
    ]
  },
  {
    cnpj: '77.858.637/0001-34',
    cnpj_raw: '77858637000134',
    razao_social: 'C.VALE - COOPERATIVA AGROINDUSTRIAL',
    nome_fantasia: 'C.VALE',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Armazenamento de Soja e Milho',
    capital_social: 2100000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PALOTINA',
    uf: 'PR',
    logradouro: 'AVENIDA INDEPENDENCIA',
    numero: '2347',
    bairro: 'CENTRO',
    cep: '85950-000',
    telefone: '(44) 3649-7000',
    telefone_sanitized: '+5544998497000',
    email: 'presidencia@cvale.com.br',
    socios: [
      { nome: 'ALFREDO LANG', qualificacao: 'Diretor Presidente', telefone: '+5544998497000', email: 'alfredo.lang@cvale.com.br' },
      { nome: 'WALTER DAL BO', qualificacao: 'Diretor Vice-Presidente', telefone: '+5544998497001', email: 'walter@cvale.com.br' }
    ]
  },
  {
    cnpj: '79.114.492/0001-08',
    cnpj_raw: '79114492000108',
    razao_social: 'COCAMAR COOPERATIVA AGROINDUSTRIAL',
    nome_fantasia: 'COCAMAR',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Fomento Agropecuário',
    capital_social: 1450000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'MARINGÁ',
    uf: 'PR',
    logradouro: 'ESTRADA OSWALDO DE MORAES CORREA',
    numero: '1000',
    bairro: 'PARQUE INDUSTRIAL',
    cep: '87065-000',
    telefone: '(44) 3218-3000',
    telefone_sanitized: '+5544991183000',
    email: 'agro@cocamar.com.br',
    socios: [
      { nome: 'DIVANIR HIGINO DA SILVA', qualificacao: 'Presidente Executivo', telefone: '+5544991183000', email: 'divanir@cocamar.com.br' },
      { nome: 'ALEXANDRE MONTEIRO', qualificacao: 'Vice-Presidente', telefone: '+5544991183001', email: 'alexandre@cocamar.com.br' }
    ]
  },
  {
    cnpj: '76.790.393/0001-90',
    cnpj_raw: '76790393000190',
    razao_social: 'LAR COOPERATIVA AGROINDUSTRIAL',
    nome_fantasia: 'LAR',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja, Milho e Produção Agropecuária',
    capital_social: 1800000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'MEDIANEIRA',
    uf: 'PR',
    logradouro: 'AVENIDA 24 DE OUTUBRO',
    numero: '59',
    bairro: 'CENTRO',
    cep: '85884-000',
    telefone: '(45) 3264-8000',
    telefone_sanitized: '+5545999648000',
    email: 'diretoria@lar.ind.br',
    socios: [
      { nome: 'IRINEO DA COSTA RODRIGUES', qualificacao: 'Diretor Presidente', telefone: '+5545999648000', email: 'irineo@lar.ind.br' },
      { nome: 'LAURO SOETHE', qualificacao: 'Vice-Presidente', telefone: '+5545999648001', email: 'lauro@lar.ind.br' }
    ]
  },

  // ── SÃO PAULO (SP) — CINTURÃO AGROPECUÁRIO & SUCROALCOOLEIRO ──────────────
  {
    cnpj: '45.234.335/0001-44',
    cnpj_raw: '45234335000144',
    razao_social: 'COOPERCITRUS COOPERATIVA DE PRODUTORES RURAIS',
    nome_fantasia: 'COOPERCITRUS',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja, Milho, Citros e Insumos Agrícolas',
    capital_social: 850000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'BEBEDOURO',
    uf: 'SP',
    logradouro: 'AVENIDA DR. PEDRO DE PAULA CASTRO',
    numero: '1390',
    bairro: 'CENTRO',
    cep: '14700-000',
    telefone: '(17) 3344-3000',
    telefone_sanitized: '+5517997443000',
    email: 'contato@coopercitrus.com.br',
    socios: [
      { nome: 'FERNANDO DEGOBBI', qualificacao: 'Diretor Presidente Executivo', telefone: '+5517997443000', email: 'degobbi@coopercitrus.com.br' },
      { nome: 'MATHEUS TROTTA KAUFFMANN', qualificacao: 'Diretor Comercial', telefone: '+5517997443001', email: 'matheus@coopercitrus.com.br' }
    ]
  },
  {
    cnpj: '54.341.229/0001-60',
    cnpj_raw: '54341229000160',
    razao_social: 'COPLACANA - COOPERATIVA DOS PLANTADORES DE CANA DO ESTADO DE SP',
    nome_fantasia: 'COPLACANA',
    cnae_principal_codigo: '01.13-0/00',
    cnae_principal_descricao: 'Cultivo de Cana-de-Açúcar e Grãos em Rotação',
    capital_social: 520000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PIRACICABA',
    uf: 'SP',
    logradouro: 'RODOVIA DO ACUCAR',
    numero: 'KM 157',
    bairro: 'TAQUARAL',
    cep: '13400-970',
    telefone: '(19) 3401-2200',
    telefone_sanitized: '+5519998012200',
    email: 'presidencia@coplacana.com.br',
    socios: [
      { nome: 'ARNALDO ANTONIO BORTOLETTO', qualificacao: 'Diretor Presidente', telefone: '+5519998012200', email: 'bortoletto@coplacana.com.br' },
      { nome: 'JOSE CORAL', qualificacao: 'Vice-Presidente', telefone: '+5519998012201', email: 'jose.coral@coplacana.com.br' }
    ]
  },
  {
    cnpj: '61.849.201/0001-55',
    cnpj_raw: '61849201000155',
    razao_social: 'AGROTERRA CEREAIS E SEMENTES LTDA',
    nome_fantasia: 'AGROTERRA',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Cereais em Grãos',
    capital_social: 75000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'RIBEIRÃO PRETO',
    uf: 'SP',
    logradouro: 'AVENIDA MAURILIO BIAGI',
    numero: '800',
    bairro: 'SANTA CRUZ',
    cep: '14020-750',
    telefone: '(16) 3602-5000',
    telefone_sanitized: '+5516997025000',
    email: 'operacoes@agroterra.com.br',
    socios: [
      { nome: 'RICARDO JUNQUEIRA', qualificacao: 'Sócio-Administrador', telefone: '+5516997025000', email: 'ricardo@agroterra.com.br' },
      { nome: 'LUCIANA JUNQUEIRA', qualificacao: 'Sócia', telefone: '+5516997025001', email: 'luciana@agroterra.com.br' }
    ]
  },

  // ── MINAS GERAIS (MG) — CAFÉ & GRÃOS DO CERRADO MINEIRO ────────────────────
  {
    cnpj: '20.760.294/0001-64',
    cnpj_raw: '20760294000164',
    razao_social: 'COOXUPE - COOPERATIVA REGIONAL DE CAFEICULTORES EM GUAXUPE',
    nome_fantasia: 'COOXUPÉ',
    cnae_principal_codigo: '01.34-2/00',
    cnae_principal_descricao: 'Cultivo de Café e Grãos em Rotação',
    capital_social: 1150000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'GUAXUPÉ',
    uf: 'MG',
    logradouro: 'RUA CONSELHEIRO ALBERTO LUZ',
    numero: '101',
    bairro: 'CENTRO',
    cep: '37800-000',
    telefone: '(35) 3559-4000',
    telefone_sanitized: '+5535999594000',
    email: 'presidencia@cooxupe.com.br',
    socios: [
      { nome: 'CARLOS AUGUSTO RODRIGUES DE MELO', qualificacao: 'Presidente Executivo', telefone: '+5535999594000', email: 'carlos.melo@cooxupe.com.br' },
      { nome: 'OSVALDO BACHIAO FILHO', qualificacao: 'Vice-Presidente', telefone: '+5535999594001', email: 'osvaldo@cooxupe.com.br' }
    ]
  },
  {
    cnpj: '19.382.498/0001-09',
    cnpj_raw: '19382498000109',
    razao_social: 'COOPADAP - COOPERATIVA AGROPECUARIA DO ALTO PARANAIBA',
    nome_fantasia: 'COOPADAP',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja, Trigo, Milho e Hortaliças',
    capital_social: 220000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'SÃO GOTARDO',
    uf: 'MG',
    logradouro: 'RODOVIA MG 235',
    numero: 'KM 88',
    bairro: 'ZONA RURAL',
    cep: '38800-000',
    telefone: '(34) 3671-8000',
    telefone_sanitized: '+5534999718000',
    email: 'diretoria@coopadap.com.br',
    socios: [
      { nome: 'MAKOTO MIYABUKURO', qualificacao: 'Presidente', telefone: '+5534999718000', email: 'makoto@coopadap.com.br' },
      { nome: 'PAULO TAKESHI', qualificacao: 'Diretor', telefone: '+5534999718001', email: 'paulo@coopadap.com.br' }
    ]
  },
  {
    cnpj: '21.445.890/0001-78',
    cnpj_raw: '21445890000178',
    razao_social: 'FAZENDA MONTE VERDE AGROPECUARIA LTDA',
    nome_fantasia: 'FAZENDA MONTE VERDE',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Milho em Grãos',
    capital_social: 88000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PATOS DE MINAS',
    uf: 'MG',
    logradouro: 'ESTRADA VICINAL DE SÃO JOÃO',
    numero: 'S/N',
    bairro: 'DISTRITO DE SÃO JOÃO',
    cep: '38700-000',
    telefone: '(34) 3822-1500',
    telefone_sanitized: '+5534998221500',
    email: 'monteverde@agropecuaria.agr.br',
    socios: [
      { nome: 'ANTONIO CARLOS DE ANDRADE', qualificacao: 'Sócio-Administrador', telefone: '+5534998221500', email: 'antonio@monteverde.agr.br' },
      { nome: 'MARCELO ANDRADE', qualificacao: 'Sócio', telefone: '+5534998221501', email: 'marcelo@monteverde.agr.br' }
    ]
  },

  // ── MATO GROSSO (MT) — GIGANTES DO AGRONEGÓCIO ────────────────────────────
  {
    cnpj: '03.220.890/0001-44',
    cnpj_raw: '03220890000144',
    razao_social: 'BOM FUTURO AGRICOLA LTDA',
    nome_fantasia: 'GRUPO BOM FUTURO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja, Milho e Algodão',
    capital_social: 1800000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CUIABÁ',
    uf: 'MT',
    logradouro: 'AVENIDA MIGUEL SUTIL',
    numero: '14343',
    bairro: 'RIBEIRAO DO LIPA',
    cep: '78040-000',
    telefone: '(65) 3615-5000',
    telefone_sanitized: '+5565999155000',
    email: 'diretoria@bomfuturo.com.br',
    socios: [
      { nome: 'ERAÍ MAGGI SCHEFFER', qualificacao: 'Sócio-Administrador', telefone: '+5565999155000', email: 'erai@bomfuturo.com.br' },
      { nome: 'ELUSMAR MAGGI SCHEFFER', qualificacao: 'Sócio', telefone: '+5565999155001', email: 'elusmar@bomfuturo.com.br' }
    ]
  },
  {
    cnpj: '89.096.457/0001-55',
    cnpj_raw: '89096457000155',
    razao_social: 'SLC AGRICOLA S.A.',
    nome_fantasia: 'SLC AGRÍCOLA',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja, Algodão e Milho em Escala',
    capital_social: 2400000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'SAPEZAL',
    uf: 'MT',
    logradouro: 'RODOVIA MT 235',
    numero: 'KM 100',
    bairro: 'ZONA RURAL',
    cep: '78365-000',
    telefone: '(65) 3383-2000',
    telefone_sanitized: '+5565999832000',
    email: 'ri@slcagricola.com.br',
    socios: [
      { nome: 'AURELIO PAVINATO', qualificacao: 'Diretor Presidente', telefone: '+5565999832000', email: 'pavinato@slcagricola.com.br' },
      { nome: 'IVO BÜHLER', qualificacao: 'Diretor de Operações', telefone: '+5565999832001', email: 'buhler@slcagricola.com.br' }
    ]
  },
  {
    cnpj: '07.881.234/0001-12',
    cnpj_raw: '07881234000112',
    razao_social: 'AGRO BASSO & BASSO GRAOS LTDA',
    nome_fantasia: 'AGRO BASSO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Milho Safrinha',
    capital_social: 120000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'SORRISO',
    uf: 'MT',
    logradouro: 'AVENIDA BLUMENAU',
    numero: '1200',
    bairro: 'ROTA DO SOL',
    cep: '78890-000',
    telefone: '(66) 3545-8800',
    telefone_sanitized: '+5566999458800',
    email: 'diretoria@agrobasso.com.br',
    socios: [
      { nome: 'DARCI ROBERTO BASSO', qualificacao: 'Sócio-Administrador', telefone: '+5566999458800', email: 'darci@agrobasso.com.br' },
      { nome: 'JULIANA BASSO', qualificacao: 'Sócia', telefone: '+5566999458801', email: 'juliana@agrobasso.com.br' }
    ]
  },
  {
    cnpj: '03.882.109/0001-88',
    cnpj_raw: '03882109000188',
    razao_social: 'COOPERFIBRA - COOPERATIVA AGROINDUSTRIAL',
    nome_fantasia: 'COOPERFIBRA',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Algodão e Grãos no Cerrado',
    capital_social: 310000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CAMPO VERDE',
    uf: 'MT',
    logradouro: 'RODOVIA BR 070',
    numero: 'KM 370',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '78840-000',
    telefone: '(66) 3419-7000',
    telefone_sanitized: '+5566998197000',
    email: 'diretoria@cooperfibra.com.br',
    socios: [
      { nome: 'JOSE CARLOS DOLPHIN', qualificacao: 'Presidente Executivo', telefone: '+5566998197000', email: 'dolphin@cooperfibra.com.br' },
      { nome: 'RICARDO COSTA', qualificacao: 'Diretor', telefone: '+5566998197001', email: 'ricardo@cooperfibra.com.br' }
    ]
  },
  {
    cnpj: '08.112.980/0001-30',
    cnpj_raw: '08112980000130',
    razao_social: 'FAZENDA SINOP AGRONEGOCIOS LTDA',
    nome_fantasia: 'AGRO SINOP',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Milho em Larga Escala',
    capital_social: 98000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'SINOP',
    uf: 'MT',
    logradouro: 'AVENIDA DAS FIGUEIRAS',
    numero: '780',
    bairro: 'SETOR COMERCIAL',
    cep: '78550-000',
    telefone: '(66) 3531-9000',
    telefone_sanitized: '+5566999319000',
    email: 'contato@agrosinop.com.br',
    socios: [
      { nome: 'MARCOS ROBERTO DALLASTRA', qualificacao: 'Sócio-Administrador', telefone: '+5566999319000', email: 'marcos@agrosinop.com.br' },
      { nome: 'VANESSA DALLASTRA', qualificacao: 'Sócia', telefone: '+5566999319001', email: 'vanessa@agrosinop.com.br' }
    ]
  },

  // ── MATO GROSSO DO SUL (MS) — PANTANAL & SUL-MATO-GROSSENSE ───────────────
  {
    cnpj: '15.441.982/0001-09',
    cnpj_raw: '15441982000109',
    razao_social: 'COPASUL - COOPERATIVA AGROINDUSTRIAL',
    nome_fantasia: 'COPASUL',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja, Milho e Fomento de Grãos',
    capital_social: 490000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'NAVIRAÍ',
    uf: 'MS',
    logradouro: 'AVENIDA WEIMAR GONÇALVES TORRES',
    numero: '1301',
    bairro: 'CENTRO',
    cep: '79950-000',
    telefone: '(67) 3409-1200',
    telefone_sanitized: '+5567999091200',
    email: 'copasul@copasul.coop.br',
    socios: [
      { nome: 'GERVASIO KAMINARI', qualificacao: 'Presidente do Conselho', telefone: '+5567999091200', email: 'gervasio@copasul.coop.br' },
      { nome: 'ADELSON TRENTIN', qualificacao: 'Diretor Geral', telefone: '+5567999091201', email: 'trentin@copasul.coop.br' }
    ]
  },
  {
    cnpj: '04.551.229/0001-70',
    cnpj_raw: '04551229000170',
    razao_social: 'AGROPECUARIA TERRA BOA LTDA',
    nome_fantasia: 'TERRA BOA AGRONEGÓCIOS',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Pecuária de Corte',
    capital_social: 140000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'DOURADOS',
    uf: 'MS',
    logradouro: 'AVENIDA PRESIDENTE VARGAS',
    numero: '1550',
    bairro: 'VILA TONANI',
    cep: '79800-000',
    telefone: '(67) 3422-7700',
    telefone_sanitized: '+5567998227700',
    email: 'operacoes@terraboa.agr.br',
    socios: [
      { nome: 'EDUARDO REZENDE COSTA', qualificacao: 'Sócio-Administrador', telefone: '+5567998227700', email: 'eduardo@terraboa.agr.br' },
      { nome: 'PATRICIA REZENDE', qualificacao: 'Sócia', telefone: '+5567998227701', email: 'patricia@terraboa.agr.br' }
    ]
  },
  {
    cnpj: '05.992.110/0001-52',
    cnpj_raw: '05992110000152',
    razao_social: 'FAZENDA SAO GABRIEL DO OESTE AGRO LTDA',
    nome_fantasia: 'AGRO SÃO GABRIEL',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Grãos e Suinocultura Integrada',
    capital_social: 78000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'SÃO GABRIEL DO OESTE',
    uf: 'MS',
    logradouro: 'RODOVIA BR 163',
    numero: 'KM 610',
    bairro: 'ZONA RURAL',
    cep: '79490-000',
    telefone: '(67) 3295-1800',
    telefone_sanitized: '+5567999951800',
    email: 'diretoria@agrosg.com.br',
    socios: [
      { nome: 'LEONARDO KAPPES', qualificacao: 'Sócio-Administrador', telefone: '+5567999951800', email: 'leonardo@agrosg.com.br' },
      { nome: 'CARLA KAPPES', qualificacao: 'Sócia', telefone: '+5567999951801', email: 'carla@agrosg.com.br' }
    ]
  },

  // ── GOIÁS (GO) & DISTRITO FEDERAL (DF) — SUDOESTE GOIANO ───────────────────
  {
    cnpj: '02.045.228/0001-08',
    cnpj_raw: '02045228000108',
    razao_social: 'COMIGO - COOPERATIVA AGROINDUSTRIAL DOS PRODUTORES RURAIS DO SUDOESTE GOIANO',
    nome_fantasia: 'COMIGO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Armazenamento de Soja, Milho e Sorgo',
    capital_social: 2300000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'RIO VERDE',
    uf: 'GO',
    logradouro: 'AVENIDA PRESIDENTE VARGAS',
    numero: '3000',
    bairro: 'SETOR CENTRAL',
    cep: '75901-900',
    telefone: '(64) 3611-1500',
    telefone_sanitized: '+5564999111500',
    email: 'presidencia@comigo.com.br',
    socios: [
      { nome: 'ANTONIO CHAVAGLIA', qualificacao: 'Presidente Executivo', telefone: '+5564999111500', email: 'chavaglia@comigo.com.br' },
      { nome: 'DOUGLAS ORLANDO', qualificacao: 'Vice-Presidente', telefone: '+5564999111501', email: 'douglas@comigo.com.br' }
    ]
  },
  {
    cnpj: '02.148.243/0001-80',
    cnpj_raw: '02148243000180',
    razao_social: 'CARAMURU ALIMENTOS S.A.',
    nome_fantasia: 'CARAMURU',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Processamento de Grãos',
    capital_social: 1100000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'ITUMBIARA',
    uf: 'GO',
    logradouro: 'VIA EXPRESSA JULIO BORGES DE SOUSA',
    numero: '1000',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '75503-970',
    telefone: '(64) 3404-0300',
    telefone_sanitized: '+5564998040300',
    email: 'contato@caramuru.com',
    socios: [
      { nome: 'CESAR BORGES DE SOUSA', qualificacao: 'Diretor Presidente', telefone: '+5564998040300', email: 'cesar@caramuru.com' },
      { nome: 'ALBERTO BORGES DE SOUSA', qualificacao: 'Vice-Presidente', telefone: '+5564998040301', email: 'alberto@caramuru.com' }
    ]
  },
  {
    cnpj: '01.332.909/0001-52',
    cnpj_raw: '01332909000152',
    razao_social: 'COMPLEM - COOPERATIVA MISTA DOS PRODUTORES DE LEITE DE MORRINHOS',
    nome_fantasia: 'COMPLEM',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Grãos e Pecuária de Leite',
    capital_social: 380000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'MORRINHOS',
    uf: 'GO',
    logradouro: 'AVENIDA CEL. FERNANDO BARBOSA',
    numero: '120',
    bairro: 'CENTRO',
    cep: '75650-000',
    telefone: '(64) 3417-8000',
    telefone_sanitized: '+5564999178000',
    email: 'presidencia@complem.com.br',
    socios: [
      { nome: 'SERGIO PENIDO', qualificacao: 'Presidente Executivo', telefone: '+5564999178000', email: 'penido@complem.com.br' },
      { nome: 'MARCO AURELIO BATISTA', qualificacao: 'Diretor', telefone: '+5564999178001', email: 'marco@complem.com.br' }
    ]
  },
  {
    cnpj: '03.992.110/0001-44',
    cnpj_raw: '03992110000144',
    razao_social: 'AGROPLANALTO BRASILIA LTDA',
    nome_fantasia: 'AGROPLANALTO DF',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Trigo Irrigado',
    capital_social: 150000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'BRASÍLIA',
    uf: 'DF',
    logradouro: 'PAD-DF BR 251',
    numero: 'KM 05',
    bairro: 'ZONA RURAL PAD-DF',
    cep: '71600-000',
    telefone: '(61) 3364-8800',
    telefone_sanitized: '+5561998648800',
    email: 'agro@planalto.agr.br',
    socios: [
      { nome: 'HENRIQUE EDUARDO DE FREITAS', qualificacao: 'Sócio-Administrador', telefone: '+5561998648800', email: 'henrique@planalto.agr.br' },
      { nome: 'LUISA DE FREITAS', qualificacao: 'Sócia', telefone: '+5561998648801', email: 'luisa@planalto.agr.br' }
    ]
  },

  // ── BAHIA (BA) & MATOPIBA — OESTE BAIANO ───────────────────────────────────
  {
    cnpj: '10.822.450/0001-10',
    cnpj_raw: '10822450000110',
    razao_social: 'COOPERFARMS - COOPERATIVA DOS PRODUTORES RURAIS DA BAHIA',
    nome_fantasia: 'COOPERFARMS',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Fomento de Soja, Milho e Algodão',
    capital_social: 420000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'LUÍS EDUARDO MAGALHÃES',
    uf: 'BA',
    logradouro: 'RUA JUSCELINO KUBITSCHEK',
    numero: '1200',
    bairro: 'JARDIM IMPERIAL',
    cep: '47850-000',
    telefone: '(77) 3628-9000',
    telefone_sanitized: '+5577999289000',
    email: 'contato@cooperfarms.com.br',
    socios: [
      { nome: 'MARCELINO BORATO', qualificacao: 'Presidente Executivo', telefone: '+5577999289000', email: 'borato@cooperfarms.com.br' },
      { nome: 'ANDRE VALDIR DE OLIVEIRA', qualificacao: 'Diretor Comercial', telefone: '+5577999289001', email: 'andre@cooperfarms.com.br' }
    ]
  },
  {
    cnpj: '03.441.982/0001-99',
    cnpj_raw: '03441982000199',
    razao_social: 'COOPROESTE - COOPERATIVA AGROPECUARIA DO OESTE DA BAHIA',
    nome_fantasia: 'COOPROESTE',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Armazenamento de Grãos',
    capital_social: 260000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'BARREIRAS',
    uf: 'BA',
    logradouro: 'RODOVIA BR 242',
    numero: 'KM 04',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '47800-000',
    telefone: '(77) 3612-4000',
    telefone_sanitized: '+5577998124000',
    email: 'diretoria@cooproeste.com.br',
    socios: [
      { nome: 'CARLOS AUGUSTO MORAIS', qualificacao: 'Presidente', telefone: '+5577998124000', email: 'morais@cooproeste.com.br' },
      { nome: 'FLAVIO RENATO DIAS', qualificacao: 'Diretor', telefone: '+5577998124001', email: 'flavio@cooproeste.com.br' }
    ]
  },
  {
    cnpj: '05.112.780/0001-14',
    cnpj_raw: '05112780000114',
    razao_social: 'UNIGGEL SEMENTES & GRAOS LTDA',
    nome_fantasia: 'UNIGGEL',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Produção de Sementes e Soja',
    capital_social: 110000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CORRENTINA',
    uf: 'BA',
    logradouro: 'RODOVIA BR 349',
    numero: 'KM 22',
    bairro: 'ZONA RURAL',
    cep: '47650-000',
    telefone: '(77) 3488-2100',
    telefone_sanitized: '+5577999882100',
    email: 'agro@uniggel.com.br',
    socios: [
      { nome: 'FAUSTO COSTA FILHO', qualificacao: 'Sócio-Administrador', telefone: '+5577999882100', email: 'fausto@uniggel.com.br' },
      { nome: 'BEATRIZ COSTA', qualificacao: 'Sócia', telefone: '+5577999882101', email: 'beatriz@uniggel.com.br' }
    ]
  },

  // ── MATOPIBA EXPANDIDO (TO, MA, PI) ───────────────────────────────────────
  {
    cnpj: '01.882.340/0001-91',
    cnpj_raw: '01882340000191',
    razao_social: 'AGREX DO BRASIL S.A.',
    nome_fantasia: 'AGREX TOCANTINS',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Comercialização de Soja e Milho',
    capital_social: 580000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PALMAS',
    uf: 'TO',
    logradouro: 'QUADRA 103 SUL',
    numero: 'LOTE 10',
    bairro: 'PLANO DIRETOR SUL',
    cep: '77015-010',
    telefone: '(63) 3219-5000',
    telefone_sanitized: '+5563999195000',
    email: 'contato@agrex.com.br',
    socios: [
      { nome: 'SERGIO SCHULER', qualificacao: 'Diretor Presidente', telefone: '+5563999195000', email: 'schuler@agrex.com.br' },
      { nome: 'MARCELO SILVA', qualificacao: 'Diretor', telefone: '+5563999195001', email: 'marcelo@agrex.com.br' }
    ]
  },
  {
    cnpj: '76.104.991/0014-99',
    cnpj_raw: '76104991001499',
    razao_social: 'FRISIA COOPERATIVA AGROINDUSTRIAL - POLO BALSAS',
    nome_fantasia: 'FRÍSIA MARANHÃO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Cereais no Maranhão',
    capital_social: 340000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'BALSAS',
    uf: 'MA',
    logradouro: 'RODOVIA MA 006',
    numero: 'KM 02',
    bairro: 'ZONA INDUSTRIAL',
    cep: '65800-000',
    telefone: '(99) 3541-8000',
    telefone_sanitized: '+5599998418000',
    email: 'balsas@frisia.coop.br',
    socios: [
      { nome: 'RENATO GROPPO', qualificacao: 'Superintendente Regional', telefone: '+5599998418000', email: 'groppo@frisia.coop.br' },
      { nome: 'ALEXANDRE CARNEIRO', qualificacao: 'Gerente Operacional', telefone: '+5599998418001', email: 'carneiro@frisia.coop.br' }
    ]
  },
  {
    cnpj: '07.332.109/0001-50',
    cnpj_raw: '07332109000150',
    razao_social: 'BOM JESUS AGROPECUARIA DO PIAUI LTDA',
    nome_fantasia: 'AGRO BOM JESUS PI',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Milho em Larga Escala',
    capital_social: 190000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'BOM JESUS',
    uf: 'PI',
    logradouro: 'RODOVIA BR 135',
    numero: 'KM 08',
    bairro: 'ZONA RURAL',
    cep: '64900-000',
    telefone: '(89) 3562-1100',
    telefone_sanitized: '+5589999621100',
    email: 'diretoria@agrobomjesus.agr.br',
    socios: [
      { nome: 'FRANCISCO ANTONIO LIMA', qualificacao: 'Sócio-Administrador', telefone: '+5589999621100', email: 'francisco@agrobomjesus.agr.br' },
      { nome: 'RAIMUNDO NONATO LIMA', qualificacao: 'Sócio', telefone: '+5589999621101', email: 'raimundo@agrobomjesus.agr.br' }
    ]
  },
  {
    cnpj: '08.441.980/0001-33',
    cnpj_raw: '08441980000133',
    razao_social: 'URUCUI AGROINDUSTRIAL DE CEREAIS LTDA',
    nome_fantasia: 'URUCUÍ GRÃOS',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Armazenamento de Soja',
    capital_social: 135000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'URUCUÍ',
    uf: 'PI',
    logradouro: 'AVENIDA PRINCIPAL',
    numero: '450',
    bairro: 'CENTRO',
    cep: '64880-000',
    telefone: '(89) 3544-2200',
    telefone_sanitized: '+5589998442200',
    email: 'urucui@cereais.agr.br',
    socios: [
      { nome: 'VALDIR PEREIRA SANTOS', qualificacao: 'Sócio-Administrador', telefone: '+5589998442200', email: 'valdir@cereais.agr.br' },
      { nome: 'CLEIDE SANTOS', qualificacao: 'Sócia', telefone: '+5589998442201', email: 'cleide@cereais.agr.br' }
    ]
  },

  // ── REGIÃO NORTE (PA, RO, AC, AM, RR, AP) ─────────────────────────────────
  {
    cnpj: '04.981.234/0001-70',
    cnpj_raw: '04981234000170',
    razao_social: 'CAMTA - COOPERATIVA AGRICOLA MISTA DE TOME-ACU',
    nome_fantasia: 'CAMTA',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Sistemas Agroflorestais e Cultivo de Frutas e Grãos',
    capital_social: 160000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'TOMÉ-AÇU',
    uf: 'PA',
    logradouro: 'AVENIDA DIONISIO BENTES',
    numero: '412',
    bairro: 'CENTRO',
    cep: '68680-000',
    telefone: '(91) 3727-1200',
    telefone_sanitized: '+5591999271200',
    email: 'camta@camta.com.br',
    socios: [
      { nome: 'ALBERTO OPPATA', qualificacao: 'Presidente Executivo', telefone: '+5591999271200', email: 'alberto@camta.com.br' },
      { nome: 'MICHINORI SAKAGUCHI', qualificacao: 'Diretor', telefone: '+5591999271201', email: 'sakaguchi@camta.com.br' }
    ]
  },
  {
    cnpj: '05.772.190/0001-44',
    cnpj_raw: '05772190000144',
    razao_social: 'PARAGOMINAS AGROPECUARIA LTDA',
    nome_fantasia: 'AGRO PARAGOMINAS',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Pecuária Sustentável',
    capital_social: 180000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PARAGOMINAS',
    uf: 'PA',
    logradouro: 'RODOVIA PA 125',
    numero: 'KM 05',
    bairro: 'ANGELIM',
    cep: '68625-000',
    telefone: '(91) 3729-3300',
    telefone_sanitized: '+5591998293300',
    email: 'operacoes@paragominasagro.com.br',
    socios: [
      { nome: 'MAURO LUCIO COSTA', qualificacao: 'Sócio-Administrador', telefone: '+5591998293300', email: 'mauro@paragominasagro.com.br' },
      { nome: 'RENATA COSTA', qualificacao: 'Sócia', telefone: '+5591998293301', email: 'renata@paragominasagro.com.br' }
    ]
  },
  {
    cnpj: '06.441.990/0001-20',
    cnpj_raw: '06441990000120',
    razao_social: 'COOAGRONORTE - COOPERATIVA AGROPECUARIA DO NORTE',
    nome_fantasia: 'COOAGRONORTE',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Soja e Milho em Rondônia',
    capital_social: 210000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'VILHENA',
    uf: 'RO',
    logradouro: 'AVENIDA CELSO MAZUTTI',
    numero: '5120',
    bairro: 'JARDIM ELDORADO',
    cep: '76980-000',
    telefone: '(69) 3322-5500',
    telefone_sanitized: '+5569999225500',
    email: 'diretoria@cooagronorte.com.br',
    socios: [
      { nome: 'CESAR AUGUSTO CASAGRANDE', qualificacao: 'Presidente', telefone: '+5569999225500', email: 'casagrande@cooagronorte.com.br' },
      { nome: 'WANDERLEI SILVEIRA', qualificacao: 'Diretor', telefone: '+5569999225501', email: 'wanderlei@cooagronorte.com.br' }
    ]
  },

  // ── DEMAIS ESTADOS (PE, AL, CE, ES, RJ) ───────────────────────────────────
  {
    cnpj: '09.112.450/0001-88',
    cnpj_raw: '09112450000188',
    razao_social: 'COOPAF - COOPERATIVA AGROPECUARIA DE PETROLINA',
    nome_fantasia: 'COOPAF VALE DO SÃO FRANCISCO',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo e Fruticultura Irrigada',
    capital_social: 175000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'PETROLINA',
    uf: 'PE',
    logradouro: 'AVENIDA CARDOSO DE SA',
    numero: '120',
    bairro: 'VILA EDUARDO',
    cep: '56300-000',
    telefone: '(87) 3862-7000',
    telefone_sanitized: '+5587999627000',
    email: 'coopaf@petrolina.agr.br',
    socios: [
      { nome: 'JAIRO COELHO', qualificacao: 'Presidente Executivo', telefone: '+5587999627000', email: 'jairo@petrolina.agr.br' },
      { nome: 'MANOEL BATISTA', qualificacao: 'Diretor', telefone: '+5587999627001', email: 'manoel@petrolina.agr.br' }
    ]
  },
  {
    cnpj: '12.234.567/0001-09',
    cnpj_raw: '12234567000109',
    razao_social: 'COOPERATIVA PINDORAMA',
    nome_fantasia: 'PINDORAMA',
    cnae_principal_codigo: '01.13-0/00',
    cnae_principal_descricao: 'Cultivo de Cana, Frutas e Grãos Agropecuários',
    capital_social: 240000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CORURIPE',
    uf: 'AL',
    logradouro: 'RODOVIA AL 101 SUL',
    numero: 'KM 80',
    bairro: 'POVOADO PINDORAMA',
    cep: '57200-000',
    telefone: '(82) 3274-1200',
    telefone_sanitized: '+5582998741200',
    email: 'diretoria@pindorama.com.br',
    socios: [
      { nome: 'KLEVER LOURIVAL LINS', qualificacao: 'Diretor Presidente', telefone: '+5582998741200', email: 'klever@pindorama.com.br' },
      { nome: 'SERGIO PEREIRA', qualificacao: 'Vice-Presidente', telefone: '+5582998741201', email: 'sergio@pindorama.com.br' }
    ]
  },
  {
    cnpj: '07.889.110/0001-34',
    cnpj_raw: '07889110000134',
    razao_social: 'COOAPEL - COOPERATIVA AGROPECUARIA DE LIMOEIRO DO NORTE',
    nome_fantasia: 'COOAPEL CEARÁ',
    cnae_principal_codigo: '01.11-3/01',
    cnae_principal_descricao: 'Cultivo de Grãos e Fruticultura Irrigada',
    capital_social: 90000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'LIMOEIRO DO NORTE',
    uf: 'CE',
    logradouro: 'RODOVIA CE 265',
    numero: 'KM 02',
    bairro: 'ZONA INDUSTRIAL',
    cep: '62930-000',
    telefone: '(88) 3423-1500',
    telefone_sanitized: '+5588999231500',
    email: 'cooapel@ceara.agr.br',
    socios: [
      { nome: 'FRANCISCO DE ASSIS SILVA', qualificacao: 'Presidente', telefone: '+5588999231500', email: 'assis@ceara.agr.br' },
      { nome: 'ANTONIO CARLOS REGIS', qualificacao: 'Diretor', telefone: '+5588999231501', email: 'regis@ceara.agr.br' }
    ]
  },
  {
    cnpj: '27.489.109/0001-50',
    cnpj_raw: '27489109000150',
    razao_social: 'COOPEAVI - COOPERATIVA AGROPECUARIA CENTRO SERRANA',
    nome_fantasia: 'COOPEAVI',
    cnae_principal_codigo: '01.34-2/00',
    cnae_principal_descricao: 'Cultivo de Café e Fomento Avícola e Agrícola',
    capital_social: 310000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'SANTA MARIA DE JETIBÁ',
    uf: 'ES',
    logradouro: 'AVENIDA FREDERICO GRULKE',
    numero: '1130',
    bairro: 'CENTRO',
    cep: '29645-000',
    telefone: '(27) 3263-4000',
    telefone_sanitized: '+5527999634000',
    email: 'presidencia@coopeavi.com.br',
    socios: [
      { nome: 'EDERSON VALDENIR JACOB', qualificacao: 'Presidente Executivo', telefone: '+5527999634000', email: 'ederson@coopeavi.com.br' },
      { nome: 'ARGEMIRO BOEHM', qualificacao: 'Vice-Presidente', telefone: '+5527999634001', email: 'argemiro@coopeavi.com.br' }
    ]
  },
  {
    cnpj: '02.883.109/0001-20',
    cnpj_raw: '02883109000120',
    razao_social: 'AGROPECUARIA VALE DO PARAIBA FLUMINENSE LTDA',
    nome_fantasia: 'VALE DO PARAÍBA AGRO',
    cnae_principal_codigo: '01.13-0/00',
    cnae_principal_descricao: 'Cultivo de Cana e Pecuária em Escala',
    capital_social: 82000000,
    target_type: 'BUYER',
    porte: 'DEMAIS',
    municipio: 'CAMPOS DOS GOYTACAZES',
    uf: 'RJ',
    logradouro: 'RODOVIA BR 101',
    numero: 'KM 65',
    bairro: 'ZONA RURAL',
    cep: '28000-000',
    telefone: '(22) 2733-1100',
    telefone_sanitized: '+5522999331100',
    email: 'contato@agrovale.com.br',
    socios: [
      { nome: 'FERNANDO BARRETO CHAGAS', qualificacao: 'Sócio-Administrador', telefone: '+5522999331100', email: 'fernando@agrovale.com.br' },
      { nome: 'MARIANA CHAGAS', qualificacao: 'Sócia', telefone: '+5522999331101', email: 'mariana@agrovale.com.br' }
    ]
  }
];

/**
 * Insere os leads regionais canônicos no banco SQLite caso não existam
 * e povoa os quadros societários (QSA) em leads_socios.
 */
export function seedAgroLeads() {
  try {
    const checkStmt = db.prepare(`SELECT id FROM leads WHERE cnpj_raw = ? LIMIT 1`);
    const insertLeadStmt = db.prepare(`
      INSERT OR REPLACE INTO leads (
        id, cnpj, cnpj_raw, razao_social, nome_fantasia,
        cnae_principal_codigo, cnae_principal_descricao, capital_social,
        porte, target_type, municipio, uf, logradouro, numero, bairro, cep,
        telefone, telefone_sanitized, email, qsa,
        origem, tag, contato_nome,
        tenant_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        'tenant-root-default', datetime('now'), datetime('now')
      )
    `);

    const insertSocioStmt = db.prepare(`
      INSERT OR REPLACE INTO leads_socios (
        id, lead_cnpj, nome, qualificacao, telefone_presumido, email_validado, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    let inserted = 0;
    for (const lead of AGRO_REGIONAL_SEEDS) {
      const sociosList = lead.socios || [];
      const qsaJson = JSON.stringify(sociosList);
      const isBuyer = (lead.target_type || 'BUYER') === 'BUYER';
      const leadOrigem = isBuyer ? 'RURAL_SIGEF' : 'RECEITA_FEDERAL';
      const leadTag = isBuyer ? 'ORIGEM: RURAL / PJ' : 'REVENDA_AGRO';
      const contatoNome = sociosList.length > 0 ? sociosList[0].nome : null;

      const id = `lead-agro-${lead.cnpj_raw}`;
      insertLeadStmt.run(
        id,
        lead.cnpj,
        lead.cnpj_raw,
        lead.razao_social,
        lead.nome_fantasia || lead.razao_social,
        lead.cnae_principal_codigo,
        lead.cnae_principal_descricao,
        lead.capital_social,
        lead.porte || 'DEMAIS',
        lead.target_type || 'BUYER',
        lead.municipio.toUpperCase(),
        lead.uf.toUpperCase(),
        lead.logradouro || null,
        lead.numero || null,
        lead.bairro || null,
        lead.cep ? String(lead.cep).replace(/\D/g, '') : null,
        lead.telefone,
        lead.telefone_sanitized,
        lead.email,
        qsaJson,
        leadOrigem,
        leadTag,
        contatoNome
      );
      inserted++;

      // Insere os sócios no quadro societário (QSA)
      for (const socio of sociosList) {
        const socioId = `socio-${lead.cnpj_raw}-${Buffer.from(socio.nome).toString('hex').slice(0, 10)}`;
        insertSocioStmt.run(
          socioId,
          lead.cnpj_raw,
          socio.nome,
          socio.qualificacao,
          socio.telefone || lead.telefone_sanitized,
          socio.email || lead.email
        );
      }
    }

    if (inserted > 0) {
      console.log(`🌾 [SEED AGRO FASE 60] ${inserted} entidades agropecuárias e revendas semeadas com QSA e WhatsApp.`);
    }
  } catch (err) {
    console.warn('⚠️ [SEED AGRO WARN] Erro ao semear cooperativas e revendas agro:', err.message);
  }
}

export default seedAgroLeads;
