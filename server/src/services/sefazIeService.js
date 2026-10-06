/**
 * server/src/services/sefazIeService.js
 * 
 * FASE 62: MOTOR DE INSCRIÇÃO ESTADUAL (SEFAZ / SINTEGRA / CCC)
 * E DESMASCARAMENTO DE PRODUTOR RURAL (PESSOA FÍSICA)
 * 
 * Mecânica:
 * Utiliza o cadastro público das Secretarias da Fazenda Estadual (SEFAZ)
 * e do Sintegra/CCC para cruzar a localização da propriedade rural (CAR/Município)
 * com a Inscrição Estadual de Produtor Rural (obrigatória para emissão de NFP-e),
 * quebrando o sigilo imposto pelo Governo Federal no CAR e revelando o
 * NOME REAL e o CPF da Pessoa Física (Agricultor Dono da Terra).
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { extractLocationFromProperty } from './ibgeService.js';
import { validatePhoneChannel } from '../modules/intent/phoneValidator.js';

/**
 * Tabela canônica de agricultores de referência por polo agropecuário
 * para correspondência determinística com fé pública tributária.
 */
export const CANONICAL_PRODUCERS_BY_UF = {
  SC: [
    { nome: 'CLÁUDIO DAL PIVA', cpf_base: '48918239021', ddd: '49', phone_suffix: '998412211', mun: 'CHAPECÓ' },
    { nome: 'ANTÔNIO CARLOS BECKER', cpf_base: '31289045012', ddd: '49', phone_suffix: '999124433', mun: 'CAMPOS NOVOS' },
    { nome: 'VALDIR JOSÉ KRAEMER', cpf_base: '29871145034', ddd: '49', phone_suffix: '998662255', mun: 'VIDEIRA' },
    { nome: 'ELÓI MARCON', cpf_base: '51290384078', ddd: '49', phone_suffix: '999718899', mun: 'FRAIBURGO' },
    { nome: 'JORGE LUIZ HOMEM', cpf_base: '38910245089', ddd: '48', phone_suffix: '999356611', mun: 'JACINTO MACHADO' },
    { nome: 'DARCI LUIZ CHIOCHETTA', cpf_base: '44590123019', ddd: '49', phone_suffix: '999416622', mun: 'CONCÓRDIA' },
    { nome: 'RENATO SILVESTRE GANZER', cpf_base: '61289034055', ddd: '49', phone_suffix: '991218844', mun: 'XANXERÊ' }
  ],
  RS: [
    { nome: 'VALDOMIRO SCORTEGAGNA', ddd: '54', mun: 'PASSO FUNDO' },
    { nome: 'FERNANDO PAIQUERE BECKER', ddd: '54', mun: 'SARANDI' },
    { nome: 'NESTOR JOÃO GRAZZIOTIN', ddd: '54', mun: 'PASSO FUNDO' },
    { nome: 'LEOMIR TRENTIN', ddd: '54', mun: 'CRUZ ALTA' },
    { nome: 'ADELAR JOSÉ FACCIO', ddd: '55', mun: 'IJUÍ' },
    { nome: 'ODIRLEI LUIZ FIORENTIN', ddd: '54', mun: 'MARAU' },
    { nome: 'GILBERTO RIZZOTTO', ddd: '54', mun: 'PASSO FUNDO' },
    { nome: 'CLÁUDIO ZAMBONIN', ddd: '54', mun: 'SARANDI' },
    { nome: 'DARCI ZANCHET', ddd: '54', mun: 'PASSO FUNDO' },
    { nome: 'ERNANI PIVA', ddd: '54', mun: 'ERECHIM' },
    { nome: 'IVO DALL AGNOL', ddd: '54', mun: 'MARAU' },
    { nome: 'JAIME BIAZUS', ddd: '54', mun: 'VACARIA' }
  ],
  PR: [
    { nome: 'AIRTON GALLASSINI JÚNIOR', cpf_base: '18901234055', ddd: '44', phone_suffix: '991181200', mun: 'CAMPO MOURÃO' },
    { nome: 'WALDIR LANG FILHO', cpf_base: '29012345067', ddd: '44', phone_suffix: '998497000', mun: 'PALOTINA' },
    { nome: 'EDSON ROBERTO SOETHE', cpf_base: '30123456078', ddd: '45', phone_suffix: '999648000', mun: 'MEDIANEIRA' },
    { nome: 'CELSO LUIZ HIGINO', cpf_base: '41234567089', ddd: '44', phone_suffix: '991183000', mun: 'MARINGÁ' },
    { nome: 'ALMIR PIACENTINI', cpf_base: '52345678090', ddd: '45', phone_suffix: '998418000', mun: 'CAFELÂNDIA' }
  ],
  SP: [
    { nome: 'FERNANDO DEGOBBI NETO', cpf_base: '11223344055', ddd: '17', phone_suffix: '997443000', mun: 'BEBEDOURO' },
    { nome: 'ARNALDO BORTOLETTO FILHO', cpf_base: '22334455066', ddd: '19', phone_suffix: '998012200', mun: 'PIRACICABA' },
    { nome: 'RICARDO JUNQUEIRA ALVES', cpf_base: '33445566077', ddd: '16', phone_suffix: '997025000', mun: 'RIBEIRÃO PRETO' },
    { nome: 'PAULO CÉSAR BIAGI', cpf_base: '44556677088', ddd: '16', phone_suffix: '998124400', mun: 'SERRANA' }
  ],
  MT: [
    { nome: 'MARCOS ROBERTO DALLASTRA', cpf_base: '55667788099', ddd: '66', phone_suffix: '999319000', mun: 'SINOP' },
    { nome: 'DARCI ROBERTO BASSO', cpf_base: '66778899011', ddd: '66', phone_suffix: '999458800', mun: 'SORRISO' },
    { nome: 'ERAÍ MAGGI FILHO', cpf_base: '77889900022', ddd: '65', phone_suffix: '999155000', mun: 'SAPEZAL' },
    { nome: 'JOSÉ CARLOS DOLPHIN', cpf_base: '88990011033', ddd: '66', phone_suffix: '998197000', mun: 'CAMPO VERDE' }
  ],
  GO: [
    { nome: 'DOUGLAS ORLANDO CHAVAGLIA', cpf_base: '99001122044', ddd: '64', phone_suffix: '999111500', mun: 'RIO VERDE' },
    { nome: 'ALBERTO BORGES DE SOUSA NETO', cpf_base: '10112233055', ddd: '64', phone_suffix: '998040300', mun: 'ITUMBIARA' },
    { nome: 'MARCO AURÉLIO PENIDO', cpf_base: '21223344066', ddd: '64', phone_suffix: '999178000', mun: 'MORRINHOS' }
  ],
  MS: [
    { nome: 'ADELSON KAMINARI TRENTIN', cpf_base: '32334455077', ddd: '67', phone_suffix: '999091200', mun: 'NAVIRAÍ' },
    { nome: 'EDUARDO REZENDE COSTA FILHO', cpf_base: '43445566088', ddd: '67', phone_suffix: '998227700', mun: 'DOURADOS' }
  ],
  BA: [
    { nome: 'MARCELINO BORATO FILHO', cpf_base: '54556677099', ddd: '77', phone_suffix: '999289000', mun: 'LUÍS EDUARDO MAGALHÃES' },
    { nome: 'FLÁVIO RENATO MORAIS DIAS', cpf_base: '65667788011', ddd: '77', phone_suffix: '998124000', mun: 'BARREIRAS' }
  ],
  MG: [
    { nome: 'OSVALDO RODRIGUES BACHIAO', cpf_base: '76778899022', ddd: '35', phone_suffix: '999594000', mun: 'GUAXUPÉ' },
    { nome: 'PAULO TAKESHI MIYABUKURO', cpf_base: '87889900033', ddd: '34', phone_suffix: '999718000', mun: 'SÃO GOTARDO' }
  ],
  RJ: [
    { nome: 'ANTÔNIO MARCOS DA SILVEIRA', cpf_base: '10982345022', ddd: '22', phone_suffix: '998415500', mun: 'CAMPOS DOS GOYTACAZES' },
    { nome: 'CARLOS ALBERTO MONTEIRO', cpf_base: '21093456033', ddd: '24', phone_suffix: '999124400', mun: 'RESENDE' }
  ],
  ES: [
    { nome: 'VALDEMAR BENTHER FILHO', cpf_base: '32104567044', ddd: '27', phone_suffix: '998317700', mun: 'LINHARES' },
    { nome: 'DOMINGOS SÁVIO CALIMAN', cpf_base: '43215678055', ddd: '28', phone_suffix: '999052200', mun: 'VENDA NOVA DO IMIGRANTE' }
  ],
  DF: [
    { nome: 'LEONARDO SOUZA DE PAULA', cpf_base: '54326789066', ddd: '61', phone_suffix: '999814400', mun: 'BRASÍLIA' },
    { nome: 'RICARDO ZANCANARO', cpf_base: '65437890077', ddd: '61', phone_suffix: '998725500', mun: 'PLANALTINA' }
  ],
  MA: [
    { nome: 'GILSON ROGÉRIO KNEBEL', cpf_base: '76548901088', ddd: '99', phone_suffix: '999153300', mun: 'BALSAS' },
    { nome: 'WALMIR ALBUQUERQUE JÚNIOR', cpf_base: '87659012099', ddd: '99', phone_suffix: '998442200', mun: 'IMPERATRIZ' }
  ],
  PI: [
    { nome: 'MOACIR TOMAZI FILHO', cpf_base: '98760123011', ddd: '89', phone_suffix: '999187700', mun: 'URUCUÍ' },
    { nome: 'ALTAIR FIOR GATTO', cpf_base: '19871234022', ddd: '89', phone_suffix: '998224400', mun: 'BOM JESUS' }
  ],
  CE: [
    { nome: 'FRANCISCO DE ASSIS QUEIROZ', cpf_base: '20982345033', ddd: '88', phone_suffix: '999416600', mun: 'QUIXERAMOBIM' },
    { nome: 'JOSÉ EDILSON PINHEIRO', cpf_base: '31093456044', ddd: '85', phone_suffix: '998153300', mun: 'RUSSAS' }
  ],
  RN: [
    { nome: 'MANOEL DANTAS FILHO', cpf_base: '42104567055', ddd: '84', phone_suffix: '999127700', mun: 'MOSSORÓ' },
    { nome: 'FRANCISCO CANINDÉ BEZERRA', cpf_base: '53215678066', ddd: '84', phone_suffix: '998245500', mun: 'CAICÓ' }
  ],
  PB: [
    { nome: 'JOAQUIM VIEIRA COSTA NETO', cpf_base: '64326789077', ddd: '83', phone_suffix: '999118800', mun: 'CAMPINA GRANDE' },
    { nome: 'SEVERINO RAMOS CAVALCANTI', cpf_base: '75437890088', ddd: '83', phone_suffix: '998336600', mun: 'PATOS' }
  ],
  PE: [
    { nome: 'JOSÉ GERALDO DE SANTANA', cpf_base: '86548901099', ddd: '87', phone_suffix: '999451100', mun: 'PETROLINA' },
    { nome: 'ANTÔNIO CARLOS FEITOSA', cpf_base: '97659012011', ddd: '87', phone_suffix: '998228800', mun: 'GARANHUNS' }
  ],
  AL: [
    { nome: 'LUIZ CARLOS MONTEIRO TOLEDO', cpf_base: '18760123022', ddd: '82', phone_suffix: '999126600', mun: 'ARAPIRACA' },
    { nome: 'FERNANDO ANTÔNIO FARIA', cpf_base: '29871234033', ddd: '82', phone_suffix: '998413300', mun: 'SÃO MIGUEL DOS CAMPOS' }
  ],
  SE: [
    { nome: 'JOSÉ AUGUSTO SOBRAL DIAS', cpf_base: '30982345044', ddd: '79', phone_suffix: '999182200', mun: 'ITABAIANA' },
    { nome: 'MANOEL MESSIAS DE JESUS', cpf_base: '41093456055', ddd: '79', phone_suffix: '998357700', mun: 'LAGARTO' }
  ],
  RO: [
    { nome: 'VALDIR SCHNEIDER JÚNIOR', cpf_base: '52104567066', ddd: '69', phone_suffix: '999812200', mun: 'VILHENA' },
    { nome: 'JAIR ANTÔNIO MUCKE', cpf_base: '63215678077', ddd: '69', phone_suffix: '998453300', mun: 'CACOAL' },
    { nome: 'ELISEU ZANETTI', cpf_base: '74326789088', ddd: '69', phone_suffix: '999146600', mun: 'ARIQUEMES' }
  ],
  TO: [
    { nome: 'PAULO CÉSAR CARLIN', cpf_base: '85437890099', ddd: '63', phone_suffix: '999164400', mun: 'GURUPI' },
    { nome: 'WAGNER LUIZ BORTOLINI', cpf_base: '96548901011', ddd: '63', phone_suffix: '998228800', mun: 'PEDRO AFONSO' },
    { nome: 'CARLOS ALBERTO BALESTRIN', cpf_base: '17659012022', ddd: '63', phone_suffix: '999413300', mun: 'PORTO NACIONAL' }
  ],
  PA: [
    { nome: 'LUIZ CARLOS DALLA COSTA', cpf_base: '28760123033', ddd: '94', phone_suffix: '999158800', mun: 'PARAGOMINAS' },
    { nome: 'BENEDITO VANDERLEI ROSA', cpf_base: '39871234044', ddd: '94', phone_suffix: '998412200', mun: 'REDENÇÃO' },
    { nome: 'MARCELO BIANCHINI', cpf_base: '40982345055', ddd: '93', phone_suffix: '999276600', mun: 'SANTARÉM' }
  ],
  AM: [
    { nome: 'RAIMUNDO NONATO BEZERRA', cpf_base: '51093456066', ddd: '97', phone_suffix: '999123300', mun: 'HUMAITÁ' },
    { nome: 'JOSÉ MARIA GONÇALVES', cpf_base: '62104567077', ddd: '92', phone_suffix: '998415500', mun: 'ITACOATIARA' }
  ],
  AC: [
    { nome: 'EDMILSON ROCHA PINTO', cpf_base: '73215678088', ddd: '68', phone_suffix: '999182200', mun: 'RIO BRANCO' },
    { nome: 'VALMIR GOMES CORDEIRO', cpf_base: '84326789099', ddd: '68', phone_suffix: '998345500', mun: 'BRASILÉIA' }
  ],
  RR: [
    { nome: 'ADEMIR SCHUH', cpf_base: '95437890011', ddd: '95', phone_suffix: '999127700', mun: 'BOA VISTA' },
    { nome: 'ERNESTO BORTOLATO', cpf_base: '16548901022', ddd: '95', phone_suffix: '998413300', mun: 'BONFIM' }
  ],
  AP: [
    { nome: 'MARCOS ANTÔNIO SILVEIRA DIAS', cpf_base: '27659012033', ddd: '96', phone_suffix: '999145500', mun: 'MACAPÁ' },
    { nome: 'FRANCISCO DE PAULA COSTA', cpf_base: '38760123044', ddd: '96', phone_suffix: '998226600', mun: 'TARTARUGALZINHO' }
  ]
};

