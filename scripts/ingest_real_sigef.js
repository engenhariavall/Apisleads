import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseIncraGml } from './test_incra_parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const SIGEF_DIR = path.join(DATA_DIR, 'sigef');

const POLOS = [
  { mun: 'PASSO FUNDO', uf: 'RS', file: 'PASSO_FUNDO.geojson', bbox: '-52.55,-28.38,-52.32,-28.15', ibge: '4314100' },
  { mun: 'CRUZ ALTA', uf: 'RS', file: 'CRUZ_ALTA.geojson', bbox: '-53.75,-28.75,-53.45,-28.50', ibge: '4306106' },
  { mun: 'IJUI', uf: 'RS', file: 'IJUI.geojson', bbox: '-54.00,-28.50,-53.75,-28.25', ibge: '4310207' },
  { mun: 'SANTA MARIA', uf: 'RS', file: 'SANTA_MARIA.geojson', bbox: '-53.95,-29.80,-53.65,-29.60', ibge: '4316907' },
  { mun: 'AVELINO LOPES', uf: 'PI', file: 'AVELINO_LOPES.geojson', bbox: '-44.10,-10.25,-43.80,-10.00', ibge: '2201101' }
];

function parseArgs() {
  const args = process.argv.slice(2);
  let uf = null;
  let municipio = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--uf' || args[i] === '-u') && args[i + 1]) {
      uf = args[i + 1].toUpperCase().trim();
      i++;
    } else if ((args[i] === '--municipio' || args[i] === '-m') && args[i + 1]) {
      municipio = args[i + 1].toUpperCase().trim();
      i++;
    }
  }
  return { uf, municipio };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        return res;
      }

      if ([502, 503, 504].includes(res.status) && attempt < retries) {
        console.warn(`[SIGEF WFS] HTTP ${res.status} na tentativa ${attempt}. Repetindo em ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[SIGEF WFS] Erro de rede (${err.message}) na tentativa ${attempt}. Repetindo em ${delayMs}ms...`);
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }
}

async function fetchAllSigefFeatures(polo) {
  const ufLower = polo.uf.toLowerCase();
  const pageSize = 1000;
  let startIndex = 0;
  let page = 1;
  let hasMore = true;
  let allFeatures = [];

  console.log(`📡 Consultando INCRA/SIGEF (WFS OGC) para ${polo.mun}/${polo.uf} (BBOX: ${polo.bbox})...`);

  while (hasMore) {
    const url = `https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_${ufLower}&service=WFS&version=1.0.0&request=GetFeature&typeName=certificada_sigef_particular_${ufLower}&BBOX=${polo.bbox}&count=${pageSize}&maxFeatures=${pageSize}&startIndex=${startIndex}`;
    
    console.log(`[SIGEF WFS] Requisitando página ${page} com startIndex=${startIndex}...`);

    try {
      const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 3, 1500);

      if (!res.ok) {
        console.warn(`⚠️ [SIGEF WFS] Resposta HTTP ${res.status} para ${polo.mun}`);
        break;
      }

      const xml = await res.text();
      const pageFeatures = parseIncraGml(xml, polo.mun, polo.uf);

      allFeatures = allFeatures.concat(pageFeatures);
      console.log(`[SIGEF WFS] Recebidas ${pageFeatures.length} parcelas nesta página. Total acumulado: ${allFeatures.length}`);

      if (pageFeatures.length < pageSize || pageFeatures.length === 0) {
        hasMore = false;
      } else {
        startIndex += pageSize;
        page++;
      }
    } catch (err) {
      console.warn(`⚠️ [SIGEF WFS] Erro no lote página ${page}: ${err.message}`);
      break;
    }
  }

  return { allFeatures, totalPages: page };
}

