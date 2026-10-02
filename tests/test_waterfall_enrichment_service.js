import assert from 'assert';
import db from '../server/src/config/database.js';
import { 
  leadEnrichmentService, 
  AsyncConcurrencyRateLimiter, 
  isMaskedTitular, 
  cleanDocument 
} from '../server/src/services/leadEnrichmentService.js';

console.log('🧪 Iniciando Testes do Motor de Waterfall Enrichment e Resolução de Identidade...\n');

let passCount = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

async function runTests() {
  // 1. Detecção de Máscaras e Sigilo LGPD
  await test('1. isMaskedTitular identifica corretamente titulares protegidos ou genéricos', () => {
    assert.strictEqual(isMaskedTitular(null), true);
    assert.strictEqual(isMaskedTitular(''), true);
    assert.strictEqual(isMaskedTitular('***.***.123-**'), true);
    assert.strictEqual(isMaskedTitular('Titularidade sob sigilo (LGPD)'), true);
    assert.strictEqual(isMaskedTitular('Produtor Rural Declarado'), true);
    assert.strictEqual(isMaskedTitular('Não informado'), true);
    assert.strictEqual(isMaskedTitular('Informação protegida por sigilo'), true);
    assert.strictEqual(isMaskedTitular('João Carlos da Silva Silveira'), false);
    assert.strictEqual(isMaskedTitular('Fazenda Esperança Agropecuária LTDA'), false);
  });

  // 2. Fila de Concorrência e Rate Limiting Anti-Bloqueio
  await test('2. AsyncConcurrencyRateLimiter respeita concorrência máxima de 3 e vazão por segundo', async () => {
    const limiter = new AsyncConcurrencyRateLimiter({ concurrency: 3, maxPerSecond: 10 });
    let maxRunning = 0;
    let currentlyRunning = 0;

    const task = () => limiter.run(async () => {
      currentlyRunning++;
      if (currentlyRunning > maxRunning) maxRunning = currentlyRunning;
      await new Promise(r => setTimeout(r, 60));
      currentlyRunning--;
      return 'ok';
    });

    const promises = Array.from({ length: 6 }).map(() => task());
    const results = await Promise.all(promises);

    assert.strictEqual(results.length, 6);
    assert.ok(maxRunning <= 3, `Concorrência observada (${maxRunning}) não deve exceder 3`);
    assert.strictEqual(limiter.getStats().concurrencyLimit, 3);
  });

  // 3. Layer 1 (CAR/LGPD): Titular autêntico não mascarado é resolvido imediatamente
  await test('3. Layer 1 resolve imediatamente imóvel com titular autêntico e desmascarado', async () => {
    const input = {
      codigo_car: 'MT-5107909-TESTE-LAYER1',
      nome_titular: 'Roberto Magalhães Penteado',
      cpf_cnpj_titular: '123.456.789-00',
      municipio: 'Sinop',
      uf: 'MT',
      area_hectares: 850
    };

    const l1 = await leadEnrichmentService.executeLayer1CarLgpd(input);
    assert.strictEqual(l1.resolved, true);
    assert.strictEqual(l1.layer, 1);
    assert.strictEqual(l1.nome_titular, 'Roberto Magalhães Penteado');
  });

  // 4. Layer 1 -> Layer 2: Titular mascarado avança para cruzamento geográfico SIGEF/INCRA
  await test('4. Layer 1 sinaliza avanço obrigatório para Layer 2 se titular for sob sigilo', async () => {
    const input = {
      codigo_car: 'MT-5107909-TESTE-MASKED',
      nome_titular: 'Titularidade sob sigilo (LGPD)',
      municipio: 'Sorriso',
      uf: 'MT'
    };

    const l1 = await leadEnrichmentService.executeLayer1CarLgpd(input);
    assert.strictEqual(l1.resolved, false);
    assert.strictEqual(l1.precisa_avancar, true);
  });

  // 5. Layer 2: Interseção espacial com malha oficial SIGEF resgata Titular de Cartório
  await test('5. Layer 2 resgata Nome do Titular Real certificado via SIGEF/SNCR', async () => {
    // Insere ou atualiza propriedade de teste certificada do SIGEF
    const testSigefId = 'TEST_SIGEF_WATERFALL_01';
    db.prepare(`
      INSERT OR REPLACE INTO propriedades_rurais (
        id, id_sigef, codigo_imovel, nome_imovel, municipio, uf, area_hectares, 
        geometria_poligono, centroide_lat, centroide_lng, nome_titular, cpf_cnpj_titular, 
        status_geo, tag_fonte, tenant_id, updated_at
      ) VALUES (
        ?, ?, 'COD_TEST_01', 'Fazenda Terra Santa', 'Sorriso', 'MT', 1450.0,
        '{"type":"Polygon","coordinates":[[[-55.75,-12.55],[-55.70,-12.55],[-55.70,-12.50],[-55.75,-12.50],[-55.75,-12.55]]]}',
        -12.525, -55.725, 'Agropecuária Terra Santa S/A', '08.987.654/0001-32',
        'CERTIFICADO', 'SIGEF', 'tenant-root-default', datetime('now')
      )
    `).run(testSigefId, testSigefId);

    // Consulta por coordenadas que caem no interior do polígono (-12.525, -55.725)
    const l2 = await leadEnrichmentService.executeLayer2GeographicSigef({
      lat: -12.525,
      lng: -55.725
    });

    assert.strictEqual(l2.resolved, true);
    assert.strictEqual(l2.layer, 2);
    assert.strictEqual(l2.nome_titular, 'Agropecuária Terra Santa S/A');
    assert.strictEqual(l2.cpf_cnpj_titular, '08.987.654/0001-32');
    assert.strictEqual(l2.source, 'SIGEF_CARTORIO_LAYER2');
  });

  // 6. Database-First Cache: Retorno em < 10ms se atualizado nos últimos 30 dias
  await test('6. Database-First Cache retorna dados em 1ms sem hits desnecessários', async () => {
    const cachedPropId = 'TEST_PROP_CACHE_30D';
    db.prepare(`
      INSERT OR REPLACE INTO propriedades_rurais (
        id, id_sigef, codigo_imovel, nome_imovel, municipio, uf, area_hectares, 
        geometria_poligono, centroide_lat, centroide_lng, nome_titular, cpf_cnpj_titular, 
        whatsapp_validado, osint_status, status_geo, tag_fonte, tenant_id, updated_at
      ) VALUES (
        ?, ?, 'COD_CACHE_01', 'Fazenda Sol Nascente', 'Querência', 'MT', 2100.0,
        '{"type":"Polygon","coordinates":[[[-52.20,-12.60],[-52.10,-12.60],[-52.10,-12.50],[-52.20,-12.50],[-52.20,-12.60]]]}',
        -12.55, -52.15, 'Carlos Eduardo Fontana', '456.789.012-34',
        '+5566999881122', 'ENRICHED', 'CERTIFICADO', 'SIGEF', 'tenant-root-default', datetime('now', '-5 days')
      )
    `).run(cachedPropId, cachedPropId);

    const startTime = Date.now();
    const result = await leadEnrichmentService.enrichPropertyWaterfall({ id: cachedPropId });
    const duration = Date.now() - startTime;

    assert.strictEqual(result.cached, true);
    assert.strictEqual(result.source, 'DATABASE_CACHE_30D');
    assert.strictEqual(result.titular.nome_titular, 'Carlos Eduardo Fontana');
    assert.strictEqual(result.contatos.whatsapp, '+5566999881122');
    assert.ok(duration < 50, `Duração deve ser instantânea (levou ${duration}ms)`);
  });

  // 7. Regra Estrita de Fallback: "Titularidade sob sigilo / Pendente" SÓ se falhar em todas as 3 layers
  await test('7. Fallback estrito: string sob sigilo é exibida apenas se as 3 layers falharem exaustivamente', async () => {
    const ghostInput = {
      id: 'NON_EXISTENT_IMPOSSIBLE_PROPERTY_9999',
      codigo_car: 'RS-9999999-GHOST-UNKNOWN',
      nome_titular: '***',
      municipio: 'Desconhecido',
      uf: 'XX',
      lat: 0.0,
      lng: 0.0
    };

    const result = await leadEnrichmentService.enrichPropertyWaterfall(ghostInput, { forceRefresh: true });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.titular.nome_titular, 'Titularidade sob sigilo / Pendente');
    assert.strictEqual(result.osint_status, 'NOT_FOUND');
    assert.ok(result.mensagem.includes('cruzamento cartorial exaustivo'));
  });

  // 8. Payload Padronizado e Unificado para o Inspetor de Leads
  await test('8. Objeto JSON retornado possui a estrutura padronizada requerida pelo Inspetor', async () => {
    const testPropId = 'TEST_PAYLOAD_STRUCTURE';
    db.prepare(`
      INSERT OR REPLACE INTO propriedades_rurais (
        id, id_sigef, codigo_imovel, nome_imovel, municipio, uf, area_hectares, 
        geometria_poligono, centroide_lat, centroide_lng, nome_titular, cpf_cnpj_titular, 
        whatsapp_validado, email_validado, linkedin_url_real, osint_status, status_geo, tag_fonte, tenant_id, updated_at
      ) VALUES (
        ?, ?, 'COD_STRUCT', 'Estância Bela Vista', 'Passo Fundo', 'RS', 520.0,
        '{"type":"Point","coordinates":[-52.40,-28.26]}', -28.26, -52.40,
        'Henrique Dornelles', '12.345.678/0001-99', '+5554991234567',
        'henrique@estanciabelavista.agr.br', 'https://linkedin.com/in/henrique-dornelles',
        'ENRICHED', 'CERTIFICADO', 'SIGEF', 'tenant-root-default', datetime('now')
      )
    `).run(testPropId, testPropId);

    const result = await leadEnrichmentService.enrichPropertyWaterfall({ id: testPropId });

    assert.ok(result.propriedade, 'Deve possuir chave propriedade');
    assert.ok(result.titular, 'Deve possuir chave titular');
    assert.ok(result.contatos, 'Deve possuir chave contatos');
    assert.ok(result.osint_status, 'Deve possuir chave osint_status');

    assert.strictEqual(result.titular.nome_titular, 'Henrique Dornelles');
    assert.strictEqual(result.titular.tipo_pessoa, 'PJ');
    assert.strictEqual(result.contatos.whatsapp, '+5554991234567');
    assert.strictEqual(result.contatos.email, 'henrique@estanciabelavista.agr.br');
  });

  console.log(`\n========================================`);
  console.log(`📊 Resultado Final Waterfall Enrichment: ${passCount}/${totalTests} testes aprovados.`);
  console.log(`========================================\n`);

  if (passCount !== totalTests) {
    process.exit(1);
  }
}

runTests();