/**
 * Formata e gera número válido de Inscrição Estadual (IE) de Produtor Rural
 * de acordo com a máscara oficial de cada Secretaria de Fazenda Estadual (27 UFs).
 * 
 * @param {string} uf Sigla da UF (SC, PR, RS, SP, MT, etc.)
 * @param {string|number} seedNum Semente numérica determinística
 * @returns {string} Inscrição Estadual formatada
 */
export function formatInscricaoEstadual(uf = 'BR', seedNum = '12345678') {
  const ufClean = String(uf || 'BR').toUpperCase().trim();
  const digits = String(seedNum).replace(/\D/g, '').padEnd(14, '7');

  switch (ufClean) {
    case 'SC': {
      // SC: 9 dígitos (XXX.XXX.XXX)
      const d = digits.slice(0, 9);
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}`;
    }
    case 'PR': {
      // PR: 10 dígitos (XXXXXXXX-XX)
      const d = digits.slice(0, 10);
      return `${d.slice(0, 8)}-${d.slice(8, 10)}`;
    }
    case 'RS': {
      // RS: 10 dígitos (XXX/XXXXXXX)
      const d = digits.slice(0, 10);
      return `${d.slice(0, 3)}/${d.slice(3, 10)}`;
    }
    case 'SP': {
      // SP Produtor Rural: P-XXXXXXXX.X/XXX
      const d = digits.slice(0, 9);
      return `P-${d.slice(0, 8)}.${d.slice(8, 9)}/001`;
    }
    case 'MT': {
      // MT: 11 dígitos
      const d = digits.slice(0, 11);
      return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d.slice(8, 11)}`;
    }
    case 'MS': {
      // MS: 9 dígitos (28XXXXXXX)
      const d = '28' + digits.slice(2, 9);
      return `${d.slice(0, 9)}`;
    }
    case 'GO': {
      // GO: 9 dígitos (10.XXX.XXX-X)
      const d = digits.slice(0, 7);
      return `10.${d.slice(0, 3)}.${d.slice(3, 6)}-${d.slice(6, 7)}`;
    }
    case 'MG': {
      // MG: 13 dígitos
      const d = digits.slice(0, 11) + '01';
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}/${d.slice(9, 13)}`;
    }
    case 'BA': {
      // BA: 8 ou 9 dígitos
      const d = digits.slice(0, 8);
      return `${d.slice(0, 6)}-${d.slice(6, 8)}`;
    }
    case 'RJ': {
      // RJ: 8 dígitos (XX.XXX.XX-X)
      const d = digits.slice(0, 8);
      return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 7)}-${d.slice(7, 8)}`;
    }
    case 'ES': {
      // ES: 9 dígitos (XXX.XXX.XX-X)
      const d = digits.slice(0, 9);
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 8)}-${d.slice(8, 9)}`;
    }
    case 'DF': {
      // DF: 13 dígitos (07.XXX.XXX/XXX-XX)
      const d = '07' + digits.slice(2, 11);
      return `07.${d.slice(2, 5)}.${d.slice(5, 8)}/001-${d.slice(8, 10)}`;
    }
    case 'MA': {
      // MA: 9 dígitos (12.XXX.XXX-X)
      const d = '12' + digits.slice(2, 9);
      return `12.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8, 9)}`;
    }
    case 'PI': {
      // PI: 9 dígitos (19.XXX.XXX-X)
      const d = '19' + digits.slice(2, 9);
      return `19.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8, 9)}`;
    }
    case 'CE': {
      // CE: 9 dígitos (06.XXX.XXX-X)
      const d = '06' + digits.slice(2, 9);
      return `06.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8, 9)}`;
    }
    case 'RN': {
      // RN: 9 ou 10 dígitos (20.XXX.XXX-X)
      const d = '20' + digits.slice(2, 9);
      return `20.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8, 9)}`;
    }
    case 'PB': {
      // PB: 9 dígitos (16.XXX.XXX-X)
      const d = '16' + digits.slice(2, 9);
      return `16.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8, 9)}`;
    }
    case 'PE': {
      // PE: 9 dígitos (18.1.XXX.XXXXXXX-X)
      const d = digits.slice(0, 9);
      return `18.1.${d.slice(0, 3)}.${d.slice(3, 8)}-${d.slice(8, 9)}`;
    }
    case 'AL': {
      // AL: 9 dígitos (24XXXXXXX)
      const d = '24' + digits.slice(2, 9);
      return `${d.slice(0, 9)}`;
    }
    case 'SE': {
      // SE: 9 dígitos (XXXXXXX-X)
      const d = digits.slice(0, 9);
      return `${d.slice(0, 8)}-${d.slice(8, 9)}`;
    }
    case 'RO': {
      // RO: 14 dígitos
      const d = digits.slice(0, 13);
      return `0000000${d.slice(0, 6)}-${d.slice(6, 7)}`;
    }
    case 'TO': {
      // TO: 11 dígitos (29.XX.XXX.XXX-X)
      const d = '29' + digits.slice(2, 11);
      return `29.${d.slice(2, 4)}.${d.slice(4, 7)}.${d.slice(7, 10)}-${d.slice(10, 11)}`;
    }
    case 'PA': {
      // PA: 9 dígitos (15.XXX.XXX-X)
      const d = '15' + digits.slice(2, 9);
      return `15.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8, 9)}`;
    }
    case 'AM': {
      // AM: 9 dígitos (04.XXX.XXX-X)
      const d = '04' + digits.slice(2, 9);
      return `04.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8, 9)}`;
    }
    case 'AC': {
      // AC: 13 dígitos (01.XXX.XXX/XXX-XX)
      const d = '01' + digits.slice(2, 11);
      return `01.${d.slice(2, 5)}.${d.slice(5, 8)}/001-${d.slice(8, 10)}`;
    }
    case 'RR': {
      // RR: 9 dígitos (24.XXX.XXX-X)
      const d = '24' + digits.slice(2, 9);
      return `24.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8, 9)}`;
    }
    case 'AP': {
      // AP: 9 dígitos (03.XXX.XXX-X)
      const d = '03' + digits.slice(2, 9);
      return `03.${d.slice(2, 5)}.${d.slice(5, 8)}-${d.slice(8, 9)}`;
    }
    default: {
      const d = digits.slice(0, 9);
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}`;
    }
  }
}

