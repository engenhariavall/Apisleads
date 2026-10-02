import { contactEnrichmentService } from '../server/src/services/contactEnrichmentService.js';
import { qsaService } from '../server/src/services/qsaService.js';
import db from '../server/src/config/database.js';

async function testEtapa2() {
  console.log('--- [TESTE FASE 27 - ETAPA 2: MOTOR DE ENRIQUECIMENTO EM CASCATA & OSINT] ---');

  // CNPJ para teste: Petrobras (33.000.167/0001-01)
  const testCnpj = '33000167000101';
  console.log(`1. Testando enriquecimento em cascata de contatos para o CNPJ ${testCnpj}...`);

  try {
    const result = await contactEnrichmentService.enrichContactsCascade(testCnpj);
    console.log(`✅ Resultado do Enriquecimento em Cascata:`, {
      success: result.success,
      cnpj: result.cnpj,
      corporate_domain: result.corporate_domain,
      total_socios: result.total_socios,
      phone_channel: result.phone_channel
    });

    if (!result.socios || result.socios.length === 0) {
      throw new Error('Nenhum sócio retornado com enriquecimento de contato!');
    }

    const sample = result.socios[0];
    console.log(`✅ Amostra de sócio com contatos inferidos (OSINT):`, {
      nome: sample.nome,
      qualificacao: sample.qualificacao,
      email_presumido: sample.email_presumido,
      telefone_presumido: sample.telefone_presumido,
      linkedin_presumido: sample.linkedin_presumido,
      emails_alternativos: sample.emails_alternativos
    });

    // 2. Validação direta de persistência no SQLite
    const persisted = db.prepare(`
      SELECT nome, email_presumido, telefone_presumido, linkedin_presumido
      FROM leads_socios
      WHERE lead_cnpj = ? AND email_presumido IS NOT NULL
    `).all(testCnpj);

    console.log(`✅ Total de sócios com e-mail corporativo presumido no SQLite: ${persisted.length}`);

    if (persisted.length === result.total_socios && persisted.length > 0) {
      console.log('🎉 ETAPA 2 VALIDADA COM SUCESSO: Contatos corporativos gerados e persistidos em leads_socios!');
      process.exit(0);
    } else {
      console.error('❌ Falha na validação de persistência dos contatos presumidos.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Erro no teste da Etapa 2:', err.message);
    process.exit(1);
  }
}

testEtapa2();
