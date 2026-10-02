import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import db from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../data');

/**
 * Normaliza e formata CNPJ: garante 14 dígitos e máscara 00.000.000/0000-00
 */
function normalizeCnpj(input) {
  if (!input) return { formatted: '', raw: '' };
  const digits = String(input).replace(/\D/g, '').padStart(14, '0').slice(-14);
  const formatted = digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return { formatted, raw: digits };
}

/**
 * Normaliza Capital Social para formato numérico (float)
 */
function normalizeCapitalSocial(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  let str = String(val).trim();
  // Trata formato brasileiro R$ 1.500.000,50
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const num = parseFloat(str.replace(/[^\d.-]/g, ''));
  return isNaN(num) ? 0 : num;
}

/**
 * Normaliza Porte da Empresa
 */
function normalizePorte(val, razaoSocial = '') {
  const str = String(val || '').toUpperCase().trim();
  const razao = String(razaoSocial || '').toUpperCase();

  if (str.includes('MEI') || razao.includes(' MEI') || razao.endsWith(' MEI')) return 'MEI';
  if (str.includes('EPP') || razao.includes(' EPP') || razao.endsWith(' EPP')) return 'EPP';
  if (str.includes('ME') || str.includes('MICRO') || razao.includes(' ME') || razao.endsWith(' ME')) return 'ME';
  return 'DEMAIS';
}

/**
 * Normaliza Telefone com DDD e extrai dígitos limpos
 */
function normalizePhone(phone) {
  if (!phone) return { formatted: null, sanitized: null };
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 8) return { formatted: null, sanitized: null };

  let clean = digits;
  // Se veio com DDI 55
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    clean = clean.slice(2);
  }

  let formatted = phone;
  if (clean.length === 11) {
    formatted = `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  } else if (clean.length === 10) {
    formatted = `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }

  return { formatted, sanitized: clean };
}

/**
 * Classificador da Matriz de ICP (Comprador BUYER vs Fornecedor SUPPLIER)
 * 1. Consulta a tabela segment_cnaes no SQLite
 * 2. Aplica heurística semântica baseada nas atividades econômicas
 */
const selectCnaeStmt = db.prepare('SELECT target_type FROM segment_cnaes WHERE cnae_code = ? LIMIT 1');

