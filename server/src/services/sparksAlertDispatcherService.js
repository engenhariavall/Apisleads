/**
 * server/src/services/sparksAlertDispatcherService.js
 * 
 * SERVIÇO DE DISPARO E GOVERNANÇA DE ALERTAS DO RADAR SPARKS (WHATSAPP DE GESTORES)
 * 
 * Responsável pela gestão dos destinatários (Super Admin), formatação executiva
 * de alto padrão (RIGOROSAMENTE SEM EMOJIS) e disparo gratuito de alertas via WhatsApp.
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { whatsappOutboundService } from './whatsappOutboundService.js';
import { validatePhoneChannel } from '../modules/intent/phoneValidator.js';

export class SparksAlertDispatcherService {
  /**
   * Lista todos os gestores destinatários cadastrados para o tenant
   */
  static listRecipients(tenantId = 'tenant-root-default') {
    return db.prepare(`
      SELECT * FROM sparks_alert_recipients 
      WHERE tenant_id = ? 
      ORDER BY created_at DESC
    `).all(tenantId);
  }

  /**
   * Adiciona um novo gestor para receber alertas do Radar Sparks
   */
  static addRecipient({ nome, telefone, tipos_alertas = 'ALL', tenantId = 'tenant-root-default' }) {
    if (!nome || !telefone) {
      throw new Error('Nome e telefone do gestor são obrigatórios.');
    }

    const validation = validatePhoneChannel(telefone);
    if (!validation.is_valid) {
      throw new Error(`Número de WhatsApp inválido: ${validation.issues.join(', ')}`);
    }

    const cleanPhone = validation.e164 || `55${validation.cleaned}`;
    const id = `recip_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    db.prepare(`
      INSERT INTO sparks_alert_recipients (
        id, tenant_id, nome, telefone, ativo, tipos_alertas, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    `).run(id, tenantId, nome.trim(), cleanPhone, typeof tipos_alertas === 'string' ? tipos_alertas : JSON.stringify(tipos_alertas));

    return {
      success: true,
      id,
      nome: nome.trim(),
      telefone: cleanPhone,
      ativo: 1,
      tipos_alertas
    };
  }

  /**
   * Atualiza dados ou preferências de um destinatário
   */
  static updateRecipient(id, { nome, telefone, ativo, tipos_alertas }, tenantId = 'tenant-root-default') {
    const existing = db.prepare(`SELECT * FROM sparks_alert_recipients WHERE id = ? AND tenant_id = ?`).get(id, tenantId);
    if (!existing) {
      throw new Error(`Destinatário '${id}' não encontrado.`);
    }

    let finalPhone = existing.telefone;
    if (telefone && telefone !== existing.telefone) {
      const validation = validatePhoneChannel(telefone);
      if (!validation.is_valid) {
        throw new Error(`Número de WhatsApp inválido: ${validation.issues.join(', ')}`);
      }
      finalPhone = validation.e164 || `55${validation.cleaned}`;
    }

    const finalName = (nome && nome.trim()) || existing.nome;
    const finalAtivo = (ativo !== undefined && ativo !== null) ? (ativo ? 1 : 0) : existing.ativo;
    const finalTipos = tipos_alertas !== undefined ? (typeof tipos_alertas === 'string' ? tipos_alertas : JSON.stringify(tipos_alertas)) : existing.tipos_alertas;

    db.prepare(`
      UPDATE sparks_alert_recipients 
      SET nome = ?, telefone = ?, ativo = ?, tipos_alertas = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(finalName, finalPhone, finalAtivo, finalTipos, id, tenantId);

    return {
      success: true,
      id,
      nome: finalName,
      telefone: finalPhone,
      ativo: finalAtivo,
      tipos_alertas: finalTipos
    };
  }

  /**
   * Remove um destinatário da lista
   */
  static deleteRecipient(id, tenantId = 'tenant-root-default') {
    const res = db.prepare(`DELETE FROM sparks_alert_recipients WHERE id = ? AND tenant_id = ?`).run(id, tenantId);
    return {
      success: res.changes > 0,
      deleted_id: id
    };
  }

  /**
   * Alterna status ativo/inativo
   */
  static toggleRecipientStatus(id, tenantId = 'tenant-root-default') {
    const existing = db.prepare(`SELECT * FROM sparks_alert_recipients WHERE id = ? AND tenant_id = ?`).get(id, tenantId);
    if (!existing) {
      throw new Error(`Destinatário '${id}' não encontrado.`);
    }

    const newStatus = existing.ativo === 1 ? 0 : 1;
    db.prepare(`
      UPDATE sparks_alert_recipients 
      SET ativo = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(newStatus, id, tenantId);

    return {
      success: true,
      id,
      ativo: newStatus
    };
  }

  /**
   * Mapeamento legível corporativo para cada categoria de Spark (SEM EMOJIS)
   */
  static getSparkTypeLabel(sparkType) {
    switch (sparkType) {
      case 'CREDITO_BNDES': return 'Credito Rural BNDES / Finame / Moderfrota';
      case 'OUTORGA_ANA': return 'Outorga de Agua e Irrigacao (ANA / Estadual)';
      case 'EXPANSAO_LEILAO': return 'Expansao Fundiaria (Leiloes e Arrendamentos)';
      case 'DOU': return 'Diario Oficial da Uniao (DOU - Licencas & Atos)';
      case 'EVENTO_AGRO': return 'Feira e Evento Agropecuario';
      case 'PASSIVO_IBAMA': return 'Passivo Ambiental (Autuacoes & Embargos)';
      default: return sparkType || 'Sinal de Mercado';
    }
  }

  /**
   * Formata a mensagem tática de alto padrão executivo (SEM EMOJIS)
   */
  static formatMessage(signal, baseUrl = 'https://apisleads.vercel.app') {
    const typeLabel = this.getSparkTypeLabel(signal.spark_type);
    const titular = signal.titular_identificado || signal.nome_imovel || 'Titular Nao Identificado';
    const doc = signal.documento_identificado || 'Nao informado';
    const local = [signal.municipio, signal.uf].filter(Boolean).join(' / ') || 'Nacional';
    
    let financeiroOuVolume = '';
    if (Number(signal.valor_monetario) > 0) {
      financeiroOuVolume = `VALOR ESTIMADO: ${Number(signal.valor_monetario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    } else if (Number(signal.volume_m3h) > 0) {
      financeiroOuVolume = `VOLUME AUTORIZADO: ${signal.volume_m3h} m3/h\n`;
    }

    const deepLink = `${baseUrl.replace(/\/$/, '')}/?tab=sparks&signal_id=${signal.id}`;

    return [
      `[VERSUS SPARKS] ALERTA DE OPORTUNIDADE DETECTADA`,
      `----------------------------------------`,
      `MONITOR: ${typeLabel}`,
      `TITULAR: ${titular}`,
      `DOCUMENTO: ${doc}`,
      `LOCALIZACAO: ${local}`,
      financeiroOuVolume ? financeiroOuVolume.trim() : null,
      `GATILHO: ${signal.trigger_texto || signal.titulo}`,
      `RESUMO: ${signal.resumo || 'Sem observacoes adicionais.'}`,
      `----------------------------------------`,
      `ACESSAR DOSSIE COMPLETO NA PLATAFORMA:`,
      deepLink
    ].filter(Boolean).join('\n');
  }

  /**
   * Despacha o alerta para todos os gestores ativos elegíveis para este tipo de sinal
   */
  static async notifySignal(signal, tenantId = 'tenant-root-default', baseUrl = 'https://apisleads.vercel.app') {
    const recipients = db.prepare(`
      SELECT * FROM sparks_alert_recipients 
      WHERE tenant_id = ? AND ativo = 1
    `).all(tenantId);

    if (!recipients.length) {
      return {
        dispatched: false,
        reason: 'Nenhum gestor ativo configurado no Super Admin.',
        recipients_count: 0
      };
    }

    const messageText = this.formatMessage(signal, baseUrl);
    const results = [];

    for (const recipient of recipients) {
      // Verifica filtro de tipos se configurado
      let canReceive = true;
      if (recipient.tipos_alertas && recipient.tipos_alertas !== 'ALL') {
        try {
          const allowed = JSON.parse(recipient.tipos_alertas);
          if (Array.isArray(allowed) && !allowed.includes(signal.spark_type)) {
            canReceive = false;
          }
        } catch (_) {}
      }

      if (!canReceive) continue;

      // Executa o despacho e auditoria com whatsappOutboundService
      const dispatchRes = whatsappOutboundService.dispatch({
        tenant_id: tenantId,
        lead_id: signal.lead_id || null,
        phone: recipient.telefone,
        message: messageText,
        channel: 'sparks_alert'
      });

      results.push({
        recipient_id: recipient.id,
        recipient_name: recipient.nome,
        phone: recipient.telefone,
        success: dispatchRes.success,
        direct_url: dispatchRes.direct_url,
        message_id: dispatchRes.message_id
      });
    }

    return {
      dispatched: true,
      signal_id: signal.id,
      recipients_total: recipients.length,
      dispatched_count: results.length,
      details: results
    };
  }

  /**
   * Envia disparo de teste para validar o recebimento de um gestor
   */
  static sendTestMessage(recipientId, tenantId = 'tenant-root-default', baseUrl = 'https://apisleads.vercel.app') {
    const recipient = db.prepare(`
      SELECT * FROM sparks_alert_recipients 
      WHERE id = ? AND tenant_id = ?
    `).get(recipientId, tenantId);

    if (!recipient) {
      throw new Error(`Gestor destinatário '${recipientId}' não encontrado.`);
    }

    const testSignal = {
      id: 'sig-test-preview',
      spark_type: 'CREDITO_BNDES',
      titulo: 'Financiamento BNDES Moderfrota Aprovado - Teste de Disparo',
      resumo: 'Disparo de teste executivo para confirmacao de canal seguro de alertas.',
      orgao_emissor: 'BNDES / BACEN',
      valor_monetario: 3500000.0,
      documento_identificado: '00.000.000/0001-91',
      titular_identificado: 'FAZENDA EXEMPLO MODELO S.A.',
      municipio: 'Rondonópolis',
      uf: 'MT',
      trigger_texto: 'Teste de Integracao do Radar Sparks'
    };

    const messageText = this.formatMessage(testSignal, baseUrl);

    const dispatchRes = whatsappOutboundService.dispatch({
      tenant_id: tenantId,
      phone: recipient.telefone,
      message: messageText,
      channel: 'sparks_test_alert'
    });

    return {
      success: dispatchRes.success,
      recipient_name: recipient.nome,
      phone: recipient.telefone,
      direct_url: dispatchRes.direct_url,
      message_text: messageText,
      message_id: dispatchRes.message_id
    };
  }
}

export default SparksAlertDispatcherService;
