/**
 * server/src/services/aiAudioService.js
 * 
 * FASE COPILOTO — SERVIÇO DE ÁUDIO (WHISPER STT & OPENAI TTS)
 * Suporte a interações por voz no Copiloto VERSUS:
 * 1. Entrada de Voz: Transcrição de áudio via Whisper (Speech-to-Text)
 * 2. Saída de Voz: Síntese de fala via OpenAI TTS (Text-to-Speech)
 * 
 * Integração com ApiRouterService para resolução dinâmica multi-tenant
 * e bloqueio automático de Test Drive expirado (HTTP 403).
 */

import OpenAI, { toFile } from 'openai';
import { resolveTenantCredentials, ApiRouterError } from './apiRouterService.js';

export const aiAudioService = {
  /**
   * Obtém o client da OpenAI para o Tenant respeitando Test Drive e Multi-Tenant
   * @param {string} [tenantId] Identificador do Tenant
   * @param {Object} [options] Opções de data/hora para testes de Test Drive
   */
  async getOpenAIClient(tenantId = 'tenant-root-default', options = {}) {
    const creds = await resolveTenantCredentials(tenantId, 'openai', options);
    const apiKey = creds.apiKey;

    if (!apiKey || apiKey.trim() === '') {
      throw new ApiRouterError('OPENAI_KEY_MISSING', 'Chave da API da OpenAI não configurada para este Tenant/Host.', {
        status: 400,
        serviceType: 'openai',
        tenantId
      });
    }

    return new OpenAI({ apiKey: apiKey.trim() });
  },

  /**
   * Transcreve arquivo de áudio utilizando o modelo Whisper da OpenAI
   * 
   * @param {Object} params
   * @param {Buffer} params.buffer Buffer binário do arquivo de áudio
   * @param {string} [params.filename] Nome do arquivo original
   * @param {string} [params.mimetype] MIME type do áudio (ex: audio/webm, audio/mp4, audio/wav, audio/mpeg)
   * @param {string} [params.tenantId] Identificador do Tenant
   * @param {string} [params.language] Idioma ISO (padrão: 'pt')
   * @param {string} [params.prompt] Prompt de contexto terminológico para o Whisper
   * @returns {Promise<{ success: boolean, text: string, language: string, duration?: number }>}
   */
  async transcribeAudio({ buffer, filename = 'audio.webm', mimetype = 'audio/webm', tenantId, language = 'pt', prompt } = {}) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      const err = new Error('Arquivo de áudio não fornecido ou buffer vazio.');
      err.statusCode = 400;
      err.code = 'AUDIO_BUFFER_EMPTY';
      throw err;
    }

    // Garante extensão válida no nome do arquivo para compatibilidade com o Whisper
    let effectiveFilename = filename || 'audio.webm';
    if (!effectiveFilename.includes('.')) {
      if (mimetype?.includes('mp4') || mimetype?.includes('m4a')) effectiveFilename += '.mp4';
      else if (mimetype?.includes('wav')) effectiveFilename += '.wav';
      else if (mimetype?.includes('ogg')) effectiveFilename += '.ogg';
      else if (mimetype?.includes('mpeg') || mimetype?.includes('mp3')) effectiveFilename += '.mp3';
      else effectiveFilename += '.webm';
    }

    const client = await this.getOpenAIClient(tenantId);

    // Converte o buffer em objeto de arquivo aceito pelo SDK da OpenAI
    const audioFile = await toFile(buffer, effectiveFilename, {
      type: mimetype || 'audio/webm'
    });

    const transcriptionOptions = {
      file: audioFile,
      model: 'whisper-1',
      language: language || 'pt'
    };

    if (prompt && typeof prompt === 'string' && prompt.trim()) {
      transcriptionOptions.prompt = prompt.trim();
    }

    const transcription = await client.audio.transcriptions.create(transcriptionOptions);

    return {
      success: true,
      text: (transcription.text || '').trim(),
      language: language || 'pt',
      duration: transcription.duration || null
    };
  },

  /**
   * Converte texto em áudio sintetizado utilizando o modelo TTS da OpenAI
   * 
   * @param {Object} params
   * @param {string} params.text Texto a ser falado
   * @param {string} [params.voice] Voz ('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer')
   * @param {number} [params.speed] Velocidade de reprodução (0.25 a 4.0, padrão: 1.0)
   * @param {string} [params.tenantId] Identificador do Tenant
   * @returns {Promise<Buffer>} Buffer binário MP3
   */
  async generateSpeech({ text, voice = 'alloy', speed = 1.0, tenantId } = {}) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      const err = new Error('O texto para conversão em áudio é obrigatório.');
      err.statusCode = 400;
      err.code = 'TEXT_REQUIRED';
      throw err;
    }

    // Higienização de Markdown para fala natural
    const cleanText = text
      .replace(/!\[.*?\]\(.*?\)/g, '')               // Imagens
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')             // Links: mantém texto
      .replace(/```[\s\S]*?```/g, ' [código omitido] ') // Blocos de código
      .replace(/`([^`]+)`/g, '$1')                    // Inline code
      .replace(/[*_~#>]/g, '')                        // Formatação markdown
      .replace(/\|.*?\|/g, ' ')                       // Tabelas
      .replace(/-{3,}/g, ' ')                         // Divisórias
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      const err = new Error('O texto informado não contém conteúdo legível por voz.');
      err.statusCode = 400;
      err.code = 'AUDIBLE_TEXT_EMPTY';
      throw err;
    }

    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const selectedVoice = validVoices.includes(voice) ? voice : 'alloy';
    const selectedSpeed = Math.max(0.25, Math.min(4.0, Number(speed) || 1.0));

    const client = await this.getOpenAIClient(tenantId);

    let mp3Response;
    try {
      mp3Response = await client.audio.speech.create({
        model: 'tts-1-hd',
        voice: selectedVoice,
        input: cleanText.slice(0, 4096),
        speed: selectedSpeed
      });
    } catch (hdErr) {
      console.warn(`[AI AUDIO] tts-1-hd falhou (${hdErr.message}), recorrendo a tts-1...`);
      mp3Response = await client.audio.speech.create({
        model: 'tts-1',
        voice: selectedVoice,
        input: cleanText.slice(0, 4096),
        speed: selectedSpeed
      });
    }

    const arrayBuffer = await mp3Response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
};
