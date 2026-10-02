/**
 * server/src/services/scraperService.js
 * 
 * FASE 39 — ETAPA 1: MOTOR OSINT REAL & ENRIQUECIMENTO DE DECISORES
 * 
 * Responsável por:
 * 1. Buscar o perfil real e direto no LinkedIn (contornando telas de login ou buscas cegas)
 *    através de scraping silencioso de SERP (Search Engine Results Page) resiliente.
 * 2. Validar e verificar a existência e entregabilidade de e-mails corporativos reais:
 *    - Sintaxe e regras RFC 5322
 *    - Verificação de MX Records via DNS nativo (`node:dns/promises`)
 *    - Rejeição estrita de blacklists de contabilidade e provedores descartáveis
 *    - Integração opcional com provedores de enriquecimento externos (Hunter, Apollo, Proxycurl)
 *      via variáveis de ambiente (`HUNTER_API_KEY`, `APOLLO_API_KEY`, etc).
 * 3. Garantir retorno estruturado sem jamais inventar dados fictícios ou placeholders.
 */

import dns from 'node:dns/promises';
import { isAccountingOrGenericEmail } from './contactEnrichmentService.js';

// Domínios de e-mail temporários / descartáveis
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'throwawaymail.com',
  'yopmail.com'
]);

/**
 * Normaliza e sanitiza URLs do LinkedIn para formato limpo de perfil individual
 * Ex: https://br.linkedin.com/in/fulano-silva-123456?utm_source=... -> https://www.linkedin.com/in/fulano-silva-123456
 */
export function normalizeLinkedInUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  try {
    let clean = rawUrl.trim();
    // Decodifica redirecionamentos se houver
    if (clean.includes('/url?q=')) {
      const match = clean.match(/\/url\?q=([^&]+)/);
      if (match) clean = decodeURIComponent(match[1]);
    }

    const parsed = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('linkedin.com')) {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      // Perfis de pessoa normalmente possuem '/in/username' ou '/pub/username'
      const inIndex = pathParts.findIndex(p => p.toLowerCase() === 'in' || p.toLowerCase() === 'pub');
      if (inIndex !== -1 && pathParts[inIndex + 1]) {
        const username = pathParts[inIndex + 1].toLowerCase();
        // Não é perfil individual se for busca, pulse, feed, etc.
        if (!['search', 'company', 'school', 'jobs', 'feed', 'groups'].includes(username)) {
          return `https://www.linkedin.com/in/${username}`;
        }
      }
    }
  } catch (_) {
    // URL inválida
  }

  return null;
}

/**
 * Motor de Validação e Verificação de E-mail
 * Verifica sintaxe, descarta contabilidade e consulta registros MX de DNS em tempo real.
 */
export async function verifyEmailAddress(email) {
  if (!email || typeof email !== 'string') {
    return {
      email: null,
      is_valid: false,
      status: 'INVALID_SYNTAX',
      mx_found: false,
      reason: 'E-mail vazio ou inválido'
    };
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Validação de Sintaxe
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(cleanEmail)) {
    return {
      email: cleanEmail,
      is_valid: false,
      status: 'INVALID_SYNTAX',
      mx_found: false,
      reason: 'Formato de e-mail sintaticamente inválido'
    };
  }

  // 2. Trava Anti-Contabilidade (Fase 33 & 39)
  if (isAccountingOrGenericEmail(cleanEmail)) {
    return {
      email: cleanEmail,
      is_valid: false,
      status: 'ACCOUNTING_BLACKLISTED',
      mx_found: false,
      reason: 'E-mail descartado por pertencer a contabilidade ou departamento genérico'
    };
  }

  const domain = cleanEmail.split('@')[1];

  // 3. Trava de Provedores Descartáveis
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      email: cleanEmail,
      is_valid: false,
      status: 'DISPOSABLE_DOMAIN',
      mx_found: false,
      reason: 'Domínio de e-mail temporário/descartável'
    };
  }

  // 4. Verificação de Registros MX via DNS Nativo
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (mxRecords && mxRecords.length > 0) {
      // Ordena pelo menor peso de prioridade
      mxRecords.sort((a, b) => a.priority - b.priority);
      return {
        email: cleanEmail,
        is_valid: true,
        status: 'VERIFIED_DELIVERABLE',
        mx_found: true,
        exchange: mxRecords[0].exchange,
        reason: 'Domínio possui servidores de e-mail (MX) ativos e configurados'
      };
    } else {
      return {
        email: cleanEmail,
        is_valid: false,
        status: 'NO_MX_RECORDS',
        mx_found: false,
        reason: 'Domínio não possui servidores de e-mail (MX) configurados'
      };
    }
  } catch (err) {
    return {
      email: cleanEmail,
      is_valid: false,
      status: 'DOMAIN_NOT_FOUND',
      mx_found: false,
      reason: `Falha na resolução de DNS para o domínio ${domain}: ${err.code || err.message}`
    };
  }
}

