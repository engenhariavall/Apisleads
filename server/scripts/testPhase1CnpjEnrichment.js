/**
 * server/scripts/testPhase1CnpjEnrichment.js
 * 
 * SCRIPT DE TESTE E VALIDACAO DA FASE 1:
 * Resolucao deterministica de CNPJ, Quadro de Socios (QSA) e Contatos para sinais do BNDES.
 */

import db from '../src/config/database.js';
import { CnpjResolutionService } from '../src/services/cnpjResolutionService.js';
import { SparksEngineService } from '../src/services/sparksEngineService.js';

async function main() {
  console.log('--- TESTE FASE 1: RESOLUCAO DETERMINISTICA DE CNPJ E QSA ---');

  // 1. Busca os sinais de CREDITO_BNDES no banco
  const signals = db.prepare(`
    SELECT id, titulo, titular_identificado, municipio, uf, valor_monetario, documento_identificado
    FROM sparks_signals
    WHERE spark_type = 'CREDITO_BNDES'
    ORDER BY valor_monetario ASC
    LIMIT 5
  `).all();

  console.log(`Sinais selecionados para teste de resolucao: ${signals.length}`);

  const results = [];

  for (const s of signals) {
    console.log(`\nProcessando sinal: [${s.id}] ${s.titular_identificado} (${s.municipio}/${s.uf})`);
    try {
      const res = await CnpjResolutionService.resolveAndEnrichSignal(s.id, 'tenant-root-default');
      if (res.success) {
        console.log(`Sucesso! CNPJ: ${res.cnpj}`);
        console.log(`Socios identificados: ${res.socios.length}`);
        res.socios.forEach(soc => console.log(`  - ${soc.nome} (${soc.cargo})`));
        console.log(`Contato: ${res.contato_principal || 'N/A'}`);
        console.log(`Endereco: ${res.endereco ? res.endereco.formatado : 'N/A'}`);
        console.log(`Coordenadas: Lat ${res.coordenadas?.lat}, Lng ${res.coordenadas?.lng} (Precisao: ${res.coordenadas?.precisao})`);
        results.push({
          id: s.id,
          cliente: s.titular_identificado,
          cnpj: res.cnpj,
          socios_count: res.socios.length,
          socio_decisor: res.socio_decisor ? res.socio_decisor.nome : 'N/A',
          telefone: res.contato_principal || 'N/A',
          cep: res.endereco ? res.endereco.cep : 'N/A',
          lat: res.coordenadas?.lat,
          lng: res.coordenadas?.lng,
          precisao: res.coordenadas?.precisao
        });
      } else {
        console.log(`Nao resolvido: ${res.reason}`);
      }
    } catch (err) {
      console.error(`Erro ao processar sinal ${s.id}:`, err.message);
    }
  }

  console.log('\n--- TABELA CONSOLIDADA DE RESULTADOS (FASES 1 & 2) ---');
  console.table(results);

  // 2. Testa a geracao do Dossie via SparksEngineService
  if (results.length > 0) {
    const testId = results[0].id;
    console.log(`\nValidando Dossie via SparksEngineService para o sinal [${testId}]...`);
    const dossier = await SparksEngineService.getSignalDossier(testId, 'tenant-root-default');
    console.log('Documento identificado no sinal:', dossier.signal.documento_identificado);
    console.log('Coordenadas no Sinal:', dossier.signal.lat, dossier.signal.lng);
    console.log('Lead vinculado:', dossier.lead ? `${dossier.lead.razao_social} (CNPJ: ${dossier.lead.cnpj})` : 'Nenhum');
    console.log('Coordenadas no Lead:', dossier.lead?.latitude, dossier.lead?.longitude);
    console.log('Telefone do Lead:', dossier.lead ? dossier.lead.telefone : 'Nenhum');
    console.log('Total de Socios no Dossie:', dossier.socios ? dossier.socios.length : 0);
  }
}

main().catch(err => {
  console.error('Falha geral no teste da Fase 1:', err);
  process.exit(1);
});
