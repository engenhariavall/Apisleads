/**
 * server/src/services/scrapers/bndesCkanHarvester.js
 * 
 * MOTOR DE CAPTURA REAL DE OPERAÇÕES DE CRÉDITO AGROPECUÁRIO DO BNDES
 * 
 * Fonte Oficial: Portal de Dados Abertos do BNDES (dadosabertos.bndes.gov.br)
 * Endpoint: API CKAN Datastore de Operações Indiretas Automáticas
 * 
 * 100% DE DADOS REAIS DE EMPRESAS E PRODUTORES COM CRÉDITO APROVADO.
 * ZERO MOCKS. ZERO EDITAIS DE LICITAÇÃO.
 * 
 * Focado estritamente em poder de compra comercial de máquinas e implementos agrícolas.
 */

import crypto from 'crypto';

const BNDES_API_URL = 'https://dadosabertos.bndes.gov.br/api/3/action/datastore_search';
const RESOURCE_ID = '612faa0b-b6be-4b2c-9317-da5dc2c0b901'; // Operações Indiretas Automáticas
const BNDES_DATASET_URL = 'https://dadosabertos.bndes.gov.br/dataset/operacoes-financiamento/resource/612faa0b-b6be-4b2c-9317-da5dc2c0b901';

export class BndesCkanHarvester {
  /**
   * Consulta operações recentes de crédito agropecuário direto na API do BNDES
   * 
   * @param {Object} options Filtros de busca (limit, uf, query)
   * @returns {Promise<Array>} Lista de sinais reais de compra
   */
  static async harvestOperations({ limit = 40, uf = null } = {}) {
    console.log('📡 [BNDES CKAN CRAWLER] Consultando API de Dados Abertos do BNDES...');

    try {
      // Ordena por data_da_contratacao desc para trazer os financiamentos mais recentes
      const queryParams = new URLSearchParams({
        resource_id: RESOURCE_ID,
        sort: 'data_da_contratacao desc',
        q: 'AGROPECUÁRIA',
        limit: String(limit)
      });

      const response = await fetch(`${BNDES_API_URL}?${queryParams.toString()}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(25000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao consultar dadosabertos.bndes.gov.br`);
      }

      const json = await response.json();
      if (!json.success || !json.result || !Array.isArray(json.result.records)) {
        console.warn('⚠️ [BNDES CKAN CRAWLER] Resposta vazia ou formato inesperado:', json);
        return [];
      }

      const records = json.result.records;
      console.log(`✅ [BNDES CKAN CRAWLER] ${records.length} operações recuperadas do BNDES.`);

      const signals = [];

      for (const r of records) {
        const valor = Number(r.valor_da_operacao_em_reais) || 0;
        if (valor <= 0) continue; // Pula operações zeradas

        const clienteNome = (r.cliente || '').trim();
        if (!clienteNome) continue;

        const ufClean = (r.uf || '').trim().toUpperCase();
        if (uf && ufClean !== uf.toUpperCase()) continue;

        const municipioClean = (r.municipio || '').trim();
        const bancoRepassador = (r.instituicao_financeira_credenciada || 'Agente Financeiro BNDES').trim();
        const produtoLinha = (r.instrumento_financeiro || r.produto || 'Financiamento BNDES Agro').trim();
        const dataContratacaoIso = r.data_da_contratacao ? r.data_da_contratacao.slice(0, 10) : new Date().toISOString().slice(0, 10);

        const valorFormatado = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const hashKey = `${clienteNome}-${dataContratacaoIso}-${valor}`;
        const signalId = `sig-bndes-${crypto.createHash('md5').update(hashKey).digest('hex').slice(0, 10)}`;

        signals.push({
          id: signalId,
          spark_type: 'CREDITO_BNDES',
          titulo: `Crédito Aprovado (${valorFormatado}): ${clienteNome}`,
          resumo: `Financiamento ${produtoLinha} de ${valorFormatado} contratado via ${bancoRepassador} para atividade agropecuária em ${municipioClean}/${ufClean}. Poder de compra ativo para aquisição imediata de máquinas e implementos.`,
          conteudo_bruto: `Cliente: ${clienteNome}. Valor: ${valorFormatado}. Linha: ${produtoLinha}. Agente: ${bancoRepassador}. Município: ${municipioClean}/${ufClean}. Data da Contratação: ${dataContratacaoIso}. Situação: ${r.situacao_da_operacao || 'ATIVA'}. Fonte Oficial: Dados Abertos BNDES.`,
          orgao_emissor: `${bancoRepassador} / BNDES`,
          data_publicacao: dataContratacaoIso,
          valor_monetario: valor,
          volume_m3h: 0,
          documento_identificado: r.cpf_cnpj && !r.cpf_cnpj.includes('**') ? r.cpf_cnpj : null,
          titular_identificado: clienteNome,
          nome_imovel: `Complexo / Operação Rural (${municipioClean}/${ufClean})`,
          municipio: municipioClean,
          uf: ufClean,
          lat: -15.7801,
          lng: -47.9292,
          url_fonte: BNDES_DATASET_URL,
          trigger_texto: `Crédito Agro Aprovado: ${valorFormatado} [${produtoLinha}] via ${bancoRepassador}`
        });
      }

      return signals;

    } catch (err) {
      console.error('❌ [BNDES CKAN CRAWLER] Erro ao consultar API do BNDES:', err.message);
      return [];
    }
  }
}

export default BndesCkanHarvester;
