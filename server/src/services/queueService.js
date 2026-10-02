/**
 * queueService.js
 * FASE 55 — MOTOR DE VARREDURA AUTÔNOMA (CRON/JOB QUEUE)
 * 
 * Fila de processamento cadenciado (Rate Limiting defensivo) para extração
 * fundiária noturna sem engatilhar bloqueios nos servidores do SIGEF/INCRA.
 */

import db from '../config/database.js';
import crypto from 'crypto';
import { CITY_COORDINATES } from '../modules/gis/index.js';
import { syncRegionalCadastralMesh } from './geoFundiarioService.js';

// Inicialização da Tabela de Fila no SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS scraping_job_queue (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'tenant-root-default',
    estado TEXT NOT NULL,
    municipio TEXT NOT NULL,
    cultura_foco TEXT DEFAULT 'Geral',
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
    delay_seconds INTEGER DEFAULT 300,
    scheduled_for TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    result_summary TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_scraping_status ON scraping_job_queue(status);
  CREATE INDEX IF NOT EXISTS idx_scraping_scheduled ON scraping_job_queue(scheduled_for);
`);

// Mapeamento regional de pólos agrícolas prioritários por UF
const STATE_AGRO_HUBS = {
  'RS': ['PASSO FUNDO', 'CRUZ ALTA', 'IJUI', 'SANTA MARIA', 'NAO-ME-TOQUE', 'VACARIA', 'TRES PASSOS'],
  'MT': ['SORRISO', 'SINOP', 'LUCAS DO RIO VERDE', 'NOVA MUTUM', 'RONDONOPOLIS', 'PRIMAVERA DO LESTE', 'CAMPO NOVO DO PARECIS'],
  'GO': ['RIO VERDE', 'JATAI', 'CRISTALINA', 'ITUMBIARA', 'ANAPOLIS', 'IPAMERI', 'MINEIROS'],
  'MS': ['DOURADOS', 'MARACAJU', 'SAO GABRIEL DO OESTE', 'PONTA PORA', 'CHAPADAO DO SUL', 'SIDROLANDIA'],
  'PR': ['CASCAVEL', 'TOLEDO', 'LONDRINA', 'MARINGA', 'PONTA GROSSA', 'CASTRO', 'GUARAPUAVA'],
  'BA': ['LUIS EDUARDO MAGALHAES', 'BARREIRAS', 'SAO DESIDERIO', 'CORRENTINA', 'FORMOSA DO RIO PRETO'],
  'PA': ['MARABA', 'PARAGOMINAS', 'REDENCAO', 'SANTANA DO ARAGUAIA', 'NOVO PROGRESSO']
};

export const queueService = {
  testMode: false,

  setTestMode(val) {
    this.testMode = Boolean(val);
  },

  /**
   * Resolve lista de municípios agrícolas para uma UF
   */
  resolveCitiesForState(uf, count = 5) {
    const cleanUf = (uf || 'MT').toUpperCase().trim();
    let cities = STATE_AGRO_HUBS[cleanUf] || [];

    if (cities.length === 0) {
      // Busca nas coordenadas existentes
      cities = Object.keys(CITY_COORDINATES)
        .filter(k => k.endsWith(`/${cleanUf}`))
        .map(k => k.split('/')[0]);
    }

    if (cities.length === 0) {
      cities = ['POLO REGIONAL 01', 'POLO REGIONAL 02', 'POLO REGIONAL 03'];
    }

    return cities.slice(0, Math.max(1, count));
  },

  /**
   * Agenda uma varredura regional cadenciada (Job Queue)
   * 
   * @param {Object} params
   * @param {string} params.estado Sigla da UF (ex: 'RS', 'MT')
   * @param {string} [params.cultura_foco] Cultura foco (ex: 'Soja', 'Milho')
   * @param {number} [params.quantidade_municipios] Total de cidades a enfileirar (default 5)
   * @param {number} [params.delay_minutes] Intervalo entre requisições (default 5 minutos)
   * @param {string} [params.tenantId] Identificador do tenant
   * @returns {Promise<Object>}
   */
  async agendarVarreduraNoturna({
    estado,
    cultura_foco = 'Soja',
    quantidade_municipios = 5,
    delay_minutes = 5,
    tenantId = 'tenant-root-default'
  }) {
    if (!estado) {
      throw new Error('O Estado (UF) é obrigatório para agendar a varredura noturna.');
    }

    const cleanUf = estado.toUpperCase().trim();
    const qty = Number(quantidade_municipios) || 5;
    const cities = this.resolveCitiesForState(cleanUf, qty);
    const delaySec = this.testMode ? 0 : Math.max(1, (Number(delay_minutes) || 5) * 60);

    const now = new Date();
    const scheduledJobs = [];

    const insertStmt = db.prepare(`
      INSERT INTO scraping_job_queue (
        id, tenant_id, estado, municipio, cultura_foco, status, 
        delay_seconds, scheduled_for, created_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, CURRENT_TIMESTAMP)
    `);

    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      const jobId = `JOB-SCRAP-${cleanUf}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      
      // Escalonamento cadenciado de execução
      const scheduleTime = new Date(now.getTime() + (i * delaySec * 1000));
      const scheduledForIso = scheduleTime.toISOString();

      insertStmt.run(
        jobId,
        tenantId,
        cleanUf,
        city,
        cultura_foco || 'Geral',
        delaySec,
        scheduledForIso
      );

      scheduledJobs.push({
        job_id: jobId,
        municipio: city,
        estado: cleanUf,
        cultura: cultura_foco,
        scheduled_for: scheduledForIso,
        ordem: i + 1,
        delay_minutos_acumulado: Math.round((i * delaySec) / 60)
      });
    }

    return {
      success: true,
      estado: cleanUf,
      cultura_foco: cultura_foco || 'Geral',
      total_agendado: scheduledJobs.length,
      delay_intervalo_minutos: delay_minutes,
      modo: 'NOTURNO_CADENCIADO',
      jobs: scheduledJobs,
      message: `Varredura Noturna Agendada: ${scheduledJobs.length} municípios do estado ${cleanUf} na fila de extração cadenciada.`
    };
  },

  /**
   * Processa o próximo job pendente da fila
   */
  async processNextJob(tenantId = 'tenant-root-default') {
    const job = db.prepare(`
      SELECT * FROM scraping_job_queue 
      WHERE tenant_id = ? AND status = 'PENDING'
      ORDER BY scheduled_for ASC
      LIMIT 1
    `).get(tenantId);

    if (!job) {
      return { success: false, message: 'Nenhum job pendente na fila.' };
    }

    db.prepare(`
      UPDATE scraping_job_queue 
      SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(job.id);

    try {
      // Executa a extração oficial
      const syncResult = await syncRegionalCadastralMesh({
        uf: job.estado,
        municipio: job.municipio
      }, job.tenant_id);

      const summary = `Ingeridas ${syncResult.total_ingested || 0} propriedades no município de ${job.municipio}/${job.estado}.`;

      db.prepare(`
        UPDATE scraping_job_queue 
        SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, result_summary = ? 
        WHERE id = ?
      `).run(summary, job.id);

      return {
        success: true,
        job_id: job.id,
        municipio: job.municipio,
        estado: job.estado,
        summary
      };
    } catch (err) {
      db.prepare(`
        UPDATE scraping_job_queue 
        SET status = 'FAILED', completed_at = CURRENT_TIMESTAMP, error_message = ? 
        WHERE id = ?
      `).run(err.message, job.id);

      return {
        success: false,
        job_id: job.id,
        error: err.message
      };
    }
  },

  /**
   * Retorna telemetria da fila
   */
  getQueueStats(tenantId = 'tenant-root-default') {
    const counts = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM scraping_job_queue
      WHERE tenant_id = ?
    `).get(tenantId);

    const nextJob = db.prepare(`
      SELECT id, estado, municipio, cultura_foco, scheduled_for, delay_seconds 
      FROM scraping_job_queue 
      WHERE tenant_id = ? AND status = 'PENDING'
      ORDER BY scheduled_for ASC
      LIMIT 1
    `).get(tenantId);

    return {
      total: counts.total || 0,
      pending: counts.pending || 0,
      running: counts.running || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      next_job: nextJob || null
    };
  },

  /**
   * Lista jobs recentes
   */
  listJobs(tenantId = 'tenant-root-default', limit = 20) {
    return db.prepare(`
      SELECT * FROM scraping_job_queue
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(tenantId, limit);
  },

  /**
   * Limpa jobs da fila
   */
  clearQueue(tenantId = 'tenant-root-default') {
    const res = db.prepare('DELETE FROM scraping_job_queue WHERE tenant_id = ?').run(tenantId);
    return { success: true, deleted: res.changes || 0 };
  }
};

export default queueService;
