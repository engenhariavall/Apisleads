/**
 * TESTE DE HOMOLOGAÇÃO AUTOMATIZADA - FASE 39 (ETAPA 2)
 * Conexão da Rota QSA ao Motor OSINT Real
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Iniciando teste de homologação da Fase 39 - Etapa 2 (Conexão da Rota QSA)...');

  // 1. Testa busca de um CNPJ com sócios já cadastrados ou reais
  // CNPJ da Ambev (02.808.708/0001-07 ou limpo 02808708000107) ou Cocamar (79.114.450/0001-65)
  const testCnpj = '02808708000107';

  console.log(`\n[1/3] Disparando enriquecimento de contatos com motor OSINT via POST /api/leads/${testCnpj}/enrich-contacts...`);
  const resEnrich = await fetch(`${BASE_URL}/api/leads/${testCnpj}/enrich-contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  const dataEnrich = await resEnrich.json();
  if (!resEnrich.ok) {
    throw new Error(`Falha no enriquecimento QSA: ${JSON.stringify(dataEnrich)}`);
  }

  console.log(`✅ Resposta recebida com sucesso! Total de sócios processados: ${dataEnrich.total_socios}`);
  console.log(`   Domínio Corporativo Identificado: ${dataEnrich.corporate_domain}`);

  // 2. Validação da estrutura dos sócios retornados
  console.log('\n[2/3] Validando estrutura de retorno dos sócios e persistência...');
  if (!Array.isArray(dataEnrich.socios) || dataEnrich.socios.length === 0) {
    throw new Error('Nenhum sócio retornado na lista.');
  }

  const sampleSocio = dataEnrich.socios[0];
  console.log('   Amostra do Primeiro Sócio:', {
    nome: sampleSocio.nome,
    qualificacao: sampleSocio.qualificacao,
    linkedin_url_real: sampleSocio.linkedin_url_real,
    linkedin_presumido: sampleSocio.linkedin_presumido,
    email_validado: sampleSocio.email_validado,
    email_validation_status: sampleSocio.email_validation_status,
    email_presumido: sampleSocio.email_presumido
  });

  if (!('linkedin_url_real' in sampleSocio)) {
    throw new Error('Campo "linkedin_url_real" ausente no retorno dos sócios!');
  }
  if (!('email_validado' in sampleSocio)) {
    throw new Error('Campo "email_validado" ausente no retorno dos sócios!');
  }
  if (!('email_validation_status' in sampleSocio)) {
    throw new Error('Campo "email_validation_status" ausente no retorno dos sócios!');
  }

  // 3. Validação do endpoint GET /api/leads/:cnpj/qsa
  console.log(`\n[3/3] Validando recuperação persistida via GET /api/leads/${testCnpj}/qsa...`);
  const resGet = await fetch(`${BASE_URL}/api/leads/${testCnpj}/qsa`);
  const dataGet = await resGet.json();
  if (!resGet.ok || !Array.isArray(dataGet.socios)) {
    throw new Error(`Falha na rota GET /qsa: ${JSON.stringify(dataGet)}`);
  }

  const persistedSocio = dataGet.socios[0];
  console.log('✅ Dados recuperados com sucesso do banco via GET /qsa:', {
    total: dataGet.total,
    primeiro_socio: persistedSocio.nome,
    linkedin_url_real: persistedSocio.linkedin_url_real,
    email_validado: persistedSocio.email_validado,
    email_validation_status: persistedSocio.email_validation_status
  });

  console.log('\n=============================================================');
  console.log('🎉 FASE 39 - ETAPA 2 HOMOLOGADA COM SUCESSO ABSOLUTO!');
  console.log('Rota QSA integrada ao novo Motor OSINT com persistência total.');
  console.log('=============================================================');
}

runTests().catch(err => {
  console.error('\n❌ ERRO NO TESTE DA FASE 39 (ETAPA 2):', err.message);
  process.exit(1);
});
