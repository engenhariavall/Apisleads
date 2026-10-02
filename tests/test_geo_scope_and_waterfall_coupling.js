/**
 * tests/test_geo_scope_and_waterfall_coupling.js
 * 
 * BATERIA DE TESTES DE INTEGRAÇÃO:
 * Validação de Escopo Geográfico (Frente 1) e Enriquecimento em Cascata (Frente 2).
 */

import assert from 'assert';
import { carService } from '../server/src/services/carService.js';
import { leadEnrichmentService } from '../server/src/services/leadEnrichmentService.js';
import { enrichRuralOsintHandler } from '../server/src/controllers/geoFundiarioController.js';

async function runTests() {
  console.log('🧪 Iniciando Testes de Escopo Geográfico e Cascata do Inspetor...\n');
  let passed = 0;

  // ── TESTE 1: Isolamento estrito de acervo local por município ─────────────
  try {
    const pfParcels = carService.buscarDoAcervoLocal({ uf: 'RS', municipio: 'PASSO FUNDO' });
    const caParcels = carService.buscarDoAcervoLocal({ uf: 'RS', municipio: 'CRUZ ALTA' });
    const smParcels = carService.buscarDoAcervoLocal({ uf: 'RS', municipio: 'SANTA MARIA' });

    assert.ok(pfParcels.length > 0, 'Passo Fundo deve conter parcelas');
    assert.ok(caParcels.length > 0, 'Cruz Alta deve conter parcelas reais baixadas');
    assert.ok(smParcels.length > 0, 'Santa Maria deve conter parcelas reais baixadas');

    // Nenhuma parcela de Cruz Alta deve ser de Passo Fundo
    const caSample = caParcels[0];
    const caMun = String(caSample.properties?.nom_municipio || caSample.properties?.municipio || '').toUpperCase();
    assert.ok(caMun.includes('CRUZ ALTA'), `Parcela de Cruz Alta deve ter município CRUZ ALTA, obteve: ${caMun}`);

    console.log(`  ✅ [PASS] 1. Isolamento municipal: Passo Fundo (${pfParcels.length}), Cruz Alta (${caParcels.length}), Santa Maria (${smParcels.length})`);
    passed++;
  } catch (err) {
    console.error('  ❌ [FAIL] 1. Isolamento municipal falhou:', err.message);
  }

  // ── TESTE 2: Escopo macro estadual agrega múltiplos municípios ─────────────
  try {
    const rsParcels = carService.buscarDoAcervoLocal({ uf: 'RS', municipio: '' });
    assert.ok(rsParcels.length > 2000, `Escopo estadual do RS deve conter mais de 2000 parcelas combinadas (obteve ${rsParcels.length})`);

    // Verifica diversidade de municípios no resultado estadual
    const citiesSet = new Set();
    rsParcels.forEach(f => {
      const m = String(f.properties?.nom_municipio || f.properties?.municipio || '').toUpperCase().trim();
      if (m) citiesSet.add(m);
    });

    assert.ok(citiesSet.size >= 3, `Escopo estadual deve conter múltiplos municípios (encontrados: ${Array.from(citiesSet).join(', ')})`);
    console.log(`  ✅ [PASS] 2. Escopo macro estadual (RS): ${rsParcels.length} parcelas cobrindo ${citiesSet.size} municípios distintos`);
    passed++;
  } catch (err) {
    console.error('  ❌ [FAIL] 2. Escopo estadual falhou:', err.message);
  }

  // ── TESTE 3: Município não pré-baixado retorna [] (permitindo WFS) ────────
  try {
    const unknownParcels = carService.buscarDoAcervoLocal({ uf: 'RS', municipio: 'CIDADE_INEXISTENTE_TESTE_XYZ' });
    assert.strictEqual(unknownParcels.length, 0, 'Município não cadastrado deve retornar array vazio, sem despejar Passo Fundo');
    console.log('  ✅ [PASS] 3. Acervo local não despeja Passo Fundo para municípios não cadastrados');
    passed++;
  } catch (err) {
    console.error('  ❌ [FAIL] 3. Fallback de cidade inexistente falhou:', err.message);
  }

  // ── TESTE 4: Enriquecimento em cascata com coordenadas reais do SIGEF ─────
  try {
    // Parcela real certificada em Passo Fundo (-28.2450, -52.3850)
    const mockClickPayload = {
      id: 'car-test-poly-01',
      codigo_car: 'RS-4314100-TEST01',
      tag_fonte: 'SICAR',
      nome_titular: 'Titularidade sob sigilo (LGPD)',
      cpf_cnpj_titular: null,
      municipio: 'PASSO FUNDO',
      uf: 'RS',
      nome_imovel: 'Imóvel Rural Teste',
      lat: -28.2450,
      lng: -52.3850,
      centroide_lat: -28.2450,
      centroide_lng: -52.3850,
      area_hectares: 845.60
    };

    const waterfallResult = await leadEnrichmentService.enrichPropertyWaterfall(mockClickPayload, { forceRefresh: true });

    assert.ok(waterfallResult.success, 'Enriquecimento deve ter sucesso');
    assert.strictEqual(waterfallResult.layer_resolved >= 2, true, `Deve avançar além da Layer 1 (Layer resolvida: ${waterfallResult.layer_resolved})`);
    assert.notStrictEqual(waterfallResult.titular.nome_titular, 'Titularidade sob sigilo (LGPD)', 'Titular não pode permanecer sob sigilo após Layer 2/3');
    assert.ok(waterfallResult.titular.nome_titular.includes('Planalto Médio') || waterfallResult.titular.cpf_cnpj_titular, 'Titular ou documento deve ser resolvido');

    console.log(`  ✅ [PASS] 4. Cascata via coordenadas do clique: Layer ${waterfallResult.layer_resolved} (${waterfallResult.source}) -> "${waterfallResult.titular.nome_titular}" (Doc: ${waterfallResult.titular.cpf_cnpj_titular})`);
    passed++;
  } catch (err) {
    console.error('  ❌ [FAIL] 4. Cascata via coordenadas falhou:', err.message);
  }

  // ── TESTE 5: Endpoint HTTP POST /api/fundiario/enrich-osint com payload completo
  try {
    const mockReq = {
      body: {
        id: 'car-test-poly-02',
        codigo_car: 'MT-5107925-TEST02',
        tag_fonte: 'SICAR',
        nome_titular: 'Titularidade sob sigilo (LGPD)',
        municipio: 'SORRISO',
        uf: 'MT',
        lat: -12.5420,
        lng: -55.7190,
        centroide_lat: -12.5420,
        centroide_lng: -55.7190,
        area_hectares: 1420.50
      },
      headers: { 'x-tenant-id': 'tenant-root-default' }
    };

    let responseCode = 200;
    let jsonResult = null;
    const mockRes = {
      status(c) { responseCode = c; return this; },
      json(data) { jsonResult = data; return this; }
    };

    await enrichRuralOsintHandler(mockReq, mockRes);

    assert.strictEqual(responseCode, 200, `Status code deve ser 200, obteve ${responseCode}`);
    assert.ok(jsonResult.success, 'Endpoint deve retornar success: true');
    assert.ok(jsonResult.nome_titular && !jsonResult.nome_titular.includes('sigilo'), `Titular resolvido no endpoint: ${jsonResult.nome_titular}`);
    assert.ok(jsonResult.waterfall, 'Resultado deve conter metadados da cascata');

    console.log(`  ✅ [PASS] 5. Endpoint POST /api/fundiario/enrich-osint integra coordenadas e desmascara: "${jsonResult.nome_titular}"`);
    passed++;
  } catch (err) {
    console.error('  ❌ [FAIL] 5. Endpoint enrich-osint falhou:', err.message);
  }

  console.log('\n========================================');
  console.log(`📊 Resultado dos Testes: ${passed}/5 aprovados.`);
  console.log('========================================\n');

  if (passed !== 5) process.exit(1);
}

runTests();
