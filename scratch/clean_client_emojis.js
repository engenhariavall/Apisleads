import fs from 'fs';

let code = fs.readFileSync('./client/js/aiCopilot.js', 'utf8');

// Substituições de toasts e mensagens
const replacements = [
  ["showToast('🧹 Novo tópico iniciado. Memória do Copiloto resetada.');", "showToast('Novo tópico iniciado. Memória do Copiloto resetada.');"],
  ["this.appendMessage('assistant', `🔒 **Acesso Bloqueado:** ${expiredMsg}`);", "this.appendMessage('assistant', `**Acesso Bloqueado:** ${expiredMsg}`);"],
  ["this.appendMessage('assistant', `⚠️ **Erro:** ${errorMsg}`);", "this.appendMessage('assistant', `**Aviso:** ${errorMsg}`);"],
  ["this.appendMessage('assistant', '⚠️ **Erro de Conexão:** Não foi possível contactar o servidor do Copiloto.');", "this.appendMessage('assistant', '**Erro de Conexão:** Não foi possível contactar o servidor do Copiloto.');"],
  ["icon: '🔒'", "icon: ''"],
  ["icon: '🎯'", "icon: ''"],
  ["icon: '❌'", "icon: ''"],
  ["icon: '📊'", "icon: ''"],
  ["icon: '🗺️'", "icon: ''"],
  ["icon: '🌿'", "icon: ''"],
  ["icon: '⚠️'", "icon: ''"],
  ["icon: '🔄'", "icon: ''"],
  ["icon: '💬'", "icon: ''"],
  ["icon: '🌙'", "icon: ''"],
  ["icon: '🔍'", "icon: ''"],
  ["icon: '🖥️'", "icon: ''"],
  ["icon: '🛰️'", "icon: ''"],
  ["icon: icon || '⚡'", "icon: icon || ''"],
  ["buttonLabel: '📋 Ver no Gerenciador'", "buttonLabel: 'Ver no Gerenciador'"],
  ["buttonLabel: '🔄 Restaurar Filtros'", "buttonLabel: 'Restaurar Filtros'"],
  ["buttonLabel: '📋 Ver documentação'", "buttonLabel: 'Ver documentação'"],
  ["buttonLabel: '🟢 Iniciar Conversa no WhatsApp'", "buttonLabel: 'Iniciar Conversa no WhatsApp'"],
  ["buttonLabel: '🔍 Inspecionar Dossiê'", "buttonLabel: 'Inspecionar Dossiê'"],
  ["buttonLabel: '🗺️ Reabrir Google Maps Satélite'", "buttonLabel: 'Reabrir Google Maps Satélite'"],
  ["showToast(`🎯 ${data.records_synced || 0} leads sincronizados no Meta Ads!`);", "showToast(`${data.records_synced || 0} leads sincronizados no Meta Ads.`);"],
  ["showToast('❌ Falha na sincronização com Meta Ads.');", "showToast('Falha na sincronização com Meta Ads.');"],
  ["showToast('📊 Planilha formatada para Meta Ads gerada pelo Copiloto!');", "showToast('Planilha formatada para Meta Ads gerada pelo Copiloto.');"],
  ["⚡ <strong>${totalMatches} propriedades</strong>", "<strong>${totalMatches} propriedades</strong>"],
  ["showToast(`✅ Filtro aplicado: ${filterDesc.join(', ') || 'Malha atualizada'}`);", "showToast(`Filtro aplicado: ${filterDesc.join(', ') || 'Malha atualizada'}`);"],
  ["showToast(`🌿 Filtro Ambiental Aplicado: ${statusLabel}${ufPart}${munPart}`);", "showToast(`Filtro Ambiental Aplicado: ${statusLabel}${ufPart}${munPart}`);"],
  ["<span style=\"font-size:1rem;\">🔄</span>", ""],
  ["showToast('⚠️ Configure CRM_WEBHOOK_URL no .env para ativar o envio.');", "showToast('Configure CRM_WEBHOOK_URL no .env para ativar o envio.');"],
  ["showToast(`✅ ${data.total_processed || 0} leads injetados no CRM com sucesso!`);", "showToast(`${data.total_processed || 0} leads injetados no CRM com sucesso.`);"],
  ["showToast('❌ Falha ao injetar leads no CRM.');", "showToast('Falha ao injetar leads no CRM.');"],
  ["showToast('💬 Dossiê SDR aberto e copy de WhatsApp preparada!');", "showToast('Dossiê SDR aberto e copy de WhatsApp preparada.');"],
  ["showToast(`🌙 Varredura noturna agendada: ${total} municípios (${estado})`);", "showToast(`Varredura noturna agendada: ${total} municípios (${estado})`);"],
  ["showToast(`🔍 Ficha de ${openedName} aberta no Inspetor.`);", "showToast(`Ficha de ${openedName} aberta no Inspetor.`);"],
  ["showToast(`🖥️ Visualização: ${tabName}`);", "showToast(`Visualização: ${tabName}`);"],
  ["showToast('🔄 Filtros restaurados para a visão padrão.');", "showToast('Filtros restaurados para a visão padrão.');"],
  ["showToast('🛰️ Satélite externo aberto em nova aba.');", "showToast('Satélite externo aberto em nova aba.');"],
  ["showToast(`⚠️ ${msg}`);", "showToast(msg);"],
  ["this.input.placeholder = '🎙️ Gravando sua voz... Fale o comando e clique no microfone para enviar.';", "this.input.placeholder = 'Gravando áudio... Fale o comando e clique no microfone para enviar.';"],
  ["this.input.placeholder = '⚡ Transcrevendo áudio com Whisper...';", "this.input.placeholder = 'Transcrevendo áudio...';"],
  ["showToast(`⚠️ Transcrição: ${err}`);", "showToast(`Transcrição: ${err}`);"],
  ["showToast('⚠️ Erro ao enviar áudio para transcrição.');", "showToast('Erro ao enviar áudio para transcrição.');"],
  ["showToast('⚠️ Falha ao reproduzir áudio.');", "showToast('Falha ao reproduzir áudio.');"],
  ["showToast(`⚠️ Erro de áudio: ${err.message}`);", "showToast(`Erro de áudio: ${err.message}`);"],
  ["🔒 Modo de Homologação / Sandbox Ativo", "Modo de Homologação / Sandbox Ativo"],
  ["✅ Meta Ads Live Conectado", "Meta Ads Live Conectado"]
];

for (const [target, replacement] of replacements) {
  code = code.split(target).join(replacement);
}

// Remove emojis de blocos de strings
code = code.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

fs.writeFileSync('./client/js/aiCopilot.js', code, 'utf8');
console.log('✅ client/js/aiCopilot.js limpo com sucesso!');