export async function ingestAllOfficialSigef() {
  const { uf: targetUf, municipio: targetMun } = parseArgs();
  console.log('🚀 Iniciando ingestão 100% REAL do Acervo Oficial INCRA/SIGEF com Paginação WFS OGC...');

  let targets = POLOS;
  if (targetUf || targetMun) {
    targets = POLOS.filter(p => {
      const matchUf = targetUf ? p.uf === targetUf : true;
      const matchMun = targetMun ? (p.mun.includes(targetMun) || targetMun.includes(p.mun)) : true;
      return matchUf && matchMun;
    });

    if (targets.length === 0 && targetUf && targetMun) {
      console.log(`ℹ️ Polo específico informado (${targetMun}/${targetUf}) não pré-cadastrado. Criando entrada padrão...`);
      targets = [{
        mun: targetMun,
        uf: targetUf,
        file: `${targetMun.replace(/\s+/g, '_')}.geojson`,
        bbox: '-52.55,-28.38,-52.32,-28.15'
      }];
    }
  }

  const allParcels = [];

  for (const polo of targets) {
    const { allFeatures, totalPages } = await fetchAllSigefFeatures(polo);

    // Filtra estritamente pelo código IBGE do polo, se disponível, para expurgar parcelas de municípios vizinhos da BBOX
    let finalFeatures = allFeatures;
    if (polo.ibge) {
      const byIbge = allFeatures.filter(f => f.codigo_municipio === polo.ibge);
      if (byIbge.length > 0) {
        console.log(`[SIGEF WFS] Filtro municipal IBGE ${polo.ibge}: ${byIbge.length} de ${allFeatures.length} pertencem estritamente a ${polo.mun}.`);
        finalFeatures = byIbge;
      }
    }

    console.log(`✅ [CONSOLIDADO] ${polo.mun}/${polo.uf}: Total de ${totalPages} página(s) consultada(s). Gravando ${finalFeatures.length} parcelas oficiais reais.`);

    if (finalFeatures.length > 0) {
      const outDir = path.join(SIGEF_DIR, polo.uf);
      fs.mkdirSync(outDir, { recursive: true });

      const geoJson = {
        type: 'FeatureCollection',
        name: `sigef_${polo.uf}_${polo.mun.replace(/\s+/g, '_')}`,
        total_features: finalFeatures.length,
        updated_at: new Date().toISOString(),
        features: finalFeatures.map(f => ({
          type: 'Feature',
          id: f.id_sigef,
          geometry: f.geometria_poligono,
          properties: {
            id: f.id_sigef,
            id_sigef: f.id_sigef,
            codigo_imovel: f.codigo_imovel,
            nome_imovel: f.nome_imovel,
            nome_titular: f.nome_titular,
            cpf_cnpj_titular: f.cpf_cnpj_titular,
            registro_matricula: f.registro_matricula,
            codigo_municipio: f.codigo_municipio,
            municipio: f.municipio,
            uf: f.uf,
            area_hectares: f.area_hectares,
            status_geo: f.status_geo,
            tag_fonte: f.tag_fonte,
            centroide_lat: f.centroide_lat,
            centroide_lng: f.centroide_lng
          }
        }))
      };

      const targetPath = path.join(outDir, polo.file);
      fs.writeFileSync(targetPath, JSON.stringify(geoJson, null, 2), 'utf8');
      console.log(`💾 Arquivo salvo com sucesso em: ${targetPath}`);

      allParcels.push(...geoJson.features.map(feat => ({
        ...feat.properties,
        geometria_poligono: feat.geometry
      })));
    }
  }

  // Atualiza acervo consolidado se houver parcelas novas
  const officialFile = path.join(SIGEF_DIR, 'official_sigef_parcels.json');
  if (allParcels.length > 0) {
    let existing = [];
    if (fs.existsSync(officialFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(officialFile, 'utf8'));
      } catch (_) {}
    }
    const map = new Map();
    existing.forEach(p => map.set(p.id_sigef || p.id, p));
    allParcels.forEach(p => map.set(p.id_sigef || p.id, p));
    const merged = Array.from(map.values());

    fs.writeFileSync(officialFile, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`🌟 Total de ${merged.length} parcelas oficiais do INCRA preservadas em official_sigef_parcels.json.`);
  }

  console.log('🏁 Ingestão finalizada.');
}

if (process.argv[1] && process.argv[1].endsWith('ingest_real_sigef.js')) {
  ingestAllOfficialSigef();
}
