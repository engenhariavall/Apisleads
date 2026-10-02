import db, { sqliteDb } from '../config/database.js';
import crypto from 'crypto';
import { receitaService } from './receitaService.js';

/**
 * Service de Enriquecimento QSA (Quadro de Sócios e Administradores)
 * Fase 27: Motor ABM & BrasilAPI Integration (com fallback para MinhaReceita)
 */
export const qsaService = {
  /**
   * Sanitiza CNPJ mantendo apenas dígitos (14 caracteres)
   * @param {string} cnpj 
   * @returns {string}
   */
  sanitizeCnpj(cnpj) {
    if (!cnpj) return '';
    return String(cnpj).replace(/\D/g, '').padStart(14, '0');
  },

  /**
   * Realiza fetch com timeout usando AbortController nativo
   */
  async fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Consulta os dados de QSA na BrasilAPI (com fallback MinhaReceita) e persiste na tabela leads_socios
   * @param {string} rawCnpj 
   * @returns {Promise<Object>}
   */
  async enrichLeadQsa(rawCnpj) {
    const cleanCnpj = this.sanitizeCnpj(rawCnpj);
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      throw new Error(`CNPJ inválido fornecido: "${rawCnpj}"`);
    }

    // Fonte Única da Verdade: delega ao serviço canônico unificado da Receita Federal
    const data = await receitaService.consultarCnpj(cleanCnpj, { forceRefresh: true });
    const savedSocios = this.getSociosByCnpj(cleanCnpj);

    return {
      success: true,
      cnpj: cleanCnpj,
      razao_social: data.razao_social,
      total_socios: savedSocios.length,
      socios: savedSocios,
      raw_source: data.source,
      enriched_at: new Date().toISOString()
    };
  },


  /**
   * Obtém a lista de sócios cadastrados para um CNPJ
   * @param {string} rawCnpj 
   * @returns {Array<Object>}
   */
  getSociosByCnpj(rawCnpj) {
    const cleanCnpj = this.sanitizeCnpj(rawCnpj);
    const stmt = db.prepare(`
      SELECT 
        id, lead_cnpj, nome, qualificacao, faixa_etaria, pais,
        representante_legal, qualificacao_rep_legal, data_entrada,
        email_presumido, email_validado, email_validation_status,
        telefone_presumido, linkedin_presumido, linkedin_url_real,
        created_at, updated_at
      FROM leads_socios
      WHERE lead_cnpj = ?
      ORDER BY data_entrada ASC, nome ASC
    `);
    return stmt.all(cleanCnpj);
  }
};