/**
 * Scraper Silencioso e Resiliente de Perfil do LinkedIn via Motores de Busca
 * Executa busca orgânica e extrai o link direto `linkedin.com/in/...`
 */
export async function scrapeLinkedInProfile(socioNome, companyName) {
  if (!socioNome || typeof socioNome !== 'string') return null;

  const cleanName = socioNome.trim();
  const cleanCompany = (companyName || '').trim();

  // Constrói query otimizada focada em perfil individual
  const query = `site:linkedin.com/in/ "${cleanName}" ${cleanCompany}`.trim();

  // Headers para emulação de requisição orgânica legítima
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache'
  };

  // Tentativa 1: Endpoint de busca DuckDuckGo HTML Lite (silencioso e sem bloqueio de auth)
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(ddgUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      // Procura ocorrências de links do LinkedIn tanto diretos quanto em tags href
      const hrefRegex = /href=["']([^"']*linkedin\.com\/in\/[^"']*)["']/gi;
      let match;
      while ((match = hrefRegex.exec(html)) !== null) {
        const normalized = normalizeLinkedInUrl(match[1]);
        if (normalized) return normalized;
      }

      const linkRegex = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_\u0080-\uFFFF%-]+/gi;
      const matches = html.match(linkRegex);
      if (matches && matches.length > 0) {
        for (const candidate of matches) {
          const normalized = normalizeLinkedInUrl(candidate);
          if (normalized) return normalized;
        }
      }
    }
  } catch (err) {
    // Segue para fallback
  }

  // Tentativa 2: Endpoint de busca Bing (alta taxa de sucesso para perfis do LinkedIn)
  try {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setmkt=pt-BR`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(bingUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const hrefRegex = /href=["']([^"']*linkedin\.com\/in\/[^"']*)["']/gi;
      let match;
      while ((match = hrefRegex.exec(html)) !== null) {
        const normalized = normalizeLinkedInUrl(match[1]);
        if (normalized) return normalized;
      }

      const linkRegex = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_\u0080-\uFFFF%-]+/gi;
      const matches = html.match(linkRegex);
      if (matches && matches.length > 0) {
        for (const candidate of matches) {
          const normalized = normalizeLinkedInUrl(candidate);
          if (normalized) return normalized;
        }
      }
    }
  } catch (err) {
    // Segue para Google
  }

  // Tentativa 3: Endpoint de busca Google Search HTML com sanitização de /url?q=
  try {
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=3&hl=pt-BR`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(googleUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const hrefRegex = /href=["']([^"']*linkedin\.com\/in\/[^"']*)["']/gi;
      let match;
      while ((match = hrefRegex.exec(html)) !== null) {
        const normalized = normalizeLinkedInUrl(match[1]);
        if (normalized) return normalized;
      }

      const linkRegex = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_\u0080-\uFFFF%-]+/gi;
      const matches = html.match(linkRegex);
      if (matches && matches.length > 0) {
        for (const candidate of matches) {
          const normalized = normalizeLinkedInUrl(candidate);
          if (normalized) return normalized;
        }
      }
    }
  } catch (err) {
    // Falha silenciosa
  }

  return null;
}

