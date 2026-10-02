import db from '../config/database.js';
import { validatePhoneChannel } from '../modules/intent/phoneValidator.js';
import { qsaService } from './qsaService.js';
import { scraperService } from './scraperService.js';

/**
 * MOTOR DE ENRIQUECIMENTO EM CASCATA & OSINT LEVE DE CONTATOS (Fase 27 - Etapa 2)
 * 
 * Regras:
 * 1. Extração / Normalização de Domínio Corporativo:
 *    - Se o lead possuir e-mail oficial (ex: contato@empresa.com.br), extrai o domínio.
 *    - Se for e-mail genérico (gmail, hotmail, yahoo, outlook, bol, uol), deduz domínio limpo a partir do nome fantasia / razão social.
 * 2. Geração de Suposições Determinísticas de E-mail Corporativo:
 *    - padrão 'nome.sobrenome@dominio.com.br' (prioritário)
 *    - padrão 'primeironome@dominio.com.br'
 *    - padrão 'inicial+sobrenome@dominio.com.br'
 * 3. Triangulação Telefônica de Precisão:
 *    - Validação de formato via Anatel / phoneValidator.js
 *    - Detecção de celular comercial com 9º dígito
 *    - Probabilidade de WhatsApp ativo e normalização E.164
 * 4. Inferência de Perfil Profissional (LinkedIn Presumido):
 *    - Criação de busca estruturada e link presumido do tomador de decisão na organização.
 */

/**
 * Expressão Regular da Blacklist Anti-Contador (Fase 33 - Etapa 2)
 * Rejeita e-mails genéricos de contabilidade e departamentos não-decisores:
 * - contato@
 * - contabilidade
 * - financeiro@
 * - adm@
 * - contabil
 */
export const ACCOUNTING_BLACKLIST_REGEX = /(?:contato@|contabilidade|financeiro|\badm\b|adm@|contabil)/i;

/**
 * Validador da Heurística Anti-Contador
 * @param {string} email 
 * @returns {boolean} true se for e-mail genérico ou de contabilidade que deve ser rejeitado
 */
export function isAccountingOrGenericEmail(email) {
  if (!email || typeof email !== 'string') return true;
  const normalized = email.trim().toLowerCase();
  return ACCOUNTING_BLACKLIST_REGEX.test(normalized);
}

const PUBLIC_EMAIL_PROVIDERS = new Set([
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com.br',
  'yahoo.com',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'ig.com.br',
  'icloud.com',
  'live.com'
]);

