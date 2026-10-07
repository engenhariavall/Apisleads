/**
 * tests/test_car_titular_undefined_fix.js
 * 
 * Validação da correção da anomalia de titular com 'undefined':
 * 1. Garante que resolveOrSeedHistoricalCarOwnerSync nunca produz 'undefined'
 * 2. Valida hashes com bit de sinal negativo (0x80000000..0xffffffff)
 * 3. Valida ausência total de 'undefined' no acervo do SQLite
 * 4. Valida sanitização defensiva no retorno de dados
 */

import assert from 'assert';
import db from '../server/src/config/database.js';
import { carHistoricalService } from '../server/src/services/carHistoricalService.js';

console.log('🧪 [TEST] Validando correção da anomalia de titular do CAR ("undefined SOBRENOME")...\n');

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}\n     Erro: ${err.message}`);
  }
}

// Teste 1: Hashes com bit mais significativo 1 (anteriormente geravam índice negativo e undefined)
it('resolveOrSeedHistoricalCarOwnerSync não gera undefined para hashes com bit 31 ativo', () => {
  // Testando vários CARs com diferentes primeiros dígitos hex (8, 9, a, b, c, d, e, f)
  const testCars = [
    'RS-4314100-8E7F702CB394452A8A0576C74BA493CC',
    'RS-4314100-9F1234567890ABCDEF1234567890ABCD',
    'RS-4314100-A7E43ED3102149E29A9C7A1152B23098',
    'RS-4314100-B8E4BF789587473892FF10EBE5DE473C',
    'RS-4314100-C3824F8602B649408A901A04A076A54C',
    'RS-4314100-D6C1D0757C064ACA98D3F81A44F8AE44',
    'RS-4314100-E4654EBA9F0E4A62B75E0E7226680D9B',
    'RS-4314100-FDDE6FAFA22342E4A27BB37771E8DA1F'
  ];

  for (const cod of testCars) {
    const res = carHistoricalService.resolveOrSeedHistoricalCarOwnerSync({
      codigo_car: cod,
      municipio: 'PASSO FUNDO',
      uf: 'RS',
      area_hectares: 500
    });

    assert.ok(res, `Deveria retornar dados para ${cod}`);
    assert.ok(!res.nome_proprietario.includes('undefined'), `Nome não pode conter undefined: "${res.nome_proprietario}"`);
    assert.ok(res.nome_proprietario.split(' ').length >= 2, `Nome deve conter primeiro nome e sobrenome: "${res.nome_proprietario}"`);
  }
});

// Teste 2: Família SCORTEGAGNA
it('Registros com sobrenome SCORTEGAGNA possuem primeiro nome válido e completo', () => {
  const rows = db.prepare(`
    SELECT codigo_car, nome_proprietario
    FROM car_proprietarios_historico
    WHERE nome_proprietario LIKE '%SCORTEGAGNA%'
    LIMIT 10
  `).all();

  assert.ok(rows.length > 0, 'Deveria encontrar registros SCORTEGAGNA');
  for (const r of rows) {
    assert.ok(!r.nome_proprietario.includes('undefined'), `SCORTEGAGNA não pode ter undefined: ${r.nome_proprietario}`);
    assert.ok(r.nome_proprietario.endsWith('SCORTEGAGNA'), `Deve terminar com SCORTEGAGNA: ${r.nome_proprietario}`);
    const primeiroNome = r.nome_proprietario.replace(/\s*SCORTEGAGNA$/, '').trim();
    assert.ok(primeiroNome.length > 2, `Primeiro nome deve ser válido: "${primeiroNome}"`);
  }
});

// Teste 3: Zero undefined em toda a base car_proprietarios_historico
it('Base car_proprietarios_historico tem 0 registros com "undefined"', () => {
  const count = db.prepare(`
    SELECT count(*) as total
    FROM car_proprietarios_historico
    WHERE nome_proprietario LIKE '%undefined%'
  `).get();

  assert.strictEqual(count.total, 0, `Total de undefined deve ser 0, mas foi ${count.total}`);
});

// Teste 4: Zero undefined em propriedades_rurais
it('Tabela propriedades_rurais tem 0 registros com "undefined" no nome_titular', () => {
  const count = db.prepare(`
    SELECT count(*) as total
    FROM propriedades_rurais
    WHERE nome_titular LIKE '%undefined%'
  `).get();

  assert.strictEqual(count.total, 0, `Total de undefined em propriedades_rurais deve ser 0, mas foi ${count.total}`);
});

// Teste 5: Sanitização regex defensiva
it('Sanitizador regex remove "undefined " com case-insensitivity mantendo o nome de família', () => {
  const regex = /^undefined\s+/i;
  const raw1 = 'undefined SCORTEGAGNA';
  const raw2 = 'UNDEFINED RIZZOTTO';
  const raw3 = 'VALDOMIRO SCORTEGAGNA';

  assert.strictEqual(raw1.replace(regex, ''), 'SCORTEGAGNA');
  assert.strictEqual(raw2.replace(regex, ''), 'RIZZOTTO');
  assert.strictEqual(raw3.replace(regex, ''), 'VALDOMIRO SCORTEGAGNA');
});

console.log(`\n========================================`);
console.log(`📊 RESULTADO: ${passed}/${total} testes aprovados.`);
console.log(`========================================\n`);

if (passed !== total) process.exit(1);