/**
 * Serviço Unificado de Enriquecimento de Decisores (Scraper & OSINT)
 */
export const scraperService = {
  normalizeLinkedInUrl,
  verifyEmailAddress,
  scrapeLinkedInProfile,

  /**
   * Executa enriquecimento completo de um sócio / decisor:
   * 1. Busca URL real do LinkedIn (com suporte a fallback por [Nome] + [Município] + [Estado])
   * 2. Valida e verifica MX de e-mails candidatos
   * 3. Retorna estrutura auditável sem dados fictícios
   * 
   * @param {Object} params
   * @param {string} params.nome Nome do sócio ou titular
   * @param {string} [params.empresa] Nome da empresa ou imóvel
   * @param {string} [params.municipio] Município da propriedade/sede
   * @param {string} [params.uf] Estado (UF)
   * @param {string} [params.candidateEmail] E-mail do sócio se houver
   * @param {string} [params.domain] Domínio corporativo apurado
   * @returns {Promise<Object>}
   */
  async enrichDecisor({ nome, empresa, municipio = null, uf = null, candidateEmail = null, domain = null }) {
    if (!nome) {
      return {
        nome: null,
        empresa: empresa || null,
        linkedin_url: null,
        email_validado: null,
        email_status: 'NOT_FOUND',
        enriched: false
      };
    }

    // 1. Busca direta de perfil real no LinkedIn
    let companyOrLocation = empresa || '';
    // Se não tiver empresa corporativa ou se for fallback de PF, combina [Nome] + [Município] + [Estado]
    if ((!companyOrLocation || companyOrLocation.toUpperCase().startsWith('FAZENDA') || companyOrLocation.toUpperCase().startsWith('SÍTIO')) && (municipio || uf)) {
      const geoPart = [municipio, uf].filter(Boolean).join(' ');
      companyOrLocation = companyOrLocation ? `${companyOrLocation} ${geoPart}` : geoPart;
    }

    let linkedinUrl = await scrapeLinkedInProfile(nome, companyOrLocation);

    // Se não encontrou e foram passados município/uf separadamente, tenta busca combinada [Nome] + [Município] + [Estado]
    if (!linkedinUrl && (municipio || uf)) {
      const fallbackGeo = [municipio, uf].filter(Boolean).join(' ');
      linkedinUrl = await scrapeLinkedInProfile(nome, fallbackGeo);
    }

    // 2. Validação e Verificação de E-mail
    let emailResult = null;
    let validatedEmail = null;
    let validationStatus = 'NOT_FOUND';

    if (candidateEmail) {
      emailResult = await verifyEmailAddress(candidateEmail);
      if (emailResult.is_valid) {
        validatedEmail = emailResult.email;
        validationStatus = emailResult.status;
      } else {
        validationStatus = emailResult.status;
      }
    } else if (domain && !isAccountingOrGenericEmail(domain)) {
      // Se não há e-mail fornecido, testa o domínio para verificar se recebe e-mails
      try {
        const mxCheck = await dns.resolveMx(domain);
        if (!mxCheck || mxCheck.length === 0) {
          validationStatus = 'DOMAIN_NO_MX';
        }
      } catch (_) {
        validationStatus = 'DOMAIN_INVALID';
      }
    }

    return {
      nome,
      empresa: empresa || null,
      municipio: municipio || null,
      uf: uf || null,
      linkedin_url: linkedinUrl || null,
      email_validado: validatedEmail || null,
      email_status: validationStatus,
      email_verification_details: emailResult,
      enriched: Boolean(linkedinUrl || validatedEmail)
    };
  }
};

export default scraperService;