export const contactEnrichmentService = {
  /**
   * Exporta a regex e validador da blacklist
   */
  ACCOUNTING_BLACKLIST_REGEX,
  isAccountingOrGenericEmail,

  /**
   * Sanitiza strings removendo acentos e caracteres especiais para slugs de e-mail
   * @param {string} text 
   * @returns {string}
   */
  slugify(text) {
    if (!text) return '';
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  },

  /**
   * Extrai e sanitiza os tokens do nome de uma pessoa
   * @param {string} fullName 
   * @returns {{ firstName: string, lastName: string, allTokens: string[] }}
   */
  parseName(fullName) {
    if (!fullName) return { firstName: 'contato', lastName: '', allTokens: ['contato'] };

    const stopWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'junior', 'filho', 'neto', 'sobrinho']);
    const rawTokens = fullName
      .trim()
      .split(/\s+/)
      .map(t => this.slugify(t))
      .filter(t => t.length > 0);

    const filtered = rawTokens.filter(t => !stopWords.has(t));
    const finalTokens = filtered.length > 0 ? filtered : rawTokens;

    const firstName = finalTokens[0] || 'contato';
    const lastName = finalTokens.length > 1 ? finalTokens[finalTokens.length - 1] : '';

    return {
      firstName,
      lastName,
      allTokens: finalTokens
    };
  },

  /**
   * Extrai ou infere o domínio corporativo mais provável da empresa
   * Rejeita estritamente e-mails ou domínios de escritórios de contabilidade.
   * @param {Object} lead 
   * @returns {string} ex: "fazendarosario.com.br"
   */
  resolveCorporateDomain(lead) {
    if (!lead) return 'empresa.com.br';

    // 1. Tenta extrair do email cadastrado do lead APENAS se não for provedor público E NÃO for contabilidade
    if (lead.email && lead.email.includes('@')) {
      const parts = lead.email.split('@');
      const domain = parts[1]?.toLowerCase().trim();

      // Heurística Anti-Contador: se o e-mail ou o domínio contiver termos contábeis/genéricos, rejeita
      const isBlacklisted = isAccountingOrGenericEmail(lead.email) || isAccountingOrGenericEmail(domain);

      if (!isBlacklisted && domain && !PUBLIC_EMAIL_PROVIDERS.has(domain) && domain.includes('.')) {
        return domain;
      }
    }

    // 2. Se o lead tiver website explícito e legítimo
    if (lead.website) {
      try {
        let clean = lead.website.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        if (clean.includes('.') && !isAccountingOrGenericEmail(clean)) {
          return clean;
        }
      } catch (_) {}
    }

    // 3. Fallback Seguro: infere slug a partir do nome fantasia ou razão social da própria empresa
    const baseName = lead.nome_fantasia || lead.razao_social || 'empresa';
    // Remove sufixos jurídicos comuns
    const cleanName = baseName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(ltda|sa|s\/a|eireli|me|epp|cia|companhia|sociedade)\b/gi, '')
      .trim();

    const slug = cleanName
      .replace(/[^a-z0-9]/g, ' ')
      .trim()
      .split(/\s+/)[0]; // primeiro termo marcante

    return slug && slug.length >= 3 ? `${slug}.com.br` : 'empresa.com.br';
  },

  /**
   * Gera padrões presumidos de e-mail corporativo para um sócio
   * Aplica a Heurística Anti-Contador e prioriza e-mails com nome do sócio (nome.sobrenome@...)
   * @param {string} socioNome 
   * @param {string} domain 
   * @returns {Object}
   */
  generatePresumedEmails(socioNome, domain) {
    // Se o domínio violar a blacklist de contabilidade, rejeita
    if (isAccountingOrGenericEmail(domain)) {
      return {
        primary: null,
        alternative: null,
        fallback: null,
        patterns: [],
        is_accounting_blacklisted: true,
        recommendation: 'Busca manual requerida (domínio associado a contabilidade)'
      };
    }

    const { firstName, lastName } = this.parseName(socioNome);

    // Se o nome do sócio for genérico ou violar a blacklist
    if (isAccountingOrGenericEmail(firstName) || isAccountingOrGenericEmail(lastName) || firstName === 'contato') {
      return {
        primary: null,
        alternative: null,
        fallback: null,
        patterns: [],
        is_accounting_blacklisted: true,
        recommendation: 'Busca manual requerida (nome genérico)'
      };
    }

    // Padrão prioritário: nome.sobrenome@dominio.com.br
    let primary = `${firstName}.${lastName}@${domain}`;
    let alternative = `${firstName[0]}${lastName}@${domain}`;
    let fallback = `${firstName}@${domain}`;

    if (!lastName) {
      primary = `${firstName}@${domain}`;
      alternative = null;
      fallback = null;
    }

    // Filtra qualquer padrão que porventura caia na blacklist
    const validPatterns = [primary, alternative, fallback]
      .filter(Boolean)
      .filter(e => !isAccountingOrGenericEmail(e));

    const finalPrimary = validPatterns[0] || null;

    return {
      primary: finalPrimary,
      alternative: validPatterns[1] || null,
      fallback: validPatterns[2] || null,
      patterns: validPatterns,
      is_accounting_blacklisted: false,
      recommendation: finalPrimary ? null : 'Busca manual requerida'
    };
  },

  /**
   * Triangula telefone comercial com auditoria Anatel e validação WhatsApp
   * @param {Object} lead 
   * @returns {Object}
   */
  triangulatePhone(lead) {
    const raw = lead.telefone || lead.telefone_secundario || lead.celular || '';
    const phoneAudit = validatePhoneChannel(raw);

    return {
      raw_phone: raw,
      e164: phoneAudit.e164 || null,
      is_valid: phoneAudit.is_valid,
      type: phoneAudit.type,
      is_whatsapp: phoneAudit.is_whatsapp_capable,
      quality_score: phoneAudit.quality_score,
      quality_tier: phoneAudit.quality_tier
    };
  },

  /**
   * Gera URL de busca inteligente do decisor no LinkedIn (Fase 33 - Etapa 3)
   * Formato: https://www.linkedin.com/search/results/people/?keywords=...
   * @param {string} socioNome 
   * @param {string} companyName 
   * @returns {string}
   */
  generatePresumedLinkedIn(socioNome, companyName) {
    const query = `${(socioNome || '').trim()} ${(companyName || '').trim()}`.trim();
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
  },

  /**
   * Executa o enriquecimento em cascata para todos os sócios de um CNPJ
   * e persiste na tabela leads_socios.
   * @param {string} rawCnpj 
   * @returns {Promise<Object>}
   */
  async enrichContactsCascade(rawCnpj) {
    const cleanCnpj = qsaService.sanitizeCnpj(rawCnpj);
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      throw new Error(`CNPJ inválido: ${rawCnpj}`);
    }

    // 1. Busca dados da empresa no banco local
    const lead = db.prepare(`
      SELECT * FROM leads 
      WHERE cnpj_raw = ? OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
      LIMIT 1
    `).get(cleanCnpj, cleanCnpj);

    // 2. Se não houver sócios cadastrados na tabela leads_socios, dispara enriquecimento de QSA primeiro
    let socios = qsaService.getSociosByCnpj(cleanCnpj);
    if (!socios || socios.length === 0) {
      const qsaResult = await qsaService.enrichLeadQsa(cleanCnpj);
      socios = qsaResult.socios || [];
    }

    if (socios.length === 0) {
      return {
        success: true,
        cnpj: cleanCnpj,
        total_socios: 0,
        socios: [],
        message: 'Nenhum sócio ou administrador encontrado para enriquecer.'
      };
    }

    // 3. Determina domínio corporativo da organização
    const domain = this.resolveCorporateDomain(lead || { razao_social: socios[0]?.nome ? 'Empresa' : '' });
    const phoneData = lead ? this.triangulatePhone(lead) : { e164: null, is_whatsapp: false };
    const companyTitle = lead?.nome_fantasia || lead?.razao_social || 'Empresa';

    // 4. Itera e atualiza os contatos de cada sócio com enriquecimento OSINT real (Fase 39)
    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE leads_socios
      SET 
        email_presumido = ?,
        email_validado = ?,
        email_validation_status = ?,
        telefone_presumido = ?,
        linkedin_presumido = ?,
        linkedin_url_real = ?,
        updated_at = ?
      WHERE id = ?
    `);

    // Loop sequencial resiliente para evitar sobrecarga de rede e rate limits
    for (const socio of socios) {
      const presumedEmails = this.generatePresumedEmails(socio.nome, domain);
      const presumedLinkedIn = this.generatePresumedLinkedIn(socio.nome, companyTitle);
      const presumedPhone = phoneData.e164 || lead?.telefone || null;

      let realLinkedin = null;
      let validatedEmail = null;
      let validationStatus = 'NOT_CHECKED';

      try {
        // Dispara enriquecimento real em background por decisor (SERP scraping + MX verification)
        const candidateEmail = presumedEmails.primary || lead?.email || null;
        const realData = await scraperService.enrichDecisor({
          nome: socio.nome,
          empresa: companyTitle,
          candidateEmail,
          domain
        });

        if (realData) {
          realLinkedin = realData.linkedin_url || null;
          validatedEmail = realData.email_validado || null;
          validationStatus = realData.email_status || 'NOT_FOUND';
        }
      } catch (err) {
        // Falha silenciosa defensiva: mantém null e não quebra a requisição
        console.warn(`[OSINT Real] Erro ao enriquecer sócio ${socio.nome}:`, err.message);
      }

      try {
        updateStmt.run(
          presumedEmails.primary,
          validatedEmail,
          validationStatus,
          presumedPhone,
          presumedLinkedIn,
          realLinkedin,
          now,
          socio.id
        );
      } catch (dbErr) {
        console.warn(`[OSINT DB] Falha ao persistir sócio ${socio.id}:`, dbErr.message);
      }
    }

    // 5. Retorna a lista atualizada
    const updatedSocios = qsaService.getSociosByCnpj(cleanCnpj);

    return {
      success: true,
      cnpj: cleanCnpj,
      corporate_domain: domain,
      phone_channel: phoneData,
      total_socios: updatedSocios.length,
      socios: updatedSocios.map(s => ({
        ...s,
        emails_alternativos: this.generatePresumedEmails(s.nome, domain).patterns
      })),
      enriched_at: now
    };
  }
};
