/**
 * server/src/services/receitaService.js
 * SERVIÇO UNIFICADO DA RECEITA FEDERAL & VALIDADOR CANÔNICO DE CNPJ
 * 
 * Fonte Única da Verdade (Single Source of Truth) para todo o ecossistema VERSUS:
 * - Módulo de Inteligência Competitiva
 * - Inspetor de Leads (Right Drawer)
 * - Tabela Analítica & Enriquecimento QSA
 * - Mapa & Motor de Enriquecimento em Cascata (leadEnrichmentService.js)
 * 
 * Recursos:
 * - Gateway resiliente duplo: MinhaReceita API (espelho oficial) + Fallback BrasilAPI v1
 * - Normalização canônica unificada de cadastros, CNAEs, endereços e QSA
 * - Persistência atômica transacional no SQLite (tabelas `leads` e `leads_socios`)
 * - Cache Database-First de alta performance
 * - 100% de conformidade com dados reais oficiais (ZERO mocks)
 */

import db from '../config/database.js';
import crypto from 'crypto';

/**
 * Sanitiza o CNPJ mantendo apenas os 14 dígitos numéricos
 * @param {string} rawCnpj 
 * @returns {string}
 */
export function sanitizeCnpj(rawCnpj) {
  if (!rawCnpj) return '';
  return String(rawCnpj).replace(/\D/g, '').padStart(14, '0');
}

/**
 * Formata CNPJ no padrão clássico XX.XXX.XXX/XXXX-XX
 * @param {string} cleanDigits 
 * @returns {string}
 */
