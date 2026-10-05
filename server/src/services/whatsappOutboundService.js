import crypto from 'crypto';
import db from '../config/database.js';
import { validatePhoneChannel } from '../modules/intent/phoneValidator.js';
import { generateContextualCopies } from '../modules/ai/copywritingEngine.js';

// Inicializa a tabela de auditoria de mensagens outbound se não existir
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_outbound_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      lead_id TEXT,
      recipient_phone TEXT NOT NULL,
      e164 TEXT NOT NULL,
      quality_score INTEGER DEFAULT 0,
      quality_tier TEXT DEFAULT 'UNKNOWN',
      message_text TEXT NOT NULL,
      channel TEXT DEFAULT 'whatsapp_web',
      status TEXT DEFAULT 'SENT',
      direct_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_wa_outbound_tenant ON whatsapp_outbound_messages(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_wa_outbound_recipient ON whatsapp_outbound_messages(recipient_phone);
    CREATE INDEX IF NOT EXISTS idx_wa_outbound_created ON whatsapp_outbound_messages(created_at DESC);
  `);
} catch (err) {
  console.warn('[WA_OUTBOUND] Tabela whatsapp_outbound_messages já verificada:', err.message);
}

export const whatsappOutboundService = {
  /**
   * Validação prévia de número telefônico contra 67 DDDs e 9º dígito
   */
  validate(rawPhone) {
    return validatePhoneChannel(rawPhone);
  },

  /**
   * Validação em lote de telefones
   */
  validateBatch(phones = []) {
    return phones.map(p => ({
      phone: p,
      validation: validatePhoneChannel(p)
    }));
  },

  /**
   * Prepara mensagem contextual de abordagem outbound para SDR
   */
  prepareApproach(lead = {}, customTemplate = null) {
    if (customTemplate && typeof customTemplate === 'string') {
      return customTemplate;
    }

    // Se for produtor rural
    if (lead.nome_titular) {
      const titular = lead.nome_titular.split(' ')[0] || 'Produtor';
      const fazenda = lead.nome_imovel || 'sua propriedade';
      const cidade = lead.cidade || lead.municipio || 'sua região';
      const cultura = lead.dados_agronomicos?.crop_type || 'safra';
      return `Olá, ${titular}! Acompanhamos a produtividade e a relevância de ${fazenda} em ${cidade}. Estruturamos uma análise comparativa de redução de custos e insumos para ${cultura} que pode apoiar suas decisões de safra. Posso compartilhar o resumo executivo de 2 minutos por aqui?`;
    }

    // Se for empresa B2B
    const copyPack = generateContextualCopies(lead);
    if (copyPack && copyPack.whatsapp_outbound) {
      return copyPack.whatsapp_outbound;
    }

    const nome = lead.contato_nome || lead.nome_fantasia || lead.razao_social || 'Gestor';
    const empresa = lead.nome_fantasia || lead.razao_social || 'sua empresa';
    return `Olá, ${nome}! Notei a atuação da ${empresa} no seu segmento. Elaboramos uma oportunidade estratégica de posicionamento comercial para apoiar a expansão da sua operação este mês. Teria 3 minutos para analisarmos juntos?`;
  },

  /**
   * Dispara abordagem outbound (Gera link tático oficial e registra auditoria)
   */
  dispatch({
    tenant_id = 'tenant-root-default',
    lead_id = null,
    phone,
    message = null,
    lead = null,
    channel = 'whatsapp_web'
  }) {
    const raw = phone || lead?.telefone || lead?.whatsapp_validado || lead?.bureau_whatsapp || lead?.whatsapp;
    const validation = validatePhoneChannel(raw);

    if (!validation.is_valid) {
      return {
        success: false,
        error: 'Número telefônico inválido para disparo de WhatsApp',
        validation,
        issues: validation.issues
      };
    }

    const finalMessage = message || this.prepareApproach(lead || { telefone: raw });
    const encodedMessage = encodeURIComponent(finalMessage);
    const cleanPhone = validation.cleaned.replace(/^55/, '');
    const directUrl = `https://wa.me/55${cleanPhone}?text=${encodedMessage}`;

    const id = `wamsg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    try {
      // Garante que o tenant_id seja válido para a foreign key
      let validTenantId = tenant_id;
      const tenantExists = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenant_id);
      if (!tenantExists) {
        validTenantId = 'tenant-root-default';
      }

      db.prepare(`
        INSERT INTO whatsapp_outbound_messages (
          id, tenant_id, lead_id, recipient_phone, e164, quality_score, quality_tier, message_text, channel, status, direct_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPATCHED', ?)
      `).run(
        id,
        validTenantId,
        lead_id ? String(lead_id) : null,
        validation.raw,
        validation.e164,
        validation.quality_score,
        validation.quality_tier,
        finalMessage,
        channel,
        directUrl
      );
    } catch (dbErr) {
      console.warn('[WA_OUTBOUND] Erro ao gravar log de auditoria:', dbErr.message);
    }

    return {
      success: true,
      message_id: id,
      e164: validation.e164,
      cleaned_phone: validation.cleaned,
      type: validation.type,
      quality_score: validation.quality_score,
      quality_tier: validation.quality_tier,
      direct_url: directUrl,
      message_text: finalMessage,
      status: 'DISPATCHED',
      dispatched_at: new Date().toISOString()
    };
  },

  /**
   * Lista histórico de mensagens disparadas por tenant
   */
  getHistory(tenantId = 'tenant-root-default', limit = 50) {
    return db.prepare(`
      SELECT * FROM whatsapp_outbound_messages 
      WHERE tenant_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(tenantId, limit);
  }
};
