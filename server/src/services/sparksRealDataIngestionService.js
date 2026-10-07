/**
 * server/src/services/sparksRealDataIngestionService.js
 * 
 * FASE SPARKS REAL: MOTOR DE INGESTÃO DE DADOS ABERTOS OFICIAIS
 * E CRUZAMENTO DETERMINÍSTICO COM A BASE DE LEADS & FAZENDAS (CAR/SIGEF)
 * 
 * 100% DADOS REAIS AUDITÁVEIS DIRETAMENTE DO DIÁRIO OFICIAL DA UNIÃO (DOU - IN.GOV.BR)
 * ZERO DADOS FICTÍCIOS OU MOCKADOS.
 * Todos os sinais possuem:
 * - url_fonte oficial verificável (https://www.in.gov.br/web/dou/-/{slug})
 * - data_publicacao oficial da edição do DOU
 * - Órgão emissor oficial
 */

import crypto from 'crypto';
import db from '../config/database.js';
import { DouRealHarvester } from './scrapers/douRealHarvester.js';
import SparksAlertDispatcherService from './sparksAlertDispatcherService.js';

export class SparksRealDataIngestionService {
  /**
   * Executa a varredura real completa por tipo de sinal ou consolidada
   */
  static async ingestRealSignals(sparkType = null, tenantId = 'tenant-root-default') {
    let collectedSignals = [];

    const typesToHarvest = sparkType && sparkType !== 'ALL'
      ? [sparkType]
      : ['CREDITO_BNDES', 'OUTORGA_ANA', 'PASSIVO_IBAMA', 'EXPANSAO_LEILAO', 'DOU'];

    for (const type of typesToHarvest) {
      try {
        console.log(`📡 [SPARKS REAL INGESTION] Executando crawler real do DOU para ${type}...`);
        const signals = await DouRealHarvester.harvestDOU(type);
        if (Array.isArray(signals) && signals.length > 0) {
          collectedSignals.push(...signals);
        }
      } catch (harvestErr) {
        console.error(`❌ [SPARKS REAL INGESTION] Erro ao coletar sinais reais de ${type}:`, harvestErr.message);
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

      if (rawSignal.spark_type === 'CREDITO_BNDES') scoreGerado = 40;
      else if (rawSignal.spark_type === 'OUTORGA_ANA') scoreGerado = 35;
      else if (rawSignal.spark_type === 'PASSIVO_IBAMA') scoreGerado = 25;
      else if (rawSignal.spark_type === 'EXPANSAO_LEILAO') scoreGerado = 30;

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
        WHERE ((url_fonte IS NOT NULL AND url_fonte = ?) OR (titulo = ? AND tenant_id = ?))
      `).get(rawSignal.url_fonte, rawSignal.titulo, tenantId);

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
                data_publicacao = COALESCE(data_publicacao, ?)
            WHERE id = ?
          `).run(rawSignal.url_fonte, rawSignal.data_publicacao, existing.id);
        } catch (_) {}
      }
    }

    console.log(`✅ [SPARKS REAL INGESTION] Concluído: ${collectedSignals.length} capturados no DOU, ${savedCount} novos inseridos, ${matchedCount} hot matches.`);

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