export function classifyTargetType(cnaeCode, cnaeDesc = '') {
  // 1. Busca exata no banco de dados de segmentos
  if (cnaeCode) {
    const row = selectCnaeStmt.get(cnaeCode);
    if (row && row.target_type) {
      return row.target_type;
    }
  }

  // 2. Classificação Heurística Semântica por Nomenclatura e Código CNAE
  const desc = (cnaeDesc || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const code = (cnaeCode || '').replace(/\D/g, '');

  // Fornecedores / Fabricantes / Revendas / Concorrentes (SUPPLIER)
  if (
    desc.includes('fabricacao') ||
    desc.includes('comercio atacadista') ||
    desc.includes('revenda') ||
    desc.includes('distribuicao') ||
    desc.includes('manutencao e reparacao') ||
    desc.includes('locacao de maquinas') ||
    desc.includes('laboratorios de analises') ||
    desc.includes('consultoria') ||
    code.startsWith('2833') || // Máquinas agrícolas
    code.startsWith('4683') || // Atacado defensivos
    code.startsWith('4679') || // Atacado construção
    code.startsWith('3314')    // Manutenção máquinas
  ) {
    return 'SUPPLIER';
  }

  // Compradores / Produtores / Clientes Finais (BUYER)
  if (
    desc.includes('cultivo') ||
    desc.includes('criacao') ||
    desc.includes('producao') ||
    desc.includes('ambulatorial') ||
    desc.includes('consultorio') ||
    desc.includes('odontolog') ||
    desc.includes('clinica') ||
    desc.includes('construcao de edificios') ||
    desc.includes('obras') ||
    desc.includes('reforma') ||
    desc.includes('servicos advocaticios') ||
    desc.includes('atividades de contabilidade') ||
    code.startsWith('011') || // Cultivos agrícolas (soja, milho, cana)
    code.startsWith('015') || // Pecuária
    code.startsWith('412') || // Construtoras
    code.startsWith('863') || // Clínicas médicas e odontológicas
    code.startsWith('691')    // Escritórios advocacia
  ) {
    return 'BUYER';
  }

  // Padrão de segurança: BUYER
  return 'BUYER';
}

/**
 * Parser de linhas CSV com suporte a delimitadores , e ; e aspas duplas
 */
function parseCsv(content) {
  const cleanContent = content.replace(/^\uFEFF/, '').trim();
  const lines = cleanContent.split(/\r?\n/);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  function parseLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const rawHeaders = parseLine(lines[0]);
  const normalizeHeaderKey = (h) => {
    const s = h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    if (s.includes('cnpj') || s.includes('documento')) return 'cnpj';
    if (s.includes('fantasia')) return 'nome_fantasia';
    if (s.includes('razao') || s.includes('nome')) return 'razao_social';
    if (s.includes('cnaecod') || s.includes('codigocnae') || s.includes('cnaeprincipalcodigo')) return 'cnae_codigo';
    if (s.includes('cnaedesc') || s.includes('cnaeprincipal') || s.includes('cnaeprincipaldescricao')) return 'cnae_desc';
    if (s.includes('porte')) return 'porte';
    if (s.includes('capitalsocial') || s.includes('capital')) return 'capital_social';
    if (s.includes('logradouro') || s.includes('endereco') || s.includes('rua')) return 'logradouro';
    if (s.includes('numero')) return 'numero';
    if (s.includes('bairro')) return 'bairro';
    if (s.includes('cep')) return 'cep';
    if (s.includes('municipio') || s.includes('cidade')) return 'municipio';
    if (s.includes('uf') || s.includes('estado')) return 'uf';
    if (s.includes('telefone') || s.includes('fone') || s.includes('celular') || s.includes('whatsapp')) return 'telefone';
    if (s.includes('email') || s.includes('correio')) return 'email';
    return s;
  };

  const headers = rawHeaders.map(normalizeHeaderKey);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;
    const values = parseLine(rawLine);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(obj);
  }

  return rows;
}

/**
 * Consulta CNPJ oficial em API pública (BrasilAPI com fallback para MinhaReceita)
 */
async function fetchCnpjFromBrasilApi(rawCnpj) {
  const digits = rawCnpj.replace(/\D/g, '');
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  };

  // Tentativa 1: BrasilAPI
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { 
      signal: controller.signal, 
      headers 
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return {
        cnpj: data.cnpj,
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia || '',
        cnae_codigo: data.cnae_fiscal ? `${data.cnae_fiscal.toString().padStart(7, '0').slice(0, 4)}-${data.cnae_fiscal.toString().padStart(7, '0').slice(4, 5)}/${data.cnae_fiscal.toString().padStart(7, '0').slice(5)}` : '0000-0/00',
        cnae_desc: data.cnae_fiscal_descricao || '',
        porte: data.porte || 'DEMAIS',
        capital_social: data.capital_social || 0,
        logradouro: data.logradouro || '',
        numero: data.numero || '',
        bairro: data.bairro || '',
        cep: data.cep || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        telefone: data.ddd_telefone_1 ? `(${data.ddd_telefone_1.slice(0, 2)}) ${data.ddd_telefone_1.slice(2)}` : '',
        email: data.email || ''
      };
    }
  } catch (e) {
    // Prossegue para o fallback
  }

  // Tentativa 2 (Fallback): MinhaReceita API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://minhareceita.org/${digits}`, { 
      signal: controller.signal, 
      headers 
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return {
        cnpj: data.cnpj,
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia || '',
        cnae_codigo: data.cnae_fiscal ? `${data.cnae_fiscal.toString().padStart(7, '0').slice(0, 4)}-${data.cnae_fiscal.toString().padStart(7, '0').slice(4, 5)}/${data.cnae_fiscal.toString().padStart(7, '0').slice(5)}` : '0000-0/00',
        cnae_desc: data.cnae_fiscal_descricao || '',
        porte: data.porte || 'DEMAIS',
        capital_social: data.capital_social || 0,
        logradouro: data.logradouro || '',
        numero: data.numero || '',
        bairro: data.bairro || '',
        cep: data.cep || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        telefone: data.ddd_telefone_1 ? `(${data.ddd_telefone_1.slice(0, 2)}) ${data.ddd_telefone_1.slice(2)}` : '',
        email: data.email || ''
      };
    }
  } catch (err) {
    throw new Error(`Falha na consulta do CNPJ nas APIs públicas: ${err.message}`);
  }

  throw new Error(`Não foi possível consultar os dados do CNPJ ${digits} nas APIs públicas.`);
}

