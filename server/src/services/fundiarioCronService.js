/**
 * server/src/services/fundiarioCronService.js
 * 
 * FASES 44 E 45: MASTERPLAN MOTOR FUNDIÁRIO B2B - ETAPA 5
 * Motor de Varredura de Titularidade (Cron Sync), Sincronização Periódica de Malhas
 * e Resiliência / Catch-up do Webhook Inbound do WhatsApp.
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { 
  syncRegionalCadastralMesh, 
  saveOrUpdateRuralProperty, 
  generateSyntheticRuralPolygon,
  SEED_RURAL_PROPERTIES 
} from './geoFundiarioService.js';

export class FundiarioCronService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.lastRunStats = null;
    this.syncHistory = [];
  }

  /**
   * Executa varredura de malha fundiária comparando dados locais com base pública/registral
   * Se houver alteração de titularidade, reprocessa scoring e OSINT atomicamente
   * 
   * @param {Object} options Filtros de varredura { uf, municipio, forceRecheck }
   * @param {string} tenantId Tenant executor
   * @returns {Promise<Object>} Relatório de execução do Cron Sync
   */
  async runMeshSync(options = {}, tenantId = 'tenant-root-default') {
    const startTime = Date.now();
    const { uf, municipio, updatedRegistries = [] } = options;

    let scannedCount = 0;
    let ownershipChangesDetected = 0;
    let newlyIngested = 0;
    let upToDateCount = 0;
    const changedProperties = [];

    try {
      // 1. Se fornecida lista de registros públicos atualizados (simulação de feed SIGEF/INCRA)
      if (Array.isArray(updatedRegistries) && updatedRegistries.length > 0) {
        for (const reg of updatedRegistries) {
          scannedCount++;
          const targetUf = reg.uf ? reg.uf.toUpperCase() : null;
          const targetMun = reg.municipio ? reg.municipio.toUpperCase() : null;

          const existing = db.prepare(`
            SELECT * FROM propriedades_rurais
            WHERE ((id_sigef = ? AND id_sigef IS NOT NULL) OR (nome_imovel = ? AND municipio = ? AND uf = ?))
              AND tenant_id = ?
          `).get(reg.id_sigef || '', reg.nome_imovel, targetMun, targetUf, tenantId);

          if (existing) {
            const isOwnerDiff = (
              (reg.nome_titular && existing.nome_titular.trim().toUpperCase() !== reg.nome_titular.trim().toUpperCase()) ||
              (reg.cpf_cnpj_titular && existing.cpf_cnpj_titular && existing.cpf_cnpj_titular.replace(/\D/g, '') !== reg.cpf_cnpj_titular.replace(/\D/g, ''))
            );

            // Se mudou titularidade, atualiza através de saveOrUpdateRuralProperty com o novo titular
            const polyGeoJson = reg.geometria_poligono || JSON.parse(existing.geometria_poligono || '{}');
            const saved = await saveOrUpdateRuralProperty({
              id_sigef: reg.id_sigef || existing.id_sigef,
              codigo_imovel: reg.codigo_imovel || existing.codigo_imovel,
              nome_imovel: reg.nome_imovel || existing.nome_imovel,
              municipio: targetMun || existing.municipio,
              uf: targetUf || existing.uf,
              area_hectares: reg.area_hectares || existing.area_hectares,
              geometria_poligono: polyGeoJson,
              nome_titular: reg.nome_titular || existing.nome_titular,
              cpf_cnpj_titular: reg.cpf_cnpj_titular || existing.cpf_cnpj_titular,
              status_geo: reg.status_geo || existing.status_geo,
              force_osint: isOwnerDiff,
              telefone: reg.telefone || null,
              whatsapp: reg.whatsapp || null,
              email: reg.email || null,
              titularData: reg.titularData || {}
            }, tenantId);

            if (isOwnerDiff) {
              ownershipChangesDetected++;
              changedProperties.push({
                id_sigef: reg.id_sigef || existing.id_sigef,
                nome_imovel: existing.nome_imovel,
                previous_owner: existing.nome_titular,
                new_owner: reg.nome_titular,
                new_intent_score: saved.intent_score,
                new_intent_classification: saved.intent_classification,
                osint_status: saved.osint_status,
                whatsapp_validado: saved.whatsapp_validado,
                linkedin_url_real: saved.linkedin_url_real
              });
            } else {
              upToDateCount++;
            }
            // Imóvel novo no lote público - Exige geometria oficial autêntica
            if (!reg.geometria_poligono) {
              console.warn(`⚠️ [CRON] Imóvel ${reg.id_sigef || reg.nome_imovel} sem geometria autêntica descartado (Zero Mocks).`);
              continue;
            }
            
            await saveOrUpdateRuralProperty({
              ...reg,
              geometria_poligono: reg.geometria_poligono
            }, tenantId);
            newlyIngested++;
        }
      } else {
        // 2. Modo Varredura Automática Territorial (padrão de cron: varre SEED_RURAL_PROPERTIES ou município)
        const syncResult = await syncRegionalCadastralMesh({ uf, municipio }, tenantId);
        scannedCount = syncResult.total_ingested || 0;
        upToDateCount = scannedCount;
      }

      const executionDurationMs = Date.now() - startTime;
      const stats = {
        success: true,
        scanned_at: new Date().toISOString(),
        execution_duration_ms: executionDurationMs,
        tenant_id: tenantId,
        scanned_count: scannedCount,
        ownership_changes_detected: ownershipChangesDetected,
        newly_ingested: newlyIngested,
        up_to_date_count: upToDateCount,
        changed_properties: changedProperties
      };

      this.lastRunStats = stats;
      this.syncHistory.unshift(stats);
      if (this.syncHistory.length > 20) this.syncHistory.pop();

      return stats;
    } catch (err) {
      console.error('❌ [FUNDIARIO CRON ERROR]:', err);
      const errorStats = {
        success: false,
        error: err.message,
        scanned_at: new Date().toISOString(),
        execution_duration_ms: Date.now() - startTime,
        tenant_id: tenantId
      };
      this.lastRunStats = errorStats;
      return errorStats;
    }
  }

  /**
   * Inicia o agendamento periódico em background (ex: a cada 6 horas ou parametrizado)
   */
  startScheduler(intervalMinutes = 360) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
    this.isRunning = true;
    console.log(`⏰ [CRON FUNDIARIO] Scheduller iniciado: intervalo de ${intervalMinutes} minutos.`);

    this.intervalId = setInterval(async () => {
      try {
        console.log('🔄 [CRON FUNDIARIO] Executando varredura agendada de malha fundiária...');
        await this.runMeshSync();
      } catch (e) {
        console.error('⚠️ [CRON FUNDIARIO] Erro na execução periódica:', e.message);
      }
    }, intervalMs);

    return { isRunning: true, intervalMinutes };
  }

  /**
   * Interrompe o agendamento em background
   */
  stopScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 [CRON FUNDIARIO] Scheduller pausado.');
    return { isRunning: false };
  }

  /**
   * Retorna o status de governança do Cron
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRunStats,
      historyCount: this.syncHistory.length
    };
  }
}

/**
 * SERVIÇO DE RESILIÊNCIA E CATCH-UP DO WHATSAPP (SLA INBOUND)
 * Desacoplado da interface gráfica (browser/sockets). Persiste mensagens diretamente
 * no SQLite e permite recuperação de mensagens pendentes das últimas 24h sem duplicidade.
 */
