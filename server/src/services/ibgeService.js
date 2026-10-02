/**
 * server/src/services/ibgeService.js
 * 
 * FASE 60 AVANÇADA — ETAPA 1: DECODIFICADOR IBGE NACIONAL DO CAR (5.570 MUNICÍPIOS)
 * 
 * Todo código federal do CAR segue a estrutura oficial:
 * {UF}-{CÓDIGO_IBGE_7_DÍGITOS}-{HASH_ALFANUMÉRICO}
 * Exemplo: RS-4320107-53444DEF... -> UF: RS, IBGE: 4320107 -> SARANDI / RS
 * Exemplo: RS-4314100-99A82B3C... -> UF: RS, IBGE: 4314100 -> PASSO FUNDO / RS
 * Exemplo: MT-5108956-EFA12B00... -> UF: MT, IBGE: 5108956 -> SORRISO / MT
 * 
 * Resolve com tripla camada de resiliência:
 * 1. Tabela local SQLite `ibge_municipios` (zero latência)
 * 2. Dicionário embutido de polos agropecuários nacionais
 * 3. Fallback online para a API oficial de Localidades do IBGE com cache persistente
 */

import db from '../config/database.js';

// Cria tabela de cache de municípios IBGE se não existir
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ibge_municipios (
      ibge_code TEXT PRIMARY KEY,
      municipio TEXT NOT NULL,
      uf TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ibge_municipio ON ibge_municipios(municipio);
    CREATE INDEX IF NOT EXISTS idx_ibge_uf ON ibge_municipios(uf);
  `);
} catch (e) {
  console.warn('⚠️ [IBGE Service] Erro ao inicializar tabela ibge_municipios:', e.message);
}

// Dicionário embutido dos principais polos agropecuários e cidades do Brasil
const BUILTIN_IBGE = {
  // Rio Grande do Sul
  '4314100': { municipio: 'PASSO FUNDO', uf: 'RS' },
  '4314407': { municipio: 'PASSO FUNDO', uf: 'RS' },
  '4320107': { municipio: 'SARANDI', uf: 'RS' },
  '4306106': { municipio: 'CRUZ ALTA', uf: 'RS' },
  '4316808': { municipio: 'SANTA MARIA', uf: 'RS' },
  '4310207': { municipio: 'IJUI', uf: 'RS' },
  '4305108': { municipio: 'CAXIAS DO SUL', uf: 'RS' },
  '4314902': { municipio: 'PELOTAS', uf: 'RS' },
  '4313409': { municipio: 'NAO-ME-TOQUE', uf: 'RS' },
  '4318705': { municipio: 'SAO LUIZ GONZAGA', uf: 'RS' },
  '4316758': { municipio: 'SALVADOR DO SUL', uf: 'RS' },
  '4314902': { municipio: 'PORTO ALEGRE', uf: 'RS' },
  '4317202': { municipio: 'SANTA ROSA', uf: 'RS' },
  '4322400': { municipio: 'URUGUAIANA', uf: 'RS' },
  '4300406': { municipio: 'ALEGRETE', uf: 'RS' },
  '4307005': { municipio: 'ERECHIM', uf: 'RS' },
  '4321204': { municipio: 'TAQUARA', uf: 'RS' },
  '4303905': { municipio: 'CAMPO BOM', uf: 'RS' },
  '4307906': { municipio: 'ESTEIO', uf: 'RS' },
  '4313300': { municipio: 'NOVA PRATA', uf: 'RS' },

  // Mato Grosso
  '5108956': { municipio: 'SORRISO', uf: 'MT' },
  '5107909': { municipio: 'SINOP', uf: 'MT' },
  '5105259': { municipio: 'LUCAS DO RIO VERDE', uf: 'MT' },
  '5106224': { municipio: 'NOVA MUTUM', uf: 'MT' },
  '5107602': { municipio: 'RONDONOPOLIS', uf: 'MT' },
  '5103403': { municipio: 'CUIABA', uf: 'MT' },
  '5102504': { municipio: 'CACERES', uf: 'MT' },
  '5101803': { municipio: 'BARRA DO GARCAS', uf: 'MT' },
  '5107008': { municipio: 'POXOREO', uf: 'MT' },
  '5106307': { municipio: 'NOVA XAVANTINA', uf: 'MT' },
  '5106752': { municipio: 'PONTES E LACERDA', uf: 'MT' },
  '5103353': { municipio: 'CONFRESA', uf: 'MT' },
  '5107180': { municipio: 'QUERENCIA', uf: 'MT' },
  '5107875': { municipio: 'SAPEZAL', uf: 'MT' },
  '5102637': { municipio: 'CAMPO NOVO DO PARECIS', uf: 'MT' },

  // Goiás
  '5218805': { municipio: 'RIO VERDE', uf: 'GO' },
  '5211909': { municipio: 'JATAI', uf: 'GO' },
  '5210901': { municipio: 'ITUMBIARA', uf: 'GO' },
  '5208707': { municipio: 'GOIANIA', uf: 'GO' },
  '5201405': { municipio: 'ANAPOLIS', uf: 'GO' },
  '5206206': { municipio: 'CRISTALINA', uf: 'GO' },
  '5205109': { municipio: 'CATALAO', uf: 'GO' },
  '5212501': { municipio: 'LUZIANIA', uf: 'GO' },

  // Mato Grosso do Sul
  '5003702': { municipio: 'DOURADOS', uf: 'MS' },
  '5005400': { municipio: 'MARACAJU', uf: 'MS' },
  '5002704': { municipio: 'CAMPO GRANDE', uf: 'MS' },
  '5007695': { municipio: 'SAO GABRIEL DO OESTE', uf: 'MS' },
  '5008305': { municipio: 'TRES LAGOAS', uf: 'MS' },
  '5002951': { municipio: 'CHAPADAO DO SUL', uf: 'MS' },
  '5006606': { municipio: 'PONTA PORA', uf: 'MS' },
  '5007901': { municipio: 'SIDROLANDIA', uf: 'MS' },
  '5006275': { municipio: 'NAVIRAI', uf: 'MS' },

  // Paraná
  '4104808': { municipio: 'CASCAVEL', uf: 'PR' },
  '4127700': { municipio: 'TOLEDO', uf: 'PR' },
  '4113700': { municipio: 'LONDRINA', uf: 'PR' },
  '4115200': { municipio: 'MARINGA', uf: 'PR' },
  '4105805': { municipio: 'CASTRO', uf: 'PR' },
  '4122206': { municipio: 'PONTA GROSSA', uf: 'PR' },
  '4106902': { municipio: 'CURITIBA', uf: 'PR' },
  '4106001': { municipio: 'GUAIRA', uf: 'PR' },
  '4118204': { municipio: 'PATO BRANCO', uf: 'PR' },
  '4108304': { municipio: 'FOZ DO IGUACU', uf: 'PR' },
  '4109401': { municipio: 'GUARAPUAVA', uf: 'PR' },

  // Minas Gerais
  '3169901': { municipio: 'UBERABA', uf: 'MG' },
  '3170206': { municipio: 'UBERLANDIA', uf: 'MG' },
  '3147402': { municipio: 'PATOS DE MINAS', uf: 'MG' },
  '3106200': { municipio: 'BELO HORIZONTE', uf: 'MG' },
  '3152501': { municipio: 'POUSO ALEGRE', uf: 'MG' },
  '3171303': { municipio: 'VICOSA', uf: 'MG' },
  '3148004': { municipio: 'PATROCINIO', uf: 'MG' },
  '3170404': { municipio: 'UNAI', uf: 'MG' },
  '3147006': { municipio: 'PARACATU', uf: 'MG' },

  // São Paulo
  '3543402': { municipio: 'RIBEIRAO PRETO', uf: 'SP' },
  '3536505': { municipio: 'PIRACICABA', uf: 'SP' },
  '3503307': { municipio: 'ARACATUBA', uf: 'SP' },
  '3548708': { municipio: 'SAO JOSE DO RIO PRETO', uf: 'SP' },
  '3509502': { municipio: 'CAMPINAS', uf: 'SP' },
  '3550308': { municipio: 'SAO PAULO', uf: 'SP' },
  '3505708': { municipio: 'BARUERI', uf: 'SP' },
  '3525904': { municipio: 'JUNDIAI', uf: 'SP' },
  '3556404': { municipio: 'SOROCABA', uf: 'SP' },
  '3506003': { municipio: 'BAURU', uf: 'SP' },
  '3507506': { municipio: 'BOTUCATU', uf: 'SP' },
  '3526902': { municipio: 'LIMEIRA', uf: 'SP' },

  // Bahia
  '2903201': { municipio: 'BARREIRAS', uf: 'BA' },
  '2919553': { municipio: 'LUIS EDUARDO MAGALHAES', uf: 'BA' },
  '2927408': { municipio: 'SALVADOR', uf: 'BA' },
  '2910800': { municipio: 'FEIRA DE SANTANA', uf: 'BA' },
  '2931350': { municipio: 'TEIXEIRA DE FREITAS', uf: 'BA' },
  '2914802': { municipio: 'ITABUNA', uf: 'BA' },
  '2918001': { municipio: 'JEQUIE', uf: 'BA' },

  // Piauí & Maranhão & Tocantins (MATOPIBA)
  '2201903': { municipio: 'BOM JESUS', uf: 'PI' },
  '2211100': { municipio: 'URUCUI', uf: 'PI' },
  '2101608': { municipio: 'BALSAS', uf: 'MA' },
  '1721000': { municipio: 'PALMAS', uf: 'TO' },
  '1709500': { municipio: 'GURUPI', uf: 'TO' }
};

// Popula o dicionário na tabela SQLite em background
try {
  const insertStmt = db.prepare(`INSERT OR IGNORE INTO ibge_municipios (ibge_code, municipio, uf) VALUES (?, ?, ?)`);
  for (const [code, info] of Object.entries(BUILTIN_IBGE)) {
    insertStmt.run(code, info.municipio, info.uf);
  }
} catch (_) {}

/**
 * Normaliza e extrai Código IBGE de um Código CAR oficial
 * @param {string} codigoCar Ex: 'RS-4320107-53444DEF80D8407B9C6B38A32B872AA1'
 * @returns {{ uf: string|null, ibge: string|null, hash: string|null }}
 */
export function parseCarCode(codigoCar) {
  if (!codigoCar || typeof codigoCar !== 'string') return { uf: null, ibge: null, hash: null };
  const clean = codigoCar.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const parts = clean.split('-');
  
  const uf = (parts[0] && parts[0].length === 2) ? parts[0] : null;
  const ibge = (parts[1] && /^\d{6,7}$/.test(parts[1])) ? parts[1] : null;
  const hash = parts.slice(2).join('-') || null;

  return { uf, ibge, hash };
}

/**
 * Resolve o Nome do Município e UF pelo código IBGE (7 dígitos)
 * Camada 1: SQLite Cache Local
 * Camada 2: Dicionário Embutido
 * Camada 3: API Oficial do IBGE (https://servicodados.ibge.gov.br) com persistência automática
 * 
 * @param {string} ibgeCode Código de 6 ou 7 dígitos
 * @param {string} [ufFallback] UF de contingência
 * @returns {Promise<{ municipio: string, uf: string, ibge_code: string, source: string }>}
 */
export async function resolveMunicipioByIbge(ibgeCode, ufFallback = 'BR') {
  if (!ibgeCode) {
    return { municipio: 'Não informado', uf: ufFallback, ibge_code: '', source: 'FALLBACK' };
  }

  const rawCode = String(ibgeCode).trim().replace(/\D/g, '');

  // 1. Consulta SQLite
  try {
    const row = db.prepare('SELECT municipio, uf FROM ibge_municipios WHERE ibge_code = ? LIMIT 1').get(rawCode);
    if (row && row.municipio) {
      return { municipio: row.municipio, uf: row.uf, ibge_code: rawCode, source: 'SQLITE_CACHE' };
    }
  } catch (_) {}

  // 2. Consulta Dicionário Embutido
  if (BUILTIN_IBGE[rawCode]) {
    const b = BUILTIN_IBGE[rawCode];
    try {
      db.prepare('INSERT OR REPLACE INTO ibge_municipios (ibge_code, municipio, uf) VALUES (?, ?, ?)').run(rawCode, b.municipio, b.uf);
    } catch (_) {}
    return { municipio: b.municipio, uf: b.uf, ibge_code: rawCode, source: 'BUILTIN_MAP' };
  }

  // 3. Fallback: API Oficial do IBGE (cobre os 5.570 municípios do Brasil)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${rawCode}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.nome) {
        const munName = String(data.nome).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const ufSigla = data.microrregiao?.mesorregiao?.UF?.sigla || data['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla || ufFallback;
        
        // Persiste no SQLite para consultas subsequentes sem custo de rede
        try {
          db.prepare('INSERT OR REPLACE INTO ibge_municipios (ibge_code, municipio, uf) VALUES (?, ?, ?)').run(rawCode, munName, ufSigla);
        } catch (_) {}

        return { municipio: munName, uf: ufSigla, ibge_code: rawCode, source: 'IBGE_API' };
      }
    }
  } catch (err) {
    console.warn(`⚠️ [IBGE Service] Não foi possível consultar API IBGE para o código ${rawCode}:`, err.message);
  }

  return { municipio: 'MUNICÍPIO RURAL', uf: ufFallback, ibge_code: rawCode, source: 'DEFAULT_FALLBACK' };
}

/**
 * Decodifica o município e a UF de uma propriedade rural a partir de qualquer dado disponível
 * (código CAR, id_sigef, atributos ou coordenadas)
 * 
 * @param {Object} propData 
 * @returns {Promise<{ municipio: string, uf: string, ibge_code: string }>}
 */
export async function extractLocationFromProperty(propData = {}) {
  // Se já tem município e UF preenchidos e válidos:
  const directMun = (propData.municipio || '').trim();
  const directUf = (propData.uf || '').trim().toUpperCase();
  if (directMun && directMun !== 'Não informado' && directMun !== 'Município Declarado' && directUf && directUf.length === 2) {
    return { municipio: directMun.toUpperCase(), uf: directUf, ibge_code: '' };
  }

  // Se tem código CAR, decodifica o código IBGE
  const carCandidate = propData.codigo_car || propData.recibo || propData.id || '';
  if (carCandidate) {
    const { uf, ibge } = parseCarCode(carCandidate);
    if (ibge) {
      const resolved = await resolveMunicipioByIbge(ibge, uf || directUf || 'BR');
      return { municipio: resolved.municipio, uf: resolved.uf, ibge_code: ibge };
    }
  }

  return {
    municipio: directMun ? directMun.toUpperCase() : 'ZONA RURAL',
    uf: directUf || 'RS',
    ibge_code: ''
  };
}

export default {
  parseCarCode,
  resolveMunicipioByIbge,
  extractLocationFromProperty
};
