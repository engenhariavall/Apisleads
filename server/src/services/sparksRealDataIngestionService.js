/**
 * server/src/services/sparksRealDataIngestionService.js
 * 
 * FASE SPARKS REAL: MOTOR DE INGESTÃO DE DADOS ABERTOS OFICIAIS 24/7
 * E CRUZAMENTO DETERMINÍSTICO COM A BASE DE LEADS & FAZENDAS (CAR/SIGEF)
 * 
 * ARQUITETURA MULTI-FONTE 100% REAL:
 * 1. CREDITO_BNDES: API CKAN de Dados Abertos do BNDES (Operações Indiretas Automáticas)
 * 2. OUTORGA_ANA: Cadastro Nacional de Outorgas do SNIRH / Agência Nacional de Águas (ANA)
 * 3. EVENTO_AGRO: Feiras Oficiais de Máquinas e Tecnologia Agrícola com Links Diretos
 * 4. DOU / EXPANSAO / PASSIVO: Imprensa Nacional com Bloqueio Estrito de Licitações Municipais
 * 
 * ZERO MOCKS. ZERO DADOS SINTÉTICOS. ZERO EDITAIS DE LICITAÇÃO.
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { BndesCkanHarvester } from './scrapers/bndesCkanHarvester.js';
import { AnaRealHarvester } from './scrapers/anaRealHarvester.js';
import { FeirasAgroHarvester } from './scrapers/feirasAgroHarvester.js';
import { DouRealHarvester } from './scrapers/douRealHarvester.js';
import SparksAlertDispatcherService from './sparksAlertDispatcherService.js';

export class SparksRealDataIngestionService {
  /**
   * Executa a varredura real completa por tipo de sinal ou consolidada
   */
  static async ingestRealSignals(sparkType = null, tenantId = 'tenant-root-default') {
    let collectedSignals = [];

    // 1. Crédito BNDES (Operações Reais de Financiamento Agropecuário)
    if (!sparkType || sparkType === 'CREDITO_BNDES' || sparkType === 'ALL') {
      try {
        console.log('📡 [SPARKS REAL INGESTION] Executando harvester BNDES CKAN...');
        const bndesSignals = await BndesCkanHarvester.harvestOperations({ limit: 40 });
        if (Array.isArray(bndesSignals)) collectedSignals.push(...bndesSignals);
      } catch (err) {
        console.error('❌ [SPARKS REAL INGESTION] Erro em CREDITO_BNDES:', err.message);
      }
    }

    // 2. Outorgas ANA (Concessões de Irrigação SNIRH)
    if (!sparkType || sparkType === 'OUTORGA_ANA' || sparkType === 'ALL') {
      try {
        console.log('📡 [SPARKS REAL INGESTION] Executando harvester ANA SNIRH...');
        const anaSignals = await AnaRealHarvester.harvestWaterGrants({ limit: 30 });
        if (Array.isArray(anaSignals)) collectedSignals.push(...anaSignals);
      } catch (err) {
        console.error('❌ [SPARKS REAL INGESTION] Erro em OUTORGA_ANA:', err.message);
      }
    }

    // 3. Feiras & Eventos do Agronegócio (Grandes feiras de máquinas e crédito)
    if (!sparkType || sparkType === 'EVENTO_AGRO' || sparkType === 'ALL') {
      try {
        console.log('📡 [SPARKS REAL INGESTION] Executando harvester de Feiras Agro...');
        const feirasSignals = await FeirasAgroHarvester.harvestFairs();
        if (Array.isArray(feirasSignals)) collectedSignals.push(...feirasSignals);
      } catch (err) {
        console.error('❌ [SPARKS REAL INGESTION] Erro em EVENTO_AGRO:', err.message);
      }
    }

    // 4. Diário Oficial da União (Licenciamento de Silos, Expansão e Passivo IBAMA - Anti-Licitação)
    const douTypes = ['DOU', 'EXPANSAO_LEILAO', 'PASSIVO_IBAMA'];
    for (const dtype of douTypes) {
      if (!sparkType || sparkType === dtype || sparkType === 'ALL') {
        try {
          console.log(`📡 [SPARKS REAL INGESTION] Executando harvester DOU para ${dtype}...`);
          const douSignals = await DouRealHarvester.harvestDOU(dtype);
          if (Array.isArray(douSignals)) collectedSignals.push(...douSignals);
        } catch (err) {
          console.error(`❌ [SPARKS REAL INGESTION] Erro em ${dtype}:`, err.message);
        }
      }
    }

    let savedCount = 0;
    let matchedCount = 0;

    for (const rawSignal of collectedSignals) {
      const docClean = String(rawSignal.documento_identificado || '').replace(/\D/g, '');

      // Cruzamento Determinístico com a Base Local (MATCH ENGINE)
      let matchedLead = null;
      let matchedProp = null;

      if (docClean) {
        matchedLead = db.prepare(`
          SELECT id, razao_social, nome_fantasia, icp_score FROM leads 
          WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', '') = ?
             OR REPLACE(REPLACE(REPLACE(cnpj_raw, '.', ''), '-', ''), '/', '') = ?
             OR vertical_data LIKE ?
          LIMIT 1
        `).get(docClean, docClean, `%${docClean}%`);

        matchedProp = db.prepare(`
          SELECT id, nome_imovel, area_hectares, codigo_car FROM propriedades_rurais
          WHERE REPLACE(REPLACE(REPLACE(produtor_pf_cpf, '.', ''), '-', ''), '/', '') = ?
             OR REPLACE(REPLACE(REPLACE(cpf_cnpj_titular, '.', ''), '-', ''), '/', '') = ?
          LIMIT 1
        `).get(docClean, docClean);
      }

      // Se for cliente da base, enriquece com a flag HOT MATCH
      let finalTrigger = rawSignal.trigger_texto;
      let scoreGerado = 20;

      if (rawSignal.spark_type === 'CREDITO_BNDES') scoreGerado = 45;
      else if (rawSignal.spark_type === 'OUTORGA_ANA') scoreGerado = 40;
      else if (rawSignal.spark_type === 'EXPANSAO_LEILAO') scoreGerado = 30;
      else if (rawSignal.spark_type === 'EVENTO_AGRO') scoreGerado = 25;
      else if (rawSignal.spark_type === 'PASSIVO_IBAMA') scoreGerado = 25;

      if (matchedLead || matchedProp) {
        finalTrigger = `[HOT MATCH: CLIENTE DA BASE] ${rawSignal.trigger_texto}`;
        scoreGerado += 15;
        matchedCount++;

        // Impulsiona o lead na tabela analítica
        if (matchedLead) {
          try {
            db.prepare(`
              UPDATE leads 
              SET icp_score = MIN(100, icp_score + 25),
                  tag = CASE WHEN tag IS NULL OR tag = '' THEN 'SPARK_QUENTE' ELSE tag || ', SPARK_QUENTE' END,
                  updated_at = datetime('now')
              WHERE id = ?
            `).run(matchedLead.id);
          } catch (_) {}
        }
      }

      // Salva ou atualiza na tabela sparks_signals
      const monitorId = this.resolveMonitorId(rawSignal.spark_type);
      const existing = db.prepare(`
        SELECT id FROM sparks_signals 
        WHERE id = ? OR (titulo = ? AND data_publicacao = ? AND tenant_id = ?)
      `).get(rawSignal.id, rawSignal.titulo, rawSignal.data_publicacao, tenantId);

      if (!existing) {
        db.prepare(`
          INSERT INTO sparks_signals (
            id, monitor_id, spark_type, titulo, resumo, conteudo_bruto,
            orgao_emissor, data_publicacao, valor_monetario, volume_m3h,
            documento_identificado, titular_identificado, nome_imovel,
            municipio, uf, lat, lng, status_processamento, score_gerado,
            trigger_texto, url_fonte, tenant_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENRIQUECIDO', ?, ?, ?, ?)
        `).run(
          rawSignal.id, monitorId, rawSignal.spark_type, rawSignal.titulo, rawSignal.resumo,
          rawSignal.conteudo_bruto, rawSignal.orgao_emissor, rawSignal.data_publicacao,
          rawSignal.valor_monetario, rawSignal.volume_m3h, rawSignal.documento_identificado,
          rawSignal.titular_identificado, rawSignal.nome_imovel, rawSignal.municipio,
          rawSignal.uf, rawSignal.lat, rawSignal.lng, scoreGerado, finalTrigger,
          rawSignal.url_fonte, tenantId
        );
        savedCount++;
      } else {
        // Atualiza url_fonte e data_publicacao se ainda estavam vazios
        try {
          db.prepare(`
            UPDATE sparks_signals 
            SET url_fonte = COALESCE(url_fonte, ?),
                data_publicacao = COALESCE(data_publicacao, ?),
                valor_monetario = CASE WHEN valor_monetario = 0 AND ? > 0 THEN ? ELSE valor_monetario END,
                volume_m3h = CASE WHEN volume_m3h = 0 AND ? > 0 THEN ? ELSE volume_m3h END
            WHERE id = ?
          `).run(rawSignal.url_fonte, rawSignal.data_publicacao, rawSignal.valor_monetario, rawSignal.valor_monetario, rawSignal.volume_m3h, rawSignal.volume_m3h, existing.id);
        } catch (_) {}
      }
    }

    console.log(`✅ [SPARKS REAL INGESTION] Concluído: ${collectedSignals.length} sinais capturados nas fontes oficiais, ${savedCount} novos inseridos, ${matchedCount} hot matches.`);

    return {
      success: true,
      total_collected: collectedSignals.length,
      saved_count: savedCount,
      hot_matches: matchedCount
    };
  }

  /**
   * Mapeia tipo de sinal para o monitor correspondente
   */
  static resolveMonitorId(sparkType) {
    switch (sparkType) {
      case 'CREDITO_BNDES': return 'spark-credito-rural';
      case 'OUTORGA_ANA': return 'spark-outorgas-agua';
      case 'PASSIVO_IBAMA': return 'spark-passivo-ambiental';
      case 'EVENTO_AGRO': return 'spark-eventos-agro';
      case 'EXPANSAO_LEILAO': return 'spark-expansao-fundiaria';
      case 'DOU': return 'spark-dou-licencas';
      default: return 'spark-credito-rural';
    }
  }
}

export default SparksRealDataIngestionService;
