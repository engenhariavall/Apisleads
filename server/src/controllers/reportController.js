/**
 * reportController.js
 * FASE 21 — Controlador do Dossiê Executivo em PDF
 */
import { generateExecutiveDossier } from '../services/pdfReportService.js';
import { baitReportService } from '../services/baitReportService.js';

export async function generateExecutiveDossierController(req, res) {
  try {
    const filters = req.body || {};

    const pdfBuffer = await generateExecutiveDossier(filters);

    const timestamp = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 19);
    const filename = `Dossie_Executivo_GTM_${timestamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('X-Versus-Report', 'executive-dossier');
    res.end(pdfBuffer);
  } catch (err) {
    console.error('[reportController] Erro ao gerar dossiê PDF:', err.message);
    res.status(500).json({ success: false, error: 'Falha ao gerar o dossiê executivo.', detail: err.message });
  }
}

/**
 * FASE 33 (ETAPA 1): Controlador da Rota Pública da Isca (Cavalo de Troia)
 * Renderiza a página pública do relatório com Market Gaps e pixel de rastreamento
 * Suporta formatos flexíveis de CNPJ e resposta em HTML ou JSON sem exigir autenticação.
 */
export async function getBaitReportController(req, res) {
  try {
    // 1. Extração resiliente do CNPJ (suportando /report/:cnpj, /report/:cnpj/* ou query ?cnpj=)
    let rawCnpj = req.params?.cnpj || req.params?.[0] || req.query?.cnpj || '';
    if (typeof rawCnpj === 'string' && rawCnpj.includes('/')) {
      // Se for formato CNPJ com barra (ex: 18.737.953/0001-00) ou rota com subcaminho
      const digitsOnly = rawCnpj.replace(/\D/g, '');
      if (digitsOnly.length >= 14) {
        rawCnpj = digitsOnly.slice(0, 14);
      }
    }

    const queryParams = req.query || {};
    const reportData = await baitReportService.getReportData(rawCnpj, queryParams);

    // FASE 40 (ETAPA 1): Tripwire de Telemetria do Cavalo de Troia
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || req.headers['referrer'] || '';
    
    try {
      await baitReportService.recordDossierView(rawCnpj, {
        ip: clientIp,
        userAgent,
        referrer,
        queryParams,
        tenantId: queryParams.t || queryParams.tenant || queryParams.tenant_id
      });
    } catch (tErr) {
      console.warn('[reportController] Falha no tripwire de telemetria:', tErr.message);
    }

    // 2. Se o cliente solicitar JSON explicitamente via header Accept ou query format=json
    if (req.headers.accept?.includes('application/json') || queryParams.format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ success: true, ...reportData });
    }

    // 3. Renderiza o HTML público executivo
    const html = baitReportService.renderReportHtml(reportData);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    console.error(`[reportController] Erro no relatório público para CNPJ (${req.params?.cnpj}):`, err.message);

    // Fallback à prova de falhas: NUNCA envia resposta vazia nem crasha o servidor
    if (req.headers.accept?.includes('application/json') || req.query?.format === 'json') {
      return res.status(200).json({
        success: false,
        error: 'Dados temporariamente indisponíveis para este CNPJ.',
        lead: {
          cnpj: String(req.params?.cnpj || '').replace(/\D/g, '') || '00000000000000',
          nome: 'Empresa sob Análise Confidencial',
          municipio: 'Brasil',
          uf: 'BR'
        },
        topGaps: []
      });
    }

    const fallbackHtml = baitReportService.renderReportHtml({
      lead: {
        cnpj: String(req.params?.cnpj || '').replace(/\D/g, '') || '00000000000000',
        nome: 'Empresa sob Análise Confidencial',
        razao_social: 'Empresa sob Análise Confidencial',
        municipio: 'Brasil',
        uf: 'BR',
        capital_social: 0,
        porte: 'DEMAIS'
      },
      decisor: 'Liderança Executiva',
      total_socios: 0,
      topGaps: [],
      metaPixelId: req.query?.pixel_id || null,
      gtmId: req.query?.gtm_id || null
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(fallbackHtml);
  }
}

/**
 * FASE 40 (ETAPA 1): Endpoint Interno para o CRM consultar telemetria do Lead
 * GET /api/leads/:cnpj/tracking
 */
export async function getLeadTrackingController(req, res) {
  try {
    const rawCnpj = req.params?.cnpj || '';
    const tenantId = req.headers['x-tenant-id'] || req.query?.tenant_id || req.user?.tenant_id || null;
    
    const trackingData = baitReportService.getLeadTrackingData(rawCnpj, tenantId);
    return res.status(200).json({
      success: true,
      cnpj: rawCnpj,
      ...trackingData
    });
  } catch (err) {
    console.error(`[reportController] Erro ao consultar tracking do lead (${req.params?.cnpj}):`, err.message);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao consultar telemetria do lead.'
    });
  }
}


