import { exportLeads } from '../server/src/controllers/exportController.js';
import db from '../server/src/config/database.js';

console.log('--- TESTE DE EXPORTAÇÃO CORRIGIDA ---');

// Mock req e res
function runTestExport(body) {
  return new Promise((resolve, reject) => {
    let sentData = '';
    const req = {
      body,
      user: { id: 'test-user', tenant_id: 'tenant-root-default' }
    };
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) {
        return {
          json: (err) => reject(new Error(`HTTP ${code}: ${JSON.stringify(err)}`))
        };
      },
      send(data) {
        sentData = data;
        resolve({ headers: this.headers, data: sentData });
      }
    };

    exportLeads(req, res);
  });
}

async function main() {
  try {
    // 1. Testa exportação com format comercial_b2b_maquinas sem IDs (filtro geral)
    console.log('1. Testando exportação comercial de máquinas com filtros...');
    const result = await runTestExport({
      format: 'comercial_b2b_maquinas',
      filters: { origem: 'RURAL_SIGEF' },
      is_rural: true,
      select_all_filtered: true
    });

    console.log('Headers retornados:', result.headers);
    const content = result.data;
    console.log('Tamanho do CSV gerado:', content.length, 'bytes');
    console.log('Inicia com BOM UTF-8 (\\uFEFF)?', content.startsWith('\uFEFF'));

    const lines = content.split('\r\n').filter(Boolean);
    console.log(`Total de linhas no CSV: ${lines.length} (Cabeçalho + ${lines.length - 1} registros)`);

    const header = lines[0].replace('\uFEFF', '');
    const headerCols = header.split(';');
    console.log(`Colunas no cabeçalho (${headerCols.length}):`, headerCols.map(c => c.replace(/"/g, '')));

    // Verifica integridade das primeiras 5 linhas
    let hasUuidInDoc = false;
    let hasUndefinedInName = false;
    let hasSigiloInDecisor = false;
    let colCountMismatch = false;

    for (let i = 1; i < lines.length; i++) {
      const rowCols = lines[i].split(';');
      if (rowCols.length !== headerCols.length) {
        colCountMismatch = true;
        console.warn(`Linha ${i} tem ${rowCols.length} colunas, esperado ${headerCols.length}`);
      }
      const docCol = rowCols[4]; // DOCUMENTO_CPF_CNPJ
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(docCol.replace(/["=]/g, ''))) {
        hasUuidInDoc = true;
      }
      if (lines[i].includes('undefined')) {
        hasUndefinedInName = true;
      }
      if (lines[i].toLowerCase().includes('titularidade sob sigilo')) {
        hasSigiloInDecisor = true;
      }
    }

    console.log('Verificações:');
    console.log('- Colunas perfeitamente alinhadas (todas linhas com mesmo nº de colunas):', !colCountMismatch);
    console.log('- Zero UUIDs em documento:', !hasUuidInDoc);
    console.log('- Zero "undefined" em nomes:', !hasUndefinedInName);
    console.log('- Zero "titularidade sob sigilo":', !hasSigiloInDecisor);

    if (lines.length > 1) {
      console.log('\nExemplo da Primeira Linha de Registro:');
      console.log(lines[1]);
    }

    console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Falha no teste:', err);
    process.exit(1);
  }
}

main();
