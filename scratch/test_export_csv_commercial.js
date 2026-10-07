import { exportLeads } from '../server/src/controllers/exportController.js';

async function testExport() {
  console.log('--- TESTANDO EXPORTAÇÃO COMERCIAL B2B MÁQUINAS ---');
  let outputData = '';
  let statusCode = 200;
  let headers = {};

  const req = {
    body: {
      format: 'comercial_b2b_maquinas',
      filters: {
        estados: ['PI'],
        uf: 'PI',
        cidades: ['AVELINO LOPES'],
        origem: 'RURAL_CAR'
      },
      select_all_filtered: true,
      is_rural: true
    },
    user: { tenant_id: 'default' }
  };

  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    status: (code) => { statusCode = code; return res; },
    send: (data) => { outputData = data; return res; }
  };

  await exportLeads(req, res);

  console.log('Status HTTP:', statusCode);
  console.log('Headers:', headers);
  console.log('Tamanho da saída (bytes):', outputData.length);

  const lines = outputData.split('\n').filter(Boolean);
  console.log('Total de linhas geradas no CSV:', lines.length);
  console.log('Primeira linha (Cabeçalho):', lines[0]);
  if (lines.length > 1) {
    console.log('Segunda linha (Amostra Registro 1):', lines[1]);
  }
  if (lines.length > 2) {
    console.log('Terceira linha (Amostra Registro 2):', lines[2]);
  }

  // Verificações de integridade
  const hasBom = outputData.startsWith('\uFEFF');
  console.log('Possui UTF-8 BOM (\\uFEFF):', hasBom);

  const uuidMatches = outputData.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
  console.log('Total de UUIDs soltos encontrados no CSV:', uuidMatches.length);

  const undefinedMatches = outputData.match(/undefined\s+/gi) || [];
  console.log('Total de ocorrências de "undefined " no CSV:', undefinedMatches.length);

  const scientificNotationMatches = outputData.match(/\b\d+,\d+E\+\d+\b/gi) || [];
  console.log('Total de notações científicas (ex: 7,69E+10):', scientificNotationMatches.length);

  if (lines.length > 50) {
    console.log(`✅ SUCESSO: Exportação superou o limite de 50 contatos! Total gerado: ${lines.length - 1} leads rurais.`);
  } else {
    console.log(`⚠️ ALERTA: Foram gerados apenas ${lines.length - 1} contatos.`);
  }
}

testExport().catch(err => {
  console.error('Erro no teste de exportação:', err);
});
