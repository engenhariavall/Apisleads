import { qsaService } from '../server/src/services/qsaService.js';
import db from '../server/src/config/database.js';

async function testEtapa1() {
  console.log('--- [TESTE FASE 27 - ETAPA 1: MODELAGEM QSA & BRASILAPI] ---');

  // CNPJ para teste: Petrobras ou Natura ou Ambev ou Banco do Brasil
  // Usaremos Petrobras: 33.000.167/0001-01 (33000167000101)
  const testCnpj = '33000167000101';
  console.log(`1. Testando enriquecimento para CNPJ ${testCnpj}...`);

  try {
    const result = await qsaService.enrichLeadQsa(testCnpj);
    console.log(`✅ Resultado do Enriquecimento:`, {
      success: result.success,
      cnpj: result.cnpj,
      razao_social: result.razao_social,
      total_socios: result.total_socios,
      raw_source: result.raw_source
    });

    if (result.socios && result.socios.length > 0) {
      console.log(`✅ Amostra de sócio/administrador persistido:`, {
        nome: result.socios[0].nome,
        qualificacao: result.socios[0].qualificacao,
        faixa_etaria: result.socios[0].faixa_etaria,
        pais: result.socios[0].pais,
        data_entrada: result.socios[0].data_entrada
      });
    }

    // 2. Consulta direta no banco para conferir persistência na tabela leads_socios
    const rowCount = db.prepare('SELECT count(*) as count FROM leads_socios WHERE lead_cnpj = ?').get(testCnpj);
    console.log(`✅ Verificação no SQLite WAL (leads_socios count): ${rowCount.count}`);

    if (rowCount.count > 0) {
      console.log('🎉 ETAPA 1 VALIDADA COM SUCESSO: Tabela leads_socios e integração BrasilAPI funcionais!');
      process.exit(0);
    } else {
      console.error('❌ Falha: Registros não foram salvos na tabela leads_socios.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Erro durante o teste:', err.message);
    process.exit(1);
  }
}

testEtapa1();
