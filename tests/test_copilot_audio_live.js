/**
 * tests/test_copilot_audio_live.js
 * 
 * Validação de Integração dos Endpoints de Áudio do Copiloto:
 * 1. POST /api/ai/tts (Síntese de voz com OpenAI TTS-1)
 * 2. POST /api/ai/transcribe (Transcrição de fala com Whisper-1)
 * 3. Validação de bloqueio 403 quando Test Drive expira
 */

import http from 'http';
import app from '../server/src/app.js';
import db from '../server/src/config/database.js';

async function run() {
  console.log('=============================================================');
  console.log('🧪 TESTES: SUPORTE A ÁUDIO NO COPILOTO (WHISPER & TTS)');
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

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // -------------------------------------------------------------
    // Teste 1: Validação de corpo vazio no TTS (HTTP 400)
    // -------------------------------------------------------------
    const ttsEmptyRes = await fetch(`${baseUrl}/api/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const ttsEmptyData = await ttsEmptyRes.json();
    assert(
      ttsEmptyRes.status === 400 && ttsEmptyData.error === 'TEXT_REQUIRED',
      'POST /api/ai/tts retorna 400 se texto não for fornecido',
      ttsEmptyData
    );

    // -------------------------------------------------------------
    // Teste 2: Geração de Áudio MP3 via POST /api/ai/tts
    // -------------------------------------------------------------
    const ttsRes = await fetch(`${baseUrl}/api/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'A Plataforma VERSUS possui filtros de satélite e scoring de intenção agro.',
        voice: 'alloy'
      })
    });
    const ttsContentType = ttsRes.headers.get('content-type');
    const audioBuffer = await ttsRes.arrayBuffer();
    assert(
      ttsRes.status === 200 && ttsContentType.includes('audio/mpeg') && audioBuffer.byteLength > 1000,
      `POST /api/ai/tts sintetiza áudio MP3 com sucesso (${audioBuffer.byteLength} bytes)`,
      { status: ttsRes.status, contentType: ttsContentType }
    );

    // -------------------------------------------------------------
    // Teste 3: Validação de ausência de arquivo em /api/ai/transcribe (HTTP 400)
    // -------------------------------------------------------------
    const transcribeEmptyRes = await fetch(`${baseUrl}/api/ai/transcribe`, {
      method: 'POST',
      body: new FormData()
    });
    const transcribeEmptyData = await transcribeEmptyRes.json();
    assert(
      transcribeEmptyRes.status === 400 && transcribeEmptyData.error === 'AUDIO_FILE_REQUIRED',
      'POST /api/ai/transcribe retorna 400 se nenhum arquivo de áudio for enviado',
      transcribeEmptyData
    );

    // -------------------------------------------------------------
    // Teste 4: Transcrição via POST /api/ai/transcribe (Whisper)
    // -------------------------------------------------------------
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('audio', audioBlob, 'fala_teste.mp3');
    formData.append('language', 'pt');

    const transcribeRes = await fetch(`${baseUrl}/api/ai/transcribe`, {
      method: 'POST',
      body: formData
    });
    const transcribeData = await transcribeRes.json();
    assert(
      transcribeRes.status === 200 && transcribeData.success === true && typeof transcribeData.text === 'string' && transcribeData.text.length > 5,
      `POST /api/ai/transcribe transcreve o áudio com Whisper ("${transcribeData.text}")`,
      transcribeData
    );

    // -------------------------------------------------------------
    // Teste 5: Bloqueio 403 de Test Drive Expirado no TTS e Transcribe
    // -------------------------------------------------------------
    // Cria um tenant com test drive expirado para validar segurança multi-tenant
    const expiredTenantId = 'tenant-test-drive-expired-audio';
    db.prepare(`DELETE FROM tenant_api_configs WHERE tenant_id = ?`).run(expiredTenantId);
    db.prepare(`DELETE FROM tenants WHERE id = ?`).run(expiredTenantId);

    const pastDate = new Date(Date.now() - 3600000).toISOString();
    db.prepare(`
      INSERT INTO tenants (id, name, status)
      VALUES (?, 'Tenant Expirado', 'ACTIVE')
    `).run(expiredTenantId);

    db.prepare(`
      INSERT INTO tenant_api_configs (id, tenant_id, use_master_key, test_drive_expires_at)
      VALUES (?, ?, 1, ?)
    `).run(`cfg-${expiredTenantId}`, expiredTenantId, pastDate);

    const expiredTtsRes = await fetch(`${baseUrl}/api/ai/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': expiredTenantId
      },
      body: JSON.stringify({ text: 'Tentativa em tenant com test drive vencido.' })
    });
    const expiredTtsData = await expiredTtsRes.json();
    assert(
      expiredTtsRes.status === 403 && expiredTtsData.error === 'TEST_DRIVE_EXPIRED',
      'POST /api/ai/tts bloqueia com HTTP 403 se o Test Drive do Tenant estiver expirado',
      expiredTtsData
    );

    const expiredTranscribeRes = await fetch(`${baseUrl}/api/ai/transcribe`, {
      method: 'POST',
      headers: {
        'x-tenant-id': expiredTenantId
      },
      body: formData
    });
    const expiredTranscribeData = await expiredTranscribeRes.json();
    assert(
      expiredTranscribeRes.status === 403 && expiredTranscribeData.error === 'TEST_DRIVE_EXPIRED',
      'POST /api/ai/transcribe bloqueia com HTTP 403 se o Test Drive do Tenant estiver expirado',
      expiredTranscribeData
    );

    // Limpa tenant temporário
    db.prepare(`DELETE FROM tenant_api_configs WHERE tenant_id = ?`).run(expiredTenantId);
    db.prepare(`DELETE FROM tenants WHERE id = ?`).run(expiredTenantId);

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

run().catch(err => {
  console.error('Falha fatal nos testes:', err);
  process.exit(1);
});
