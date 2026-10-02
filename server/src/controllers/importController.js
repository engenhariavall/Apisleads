import { importRealData } from '../scripts/import_real_data.js';
import { syncAllLeads } from '../../../server/scripts/syncAllLeads.js';
import seedAgroLeads from '../config/seedAgroLeads.js';

/**
 * Controller para acionamento programático da ingestão de dados reais
 */
export async function importRealDataController(req, res) {
  try {
    const { clean = false, file = null } = req.body || {};
    
    // Executa a ingestão combinando o catálogo curado e arquivos existentes
    const result = await importRealData({
      clean,
      sampleReal: true,
      file
    });

    // Assegura catálogo de entidades rurais e agropecuárias com QSA e WhatsApp
    await seedAgroLeads();

    res.json({
      success: true,
      message: `${result.imported} empresas reais sincronizadas com sucesso com Matriz de ICP!`,
      data: result
    });
  } catch (error) {
    console.error('Erro no endpoint de importação:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Falha ao importar dados reais.'
    });
  }
}

/**
 * Controller para re-sincronização em lote, limpeza de mocks e geocodificação real dos leads
 * POST /api/leads/re-sync-all
 */
export async function reSyncAllLeadsController(req, res) {
  try {
    const { all = false } = req.body || {};

    const summary = await syncAllLeads({ all });

    res.json({
      success: true,
      message: `Re-sincronização concluída! ${summary.total_processed} leads auditados, ${summary.geocoded_street_level} coordenadas de ruas reais atualizadas e ${summary.mocks_purged} resíduos de mock purgados.`,
      data: summary
    });
  } catch (error) {
    console.error('Erro ao re-sincronizar base de leads:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Falha ao processar re-sincronização em lote.'
    });
  }
}

