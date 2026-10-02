/**
 * osintService.js
 * FASE 33 (ETAPA 2) — MOTOR OSINT & HEURÍSTICA ANTI-CONTADOR
 * 
 * Especializado em inteligência de fontes abertas (OSINT) corporativa,
 * garantindo enriquecimento focado exclusivamente no decisor/sócio e
 * expurgando e-mails genéricos de contabilidade e financeiro.
 */

import db from '../config/database.js';
import {
  contactEnrichmentService,
  ACCOUNTING_BLACKLIST_REGEX,
  isAccountingOrGenericEmail
} from './contactEnrichmentService.js';
import { scraperService, verifyEmailAddress, scrapeLinkedInProfile, normalizeLinkedInUrl } from './scraperService.js';
import { receitaService } from './receitaService.js';

export {
  ACCOUNTING_BLACKLIST_REGEX,
  isAccountingOrGenericEmail,
  scraperService,
  verifyEmailAddress,
  scrapeLinkedInProfile,
  normalizeLinkedInUrl
};

export const osintService = {
  /**
   * Expressão regular oficial de bloqueio anti-contador:
   * Rejeita contato@, contabilidade, financeiro@, adm@, contabil
   */
  ACCOUNTING_BLACKLIST_REGEX,

  /**
   * Valida se um e-mail é genérico ou de contabilidade
   * @param {string} email 
   * @returns {boolean}
   */
  isAccountingOrGenericEmail,

  /**
   * Resolve o domínio corporativo legítimo da empresa expurgando contabilidade
   * @param {Object} lead 
   * @returns {string}
   */
  resolveCorporateDomain(lead) {
    return contactEnrichmentService.resolveCorporateDomain(lead);
  },

  /**
   * FASE 39: Valida e verifica entregabilidade de e-mail via DNS/MX real
   */
  async verifyEmail(email) {
    return verifyEmailAddress(email);
  },

  /**
   * FASE 39: Busca perfil individual real do LinkedIn via scraping de SERP silencioso
   */
  async findRealLinkedInProfile(socioNome, companyName) {
    return scrapeLinkedInProfile(socioNome, companyName);
  },

  /**
   * FASE 47 (ETAPA 2) — O SALTO SOCIETÁRIO (QSA):
   * Quando a extração fundiária possuir apenas CPF (Pessoa Física), consulta a base do QSA
   * (leads_socios) e leads para verificar se esse CPF possui empresas vinculadas.
   * Ao encontrar um CNPJ atrelado, captura o telefone/e-mail público e os canais dessa empresa.
   * 
   * @param {string} rawCpf CPF ou documento do titular
   * @param {string} [tenantId] Tenant ID do operador
   * @param {string} [nomeTitular] Nome do titular para busca complementar no QSA
   * @returns {Object|null} Dados da empresa e canais de contato encontrados
   */
  findCompanyByCpf(rawCpf, tenantId = 'tenant-root-default', nomeTitular = '') {
    if (!rawCpf && !nomeTitular) return null;
    const cleanDoc = String(rawCpf || '').replace(/\D/g, '');

    try {
      let matchedLead = null;
      let socioRecord = null;

      // 1. Se for CPF (11 dígitos) ou documento pessoal
      // Busca no leads_socios se há sócio com este documento ou nome
      if (cleanDoc.length === 11) {
        // Tenta buscar no leads_socios onde representante_legal / doc ou nome corresponda
        if (nomeTitular) {
          socioRecord = db.prepare(`
            SELECT ls.*, l.id as lead_id, l.cnpj, l.cnpj_raw, l.razao_social, l.nome_fantasia, 
                   l.telefone, l.telefone_sanitized, l.email, l.municipio, l.uf, l.capital_social
            FROM leads_socios ls
            INNER JOIN leads l ON (l.cnpj_raw = ls.lead_cnpj OR l.cnpj = ls.lead_cnpj OR REPLACE(REPLACE(REPLACE(REPLACE(l.cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ls.lead_cnpj)
            WHERE (ls.nome LIKE ? OR ls.nome = ?)
              AND (l.tenant_id = ? OR l.tenant_id = 'tenant-root-default')
            ORDER BY l.capital_social DESC
            LIMIT 1
          `).get(`%${nomeTitular.trim()}%`, nomeTitular.trim().toUpperCase(), tenantId);
        }

        // Se não encontrou por nome ou não veio nome, verifica se há lead cujo contato_nome ou tag ou cnpj_raw tenha match
        if (!socioRecord && cleanDoc) {
          matchedLead = db.prepare(`
            SELECT id as lead_id, cnpj, cnpj_raw, razao_social, nome_fantasia, 
                   telefone, telefone_sanitized, email, municipio, uf, capital_social
            FROM leads
            WHERE (cnpj_raw = ? OR cnpj LIKE ? OR contato_nome LIKE ?)
              AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
            LIMIT 1
          `).get(cleanDoc, `%${cleanDoc}%`, `%${nomeTitular || cleanDoc}%`, tenantId);
        }
      } else if (cleanDoc.length === 14) {
        // Se já for CNPJ, busca direta no leads
        matchedLead = db.prepare(`
          SELECT id as lead_id, cnpj, cnpj_raw, razao_social, nome_fantasia, 
                 telefone, telefone_sanitized, email, municipio, uf, capital_social
          FROM leads
          WHERE (cnpj_raw = ? OR cnpj = ?)
            AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
          LIMIT 1
        `).get(cleanDoc, rawCpf, tenantId);
      } else if (nomeTitular) {
        // Busca de fallback por nome do titular
        socioRecord = db.prepare(`
          SELECT ls.*, l.id as lead_id, l.cnpj, l.cnpj_raw, l.razao_social, l.nome_fantasia, 
                 l.telefone, l.telefone_sanitized, l.email, l.municipio, l.uf, l.capital_social
          FROM leads_socios ls
          INNER JOIN leads l ON (l.cnpj_raw = ls.lead_cnpj OR l.cnpj = ls.lead_cnpj)
          WHERE ls.nome LIKE ?
            AND (l.tenant_id = ? OR l.tenant_id = 'tenant-root-default')
          ORDER BY l.capital_social DESC
          LIMIT 1
        `).get(`%${nomeTitular.trim()}%`, tenantId);
      }

      const found = socioRecord || matchedLead;
      if (!found) return null;

      const rawPhone = found.telefone_sanitized || found.telefone || found.telefone_presumido || null;
      let e164Phone = null;
      if (rawPhone) {
        let digits = String(rawPhone).replace(/\D/g, '');
        if (digits.length === 10 || digits.length === 11) {
          if (!digits.startsWith('55')) digits = '55' + digits;
        }
        if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
          e164Phone = `+${digits}`;
        }
      }

      return {
        cpf_consultado: rawCpf,
        cnpj_vinculado: found.cnpj || found.cnpj_raw,
        razao_social: found.razao_social,
        nome_fantasia: found.nome_fantasia || null,
        cargo_qualificacao: found.qualificacao || 'Sócio / Proprietário',
        telefone_comercial: found.telefone || null,
        whatsapp_validado: e164Phone || (found.telefone_sanitized ? `+55${found.telefone_sanitized.replace(/\D/g,'')}` : null),
        email_comercial: found.email || found.email_validado || found.email_presumido || null,
        municipio: found.municipio || null,
        uf: found.uf || null,
        capital_social: found.capital_social || 0,
        origem: 'QSA_MATCH_SALTO_SOCIETARIO'
      };
    } catch (err) {
      console.warn('⚠️ [OSINT QSA SALTO SOCIETARIO WARNING]:', err.message);
      return null;
    }
  },

  /**
   * FASE 39 / FASE 47: Enriquecimento real de decisor (LinkedIn direto + e-mail verificado)
   * Suporta busca com fallback geográfico [Nome do Titular] + [Município] + [Estado]
   */
  async enrichDecisorReal(params) {
    return scraperService.enrichDecisor(params);
  },

  /**
   * Executa o enriquecimento OSINT em cascata para um CNPJ
   * @param {string} rawCnpj 
   * @returns {Promise<Object>}
   */
  async enrichLeadOsint(rawCnpj) {
    return contactEnrichmentService.enrichContactsCascade(rawCnpj);
  },

  /**
   * Triangulação telefônica de canais e WhatsApp
   */
  triangulatePhone(lead) {
    return contactEnrichmentService.triangulatePhone(lead);
  },

  /**
   * FASE 51 (ETAPA 2 - AÇÃO 2): Consulta oficial à Receita Federal via BrasilAPI / Minha Receita
   * Valida CNPJs reais, extrai dados cadastrais e Quadro de Sócios e Administradores (QSA) autêntico.
   * 
   * @param {string} rawCnpj CNPJ da empresa
   * @param {string} [tenantId] Tenant ID do operador
   * @returns {Promise<Object>} Dados cadastrais e QSA oficial da Receita Federal
   */
  async consultarReceitaFederal(rawCnpj, tenantId = 'tenant-root-default') {
    // Fonte Única da Verdade: delega ao serviço canônico unificado da Receita Federal
    return await receitaService.consultarCnpj(rawCnpj, { tenantId, forceRefresh: true });
  },


  /**
   * FASE 51 (ETAPA 3 - AÇÃO 3): Gateway de Bureau de Dados para Enriquecimento de CPF
   * Prepara chamada para fornecedores de dados (Assertiva, Unitfour, Z-API, BigDataCorp).
   * Se BUREAU_API_KEY não estiver configurada no .env ou se o titular não for localizado,
   * tenta busca aberta resiliente ou retorna "Telefone não localizado", sem quebrar o servidor.
   * 
   * @param {string} cpf CPF ou documento
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, whatsapp: string|null, status: string, message: string }>}
   */
  async enrichCpfWithBureau(cpf, options = {}) {
    try {
      const { bureauService } = await import('./bureauService.js');
      return await bureauService.lookupWhatsAppByCpf(cpf, options);
    } catch (err) {
      console.warn('⚠️ [OSINT BUREAU GATEWAY WARNING]:', err.message);
      return {
        success: false,
        whatsapp: null,
        status: 'ERROR',
        message: 'Telefone não localizado'
      };
    }
  },

  /**
   * FASE 51 (ETAPA 2 - AÇÃO 3): Enriquecimento de WhatsApp via Bureau de Dados Oficial
   * Se BUREAU_API_KEY não estiver presente ou contato não for localizado, retorna estritamente
   * "Contato não localizado", NUNCA inventando números.
   * 
   * @param {string} rawDoc CPF ou CNPJ
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, whatsapp: string|null, status: string, message: string }>}
   */
  async enrichWhatsAppBureau(rawDoc, options = {}) {
    return this.enrichCpfWithBureau(rawDoc, options);
  },

  /**
   * Mantido para compatibilidade retroativa de busca caso o perfil real não seja localizado
   */
  generatePresumedLinkedIn(socioNome, companyName) {
    return contactEnrichmentService.generatePresumedLinkedIn(socioNome, companyName);
  }
};

export default osintService;


