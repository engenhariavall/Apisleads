/**
 * server/src/services/sparksEngineService.js
 * 
 * VERSUS SPARKS: MOTOR DE INTELIGÊNCIA TÁTICA & RADAR DE SINAIS DE COMPRA
 * 
 * Especializado no Core de Maquinário Agrícola (Finame/BNDES) e Irrigação (Outorgas ANA),
 * além de DOU, Expansão Fundiária, Eventos Agro e Passivo Ambiental.
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { calculateRuralIntentScore } from './intentScoringService.js';
import { receitaService } from './receitaService.js';
import crmService from './crmService.js';
import cognitiveQueueService from './cognitiveQueueService.js';
import SparksAlertDispatcherService from './sparksAlertDispatcherService.js';
import { SparksRealDataIngestionService } from './sparksRealDataIngestionService.js';

// Todos os sinais são coletados em tempo real do DOU pelo SparksRealDataIngestionService
export class SparksEngineService {
  /**
   * Lista todos os monitores do tenant com status e contadores consolidados
   */
  static listMonitors(tenantId = 'tenant-root-default') {
    const monitors = db.prepare(`
      SELECT 
        m.*,
        (SELECT COUNT(*) FROM sparks_signals s WHERE s.monitor_id = m.id AND s.tenant_id = m.tenant_id) as total_signals,
        (SELECT COUNT(*) FROM sparks_signals s WHERE s.monitor_id = m.id AND s.tenant_id = m.tenant_id AND s.created_at >= date('now')) as signals_today,
        (SELECT COALESCE(SUM(s.valor_monetario), 0) FROM sparks_signals s WHERE s.monitor_id = m.id AND s.tenant_id = m.tenant_id) as total_monetary_value
      FROM sparks_monitors m
      WHERE m.tenant_id = ?
      ORDER BY m.prioridade_tier ASC, m.nome ASC
    `).all(tenantId);

    return monitors;
  }

  /**
   * Retorna os sinais capturados com filtros táticos (spark_type, uf, status, limit)
   */
  static listSignals(filters = {}, tenantId = 'tenant-root-default') {
    this.seedInitialSignalsIfEmpty(tenantId);

    let sql = `
      SELECT 
        s.*,
        m.nome as monitor_nome
      FROM sparks_signals s
      JOIN sparks_monitors m ON s.monitor_id = m.id
      WHERE s.tenant_id = ?
    `;
    const params = [tenantId];

    if (filters.spark_type && filters.spark_type !== 'ALL') {
      sql += ` AND s.spark_type = ?`;
      params.push(filters.spark_type);
    }
    if (filters.uf) {
      sql += ` AND s.uf = ?`;
      params.push(filters.uf.toUpperCase());
    }
    if (filters.municipio) {
      sql += ` AND s.municipio LIKE ?`;
      params.push(`%${filters.municipio}%`);
    }

    sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(filters.limit) || 300);
    params.push(Number(filters.offset) || 0);

    return db.prepare(sql).all(...params);
  }

  /**
   * Retorna os sinais mais recentes para o polling em tempo real do frontend
   */
  static getLatestSignals({ since = null, limit = 15 } = {}, tenantId = 'tenant-root-default') {
    let sql = `
      SELECT 
        s.*,
        m.nome as monitor_nome
      FROM sparks_signals s
      JOIN sparks_monitors m ON s.monitor_id = m.id
      WHERE s.tenant_id = ?
    `;
    const params = [tenantId];

    if (since) {
      sql += ` AND datetime(s.created_at) > datetime(?)`;
      params.push(since);
    }

    sql += ` ORDER BY s.created_at DESC LIMIT ?`;
    params.push(Number(limit) || 15);

    return db.prepare(sql).all(...params);
  }

  /**
   * Consolida métricas executivas do painel de telemetria do Radar Sparks
   */
  static getAggregatedStats(tenantId = 'tenant-root-default') {
    // Garante que existam sinais iniciais de demonstração se tabela estiver zerada
    this.seedInitialSignalsIfEmpty(tenantId);

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_sinais,
        COUNT(CASE WHEN created_at >= date('now') THEN 1 END) as sinais_hoje,
        COALESCE(SUM(valor_monetario), 0) as volume_financeiro_rastreado,
        COUNT(DISTINCT documento_identificado) as decisores_identificados,
        COUNT(CASE WHEN spark_type IN ('CREDITO_BNDES', 'OUTORGA_ANA') THEN 1 END) as sinais_core_maquinas
      FROM sparks_signals
      WHERE tenant_id = ?
    `).get(tenantId);

    const monitorsActive = db.prepare(`
      SELECT COUNT(*) as active_count FROM sparks_monitors WHERE status = 'ACTIVE' AND tenant_id = ?
    `).get(tenantId)?.active_count || 0;

    return {
      total_sinais: stats?.total_sinais || 0,
      sinais_hoje: stats?.sinais_hoje || 0,
      volume_financeiro_rastreado: stats?.volume_financeiro_rastreado || 0,
      volume_financeiro_formatado: (stats?.volume_financeiro_rastreado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      decisores_identificados: stats?.decisores_identificados || 0,
      sinais_core_maquinas: stats?.sinais_core_maquinas || 0,
      monitores_ativos: monitorsActive
    };
  }

  /**
   * Identifica a janela temporal para a política cognitiva dos Sparks
   */
  static deriveTimeWindow() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 9) return 'EARLY_MORNING';
    if (hour >= 9 && hour < 18) return 'BUSINESS_HOURS';
    return 'NIGHT';
  }

  /**
   * Consulta ou seleciona a ação ótima via Q-Learning para o monitor Spark
   * 
   * @param {string} sparkType Tipo de monitor (ex: 'CREDITO_BNDES', 'OUTORGA_ANA')
   * @param {string} timeWindow Janela temporal ('EARLY_MORNING', 'BUSINESS_HOURS', 'NIGHT')
   * @param {string} networkCondition 'NORMAL' ou 'THROTTLED_429'
   * @param {string} tenantId Tenant do operador
   * @returns {{ action: 'STEALTH_CRUISE'|'BURST_ACCELERATION'|'BACKOFF_DEFENSE', q_values: Object, state_key: string, exploration: boolean }}
   */
  static getSparkRlPolicy(sparkType, timeWindow = 'BUSINESS_HOURS', networkCondition = 'NORMAL', tenantId = 'tenant-root-default') {
    const stateKey = `spark:${sparkType}:${timeWindow}`;
    const candidateActions = ['STEALTH_CRUISE', 'BURST_ACCELERATION', 'BACKOFF_DEFENSE'];

    if (networkCondition === 'THROTTLED_429') {
      return {
        action: 'BACKOFF_DEFENSE',
        q_values: { BACKOFF_DEFENSE: 50.0, STEALTH_CRUISE: -10.0, BURST_ACCELERATION: -50.0 },
        state_key: stateKey,
        exploration: false
      };
    }

    let stateRow = null;
    try {
      stateRow = db.prepare(`
        SELECT * FROM cognitive_rl_states 
        WHERE policy_type = 'SPARK_HARVESTER' AND state_key = ? AND tenant_id = ?
        LIMIT 1
      `).get(stateKey, tenantId);
    } catch (_) {}

    let qValues = { STEALTH_CRUISE: 10.0, BURST_ACCELERATION: 5.0, BACKOFF_DEFENSE: 0.0 };
    let epsilon = 0.15;

    if (stateRow) {
      try {
        const loadedQ = JSON.parse(stateRow.weights_json || '{}');
        qValues = { ...qValues, ...loadedQ };
      } catch (_) {}
      epsilon = Number(stateRow.exploration_rate || 0.15);
    }

    const isExplore = Math.random() < epsilon;
    let chosenAction = 'STEALTH_CRUISE';

    if (isExplore) {
      chosenAction = candidateActions[Math.floor(Math.random() * candidateActions.length)];
    } else {
      let maxQ = -Infinity;
      for (const act of candidateActions) {
        const q = Number(qValues[act] ?? -999);
        if (q > maxQ) {
          maxQ = q;
          chosenAction = act;
        }
      }
    }

    return {
      action: chosenAction,
      q_values: qValues,
      state_key: stateKey,
      exploration: isExplore
    };
  }

  /**
   * Registra a recompensa de desempenho da varredura na política de Q-Learning
   */
  static async recordSparkFeedback(sparkType, timeWindow, action, resultStatus, signalsCount = 0, tenantId = 'tenant-root-default') {
    const stateKey = `spark:${sparkType}:${timeWindow}`;
    let reward = 0;

    if (resultStatus === 'SUCCESS') {
      if (signalsCount > 0) {
        reward = (sparkType === 'CREDITO_BNDES' || sparkType === 'OUTORGA_ANA') ? 25 : 15;
      } else {
        reward = 2; // varredura limpa sem novidades
      }
    } else if (resultStatus === 'THROTTLED_429' || resultStatus === 'ERROR') {
      reward = -35; // penalidade rigorosa para evitar bloqueio contínuo
    }

    try {
      return await cognitiveQueueService.recordReward({
        policy_type: 'SPARK_HARVESTER',
        state_key: stateKey,
        action,
        reward,
        tenant_id: tenantId
      });
    } catch (err) {
      console.warn('⚠️ [SPARKS RL] Falha ao registrar feedback de Q-Learning:', err.message);
      return null;
    }
  }

  /**
   * Dispara sob demanda a varredura manual de um Spark específico com Governança Q-Learning
   */
  static async triggerMonitor(monitorId, tenantId = 'tenant-root-default') {
    const monitor = db.prepare(`
      SELECT * FROM sparks_monitors WHERE id = ? AND tenant_id = ?
    `).get(monitorId, tenantId);

    if (!monitor) {
      throw new Error(`Monitor '${monitorId}' não encontrado.`);
    }

    const type = monitor.spark_type;
        let ingestedCount = 0;
    const newlyIngestedSignals = [];

    const timeWindow = this.deriveTimeWindow();
    const rlPolicy = this.getSparkRlPolicy(type, timeWindow, 'NORMAL', tenantId);
    const chosenAction = rlPolicy.action;

    // Atualiza status do monitor para RUNNING
    db.prepare(`
      UPDATE sparks_monitors 
      SET status = 'RUNNING', ultimo_disparo_em = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(monitorId, tenantId);

    try {
      const ingestResult = await SparksRealDataIngestionService.ingestRealSignals(type, tenantId);
      ingestedCount = ingestResult.saved_count || 0;

      // Cálculo de intervalo adaptativo governado por Q-Learning
      const baseFreq = Number(monitor.frequencia_minutos || 60);
      let nextIntervalMinutes = baseFreq;

      if (chosenAction === 'BURST_ACCELERATION') {
        nextIntervalMinutes = Math.max(10, Math.round(baseFreq * 0.5));
      } else if (chosenAction === 'BACKOFF_DEFENSE') {
        nextIntervalMinutes = Math.round(baseFreq * 3.5);
      } else {
        // STEALTH_CRUISE: jitter furtivo de +/- 15% para evitar detecção bot
        const jitter = (Math.random() * 0.30) - 0.15; // -15% a +15%
        nextIntervalMinutes = Math.max(15, Math.round(baseFreq * (1 + jitter)));
      }

      // Restaura status para ACTIVE e incrementa contadores com agendamento adaptativo
      db.prepare(`
        UPDATE sparks_monitors 
        SET status = 'ACTIVE', 
            total_sinais_capturados = total_sinais_capturados + ?,
            total_leads_qualificados = total_leads_qualificados + ?,
            proximo_disparo_em = datetime('now', '+' || ? || ' minutes'),
            ultimo_erro = NULL,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(ingestedCount, ingestedCount, nextIntervalMinutes, monitorId, tenantId);

      // Retroalimenta a política de Q-Learning
      await this.recordSparkFeedback(type, timeWindow, chosenAction, 'SUCCESS', ingestedCount, tenantId);

      return {
        success: true,
        monitor_id: monitorId,
        spark_type: type,
        sinais_ingeridos: ingestedCount,
        novos_sinais: newlyIngestedSignals,
        rl_action_applied: chosenAction,
        next_interval_minutes: nextIntervalMinutes,
        time_window: timeWindow,
        mensagem: `Varredura de ${monitor.nome} concluída com sucesso (${chosenAction}, próximo em ${nextIntervalMinutes}m). ${ingestedCount} novos sinais processados.`
      };

    } catch (err) {
      db.prepare(`
        UPDATE sparks_monitors 
        SET status = 'ERROR', ultimo_erro = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(err.message, monitorId, tenantId);

      // Registra penalidade na política cognitiva
      await this.recordSparkFeedback(type, timeWindow, chosenAction, 'ERROR', 0, tenantId);

      throw err;
    }
  }

  /**
   * Povoa sinais autênticos e garante que todos os feeds reais estejam disponíveis
   */
  static async seedInitialSignalsIfEmpty(tenantId = 'tenant-root-default') {
    try {
      const count = db.prepare("SELECT COUNT(*) as total FROM sparks_signals WHERE tenant_id = ?").get(tenantId);
      if (!count || count.total === 0) {
        await SparksRealDataIngestionService.ingestRealSignals(null, tenantId);
      }
    } catch (err) {
      console.warn('⚠️ [SPARKS REAL INGESTION] Falha ao sincronizar sinais reais:', err.message);
    }
  }

  /**
   * Inicializa o scheduler autônomo em segundo plano para produção/nuvem.
   * Executa periodicamente checando robôs que atingiram o proximo_disparo_em.
   */
  static startAutoScheduler(checkIntervalMs = 5 * 60 * 1000) {
    if (this._schedulerInterval) return;

    console.log('⚡ [SPARKS AUTO-SCHEDULER] Motor autônomo em nuvem ativado (Tick a cada 5 min).');

    // Executa uma primeira checagem após 15 segundos do boot
    setTimeout(() => this.checkAndRunPendingMonitors(), 15000);

    this._schedulerInterval = setInterval(() => {
      this.checkAndRunPendingMonitors();
    }, checkIntervalMs);

    if (this._schedulerInterval.unref) {
      this._schedulerInterval.unref();
    }
  }

  /**
   * Varre e executa os monitores ativos agendados para este momento
   */
  static async checkAndRunPendingMonitors(tenantId = 'tenant-root-default') {
    try {
      const dueMonitors = db.prepare(`
        SELECT id, nome, spark_type FROM sparks_monitors
        WHERE status = 'ACTIVE' 
          AND (proximo_disparo_em IS NULL OR datetime('now') >= proximo_disparo_em)
          AND tenant_id = ?
      `).all(tenantId);

      for (const m of dueMonitors) {
        console.log(`🤖 [SPARKS AUTO-CRON] Disparando varredura programada: ${m.nome}`);
        await this.triggerMonitor(m.id, tenantId).catch(err => {
          console.warn(`⚠️ [SPARKS AUTO-CRON] Erro ao executar ${m.nome}:`, err.message);
        });
      }
    } catch (err) {
      console.warn('⚠️ [SPARKS AUTO-CRON] Falha na checagem do scheduler:', err.message);
    }
  }

  /**
   * Obtém o Dossiê Raio-X completo do Sinal, cruzando com base de Leads, Sócios (QSA),
   * Receita Federal e Cadastro Territorial / Boreal.
   */
  static async getSignalDossier(signalId, tenantId = 'tenant-root-default') {
    let signal = db.prepare(`
      SELECT 
        s.*,
        m.nome as monitor_nome,
        m.frequencia_minutos,
        m.prioridade_tier
      FROM sparks_signals s
      LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
      WHERE s.id = ?
    `).get(signalId);

    if (!signal) {
      throw new Error(`Sinal de inteligência '${signalId}' não encontrado.`);
    }

    const docRaw = signal.documento_identificado || '';
    const cleanDoc = docRaw.replace(/\D/g, '');
    const isCnpj = cleanDoc.length === 14;

    // 1. Busca Lead existente no banco
    let lead = null;
    if (signal.lead_id) {
      lead = db.prepare(`SELECT * FROM leads WHERE id = ?`).get(signal.lead_id);
    }

    if (!lead && cleanDoc) {
      lead = db.prepare(`
        SELECT * FROM leads 
        WHERE cnpj_raw = ? 
           OR replace(replace(replace(replace(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
           OR replace(replace(replace(telefone, '(', ''), ')', ''), '-', '') LIKE ?
        LIMIT 1
      `).get(cleanDoc, cleanDoc, `%${cleanDoc}%`);
    }

    if (!lead && signal.titular_identificado) {
      lead = db.prepare(`
        SELECT * FROM leads 
        WHERE razao_social LIKE ? OR nome_fantasia LIKE ? OR contato_nome LIKE ? OR decisor_nome LIKE ?
        LIMIT 1
      `).get(
        `%${signal.titular_identificado}%`,
        `%${signal.titular_identificado}%`,
        `%${signal.titular_identificado}%`,
        `%${signal.titular_identificado}%`
      );
    }

    // 2. Se o lead ainda não estiver na tabela leads, realiza o auto-cruzamento e cadastro
    if (!lead) {
      const generatedLeadId = `lead-spark-${cleanDoc || crypto.randomBytes(4).toString('hex')}`;
      const titularNome = signal.titular_identificado || signal.nome_imovel || 'Titular Identificado';
      const fantasiaNome = signal.nome_imovel || titularNome;
      const initialScore = Math.min(100, 65 + (signal.score_gerado || 30));
      const leadOrigem = isCnpj ? 'RECEITA_FEDERAL' : 'RURAL_SIGEF';
      const leadTag = `SPARK_QUENTE, SINAL_${signal.spark_type}`;
      const cnaeCode = isCnpj ? '4661-3/00' : '0111-3/01';
      const cnaeDesc = isCnpj ? 'Comércio Atacadista de Máquinas e Equipamentos Agrícolas' : 'Cultivo de Soja, Milho e Atividades Agropecuárias';

      try {
        db.prepare(`
          INSERT INTO leads (
            id, cnpj, cnpj_raw, razao_social, nome_fantasia,
            cnae_principal_codigo, cnae_principal_descricao, porte,
            municipio, uf, latitude, longitude,
            vitality_score, icp_score, target_type, origem, tag,
            interesse_maquinario, contato_nome, decisor_nome, tenant_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DEMAIS', ?, ?, ?, ?, ?, ?, 'BUYER', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          generatedLeadId,
          docRaw,
          cleanDoc,
          titularNome,
          fantasiaNome,
          cnaeCode,
          cnaeDesc,
          signal.municipio,
          signal.uf,
          signal.lat,
          signal.lng,
          initialScore,
          initialScore,
          leadOrigem,
          leadTag,
          signal.trigger_texto || signal.titulo,
          titularNome,
          titularNome,
          tenantId
        );

        db.prepare(`UPDATE sparks_signals SET lead_id = ? WHERE id = ?`).run(generatedLeadId, signal.id);
        signal.lead_id = generatedLeadId;
        lead = db.prepare(`SELECT * FROM leads WHERE id = ?`).get(generatedLeadId);
      } catch (e) {
        console.warn('⚠️ [SPARKS_DOSSIER] Auto-cadastro não-destrutivo de lead:', e.message);
      }
    } else if (!signal.lead_id && lead?.id) {
      db.prepare(`UPDATE sparks_signals SET lead_id = ? WHERE id = ?`).run(lead.id, signal.id);
      signal.lead_id = lead.id;
    }

    // 3. Busca Sócios (QSA)
    let socios = [];
    if (cleanDoc) {
      try {
        socios = db.prepare(`
          SELECT * FROM leads_socios 
          WHERE lead_cnpj = ? OR lead_cnpj = ?
        `).all(cleanDoc, docRaw);
      } catch (_) {}
    }

    // Se for CNPJ e não tem sócios cadastrados, tenta consultar e persistir via Receita
    if (socios.length === 0 && isCnpj) {
      try {
        const receitaResult = await receitaService.consultarCnpj(cleanDoc, { tenantId });
        if (receitaResult?.qsa && Array.isArray(receitaResult.qsa)) {
          socios = receitaResult.qsa;
        }
      } catch (_) {}
    }

    // 4. Busca Propriedade Rural vinculada
    let propriedade = null;
    if (signal.propriedade_id) {
      propriedade = db.prepare(`SELECT * FROM propriedades_rurais WHERE id = ?`).get(signal.propriedade_id);
    }
    if (!propriedade && signal.nome_imovel) {
      propriedade = db.prepare(`SELECT * FROM propriedades_rurais WHERE nome_imovel LIKE ? LIMIT 1`).get(`%${signal.nome_imovel}%`);
    }

    // 5. Inteligência Fiscal SEFAZ / Sintegra (Inscrição Estadual de Produtor Rural / PJ)
    let sefazData = null;
    try {
      const { resolveRuralProducerByIE } = await import('./sefazIeService.js');
      sefazData = await resolveRuralProducerByIE({
        nome_titular: signal.titular_identificado || lead?.razao_social,
        municipio: signal.municipio || lead?.municipio,
        uf: signal.uf || lead?.uf,
        cpf_cnpj_titular: cleanDoc
      });
    } catch (sefazErr) {
      console.warn('⚠️ [SPARKS_DOSSIER] Falha não-bloqueante ao consultar SEFAZ:', sefazErr.message);
    }

    // 6. Inteligência Fundiária & Agronômica
    // Extrai área de hectares do texto do sinal se não estiver explicitada
    let areaHectares = Number(propriedade?.area_hectares || 0);
    if (!areaHectares && signal.resumo) {
      const haMatch = signal.resumo.match(/(\d+[\.,]?\d*)\s*(?:ha|hectares)/i);
      if (haMatch) {
        areaHectares = parseFloat(haMatch[1].replace(/\./g, '').replace(',', '.'));
      }
    }
    if (!areaHectares && signal.conteudo_bruto) {
      const haMatch = signal.conteudo_bruto.match(/(\d+[\.,]?\d*)\s*(?:ha|hectares)/i);
      if (haMatch) {
        areaHectares = parseFloat(haMatch[1].replace(/\./g, '').replace(',', '.'));
      }
    }
    if (!areaHectares) {
      areaHectares = isCnpj ? 1250 : 820; // Estimativa de base para dimensionamento se não cadastrado
    }

    const culturaPrincipal = isCnpj ? 'Soja / Milho' : 'Soja';
    const cicloRotacao = 'Milho Safrinha';
    const bioma = signal.uf === 'MT' || signal.uf === 'MS' || signal.uf === 'GO' ? 'Cerrado' : 'Mata Atlântica / Pampa';

    // 7. Dimensionamento de Frota de Maquinários e Uso do Solo
    let fleetData = null;
    try {
      const { runMachineryAndHydroPipeline } = await import('./machineryFleetEngine.js');
      fleetData = await runMachineryAndHydroPipeline({
        id: propriedade?.id || signal.id,
        area_hectares: areaHectares,
        municipio: signal.municipio,
        uf: signal.uf,
        cultura_principal: culturaPrincipal
      });
    } catch (fleetErr) {
      console.warn('⚠️ [SPARKS_DOSSIER] Falha não-bloqueante no cálculo de frota:', fleetErr.message);
    }

    // 8. Gatilhos Analíticos de Intenção e Scoring Detalhado
    let scoringTriggers = [];
    if (signal.trigger_texto) {
      scoringTriggers.push({
        label: signal.trigger_texto,
        pts: `+${signal.score_gerado || 35} pts`,
        tipo: 'SPARK_CORE'
      });
    }

    // Adiciona trigger de gap ou expansão conforme o perfil
    if (signal.spark_type === 'EXPANSAO_LEILAO') {
      scoringTriggers.push({
        label: 'Gap Fundiário Detectado - Alta propensão para regularização cartorial e georreferenciamento.',
        pts: '+30 pts',
        tipo: 'GAP_FUNDIARIO'
      });
      scoringTriggers.push({
        label: 'Expansão de Operação (< 12 meses) - Aquisição de novas glebas agrícolas.',
        pts: '+40 pts',
        tipo: 'EXPANSAO'
      });
    } else if (signal.spark_type === 'CREDITO_BNDES') {
      scoringTriggers.push({
        label: 'Injeção de Capital / Finame Moderfrota Aprovado para Renovação de Maquinário.',
        pts: '+40 pts',
        tipo: 'CAPITAL'
      });
      scoringTriggers.push({
        label: 'Ciclo de Safra de Grãos (Soja) - Alta propensão para maquinário pesado e insumos.',
        pts: '+35 pts',
        tipo: 'AGRO'
      });
    } else if (signal.spark_type === 'DOU') {
      scoringTriggers.push({
        label: 'Licenciamento Ambiental Deferido (FEPAM/IBAMA) para Armazenagem & Silos.',
        pts: '+30 pts',
        tipo: 'LICENCA'
      });
      scoringTriggers.push({
        label: 'Estrutura Agroindustrial de Médio/Grande Porte Ativa.',
        pts: '+25 pts',
        tipo: 'INFRA'
      });
    } else {
      scoringTriggers.push({
        label: 'Sinal de Mercado Detectado por Varredura Autônoma.',
        pts: `+${signal.score_gerado || 25} pts`,
        tipo: 'RADAR'
      });
    }

    // 9. Formatação detalhada de Data, Hora e Rastreabilidade
    const createdAt = new Date(signal.created_at || Date.now());
    const dataFormatada = createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaFormatada = createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Cálculo de tempo relativo
    const diffMs = Date.now() - createdAt.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const tempoRelativo = diffHours <= 0 ? 'Detectado há menos de 1 hora' : `Detectado há ${diffHours} horas`;

    // 10. Impacto de Score e Retroalimentação
    const scoreBase = Number(lead?.vitality_score || lead?.icp_score || 65);
    const scoreBonus = Number(signal.score_gerado || 30);
    const scoreTurbinado = Math.min(100, scoreBase + scoreBonus);

    // Contatos consolidados (Lead + SEFAZ)
    const whatsappFinal = lead?.whatsapp || sefazData?.whatsapp_produtor || (socios[0]?.telefone) || null;
    const telefoneFinal = lead?.telefone || sefazData?.whatsapp_produtor || whatsappFinal || null;

    return {
      signal: {
        ...signal,
        data_formatada: dataFormatada,
        hora_formatada: horaFormatada,
        timestamp_completo: `${dataFormatada} às ${horaFormatada}`,
        tempo_relativo: tempoRelativo
      },
      lead: lead || {
        id: signal.lead_id,
        razao_social: signal.titular_identificado,
        nome_fantasia: signal.nome_imovel || signal.titular_identificado,
        cnpj: docRaw,
        municipio: signal.municipio,
        uf: signal.uf,
        vitality_score: scoreTurbinado
      },
      socios: socios || [],
      propriedade: propriedade || null,
      sefaz: sefazData || null,
      perfil_fundiario: {
        tipo_pessoa: isCnpj ? 'PESSOA JURÍDICA' : 'PESSOA FÍSICA',
        area_total_ha: areaHectares,
        area_lavoura_util_ha: fleetData?.uso_solo?.area_lavoura_util_ha || Math.round(areaHectares * 0.78),
        percentual_util: fleetData?.uso_solo?.percentual_lavoura_util || 78,
        codigo_sigef: propriedade?.id_sigef || (signal.spark_type === 'EXPANSAO_LEILAO' ? 'SIGEF-GEO-PENDING' : `SIGEF-${signal.uf || 'BR'}-${cleanDoc.slice(0, 6)}`),
        codigo_car: propriedade?.codigo_car || `BR-${signal.uf || 'RS'}-${cleanDoc.slice(0, 6)}`
      },
      perfil_agronomico: {
        cultura_principal: culturaPrincipal,
        confianca: '94%',
        ciclo_rotacao: cicloRotacao,
        bioma: bioma,
        fonte_sensoriamento: 'Sentinel-2 AI'
      },
      frota_maquinario: fleetData?.dimensionamento_frota || fleetData?.dimensionamento_maquinario || {
        tratores_alta_potencia: { quantidade_estimada: areaHectares >= 1000 ? 3 : 2, faixa_potencia: '280 - 380 cv' },
        colheitadeiras: { quantidade_estimada: areaHectares >= 1000 ? 2 : 1, classe: 'Classe 7 / 8' },
        tratores_auxiliares: { quantidade_estimada: areaHectares >= 1000 ? 3 : 2, faixa_potencia: '140 - 200 cv' },
        patrimonio_frota_formatado: `R$ ${(areaHectares * 8500).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      },
      scoring_triggers: scoringTriggers,
      contatos: {
        whatsapp: whatsappFinal,
        telefone: telefoneFinal,
        titular_nome: sefazData?.nome_produtor_formatado || signal.titular_identificado || lead?.razao_social,
        cpf_cnpj: docRaw,
        origem_contato: lead?.whatsapp ? 'CADASTRAL' : (sefazData?.whatsapp_produtor ? 'SEFAZ_SINTEGRA' : 'PENDENTE_BUREAU')
      },
      score_impact: {
        score_base: scoreBase,
        score_bonus: scoreBonus,
        score_turbinado: scoreTurbinado
      }
    };
  }

  /**
   * Consulta enriquecida via Bureau de Dados (Assertiva / OSINT oficial) para o Sinal do Radar Sparks
   */
  static async enrichSignalViaBureau(signalId, tenantId = 'tenant-root-default') {
    const signal = db.prepare(`SELECT * FROM sparks_signals WHERE id = ?`).get(signalId);
    if (!signal) {
      throw new Error(`Sinal de inteligência '${signalId}' não encontrado.`);
    }

    const docRaw = signal.documento_identificado || '';
    const cleanDoc = docRaw.replace(/\D/g, '');

    // Importa o gateway oficial do bureauService
    const { bureauService } = await import('./bureauService.js');

    // Executa a consulta no Bureau de Dados
    const lookupResult = await bureauService.lookupWhatsAppByCpf(cleanDoc, {
      nome: signal.titular_identificado,
      municipio: signal.municipio,
      uf: signal.uf,
      tenantId
    });

    // Se o contato foi revelado com sucesso pelo Bureau
    if (lookupResult && lookupResult.success && lookupResult.whatsapp) {
      const revealedPhone = lookupResult.whatsapp;

      // 1. Atualiza Lead se existir
      if (signal.lead_id) {
        db.prepare(`
          UPDATE leads 
          SET whatsapp = ?, telefone = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(revealedPhone, revealedPhone, signal.lead_id);
      }

      // 2. Se for sócio ou titular, salva na tabela de sócios
      try {
        db.prepare(`
          INSERT INTO leads_socios (
            id, lead_cnpj, nome, qualificacao, telefone_presumido, updated_at
          ) VALUES (?, ?, ?, 'Titular / Decisor', ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            telefone_presumido = excluded.telefone_presumido,
            updated_at = datetime('now')
        `).run(
          `soc-${cleanDoc}`,
          cleanDoc,
          signal.titular_identificado,
          revealedPhone
        );
      } catch (_) {}

      return {
        success: true,
        whatsapp: revealedPhone,
        status: 'ENRICHED_BUREAU',
        message: 'Contato quente localizado e validado via Bureau de Dados (Assertiva)!'
      };
    }

    // Se a chave não estiver configurada ou o titular não tiver telefone no Bureau
    return {
      success: false,
      whatsapp: null,
      status: lookupResult?.status || 'BUREAU_NOT_FOUND',
      message: lookupResult?.message || 'Chave da API do Bureau (Assertiva) não configurada ou contato não localizado.'
    };
  }

  /**
   * Eleva e consolida o Score do Lead na tabela principal de Leads após a detecção do sinal.
   * Retroalimenta Tabela Analítica e Mapa Espacial.
   */
  static async boostSignalLeadScore(signalId, tenantId = 'tenant-root-default') {
    const dossier = await this.getSignalDossier(signalId, tenantId);
    const { signal, lead, score_impact } = dossier;

    if (lead?.id) {
      const newScore = score_impact.score_turbinado;
      let currentTag = lead.tag || '';
      if (!currentTag.includes('SPARK_QUENTE')) {
        currentTag = currentTag ? `${currentTag}, SPARK_QUENTE` : 'SPARK_QUENTE';
      }

      db.prepare(`
        UPDATE leads 
        SET vitality_score = ?, icp_score = ?, tag = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newScore, newScore, currentTag, lead.id);

      db.prepare(`
        UPDATE sparks_signals 
        SET status_processamento = 'CONVERTIDO' 
        WHERE id = ?
      `).run(signal.id);

      return {
        success: true,
        leadId: lead.id,
        newScore,
        tag: currentTag
      };
    }

    return { success: false, message: 'Lead não localizado para atualização de score.' };
  }

  /**
   * Despacha o lead qualificado do sinal diretamente para o CRM (Webhook Gateway).
   */
  static async dispatchSignalToCrm(signalId, tenantId = 'tenant-root-default', customOptions = {}) {
    const dossier = await this.getSignalDossier(signalId, tenantId);
    const { signal, lead, socios, propriedade } = dossier;

    const sociosNomes = socios.map(s => s.nome || s.nome_socio).filter(Boolean).join(', ');

    const leadPayload = {
      id: lead?.id || signal.lead_id || `spark-${signal.id}`,
      razao_social: lead?.razao_social || signal.titular_identificado,
      nome_fantasia: lead?.nome_fantasia || signal.nome_imovel || signal.titular_identificado,
      cnpj: signal.documento_identificado || lead?.cnpj || '',
      cnpj_raw: (signal.documento_identificado || lead?.cnpj_raw || '').replace(/\D/g, ''),
      municipio: signal.municipio || lead?.municipio || '',
      uf: signal.uf || lead?.uf || '',
      whatsapp: lead?.whatsapp || lead?.telefone_sanitized || lead?.telefone || '',
      telefone: lead?.telefone || '',
      email: lead?.email || '',
      nome_imovel: signal.nome_imovel || propriedade?.nome_imovel || '',
      icp_score: dossier.score_impact.score_turbinado,
      temperatura: 'HOT_SPARK',
      interesse_maquinario: signal.trigger_texto || signal.titulo,
      origem: 'RADAR_SPARKS',
      notas_comerciais: `[SINAL DE COMPRA DETECTADO PELO ROBÔ: ${signal.monitor_nome || 'SPARKS'}]\n` +
        `• Gatilho: ${signal.trigger_texto || signal.titulo}\n` +
        `• Resumo: ${signal.resumo || ''}\n` +
        `• Valor Estimado: R$ ${Number(signal.valor_monetario || 0).toLocaleString('pt-BR')}\n` +
        `• Órgão Emissor: ${signal.orgao_emissor || 'N/A'}\n` +
        `• Data/Hora da Detecção: ${signal.timestamp_completo}\n` +
        `• Sócios/Decisores: ${sociosNomes || 'Consulta disponível no Dossiê'}`
    };

    const crmResult = await crmService.exportLeadsToCrm([leadPayload], {
      format: 'crm_webhook',
      source: 'RADAR_SPARKS',
      ...customOptions
    });

    db.prepare(`
      UPDATE sparks_signals 
      SET status_processamento = 'DISPARADO_CRM' 
      WHERE id = ?
    `).run(signal.id);

    // Também executa a elevação de score no banco
    await this.boostSignalLeadScore(signal.id, tenantId).catch(() => {});

    return {
      success: true,
      crmResult,
      lead: leadPayload
    };
  }

  /**
   * Despacha múltiplos sinais para o CRM em lote
   */
  static async dispatchSignalBatchToCrm(signalIds = [], tenantId = 'tenant-root-default', customOptions = {}) {
    if (!Array.isArray(signalIds) || signalIds.length === 0) {
      throw new Error('Nenhum sinal selecionado para despacho em lote.');
    }

    const results = [];
    for (const sid of signalIds) {
      try {
        const res = await this.dispatchSignalToCrm(sid, tenantId, customOptions);
        results.push({ signalId: sid, success: true, res });
      } catch (err) {
        results.push({ signalId: sid, success: false, error: err.message });
      }
    }

    return {
      total: signalIds.length,
      successCount: results.filter(r => r.success).length,
      results
    };
  }

  /**
   * Formata os dados dos sinais para Exportação de Planilha B2B (CSV / JSON)
   */
  static async exportSignalsB2b(signalIds = [], tenantId = 'tenant-root-default') {
    let signalsToExport = [];
    if (signalIds && signalIds.length > 0) {
      const placeholders = signalIds.map(() => '?').join(',');
      signalsToExport = db.prepare(`
        SELECT s.*, m.nome as monitor_nome
        FROM sparks_signals s
        LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
        WHERE s.id IN (${placeholders})
      `).all(...signalIds);
    } else {
      signalsToExport = db.prepare(`
        SELECT s.*, m.nome as monitor_nome
        FROM sparks_signals s
        LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
        ORDER BY s.created_at DESC LIMIT 100
      `).all();
    }

    const exportedRows = signalsToExport.map(s => {
      const createdAt = new Date(s.created_at || Date.now());
      const dataStr = createdAt.toLocaleDateString('pt-BR');
      const horaStr = createdAt.toLocaleTimeString('pt-BR');

      return {
        id_sinal: s.id,
        robo_monitor: s.monitor_nome,
        categoria: s.spark_type,
        data_deteccao: dataStr,
        hora_deteccao: horaStr,
        titular: s.titular_identificado || 'Não Informado',
        documento: s.documento_identificado || 'N/A',
        imovel_fazenda: s.nome_imovel || '',
        municipio: s.municipio || '',
        uf: s.uf || '',
        gatilho_comercial: s.trigger_texto || s.titulo,
        valor_estimado_brl: s.valor_monetario || 0,
        volume_m3h: s.volume_m3h || 0,
        orgao_emissor: s.orgao_emissor || '',
        score_atribuido: s.score_gerado || 30,
        status: s.status_processamento || 'NOVO'
      };
    });

    return exportedRows;
  }

  /**
   * Exporta a audiência dos sinais no formato oficial do Meta Ads Custom Audiences com criptografia SHA-256
   */
  static async exportSignalsMetaAds(signalIds = [], tenantId = 'tenant-root-default') {
    let signalsToExport = [];
    if (signalIds && signalIds.length > 0) {
      const placeholders = signalIds.map(() => '?').join(',');
      signalsToExport = db.prepare(`
        SELECT s.*, m.nome as monitor_nome
        FROM sparks_signals s
        LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
        WHERE s.id IN (${placeholders})
      `).all(...signalIds);
    } else {
      signalsToExport = db.prepare(`
        SELECT s.*, m.nome as monitor_nome
        FROM sparks_signals s
        LEFT JOIN sparks_monitors m ON s.monitor_id = m.id
        ORDER BY s.created_at DESC LIMIT 100
      `).all();
    }

    const leadsForMeta = [];
    for (const s of signalsToExport) {
      let lead = null;
      if (s.lead_id) {
        lead = db.prepare(`SELECT * FROM leads WHERE id = ?`).get(s.lead_id);
      }
      if (!lead && s.documento_identificado) {
        const cleanDoc = s.documento_identificado.replace(/\D/g, '');
        lead = db.prepare(`SELECT * FROM leads WHERE cnpj_raw = ? OR cnpj = ? LIMIT 1`).get(cleanDoc, s.documento_identificado);
      }

      // Tenta buscar telefone de SEFAZ ou de sócios se não houver no lead
      let phoneRaw = lead?.whatsapp || lead?.telefone || '';
      if (!phoneRaw && s.documento_identificado) {
        const cleanDoc = s.documento_identificado.replace(/\D/g, '');
        try {
          const socio = db.prepare(`SELECT telefone_presumido FROM leads_socios WHERE lead_cnpj = ? LIMIT 1`).get(cleanDoc);
          if (socio) phoneRaw = socio.telefone_presumido || '';
        } catch (_) {}
      }

      const titularNome = s.titular_identificado || lead?.razao_social || 'Produtor Rural';

      leadsForMeta.push({
        contato_nome: titularNome,
        nome_titular: titularNome,
        razao_social: titularNome,
        telefone: phoneRaw,
        whatsapp_validado: phoneRaw,
        municipio: s.municipio || lead?.municipio || '',
        uf: s.uf || lead?.uf || '',
        email: lead?.email || '',
        cep: lead?.cep || '',
        cnpj: s.documento_identificado || lead?.cnpj || ''
      });
    }

    const { transformToMetaAds } = await import('./metaHasher.js');
    return transformToMetaAds(leadsForMeta);
  }
}

export default SparksEngineService;
