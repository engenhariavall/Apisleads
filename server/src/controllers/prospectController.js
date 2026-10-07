/**
 * server/src/controllers/prospectController.js
 * 
 * FASE 75: CONTROLLER DE PROSPECÇÃO DE REVENDAS AGRO SOB DEMANDA
 */

import { OnDemandSupplierProspectorService } from '../services/onDemandSupplierProspectorService.js';

export async function prospectSuppliersByCityController(req, res) {
  try {
    const { uf, municipio, force_refresh } = req.body || {};

    if (!uf || !municipio) {
      return res.status(400).json({
        success: false,
        error: 'Os parâmetros "uf" e "municipio" são obrigatórios.'
      });
    }

    const result = await OnDemandSupplierProspectorService.prospectSuppliersForCity(
      uf,
      municipio,
      { force_refresh: Boolean(force_refresh) }
    );

    return res.json(result);
  } catch (error) {
    console.error('Erro na prospecção sob demanda de fornecedores:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Falha ao processar prospecção territorial sob demanda.'
    });
  }
}
