/**
 * Controller de Verticais de Mercado e Fusão de Dados
 */

import db from '../config/database.js';
import { VERTICALS_CATALOG, DataFusionEngine } from '../modules/verticals/index.js';
import { getTenantFromRequest } from '../middleware/authMiddleware.js';

/**
 * Retorna o catálogo de verticais de mercado com filtros customizados e metadados
 * GET /api/verticals
 */
export function getVerticalsCatalog(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);

    // Estatísticas rápidas de contagem por vertical no banco isoladas por tenant
    const counts = db.prepare(`
      SELECT vertical_type, COUNT(*) as total 
      FROM leads 
      WHERE tenant_id = ?
      GROUP BY vertical_type
    `).all(tenantId);

    const countMap = {};
    let totalAll = 0;
    counts.forEach(c => {
      countMap[c.vertical_type] = c.total;
      totalAll += c.total;
    });

    const catalog = VERTICALS_CATALOG.map(v => {
      let count = 0;
      if (v.id === 'TODOS') count = totalAll;
      else count = countMap[v.id] || 0;

      return {
        ...v,
        total_leads: count
      };
    });

    res.json({
      success: true,
      total_verticals: catalog.length,
      verticals: catalog
    });
  } catch (error) {
    console.error('Erro ao obter catálogo de verticais:', error);
    res.status(500).json({ error: 'Falha ao obter catálogo de verticais de mercado' });
  }
}

/**
 * Retorna métricas e estatísticas consolidadas de uma vertical
 * GET /api/verticals/:vertical/metrics
 */
export function getVerticalMetrics(req, res) {
  try {
    const tenantId = getTenantFromRequest(req);
    const { vertical } = req.params;
    const vId = (vertical || '').toUpperCase();

    const whereClause = vId !== 'TODOS' 
      ? 'WHERE tenant_id = ? AND vertical_type = ?' 
      : 'WHERE tenant_id = ?';
    const params = vId !== 'TODOS' ? [tenantId, vId] : [tenantId];

    const leads = db.prepare(`
      SELECT id, vertical_type, vertical_data, capital_social, target_type, porte 
      FROM leads 
      ${whereClause}
    `).all(...params);

    let totalHectares = 0;
    let totalProcessos = 0;
    let totalLeitos = 0;
    let totalObras = 0;
    let totalCapital = 0;
    let totalBuyers = 0;

    leads.forEach(l => {
      totalCapital += parseFloat(l.capital_social || 0);
      if (l.target_type === 'BUYER') totalBuyers++;

      if (l.vertical_data) {
        try {
          const vd = JSON.parse(l.vertical_data);
          if (vd.hectares_total) totalHectares += vd.hectares_total;
          if (vd.processos_ativos) totalProcessos += vd.processos_ativos;
          if (vd.leitos_totais) totalLeitos += vd.leitos_totais;
          if (vd.obras_ativas) totalObras += vd.obras_ativas;
        } catch (e) {}
      }
    });

    res.json({
      success: true,
      vertical: vId,
      total_leads: leads.length,
      total_buyers: totalBuyers,
      total_capital_social: totalCapital,
      kpis: {
        total_hectares: totalHectares,
        hectares_formatados: `${totalHectares.toLocaleString('pt-BR')} ha`,
        total_processos: totalProcessos,
        processos_formatados: `${totalProcessos.toLocaleString('pt-BR')} ações`,
        total_leitos: totalLeitos,
        leitos_formatados: `${totalLeitos.toLocaleString('pt-BR')} leitos`,
        total_obras: totalObras,
        obras_formatadas: `${totalObras.toLocaleString('pt-BR')} canteiros de obras`
      }
    });
  } catch (error) {
    console.error('Erro ao obter métricas da vertical:', error);
    res.status(500).json({ error: 'Falha ao consolidar métricas da vertical' });
  }
}

/**
 * Aciona a fusão de dados em toda a base sob demanda
 * POST /api/verticals/fuse-data
 */
export function fuseVerticalData(req, res) {
  try {
    const result = DataFusionEngine.fuseAllLeads(db);
    res.json({
      success: true,
      message: 'Fusão multissetorial concluída com sucesso no banco de dados SQLite.',
      data: result
    });
  } catch (error) {
    console.error('Erro na execução de fusão multissetorial:', error);
    res.status(500).json({ error: 'Falha ao executar fusão de dados' });
  }
}