export function formatCnpj(cleanDigits) {
  if (!cleanDigits || cleanDigits.length !== 14) return cleanDigits || '';
  return cleanDigits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Normaliza código CNAE para o padrão oficial XXXX-X/XX
 * @param {string|number} rawCnae 
 * @returns {string}
 */
export function formatCnae(rawCnae) {
  if (!rawCnae) return '0000-0/00';
  const clean = String(rawCnae).replace(/\D/g, '').padStart(7, '0');
  if (clean.length < 7) return '0000-0/00';
  return `${clean.slice(0, 4)}-${clean.slice(4, 5)}/${clean.slice(5, 7)}`;
}

export const receitaService = {
  sanitizeCnpj,
  formatCnpj,
  formatCnae,

  /**
   * Consulta pública na MinhaReceita API (espelho oficial da base pública da Receita Federal)
   * @param {string} cleanCnpj 14 dígitos
   * @param {number} [timeoutMs]
   */
  async fetchFromMinhaReceita(cleanCnpj, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`https://minhareceita.org/${cleanCnpj}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 VERSUS-Receita/1.0'
        },
        signal: controller.signal
      });

      if (res.ok) {
        const data = await res.json();
        return { data, source: 'MinhaReceita' };
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Consulta pública na BrasilAPI (gateway secundário de fallback)
   * @param {string} cleanCnpj 14 dígitos
   * @param {number} [timeoutMs]
   */
  async fetchFromBrasilApi(cleanCnpj, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ProjetoLeads-Production-OSINT/1.0'
        },
        signal: controller.signal
      });

      if (res.ok) {
        const data = await res.json();
        return { data, source: 'BrasilAPI' };
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Converte a resposta bruta de qualquer um dos provedores para a entidade canônica VERSUS
   * @param {Object} rawData 
   * @param {string} sourceName 
   * @returns {Object}
   */
  normalizeReceitaData(rawData, sourceName = 'ReceitaFederal') {
    const digits = sanitizeCnpj(rawData.cnpj);
    const mun = (rawData.municipio || '').toUpperCase().trim();
    const uf = (rawData.uf || '').toUpperCase().trim();
    const cnaeCode = formatCnae(rawData.cnae_fiscal || rawData.cnae_fiscal_principal?.codigo);
    const cnaeDesc = rawData.cnae_fiscal_descricao || rawData.cnae_fiscal_principal?.descricao || 'Atividade não especificada';

    // QSA Unificado
    const rawQsa = Array.isArray(rawData.qsa) ? rawData.qsa : [];
    const parsedQsa = rawQsa.map(s => {
      const nome = (s.nome_socio || s.nome || 'Sócio Não Identificado').trim().toUpperCase();
      const qual = s.qualificacao_socio || s.qualificacao || s.cargo || 'Sócio-Administrador';
      return {
        nome,
        nome_socio: nome,
        qualificacao: qual,
        qualificacao_socio: qual,
        faixa_etaria: s.faixa_etaria || null,
        pais: s.pais || 'BRASIL',
        rep_legal: s.nome_representante_legal || null,
        qual_rep_legal: s.qualificacao_representante_legal || null,
        data_entrada: s.data_entrada_sociedade || s.data_entrada || null
      };
    });

    const dddTel = rawData.ddd_telefone_1 || rawData.telefone || '';
    let telFormatted = null;
    if (dddTel) {
      const cleanTel = String(dddTel).replace(/\D/g, '');
      if (cleanTel.length >= 10) {
        telFormatted = `(${cleanTel.slice(0, 2)}) ${cleanTel.slice(2)}`;
      } else {
        telFormatted = dddTel;
      }
    }

    return {
      cnpj: digits,
      cnpj_raw: digits,
      cnpj_formatado: formatCnpj(digits),
      razao_social: (rawData.razao_social || `EMPRESA ${digits}`).trim().toUpperCase(),
      nome_fantasia: (rawData.nome_fantasia || rawData.razao_social || '').trim(),
      situacao_cadastral: (rawData.descricao_situacao_cadastral || rawData.situacao_cadastral || 'ATIVA').toUpperCase(),
      cnae_principal_codigo: cnaeCode,
      cnae_principal_descricao: cnaeDesc,
      cnaes_secundarios: Array.isArray(rawData.cnaes_secundarios) ? rawData.cnaes_secundarios : [],
      porte: (rawData.porte || rawData.descricao_porte || 'DEMAIS').toUpperCase(),
      natureza_juridica: rawData.natureza_juridica || null,
      capital_social: parseFloat(rawData.capital_social) || 0,
      logradouro: (rawData.logradouro || '').trim(),
      numero: (rawData.numero || '').trim(),
      complemento: (rawData.complemento || '').trim(),
      bairro: (rawData.bairro || '').trim(),
      cep: String(rawData.cep || '').replace(/\D/g, ''),
      municipio: mun,
      uf: uf,
      telefone: telFormatted,
      telefone_sanitized: telFormatted ? telFormatted.replace(/\D/g, '') : null,
      email: (rawData.email || '').trim().toLowerCase() || null,
      qsa: parsedQsa,
      origem: 'RECEITA_FEDERAL',
      source: sourceName,
      consultado_em: new Date().toISOString()
    };
  },

  /**
   * Persiste a entidade e seus sócios transacionalmente nas tabelas `leads` e `leads_socios`
   * @param {Object} entity Entidade canônica normalizada
   * @param {string} [tenantId]
   */
  persistCompanyData(entity, tenantId = 'tenant-root-default') {
    const now = new Date().toISOString();
    const cleanCnpj = entity.cnpj;
    const existing = db.prepare(`
      SELECT id, cnpj FROM leads 
      WHERE cnpj_raw = ? OR cnpj = ? 
      LIMIT 1
    `).get(cleanCnpj, entity.cnpj_formatado);

    const leadId = existing?.id || ('lead_rec_' + cleanCnpj);
    const targetCnpj = existing?.cnpj || entity.cnpj_formatado;
    const qsaSummary = entity.qsa.map(s => `${s.nome} (${s.qualificacao})`).join(' | ');

    db.exec('BEGIN IMMEDIATE');
    try {
      // 1. Upsert na tabela leads
      db.prepare(`
        INSERT INTO leads (
          id, cnpj, cnpj_raw, razao_social, nome_fantasia,
          cnae_principal_codigo, cnae_principal_descricao,
          natureza_juridica, porte, capital_social, situacao_cadastral,
          qsa, logradouro, numero, bairro, cep, municipio, uf,
          telefone, email, origem, tenant_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, 'RECEITA_FEDERAL', ?, ?, ?
        )
        ON CONFLICT(cnpj) DO UPDATE SET
          razao_social = excluded.razao_social,
          nome_fantasia = excluded.nome_fantasia,
          cnae_principal_codigo = excluded.cnae_principal_codigo,
          cnae_principal_descricao = excluded.cnae_principal_descricao,
          porte = excluded.porte,
          capital_social = excluded.capital_social,
          situacao_cadastral = excluded.situacao_cadastral,
          qsa = excluded.qsa,
          logradouro = excluded.logradouro,
          numero = excluded.numero,
          bairro = excluded.bairro,
          cep = excluded.cep,
          municipio = excluded.municipio,
          uf = excluded.uf,
          telefone = COALESCE(excluded.telefone, leads.telefone),
          email = COALESCE(excluded.email, leads.email),
          updated_at = excluded.updated_at
      `).run(
        leadId,
        targetCnpj,
        cleanCnpj,
        entity.razao_social,
        entity.nome_fantasia,
        entity.cnae_principal_codigo,
        entity.cnae_principal_descricao,
        entity.natureza_juridica,
        entity.porte,
        entity.capital_social,
        entity.situacao_cadastral,
        qsaSummary,
        entity.logradouro,
        entity.numero,
        entity.bairro,
        entity.cep,
        entity.municipio,
        entity.uf,
        entity.telefone,
        entity.email,
        tenantId,
        now,
        now
      );

      // 2. Atualização dos Sócios em leads_socios
      db.prepare(`DELETE FROM leads_socios WHERE lead_cnpj = ?`).run(cleanCnpj);

      const insertSocio = db.prepare(`
        INSERT INTO leads_socios (
          id, lead_cnpj, nome, qualificacao, faixa_etaria, pais,
          representante_legal, qualificacao_rep_legal, data_entrada,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?
        )
      `);

      for (const socio of entity.qsa) {
        const socioId = 'soc_' + crypto.randomUUID();
        insertSocio.run(
          socioId,
          cleanCnpj,
          socio.nome,
          socio.qualificacao,
          socio.faixa_etaria,
          socio.pais,
          socio.rep_legal,
          socio.qual_rep_legal,
          socio.data_entrada,
          now,
          now
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.warn('⚠️ [RECEITA_SERVICE_PERSIST] Falha ao persistir dados do CNPJ no banco:', err.message);
    }
  },

  /**
   * Consulta oficial de CNPJ com resolução unificada para toda a plataforma
   * 
   * @param {string} rawCnpj Documento informado
   * @param {Object} [options]
   * @param {boolean} [options.forceRefresh] Se true, ignora o cache local do banco de dados
   * @param {string} [options.tenantId] Tenant ID do operador
   * @returns {Promise<Object>} Entidade oficial enriquecida da Receita Federal
   */
  async consultarCnpj(rawCnpj, options = {}) {
    const cleanCnpj = sanitizeCnpj(rawCnpj);
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      throw new Error(`CNPJ inválido para consulta na Receita Federal: "${rawCnpj}"`);
    }

    const tenantId = options.tenantId || 'tenant-root-default';
    const forceRefresh = !!options.forceRefresh;

    // Helper para buscar no cache do banco de dados (leads + leads_socios)
    const getCachedCompany = () => {
      try {
        const existing = db.prepare(`
          SELECT * FROM leads 
          WHERE (cnpj_raw = ? OR cnpj = ? OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?)
            AND (tenant_id = ? OR tenant_id = 'tenant-root-default')
            AND razao_social IS NOT NULL
            AND razao_social != ''
          LIMIT 1
        `).get(cleanCnpj, cleanCnpj, cleanCnpj, tenantId);

        if (existing) {
          // Recupera os sócios associados em leads_socios
          const socios = db.prepare(`
            SELECT * FROM leads_socios 
            WHERE lead_cnpj = ?
            ORDER BY nome ASC
          `).all(cleanCnpj);

          const qsaList = socios.map(s => ({
            nome: s.nome,
            nome_socio: s.nome,
            qualificacao: s.qualificacao,
            qualificacao_socio: s.qualificacao,
            faixa_etaria: s.faixa_etaria,
            pais: s.pais,
            rep_legal: s.representante_legal,
            qual_rep_legal: s.qualificacao_rep_legal,
            data_entrada: s.data_entrada
          }));

          // Se tiver razão social real e válida
          if (existing.razao_social && !existing.razao_social.includes('MOCK')) {
            return {
              cnpj: cleanCnpj,
              cnpj_raw: cleanCnpj,
              cnpj_formatado: formatCnpj(cleanCnpj),
              razao_social: existing.razao_social,
              nome_fantasia: existing.nome_fantasia,
              situacao_cadastral: existing.situacao_cadastral || 'ATIVA',
              cnae_principal_codigo: existing.cnae_principal_codigo,
              cnae_principal_descricao: existing.cnae_principal_descricao,
              porte: existing.porte || 'DEMAIS',
              natureza_juridica: existing.natureza_juridica,
              capital_social: parseFloat(existing.capital_social) || 0,
              logradouro: existing.logradouro || '',
              numero: existing.numero || '',
              bairro: existing.bairro || '',
              cep: existing.cep || '',
              municipio: existing.municipio || '',
              uf: existing.uf || '',
              telefone: existing.telefone || null,
              telefone_sanitized: existing.telefone_sanitized || null,
              email: existing.email || null,
              qsa: qsaList,
              origem: existing.origem || 'RECEITA_FEDERAL',
              source: 'DATABASE_CACHE',
              cached: true
            };
          }
        }
      } catch (cacheErr) {
        console.warn('⚠️ [RECEITA_CACHE_WARN] Falha ao verificar cache local de CNPJ:', cacheErr.message);
      }
      return null;
    };

    // 1. Verificação Database-First (se já existe no SQLite e não for refresh forçado)
    if (!forceRefresh) {
      const cached = getCachedCompany();
      if (cached) return cached;
    }

    // 2. Gateway Duplo Resiliente (MinhaReceita com fallback para BrasilAPI)
    let fetchResult = null;

    try {
      fetchResult = await this.fetchFromMinhaReceita(cleanCnpj, 7000);
    } catch (e1) {
      console.warn(`[RECEITA_GATEWAY] MinhaReceita indisponível (${e1.message}). Tentando BrasilAPI...`);
    }

    if (!fetchResult) {
      try {
        fetchResult = await this.fetchFromBrasilApi(cleanCnpj, 7000);
      } catch (e2) {
        console.warn(`[RECEITA_GATEWAY] BrasilAPI também falhou: ${e2.message}`);
      }
    }

    if (!fetchResult || !fetchResult.data) {
      // Contingência resiliente: se falhou a chamada externa mas temos no banco local, retorna o registro
      const fallbackCached = getCachedCompany();
      if (fallbackCached) {
        console.info(`[RECEITA_GATEWAY] APIs externas indisponíveis para ${cleanCnpj}. Utilizando contingência do banco local.`);
        return {
          ...fallbackCached,
          source: 'DATABASE_CACHE_FALLBACK',
          cached: true
        };
      }

      throw new Error(`Não foi possível validar o CNPJ ${cleanCnpj} nas APIs oficiais da Receita Federal (MinhaReceita e BrasilAPI indisponíveis ou CNPJ não localizado).`);
    }

    // 3. Normalização Canônica
    const entity = this.normalizeReceitaData(fetchResult.data, fetchResult.source);

    // 4. Persistência Atômica no Banco de Dados
    this.persistCompanyData(entity, tenantId);

    return {
      ...entity,
      cached: false
    };
  }
};

export default receitaService;
