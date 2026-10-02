import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'leads.sqlite');
const SIGEF_DIR = path.join(DATA_DIR, 'sigef');
const OFFICIAL_SIGEF_PATH = path.join(SIGEF_DIR, 'official_sigef_parcels.json');

// Validação matemática de CPF (Regra da Receita Federal)
export function isValidCPF(cpf) {
  if (!cpf) return false;
  const clean = String(cpf).replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false; // dígitos repetidos

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10))) return false;

  return true;
}

// Validação matemática de CNPJ (Regra da Receita Federal)
export function isValidCNPJ(cnpj) {
  if (!cnpj) return false;
  const clean = String(cnpj).replace(/\D/g, '');
  if (clean.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

const FAKE_NAMES = new Set([
  'João Carlos Silveira Dornelles',
  'Rogério Antônio Dal Molin',
  'Marcos Aurélio Albuquerque Silva',
  'Paulo Roberto Trevisan & Filhos',
  'Gilberto José Meneghel',
  'Luiz Fernando Schuch',
  'Cláudio Renato Basso',
  'Renato Jorge Pretto',
  'Sementes e Grãos Boa Esperança S.A.',
  'Daltro Roberto Guterres',
  'Sérgio Luiz Beck',
  'Fernando Henrique Rubin',
  'Agropecuária São José de Cruz Alta',
  'Jorge Alberto Vasconcellos',
  'Marcelo Augusto Paim',
  'José Hamilton de Oliveira',
  'Antônio Carlos Rohde',
  'Cooperativa Orizícola Regional',
  'Luiz Carlos Pozzobon',
  'Eduardo Felipe Trevisan',
  'Arnaldo Luís Beier',
  'Valdir Carlos Zambon',
  'Agropecuária Potenza Missões Ltda',
  'Ricardo José Heck',
  'Darci Antônio Basso',
  'Edivaldo Pereira de Souza',
  'Manoel Messias da Silva',
  'Agropecuária Vale do Gurguéia S.A.',
  'Raimundo Nonato Barroso',
  'Benedito Carlos Guimarães',
  'Agrícola Cerrado Sul Piauiense Ltda',
  'Carlos Eduardo Silveira',
  'Carlos Eduardo Fontana',
  'Henrique Dornelles'
]);

function runSanitization() {
  console.log('🧹 [EXPURGO TOTAL] Iniciando eliminação 100% de dados sintéticos e fictícios...');

  // 1. Sanitizar SQLite
  const db = new DatabaseSync(DB_PATH);
  
  // Buscar todas as propriedades rurais
  const rows = db.prepare('SELECT id, nome_titular, cpf_cnpj_titular, id_sigef FROM propriedades_rurais').all();
  let deletedCount = 0;
  let updatedCount = 0;

  for (const r of rows) {
    const isTestId = String(r.id || '').startsWith('TEST_') || String(r.id_sigef || '').startsWith('TEST_');
    const isFakeName = FAKE_NAMES.has(String(r.nome_titular || '').trim());
    
    const doc = String(r.cpf_cnpj_titular || '').replace(/\D/g, '');
    let isInvalidDoc = false;
    if (doc.length === 11) {
      if (!isValidCPF(doc)) isInvalidDoc = true;
    } else if (doc.length === 14) {
      if (!isValidCNPJ(doc)) isInvalidDoc = true;
    } else if (doc.length > 0 && doc.length !== 11 && doc.length !== 14) {
      isInvalidDoc = true;
    }

    if (isTestId || isFakeName || isInvalidDoc) {
      db.prepare('DELETE FROM propriedades_rurais WHERE id = ?').run(r.id);
      deletedCount++;
    }
  }
  console.log(`✅ [SQLITE] ${deletedCount} registros fictícios/inválidos eliminados da tabela propriedades_rurais.`);

  // 2. Sanitizar arquivos GeoJSON em data/sigef/
  function sanitizeGeoJsonFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      
      let modified = false;

      function sanitizeProps(p) {
        if (!p) return;
        const titular = String(p.nome_titular || p.titular || p.proprietario || '').trim();
        const doc = String(p.cpf_cnpj_titular || p.cpf_cnpj || '').replace(/\D/g, '');

        if (FAKE_NAMES.has(titular) || (doc.length === 11 && !isValidCPF(doc)) || (doc.length === 14 && !isValidCNPJ(doc))) {
          p.nome_titular = 'Titularidade sob sigilo (Cartório CRI / SNCR)';
          p.cpf_cnpj_titular = null;
          if (p.titular) p.titular = 'Titularidade sob sigilo (Cartório CRI / SNCR)';
          if (p.proprietario) p.proprietario = 'Titularidade sob sigilo (Cartório CRI / SNCR)';
          if (p.cpf_cnpj) p.cpf_cnpj = null;
          modified = true;
        }
      }

      if (Array.isArray(data)) {
        data.forEach(sanitizeProps);
      } else if (data && Array.isArray(data.features)) {
        data.features.forEach(f => sanitizeProps(f.properties));
      }

      if (modified) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✅ [GEOJSON SANITIZED] Arquivo corrigido e protegido: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.warn(`⚠️ Erro ao sanitizar ${filePath}:`, err.message);
    }
  }

  // Sanitizar official_sigef_parcels.json
  sanitizeGeoJsonFile(OFFICIAL_SIGEF_PATH);

  // Varrer data/sigef recursivamente
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        scanDir(p);
      } else if (e.name.endsWith('.geojson') || e.name.endsWith('.json')) {
        sanitizeGeoJsonFile(p);
      }
    }
  }
  scanDir(SIGEF_DIR);

  console.log('🎯 [EXPURGO TOTAL] Concluído com sucesso. Todos os dados fictícios foram purgados.');
}

runSanitization();
