/**
 * tests/test_phase59_step2_api_router.js
 * 
 * SUÍTE DE TESTES: FASE 59 — ETAPA 2
 * Motor de Roteamento Dinâmico de APIs (Backend) & Interceptação Temporal do Test Drive
 * 
 * Valida:
 * 1. Suporte aos 3 serviços essenciais: 'openai', 'meta', 'bureau'
 * 2. Resolução de Chaves Mestre durante Test Drive ativo
 * 3. Bloqueio temporal inviolável (TEST_DRIVE_EXPIRED / HTTP 403) quando now >= test_drive_expires_at
 * 4. Resolução de Chaves Locais do Tenant quando use_master_key = false
 * 5. Disparo de TENANT_KEY_MISSING (HTTP 400) se chave do cliente não configurada
 * 6. Imunidade de expiração quando o cliente já opera com chaves próprias
 */

import assert from 'assert';
import { sqliteDb } from '../server/src/config/database.js';
import { 
  updateHostMasterSettings, 
  saveTenantApiConfig, 
  getTenantApiConfig 
} from '../server/src/services/apiConfigService.js';
import { 
  resolveTenantCredentials, 
  checkTenantTestDriveStatus, 
  ApiRouterError, 
  SUPPORTED_SERVICES 
} from '../server/src/services/apiRouterService.js';

console.log('🧪 Iniciando Testes da Fase 59 — Etapa 2 (Motor de Roteamento Dinâmico & Test Drive)...\n');

