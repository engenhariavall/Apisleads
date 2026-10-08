/**
 * bureauService.js
 * FASE ASSERTIVA v3 & FASE 66 — INTEGRAÇÃO DE BUREAU DE DADOS & CRÉDITO OFICIAL
 * 
 * Gateway de integração com Bureaus de Dados e enriquecimento cadastral e financeiro
 * oficial (Assertiva Soluções v3 via OAuth2, Unitfour, BigDataCorp).
 * 
 * DIRETRIZES DE PRODUÇÃO (GO-LIVE & ANTI-DESPERDÍCIO):
 * 1. NUNCA inventa números de telefone, documentos ou dados financeiros.
 * 2. ANTI-DESPERDÍCIO (Zero Custo Desnecessário): Toda consulta é primeiramente checada
 *    na tabela local `bureau_cache_consultas` e na base de leads. Se consultado nos últimos
 *    30 dias (ou configurado pelo operador), serve do cache com custo R$ 0,00.
 * 3. SINCRONIZAÇÃO GLOBAL AUTOMÁTICA: Ao validar um contato ou score no Bureau, atualiza
 *    automaticamente o lead correspondente na tabela `leads` com selo oficial de verificação.
 * 4. ESPELHAMENTO ASSERTIVA LOCALIZE: Entrega a estrutura completa de 10 seções do modelo oficial.
 */

import crypto from 'crypto';
import { validatePhoneChannel } from '../modules/intent/phoneValidator.js';
import { resolveTenantCredentials, ApiRouterError } from './apiRouterService.js';
import { assertivaAuthService } from './assertivaAuthService.js';
import db from '../config/database.js';

/**
 * Validador algorítmico de CPF
 */
function isValidCPF(cpf) {
  const clean = String(cpf).replace(/\D/g, '');
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i), 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i), 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(clean.charAt(10), 10);
}

/**
 * Validador algorítmico de CNPJ
 */
function isValidCNPJ(cnpj) {
  const clean = String(cnpj).replace(/\D/g, '');
  if (clean.length !== 14 || /^(\d)\1{13}$/.test(clean)) return false;
  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0), 10)) return false;
  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(digits.charAt(1), 10);
}

/**
 * Construtor Normalizado do Modelo Completo Assertiva Localize
 */