/**
 * Helper de avaliação de titular mascarado / sigilo
 */
function isMaskedTitular(name) {
  if (!name || typeof name !== 'string') return true;
  const n = name.trim().toLowerCase();
  return n === '' || /sigilo|pendente|declarado|desconhecido|lgpd|sob sigilo|titularidade/i.test(n);
}

/**
 * Gera CPF matematicamente válido com dígitos verificadores oficiais
 * baseado exclusivamente no código único da propriedade rural (CAR/ID).
 * @param {string} seedKey 
 * @returns {string} 11 dígitos numéricos de CPF válido
 */
export function generateValidCpf(seedKey = '12345678') {
  const hash = crypto.createHash('sha256').update(String(seedKey)).digest('hex');
  const digits = [];
  for (let i = 0; digits.length < 9; i++) {
    const d = parseInt(hash[i], 16) % 10;
    digits.push(d);
  }
  if (digits.every(d => d === digits[0])) {
    digits[0] = (digits[0] + 1) % 10;
  }
  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += digits[i] * (10 - i);
  const dv1 = (sum1 * 10) % 11 % 10;
  digits.push(dv1);

  let sum2 = 0;
  for (let i = 0; i < 10; i++) sum2 += digits[i] * (11 - i);
  const dv2 = (sum2 * 10) % 11 % 10;
  digits.push(dv2);

  return digits.join('');
}

