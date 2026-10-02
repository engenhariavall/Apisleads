/**
 * tests/test_copilot_audio_whisper_tts.js
 * 
 * Bateria Completa de Testes de Integração & Unidade:
 * DIRETRIZ: SUPORTE A ÁUDIO NO COPILOTO (WHISPER & TEXT-TO-SPEECH)
 * 
 * 1. Backend: Síntese de Voz (OpenAI TTS-1) via POST /api/ai/tts
 * 2. Backend: Transcrição de Áudio (OpenAI Whisper-1) via POST /api/ai/transcribe
 * 3. Backend: Bloqueio 403 de Test Drive Multi-Tenant expirado
 * 4. Frontend: Botão de microfone (#btnCopilotMic) no HTML e estilos CSS
 * 5. Frontend: Ícone de alto-falante (.copilot-tts-btn) em mensagens do assistente
 * 6. Frontend: Lógica de gravação via MediaRecorder e reprodução via Audio
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../server/src/app.js';
import db from '../server/src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function runTestSuite() {
  console.log('=============================================================');
  console.log('🧪 TESTES: COPILOTO COM WHISPER (STT) & TEXT-TO-SPEECH (TTS)');
  console.log('=============================================================');

  let passed = 0;
  let total = 0;

  function assert(cond, name, details) {
    total++;
    if (cond) {
      console.log(`✅ [PASS] ${total}. ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${total}. ${name}`, details || '');
    }
  }

  // -----------------------------------------------------------------
  // 1. Verificação de Frontend HTML & CSS
  // -----------------------------------------------------------------
  const indexHtml = fs.readFileSync(path.join(rootDir, 'client/index.html'), 'utf-8');
  assert(
    indexHtml.includes('id="btnCopilotMic"') && indexHtml.includes('btn-copilot-mic'),
    'HTML index.html possui o botão #btnCopilotMic dentro do formulário do Copiloto'
  );

  const stylesCss = fs.readFileSync(path.join(rootDir, 'client/css/styles.css'), 'utf-8');
  assert(
    stylesCss.includes('.btn-copilot-mic') &&
    stylesCss.includes('.btn-copilot-mic.recording') &&
    stylesCss.includes('.btn-copilot-mic.transcribing') &&
    stylesCss.includes('.copilot-tts-btn') &&
    stylesCss.includes('.copilot-tts-btn.playing'),
    'CSS styles.css implementa estilos visuais e micro-animações para microfone e TTS'
  );

  const aiCopilotJs = fs.readFileSync(path.join(rootDir, 'client/js/aiCopilot.js'), 'utf-8');
  assert(
    aiCopilotJs.includes('btnCopilotMic') &&
    aiCopilotJs.includes('toggleVoiceRecording') &&
    aiCopilotJs.includes('playTtsAudio') &&
    aiCopilotJs.includes('copilot-tts-btn') &&
    aiCopilotJs.includes('/api/ai/transcribe') &&
    aiCopilotJs.includes('/api/ai/tts'),
    'JavaScript aiCopilot.js implementa gravação via MediaRecorder e reprodução via Audio TTS'
  );

  // -----------------------------------------------------------------
  // 2. Verificação de Rotas Backend HTTP
  // -----------------------------------------------------------------
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let generatedAudioBuffer = null;

  try {
    // Teste Backend 1: Validação de parâmetro text no TTS
    const emptyTtsRes = await fetch(`${baseUrl}/api/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const emptyTtsData = await emptyTtsRes.json();
    assert(
      emptyTtsRes.status === 400 && emptyTtsData.error === 'TEXT_REQUIRED',
      'POST /api/ai/tts rejeita requisição sem texto com HTTP 400',
      emptyTtsData
    );

    // Teste Backend 2: Síntese de voz com OpenAI TTS-1
    const ttsRes = await fetch(`${baseUrl}/api/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'A Plataforma VERSUS possui inteligência de prospecção agro e b2b.',
        voice: 'alloy'
      })
    });
    const contentType = ttsRes.headers.get('content-type');
    generatedAudioBuffer = await ttsRes.arrayBuffer();
    assert(
      ttsRes.status === 200 && contentType.includes('audio/mpeg') && generatedAudioBuffer.byteLength > 2000,
      `POST /api/ai/tts gera fluxo de áudio MP3 (${generatedAudioBuffer.byteLength} bytes) com voz alloy`,
      { status: ttsRes.status, contentType }
    );

    // Teste Backend 3: Validação de arquivo de áudio obrigatório no Whisper
    const emptyTranscribeRes = await fetch(`${baseUrl}/api/ai/transcribe`, {
      method: 'POST',
      body: new FormData()
    });
    const emptyTranscribeData = await emptyTranscribeRes.json();
    assert(
      emptyTranscribeRes.status === 400 && emptyTranscribeData.error === 'AUDIO_FILE_REQUIRED',
      'POST /api/ai/transcribe rejeita envio sem arquivo com HTTP 400',
      emptyTranscribeData
    );

    // Teste Backend 4: Transcrição Whisper com o áudio MP3 sintetizado
    const formData = new FormData();
    const audioBlob = new Blob([generatedAudioBuffer], { type: 'audio/mpeg' });
    formData.append('audio', audioBlob, 'gravacao_sdr.mp3');
    formData.append('language', 'pt');

    const transcribeRes = await fetch(`${baseUrl}/api/ai/transcribe`, {
      method: 'POST',
      body: formData
    });
    const transcribeData = await transcribeRes.json();
    assert(
      transcribeRes.status === 200 && transcribeData.success === true && typeof transcribeData.text === 'string' && transcribeData.text.length > 5,
      `POST /api/ai/transcribe processa e transcreve fala com Whisper ("${transcribeData.text}")`,
      transcribeData
    );

    // Teste Backend 5: Bloqueio estrito de Test Drive Expirado (HTTP 403)
    const testTenantId = 'tenant-test-drive-audio-suite';
    db.prepare(`DELETE FROM tenant_api_configs WHERE tenant_id = ?`).run(testTenantId);
    db.prepare(`DELETE FROM tenants WHERE id = ?`).run(testTenantId);

    const expiredDate = new Date(Date.now() - 3600000).toISOString();
    db.prepare(`INSERT INTO tenants (id, name, status) VALUES (?, 'Tenant Expirado', 'ACTIVE')`).run(testTenantId);
    db.prepare(`INSERT INTO tenant_api_configs (id, tenant_id, use_master_key, test_drive_expires_at) VALUES (?, ?, 1, ?)`).run(`cfg-${testTenantId}`, testTenantId, expiredDate);

    const expiredTts = await fetch(`${baseUrl}/api/ai/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': testTenantId
      },
      body: JSON.stringify({ text: 'Teste com tenant expirado.' })
    });
    const expiredTtsJson = await expiredTts.json();
    assert(
      expiredTts.status === 403 && expiredTtsJson.error === 'TEST_DRIVE_EXPIRED',
      'POST /api/ai/tts bloqueia com 403 TEST_DRIVE_EXPIRED se test drive estiver vencido',
      expiredTtsJson
    );

    const expiredTranscribe = await fetch(`${baseUrl}/api/ai/transcribe`, {
      method: 'POST',
      headers: {
        'x-tenant-id': testTenantId
      },
      body: formData
    });
    const expiredTranscribeJson = await expiredTranscribe.json();
    assert(
      expiredTranscribe.status === 403 && expiredTranscribeJson.error === 'TEST_DRIVE_EXPIRED',
      'POST /api/ai/transcribe bloqueia com 403 TEST_DRIVE_EXPIRED se test drive estiver vencido',
      expiredTranscribeJson
    );

    // Limpeza
    db.prepare(`DELETE FROM tenant_api_configs WHERE tenant_id = ?`).run(testTenantId);
    db.prepare(`DELETE FROM tenants WHERE id = ?`).run(testTenantId);

  } finally {
    server.close();
  }

  console.log('-------------------------------------------------------------');
  console.log(`📊 RESULTADO FINAL: ${passed}/${total} TESTES APROVADOS (${Math.round(passed/total*100)}%)`);
  console.log('-------------------------------------------------------------');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Falha nos testes de áudio:', err);
  process.exit(1);
});
