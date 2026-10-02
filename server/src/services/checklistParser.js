import fs from 'fs';
import path from 'path';

/**
 * Motor de parsing do checklist.md (Padrão VERSUS)
 * Transforma o arquivo Markdown em JSON estruturado com métricas executivas,
 * relógio de ponto eletrônico inviolável com os 4 marcos diários, fases e timeline.
 */
export function parseChecklistMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);

  const phases = [];
  const punchIns = [];
  const roadmapItems = [];

  let currentPhase = null;
  let currentItem = null;
  let currentSection = 'phases';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Seção de Registro de Ponto
    const isPontoHeader = /^##\s+.*(?:Registro\s+de\s+Ponto|Timesheet|Ponto\s+Eletrônico)/i.test(line);
    if (isPontoHeader) {
      if (currentPhase) {
        if (currentItem) currentPhase.items.push(currentItem);
        phases.push(currentPhase);
        currentPhase = null;
        currentItem = null;
      }
      currentSection = 'ponto';
      continue;
    }

    // Seção de Roadmap Futuro
    if (line.startsWith('## 🚀 Roadmap Futuro') || /^##\s+.*Roadmap/i.test(line)) {
      if (currentPhase) {
        if (currentItem) currentPhase.items.push(currentItem);
        phases.push(currentPhase);
        currentPhase = null;
        currentItem = null;
      }
      currentSection = 'roadmap';
      continue;
    }

    // Seção de Fases
    if (/^##\s+.*(?:Fases)/i.test(line)) {
      if (currentPhase) {
        if (currentItem) currentPhase.items.push(currentItem);
        phases.push(currentPhase);
        currentPhase = null;
        currentItem = null;
      }
      currentSection = 'phases';
      continue;
    }

    // Processamento de Linhas de Ponto com Timestamp [DD/MM/YYYY - HH:MM]
    const matchPonto = line.match(/^-\s+\*\*\[(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}:\d{2})\]\*\*\s*(.*)$/);
    if (matchPonto) {
      const [, date, time, rest] = matchPonto;
      let type = 'info';
      let icon = 'ℹ️';

      if (rest.includes('🟢')) {
        type = 'start';
        icon = '🟢';
      } else if (rest.includes('⏸️')) {
        type = 'pause';
        icon = '⏸️';
      } else if (rest.includes('▶️')) {
        type = 'resume';
        icon = '▶️';
      } else if (rest.includes('🏁')) {
        type = 'end';
        icon = '🏁';
      } else if (rest.includes('⚡') || rest.includes('🚀') || rest.includes('💎') || rest.includes('🛡️') || rest.includes('🎯')) {
        type = 'task';
        icon = rest.match(/^[^\w\s]+/)?.[0] || '⚡';
      }

      const cleanDesc = rest
        .replace(/^[^\w\s]+\s*/, '')
        .replace(/^(\*\*)+|(\*\*|:|\*\*:)+$/g, '')
        .trim();

      punchIns.push({
        timestamp: `${date} ${time}`,
        date,
        time,
        type,
        icon,
        description: cleanDesc
      });
      continue;
    }

    // Ignora sub-itens na seção de ponto para evitar ruído na timeline
    if (currentSection === 'ponto' && (line.startsWith('-') || line.startsWith('*') || line.startsWith('  '))) {
      continue;
    }

    // Processamento de Itens de Roadmap
    if (currentSection === 'roadmap') {
      const matchRoadmap = line.match(/^-\s+\[( |x)\]\s+\*\*(.+?)\*\*(?::)?\s*(.*)$/i);
      if (matchRoadmap) {
        const title = matchRoadmap[2].replace(/:$/, '').trim();
        const inlineDesc = matchRoadmap[3].trim();
        roadmapItems.push({
          checked: matchRoadmap[1].toLowerCase() === 'x',
          title,
          description: inlineDesc || 'Módulo estratégico de expansão planejado para os próximos ciclos.'
        });
      }
      continue;
    }

    // Processamento de Fases
    const matchPhase = line.match(/^###\s+.*?\bFase\s+(\d+)\s*:\s*(.+)$/i);
    if (matchPhase) {
      if (currentPhase) {
        if (currentItem) currentPhase.items.push(currentItem);
        phases.push(currentPhase);
      }
      currentSection = 'phases';

      const phaseNum = parseInt(matchPhase[1], 10);
      const cleanTitle = matchPhase[2].trim();

      currentPhase = {
        id: phaseNum,
        title: cleanTitle,
        rawTitle: line.replace(/^###\s+/, '').trim(),
        isCompleted: false,
        items: []
      };
      currentItem = null;
      continue;
    }

    // Itens de checklist de uma fase
    if (currentPhase && currentSection === 'phases') {
      const matchItem = line.match(/^-\s+\[( |x)\]\s+(.+)$/i);
      if (matchItem) {
        if (currentItem) {
          currentPhase.items.push(currentItem);
        }
        currentItem = {
          checked: matchItem[1].toLowerCase() === 'x',
          text: matchItem[2].trim(),
          subitems: []
        };
        continue;
      }

      // Sub-itens detalhados da tarefa
      const matchSub = line.match(/^[\*\-]\s+(.+)$/);
      if (matchSub && currentItem && !line.includes('[ ]') && !line.includes('[x]')) {
        currentItem.subitems.push(matchSub[1].trim());
        continue;
      }
    }
  }

  // Adiciona a última fase processada
  if (currentPhase) {
    if (currentItem) currentPhase.items.push(currentItem);
    phases.push(currentPhase);
  }

  // Ordena fases por número
  phases.sort((a, b) => a.id - b.id);

  // Calcula estatísticas de tarefas e conclusão por fase
  let totalTasks = 0;
  let completedTasks = 0;

  phases.forEach(p => {
    if (p.items.length > 0) {
      const hasUnchecked = p.items.some(i => !i.checked);
      p.isCompleted = !hasUnchecked;
      p.items.forEach(i => {
        totalTasks++;
        if (i.checked) completedTasks++;
      });
    } else {
      p.isCompleted = true;
    }
  });

  const completedPhases = phases.filter(p => p.isCompleted).length;
  const pendingPhase = phases.find(p => !p.isCompleted);
  const currentActivePhaseTitle = pendingPhase
    ? `Fase ${pendingPhase.id}: ${pendingPhase.title}`
    : `Todas as ${phases.length} Fases Concluídas (100%)`;

  const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Função auxiliar para data e hora
  const parseDateTime = (d, t) => {
    try {
      const partsDate = d.split('/').map(Number);
      const partsTime = t.split(':').map(Number);
      if (partsDate.length === 3 && partsTime.length >= 2) {
        return new Date(partsDate[2], partsDate[1] - 1, partsDate[0], partsTime[0], partsTime[1]).getTime();
      }
    } catch (e) {}
    return 0;
  };

  // Agrupamento de registros de ponto por data
  const punchesByDate = new Map();
  for (const p of punchIns) {
    if (!punchesByDate.has(p.date)) {
      punchesByDate.set(p.date, []);
    }
    punchesByDate.get(p.date).push(p);
  }

  // Ordena cronologicamente e aplica a Regra de Inviolabilidade de Ponto
  punchesByDate.forEach(dayList => {
    dayList.sort((a, b) => parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time));

    let entrySet = false;
    for (let idx = 0; idx < dayList.length; idx++) {
      const item = dayList[idx];
      const descLower = item.description.toLowerCase();

      // Regra 1: O primeiro evento da manhã com 🟢 ou "início" é a Entrada Oficial e Imutável
      if (!entrySet && (idx === 0 || item.icon === '🟢' || descLower.includes('início') || descLower.includes('inicio'))) {
        item.type = 'start';
        item.isTimeclockEvent = true;
        entrySet = true;
      } else if (
        item.icon === '⏸️' ||
        descLower.includes('pausa') ||
        descLower.includes('intervalo') ||
        (descLower.includes('almoço') && !descLower.includes('retorno') && !descLower.includes('volta'))
      ) {
        item.type = 'pause';
        item.isTimeclockEvent = true;
      } else if (
        item.icon === '▶️' ||
        descLower.includes('retorno') ||
        descLower.includes('volta do almoço') ||
        descLower.includes('turno da tarde')
      ) {
        item.type = 'resume';
        item.isTimeclockEvent = true;
      } else if (
        item.icon === '🏁' ||
        descLower.includes('fim de turno') ||
        descLower.includes('encerramento') ||
        descLower.includes('saída')
      ) {
        item.type = 'end';
        item.isTimeclockEvent = true;
      } else {
        item.type = 'task';
        item.isTimeclockEvent = false;
      }
    }
  });

  // Identifica a data mais recente
  const sortedDates = Array.from(punchesByDate.keys()).sort((a, b) => {
    return parseDateTime(b, '12:00') - parseDateTime(a, '12:00');
  });

  const latestDate = sortedDates[0] || '';
  const todayPunches = latestDate ? punchesByDate.get(latestDate) : [];

  // Ponto Oficial do Dia (4 Marcos)
  const entryPunch = todayPunches.find(p => p.type === 'start') || todayPunches[0] || null;
  const lunchOutPunch = todayPunches.find(p => p.type === 'pause') || null;
  const lunchInPunch = todayPunches.find(p => p.type === 'resume') || null;
  const exitPunch = todayPunches.find(p => p.type === 'end') || null;

  let currentWorkdayStatus = 'idle';
  let workdayStatusLabel = 'Aguardando Início';

  if (exitPunch) {
    currentWorkdayStatus = 'completed';
    workdayStatusLabel = 'Jornada Concluída';
  } else if (lunchInPunch) {
    currentWorkdayStatus = 'afternoon_active';
    workdayStatusLabel = 'Turno da Tarde Ativo';
  } else if (lunchOutPunch) {
    currentWorkdayStatus = 'lunch';
    workdayStatusLabel = 'Intervalo de Almoço';
  } else if (entryPunch) {
    currentWorkdayStatus = 'morning_active';
    workdayStatusLabel = 'Turno da Manhã Ativo';
  }

  const latestActivity = todayPunches.length > 0 ? todayPunches[todayPunches.length - 1] : null;

  const timeclock = {
    date: latestDate,
    entryTime: entryPunch ? entryPunch.time : null,
    entryDescription: entryPunch ? entryPunch.description : null,
    lunchOutTime: lunchOutPunch ? lunchOutPunch.time : null,
    lunchInTime: lunchInPunch ? lunchInPunch.time : null,
    exitTime: exitPunch ? exitPunch.time : null,
    status: currentWorkdayStatus,
    statusLabel: workdayStatusLabel,
    totalEventsToday: todayPunches.length,
    latestActivity
  };

  return {
    stats: {
      totalPhases: phases.length,
      completedPhases,
      pendingPhases: phases.length - completedPhases,
      totalTasks,
      completedTasks,
      completionPercent,
      currentActivePhaseTitle,
      lastPunchIn: entryPunch,
      latestActivity,
      timeclock,
      entryTime: entryPunch?.time || '09:00',
      entryDate: latestDate || '21/09/2026',
      workdayStatus: workdayStatusLabel,
      updatedAt: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    },
    phases,
    punchIns: punchIns.reverse(), // Mais recentes primeiro na timeline
    roadmapItems,
    rawMarkdown: markdown
  };
}

/**
 * Lê o arquivo checklist.md da raiz do projeto e retorna os dados parseados.
 */
export function getChecklistData(checklistFilePath) {
  const markdown = fs.readFileSync(checklistFilePath, 'utf8');
  return parseChecklistMarkdown(markdown);
}
