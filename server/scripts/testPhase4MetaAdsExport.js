/**
 * server/scripts/testPhase4MetaAdsExport.js
 * 
 * SCRIPT DE TESTE E VALIDACAO DA FASE 4:
 * Pipeline de Exportacao Meta Ads (Custom Audiences SHA-256 dos Socios) e Geofencing.
 */

import { SparksEngineService } from '../src/services/sparksEngineService.js';

async function main() {
  console.log('--- TESTE FASE 4: PIPELINE DE EXPORTACAO META ADS E GEOFENCING ---');

  const testSignalId = 'sig-bndes-ca760e99b1'; // S S EMPREENDIMENTOS AGRICOLAS LTDA
  console.log(`\n1. Exportando Meta Ads para o sinal de teste [${testSignalId}]...`);

  const metaResult = await SparksEngineService.exportSignalsMetaAds([testSignalId], 'tenant-root-default');

  console.log(`\nTotal de registros gerados para Meta Ads Custom Audiences: ${metaResult.hashed_rows.length}`);
  console.log(`Total de alfinetes de geofencing: ${metaResult.geofencing_pins.length}`);

  console.log('\n--- AUDIENCIAS EM TEXTO LIMPO (PARA AUDITORIA DOS DECISORES) ---');
  metaResult.audiences_raw.forEach((r, idx) => {
    console.log(`[Decisor ${idx + 1}]`);
    console.log(`  Nome Completo: ${r.contato_nome} (Cargo: ${r.cargo || 'Sócio'})`);
    console.log(`  Empresa: ${r.razao_social} (CNPJ: ${r.cnpj})`);
    console.log(`  Telefone: ${r.telefone}`);
    console.log(`  Municipio/UF: ${r.municipio}/${r.uf}`);
    console.log(`  CEP: ${r.cep}`);
  });

  console.log('\n--- REGISTROS HASH SHA-256 (PADRAO META MARKETING API) ---');
  metaResult.hashed_rows.forEach((h, idx) => {
    console.log(`[Hash Row ${idx + 1}]`);
    console.log(`  fn (Primeiro Nome SHA-256): ${h.fn ? h.fn.slice(0, 16) + '...' : '(vazio)'}`);
    console.log(`  ln (Sobrenome SHA-256):     ${h.ln ? h.ln.slice(0, 16) + '...' : '(vazio)'}`);
    console.log(`  phone (Telefone SHA-256):   ${h.phone ? h.phone.slice(0, 16) + '...' : '(vazio)'}`);
    console.log(`  ct (Cidade SHA-256):        ${h.ct ? h.ct.slice(0, 16) + '...' : '(vazio)'}`);
    console.log(`  st (UF SHA-256):            ${h.st ? h.st.slice(0, 16) + '...' : '(vazio)'}`);
    console.log(`  zip (CEP SHA-256):          ${h.zip ? h.zip.slice(0, 16) + '...' : '(vazio)'}`);
    console.log(`  country (Pais SHA-256):     ${h.country ? h.country.slice(0, 16) + '...' : '(vazio)'}`);
  });

  console.log('\n--- PARAMETROS DE GEOFENCING (RAIO E COORDENADAS) ---');
  metaResult.geofencing_pins.forEach(pin => {
    console.log(`  Cliente: ${pin.cliente}`);
    console.log(`  Coordenadas Meta: ${pin.coordenadas_meta}`);
    console.log(`  Raio Recomendado: ${pin.raio_sugerido_km} km`);
  });

  // Validacao de integridade de hashes
  let allHashesValid = true;
  for (const h of metaResult.hashed_rows) {
    if (h.fn && h.fn.length !== 64) allHashesValid = false;
    if (h.phone && h.phone.length !== 64) allHashesValid = false;
    if (h.country && h.country.length !== 64) allHashesValid = false;
  }

  if (allHashesValid) {
    console.log('\nSUCESSO: Todos os hashes SHA-256 possuem exatamente 64 caracteres hexadecimais validos.');
  } else {
    console.error('\nFALHA: Ha campos com formato hash invalido.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Falha geral no teste da Fase 4:', err);
  process.exit(1);
});