/**
 * Função Principal de Ingestão de Dados Reais
 */
export async function importRealData(options = {}) {
  const startTime = Date.now();
  console.log('\n🚀 ============================================================');
  console.log('📦 INGESTÃO DE DADOS REAIS — API LEADS ENGINE');
  console.log('============================================================\n');

  if (options.clean) {
    console.log('🧹 Limpando registros de leads anteriores conforme flag --clean...');
    db.exec('DELETE FROM leads;');
    console.log('✅ Tabela leads limpa com sucesso.\n');
  }

  let rawLeads = [];

  // Modo 1: Consulta Online de CNPJs fornecidos
  if (options.cnpjs && options.cnpjs.length > 0) {
    console.log(`🌐 Modo Consulta Online Ativo para ${options.cnpjs.length} CNPJ(s)...`);
    for (const cnpj of options.cnpjs) {
      process.stdout.write(`   ↳ Consultando CNPJ ${cnpj}... `);
      try {
        const lead = await fetchCnpjFromBrasilApi(cnpj);
        rawLeads.push(lead);
        console.log(`✅ [${lead.razao_social}]`);
      } catch (err) {
        console.log(`⚠️ Falha: ${err.message}`);
      }
      // Rate limit amigável
      await new Promise(r => setTimeout(r, 600));
    }
  } 
  // Modo 2: Importação de Arquivo Local (CSV ou JSON)
  else if (options.file) {
    const filePath = path.resolve(process.cwd(), options.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }

    console.log(`📁 Lendo arquivo local: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf-8');

    if (filePath.endsWith('.json')) {
      rawLeads = JSON.parse(content);
    } else {
      rawLeads = parseCsv(content);
    }
    console.log(`📑 Total de registros lidos no arquivo: ${rawLeads.length}`);
  } 
  // Modo 3: Amostra Real Curada Padrão
  else {
    const samplePath = path.join(DATA_DIR, 'sample_real_leads.json');
    if (!fs.existsSync(samplePath)) {
      throw new Error(`Arquivo de amostra não encontrado em: ${samplePath}`);
    }
    console.log(`💎 Carregando catálogo curado de empresas reais: ${samplePath}`);
    rawLeads = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
    console.log(`📑 Total de empresas reais na amostra: ${rawLeads.length}`);
  }

  if (rawLeads.length === 0) {
    console.log('⚠️ Nenhum registro válido para importar.');
    return { imported: 0, buyers: 0, suppliers: 0 };
  }

  // Preparação da Inserção em Lote no SQLite WAL
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO leads (
      id, cnpj, cnpj_raw, razao_social, nome_fantasia,
      cnae_principal_codigo, cnae_principal_descricao, cnaes_secundarios,
      natureza_juridica, porte, capital_social, target_type,
      logradouro, numero, bairro, cep, municipio, uf,
      telefone, telefone_sanitized, email
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  let countSuccess = 0;
  let countBuyers = 0;
  let countSuppliers = 0;

  console.log('\n⚙️ Processando normalização cadastral e Matriz de ICP...');
  db.exec('BEGIN TRANSACTION;');

  try {
    for (const item of rawLeads) {
      const { formatted: cnpjFormatted, raw: cnpjRaw } = normalizeCnpj(item.cnpj);
      if (!cnpjRaw || cnpjRaw.length !== 14) continue;

      const razaoSocial = String(item.razao_social || '').trim().toUpperCase();
      if (!razaoSocial) continue;

      const nomeFantasia = item.nome_fantasia ? String(item.nome_fantasia).trim().toUpperCase() : null;
      const cnaeCode = item.cnae_codigo || item.cnae_principal_codigo || '0000-0/00';
      const cnaeDesc = item.cnae_desc || item.cnae_principal_descricao || 'Atividade econômica não informada';

      // Aplicação da Matriz Estratégica de ICP (Comprador vs Fornecedor)
      const targetType = classifyTargetType(cnaeCode, cnaeDesc);
      if (targetType === 'BUYER') countBuyers++;
      else countSuppliers++;

      const porte = normalizePorte(item.porte, razaoSocial);
      const capitalSocial = normalizeCapitalSocial(item.capital_social);
      const { formatted: telFormatted, sanitized: telSanitized } = normalizePhone(item.telefone);
      const emailClean = item.email ? String(item.email).trim().toLowerCase() : null;
      const ufClean = item.uf ? String(item.uf).trim().toUpperCase().slice(0, 2) : 'PR';
      const municipioClean = item.municipio ? String(item.municipio).trim() : 'Não informado';

      const id = crypto.randomUUID();

      insertStmt.run(
        id,
        cnpjFormatted,
        cnpjRaw,
        razaoSocial,
        nomeFantasia,
        cnaeCode,
        cnaeDesc,
        JSON.stringify([]),
        item.natureza_juridica || null,
        porte,
        capitalSocial,
        targetType,
        item.logradouro || null,
        item.numero || null,
        item.bairro || null,
        item.cep ? String(item.cep).replace(/\D/g, '') : null,
        municipioClean,
        ufClean,
        telFormatted,
        telSanitized,
        emailClean
      );

      countSuccess++;
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('❌ Erro na transação de banco de dados:', err);
    throw err;
  }

  const durationMs = Date.now() - startTime;

  console.log('\n============================================================');
  console.log(`✅ INGESTÃO CONCLUÍDA COM SUCESSO EM ${durationMs}ms!`);
  console.log(`📊 Total de empresas reais inseridas/atualizadas: ${countSuccess}`);
  console.log(`   🎯 Compradores Finais (ICP BUYER): ${countBuyers}`);
  console.log(`   🏢 Fornecedores / Revendas (SUPPLIER): ${countSuppliers}`);
  console.log('⚡ Índices B-Tree sincronizados. Pronto para consultas no Painel!');
  console.log('============================================================\n');

  return { imported: countSuccess, buyers: countBuyers, suppliers: countSuppliers, durationMs };
}

// Execução via Linha de Comando (CLI)
if (process.argv[1]?.endsWith('import_real_data.js')) {
  const args = process.argv.slice(2);
  const options = {
    clean: args.includes('--clean'),
    sampleReal: args.includes('--sample-real'),
    file: null,
    cnpjs: null
  };

  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    options.file = args[fileIdx + 1];
  }

  const cnpjIdx = args.indexOf('--cnpj');
  if (cnpjIdx !== -1 && args[cnpjIdx + 1]) {
    options.cnpjs = args[cnpjIdx + 1].split(',').map(s => s.trim());
  }

  importRealData(options).catch(err => {
    console.error('❌ Falha na execução da ingestão:', err);
    process.exit(1);
  });
}
