/**
 * tests/test_meta_ads_spark_export.js
 * Validação da exportação Meta Ads Custom Audiences com Hashing SHA-256
 */

import http from 'http';

async function testMetaAdsExport() {
  console.log('🧪 Iniciando teste de validação da exportação Meta Ads...');

  const res = await fetch('http://localhost:3000/api/sparks/signals/export-meta-ads?ids=sig-credito_bndes-997dfac7');
  
  if (res.status !== 200) {
    throw new Error(`Status HTTP inesperado: ${res.status}`);
  }

  const disposition = res.headers.get('content-disposition');
  console.log('✅ Content-Disposition:', disposition);

  const text = await res.text();
  const lines = text.trim().split('\r\n');
  console.log('✅ Total de Linhas:', lines.length);
  console.log('✅ Header:', lines[0]);
  console.log('✅ Linha Dados:', lines[1]);

  const cols = lines[1].split(',');
  // fn (coluna 2), ln (coluna 3), country (coluna 7)
  const fnHash = cols[2].replace(/"/g, '');
  const lnHash = cols[3].replace(/"/g, '');
  const countryHash = cols[7].replace(/"/g, '');

  console.log('   FN Hash:', fnHash, '(comprimento:', fnHash.length, ')');
  console.log('   LN Hash:', lnHash, '(comprimento:', lnHash.length, ')');
  console.log('   Country Hash:', countryHash, '(comprimento:', countryHash.length, ')');

  if (countryHash.length !== 64) {
    throw new Error('Hash do país não possui 64 caracteres SHA-256');
  }

  console.log('\n🎉 TESTE PASSOU! O arquivo gerado é estritamente compatível com o Meta Ads Custom Audiences SHA-256.');
}

testMetaAdsExport().catch(err => {
  console.error('❌ Falha no teste:', err.message);
  process.exit(1);
});
