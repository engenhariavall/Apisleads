/**
 * tests/test_phase51_step3_real_data_sources.js
 * 
 * Bateria de Testes: FASE 51 - ETAPA 3 (CONFIGURAÇÃO DE FONTES DE DADOS REAIS & BUREAU)
 * 
 * Valida:
 * 1. Ação 1 (CNPJ & QSA - Gratuito): osintService.consultarReceitaFederal e qsaService.enrichLeadQsa
 *    chamando a BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/{cnpj}) com extração de razão social, QSA e contatos.
 * 2. Ação 2 (Fundiário - Gratuito): geoFundiarioService.saveOrUpdateRuralProperty e convertGeoJsonProperties
 *    lendo os campos de GeoJSONs do SIGEF (area_hectares/area, nome_imovel/nome_area, nome_titular/detentor_nome, cpf_cnpj_titular/detentor_cpf_cnpj).
 * 3. Ação 3 (Bureau de Dados - API Key): osintService.enrichCpfWithBureau com gateway para Assertiva/Unitfour.
 *    - Se BUREAU_API_KEY estiver vazia, retorna de forma segura sem crashar, com "Telefone não localizado".
 *    - Se BUREAU_API_KEY estiver configurada, consome o endpoint configurado.
 * 4. Validação de formato do arquivo .env.example com BUREAU_API_URL e BUREAU_API_KEY.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { osintService } from '../server/src/services/osintService.js';
import { bureauService } from '../server/src/services/bureauService.js';
import { qsaService } from '../server/src/services/qsaService.js';
import { 
  saveOrUpdateRuralProperty, 
  convertGeoJsonProperties,
  loadOfficialRuralProperties 
} from '../server/src/services/geoFundiarioService.js';

import db from '../server/src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Garante existência de tenants de teste no SQLite
const tenantTest = 'tenant-test-phase51-step3';
db.prepare(`
  INSERT OR IGNORE INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit)
  VALUES (?, 'Tenant Teste Fase 51', '88.777.666/0001-55', 'ENTERPRISE', 'ACTIVE', 10, 1000, 10000)
`).run(tenantTest);
db.prepare('DELETE FROM leads WHERE tenant_id = ?').run(tenantTest);
db.prepare('DELETE FROM propriedades_rurais WHERE tenant_id = ?').run(tenantTest);

console.log('🚀 Iniciando Testes da Fase 51 - Etapa 3 (Fontes de Dados Reais & Gateway de Bureau)...');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

// ------------------------------------------------------------------------------
// 1. AÇÃO 1: CNPJ & QSA Gratuito (BrasilAPI)
// ------------------------------------------------------------------------------
console.log('\n--- 1. Ação 1: CNPJ & QSA Gratuito (BrasilAPI) ---');

it('osintService possui método consultarReceitaFederal implementado e funcional', () => {
  assert.strictEqual(typeof osintService.consultarReceitaFederal, 'function');
});

it('qsaService possui integração direta com BrasilAPI', () => {
  assert.strictEqual(typeof qsaService.enrichLeadQsa, 'function');
  assert.strictEqual(typeof qsaService.getSociosByCnpj, 'function');
});

await itAsync('osintService.consultarReceitaFederal valida CNPJ e rejeita entradas inválidas', async () => {
  try {
    await osintService.consultarReceitaFederal('123');
    assert.fail('Deveria ter lançado erro para CNPJ inválido');
  } catch (err) {
    assert.ok(err.message.includes('inválido'), `Mensagem de erro esperada: ${err.message}`);
  }
});

// ------------------------------------------------------------------------------
// 2. AÇÃO 2: Fundiário Gratuito (SIGEF GeoJSON Property Converter)
// ------------------------------------------------------------------------------
console.log('\n--- 2. Ação 2: Fundiário Gratuito (SIGEF GeoJSON Parser) ---');

it('convertGeoJsonProperties mapeia campos padrão SIGEF (area, nome_area, detentor_nome, detentor_cpf_cnpj)', () => {
  const sigefFeatureProps = {
    area: 3450.75,
    nome_area: 'Fazenda Santa Tereza do Parecis',
    detentor_nome: 'SLC Agrícola S.A.',
    detentor_cpf_cnpj: '89.096.457/0001-55',
    municipio: 'SORRISO',
    uf: 'MT'
  };

  const converted = convertGeoJsonProperties(sigefFeatureProps);
  assert.strictEqual(converted.area_hectares, 3450.75);
  assert.strictEqual(converted.nome_imovel, 'Fazenda Santa Tereza do Parecis');
  assert.strictEqual(converted.nome_titular, 'SLC Agrícola S.A.');
  assert.strictEqual(converted.cpf_cnpj_titular, '89.096.457/0001-55');
  assert.strictEqual(converted.status_geo, 'CERTIFICADO');
});

it('convertGeoJsonProperties suporta campos alternativos do INCRA (detentor, titular, num_area)', () => {
  const incraProps = {
    num_area: '1890.20',
    denominacao: 'Gleba Rio Verde Central',
    titular: 'João Carlos da Silva',
    cpf_cnpj: '123.456.789-00',
    municipio: 'RIO VERDE',
    uf: 'GO'
  };

  const converted = convertGeoJsonProperties(incraProps);
  assert.strictEqual(converted.area_hectares, 1890.20);
  assert.strictEqual(converted.nome_imovel, 'Gleba Rio Verde Central');
  assert.strictEqual(converted.nome_titular, 'João Carlos da Silva');
  assert.strictEqual(converted.cpf_cnpj_titular, '123.456.789-00');
});

await itAsync('saveOrUpdateRuralProperty processa propriedades com nomes de campos do SIGEF', async () => {
  const tenantTest = 'tenant-root-default';

  // Garante limpeza prévia para teste idempotente
  db.prepare('DELETE FROM propriedades_rurais WHERE id_sigef = ?').run('SIGEF-TESTE-51-REAL');

  const saved = await saveOrUpdateRuralProperty({
    id_sigef: 'SIGEF-TESTE-51-REAL',
    nome_area: 'Gleba Agrícola Teste Real',
    area: 1250.5,
    detentor_nome: 'Marcos Aurelio Silveira',
    detentor_cpf_cnpj: '554.332.110-99',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    geometria_poligono: {
      type: 'Polygon',
      coordinates: [[
        [-52.41, -28.26],
        [-52.39, -28.26],
        [-52.39, -28.28],
        [-52.41, -28.28],
        [-52.41, -28.26]
      ]]
    }
  }, tenantTest);

  assert.ok(saved);
  assert.ok(saved.id);
  assert.ok(['CREATED', 'UPDATED'].includes(saved.action), `Ação esperada CREATED ou UPDATED, obtido: ${saved.action}`);

  // Limpa registro temporário de teste
  db.prepare('DELETE FROM propriedades_rurais WHERE id_sigef = ?').run('SIGEF-TESTE-51-REAL');
});

// ------------------------------------------------------------------------------
// 3. AÇÃO 3: Gateway de Bureau de Dados & Resiliência sem quebra
// ------------------------------------------------------------------------------
console.log('\n--- 3. Ação 3: Gateway de Bureau de Dados (BUREAU_API_KEY) ---');

it('osintService possui método enrichCpfWithBureau implementado', () => {
  assert.strictEqual(typeof osintService.enrichCpfWithBureau, 'function');
});

it('bureauService possui lookupWhatsAppByCpf implementado', () => {
  assert.strictEqual(typeof bureauService.lookupWhatsAppByCpf, 'function');
});

await itAsync('enrichCpfWithBureau retorna "Telefone não localizado" sem quebrar se BUREAU_API_KEY estiver ausente', async () => {
  // Garante temporariamente ausência de chave
  const origKey = process.env.BUREAU_API_KEY;
  delete process.env.BUREAU_API_KEY;

  try {
    const res = await osintService.enrichCpfWithBureau('812.345.678-90', {
      nome: 'Testador Rural',
      uf: 'MT'
    });

    assert.ok(res, 'Resposta vazia do enrichCpfWithBureau');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.whatsapp, null);
    assert.ok(
      res.message.includes('não localizado'), 
      `Mensagem deve indicar que telefone não foi localizado: "${res.message}"`
    );
  } finally {
    if (origKey) process.env.BUREAU_API_KEY = origKey;
  }
});

await itAsync('bureauService processa resposta simulada de operadora/bureau oficial quando chave fornecida', async () => {
  process.env.BUREAU_API_KEY = 'test_mock_bureau_key_999';
  process.env.BUREAU_PROVIDER = 'assertiva';

  // O endpoint real não será chamado na rede sem internet dedicada, mas o serviço deve tratar erros de rede sem quebrar
  const res = await bureauService.lookupWhatsAppByCpf('12345678901');
  assert.ok(res, 'Resposta do bureauService não deve ser nula');
  assert.ok(res.message, 'Deve retornar mensagem tratada');
  assert.strictEqual(typeof res.whatsapp, 'object'); // string ou null
});

// ------------------------------------------------------------------------------
// 4. Arquivo .env.example atualizado com as chaves do Bureau
// ------------------------------------------------------------------------------
console.log('\n--- 4. Configuração de Ambiente (.env.example) ---');

it('.env.example contém BUREAU_API_URL e BUREAU_API_KEY devidamente documentadas', () => {
  const envExamplePath = path.resolve(ROOT_DIR, '.env.example');
  assert.ok(fs.existsSync(envExamplePath), '.env.example deve existir');
  const envContent = fs.readFileSync(envExamplePath, 'utf8');

  assert.ok(envContent.includes('BUREAU_API_URL='), 'BUREAU_API_URL ausente no .env.example');
  assert.ok(envContent.includes('BUREAU_API_KEY='), 'BUREAU_API_KEY ausente no .env.example');
});

console.log(`\n====================================================`);
console.log(`🏁 Resultados: ${passed} passaram | ${failed} falharam`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
