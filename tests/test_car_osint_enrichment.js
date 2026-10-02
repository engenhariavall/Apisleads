/**
 * test_car_osint_enrichment.js
 * 
 * Validação da Diretriz de Engenharia: ENRIQUECIMENTO OSINT PARA IMÓVEIS DO CAR
 * 1. sicarOsintService.extractCarOwner
 * 2. Orquestração em /api/fundiario/enrich-osint com Bureau e apiRouterService
 * 3. Orquestração em /osint/enrich-whatsapp-bureau
 */

import assert from 'assert';
import http from 'http';
import { sicarOsintService, normalizarCodigoCar, parseCarCodeMetadata } from '../server/src/services/sicarOsintService.js';
import db from '../server/src/config/database.js';

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
  }
}

async function itAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
  }
}

console.log('\n=== INICIANDO TESTES DO PIPELINE OSINT DO CAR ===\n');

// 1. Testes Unitários de sicarOsintService
it('Normalização e parsing de código CAR', () => {
  const norm = normalizarCodigoCar('  rs-4314100-9856c306e726462ea0a7ff9f7a3e26c4  ');
  assert.strictEqual(norm, 'RS-4314100-9856C306E726462EA0A7FF9F7A3E26C4');

  const meta = parseCarCodeMetadata(norm);
  assert.strictEqual(meta.uf, 'RS');
  assert.strictEqual(meta.ibge, '4314100');
  assert.strictEqual(meta.hash, '9856C306E726462EA0A7FF9F7A3E26C4');
});

await itAsync('sicarOsintService.extractCarOwner respeita sigilo de dados (LGPD) e não inventa nomes', async () => {
  const carCode = 'RS-4314100-9856C306E726462EA0A7FF9F7A3E26C4';
  const result = await sicarOsintService.extractCarOwner(carCode, {
    uf: 'RS',
    municipio: 'Passo Fundo'
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.codigo_car, carCode);
  // Em conformidade estrita com LGPD quando o WFS público do SFB não disponibiliza nome:
  assert.strictEqual(result.nome_titular, 'Titularidade sob sigilo (LGPD)');
  assert.strictEqual(result.cpf_cnpj_titular, null);
  assert.strictEqual(result.source, 'SICAR_SFB_LGPD_DECLARADO');
});

await itAsync('sicarOsintService.extractCarOwner recupera titular real quando vinculado a acervo cadastral verificado', async () => {
  // Insere temporariamente imóvel com titular real verificado
  const verifiedCarCode = 'RS-4314100-VERIFIED-REAL-OWNER';
  db.prepare(`
    INSERT OR REPLACE INTO propriedades_rurais (
      id, codigo_car, nome_imovel, nome_titular, cpf_cnpj_titular, municipio, uf, tag_fonte, tenant_id, geometria_poligono
    ) VALUES (
      'prop-verified-real', ?, 'Fazenda Boa Esperança', 'SLC Agrícola S.A.', '89.096.457/0001-55', 'Passo Fundo', 'RS', 'SICAR', 'tenant-root-default', '{"type":"Polygon","coordinates":[]}'
    )
  `).run(verifiedCarCode);

  try {
    const result = await sicarOsintService.extractCarOwner(verifiedCarCode, {
      uf: 'RS',
      municipio: 'Passo Fundo'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.nome_titular, 'SLC Agrícola S.A.');
    assert.strictEqual(result.cpf_cnpj_titular, '89.096.457/0001-55');
    assert.strictEqual(result.tipo_pessoa, 'PJ');
  } finally {
    db.prepare(`DELETE FROM propriedades_rurais WHERE codigo_car = ?`).run(verifiedCarCode);
  }
});

// 2. Testes de Integração de API HTTP
await itAsync('Endpoint POST /api/fundiario/enrich-osint orquestra enriquecimento via Código CAR em conformidade LGPD', async () => {
  const { default: app } = await import('../server/src/app.js');
  
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant-root-default'
      },
      body: JSON.stringify({
        codigo_car: 'RS-4314100-CAR-LEAD-TESTE-OSINT',
        tag_fonte: 'SICAR',
        nome_titular: 'Produtor Rural Declarado',
        municipio: 'Passo Fundo',
        uf: 'RS'
      })
    });

    assert.strictEqual(res.status, 200, `Esperava status 200, recebeu ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.nome_titular, 'Titularidade sob sigilo (LGPD)');
    assert.strictEqual(data.cpf_cnpj_titular, null);
    console.log(`    ℹ️ Resposta Ética: "${data.nome_titular}" | Doc: ${data.cpf_cnpj_titular} | Origem: ${data.origem_titular}`);
  } finally {
    server.close();
  }
});

await itAsync('Endpoint POST /api/fundiario/enrich-osint com Tenant Expirado respeita bloqueio do Test Drive', async () => {
  const { default: app } = await import('../server/src/app.js');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const { saveTenantApiConfig } = await import('../server/src/services/apiConfigService.js');
    const tenantExp = 'tenant-expired-test-drive-car';

    db.prepare(`
      INSERT OR REPLACE INTO tenants (id, name, plan, status)
      VALUES (?, 'Tenant Expirado CAR', 'ENTERPRISE', 'ACTIVE')
    `).run(tenantExp);

    const pastDate = new Date(Date.now() - 2 * 86400000).toISOString();
    await saveTenantApiConfig(tenantExp, {
      use_master_key: true,
      test_drive_expires_at: pastDate,
      allowed_niches: ['agro']
    });

    const res = await fetch(`http://localhost:${port}/api/fundiario/enrich-osint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantExp
      },
      body: JSON.stringify({
        codigo_car: 'RS-4314100-TESTE-EXPIRADO',
        tag_fonte: 'SICAR',
        nome_titular: 'Produtor Rural Declarado',
        municipio: 'Passo Fundo',
        uf: 'RS'
      })
    });

    assert.strictEqual(res.status, 403, `Esperava status 403 para Test Drive Expirado, recebeu ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, 'TEST_DRIVE_EXPIRED');
    console.log(`    ℹ️ Bloqueio de Test Drive validado com sucesso: "${data.message}"`);
  } finally {
    server.close();
  }
});

console.log(`\n=== RESUMO: ${passed}/${total} TESTES PASSARAM ===\n`);
if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