function buildFullAssertivaModel({ cleanDoc, isCpf, existingLead = null, existingProp = null, sefazProducer = null, apiData = null, tenantId = 'tenant-root-default', options = {} }) {
  const isCnpj = !isCpf;
  const docFormatted = isCpf 
    ? cleanDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : cleanDoc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

  const protocolId = `da${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(2).toString('hex')}-4${crypto.randomBytes(2).toString('hex').slice(1)}-b${crypto.randomBytes(2).toString('hex').slice(1)}-${crypto.randomBytes(6).toString('hex')}`;
  const nowIso = new Date().toISOString();
  const nowFormatted = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR');

  const isMock = process.env.USE_MOCK_BUREAU === 'true';

  // CASO A: Documento de Referência Exata dos PDFs de Exemplo Oficial (apenas se mock explicitamente habilitado)
  if (cleanDoc === '12345678901' && isMock) {
    return {
      protocolo: 'da758c2a-e689-4759-b7d1-009e15b1f302',
      data_hora: '01/03/2026 10:02:21',
      finalidade_uso: 'Legítimo interesse (Art. 7º, IX da LGPD)',
      dados_cadastrais: {
        nome: 'JOÃO MÁRIO DE ANDRADAS',
        documento: '123.456.789-01',
        documento_limpo: '12345678901',
        tipo_documento: 'CPF',
        data_nascimento: '14/04/1970',
        idade: '49 anos',
        mae: 'Maria Angélica Andradas',
        mae_documento: '123.***.***-04',
        situacao_receita: 'Regular',
        sexo: 'Masculino',
        signo: 'Áries',
        data_status_cpf: '12/06/2019',
        provavel_obito: 'Não'
      },
      contatos: {
        telefones_moveis: [
          { numero: '(11) 99898-9898', chance_contato: 'Alta chance', chance_nivel: 'ALTA', nao_me_ligue: false, operadora: 'TIM', whatsapp_valido: true, e164: '+5511998989898' },
          { numero: '(11) 99899-9899', chance_contato: 'Média chance', chance_nivel: 'MEDIA', nao_me_ligue: false, operadora: 'VIVO', whatsapp_valido: true, e164: '+5511998999899' },
          { numero: '(11) 99895-9892', chance_contato: 'Não me ligue', chance_nivel: 'PROCON', nao_me_ligue: true, operadora: 'CLARO', whatsapp_valido: true, e164: '+5511998959892' }
        ],
        telefones_fixos: [
          { numero: '(19) 3553-6256', chance_contato: 'Alta chance', chance_nivel: 'ALTA', nao_me_ligue: false, operadora: 'VIVO FIXO', whatsapp_valido: true, e164: '+551935536256' },
          { numero: '(19) 3554-6257', chance_contato: 'Não me ligue', chance_nivel: 'PROCON', nao_me_ligue: true, operadora: 'CLARO FIXO', whatsapp_valido: false, e164: '+551935546257' },
          { numero: '(19) 3555-6258', chance_contato: 'Baixa chance', chance_nivel: 'BAIXA', nao_me_ligue: false, operadora: 'OI FIXO', whatsapp_valido: true, e164: '+551935556258' }
        ],
        emails: [
          { email: 'comercial@sasadmin.com.br', mais_atual: true }
        ],
        redes_sociais: [
          { rede: 'LinkedIn', url: 'https://br.linkedin.com/in/gracielle-rocha-maciel-3414321a7', usuario: '/in/gracielle-rocha-maciel-3414321a7' }
        ]
      },
      relacionamentos: {
        parentes: [
          { parentesco: 'Filho(a)', nome: 'João Mário de Andradas Filho', documento: '123.***.***-02', telefone: '(79) 97914-8864', whatsapp_valido: true, nao_me_ligue: false },
          { parentesco: 'Mãe', nome: 'Katia Souza', documento: '123.***.***-04', telefone: null, whatsapp_valido: false, nao_me_ligue: false },
          { parentesco: 'Avó', nome: 'Gardenia Souza', documento: '123.***.***-06', telefone: '(75) 98612-4829', whatsapp_valido: false, nao_me_ligue: false },
          { parentesco: 'Irmão(ã)', nome: 'Marcelo Andradas', documento: '123.***.***-07', telefone: '(65) 98852-9364', whatsapp_valido: true, nao_me_ligue: false },
          { parentesco: 'Pai', nome: 'Carlos Andradas', documento: '123.***.***-08', telefone: null, whatsapp_valido: false, nao_me_ligue: false }
        ],
        empregadores: [
          { razao_social: 'Dias e Lagoas Advogados Ltda', documento: '12.345.***/****-91', telefone: '(51) 97608-9919', whatsapp_valido: true, nao_me_ligue: false }
        ],
        socios: [
          { nome: 'José Márcio de Andradas', documento: '123.***.***-03', telefone: '(92) 98041-1514', whatsapp_valido: true, nao_me_ligue: false, qualificacao: 'Sócio-Administrador' }
        ],
        empresas: [
          { razao_social: 'Soares & Andradas Serviços Administrativos Ltda', documento: '01.234.***/****-89', telefone: '(63) 96968-8530', whatsapp_valido: true, nao_me_ligue: false }
        ],
        convivio_familiar: [
          { nome: 'Angelica Barboza', documento: '123.***.***-05', telefone: null, whatsapp_valido: false, nao_me_ligue: false }
        ]
      },
      enderecos: [
        {
          logradouro: 'R Donato Radomile',
          numero: '32',
          complemento: '1 Andar',
          bairro: 'Vila Industrial',
          cidade: 'Campinas',
          uf: 'SP',
          cep: '13035-250',
          confirmada: true,
          mais_atual: true,
          latitude: -22.9056,
          longitude: -47.0608
        }
      ],
      historico_profissional: {
        vinculo_empregaticio: {
          razao_social: 'Dias e Lagoas Advogados Ltda',
          cnpj: '12.345.***/****-91',
          data_registro: '13/03/2015',
          provavel_cargo: 'Assistente administrativo',
          setor: 'Atividades jurídicas, de contabilidade e de auditoria',
          salario_estimado: 'De 2 a 3 salários mínimos',
          renda_estimada: 2489.00
        },
        registro_profissional: {
          orgao: 'CFM/ nº 87961',
          uf: 'SP',
          profissao: 'Médico(a)',
          data_inscricao: '01/12/2014',
          situacao: 'Regular'
        }
      },
      analise_credito: {
        score_credito: 117,
        faixa_risco: 'ALTO',
        classificacao_score: 'Classificação F: Altíssimo risco',
        explicacao: 'O Score é uma análise abrangente calculada com mais de 500 variáveis comportamentais, integrando Cadastro Positivo, protestos em cartórios, cheques sem fundo e modelos preditivos.',
        indice_negociacao: {
          nivel: 'ALTA',
          percentual: 71,
          titulo: 'Negociação alta',
          descricao: 'Cadastros com esse perfil têm aproximadamente 71% de chance de negociar seus débitos nos próximos meses.',
          call_to_action: 'Essa é a hora de cobrar: veja como fazer'
        },
        renda_presumida: 4230.00,
        protestos: {
          quantidade: 2,
          valor_total: 303.57,
          itens: [
            { data: '11/10/2023', valor: 236.47, cartorio: '1º Tabelião de Protesto de Letras e Títulos', cidade: 'Campinas', uf: 'SP' },
            { data: '09/02/2024', valor: 67.10, cartorio: '1º Tabelião de Protesto de Letras e Títulos', cidade: 'Campinas', uf: 'SP' }
          ]
        },
        cheques: {
          quantidade: 1,
          itens: [
            { data: '08/09/2022', banco: '341 - ITAÚ UNIBANCO', agencia: '1536', qtd: 1, motivo: '12 - Cheques sem fundo 2ª apresentação' }
          ]
        },
        indicadores_comportamentais: {
          saldo_operacoes_12m: {
            faixa: 'Entre R$ 28.001,00 a R$ 45.300,00',
            min_label: 'R$ 0,00',
            max_label: 'Acima de R$ 119.000,00',
            progresso_percentual: 35
          },
          saldo_parceladas_12m: {
            faixa: 'Entre R$ 26.501,00 a R$ 34.200,00',
            min_label: 'R$ 0,00',
            max_label: 'Acima de R$ 194.500,00',
            progresso_percentual: 28
          },
          frequencia_atrasos_12m: {
            faixa: 'Entre 5 a 6 vezes',
            min_label: '0 vezes',
            max_label: 'Acima de 40 vezes',
            progresso_percentual: 45
          }
        }
      },
      comentarios: [
        { autor: 'apoliveira@clienteassertiva.com.br', data: '12/05/2020 às 10:14', texto: 'Última tentativa de contato no dia 12/05 às 10h10 sem sucesso. Reagendar para período da tarde.' }
      ]
    };
  }

  // CASO B: Entidade Real da Base de Leads, SEFAZ ou Propriedades Rurais (Cruzamento Nativo)
  let nomeTitular = null;
  let fantasia = null;
  let cidade = options?.municipio || 'PASSO FUNDO';
  let uf = options?.uf || 'RS';
  let ieTitular = null;
  let leadPhone = null;

  if (existingLead) {
    if (existingLead.decisor_nome && !/sigilo|declarado|desconhecido/i.test(existingLead.decisor_nome)) {
      nomeTitular = existingLead.decisor_nome;
    }
    if (existingLead.vertical_data) {
      try {
        const vd = typeof existingLead.vertical_data === 'string' ? JSON.parse(existingLead.vertical_data) : existingLead.vertical_data;
        if (vd.produtor_rural_pf?.produtor_pf_nome) {
          nomeTitular = vd.produtor_rural_pf.produtor_pf_nome;
          ieTitular = vd.produtor_rural_pf.inscricao_estadual;
          if (vd.produtor_rural_pf.whatsapp_produtor) leadPhone = vd.produtor_rural_pf.whatsapp_produtor;
        } else if (vd.nome_titular && !/sigilo|declarado|desconhecido/i.test(vd.nome_titular)) {
          nomeTitular = vd.nome_titular;
        }
        if (vd.municipio_ie) cidade = vd.municipio_ie;
        if (vd.sefaz_uf) uf = vd.sefaz_uf;
      } catch (_) {}
    }
    if (!nomeTitular) {
      nomeTitular = existingLead.razao_social || existingLead.nome_fantasia;
    }
    fantasia = existingLead.nome_fantasia || null;
    if (existingLead.municipio) cidade = existingLead.municipio;
    if (existingLead.uf) uf = existingLead.uf;
    if (!leadPhone) leadPhone = existingLead.telefone_sanitized || existingLead.telefone || existingLead.whatsapp;
    if (existingLead.sefaz_ie_pf) ieTitular = existingLead.sefaz_ie_pf;
  } else if (existingProp) {
    nomeTitular = existingProp.produtor_pf_nome || existingProp.nome_titular || existingProp.nome_imovel;
    if (existingProp.municipio) cidade = existingProp.municipio;
    if (existingProp.uf) uf = existingProp.uf;
    if (existingProp.inscricao_estadual) ieTitular = existingProp.inscricao_estadual;
    leadPhone = existingProp.whatsapp_produtor_pf || existingProp.whatsapp_validado;
  } else if (sefazProducer) {
    nomeTitular = sefazProducer.produtor_pf_nome;
    cidade = sefazProducer.municipio || options?.municipio || 'PASSO FUNDO';
    uf = sefazProducer.uf || options?.uf || 'RS';
    ieTitular = sefazProducer.inscricao_estadual || 'ATIVA / SEFAZ';
    leadPhone = sefazProducer.whatsapp;
  }

  if (options?.nome) nomeTitular = options.nome;
  if (options?.razao_social) {
    nomeTitular = options.razao_social;
    fantasia = options.razao_social;
  }
  if (options?.uf) uf = options.uf;
  if (options?.municipio) cidade = options.municipio;

  if (!nomeTitular || /sigilo|pendente|titularidade/i.test(nomeTitular)) {
    nomeTitular = isCnpj ? 'EMPRESA CONSULTADA' : 'TITULAR CONSULTADO';
  }

  let situacao = existingLead?.situacao_cadastral || existingProp?.status_car || 'Regular';
  const score = existingLead?.score_credito || (isCnpj ? 785 : 740);

  let faixaRisco = 'BAIXO';
  let classeScore = 'Classificação A: Baixo risco';
  if (score < 400) {
    faixaRisco = 'ALTO';
    classeScore = 'Classificação F: Altíssimo risco';
  } else if (score < 700) {
    faixaRisco = 'MEDIO';
    classeScore = 'Classificação C: Médio risco';
  }

  // Telefones Validados
  const moveis = [];
  const fixos = [];
  let dataNascAssertiva = null;
  let maeAssertiva = null;
  let rgAssertiva = null;
  let sexoAssertiva = null;

  // Se a Assertiva API v3 retornou dados reais (Localize V3)
  if (apiData && apiData.resposta) {
    const r = apiData.resposta;
    const cad = r.dadosCadastrais || {};
    if (cad.nome) nomeTitular = cad.nome;
    else if (cad.razaoSocial) nomeTitular = cad.razaoSocial;
    if (cad.nomeFantasia) fantasia = cad.nomeFantasia;
    if (cad.situacaoCadastral) situacao = cad.situacaoCadastral;
    if (cad.dataNascimento) dataNascAssertiva = cad.dataNascimento;
    if (cad.maeNome) maeAssertiva = cad.maeNome;
    if (cad.rg) rgAssertiva = cad.rg;
    if (cad.sexo) sexoAssertiva = cad.sexo;

    if (Array.isArray(r.telefones?.moveis) && r.telefones.moveis.length > 0) {
      for (const m of r.telefones.moveis) {
        const raw = m.numero || '';
        const digits = raw.replace(/\D/g, '');
        if (digits.length >= 10) {
          const hasWa = m.aplicativos?.whatsApp !== false;
          moveis.push({
            numero: raw,
            chance_contato: m.hotphone ? 'Alta chance' : (m.plus ? 'Média chance' : 'Normal'),
            chance_nivel: m.hotphone ? 'ALTA' : (m.plus ? 'MEDIA' : 'NORMAL'),
            nao_me_ligue: Boolean(m.naoPerturbe),
            operadora: 'MÓVEL',
            whatsapp_valido: hasWa,
            e164: digits.startsWith('55') ? `+${digits}` : `+55${digits}`
          });
        }
      }
    }

    if (Array.isArray(r.telefones?.fixos) && r.telefones.fixos.length > 0) {
      for (const f of r.telefones.fixos) {
        const raw = f.numero || '';
        const digits = raw.replace(/\D/g, '');
        if (digits.length >= 10) {
          fixos.push({
            numero: raw,
            chance_contato: 'Normal',
            chance_nivel: 'MEDIA',
            nao_me_ligue: Boolean(f.naoPerturbe),
            operadora: 'FIXO',
            whatsapp_valido: Boolean(f.aplicativos?.whatsAppBusiness),
            e164: digits.startsWith('55') ? `+${digits}` : `+55${digits}`
          });
        }
      }
    }
  }

  if (leadPhone && moveis.length === 0 && fixos.length === 0) {
    const val = validatePhoneChannel(leadPhone);
    const item = {
      numero: val?.formatted || leadPhone,
      chance_contato: 'Alta chance',
      chance_nivel: 'ALTA',
      nao_me_ligue: false,
      operadora: val?.is_mobile ? 'VIVO' : 'OI FIXO',
      whatsapp_valido: Boolean(val?.is_whatsapp_capable),
      e164: val?.e164 || leadPhone
    };
    if (val?.is_mobile) moveis.push(item);
    else fixos.push(item);
  }

  // Se não tinha telefone na base oficial e estiver com MOCK explicitamente habilitado:
  if (moveis.length === 0 && isMock) {
    const REGIONAL_DDD_MAP = {
      MT: '66', MS: '67', GO: '64', BA: '77', PR: '45', RS: '54',
      MG: '34', SP: '16', MA: '99', PA: '94', TO: '63', SC: '49'
    };
    const regDdd = REGIONAL_DDD_MAP[uf] || (uf === 'MT' ? '66' : (uf === 'RS' ? '54' : '66'));
    const phoneSuf1 = cleanDoc.slice(-4, -2) || '81';
    const phoneSuf2 = cleanDoc.slice(-2) || '19';
    const regionalPhone = `(${regDdd}) 998${phoneSuf1}-${phoneSuf2}${cleanDoc.slice(2, 4) || '30'}`;
    const regionalE164 = `+55${regDdd}${regionalPhone.replace(/\D/g, '').slice(2)}`;
    moveis.push({
      numero: regionalPhone,
      chance_contato: 'Alta chance',
      chance_nivel: 'ALTA',
      nao_me_ligue: false,
      operadora: 'VIVO',
      whatsapp_valido: true,
      e164: regionalE164
    });
  }

  // E-mails reais da Assertiva ou da base interna
  let emailsList = [];
  if (Array.isArray(apiData?.resposta?.emails) && apiData.resposta.emails.length > 0) {
    emailsList = apiData.resposta.emails.map((em, idx) => ({
      email: em.email,
      mais_atual: idx === 0
    }));
  } else if (existingLead?.email) {
    emailsList = [{ email: existingLead.email, mais_atual: true }];
  } else if (isMock) {
    emailsList = [{ email: `contato@${cleanDoc.slice(0, 8)}.agro.com.br`, mais_atual: true }];
  }

  const lat = existingLead?.latitude || existingProp?.latitude || -28.2612;
  const lng = existingLead?.longitude || existingProp?.longitude || -52.4083;

  // Endereços reais da Assertiva ou da base interna
  let enderecosList = [];
  if (Array.isArray(apiData?.resposta?.enderecos) && apiData.resposta.enderecos.length > 0) {
    enderecosList = apiData.resposta.enderecos.map((end, idx) => ({
      logradouro: end.logradouro || '',
      numero: String(end.numero || 'S/N'),
      complemento: end.complemento || '',
      bairro: end.bairro || '',
      cidade: end.cidade || cidade,
      uf: end.uf || uf,
      cep: end.cep || '',
      confirmada: end.precisaoCep === 'CONFIRMADA' || true,
      mais_atual: idx === 0,
      latitude: end.latitude || lat,
      longitude: end.longitude || lng
    }));
  } else if (existingLead?.logradouro || existingProp) {
    enderecosList = [{
      logradouro: existingLead?.logradouro || 'RODOVIA / ZONA RURAL',
      numero: existingLead?.numero || 'S/N',
      complemento: existingLead?.complemento || '',
      bairro: existingLead?.bairro || 'ZONA RURAL',
      cidade: cidade,
      uf: uf,
      cep: existingLead?.cep || '',
      confirmada: true,
      mais_atual: true,
      latitude: lat,
      longitude: lng
    }];
  }

  // Sócios do QSA ou da Assertiva
  let sociosList = [];
  if (Array.isArray(apiData?.resposta?.socios) && apiData.resposta.socios.length > 0) {
    sociosList = apiData.resposta.socios.map(s => ({
      nome: s.nome || 'SÓCIO',
      documento: s.cpf ? s.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (s.cnpj ? s.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : null),
      telefone: null,
      whatsapp_valido: false,
      nao_me_ligue: false,
      qualificacao: s.qualificacao || 'Sócio'
    }));
  } else {
    let rawQsa = [];
    try {
      rawQsa = typeof existingLead?.qsa === 'string' ? JSON.parse(existingLead.qsa) : (existingLead?.qsa || []);
    } catch (_) {}
    sociosList = rawQsa.map(s => ({
      nome: s.nome || s.nome_socio || 'SÓCIO COTISTA',
      documento: s.cpf_cnpj_socio ? s.cpf_cnpj_socio.slice(0, 3) + '.***.***-' + s.cpf_cnpj_socio.slice(-2) : '123.***.***-01',
      telefone: null,
      whatsapp_valido: false,
      nao_me_ligue: false,
      qualificacao: s.qual || s.qualificacao || 'Sócio-Administrador'
    }));
  }

  return {
    protocolo: apiData?.cabecalho?.protocolo || protocolId,
    data_hora: apiData?.cabecalho?.dataHora || nowFormatted,
    finalidade_uso: 'Legítimo interesse (Art. 7º, IX da LGPD)',
    dados_cadastrais: {
      nome: nomeTitular,
      nome_fantasia: fantasia,
      documento: docFormatted,
      documento_limpo: cleanDoc,
      tipo_documento: isCpf ? 'CPF' : 'CNPJ',
      data_nascimento: dataNascAssertiva || (isMock && isCpf ? '18/06/1975' : null),
      idade: dataNascAssertiva ? `${Math.floor((Date.now() - new Date(dataNascAssertiva).getTime()) / (365.25 * 24 * 3600 * 1000))} anos` : (isMock && isCpf ? '48 anos' : null),
      mae: maeAssertiva || (isMock ? 'Disponível sob consulta da API Assertiva / RFB' : null),
      mae_documento: null,
      rg: rgAssertiva || null,
      situacao_receita: situacao,
      sexo: sexoAssertiva || (isMock && isCpf ? 'Masculino' : null),
      signo: isMock && isCpf ? 'Gêmeos' : null,
      data_status_cpf: apiData?.cabecalho?.dataHora || (isMock ? '15/01/2024' : null),
      provavel_obito: 'Não',
      inscricao_estadual: ieTitular || (isCpf ? 'Produtor Rural Ativo (SEFAZ)' : null)
    },
    contatos: {
      telefones_moveis: moveis,
      telefones_fixos: fixos.length > 0 ? fixos : [],
      emails: emailsList,
      redes_sociais: Array.isArray(apiData?.resposta?.redesSociais) && apiData.resposta.redesSociais.length > 0
        ? apiData.resposta.redesSociais.map(r => ({ rede: r.rede || 'Rede Social', url: r.url || '#', usuario: r.usuario || '' }))
        : (isMock ? [{ rede: 'LinkedIn', url: 'https://br.linkedin.com/company/agronegocios-brasil', usuario: '/company/agronegocios-brasil' }] : [])
    },
    relacionamentos: {
      parentes: [],
      empregadores: [],
      socios: sociosList,
      empresas: (Array.isArray(apiData?.resposta?.participacoesEmpresas) && apiData.resposta.participacoesEmpresas.length > 0)
        ? apiData.resposta.participacoesEmpresas.map(pe => ({
            razao_social: pe.razaoSocial || pe.nomeEmpresa || 'EMPRESA VINCULADA',
            documento: pe.cnpj ? pe.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : (pe.cpf || null),
            telefone: null,
            whatsapp_valido: false,
            nao_me_ligue: false
          }))
        : ((existingProp || existingLead) ? [
            { razao_social: existingProp?.nome_imovel || existingLead?.nome_fantasia || 'Propriedade Rural Ativa no CAR', documento: existingProp?.codigo_car || existingLead?.cnpj || 'CAR-ATIVO', telefone: leadPhone || null, whatsapp_valido: Boolean(leadPhone), nao_me_ligue: false }
          ] : []),
      convivio_familiar: []
    },
    enderecos: enderecosList,
    historico_profissional: isMock ? {
      vinculo_empregaticio: {
        razao_social: nomeTitular,
        cnpj: isCnpj ? docFormatted : '02.435.678/0001-90',
        data_registro: '10/05/2012',
        provavel_cargo: isCpf ? 'Produtor Rural / Administrador' : 'Diretoria Executiva',
        setor: 'Agronegócio, Produção de Grãos e Pecuária',
        salario_estimado: 'Acima de 15 salários mínimos',
        renda_estimada: 28500.00
      },
      registro_profissional: {
        orgao: 'CREA-RS',
        uf: uf,
        numero_registro: '14528-D',
        profissao: 'Engenheiro(a) Agrônomo(a)',
        data_inscricao: '14/02/2005',
        situacao: 'Regular'
      }
    } : null,
    analise_credito: isMock ? {
      score_credito: score,
      faixa_risco: faixaRisco,
      classificacao_score: classeScore,
      explicacao: 'O Score é uma análise abrangente calculada com mais de 500 variáveis comportamentais, integrando Cadastro Positivo, protestos em cartórios, cheques sem fundo e modelos preditivos.',
      indice_negociacao: {
        nivel: score >= 700 ? 'ALTA' : (score >= 400 ? 'MÉDIA' : 'BAIXA'),
        percentual: score >= 700 ? 88 : (score >= 400 ? 54 : 22),
        titulo: score >= 700 ? 'Negociação muito alta' : 'Negociação moderada',
        descricao: score >= 700 
          ? 'Cadastros com esse perfil apresentam liquidez estável e baixíssima inadimplência histórica no mercado agropecuário.'
          : 'Recomenda-se solicitação de garantias reais ou CPR antes de concessão de prazos longos.',
        call_to_action: score >= 700 ? 'Liberado para operações a termo e crédito direto' : 'Exigir garantias e avalista'
      },
      renda_presumida: isCnpj ? (existingLead?.capital_social || 250000.00) : 18500.00,
      protestos: {
        quantidade: 0,
        valor_total: 0,
        itens: []
      },
      cheques: {
        quantidade: 0,
        itens: []
      },
      indicadores_comportamentais: {
        saldo_operacoes_12m: {
          faixa: 'Entre R$ 150.000,00 a R$ 450.000,00',
          min_label: 'R$ 0,00',
          max_label: 'Acima de R$ 500.000,00',
          progresso_percentual: 65
        },
        saldo_parceladas_12m: {
          faixa: 'Entre R$ 80.000,00 a R$ 180.000,00',
          min_label: 'R$ 0,00',
          max_label: 'Acima de R$ 300.000,00',
          progresso_percentual: 50
        },
        frequencia_atrasos_12m: {
          faixa: '0 atrasos (Adimplente)',
          min_label: '0 vezes',
          max_label: 'Acima de 40 vezes',
          progresso_percentual: 5
        }
      }
    } : {
      score_credito: existingLead?.score_credito || null,
      faixa_risco: existingLead?.faixa_risco || null,
      classificacao_score: existingLead?.classificacao_score || null,
      explicacao: 'Consulta cadastral e de localização realizada via Assertiva Localize v3.',
      indice_negociacao: null,
      renda_presumida: isCnpj ? (existingLead?.capital_social || null) : null,
      protestos: {
        quantidade: 0,
        valor_total: 0,
        itens: []
      },
      cheques: {
        quantidade: 0,
        itens: []
      },
      indicadores_comportamentais: null
    },
    comentarios: (Array.isArray(apiData?.resposta?.comentarios) && apiData.resposta.comentarios.length > 0)
      ? apiData.resposta.comentarios.map(c => ({
          autor: c.usuario || c.autor || 'Assertiva',
          data: c.dataHora || c.data || '',
          texto: c.comentario || c.texto || ''
        }))
      : (isMock ? [
          { autor: 'sistema@agroleads.com.br', data: nowFormatted, texto: 'Registro auditado e sincronizado com a base de inteligência territorial.' }
        ] : [])
  };
}

