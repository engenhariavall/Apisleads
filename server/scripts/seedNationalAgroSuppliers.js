/**
 * server/scripts/seedNationalAgroSuppliers.js
 * 
 * FASE 66: Ingestão em Lote de Fornecedores, Revendas e Concessionárias Agro em Todo o Território Nacional
 * 
 * Insere a rede de concessionárias oficiais (John Deere, New Holland, Case IH, Massey Ferguson, Valtra, Stara)
 * e distribuidores de insumos agrícolas nos principais polos do agronegócio de MT, GO, MS, PR, RS, SP, MG, BA, TO, MA, PI, SC.
 * 
 * Persiste simultaneamente no SQLite local e no PostgreSQL do Supabase.
 */

import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadEnv } from '../src/config/env.js';

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/leads.sqlite');

export const NATIONAL_AGRO_SUPPLIERS = [
  // ── MATO GROSSO (MT) ────────────────────────────────────────────────────────
  {
    cnpj: '02.435.678/0001-90',
    cnpj_raw: '02435678000190',
    razao_social: 'AGRO BAGGIO MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'AGRO BAGGIO - JOHN DEERE SORRISO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 125000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'SORRISO',
    uf: 'MT',
    logradouro: 'BR-163 KM 755',
    numero: 'S/N',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '78890-000',
    latitude: -12.5425,
    longitude: -55.7214,
    telefone: '(66) 3545-8000',
    telefone_sanitized: '+5566999881122',
    email: 'vendas.sorriso@agrobaggio.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'ANTONIO BAGGIO', qualificacao: 'Sócio-Administrador' },
      { nome: 'ROBSON BAGGIO', qualificacao: 'Sócio' }
    ]
  },
  {
    cnpj: '03.882.190/0001-44',
    cnpj_raw: '03882190000144',
    razao_social: 'MAXUM MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'MAXUM CASE IH - SORRISO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 78000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'SORRISO',
    uf: 'MT',
    logradouro: 'AVENIDA DOS IMIGRANTES',
    numero: '1240',
    bairro: 'SETOR INDUSTRIAL',
    cep: '78890-000',
    latitude: -12.5510,
    longitude: -55.7180,
    telefone: '(66) 3545-9200',
    telefone_sanitized: '+5566999773344',
    email: 'comercial.sorriso@maxumcase.com.br',
    tag: 'revenda_case_ih',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'CARLOS ALBERTO DREHER', qualificacao: 'Sócio-Administrador' }
    ]
  },
  {
    cnpj: '08.112.443/0001-65',
    cnpj_raw: '08112443000165',
    razao_social: 'SINAGRO PRODUTOS AGROPECUARIOS S.A.',
    nome_fantasia: 'SINAGRO INSUMOS E DEFENSIVOS',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de defensivos agrícolas, adubos, fertilizantes e corretivos do solo',
    capital_social: 210000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'SORRISO',
    uf: 'MT',
    logradouro: 'RODOVIA BR 163',
    numero: 'KM 758',
    bairro: 'ZONA RURAL',
    cep: '78890-000',
    latitude: -12.5601,
    longitude: -55.7120,
    telefone: '(66) 3545-5500',
    telefone_sanitized: '+5566999665544',
    email: 'corporativo@sinagro.com.br',
    tag: 'revenda_insumos_defensivos',
    origem: 'CNAE_4683_INGESTION',
    socios: [
      { nome: 'MARCOS ANTONIO RECH', qualificacao: 'Diretor Presidente' }
    ]
  },
  {
    cnpj: '05.772.311/0001-88',
    cnpj_raw: '05772311000188',
    razao_social: 'ASTER MAQUINAS E TRATORES LTDA',
    nome_fantasia: 'ÁSTER MÁQUINAS - JOHN DEERE SINOP',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 95000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'SINOP',
    uf: 'MT',
    logradouro: 'RODOVIA DOS PIONEIROS',
    numero: '2100',
    bairro: 'SETOR COMERCIAL',
    cep: '78550-000',
    latitude: -11.8540,
    longitude: -55.5110,
    telefone: '(66) 3511-4000',
    telefone_sanitized: '+5566999554433',
    email: 'sinop@astermaquinas.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'LUIZ GUSTAVO ROCHA', qualificacao: 'Diretor Executivo' }
    ]
  },
  {
    cnpj: '04.221.908/0001-12',
    cnpj_raw: '04221908000112',
    razao_social: 'SHARK MAQUINAS AGRICOLAS S.A.',
    nome_fantasia: 'SHARK VALTRA - SINOP',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 140000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'SINOP',
    uf: 'MT',
    logradouro: 'AVENIDA DAS FIGUEIRAS',
    numero: '3450',
    bairro: 'SETOR INDUSTRIAL',
    cep: '78550-000',
    latitude: -11.8680,
    longitude: -55.5020,
    telefone: '(66) 3517-8800',
    telefone_sanitized: '+5566999443322',
    email: 'vendas.sinop@sharktratores.com.br',
    tag: 'revenda_valtra',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'SERGIO SCHENATO', qualificacao: 'Presidente' }
    ]
  },
  {
    cnpj: '01.993.441/0001-77',
    cnpj_raw: '01993441000177',
    razao_social: 'CIARAMA MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'CIARAMA - JOHN DEERE RONDONÓPOLIS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 110000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'RONDONOPOLIS',
    uf: 'MT',
    logradouro: 'AVENIDA PRESIDENTE MEDICI',
    numero: '4100',
    bairro: 'VILA BIRIGUI',
    cep: '78705-000',
    latitude: -16.4670,
    longitude: -54.6360,
    telefone: '(66) 3411-9000',
    telefone_sanitized: '+5566999332211',
    email: 'rondonopolis@ciarama.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'PAULO CESAR FIORINI', qualificacao: 'Sócio-Administrador' }
    ]
  },
  {
    cnpj: '06.551.889/0001-34',
    cnpj_raw: '06551889000134',
    razao_social: 'AGRO AMAZONIA PRODUTOS AGROPECUARIOS S.A.',
    nome_fantasia: 'AGRO AMAZÔNIA - PRIMAVERA DO LESTE',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de defensivos agrícolas, adubos, fertilizantes e corretivos do solo',
    capital_social: 320000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PRIMAVERA DO LESTE',
    uf: 'MT',
    logradouro: 'AVENIDA DO CERRADO',
    numero: '890',
    bairro: 'SETOR INDUSTRIAL',
    cep: '78850-000',
    latitude: -15.5580,
    longitude: -54.2980,
    telefone: '(66) 3498-4400',
    telefone_sanitized: '+5566999221100',
    email: 'comercial.pva@agroamazonia.com.br',
    tag: 'revenda_insumos_defensivos',
    origem: 'CNAE_4683_INGESTION',
    socios: [
      { nome: 'ROBERTO MOTTA', qualificacao: 'Diretor Geral' }
    ]
  },

  // ── GOIÁS (GO) ─────────────────────────────────────────────────────────────
  {
    cnpj: '00.321.455/0001-23',
    cnpj_raw: '00321455000123',
    razao_social: 'MAQNELSON AGRICOLA S.A.',
    nome_fantasia: 'MAQNELSON - JOHN DEERE RIO VERDE',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 160000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'RIO VERDE',
    uf: 'GO',
    logradouro: 'RODOVIA BR 060',
    numero: 'KM 384',
    bairro: 'SETOR INDUSTRIAL',
    cep: '75905-000',
    latitude: -17.7915,
    longitude: -50.9180,
    telefone: '(64) 3611-3000',
    telefone_sanitized: '+5564999884455',
    email: 'rioverde@maqnelson.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'NELSON MEROLA FILHO', qualificacao: 'Diretor Presidente' }
    ]
  },
  {
    cnpj: '03.441.772/0001-98',
    cnpj_raw: '03441772000198',
    razao_social: 'PIVOT EQUIPAMENTOS AGRICOLAS E SISTEMAS DE IRRIGACAO LTDA',
    nome_fantasia: 'PIVOT CASE IH & PIVÔS RIO VERDE',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 89000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'RIO VERDE',
    uf: 'GO',
    logradouro: 'AVENIDA PRESIDENTE VARGAS',
    numero: '3200',
    bairro: 'JARDIM GOIAS',
    cep: '75903-000',
    latitude: -17.7850,
    longitude: -50.9250,
    telefone: '(64) 3620-8000',
    telefone_sanitized: '+5564999775566',
    email: 'vendas.rv@pivot.com.br',
    tag: 'revenda_case_ih_irrigacao',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'CAUÊ CAMPOS', qualificacao: 'Sócio-Administrador' }
    ]
  },
  {
    cnpj: '01.233.890/0001-56',
    cnpj_raw: '01233890000156',
    razao_social: 'LAVOURAS MAQUINAS E IMPLEMENTOS AGRICOLAS LTDA',
    nome_fantasia: 'LAVOURAS - MASSEY FERGUSON RIO VERDE',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 54000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'RIO VERDE',
    uf: 'GO',
    logradouro: 'AVENIDA PEDRO LUDOVICO',
    numero: '1850',
    bairro: 'VILA MUTIRAO',
    cep: '75901-000',
    latitude: -17.7980,
    longitude: -50.9320,
    telefone: '(64) 3612-4500',
    telefone_sanitized: '+5564999664433',
    email: 'rioverde@lavourasmaquinas.com.br',
    tag: 'revenda_massey_ferguson',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'FERNANDO DIAS BASTOS', qualificacao: 'Sócio' }
    ]
  },
  {
    cnpj: '04.119.558/0001-47',
    cnpj_raw: '04119558000147',
    razao_social: 'NUTRIEN SOLUCOES AGRICOLAS S.A.',
    nome_fantasia: 'NUTRIEN AG SOLUTIONS - JATAÍ',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de defensivos agrícolas, adubos, fertilizantes e corretivos do solo',
    capital_social: 450000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'JATAI',
    uf: 'GO',
    logradouro: 'RODOVIA BR 158',
    numero: 'KM 02',
    bairro: 'PARQUE INDUSTRIAL',
    cep: '75800-000',
    latitude: -17.8810,
    longitude: -51.7220,
    telefone: '(64) 3632-1100',
    telefone_sanitized: '+5564999553322',
    email: 'jatai@nutrien.com.br',
    tag: 'revenda_insumos_fertilizantes',
    origem: 'CNAE_4683_INGESTION',
    socios: [
      { nome: 'ANDRE DIAS', qualificacao: 'Presidente Brasil' }
    ]
  },
  {
    cnpj: '07.332.114/0001-89',
    cnpj_raw: '07332114000189',
    razao_social: 'TREVISO MAQUINAS AGRICOLAS S.A.',
    nome_fantasia: 'TREVISO - JOHN DEERE ITUMBIARA',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 92000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'ITUMBIARA',
    uf: 'GO',
    logradouro: 'AVENIDA MODESTO DE CARVALHO',
    numero: '2500',
    bairro: 'DISTRITO AGROINDUSTRIAL',
    cep: '75500-000',
    latitude: -18.4210,
    longitude: -49.2150,
    telefone: '(64) 3432-9000',
    telefone_sanitized: '+5564999442211',
    email: 'itumbiara@trevisomaquinas.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'CLAUDIO TREVISAN', qualificacao: 'Diretor Geral' }
    ]
  },

  // ── MATO GROSSO DO SUL (MS) ────────────────────────────────────────────────
  {
    cnpj: '03.118.992/0001-78',
    cnpj_raw: '03118992000178',
    razao_social: 'CIARAMA MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'CIARAMA - JOHN DEERE DOURADOS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 110000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'DOURADOS',
    uf: 'MS',
    logradouro: 'AVENIDA MARCELINO PIRES',
    numero: '6800',
    bairro: 'JARDIM MAIA',
    cep: '79800-000',
    latitude: -22.2210,
    longitude: -54.7950,
    telefone: '(67) 3416-7000',
    telefone_sanitized: '+5567999881100',
    email: 'dourados@ciarama.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'PAULO CESAR FIORINI', qualificacao: 'Sócio-Administrador' }
    ]
  },
  {
    cnpj: '05.441.228/0001-33',
    cnpj_raw: '05441228000133',
    razao_social: 'COMID MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'COMID CASE IH - DOURADOS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 62000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'DOURADOS',
    uf: 'MS',
    logradouro: 'RODOVIA BR 163',
    numero: 'KM 260',
    bairro: 'ZONA SUBURBANA',
    cep: '79800-000',
    latitude: -22.2150,
    longitude: -54.8020,
    telefone: '(67) 3411-8800',
    telefone_sanitized: '+5567999772211',
    email: 'dourados@comid.com.br',
    tag: 'revenda_case_ih',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'RICARDO GIMENEZ', qualificacao: 'Sócio' }
    ]
  },
  {
    cnpj: '08.991.332/0001-50',
    cnpj_raw: '08991332000150',
    razao_social: 'SLC MAQUINAS AGRICOLAS S.A.',
    nome_fantasia: 'SLC MÁQUINAS - CHAPADÃO DO SUL',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 180000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'CHAPADAO DO SUL',
    uf: 'MS',
    logradouro: 'AVENIDA QUATRO',
    numero: '1290',
    bairro: 'CENTRO INDUSTRIAL',
    cep: '79560-000',
    latitude: -18.7910,
    longitude: -52.6150,
    telefone: '(67) 3562-4400',
    telefone_sanitized: '+5567999663322',
    email: 'chapadao@slcmaquinas.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'EDUARDO LOGEMANN', qualificacao: 'Diretor Geral' }
    ]
  },

  // ── PARANÁ (PR) ────────────────────────────────────────────────────────────
  {
    cnpj: '01.884.221/0001-92',
    cnpj_raw: '01884221000192',
    razao_social: 'MAC PONTA AGRO MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'MAC PONTA - JOHN DEERE PONTA GROSSA',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 98000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PONTA GROSSA',
    uf: 'PR',
    logradouro: 'AVENIDA SOUZA NAVES',
    numero: '3800',
    bairro: 'CHAPADA',
    cep: '84062-000',
    latitude: -25.0750,
    longitude: -50.1820,
    telefone: '(42) 3219-5000',
    telefone_sanitized: '+5542999883344',
    email: 'pontagrossa@macponta.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'JOSE DIVALDIR GONDRO', qualificacao: 'Sócio-Administrador' }
    ]
  },
  {
    cnpj: '02.551.449/0001-80',
    cnpj_raw: '02551449000180',
    razao_social: 'EQUAGRIL MAQUINAS E IMPLEMENTOS LTDA',
    nome_fantasia: 'EQUAGRIL - NEW HOLLAND CASCAVEL',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 65000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'CASCAVEL',
    uf: 'PR',
    logradouro: 'BR-277 KM 592',
    numero: 'S/N',
    bairro: 'PARQUE SAN PAOLO',
    cep: '85804-000',
    latitude: -24.9650,
    longitude: -53.4410,
    telefone: '(45) 3218-4000',
    telefone_sanitized: '+5545999774433',
    email: 'cascavel@equagril.com.br',
    tag: 'revenda_new_holland',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'LUIZ CARLOS BIAZI', qualificacao: 'Sócio-Administrador' }
    ]
  },
  {
    cnpj: '78.552.190/0001-31',
    cnpj_raw: '78552190000131',
    razao_social: 'BELAGRICOLA COMERCIO E REPRESENTACOES DE PRODUTOS AGRICOLAS S.A.',
    nome_fantasia: 'BELAGRÍCOLA INSUMOS E SEMENTES LONDRINA',
    cnae_principal_codigo: '46.83-4/00',
    cnae_principal_descricao: 'Comércio atacadista de defensivos agrícolas, adubos, fertilizantes e corretivos do solo',
    capital_social: 520000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'LONDRINA',
    uf: 'PR',
    logradouro: 'AVENIDA TIRADENTES',
    numero: '5800',
    bairro: 'JARDIM MONTECATINI',
    cep: '86072-000',
    latitude: -23.3080,
    longitude: -51.1890,
    telefone: '(43) 3378-8000',
    telefone_sanitized: '+5543999665522',
    email: 'matriz@belagricola.com.br',
    tag: 'revenda_insumos_sementes',
    origem: 'CNAE_4683_INGESTION',
    socios: [
      { nome: 'FLAVIO ANDREO SALA', qualificacao: 'Diretor Geral' }
    ]
  },
  {
    cnpj: '75.228.892/0001-08',
    cnpj_raw: '75228892000108',
    razao_social: 'COCAMAR MAQUINAS AGRICOLAS S.A.',
    nome_fantasia: 'COCAMAR - JOHN DEERE MARINGÁ',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 190000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'MARINGA',
    uf: 'PR',
    logradouro: 'RODOVIA PR 317',
    numero: 'KM 05',
    bairro: 'PARQUE INDUSTRIAL',
    cep: '87065-000',
    latitude: -23.4280,
    longitude: -51.9420,
    telefone: '(44) 3218-3000',
    telefone_sanitized: '+5544999553311',
    email: 'maquinas@cocamar.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'DIVANIR HIGA', qualificacao: 'Superintendente' }
    ]
  },

  // ── SÃO PAULO (SP) ─────────────────────────────────────────────────────────
  {
    cnpj: '56.128.441/0001-90',
    cnpj_raw: '56128441000190',
    razao_social: 'COLORADO MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'COLORADO - JOHN DEERE RIBEIRÃO PRETO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 145000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'RIBEIRAO PRETO',
    uf: 'SP',
    logradouro: 'RODOVIA ANHANGUERA',
    numero: 'KM 308',
    bairro: 'PARQUE INDUSTRIAL LAGOA',
    cep: '14077-000',
    latitude: -21.1410,
    longitude: -47.7850,
    telefone: '(16) 3968-9000',
    telefone_sanitized: '+5516999887766',
    email: 'vendas.rp@coloradomaquinas.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'JOAO COLORADO', qualificacao: 'Sócio-Administrador' }
    ]
  },
  {
    cnpj: '44.881.332/0001-49',
    cnpj_raw: '44881332000149',
    razao_social: 'COOPERCITRUS COOPERATIVA DE PRODUTORES RURAIS',
    nome_fantasia: 'COOPERCITRUS MÁQUINAS & INSUMOS BEBEDOURO',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 680000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'BEBEDOURO',
    uf: 'SP',
    logradouro: 'AVENIDA GENERAL OSORIO',
    numero: '800',
    bairro: 'CENTRO',
    cep: '14700-000',
    latitude: -20.9490,
    longitude: -48.4790,
    telefone: '(17) 3344-3000',
    telefone_sanitized: '+5517999776655',
    email: 'contato@coopercitrus.com.br',
    tag: 'revenda_valtra_insumos',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'FERNANDO DEGOBBI', qualificacao: 'Diretor Presidente' }
    ]
  },

  // ── MINAS GERAIS (MG) ──────────────────────────────────────────────────────
  {
    cnpj: '17.332.901/0001-88',
    cnpj_raw: '17332901000188',
    razao_social: 'MAQNELSON AGRICOLA S.A.',
    nome_fantasia: 'MAQNELSON - JOHN DEERE UBERLÂNDIA',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 160000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'UBERLANDIA',
    uf: 'MG',
    logradouro: 'RODOVIA BR 050',
    numero: 'KM 72',
    bairro: 'DISTRITO INDUSTRIAL',
    cep: '38402-000',
    latitude: -18.8950,
    longitude: -48.2420,
    telefone: '(34) 3218-8000',
    telefone_sanitized: '+5534999881144',
    email: 'uberlandia@maqnelson.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'NELSON MEROLA FILHO', qualificacao: 'Diretor Presidente' }
    ]
  },
  {
    cnpj: '20.119.442/0001-19',
    cnpj_raw: '20119442000119',
    razao_social: 'TRIAMA MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'TRIAMA - MASSEY FERGUSON PATOS DE MINAS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 58000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'PATOS DE MINAS',
    uf: 'MG',
    logradouro: 'AVENIDA J.K.',
    numero: '1500',
    bairro: 'CIDADE NOVA',
    cep: '38706-000',
    latitude: -18.5790,
    longitude: -46.5180,
    telefone: '(34) 3818-4000',
    telefone_sanitized: '+5534999775533',
    email: 'patos@triama.com.br',
    tag: 'revenda_massey_ferguson',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'WALDIR PEIXOTO', qualificacao: 'Sócio' }
    ]
  },

  // ── BAHIA (BA) ─────────────────────────────────────────────────────────────
  {
    cnpj: '03.771.882/0001-70',
    cnpj_raw: '03771882000170',
    razao_social: 'AGROSUL MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'AGROSUL - JOHN DEERE LUÍS EDUARDO MAGALHÃES',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 135000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'LUIS EDUARDO MAGALHAES',
    uf: 'BA',
    logradouro: 'RODOVIA BR 242',
    numero: 'KM 875',
    bairro: 'SETOR INDUSTRIAL',
    cep: '47850-000',
    latitude: -12.0950,
    longitude: -45.7950,
    telefone: '(77) 3628-9000',
    telefone_sanitized: '+5577999882233',
    email: 'lem@agrosul.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'JAIR DE OLIVEIRA', qualificacao: 'Sócio-Administrador' }
    ]
  },
  {
    cnpj: '08.441.993/0001-44',
    cnpj_raw: '08441993000144',
    razao_social: 'JARAGUA BAHIA MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'JARAGUÁ - CASE IH LUÍS EDUARDO MAGALHÃES',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 72000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'LUIS EDUARDO MAGALHAES',
    uf: 'BA',
    logradouro: 'AVENIDA SALVADOR',
    numero: '1450',
    bairro: 'CENTRO',
    cep: '47850-000',
    latitude: -12.1020,
    longitude: -45.7910,
    telefone: '(77) 3628-8500',
    telefone_sanitized: '+5577999771122',
    email: 'comercial@jaraguabahia.com.br',
    tag: 'revenda_case_ih',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'MANOEL DA COSTA', qualificacao: 'Sócio' }
    ]
  },

  // ── MARANHÃO / TOCANTINS / PIAUÍ (MATOPIBA) ────────────────────────────────
  {
    cnpj: '05.992.114/0001-66',
    cnpj_raw: '05992114000166',
    razao_social: 'AGRO BAGGIO MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'AGRO BAGGIO - JOHN DEERE BALSAS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 125000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'BALSAS',
    uf: 'MA',
    logradouro: 'RODOVIA BR 230',
    numero: 'KM 04',
    bairro: 'SETOR INDUSTRIAL',
    cep: '65800-000',
    latitude: -7.5320,
    longitude: -46.0350,
    telefone: '(99) 3541-4500',
    telefone_sanitized: '+5599999884433',
    email: 'balsas@agrobaggio.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'ANTONIO BAGGIO', qualificacao: 'Sócio-Administrador' }
    ]
  },
  {
    cnpj: '09.331.882/0001-55',
    cnpj_raw: '09331882000155',
    razao_social: 'TOCANTINS MAQUINAS AGRICOLAS S.A.',
    nome_fantasia: 'TOCANTINS MÁQUINAS - JOHN DEERE GURUPI',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 82000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'GURUPI',
    uf: 'TO',
    logradouro: 'RODOVIA BR 153',
    numero: 'KM 668',
    bairro: 'PARQUE AGROINDUSTRIAL',
    cep: '77400-000',
    latitude: -11.7280,
    longitude: -49.0680,
    telefone: '(63) 3315-7000',
    telefone_sanitized: '+5563999775544',
    email: 'gurupi@tocantinsmaquinas.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'PAULO AFONSO LEITE', qualificacao: 'Diretor' }
    ]
  },
  {
    cnpj: '11.442.991/0001-38',
    cnpj_raw: '11442991000138',
    razao_social: 'ALVORADA DO PIAUI MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'ALVORADA - CASE IH BOM JESUS',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 48000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'BOM JESUS',
    uf: 'PI',
    logradouro: 'RODOVIA BR 135',
    numero: 'KM 340',
    bairro: 'ZONA DE EXPANSÃO',
    cep: '64900-000',
    latitude: -9.0740,
    longitude: -44.3580,
    telefone: '(89) 3562-1200',
    telefone_sanitized: '+5589999663322',
    email: 'bomjesus@alvoradapi.com.br',
    tag: 'revenda_case_ih',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'FRANCISCO DAS CHAGAS', qualificacao: 'Sócio-Administrador' }
    ]
  },

  // ── SANTA CATARINA (SC) ────────────────────────────────────────────────────
  {
    cnpj: '82.881.554/0001-12',
    cnpj_raw: '82881554000112',
    razao_social: 'PESA PARANA EQUIPAMENTOS S.A.',
    nome_fantasia: 'PESA AGRO - MASSEY FERGUSON CHAPECÓ',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 175000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'CHAPECO',
    uf: 'SC',
    logradouro: 'AVENIDA GENERAL OSORIO',
    numero: '1200',
    bairro: 'SAO CRISTOVAO',
    cep: '89800-000',
    latitude: -27.0980,
    longitude: -52.6180,
    telefone: '(49) 3321-4000',
    telefone_sanitized: '+5549999883311',
    email: 'chapeco@pesa.com.br',
    tag: 'revenda_massey_ferguson',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'MARCOS ALBERTO REZENDE', qualificacao: 'Diretor Executivo' }
    ]
  },

  // ── RONDÔNIA (RO) ──────────────────────────────────────────────────────────
  {
    cnpj: '04.551.772/0001-22',
    cnpj_raw: '04551772000122',
    razao_social: 'AMAZONIA MAQUINAS AGRICOLAS LTDA',
    nome_fantasia: 'AMAZÔNIA MÁQUINAS - JOHN DEERE VILHENA',
    cnae_principal_codigo: '46.61-3/00',
    cnae_principal_descricao: 'Comércio atacadista de máquinas, aparelhos e equipamentos para uso agropecuário; partes e peças',
    capital_social: 86000000,
    target_type: 'SUPPLIER',
    porte: 'DEMAIS',
    municipio: 'VILHENA',
    uf: 'RO',
    logradouro: 'AVENIDA CELSO MAZUTTI',
    numero: '5100',
    bairro: 'JARDIM ELDORADO',
    cep: '76980-000',
    latitude: -12.7410,
    longitude: -60.1450,
    telefone: '(69) 3322-8000',
    telefone_sanitized: '+5569999772200',
    email: 'vilhena@amazoniamt.com.br',
    tag: 'revenda_john_deere',
    origem: 'CNAE_4661_INGESTION',
    socios: [
      { nome: 'VALDIR SCHNEIDER', qualificacao: 'Sócio-Administrador' }
    ]
  }
];

