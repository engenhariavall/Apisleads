import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseIncraGml } from './test_incra_parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const SIGEF_DIR = path.join(DATA_DIR, 'sigef');

const POLOS = [
  { mun: 'PASSO FUNDO', uf: 'RS', file: 'PASSO_FUNDO.geojson', bbox: '-52.55,-28.38,-52.32,-28.15' },
  { mun: 'CRUZ ALTA', uf: 'RS', file: 'CRUZ_ALTA.geojson', bbox: '-53.75,-28.75,-53.45,-28.50' },
  { mun: 'IJUI', uf: 'RS', file: 'IJUI.geojson', bbox: '-54.00,-28.50,-53.75,-28.25' },
  { mun: 'SANTA MARIA', uf: 'RS', file: 'SANTA_MARIA.geojson', bbox: '-53.95,-29.80,-53.65,-29.60' },
  { mun: 'AVELINO LOPES', uf: 'PI', file: 'AVELINO_LOPES.geojson', bbox: '-44.10,-10.25,-43.80,-10.00' }
];

async function ingestAllOfficialSigef() {
  console.log('🚀 Iniciando ingestão 100% REAL do Acervo Oficial INCRA/SIGEF (WFS OGC)...');
  const allParcels = [];

  for (const polo of POLOS) {
    const ufLower = polo.uf.toLowerCase();
    const url = `https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_${ufLower}&service=WFS&version=1.0.0&request=GetFeature&typeName=certificada_sigef_particular_${ufLower}&BBOX=${polo.bbox}&maxFeatures=50`;
    console.log(`📡 Consultando INCRA SIGEF para ${polo.mun}/${polo.uf}...`);
    
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal
      });
      clearTimeout(t);

      if (res.ok) {
        const xml = await res.text();
        const features = parseIncraGml(xml, polo.mun, polo.uf);
        console.log(`✅ ${polo.mun}/${polo.uf}: ${features.length} parcelas oficiais reais obtidas do INCRA.`);
        
        if (features.length > 0) {
          const outDir = path.join(SIGEF_DIR, polo.uf);
          fs.mkdirSync(outDir, { recursive: true });
          
          const geoJson = {
            type: 'FeatureCollection',
            name: `sigef_${polo.uf}_${polo.mun.replace(/\s+/g, '_')}`,
            total_features: features.length,
            updated_at: new Date().toISOString(),
            features: features.map(f => ({
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
          
          fs.writeFileSync(path.join(outDir, polo.file), JSON.stringify(geoJson, null, 2), 'utf8');
          allParcels.push(...geoJson.features.map(feat => ({
            ...feat.properties,
            geometria_poligono: feat.geometry
          })));
        }
      } else {
        console.warn(`⚠️ INCRA retornou HTTP ${res.status} para ${polo.mun}`);
      }
    } catch (err) {
      console.warn(`⚠️ Falha na requisição ao INCRA para ${polo.mun}: ${err.message}`);
    }
  }

  if (allParcels.length > 0) {
    fs.writeFileSync(path.join(SIGEF_DIR, 'official_sigef_parcels.json'), JSON.stringify(allParcels, null, 2), 'utf8');
    console.log(`🌟 Total de ${allParcels.length} parcelas oficiais do INCRA salvas em official_sigef_parcels.json.`);
  }
}

ingestAllOfficialSigef();
