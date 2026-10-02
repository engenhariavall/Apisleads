import fs from 'fs';

let code = fs.readFileSync('./server/src/services/aiCopilotService.js', 'utf8');

// Adiciona seção 5 de diretriz executiva se não estiver presente
if (!code.includes('5. DIRETRIZ DE POSTURA EXECUTIVA E ZERO EMOJIS')) {
  const insertBefore = 'Sempre formate suas respostas utilizando Markdown elegante. Seja direto, tático e pragmático.';
  const executiveSection = `════════════════════════════════════════════════════════════════════════════════\n5. DIRETRIZ DE POSTURA EXECUTIVA E ZERO EMOJIS (OBRIGATÓRIO):\n════════════════════════════════════════════════════════════════════════════════\n• PROIBIÇÃO ABSOLUTA DE EMOJIS:\n  É terminantemente proibido utilizar qualquer caractere de emoji (ex: raios, alvos, lâmpadas, foguetes, etc.), emoticons ou ícones decorativos de texto em suas respostas.\n• COMUNICAÇÃO CORPORATIVA DE ALTO NÍVEL:\n  Mantenha uma linguagem sóbria, formal, analítica e de alta precisão comercial, utilizando estritamente bullet points padrão (•), títulos formais em negrito e pontuação convencional.\n\n`;
  code = code.replace(insertBefore, executiveSection + insertBefore);
}

// Lista de substituições de emojis específicos para textos corporativos elegantes
const replacements = [
  ['🧠 **Auditoria Cognitiva', '**Auditoria Cognitiva'],
  ['🛰️ **Visão Computacional', '**Visão Computacional'],
  ['🎯 **Análise de Aprendizado por Reforço', '**Análise de Aprendizado por Reforço'],
  ['⚡ **Radar Sparks: Sinais Quentes de Mercado', '**Radar Sparks: Sinais de Mercado'],
  ['> 🎯 **Acionamento:**', '> **Direcionamento Comercial:**'],
  ['🗺️ **Varredura Regional', '**Varredura Regional'],
  ['> ⚡ As zonas de sombra', '> As zonas de sombra'],
  ['🔭 **Análise de Cidades Desatendidas', '**Análise de Cidades Desatendidas'],
  ['> 💡 **Oportunidade Comercial:**', '> **Oportunidade Comercial:**'],
  ['> 💡 **Recomendação Tática:**', '> **Recomendação Tática:**'],
  ['🌿 **Busca Fundiária', '**Busca Fundiária'],
  ['> 📍 Carregadas no **Mapa WebGL**', '> Carregadas no **Mapa WebGL**'],
  ['📋 **Enriquecimento de Decisor', '**Enriquecimento de Decisor'],
  ['✅ WhatsApp Validado:', 'WhatsApp Validado:'],
  ['⚠️ ', 'Aviso: '],
  ['> 🔒 Dados higienizados', '> Dados higienizados'],
  ['🧠 **Aprendizado por Reforço', '**Aprendizado por Reforço'],
  ['> ⚡ O Copiloto calibrou', '> O Copiloto calibrou'],
  ['🎮 **Ações de Interface Executadas:**', '**Ações de Interface Executadas:**'],
  ['🛡️ **Aviso de Segurança e Sigilo Comercial**', '**Aviso de Segurança e Governança Corporativa**'],
  ['> 💡 **Como posso ajudá-lo:**', '> **Ações Disponíveis:**'],
  ['🔄 **Filtros Restaurados:**', '**Filtros Restaurados:**'],
  ['🖥️ **Interface Atualizada:**', '**Interface Atualizada:**'],
  ['🛰️ **Auditoria Visual Espacial:**', '**Auditoria Visual Espacial:**'],
  ['🔍 **Dossiê Tático Aberto:**', '**Dossiê Tático Aberto:**'],
  ['🚁 **Voo Espacial Executado:**', '**Voo Espacial Executado:**'],
  ['🌙 **Varredura Noturna Agendada:**', '**Varredura Noturna Agendada:**'],
  ['> 🛡️ **Defesa Anti-Rate Limit', '> **Defesa Anti-Rate Limit'],
  ['🔄 **Injeção no CRM Iniciada**', '**Injeção no CRM Iniciada**'],
  ['> ⚡ Aguarde a confirmação', '> Aguarde a confirmação'],
  ['🎯 **Sincronização Direta com Meta Marketing API**', '**Sincronização Direta com Meta Marketing API**'],
  ['> 🔒 **Criptografia Oficial:**', '> **Criptografia Oficial:**'],
  ['🎯 **Formatação de Dados para Meta Ads Custom Audiences**', '**Formatação de Dados para Meta Ads Custom Audiences**'],
  ['> 💡 **Ação Autônoma:**', '> **Ação Autônoma:**'],
  ['🌿 **Filtro Ambiental SICAR/CAR Aplicado', '**Filtro Ambiental SICAR/CAR Aplicado'],
  ['> ⚡ **Oportunidade B2B de Alta Urgência:**', '> **Oportunidade de Mercado:**'],
  ['> - 🌳 Consultoria', '> • Consultoria'],
  ['> - ⚖️ Assessoria', '> • Assessoria'],
  ['> - 💳 Crédito', '> • Crédito'],
  ['> - 📋 Licenciamento', '> • Licenciamento'],
  ['🗺️ **Filtro Aplicado com Sucesso**', '**Filtro Aplicado com Sucesso**'],
  ['> ⚡ **Inteligência VERSUS:**', '> **Inteligência VERSUS:**'],
  ['💬 **Abordagem Tática SDR Gerada**', '**Abordagem Tática SDR Gerada**'],
  ['📊 **Motor de Intenção e Scoring da Plataforma VERSUS**', '**Motor de Intenção e Scoring da Plataforma VERSUS**'],
  ['• 🔥 **HOT (70 a 100 pts):**', '• **HOT (70 a 100 pts):**'],
  ['• ⚡ **WARM (40 a 69 pts):**', '• **WARM (40 a 69 pts):**'],
  ['• ❄️ **COLD (0 a 39 pts):**', '• **COLD (0 a 39 pts):**'],
  ['> 💡 **Dica do Copiloto:**', '> **Diretriz Tática:**'],
  ['🌿 **Ponte OSINT do CAR (SICAR) & Passivos Ambientais**', '**Ponte OSINT do CAR (SICAR) e Passivos Ambientais**'],
  ['> ⚡ **Grande Oportunidade Comercial:**', '> **Oportunidade Comercial:**'],
  ['🎯 **Sincronização com Meta Ads (Custom Audiences)**', '**Sincronização com Meta Ads (Custom Audiences)**'],
  ['> 💡 **Como acionar:**', '> **Como acionar:**'],
  ['• 🗺️ **Filtros Avançados:**', '• **Filtros Avançados:**'],
  ['• 🌿 **Passivo Ambiental:**', '• **Passivo Ambiental:**'],
  ['• 📊 **Meta Ads:**', '• **Meta Ads:**'],
  ['• 💬 **Abordagem Comercial:**', '• **Abordagem Comercial:**'],
  ['• 🌙 **Extração Contínua:**', '• **Extração Contínua:**']
];

for (const [target, replacement] of replacements) {
  code = code.split(target).join(replacement);
}

// Remove emojis de blocos de strings
code = code.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

fs.writeFileSync('./server/src/services/aiCopilotService.js', code, 'utf8');
console.log('✅ aiCopilotService.js limpo com sucesso!');
