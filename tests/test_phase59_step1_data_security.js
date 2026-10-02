/**
 * tests/test_phase59_step1_data_security.js
 * 
 * SUÍTE DE TESTES: FASE 59 — ETAPA 1
 * Infraestrutura de Dados e Segurança (SQLite)
 * 
 * Valida:
 * 1. Tabela super_admin_settings com campos master_openai_key, master_meta_app_id, master_meta_token, master_bureau_key.
 * 2. Tabela tenant_api_configs com tenant_id, chaves locais, use_master_key e test_drive_expires_at.
 * 3. Criptografia obrigatória (AES-256-GCM) via cryptoUtils.js: nenhuma chave de API salva em texto puro no SQLite.
 * 4. Desencriptação transparente no SELECT e proteção por mascaramento.
 */

import assert from 'assert';
import db, { sqliteDb } from '../server/src/config/database.js';
import { encrypt, decrypt, isEncrypted, maskApiKey, encryptFields, decryptFields } from '../server/src/utils/cryptoUtils.js';
import { 
  getHostMasterSettings, 
  updateHostMasterSettings, 
  getTenantApiConfig, 
  saveTenantApiConfig, 
  listTenantsWithApiStatus 
} from '../server/src/services/apiConfigService.js';

console.log('🧪 Iniciando Testes da Fase 59 — Etapa 1 (Infraestrutura de Dados e Segurança SQLite)...\n');

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

  // ============================================================================
  // BLOCO 1: Utilitário Criptográfico Nativo (cryptoUtils.js)
  // ============================================================================
  console.log('--- 1. Validação de Criptografia Obrigatória (AES-256-GCM) ---');

  await test('Deve encriptar e desencriptar texto com AES-256-GCM e fidelidade total', () => {
    const rawKey = 'sk-proj-versus-secret-token-test-1234567890';
    const cipherText = encrypt(rawKey);

    assert.notStrictEqual(cipherText, rawKey, 'Chave não pode ser igual ao texto em claro');
    assert.strictEqual(isEncrypted(cipherText), true, 'Texto cifrado deve ser identificado por isEncrypted');
    
    // Formato deve ter 3 partes separadas por dois pontos (iv:tag:ciphertext)
    const parts = cipherText.split(':');
    assert.strictEqual(parts.length, 3, 'Formato deve conter IV, AuthTag e CipherText');

    const recovered = decrypt(cipherText);
    assert.strictEqual(recovered, rawKey, 'Chave desencriptada deve coincidir com a original');
  });

  await test('Duas encriptações da mesma chave devem produzir ciphertexts diferentes (IV aleatório)', () => {
    const rawKey = 'test-repeat-key';
    const c1 = encrypt(rawKey);
    const c2 = encrypt(rawKey);

    assert.notStrictEqual(c1, c2, 'Ciphers devem ser distintos por conterem IVs aleatórios');
    assert.strictEqual(decrypt(c1), rawKey);
    assert.strictEqual(decrypt(c2), rawKey);
  });

  await test('Deve rejeitar ou falhar com segurança se o ciphertext for adulterado (Auth Tag Tamper Check)', () => {
    const rawKey = 'sensitive-token-123';
    const cipherText = encrypt(rawKey);
    const [iv, tag, data] = cipherText.split(':');
    
    // Adulterando o último caractere do dado cifrado
    const corruptedData = data.slice(0, -2) + (data.endsWith('0') ? '1' : '0');
    const corruptedCipher = `${iv}:${tag}:${corruptedData}`;

    assert.throws(() => {
      decrypt(corruptedCipher);
    }, /FAILED_TO_DECRYPT_CREDENTIAL/, 'Deve lançar erro ao detectar adulteração de dados');
  });

  await test('Deve mascarar chaves de API para logs e visualização segura na UI', () => {
    const key1 = 'sk-proj-abcde12345';
    assert.strictEqual(maskApiKey(key1), 'sk-p••••2345');

    const key2 = 'EAABabcd1234';
    assert.strictEqual(maskApiKey(key2), 'EAAB••••1234');

    const shortKey = '1234';
    assert.strictEqual(maskApiKey(shortKey), '••••••••');
  });

  // ============================================================================
  // BLOCO 2: Tabela Master (super_admin_settings)
  // ============================================================================
  console.log('\n--- 2. Tabela Master (super_admin_settings) ---');

  await test('Tabela super_admin_settings deve existir com todas as 4 colunas de chaves', () => {
    const cols = sqliteDb.prepare("PRAGMA table_info(super_admin_settings)").all();
    const colNames = cols.map(c => c.name);

    assert.ok(colNames.includes('id'), 'Falta coluna id');
    assert.ok(colNames.includes('master_openai_key'), 'Falta coluna master_openai_key');
    assert.ok(colNames.includes('master_meta_app_id'), 'Falta coluna master_meta_app_id');
    assert.ok(colNames.includes('master_meta_token'), 'Falta coluna master_meta_token');
    assert.ok(colNames.includes('master_bureau_key'), 'Falta coluna master_bureau_key');
  });

  await test('Persistência e recuperação de chaves mestre: NENHUMA chave em texto puro no SQLite', async () => {
    const testOpenai = 'sk-master-openai-host-2026';
    const testMetaAppId = '123456789987654';
    const testMetaToken = 'EAAB-master-token-meta-2026';
    const testBureau = 'bureau-master-key-assertiva-2026';

    await updateHostMasterSettings({
      master_openai_key: testOpenai,
      master_meta_app_id: testMetaAppId,
      master_meta_token: testMetaToken,
      master_bureau_key: testBureau
    });

    // 1. Inspeciona a linha crua no SQLite para provar que está encriptada
    const rawRow = sqliteDb.prepare("SELECT * FROM super_admin_settings WHERE id = 'host_master_settings'").get();
    assert.ok(rawRow, 'Linha host_master_settings deve existir');

    assert.notStrictEqual(rawRow.master_openai_key, testOpenai, 'master_openai_key não pode estar em texto puro no banco');
    assert.notStrictEqual(rawRow.master_meta_token, testMetaToken, 'master_meta_token não pode estar em texto puro no banco');
    assert.notStrictEqual(rawRow.master_bureau_key, testBureau, 'master_bureau_key não pode estar em texto puro no banco');

    assert.strictEqual(isEncrypted(rawRow.master_openai_key), true, 'master_openai_key no SQLite deve ser AES-256-GCM');
    assert.strictEqual(isEncrypted(rawRow.master_meta_token), true, 'master_meta_token no SQLite deve ser AES-256-GCM');
    assert.strictEqual(isEncrypted(rawRow.master_bureau_key), true, 'master_bureau_key no SQLite deve ser AES-256-GCM');

    // 2. Inspeciona via serviço para provar desencriptação correta
    const settings = await getHostMasterSettings();
    assert.strictEqual(settings.master_openai_key, testOpenai);
    assert.strictEqual(settings.master_meta_app_id, testMetaAppId);
    assert.strictEqual(settings.master_meta_token, testMetaToken);
    assert.strictEqual(settings.master_bureau_key, testBureau);
  });

  // ============================================================================
  // BLOCO 3: Tabela Tenant (tenant_api_configs)
  // ============================================================================
  console.log('\n--- 3. Tabela Tenant (tenant_api_configs) & Test Drive ---');

  await test('Tabela tenant_api_configs deve existir com colunas de controle e chaves', () => {
    const cols = sqliteDb.prepare("PRAGMA table_info(tenant_api_configs)").all();
    const colNames = cols.map(c => c.name);

    assert.ok(colNames.includes('id'), 'Falta coluna id');
    assert.ok(colNames.includes('tenant_id'), 'Falta coluna tenant_id');
    assert.ok(colNames.includes('openai_key'), 'Falta coluna openai_key');
    assert.ok(colNames.includes('meta_app_id'), 'Falta coluna meta_app_id');
    assert.ok(colNames.includes('meta_token'), 'Falta coluna meta_token');
    assert.ok(colNames.includes('bureau_key'), 'Falta coluna bureau_key');
    assert.ok(colNames.includes('use_master_key'), 'Falta coluna use_master_key');
    assert.ok(colNames.includes('test_drive_expires_at'), 'Falta coluna test_drive_expires_at');
  });

  const testTenantId = 'tenant-test-phase59-security';

  await test('Deve criar automaticamente tenant_api_configs com use_master_key=1 e prazo de 7 dias', async () => {
    // Garante tenant pai na tabela tenants
    sqliteDb.prepare(`
      INSERT OR IGNORE INTO tenants (id, name, plan, status)
      VALUES (?, 'Empresa Test Drive Segurança', 'ENTERPRISE', 'ACTIVE')
    `).run(testTenantId);

    const config = await getTenantApiConfig(testTenantId);
    assert.strictEqual(config.tenant_id, testTenantId);
    assert.strictEqual(config.use_master_key, true, 'Novo tenant deve vir com use_master_key = true');
    assert.ok(config.test_drive_expires_at, 'Deve ter data de expiração calculada');

    // Valida se a data calculada está no futuro (~7 dias)
    const expires = new Date(config.test_drive_expires_at);
    const now = new Date();
    const diffDays = (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    assert.ok(diffDays >= 6.5 && diffDays <= 7.5, 'Prazo do Test Drive deve ser de aproximadamente 7 dias');
  });

  await test('Deve encriptar chaves do Tenant no SQLite e recuperá-las desencriptadas', async () => {
    const clientOpenai = 'sk-client-openai-own-key-999';
    const clientMetaApp = '987654321012345';
    const clientMetaToken = 'EAAB-client-custom-token';
    const clientBureau = 'bureau-client-custom-key';
    const customExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

    await saveTenantApiConfig(testTenantId, {
      openai_key: clientOpenai,
      meta_app_id: clientMetaApp,
      meta_token: clientMetaToken,
      bureau_key: clientBureau,
      use_master_key: false,
      test_drive_expires_at: customExpiry
    });

    // 1. Inspeciona a linha crua no SQLite para provar que está encriptada
    const rawTenantRow = sqliteDb.prepare("SELECT * FROM tenant_api_configs WHERE tenant_id = ?").get(testTenantId);
    assert.ok(rawTenantRow);

    assert.notStrictEqual(rawTenantRow.openai_key, clientOpenai, 'openai_key do tenant não pode estar em texto puro');
    assert.notStrictEqual(rawTenantRow.meta_token, clientMetaToken, 'meta_token do tenant não pode estar em texto puro');
    assert.notStrictEqual(rawTenantRow.bureau_key, clientBureau, 'bureau_key do tenant não pode estar em texto puro');

    assert.strictEqual(isEncrypted(rawTenantRow.openai_key), true, 'openai_key no SQLite deve ser AES-256-GCM');
    assert.strictEqual(isEncrypted(rawTenantRow.meta_token), true, 'meta_token no SQLite deve ser AES-256-GCM');
    assert.strictEqual(isEncrypted(rawTenantRow.bureau_key), true, 'bureau_key no SQLite deve ser AES-256-GCM');

    assert.strictEqual(rawTenantRow.use_master_key, 0, 'use_master_key deve estar persistido como 0 no SQLite');

    // 2. Consulta via serviço e valida valores decifrados
    const updatedConfig = await getTenantApiConfig(testTenantId);
    assert.strictEqual(updatedConfig.openai_key, clientOpenai);
    assert.strictEqual(updatedConfig.meta_app_id, clientMetaApp);
    assert.strictEqual(updatedConfig.meta_token, clientMetaToken);
    assert.strictEqual(updatedConfig.bureau_key, clientBureau);
    assert.strictEqual(updatedConfig.use_master_key, false);
    assert.strictEqual(updatedConfig.test_drive_expires_at, customExpiry);
  });

  await test('listTenantsWithApiStatus deve retornar status com chaves mascaradas para o Super Admin', async () => {
    const list = await listTenantsWithApiStatus();
    assert.ok(Array.isArray(list));
    assert.ok(list.length > 0);

    const testTenant = list.find(t => t.tenant_id === testTenantId);
    assert.ok(testTenant, 'Tenant de teste deve estar na listagem');
    assert.strictEqual(testTenant.use_master_key, false);
    assert.strictEqual(testTenant.has_openai_key, true);
    assert.strictEqual(testTenant.has_bureau_key, true);
    assert.strictEqual(testTenant.has_meta_keys, true);

    // Assegura que nenhuma chave vazou desmascarada na listagem
    assert.ok(testTenant.masked_openai_key.includes('••••'), 'A chave da OpenAI deve estar mascarada');
    assert.ok(testTenant.masked_meta_token.includes('••••'), 'O token da Meta deve estar mascarado');
    assert.ok(testTenant.masked_bureau_key.includes('••••'), 'A chave do Bureau deve estar mascarada');
  });

  // Limpeza de teardown do tenant de teste
  try {
    sqliteDb.prepare('DELETE FROM tenant_api_configs WHERE tenant_id = ?').run(testTenantId);
    sqliteDb.prepare('DELETE FROM tenants WHERE id = ?').run(testTenantId);
  } catch (cleanErr) {}

  console.log(`\n🎉 [SUCESSO TOTAL] ${passed}/${total} testes da Fase 59 — Etapa 1 aprovados sem ressalvas!`);
}

runTests().catch(err => {
  console.error('\n❌ Falha na suíte de testes:', err);
  process.exit(1);
});
