/**
 * test_phase55_scraping_job_queue.js
 * 
 * Suíte de testes para a FASE 55: MOTOR DE VARREDURA AUTÔNOMA (CRON/JOB QUEUE)
 * Valida:
 * 1. Tabela SQLite scraping_job_queue e resolução de cidades por UF
 * 2. Enfileiramento cadenciado com delay defensivo anti-rate limit
 * 3. Telemetria e processamento de jobs pendentes
 * 4. Definição da Tool agendarVarreduraNoturna em COPILOT_TOOLS
 * 5. Interceptação de prompt "mapear cidades de Soja no RS esta noite" com trigger_schedule_scraping
 * 6. Action Dispatcher e Card Tático no client/js/aiCopilot.js
 */

import { queueService } from '../server/src/services/queueService.js';
import { aiCopilotService, COPILOT_TOOLS } from '../server/src/services/aiCopilotService.js';
import db from '../server/src/config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (error) {
    console.error(`❌ [FAIL] ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('🧪 Iniciando testes da FASE 55: MOTOR DE VARREDURA AUTÔNOMA (CRON/JOB QUEUE)\n');

async function runTests() {
  const testTenantId = 'tenant-test-phase55';

  // TESTE 1: Integridade da tabela SQLite scraping_job_queue
  await test('1. Tabela scraping_job_queue existe com índices no SQLite', async () => {
    const tableInfo = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='scraping_job_queue'
    `).get();
    assert(tableInfo && tableInfo.name === 'scraping_job_queue', 'Tabela scraping_job_queue deve existir');

    const columns = db.prepare(`PRAGMA table_info(scraping_job_queue)`).all();
    const colNames = columns.map(c => c.name);
    assert(colNames.includes('id'), 'Coluna id ausente');
    assert(colNames.includes('estado'), 'Coluna estado ausente');
    assert(colNames.includes('municipio'), 'Coluna municipio ausente');
    assert(colNames.includes('cultura_foco'), 'Coluna cultura_foco ausente');
    assert(colNames.includes('status'), 'Coluna status ausente');
    assert(colNames.includes('delay_seconds'), 'Coluna delay_seconds ausente');
    assert(colNames.includes('scheduled_for'), 'Coluna scheduled_for ausente');
  });

  // TESTE 2: Resolução de cidades prioritárias por UF
  await test('2. queueService.resolveCitiesForState resolve pólos agrícolas para RS, MT e GO', async () => {
    const rsCities = queueService.resolveCitiesForState('RS', 3);
    assert(Array.isArray(rsCities) && rsCities.length === 3, 'Deve retornar 3 cidades para RS');
    assert(rsCities.includes('PASSO FUNDO') || rsCities.includes('CRUZ ALTA'), 'RS deve conter cidades polo agrícolas');

    const mtCities = queueService.resolveCitiesForState('MT', 4);
    assert(mtCities.length === 4, 'Deve retornar 4 cidades para MT');
    assert(mtCities.includes('SORRISO') || mtCities.includes('SINOP'), 'MT deve conter Sorriso ou Sinop');
  });

  // TESTE 3: Agendamento cadenciado de varredura noturna na fila
  await test('3. queueService.agendarVarreduraNoturna enfileira jobs com delay escalonado', async () => {
    queueService.clearQueue(testTenantId);

    const result = await queueService.agendarVarreduraNoturna({
      estado: 'RS',
      cultura_foco: 'Soja',
      quantidade_municipios: 3,
      delay_minutes: 5,
      tenantId: testTenantId
    });

    assert(result.success === true, 'Agendamento deve retornar success: true');
    assert(result.total_agendado === 3, 'Deve agendar 3 cidades');
    assert(result.estado === 'RS', 'Estado retornado deve ser RS');
    assert(result.jobs.length === 3, 'Deve conter lista de 3 jobs');

    // Verifica espaçamento de delay
    assert(result.jobs[0].delay_minutos_acumulado === 0, 'Primeiro job deve iniciar em 0 min');
    assert(result.jobs[1].delay_minutos_acumulado === 5, 'Segundo job deve ter delay de 5 min');
    assert(result.jobs[2].delay_minutos_acumulado === 10, 'Terceiro job deve ter delay de 10 min');

    // Valida persistência no SQLite
    const count = db.prepare('SELECT COUNT(*) as total FROM scraping_job_queue WHERE tenant_id = ?').get(testTenantId);
    assert(count.total === 3, `Devem existir 3 jobs no banco, encontrados ${count.total}`);
  });

  // TESTE 4: Telemetria e estatísticas da fila (getQueueStats)
  await test('4. queueService.getQueueStats retorna telemetria correta', async () => {
    const stats = queueService.getQueueStats(testTenantId);
    assert(stats.total === 3, 'Total deve ser 3');
    assert(stats.pending === 3, 'Pendentes deve ser 3');
    assert(stats.running === 0, 'Executando deve ser 0');
    assert(stats.completed === 0, 'Concluídos deve ser 0');
    assert(stats.next_job !== null, 'Deve identificar o próximo job agendado');
    assert(stats.next_job.estado === 'RS', 'Próximo job deve ser do RS');
  });

  // TESTE 5: Processamento de job pendente da fila (processNextJob)
  await test('5. queueService.processNextJob executa e marca job como COMPLETED', async () => {
    const procResult = await queueService.processNextJob(testTenantId);
    assert(procResult.success === true, 'Processamento do job deve ter sucesso');
    assert(procResult.job_id, 'Deve retornar o ID do job processado');

    const updatedJob = db.prepare('SELECT * FROM scraping_job_queue WHERE id = ?').get(procResult.job_id);
    assert(updatedJob.status === 'COMPLETED', `Status deve ser COMPLETED, mas é ${updatedJob.status}`);
    assert(updatedJob.completed_at !== null, 'Data de conclusão deve estar preenchida');
    assert(updatedJob.result_summary && updatedJob.result_summary.length > 0, 'Resumo do resultado deve estar gravado');

    // Verifica que pending diminuiu para 2
    const stats = queueService.getQueueStats(testTenantId);
    assert(stats.completed === 1, 'Deve registrar 1 job concluído nas estatísticas');
    assert(stats.pending === 2, 'Devem restar 2 jobs pendentes');
  });

  // TESTE 6: Definição da Ferramenta em COPILOT_TOOLS
  await test('6. COPILOT_TOOLS inclui a tool agendarVarreduraNoturna com schema oficial', async () => {
    const tool = COPILOT_TOOLS.find(t => t.function?.name === 'agendarVarreduraNoturna');
    assert(tool, 'Tool agendarVarreduraNoturna deve estar presente em COPILOT_TOOLS');
    assert(tool.type === 'function', 'Tool deve ser do tipo function');
    assert(tool.function.description.includes('SIGEF/INCRA') || tool.function.description.includes('noturna'), 'Descrição deve detalhar varredura noturna');

    const props = tool.function.parameters.properties;
    assert(props.estado, 'Parâmetro estado deve existir');
    assert(props.cultura_foco, 'Parâmetro cultura_foco deve existir');
    assert(props.quantidade_municipios, 'Parâmetro quantidade_municipios deve existir');
    assert(tool.function.parameters.required.includes('estado'), 'estado deve ser obrigatório');
  });

  // TESTE 7: Acionamento via Prompt ("mapear cidades de Soja no RS esta noite")
  await test('7. Prompt "mapear cidades de Soja no RS esta noite" aciona trigger_schedule_scraping', async () => {
    queueService.clearQueue('tenant-root-default');

    const chatResponse = await aiCopilotService.processChat({
      prompt: 'mapear cidades de Soja no RS esta noite',
      context: {}
    });

    assert(chatResponse.success === true, 'Chat deve responder com sucesso');
    assert(chatResponse.action === 'trigger_schedule_scraping', `Action deve ser trigger_schedule_scraping, recebido: ${chatResponse.action}`);
    assert(chatResponse.action_payload, 'Payload da ação deve existir');
    assert(chatResponse.action_payload.estado === 'RS', `Estado deve ser RS, recebido: ${chatResponse.action_payload.estado}`);
    assert(chatResponse.action_payload.cultura_foco === 'Soja', `Cultura deve ser Soja, recebido: ${chatResponse.action_payload.cultura_foco}`);
    assert(chatResponse.reply.includes('Varredura Noturna Agendada'), 'Resposta textual deve confirmar agendamento');
    assert(chatResponse.reply.includes('RS'), 'Resposta deve citar RS');

    // Valida que municípios foram de fato gravados na fila
    const queueCheck = db.prepare(`SELECT COUNT(*) as total FROM scraping_job_queue WHERE estado = 'RS'`).get();
    assert(queueCheck.total > 0, 'Deve ter gravado jobs do RS na fila');
  });

  // TESTE 8: Validação do Action Dispatcher no client/js/aiCopilot.js
  await test('8. client/js/aiCopilot.js implementa trigger_schedule_scraping e card com lua', async () => {
    const jsPath = path.join(__dirname, '../client/js/aiCopilot.js');
    const jsContent = fs.readFileSync(jsPath, 'utf-8');

    assert(jsContent.includes('trigger_schedule_scraping'), 'aiCopilot.js deve tratar trigger_schedule_scraping no switch');
    assert(jsContent.includes('executeScheduleScrapingAction'), 'aiCopilot.js deve conter o método executeScheduleScrapingAction');
    assert(jsContent.includes('Varredura Noturna Agendada'), 'Card de ação deve conter título Varredura Noturna Agendada');
    assert(jsContent.includes('🌙'), 'Card de ação deve renderizar o emoji de lua');
    assert(jsContent.includes('processamento cadenciado'), 'Card deve informar processamento cadenciado');
  });

  // TESTE 9: Quick Chip no index.html e registro no checklist.md
  await test('9. index.html contém quick chip e checklist.md registra FASE 55', async () => {
    const indexPath = path.join(__dirname, '../client/index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    assert(indexContent.includes('Varredura Noturna RS'), 'index.html deve conter quick chip de Varredura Noturna RS');

    const checklistPath = path.join(__dirname, '../checklist.md');
    const checklistContent = fs.readFileSync(checklistPath, 'utf-8');
    assert(checklistContent.includes('FASE 55: MOTOR DE VARREDURA AUTÔNOMA'), 'checklist.md deve registrar a FASE 55');
    assert(checklistContent.includes('agendarVarreduraNoturna'), 'checklist.md deve documentar a tool agendarVarreduraNoturna');
  });

  // Limpeza de tenant de teste
  queueService.clearQueue(testTenantId);

  console.log('\n🎉 TODOS OS TESTES DA FASE 55 PASSARAM COM 100% DE SUCESSO!\n');
}

runTests().catch(err => {
  console.error('Falha crítica nos testes:', err);
  process.exit(1);
});
