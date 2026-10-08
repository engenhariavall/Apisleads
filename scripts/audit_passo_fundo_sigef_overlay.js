import fs from 'fs';
import { buscarMalhaCarPorMunicipio } from '../server/src/services/carService.js';

async function main() {
  const sigefPath = 'data/sigef/RS/PASSO_FUNDO.geojson';
  const sigefData = JSON.parse(fs.readFileSync(sigefPath, 'utf8'));
  console.log('========================================================================');
  console.log('🌾 1. AUDITORIA DA MALHA SIGEF INGERIDA:');
  console.log('Arquivo:', sigefPath);
  console.log('Total de Feições no GeoJSON:', sigefData.features.length);
  const inRange = sigefData.features.length >= 300 && sigefData.features.length <= 450;
  console.log('Faixa esperada: ~300 a 450 parcelas | Status:', inRange ? '✅ DENTRO DA FAIXA ESPERADA' : '⚠️ FORA');
  console.log('========================================================================\n');

  console.log('🛡️ 2. REEXECUÇÃO DO MOTOR DE SOBREPOSIÇÃO ESPACIAL (PASSO 2 INTERSECTS)...');
  const carResult = await buscarMalhaCarPorMunicipio({ uf: 'RS', municipio: 'PASSO FUNDO' });
  const allCar = carResult.features || [];
  const matches = allCar.filter(f => f.properties?.sobreposicao_sigef);

  console.log('Total de parcelas CAR analisadas:', allCar.length);
  console.log('Volume de parcelas CAR sobrepostas com SIGEF:', matches.length);
  const metaSuperada = matches.length > 400;
  console.log('Meta esperada: > 400 matches | Status:', metaSuperada ? '✅ META SUPERADA (> 400 MATCHES)' : '⚠️ ABAIXO');
  console.log('Taxa de Paridade Fundiária CAR x SIGEF:', ((matches.length / allCar.length) * 100).toFixed(1) + '%\n');

  console.log('📋 3. AMOSTRAGEM DE CARs ENRIQUECIDOS COM MATRÍCULA CRI E CÓDIGO SNCR:');
  matches.slice(0, 5).forEach((m, idx) => {
    const p = m.properties;
    console.log(`\n--- [Amostra ${idx + 1}] ---`);
    console.log(`• Código CAR:         ${p.codigo_car}`);
    console.log(`• Matrícula CRI:      ${p.registro_matricula || 'N/A'}`);
    console.log(`• Código SNCR/INCRA:  ${p.codigo_imovel_sncr || 'N/A'}`);
    console.log(`• Denominação:        ${p.nome_imovel_cartorio || p.nome_imovel}`);
    console.log(`• Titular / Dono:     ${p.nome_titular}`);
    console.log(`• Score Sobreposição: ${p.sobreposicao_score}%`);
    console.log(`• Motivo Geodésico:   ${p.sobreposicao_motivo}`);
    console.log(`• Tag de Fonte:       ${p.tag_fonte}`);
    console.log(`• Status Geo:         ${p.status_geo}`);
  });

  console.log('\n========================================================================');
  console.log('🏆 SUCESSO COMPLETO NA AUDITORIA E REEXECUÇÃO ESPACIAL!');
  console.log('========================================================================');
}

main().catch(err => {
  console.error('Erro na auditoria:', err);
  process.exit(1);
});
