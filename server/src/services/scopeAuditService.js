import crypto from 'crypto';
import db from '../config/database.js';

// Inicializa tabela de auditoria de desvio de escopo se não existir
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scope_audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_email TEXT,
      query_term TEXT NOT NULL,
      target_segment TEXT,
      tenant_scope TEXT,
      deviation_score INTEGER DEFAULT 0,
      deviation_level TEXT DEFAULT 'NORMAL', -- 'NORMAL', 'MODERATE', 'CRITICAL'
      anomalies_json TEXT DEFAULT '[]',
      is_flagged INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scope_tenant ON scope_audit_logs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_scope_level ON scope_audit_logs(deviation_level);
    CREATE INDEX IF NOT EXISTS idx_scope_created ON scope_audit_logs(created_at DESC);
  `);
} catch (err) {
  console.warn('[SCOPE_AUDIT] Tabela scope_audit_logs já verificada:', err.message);
}

// Mapeamento de afinidade de segmentos e palavras-chave
const SEGMENT_KEYWORDS = {
  AGRO: ['soja', 'milho', 'algodao', 'cafe', 'agro', 'fazenda', 'rural', 'safra', 'pecuaria', 'graos', 'incra', 'sigef', 'car', 'pastagem', 'agronomia'],
  SAUDE: ['clinica', 'medico', 'hospital', 'saude', 'laboratorio', 'odontologia', 'cirurgia', 'consultorio', 'farmacia', 'enfermagem', 'diagnostico'],
  CONSTRUCAO: ['engenharia', 'obra', 'construcao', 'loteamento', 'incorporadora', 'edificacao', 'cimento', 'reforma', 'imovel', 'arquitetura'],
  JURIDICO: ['advocacia', 'direito', 'tributario', 'juridico', 'advogado', 'societario', 'trabalhista', 'contencioso'],
  TECH: ['software', 'ti', 'saas', 'tecnologia', 'desenvolvimento', 'app', 'nuvem', 'data', 'inteligencia']
};

export const scopeAuditService = {
  /**
   * Avalia uma consulta semântica contra o escopo contratado do tenant
   */
  evaluateQuery({ tenant_id = 'tenant-root-default', user_email = 'operador@versus.ai', query_text = '', filters = {} }) {
    if (!query_text && !filters.segmento && !filters.cnaes) {
      return {
        deviation_score: 0,
        deviation_level: 'NORMAL',
        anomalies: [],
        message: 'Consulta padrão dentro do radar.'
      };
    }

    // 1. Obtém o escopo cadastrado do tenant
    let tenantScope = 'GERAL';
    try {
      const tenantRow = db.prepare('SELECT name, id FROM tenants WHERE id = ?').get(tenant_id);
      if (tenantRow) {
        const nameLower = (tenantRow.name || '').toLowerCase();
        if (nameLower.includes('agro') || nameLower.includes('safra')) tenantScope = 'AGRO';
        else if (nameLower.includes('saude') || nameLower.includes('med')) tenantScope = 'SAUDE';
        else if (nameLower.includes('constr') || nameLower.includes('eng')) tenantScope = 'CONSTRUCAO';
        else if (nameLower.includes('jur') || nameLower.includes('adv')) tenantScope = 'JURIDICO';
      }
    } catch {
      tenantScope = 'GERAL';
    }

    const qLower = (query_text || '').toLowerCase();
    const anomalies = [];
    let deviationScore = 0;

    // Detecta segmento da consulta
    let querySegment = 'OUTROS';
    for (const [seg, keywords] of Object.entries(SEGMENT_KEYWORDS)) {
      if (keywords.some(k => qLower.includes(k))) {
        querySegment = seg;
        break;
      }
    }

    // Se o tenant possui escopo especializado (ex: AGRO) e busca outro nicho (ex: SAUDE ou JURIDICO)
    if (tenantScope !== 'GERAL' && querySegment !== 'OUTROS' && querySegment !== tenantScope) {
      deviationScore += 65;
      anomalies.push(`Desvio de Nicho: Tenant possui escopo '${tenantScope}', mas a consulta investiga '${querySegment}'.`);
    }

    // Se a consulta contém termos suspeitos de extração massiva ou fora de governança
    if (qLower.includes('todos os cpfs') || qLower.includes('vazar') || qLower.includes('dump') || qLower.includes('raspagem ilimitada')) {
      deviationScore += 35;
      anomalies.push('Linguagem de alto risco: tentativa de extração indiscriminada de dados.');
    }

    let deviationLevel = 'NORMAL';
    if (deviationScore >= 60) deviationLevel = 'CRITICAL';
    else if (deviationScore >= 25) deviationLevel = 'MODERATE';

    // Grava log auditável
    const id = `scope_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    try {
      db.prepare(`
        INSERT INTO scope_audit_logs (
          id, tenant_id, user_email, query_term, target_segment, tenant_scope, deviation_score, deviation_level, anomalies_json, is_flagged
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        tenant_id,
        user_email,
        query_text || JSON.stringify(filters),
        querySegment,
        tenantScope,
        deviationScore,
        deviationLevel,
        JSON.stringify(anomalies),
        deviationScore >= 60 ? 1 : 0
      );
    } catch (dbErr) {
      console.warn('[SCOPE_AUDIT] Falha ao registrar log:', dbErr.message);
    }

    return {
      log_id: id,
      tenant_id,
      tenant_scope: tenantScope,
      query_segment: querySegment,
      deviation_score: deviationScore,
      deviation_level: deviationLevel,
      anomalies,
      is_flagged: deviationScore >= 60,
      evaluated_at: new Date().toISOString()
    };
  },

  /**
   * Retorna os desvios de escopo registrados para o Super Admin
   */
  listDeviations(limit = 50) {
    return db.prepare(`
      SELECT s.*, t.name as tenant_name 
      FROM scope_audit_logs s
      LEFT JOIN tenants t ON s.tenant_id = t.id
      ORDER BY s.created_at DESC 
      LIMIT ?
    `).all(limit);
  }
};