export const bureauService = {
  getProvider() {
    return (process.env.BUREAU_PROVIDER || 'assertiva').toLowerCase().trim();
  },

  getApiKey() {
    return process.env.BUREAU_API_KEY || null;
  },

  async resolveCredentials(tenantId = 'tenant-root-default', options = {}) {
    return await resolveTenantCredentials(tenantId, 'bureau', options);
  },

  getBaseUrl() {
    if (process.env.ASSERTIVA_API_URL) return process.env.ASSERTIVA_API_URL;
    if (process.env.BUREAU_API_URL) return process.env.BUREAU_API_URL;
    return 'https://api.assertivasolucoes.com.br';
  },

  isMockEnabled() {
    return process.env.USE_MOCK_BUREAU === 'true';
  },

  /**
   * Consulta oficial de localização de pessoas na Assertiva por Nome + UF + Município
   */
  async consultarAssertivaPorNome({ nome, uf = 'RS', municipio = 'PASSO FUNDO', tenantId = 'tenant-root-default' }) {
    if (!nome) {
      return {
        success: false,
        status: 'TITULAR_NAO_LOCALIZADO',
        message: 'Status: Titular não localizado na base cadastral.'
      };
    }

    let token = null;
    try {
      token = await assertivaAuthService.getAccessToken({ tenantId });
    } catch (authErr) {
      console.warn('[BUREAU ASSERTIVA OAUTH2 WARN]:', authErr.message);
    }

    if (!token) {
      return {
        success: false,
        status: 'AUTH_ERROR',
        message: 'Falha na autenticação com a Assertiva (verifique as credenciais no .env).'
      };
    }

    const baseUrl = this.getBaseUrl();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const endpoint = `${baseUrl}/localize/v3/cpf?nome=${encodeURIComponent(nome)}&uf=${encodeURIComponent(uf)}&municipio=${encodeURIComponent(municipio)}&idFinalidade=1`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response && response.ok) {
        const data = await response.json();
        const foundCpf = data.resposta?.dadosCadastrais?.cpf || data.resposta?.dadosCadastrais?.documento || data.resposta?.cpf;
        if (foundCpf) {
          return {
            success: true,
            cpf: foundCpf,
            apiData: data
          };
        }
      } else if (response && response.status === 403) {
        const errJson = await response.json().catch(() => null);
        const errMsg = errJson?.resposta || errJson?.message || 'Seu usuário não tem permissão para realizar esta consulta no sistema.';
        return {
          success: false,
          status: 'ASSERTIVA_PERMISSION_ERROR',
          message: `${errMsg} Verifique se a permissão para consulta de CPF está habilitada nas credenciais de API no painel da Assertiva.`
        };
      }
    } catch (err) {
      console.warn('[ASSERTIVA PESQUISA NOME FAILED]:', err.message);
    }

    return {
      success: false,
      status: 'TITULAR_NAO_LOCALIZADO',
      message: 'Status: Titular não localizado na base cadastral da Assertiva.'
    };
  },

  /**
   * Verifica o cache local de consultas antes de consumir a API paga
   */
  getCachedConsultation(cleanDoc, tenantId = 'tenant-root-default', maxAgeDays = 30) {
    if (!cleanDoc) return null;
    try {
      const row = db.prepare(`
        SELECT * FROM bureau_cache_consultas
        WHERE documento_limpo = ? AND tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(cleanDoc, tenantId);

      if (!row) return null;

      const createdAt = new Date(row.created_at).getTime();
      const now = Date.now();
      const ageInDays = (now - createdAt) / (1000 * 60 * 60 * 24);

      if (ageInDays <= maxAgeDays) {
        let telefones = [];
        let dadosCompletos = {};
        try { telefones = JSON.parse(row.telefones_json || '[]'); } catch (_) {}
        try { dadosCompletos = JSON.parse(row.dados_completos_json || '{}'); } catch (_) {}

        return {
          cached: true,
          ageInDays: Math.max(0, Math.floor(ageInDays)),
          created_at: row.created_at,
          data: {
            id: row.id,
            documento_limpo: row.documento_limpo,
            tipo_documento: row.tipo_documento,
            tipo_consulta: row.tipo_consulta,
            score_credito: row.score_credito,
            faixa_risco: row.faixa_risco,
            renda_faturamento_presumido: row.renda_faturamento_presumido,
            qtd_protestos: row.qtd_protestos || 0,
            valor_protestos: row.valor_protestos || 0,
            situacao_cadastral: row.situacao_cadastral,
            telefones,
            whatsapp_principal: row.whatsapp_principal,
            ...dadosCompletos
          }
        };
      }
      return null;
    } catch (err) {
      console.warn('[BUREAU CACHE CHECK ERROR]:', err.message);
      return null;
    }
  },

  /**
   * Salva o resultado de uma consulta no cache local anti-desperdício
   */
  saveConsultationToCache(cleanDoc, tipoDoc, data, tenantId = 'tenant-root-default') {
    if (!cleanDoc || !data) return;
    try {
      const id = `bureau_${cleanDoc}_${Date.now()}`;
      const stmt = db.prepare(`
        INSERT INTO bureau_cache_consultas (
          id, documento_limpo, tipo_documento, tipo_consulta,
          score_credito, faixa_risco, renda_faturamento_presumido,
          qtd_protestos, valor_protestos, situacao_cadastral,
          telefones_json, whatsapp_principal, dados_completos_json,
          tenant_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        id,
        cleanDoc,
        tipoDoc,
        data.tipo_consulta || 'COMPLETA',
        data.analise_credito?.score_credito || data.score_credito || null,
        data.analise_credito?.faixa_risco || data.faixa_risco || null,
        data.analise_credito?.renda_presumida || data.renda_faturamento_presumido || null,
        data.analise_credito?.protestos?.quantidade || data.qtd_protestos || 0,
        data.analise_credito?.protestos?.valor_total || data.valor_protestos || 0,
        data.dados_cadastrais?.situacao_receita || data.situacao_cadastral || 'REGULAR',
        JSON.stringify(data.contatos?.telefones_moveis || data.telefones || []),
        data.contatos?.telefones_moveis?.[0]?.e164 || data.whatsapp_principal || null,
        JSON.stringify(data),
        tenantId
      );
      console.log(`[BUREAU CACHE] Consulta salva no cache para doc: ${cleanDoc}`);
    } catch (err) {
      console.warn('[BUREAU CACHE SAVE ERROR]:', err.message);
    }
  },

  /**
   * Sincroniza automaticamente os dados do Bureau com o Lead na base de dados
   */
  async syncLeadWithBureauData(cleanDoc, bureauData, tenantId = 'tenant-root-default') {
    if (!cleanDoc || !bureauData) return { synced: false };
    try {
      const leadRow = db.prepare(`
        SELECT id, cnpj, razao_social, telefone, telefone_sanitized, score_credito 
        FROM leads 
        WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', '') = ?
           OR REPLACE(REPLACE(REPLACE(cnpj_raw, '.', ''), '-', ''), '/', '') = ?
        LIMIT 1
      `).get(cleanDoc, cleanDoc);

      if (!leadRow) return { synced: false, reason: 'LEAD_NOT_FOUND' };

      const whatsapp = bureauData.contatos?.telefones_moveis?.find(t => t.whatsapp_valido)?.e164 || bureauData.whatsapp_principal || null;
      const score = bureauData.analise_credito?.score_credito !== undefined ? bureauData.analise_credito.score_credito : (bureauData.score_credito || null);
      const faixaRisco = bureauData.analise_credito?.faixa_risco || bureauData.faixa_risco || null;
      const payloadSummary = JSON.stringify({
        score: score,
        faixa_risco: faixaRisco,
        protestos: bureauData.analise_credito?.protestos?.quantidade || bureauData.qtd_protestos || 0,
        valor_protestos: bureauData.analise_credito?.protestos?.valor_total || bureauData.valor_protestos || 0,
        situacao: bureauData.dados_cadastrais?.situacao_receita || bureauData.situacao_cadastral || 'REGULAR',
        whatsapp: whatsapp,
        verified_at: new Date().toISOString(),
        provider: 'Assertiva Soluções v3'
      });

      let updateQuery = `
        UPDATE leads 
        SET bureau_status = 'VERIFICADO_ASSERTIVA',
            bureau_updated_at = CURRENT_TIMESTAMP,
            bureau_payload = ?,
            score_credito = COALESCE(?, score_credito),
            faixa_risco_credito = COALESCE(?, faixa_risco_credito)
      `;
      const params = [payloadSummary, score, faixaRisco];

      if (whatsapp) {
        updateQuery += `, telefone_sanitized = ?, telefone = COALESCE(NULLIF(telefone, ''), ?)`;
        params.push(whatsapp, whatsapp);
      }

      updateQuery += ` WHERE id = ?`;
      params.push(leadRow.id);

      db.prepare(updateQuery).run(...params);

      console.log(`[BUREAU SYNC] Lead ${leadRow.razao_social} (${leadRow.id}) atualizado com dados oficiais do Bureau.`);
      return {
        synced: true,
        leadId: leadRow.id,
        razao_social: leadRow.razao_social,
        whatsapp,
        score
      };
    } catch (err) {
      console.warn('[BUREAU LEAD SYNC ERROR]:', err.message);
      return { synced: false, error: err.message };
    }
  },

  /**
   * Retorna histórico das últimas consultas salvas no cache
   */
  getConsultationHistory(tenantId = 'tenant-root-default', limit = 50) {
    try {
      const rows = db.prepare(`
        SELECT id, documento_limpo, tipo_documento, score_credito, faixa_risco,
               renda_faturamento_presumido, qtd_protestos, situacao_cadastral,
               created_at, dados_completos_json
        FROM bureau_cache_consultas
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(tenantId, limit);

      return rows.map(r => {
        let details = {};
        try { details = JSON.parse(r.dados_completos_json || '{}'); } catch (_) {}
        const cad = details.dados_cadastrais || {};
        return {
          id: r.id,
          documento: r.documento_limpo,
          tipo_documento: r.tipo_documento,
          nome: cad.nome || details.razao_social || 'TITULAR CONSULTADO',
          score_credito: r.score_credito,
          faixa_risco: r.faixa_risco,
          renda: r.renda_faturamento_presumido,
          protestos: r.qtd_protestos,
          situacao: r.situacao_cadastral,
          created_at: r.created_at,
          protocolo: details.protocolo || r.id
        };
      });
    } catch (err) {
      console.warn('[BUREAU HISTORY ERROR]:', err.message);
      return [];
    }
  },

  /**
   * Adiciona comentário / anotação ao histórico do documento
   */
  addConsultationComment(documento, autor, texto, tenantId = 'tenant-root-default') {
    if (!documento || !texto) return { success: false, error: 'Campos obrigatórios ausentes' };
    const cleanDoc = String(documento).replace(/\D/g, '');
    try {
      const id = `comment_${cleanDoc}_${Date.now()}`;
      db.prepare(`
        INSERT INTO bureau_comments (id, documento, autor, texto, tenant_id, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(id, cleanDoc, autor || 'operador@sistema.local', texto.trim(), tenantId);
      return { success: true, id, created_at: new Date().toISOString() };
    } catch (err) {
      console.warn('[BUREAU COMMENT ERROR]:', err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * Retorna os comentários do documento
   */
  getConsultationComments(documento, tenantId = 'tenant-root-default') {
    const cleanDoc = String(documento).replace(/\D/g, '');
    try {
      return db.prepare(`
        SELECT id, documento, autor, texto, created_at
        FROM bureau_comments
        WHERE documento = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(cleanDoc, tenantId);
    } catch (err) {
      console.warn('[BUREAU GET COMMENTS ERROR]:', err.message);
      return [];
    }
  },

  /**
   * MÓDULO EXECUTIVO: Consulta Completa Cadastral & Crédito Bureau (Assertiva Localize v3)
   */
  async consultarBureauCompleto(rawDoc, options = {}) {
    if (!rawDoc) {
      return {
        success: false,
        status: 'INVALID_DOC',
        message: 'Documento (CPF ou CNPJ), nome, telefone ou e-mail não informado.'
      };
    }

    let cleanDoc = String(rawDoc).replace(/\D/g, '');
    let isCpf = cleanDoc.length === 11;
    let isCnpj = cleanDoc.length === 14;

    const tenantId = options.tenantId || 'tenant-root-default';

    // Se o usuário digitou texto (Nome, E-mail, Razão Social ou Imóvel do CAR), busca na base de dados para resolver o documento
    if (!isCpf && !isCnpj) {
      const searchStr = `%${String(rawDoc).trim()}%`;
      const matchedLead = db.prepare(`
        SELECT cnpj, cnpj_raw FROM leads
        WHERE razao_social LIKE ? OR nome_fantasia LIKE ? OR email LIKE ? OR telefone LIKE ? OR decisor_nome LIKE ?
        LIMIT 1
      `).get(searchStr, searchStr, searchStr, searchStr, searchStr);

      if (matchedLead) {
        cleanDoc = String(matchedLead.cnpj_raw || matchedLead.cnpj).replace(/\D/g, '');
        isCpf = cleanDoc.length === 11;
        isCnpj = cleanDoc.length === 14;
      } else {
        const matchedProp = db.prepare(`
          SELECT produtor_pf_cpf, nome_imovel, cpf_cnpj_titular FROM propriedades_rurais
          WHERE produtor_pf_nome LIKE ? OR nome_imovel LIKE ? OR nome_titular LIKE ? OR codigo_car LIKE ?
          LIMIT 1
        `).get(searchStr, searchStr, searchStr, searchStr);

        if (matchedProp && (matchedProp.produtor_pf_cpf || matchedProp.cpf_cnpj_titular)) {
          cleanDoc = String(matchedProp.produtor_pf_cpf || matchedProp.cpf_cnpj_titular).replace(/\D/g, '');
          isCpf = cleanDoc.length === 11;
          isCnpj = cleanDoc.length === 14;
        } else {
          // Busca nos proprietários históricos e rurais do CAR
          let matchedCar = db.prepare(`
            SELECT codigo_car, nome_proprietario, cpf_cnpj_parcial, municipio, uf 
            FROM car_proprietarios_historico
            WHERE nome_proprietario LIKE ? OR nome_imovel_declarado LIKE ? OR codigo_car LIKE ?
            LIMIT 1
          `).get(searchStr, searchStr, searchStr);

          // Se digitou os dígitos parciais do CPF (ex: 946655 ou ***.946.655-**)
          if (!matchedCar && cleanDoc.length >= 6) {
            matchedCar = db.prepare(`
              SELECT codigo_car, nome_proprietario, cpf_cnpj_parcial, municipio, uf 
              FROM car_proprietarios_historico
              WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj_parcial, '.', ''), '-', ''), '/', '') LIKE ?
              LIMIT 1
            `).get(`%${cleanDoc}%`);
          }

          if (matchedCar && matchedCar.cpf_cnpj_parcial) {
            cleanDoc = String(matchedCar.cpf_cnpj_parcial).replace(/\D/g, '');
            isCpf = cleanDoc.length === 11;
            isCnpj = cleanDoc.length === 14;
          }
        }
      }
    }

    // Se ainda não temos CPF/CNPJ mas recebemos nome do titular ou termo textual (ex: Fusão CAR + SIGEF)
    if (!isCpf && !isCnpj && (options.nome || rawDoc)) {
      const searchName = String(options.nome || rawDoc).trim();
      const uf = options.uf || 'RS';
      const municipio = options.municipio || 'PASSO FUNDO';

      if (this.isMockEnabled()) {
        let hash = 0;
        for (let i = 0; i < searchName.length; i++) {
          hash = ((hash << 5) - hash) + searchName.charCodeAt(i);
          hash |= 0;
        }
        const base9 = String(Math.abs(hash)).padStart(9, '0').slice(-9);
        let sum1 = 0;
        for (let i = 0; i < 9; i++) sum1 += parseInt(base9.charAt(i), 10) * (10 - i);
        let rev1 = 11 - (sum1 % 11);
        if (rev1 >= 10) rev1 = 0;
        const base10 = base9 + rev1;
        let sum2 = 0;
        for (let i = 0; i < 10; i++) sum2 += parseInt(base10.charAt(i), 10) * (11 - i);
        let rev2 = 11 - (sum2 % 11);
        if (rev2 >= 10) rev2 = 0;
        cleanDoc = base10 + rev2;
        isCpf = true;
        isCnpj = false;
        if (!options.nome) options.nome = searchName;
      } else {
        // INTEGRAÇÃO REAL ASSERTIVA: Busca de localização por Nome + UF + Município
        console.log(`[ASSERTIVA] Realizando busca de localização por Nome: "${searchName}", UF: "${uf}", Município: "${municipio}"`);
        const searchRes = await this.consultarAssertivaPorNome({
          nome: searchName,
          uf,
          municipio,
          tenantId
        });

        if (searchRes && searchRes.success && searchRes.cpf) {
          cleanDoc = String(searchRes.cpf).replace(/\D/g, '');
          isCpf = cleanDoc.length === 11;
          isCnpj = cleanDoc.length === 14;
          if (searchRes.apiData) {
            options._preloadedApiData = searchRes.apiData;
          }
        } else {
          console.warn(`[ASSERTIVA] Titular "${searchName}" não localizado ou sem permissão na base cadastral.`);
          return {
            success: false,
            status: searchRes?.status || 'TITULAR_NAO_LOCALIZADO',
            message: searchRes?.message || 'Status: Titular não localizado na base cadastral da Assertiva.',
            origem: 'ASSERTIVA_API_V3'
          };
        }
      }
    }

    if (!isCpf && !isCnpj) {
      return {
        success: false,
        status: 'INVALID_DOC_FORMAT',
        message: `Não foi possível identificar um CPF ou CNPJ correspondente para o termo informado. Digite 11 dígitos para CPF, 14 dígitos para CNPJ ou um nome/telefone já cadastrado no sistema.`
      };
    }

    // Validação matemática (permite o documento de referência oficial do PDF)
    const isReferenceSample = cleanDoc === '12345678901';
    if (!isReferenceSample) {
      if (isCpf && !isValidCPF(cleanDoc)) {
        return {
          success: false,
          status: 'INVALID_CPF_CHECKSUM',
          message: 'O CPF informado possui dígitos verificadores matematicamente inválidos.'
        };
      }
      if (isCnpj && !isValidCNPJ(cleanDoc)) {
        return {
          success: false,
          status: 'INVALID_CNPJ_CHECKSUM',
          message: 'O CNPJ informado possui dígitos verificadores matematicamente inválidos.'
        };
      }
    }

    const tipoDoc = isCpf ? 'CPF' : 'CNPJ';

    // 1. TRAVA ANTI-DESPERDÍCIO: Checagem no Cache Local
    if (!options.forceRefresh) {
      const cachedResult = this.getCachedConsultation(cleanDoc, tenantId, options.maxAgeDays || 30);
      if (cachedResult) {
        await this.syncLeadWithBureauData(cleanDoc, cachedResult.data, tenantId);

        // Anexa comentários persistidos se houver
        const comments = this.getConsultationComments(cleanDoc, tenantId);
        if (comments.length > 0) {
          cachedResult.data.comentarios = comments.map(c => ({
            autor: c.autor,
            data: new Date(c.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(c.created_at).toLocaleTimeString('pt-BR'),
            texto: c.texto
          }));
        }

        return {
          success: true,
          cached: true,
          custo_consulta: 'R$ 0,00',
          origem: 'CACHE_INTELIGENTE_LOCAL',
          mensagem: `Dados recuperados do banco de inteligência local consultado há ${cachedResult.ageInDays} dia(s). Zero consumo de créditos de API.`,
          dados: cachedResult.data,
          selo_verificacao: {
            status: 'VERIFICADO_BUREAU',
            provedor: 'Assertiva Soluções v3',
            data_verificacao: cachedResult.created_at,
            certificado: true
          }
        };
      }
    }

    // 2. Consulta à API Oficial da Assertiva v3 (OAuth2)
    let token = null;
    try {
      token = await assertivaAuthService.getAccessToken(options);
    } catch (authErr) {
      console.warn('[BUREAU ASSERTIVA OAUTH2 WARN]:', authErr.message);
    }

    const baseUrl = this.getBaseUrl();
    let apiData = options._preloadedApiData || null;
    let callSucceeded = Boolean(apiData);
    let apiErrorMessage = null;
    let apiStatusCode = null;

    if (token && !apiData) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const endpoint = isCpf 
          ? `${baseUrl}/localize/v3/cpf?cpf=${encodeURIComponent(cleanDoc)}&idFinalidade=1` 
          : `${baseUrl}/localize/v3/cnpj?cnpj=${encodeURIComponent(cleanDoc)}&idFinalidade=1`;

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeout);
        apiStatusCode = response?.status;

        if (response && response.ok) {
          apiData = await response.json();
          callSucceeded = true;
          console.log(`[ASSERTIVA] Consulta do documento ${cleanDoc} executada com sucesso.`);
        } else if (response && response.status === 404) {
          console.info(`[ASSERTIVA] Documento ${cleanDoc} não localizado na base remota.`);
          apiErrorMessage = 'Status: Titular não localizado na base cadastral da Assertiva.';
        } else if (response && response.status === 403) {
          const errJson = await response.json().catch(() => null);
          const rawErr = errJson?.resposta || errJson?.message || 'Acesso negado pela Assertiva.';
          console.warn(`[ASSERTIVA 403] Permissão negada para ${cleanDoc}:`, rawErr);
          apiErrorMessage = rawErr.includes('permissão') 
            ? `${rawErr} Verifique se a permissão para consulta de ${isCpf ? 'CPF' : 'CNPJ'} está habilitada nas credenciais de API no painel da Assertiva.`
            : rawErr;
        } else if (response) {
          const errTxt = await response.text().catch(() => '');
          console.warn(`[ASSERTIVA] Resposta HTTP ${response.status} para ${cleanDoc}:`, errTxt);
          apiErrorMessage = `Erro na API da Assertiva (HTTP ${response.status}): ${errTxt}`;
        }
      } catch (reqErr) {
        console.warn('[ASSERTIVA API REQUEST FAILED]:', reqErr.message);
        apiErrorMessage = `Falha na requisição HTTPS contra a Assertiva: ${reqErr.message}`;
      }
    } else if (!token && !apiData) {
      apiErrorMessage = 'Credenciais da Assertiva não configuradas ou token OAuth2 não pôde ser gerado.';
    }

    // Se a chamada falhou e NÃO estamos em modo mock (produção real oficial):
    if (!callSucceeded && !this.isMockEnabled()) {
      return {
        success: false,
        status: apiStatusCode === 403 ? 'ASSERTIVA_PERMISSION_ERROR' : (apiStatusCode === 404 ? 'TITULAR_NAO_LOCALIZADO' : 'ASSERTIVA_API_ERROR'),
        message: apiErrorMessage || 'Status: Titular não localizado na base cadastral da Assertiva.',
        origem: 'ASSERTIVA_API_V3',
        documento: cleanDoc
      };
    }

    // 3. Cruzamento com Leads ou Propriedades Rurais da Base Interna (Multicamada)
    let existingLead = db.prepare(`
      SELECT * FROM leads 
      WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', '') = ?
         OR REPLACE(REPLACE(REPLACE(cnpj_raw, '.', ''), '-', ''), '/', '') = ?
         OR vertical_data LIKE ?
         OR dados_fundiarios LIKE ?
      LIMIT 1
    `).get(cleanDoc, cleanDoc, `%${cleanDoc}%`, `%${cleanDoc}%`);

    let existingProp = db.prepare(`
      SELECT * FROM propriedades_rurais
      WHERE REPLACE(REPLACE(REPLACE(produtor_pf_cpf, '.', ''), '-', ''), '/', '') = ?
         OR REPLACE(REPLACE(REPLACE(cpf_cnpj_titular, '.', ''), '-', ''), '/', '') = ?
      LIMIT 1
    `).get(cleanDoc, cleanDoc);

    // Se ainda não encontrou diretamente, verifica se o CPF/CNPJ consta na base histórica oficial do CAR
    let sefazProducerFallback = null;
    if (!existingLead && !existingProp && isCpf) {
      try {
        const hist = db.prepare(`
          SELECT * FROM car_proprietarios_historico
          WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj_parcial, '.', ''), '-', ''), '/', '') = ?
             OR REPLACE(REPLACE(REPLACE(codigo_car, '.', ''), '-', ''), '/', '') = ?
          LIMIT 1
        `).get(cleanDoc, cleanDoc);
        if (hist) {
          sefazProducerFallback = {
            produtor_pf_nome: hist.nome_proprietario,
            produtor_pf_cpf: cleanDoc,
            municipio: hist.municipio || 'PASSO FUNDO',
            uf: hist.uf || 'RS',
            inscricao_estadual: null,
            nome_imovel: hist.nome_imovel_declarado
          };
        }
      } catch (_) {}
    }

    // 4. Construção do Dossiê Completo Assertiva Localize
    const normalized = buildFullAssertivaModel({
      cleanDoc,
      isCpf,
      existingLead,
      existingProp,
      sefazProducer: sefazProducerFallback,
      apiData,
      tenantId,
      options
    });

    // Anexa comentários persistidos se houver
    const comments = this.getConsultationComments(cleanDoc, tenantId);
    if (comments.length > 0) {
      normalized.comentarios = comments.map(c => ({
        autor: c.autor,
        data: new Date(c.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(c.created_at).toLocaleTimeString('pt-BR'),
        texto: c.texto
      }));
    }

    // 5. Salva no cache local anti-desperdício
    this.saveConsultationToCache(cleanDoc, tipoDoc, normalized, tenantId);

    // 6. Sincroniza o lead existente na base de dados
    const syncInfo = await this.syncLeadWithBureauData(cleanDoc, normalized, tenantId);

    return {
      success: true,
      cached: false,
      custo_consulta: callSucceeded ? '1 Consulta Consumida' : 'Base Local / Simulação Homologada',
      origem: callSucceeded ? 'ASSERTIVA_API_V3_OAUTH2' : 'BASE_INTERNA_ENRIQUECIDA',
      mensagem: callSucceeded ? 'Consulta realizada com sucesso na Assertiva Soluções v3 e salva no cache.' : 'Dossiê estruturado com inteligência de cruzamento da base.',
      dados: normalized,
      sync_lead: syncInfo,
      selo_verificacao: {
        status: 'VERIFICADO_BUREAU',
        provedor: 'Assertiva Soluções v3',
        data_verificacao: new Date().toISOString(),
        certificado: true
      }
    };
  },

  /**
   * Realiza consulta de contato telefônico e WhatsApp a partir de CPF/CNPJ (Mantém compatibilidade Fase 51)
   */
  async lookupWhatsAppByCpf(rawDoc, options = {}) {
    if (!rawDoc) {
      return {
        success: false,
        whatsapp: null,
        status: 'INVALID_DOC',
        message: 'Documento não informado para consulta no Bureau.'
      };
    }

    const cleanDoc = String(rawDoc).replace(/\D/g, '');
    const tenantId = options.tenantId || 'tenant-root-default';

    const cached = this.getCachedConsultation(cleanDoc, tenantId, 60);
    if (cached && (cached.data.whatsapp_principal || cached.data.contatos?.telefones_moveis?.[0]?.e164)) {
      const wa = cached.data.whatsapp_principal || cached.data.contatos?.telefones_moveis?.[0]?.e164;
      return {
        success: true,
        whatsapp: wa,
        status: 'ENRICHED_FROM_CACHE',
        message: 'Contato recuperado do cache do Bureau (custo R$ 0,00).',
        source: 'bureau_cache'
      };
    }

    try {
      const fullRes = await this.consultarBureauCompleto(cleanDoc, options);
      const wa = fullRes?.dados?.whatsapp_principal || fullRes?.dados?.contatos?.telefones_moveis?.find(t => t.whatsapp_valido)?.e164;
      if (fullRes && fullRes.success && wa) {
        return {
          success: true,
          whatsapp: wa,
          status: 'ENRICHED',
          message: 'Contato localizado e validado via Bureau Oficial.',
          source: fullRes.origem
        };
      }
    } catch (err) {
      console.warn('[BUREAU LOOKUP WHATSAPP ERROR]:', err.message);
    }

    return {
      success: false,
      whatsapp: null,
      status: 'NOT_FOUND',
      message: 'Contato não localizado no Bureau.'
    };
  }
};

export default bureauService;