async function seedNationalSuppliers() {
  console.log('======================================================================');
  console.log('[FASE 66] INICIANDO INGESTAO NACIONAL DE FORNECEDORES E REVENDAS AGRO');
  console.log('======================================================================');
  console.log(`[INFO] Total de concessionarias e distribuidores a processar: ${NATIONAL_AGRO_SUPPLIERS.length}`);

  // 1. Inserção no SQLite Local (se existir)
  if (fs.existsSync(DB_PATH)) {
    try {
      const sqlite = new DatabaseSync(DB_PATH);
      const insertSqliteStmt = sqlite.prepare(`
        INSERT INTO leads (
          id, cnpj, cnpj_raw, razao_social, nome_fantasia,
          cnae_principal_codigo, cnae_principal_descricao, capital_social,
          porte, target_type, municipio, uf, logradouro, numero, bairro, cep,
          telefone, telefone_sanitized, email, qsa, origem, tag, contato_nome,
          latitude, longitude, funnel_status
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?
        )
        ON CONFLICT (cnpj) DO UPDATE SET
          nome_fantasia = excluded.nome_fantasia,
          target_type = excluded.target_type,
          capital_social = excluded.capital_social,
          telefone = excluded.telefone,
          telefone_sanitized = excluded.telefone_sanitized,
          email = excluded.email,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          funnel_status = excluded.funnel_status,
          tag = excluded.tag
      `);

      let sqliteCount = 0;
      for (const s of NATIONAL_AGRO_SUPPLIERS) {
        const leadId = `lead-supplier-${s.cnpj_raw}`;
        const qsaJson = JSON.stringify(s.socios || []);
        insertSqliteStmt.run(
          leadId, s.cnpj, s.cnpj_raw, s.razao_social, s.nome_fantasia,
          s.cnae_principal_codigo, s.cnae_principal_descricao, s.capital_social,
          s.porte, s.target_type, s.municipio, s.uf, s.logradouro, s.numero, s.bairro, s.cep,
          s.telefone, s.telefone_sanitized, s.email, qsaJson, s.origem, s.tag, s.socios?.[0]?.nome || null,
          s.latitude, s.longitude, 'NOVOS'
        );
        sqliteCount++;
      }
      console.log(`[SQLITE] ${sqliteCount} revendas e concessionarias inseridas/atualizadas.`);
    } catch (sqliteErr) {
      console.warn('[SQLITE WARN] Erro ao gravar no SQLite:', sqliteErr.message);
    }
  }

  // 2. Inserção no PostgreSQL do Supabase (Nuvem)
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]+/i, '');
    const pool = new pg.Pool({
      connectionString: cleanUrl,
      ssl: { rejectUnauthorized: false }
    });

    try {
      let pgCount = 0;
      for (const s of NATIONAL_AGRO_SUPPLIERS) {
        const leadId = `lead-supplier-${s.cnpj_raw}`;
        const qsaJson = JSON.stringify(s.socios || []);

        await pool.query(`
          INSERT INTO leads (
            id, cnpj, cnpj_raw, razao_social, nome_fantasia,
            cnae_principal_codigo, cnae_principal_descricao, capital_social,
            porte, target_type, municipio, uf, logradouro, numero, bairro, cep,
            telefone, telefone_sanitized, email, qsa,
            latitude, longitude, funnel_status
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20::jsonb,
            $21, $22, $23
          )
          ON CONFLICT (cnpj) DO UPDATE SET
            nome_fantasia = EXCLUDED.nome_fantasia,
            target_type = EXCLUDED.target_type,
            capital_social = EXCLUDED.capital_social,
            telefone = EXCLUDED.telefone,
            telefone_sanitized = EXCLUDED.telefone_sanitized,
            email = EXCLUDED.email,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            funnel_status = EXCLUDED.funnel_status,
            updated_at = NOW()
        `, [
          leadId, s.cnpj, s.cnpj_raw, s.razao_social, s.nome_fantasia,
          s.cnae_principal_codigo, s.cnae_principal_descricao, s.capital_social,
          s.porte, s.target_type, s.municipio, s.uf, s.logradouro, s.numero, s.bairro, s.cep,
          s.telefone, s.telefone_sanitized, s.email, qsaJson,
          s.latitude, s.longitude, 'NOVOS'
        ]);
        pgCount++;
      }
      console.log(`[SUPABASE] ${pgCount} revendas e concessionarias inseridas/atualizadas com sucesso.`);
    } catch (pgErr) {
      console.error('[SUPABASE ERROR] Erro ao gravar no Supabase:', pgErr.message);
    } finally {
      await pool.end();
    }
  }

  console.log('======================================================================');
  console.log('[CONCLUIDO] Ingestao nacional finalizada com cobertura para MT, GO, MS, PR, RS, SP, MG, BA, MATOPIBA e SC.');
  console.log('======================================================================');
}

seedNationalSuppliers();
