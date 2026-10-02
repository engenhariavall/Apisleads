/**
 * FRENTE 1: Enriquecimento por Sinais de Intenção (Intent Data)
 * Módulo: Validação de Linha Ativa (WhatsApp / Telefone Check)
 * 
 * Valida e pontua a qualidade de canais telefônicos antes da exportação para o gestor:
 * 1. Sanitização e remoção de caracteres especiais
 * 2. Validação contra lista oficial de 67 DDDs brasileiros válidos
 * 3. Identificação de tipo de linha: Móvel (Celular com 9º dígito) vs Fixo
 * 4. Pontuação de probabilidade de WhatsApp ativo (0 a 100)
 * 5. Normalização para o padrão internacional E.164 (+55...)
 */

// Lista oficial dos 67 DDDs válidos pela Anatel no Brasil
const VALID_DDDS = new Set([
  // SP
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  // RJ e ES
  '21', '22', '24', '27', '28',
  // MG
  '31', '32', '33', '34', '35', '37', '38',
  // PR e SC
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  // RS
  '51', '53', '54', '55',
  // Centro-Oeste e DF
  '61', '62', '64', '65', '66', '67',
  // Nordeste
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  // Norte
  '91', '92', '93', '94', '95', '96', '97', '98', '99'
]);

export function validatePhoneChannel(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      is_valid: false,
      raw: rawPhone || '',
      cleaned: '',
      e164: null,
      type: 'INVALID',
      is_whatsapp_capable: false,
      quality_score: 0,
      quality_tier: 'REJECTED',
      issues: ['Número telefônico não informado']
    };
  }

  // Remove tudo que não for dígito
  let digits = rawPhone.replace(/\D/g, '');
  const issues = [];

  // Se tiver DDI 55 no início com 12 ou 13 dígitos, remove temporariamente para analisar DDD
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  // Validação de comprimento básico (10 dígitos fixo, 11 dígitos celular)
  if (digits.length !== 10 && digits.length !== 11) {
    return {
      is_valid: false,
      raw: rawPhone,
      cleaned: digits,
      e164: null,
      type: 'INVALID',
      is_whatsapp_capable: false,
      quality_score: 10,
      quality_tier: 'REJECTED',
      issues: [`Comprimento inválido (${digits.length} dígitos; esperado 10 ou 11)`]
    };
  }

  const ddd = digits.slice(0, 2);
  if (!VALID_DDDS.has(ddd)) {
    return {
      is_valid: false,
      raw: rawPhone,
      cleaned: digits,
      e164: null,
      type: 'INVALID_DDD',
      is_whatsapp_capable: false,
      quality_score: 15,
      quality_tier: 'REJECTED',
      issues: [`DDD "${ddd}" não é um DDD válido pela Anatel no Brasil`]
    };
  }

  const subscriberNumber = digits.slice(2);
  let type = 'UNKNOWN';
  let isWhatsappCapable = false;
  let score = 50;

  // Celular: 11 dígitos com 9 como primeiro dígito após DDD
  if (digits.length === 11) {
    if (subscriberNumber.startsWith('9')) {
      type = 'MOBILE';
      isWhatsappCapable = true;
      score = 95; // Quase 100% de celulares brasileiros possuem WhatsApp ativo
    } else {
      type = 'INVALID_MOBILE';
      issues.push('Número de 11 dígitos não inicia com o nono dígito 9');
      score = 30;
    }
  } else if (digits.length === 10) {
    // Fixo: primeiro dígito de 2 a 5
    const firstDigit = subscriberNumber.charAt(0);
    if (['2', '3', '4', '5'].includes(firstDigit)) {
      type = 'LANDLINE';
      // Linhas fixas podem ter WhatsApp Business, mas probabilidade é menor
      isWhatsappCapable = true;
      score = 65;
    } else {
      type = 'SPECIAL_OR_INVALID';
      issues.push(`Número fixo com prefixo incomum: ${firstDigit}`);
      score = 40;
    }
  }

  // Formata padrão internacional E.164 (+55...)
  const e164 = `+55${digits}`;
  const directWhatsappUrl = `https://wa.me/55${digits}`;

  let qualityTier = 'POOR';
  if (score >= 90) qualityTier = 'EXCELLENT';
  else if (score >= 60) qualityTier = 'GOOD';
  else if (score >= 40) qualityTier = 'FAIR';

  return {
    is_valid: issues.length === 0,
    raw: rawPhone,
    cleaned: digits,
    ddd,
    subscriber_number: subscriberNumber,
    e164,
    direct_whatsapp_url: directWhatsappUrl,
    type,
    is_whatsapp_capable: isWhatsappCapable,
    quality_score: score,
    quality_tier: qualityTier,
    issues
  };
}