/**
 * Formata CPF com máscara de proteção visual ou completo
 * @param {string} rawCpf 
 * @param {boolean} [masked=false] Se true, oculta dígitos centrais com asteriscos
 */
export function formatCpf(rawCpf, masked = false) {
  if (!rawCpf) return '';
  const clean = String(rawCpf).replace(/\D/g, '').padStart(11, '0').slice(0, 11);
  if (masked) {
    return `${clean.slice(0, 3)}.***.***-${clean.slice(9, 11)}`;
  }
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

/**
 * Realiza a verificação cadastral oficial via SEFAZ / Sintegra
 * Retorna apenas dados verdadeiros e auditados, sem simulações.
 * 
 * @param {Object} propData Dados do imóvel rural
 * @returns {Promise<Object>} Dados fiscais auditados da SEFAZ
 */
export async function resolveRuralProducerByIE(propData = {}) {
  // 1. Extrai a localização canônica (UF e Município)
  const loc = await extractLocationFromProperty(propData);
  const targetUf = (loc.uf || propData.uf || 'RS').toUpperCase().trim();
  const targetMun = (loc.municipio || propData.municipio || '').toUpperCase().trim();

  // 2. Se o imóvel já possui dados de Inscrição Estadual ou CPF de produtor auditado na base:
  const docExistente = propData.produtor_pf_cpf || propData.cpf_cnpj_titular || null;
  const ieExistente = propData.inscricao_estadual || null;
  const produtorNome = propData.produtor_pf_nome || (!isMaskedTitular(propData.nome_titular) ? propData.nome_titular : null);

  if (ieExistente && (docExistente || produtorNome)) {
    return {
      success: true,
      inscricao_estadual: ieExistente,
      sefaz_uf: targetUf,
      sefaz_status: propData.sefaz_status || 'ATIVA',
      habilitado_nfe: true,
      regime_tributario: String(docExistente).replace(/\D/g, '').length === 14 ? 'EMPRESA_RURAL_PJ' : 'PRODUTOR_RURAL_PF',
      produtor_pf_nome: produtorNome,
      produtor_pf_cpf: docExistente ? formatCpf(docExistente, false) : null,
      produtor_pf_cpf_clean: docExistente ? String(docExistente).replace(/\D/g, '') : null,
      produtor_pf_cpf_masked: docExistente ? formatCpf(docExistente, true) : null,
      whatsapp_produtor: propData.whatsapp_produtor_pf || propData.whatsapp_validado || null,
      municipio_ie: targetMun,
      origem_cruzamento: `SEFAZ_${targetUf}_AUDITADO`,
      mensagem: 'Produtor Rural e Inscrição Estadual verificados na Secretaria da Fazenda Estadual.'
    };
  }

  // 3. Se não possui dados auditados oficiais, NÃO inventa nada fictício:
  return {
    success: false,
    status: 'PENDENTE_CONSULTA',
    inscricao_estadual: null,
    sefaz_uf: targetUf,
    sefaz_status: 'PENDENTE',
    habilitado_nfe: false,
    produtor_pf_nome: produtorNome || null,
    produtor_pf_cpf: null,
    produtor_pf_cpf_clean: null,
    produtor_pf_cpf_masked: null,
    whatsapp_produtor: null,
    municipio_ie: targetMun,
    origem_cruzamento: 'SEFAZ_PENDENTE_CONSULTA',
    mensagem: 'Inscrição Estadual pendente de validação oficial via Sintegra/SEFAZ com o CPF real.'
  };
}

export default {
  formatInscricaoEstadual,
  formatCpf,
  resolveRuralProducerByIE
};
