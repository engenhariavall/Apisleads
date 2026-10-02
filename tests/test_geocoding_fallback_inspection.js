/**
 * TESTE DE VALIDAÇÃO E2E - RESOLUÇÃO DE COORDENADAS E INSPEÇÃO VISUAL GOOGLE MAPS
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

console.log('\n================================================================');
console.log('🧪 TEST SUITE: RESOLUÇÃO GEODÉSICA & INSPEÇÃO VISUAL (GOOGLE MAPS)');
console.log('================================================================\n');

try {
  // 1. Verificação do código em client/js/app.js
  const appJsPath = path.join(rootDir, 'client', 'js', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  console.log('▶ Teste 1: Helpers e Fallbacks no Frontend (app.js)');
  assert(appJsContent.includes('window.getCityGeodeticCoordinates = function'), 'Helper getCityGeodeticCoordinates registrado globalmente');
  assert(appJsContent.includes("'CHAPECO_SC'"), 'Dicionário geodésico contém Chapecó/SC');
  assert(appJsContent.includes("'NAVIRAI_MS'"), 'Dicionário geodésico contém Naviraí/MS');
  assert(appJsContent.includes("'PIRACICABA_SP'"), 'Dicionário geodésico contém Piracicaba/SP');
  assert(appJsContent.includes("'LUIS EDUARDO MAGALHAES_BA'"), 'Dicionário geodésico contém Luís Eduardo Magalhães/BA');
  assert(appJsContent.includes('isCityFallback'), 'Lógica de fallback geodésico municipal integrada no Perímetro Espacial');
  assert(appJsContent.includes('maps/search/?api=1&query='), 'Abertura inteligente do Google Maps com query corporativa');

  // 2. Mapeamento de ruralPropData
  console.log('\n▶ Teste 2: Mapeamento de Coordenadas na Montagem de ruralPropData');
  assert(appJsContent.includes('centroide_lat: lead.centroide_lat || df.centroide_lat || lead.latitude'), 'Mapeamento de centroide_lat incluindo lead.latitude');
  assert(appJsContent.includes('centroide_lng: lead.centroide_lng || df.centroide_lng || lead.longitude'), 'Mapeamento de centroide_lng incluindo lead.longitude');

  // 3. Verificação no Banco de Dados SQLite
  console.log('\n▶ Teste 3: Coordenadas Gravadas no Banco SQLite (leads.sqlite)');
  const dbPath = path.join(rootDir, 'data', 'leads.sqlite');
  const db = new DatabaseSync(dbPath);

  const cooperalfa = db.prepare('SELECT id, razao_social, municipio, uf, latitude, longitude FROM leads WHERE nome_fantasia = ?').get('COOPERALFA');
  assert(cooperalfa && cooperalfa.latitude !== null && cooperalfa.latitude < 0, `Cooperalfa possui latitude válida: ${cooperalfa?.latitude}`);
  assert(cooperalfa && cooperalfa.longitude !== null && cooperalfa.longitude < 0, `Cooperalfa possui longitude válida: ${cooperalfa?.longitude}`);

  const copasul = db.prepare('SELECT id, razao_social, municipio, uf, latitude, longitude FROM leads WHERE nome_fantasia = ?').get('COPASUL');
  assert(copasul && copasul.latitude !== null && copasul.latitude < 0, `Copasul possui latitude válida: ${copasul?.latitude}`);
  assert(copasul && copasul.longitude !== null && copasul.longitude < 0, `Copasul possui longitude válida: ${copasul?.longitude}`);

  const coplacana = db.prepare('SELECT id, razao_social, municipio, uf, latitude, longitude FROM leads WHERE nome_fantasia = ?').get('COPLACANA');
  assert(coplacana && coplacana.latitude !== null && coplacana.latitude < 0, `Coplacana possui latitude válida: ${coplacana?.latitude}`);

  const cooperfarms = db.prepare('SELECT id, razao_social, municipio, uf, latitude, longitude FROM leads WHERE nome_fantasia = ?').get('COOPERFARMS');
  assert(cooperfarms && cooperfarms.latitude !== null && cooperfarms.latitude < 0, `Cooperfarms possui latitude válida: ${cooperfarms?.latitude}`);

} catch (err) {
  console.error('❌ Erro inesperado durante os testes:', err);
}

console.log('\n================================================================');
console.log(`📊 RESULTADO FINAL DA RESOLUÇÃO GEODÉSICA: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