export class WhatsAppInboundResilienceService {
  /**
   * Ingere evento de mensagem do Webhook com garantia de persistência atômica no SQLite
   */
  static ingestWebhookMessage(eventPayload, tenantId = 'tenant-root-default') {
    const {
      message_id,
      sender_phone,
      recipient_phone = null,
      message_text = '',
      message_type = 'text',
      timestamp = new Date().toISOString()
    } = eventPayload;

    if (!sender_phone) {
      throw new Error('Número de telefone do remetente (sender_phone) é obrigatório.');
    }

    const cleanSender = String(sender_phone).replace(/\D/g, '');
    const cleanRecipient = recipient_phone ? String(recipient_phone).replace(/\D/g, '') : null;
    const id = message_id || `wa-${crypto.randomBytes(8).toString('hex')}`;

    // Idempotência: Se mensagem com o mesmo id já existir, não sobrescreve
    const existing = db.prepare('SELECT id, status FROM whatsapp_inbound_messages WHERE id = ?').get(id);
    if (existing) {
      return {
        success: true,
        action: 'ALREADY_EXISTS',
        message_id: existing.id,
        status: existing.status
      };
    }

    db.prepare(`
      INSERT INTO whatsapp_inbound_messages (
        id, tenant_id, sender_phone, recipient_phone, message_text, message_type,
        payload_json, status, received_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?)
    `).run(
      id,
      tenantId,
      cleanSender,
      cleanRecipient,
      message_text,
      message_type,
      JSON.stringify(eventPayload),
      timestamp,
      new Date().toISOString()
    );

    return {
      success: true,
      action: 'PERSISTED',
      message_id: id,
      tenant_id: tenantId,
      sender: cleanSender,
      status: 'RECEIVED'
    };
  }

  /**
   * Rotina de Catch-up: Recupera mensagens pendentes das últimas 24h
   * processando a fila offline sem perda de histórico.
   */
  static runOfflineCatchUp(hours = 24, tenantId = 'tenant-root-default') {
    const thresholdTime = new Date(Date.now() - (hours * 3600 * 1000)).toISOString();

    const pendingMessages = db.prepare(`
      SELECT id, tenant_id, sender_phone, recipient_phone, message_text, payload_json, received_at, status
      FROM whatsapp_inbound_messages
      WHERE tenant_id = ?
        AND received_at >= ?
        AND status = 'RECEIVED'
      ORDER BY received_at ASC
    `).all(tenantId, thresholdTime);

    let processedCount = 0;
    const now = new Date().toISOString();

    for (const msg of pendingMessages) {
      // Atualiza status para PROCESSED com carimbo de tempo
      db.prepare(`
        UPDATE whatsapp_inbound_messages
        SET status = 'PROCESSED',
            processed_at = ?
        WHERE id = ?
      `).run(now, msg.id);

      processedCount++;
    }

    return {
      success: true,
      catch_up_window_hours: hours,
      recovered_count: processedCount,
      messages: pendingMessages.map(m => ({
        id: m.id,
        sender_phone: m.sender_phone,
        message_text: m.message_text,
        received_at: m.received_at,
        status: 'PROCESSED'
      }))
    };
  }

  /**
   * Lista mensagens inbound com paginação e auditoria
   */
  static listInboundMessages(tenantId = 'tenant-root-default', limit = 50) {
    const rows = db.prepare(`
      SELECT id, sender_phone, recipient_phone, message_text, message_type, status, received_at, processed_at
      FROM whatsapp_inbound_messages
      WHERE tenant_id = ?
      ORDER BY received_at DESC
      LIMIT ?
    `).all(tenantId, parseInt(limit, 10));

    return rows;
  }
}

export const fundiarioCronService = new FundiarioCronService();
export default fundiarioCronService;