async function runTests() {
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // IDs de teste isolados
  const testTenantActive = 'tenant-test-router-active';
  const testTenantExpired = 'tenant-test-router-expired';
  const testTenantOwnKeys = 'tenant-test-router-own-keys';
  const testTenantMissingKeys = 'tenant-test-router-missing-keys';

  const masterOpenaiKey = 'sk-master-host-openai-secret';
  const masterMetaAppId = 'master_app_id_999';
  const masterMetaToken = 'EAAB_master_meta_token_secret';
  const masterBureauKey = 'bureau_master_secret_assertiva';

  // Configuração prévia do Host Master
  await updateHostMasterSettings({
    master_openai_key: masterOpenaiKey,
    master_meta_app_id: masterMetaAppId,
    master_meta_token: masterMetaToken,
    master_bureau_key: masterBureauKey
  });

  // ============================================================================
  // BLOCO 1: Validação de Parâmetros e Serviços Suportados
  // ============================================================================
  console.log('--- 1. Validação de Serviços Suportados ---');

  await test('Deve aceitar estritamente os 3 serviços: openai, meta, bureau', () => {
    assert.deepStrictEqual(SUPPORTED_SERVICES, ['openai', 'meta', 'bureau']);
  });

  await test('Deve rejeitar serviço inválido com erro estruturado INVALID_SERVICE_TYPE (HTTP 400)', async () => {
    try {
      await resolveTenantCredentials('tenant-root-default', 'stripe_payments');
      assert.fail('Deveria ter lançado erro');
    } catch (err) {
      assert.ok(err instanceof ApiRouterError);
      assert.strictEqual(err.code, 'INVALID_SERVICE_TYPE');
      assert.strictEqual(err.status, 400);
    }
  });

  // ============================================================================
  // BLOCO 2: Test Drive Ativo (use_master_key: true, dentro do prazo)
  // ============================================================================
  console.log('\n--- 2. Resolução Durante Test Drive Ativo ---');

  // Tenant ativo: expira daqui a 7 dias
  const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  sqliteDb.prepare("INSERT OR IGNORE INTO tenants (id, name, plan, status) VALUES (?, 'Tenant TD Ativo', 'ENTERPRISE', 'ACTIVE')").run(testTenantActive);
  await saveTenantApiConfig(testTenantActive, {
    use_master_key: true,
    test_drive_expires_at: futureExpiry
  });

  await test('OpenAI: Deve resolver Chave Mestre com source MASTER e isTestDrive true', async () => {
    const creds = await resolveTenantCredentials(testTenantActive, 'openai');
    assert.strictEqual(creds.serviceType, 'openai');
    assert.strictEqual(creds.source, 'MASTER');
    assert.strictEqual(creds.isMasterKey, true);
    assert.strictEqual(creds.isTestDrive, true);
    assert.strictEqual(creds.apiKey, masterOpenaiKey);
    assert.strictEqual(creds.credentials.apiKey, masterOpenaiKey);
  });

  await test('Meta Ads: Deve resolver Token e App ID Mestre com source MASTER', async () => {
    const creds = await resolveTenantCredentials(testTenantActive, 'meta');
    assert.strictEqual(creds.serviceType, 'meta');
    assert.strictEqual(creds.source, 'MASTER');
    assert.strictEqual(creds.isMasterKey, true);
    assert.strictEqual(creds.token, masterMetaToken);
    assert.strictEqual(creds.accessToken, masterMetaToken);
    assert.strictEqual(creds.appId, masterMetaAppId);
  });

  await test('Bureau: Deve resolver Chave Mestre com source MASTER', async () => {
    const creds = await resolveTenantCredentials(testTenantActive, 'bureau');
    assert.strictEqual(creds.serviceType, 'bureau');
    assert.strictEqual(creds.source, 'MASTER');
    assert.strictEqual(creds.isMasterKey, true);
    assert.strictEqual(creds.apiKey, masterBureauKey);
  });

  // ============================================================================
  // BLOCO 3: Interceptação Temporal & Bloqueio Estrito (TEST_DRIVE_EXPIRED)
  // ============================================================================
  console.log('\n--- 3. Interceptação Temporal e Bloqueio após Vencimento (TEST_DRIVE_EXPIRED) ---');

  // Tenant expirado: expirou há 1 hora
  const pastExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  sqliteDb.prepare("INSERT OR IGNORE INTO tenants (id, name, plan, status) VALUES (?, 'Tenant TD Expirado', 'ENTERPRISE', 'ACTIVE')").run(testTenantExpired);
  await saveTenantApiConfig(testTenantExpired, {
    use_master_key: true,
    test_drive_expires_at: pastExpiry
  });

  await test('OpenAI: Deve bloquear acesso à chave master e disparar TEST_DRIVE_EXPIRED (HTTP 403)', async () => {
    try {
      await resolveTenantCredentials(testTenantExpired, 'openai');
      assert.fail('Deveria ter bloqueado com TEST_DRIVE_EXPIRED');
    } catch (err) {
      assert.ok(err instanceof ApiRouterError);
      assert.strictEqual(err.code, 'TEST_DRIVE_EXPIRED');
      assert.strictEqual(err.status, 403);
      assert.strictEqual(err.serviceType, 'openai');
      assert.ok(err.friendlyMessage.includes('Test Drive expirou'));
    }
  });

  await test('Meta Ads: Deve bloquear acesso à chave master e disparar TEST_DRIVE_EXPIRED (HTTP 403)', async () => {
    try {
      await resolveTenantCredentials(testTenantExpired, 'meta');
      assert.fail('Deveria ter bloqueado com TEST_DRIVE_EXPIRED');
    } catch (err) {
      assert.ok(err instanceof ApiRouterError);
      assert.strictEqual(err.code, 'TEST_DRIVE_EXPIRED');
      assert.strictEqual(err.status, 403);
      assert.strictEqual(err.serviceType, 'meta');
    }
  });

  await test('Bureau: Deve bloquear acesso à chave master e disparar TEST_DRIVE_EXPIRED (HTTP 403)', async () => {
    try {
      await resolveTenantCredentials(testTenantExpired, 'bureau');
      assert.fail('Deveria ter bloqueado com TEST_DRIVE_EXPIRED');
    } catch (err) {
      assert.ok(err instanceof ApiRouterError);
      assert.strictEqual(err.code, 'TEST_DRIVE_EXPIRED');
      assert.strictEqual(err.status, 403);
      assert.strictEqual(err.serviceType, 'bureau');
    }
  });

  await test('Fronteira Temporal: Test Drive ativo às 23:59:59 e bloqueado às 00:00:00 (Injeção de Relógio)', async () => {
    const fixedDeadline = new Date('2026-10-01T00:00:00.000Z');
    const tenantBoundary = 'tenant-test-router-boundary';
    
    sqliteDb.prepare("INSERT OR IGNORE INTO tenants (id, name, plan, status) VALUES (?, 'Tenant Fronteira', 'ENTERPRISE', 'ACTIVE')").run(tenantBoundary);
    await saveTenantApiConfig(tenantBoundary, {
      use_master_key: true,
      test_drive_expires_at: fixedDeadline.toISOString()
    });

    // 1 segundo antes: AUTORIZADO
    const oneSecBefore = new Date('2026-09-30T23:59:59.000Z');
    const validCreds = await resolveTenantCredentials(tenantBoundary, 'openai', { now: oneSecBefore });
    assert.strictEqual(validCreds.apiKey, masterOpenaiKey);

    // No instante exato ou 1 segundo depois: BLOQUEADO
    const exactMoment = new Date('2026-10-01T00:00:00.000Z');
    await assert.rejects(
      async () => resolveTenantCredentials(tenantBoundary, 'openai', { now: exactMoment }),
      (err) => err instanceof ApiRouterError && err.code === 'TEST_DRIVE_EXPIRED' && err.status === 403
    );

    // Limpeza
    sqliteDb.prepare("DELETE FROM tenant_api_configs WHERE tenant_id = ?").run(tenantBoundary);
    sqliteDb.prepare("DELETE FROM tenants WHERE id = ?").run(tenantBoundary);
  });

  // ============================================================================
  // BLOCO 4: Produção com Chaves Locais (use_master_key: false)
  // ============================================================================
  console.log('\n--- 4. Chaves Locais do Tenant (use_master_key = false) ---');

  const clientOpenai = 'sk-client-own-key-12345';
  const clientMetaAppId = 'client_app_id_777';
  const clientMetaToken = 'EAAB_client_token_secret';
  const clientBureau = 'bureau_client_own_token';

  // Tenant com chaves próprias e data vencida no passado: NÃO PODE BLOQUEAR!
  sqliteDb.prepare("INSERT OR IGNORE INTO tenants (id, name, plan, status) VALUES (?, 'Tenant Chaves Próprias', 'ENTERPRISE', 'ACTIVE')").run(testTenantOwnKeys);
  await saveTenantApiConfig(testTenantOwnKeys, {
    use_master_key: false,
    test_drive_expires_at: pastExpiry, // data passada não afeta chave própria
    openai_key: clientOpenai,
    meta_app_id: clientMetaAppId,
    meta_token: clientMetaToken,
    bureau_key: clientBureau
  });

  await test('OpenAI: Deve resolver Chave Local do Tenant mesmo com data de test drive no passado', async () => {
    const creds = await resolveTenantCredentials(testTenantOwnKeys, 'openai');
    assert.strictEqual(creds.serviceType, 'openai');
    assert.strictEqual(creds.source, 'TENANT');
    assert.strictEqual(creds.isMasterKey, false);
    assert.strictEqual(creds.isTestDrive, false);
    assert.strictEqual(creds.apiKey, clientOpenai);
  });

  await test('Meta Ads: Deve resolver Token e App ID do Tenant com source TENANT', async () => {
    const creds = await resolveTenantCredentials(testTenantOwnKeys, 'meta');
    assert.strictEqual(creds.serviceType, 'meta');
    assert.strictEqual(creds.source, 'TENANT');
    assert.strictEqual(creds.token, clientMetaToken);
    assert.strictEqual(creds.appId, clientMetaAppId);
  });

  await test('Bureau: Deve resolver Chave do Bureau do Tenant com source TENANT', async () => {
    const creds = await resolveTenantCredentials(testTenantOwnKeys, 'bureau');
    assert.strictEqual(creds.serviceType, 'bureau');
    assert.strictEqual(creds.source, 'TENANT');
    assert.strictEqual(creds.apiKey, clientBureau);
  });

  // ============================================================================
  // BLOCO 5: Falta de Chave Local (TENANT_KEY_MISSING / HTTP 400)
  // ============================================================================
  console.log('\n--- 5. Disparo de TENANT_KEY_MISSING quando use_master_key = false ---');

  // Tenant em modo produção sem chaves preenchidas
  sqliteDb.prepare("INSERT OR IGNORE INTO tenants (id, name, plan, status) VALUES (?, 'Tenant Chaves Faltantes', 'ENTERPRISE', 'ACTIVE')").run(testTenantMissingKeys);
  await saveTenantApiConfig(testTenantMissingKeys, {
    use_master_key: false,
    openai_key: null,
    meta_token: null,
    bureau_key: null
  });

  await test('OpenAI: Deve disparar TENANT_KEY_MISSING (HTTP 400)', async () => {
    await assert.rejects(
      async () => resolveTenantCredentials(testTenantMissingKeys, 'openai'),
      (err) => err instanceof ApiRouterError && err.code === 'TENANT_KEY_MISSING' && err.status === 400
    );
  });

  await test('Meta Ads: Deve disparar TENANT_KEY_MISSING (HTTP 400)', async () => {
    await assert.rejects(
      async () => resolveTenantCredentials(testTenantMissingKeys, 'meta'),
      (err) => err instanceof ApiRouterError && err.code === 'TENANT_KEY_MISSING' && err.status === 400
    );
  });

  await test('Bureau: Deve disparar TENANT_KEY_MISSING (HTTP 400)', async () => {
    await assert.rejects(
      async () => resolveTenantCredentials(testTenantMissingKeys, 'bureau'),
      (err) => err instanceof ApiRouterError && err.code === 'TENANT_KEY_MISSING' && err.status === 400
    );
  });

  // ============================================================================
  // BLOCO 6: Helper de Telemetria de Test Drive (checkTenantTestDriveStatus)
  // ============================================================================
  console.log('\n--- 6. Helper checkTenantTestDriveStatus ---');

  await test('Deve retornar status correto para tenant ativo e expirado', async () => {
    const statusActive = await checkTenantTestDriveStatus(testTenantActive);
    assert.strictEqual(statusActive.use_master_key, true);
    assert.strictEqual(statusActive.is_test_drive_active, true);
    assert.strictEqual(statusActive.is_test_drive_expired, false);
    assert.ok(statusActive.days_remaining > 0);

    const statusExpired = await checkTenantTestDriveStatus(testTenantExpired);
    assert.strictEqual(statusExpired.use_master_key, true);
    assert.strictEqual(statusExpired.is_test_drive_active, false);
    assert.strictEqual(statusExpired.is_test_drive_expired, true);
    assert.strictEqual(statusExpired.days_remaining, 0);

    const statusOwn = await checkTenantTestDriveStatus(testTenantOwnKeys);
    assert.strictEqual(statusOwn.use_master_key, false);
    assert.strictEqual(statusOwn.is_test_drive_active, false);
    assert.strictEqual(statusOwn.is_test_drive_expired, false);
  });

  // ============================================================================
  // Teardown / Limpeza
  // ============================================================================
  const cleanupTenants = [testTenantActive, testTenantExpired, testTenantOwnKeys, testTenantMissingKeys];
  for (const tid of cleanupTenants) {
    sqliteDb.prepare("DELETE FROM tenant_api_configs WHERE tenant_id = ?").run(tid);
    sqliteDb.prepare("DELETE FROM tenants WHERE id = ?").run(tid);
  }

  console.log(`\n🎉 [SUCESSO TOTAL] ${passed}/${total} testes da Fase 59 — Etapa 2 aprovados com 100% de precisão!`);
}

runTests().catch(err => {
  console.error('\n❌ Falha na execução da suíte da Etapa 2:', err);
  process.exit(1);
});
