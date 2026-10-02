/**
 * BACKFILL DE COORDENADAS GEODÉSICAS MUNICIPAIS PARA LEADS B2B / AGRO
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../../data/leads.sqlite');

const db = new DatabaseSync(dbPath);

const CITY_COORDS = {
  'CHAPECO_SC':                { lat: -27.1004, lng: -52.6152 },
  'NAVIRAI_MS':                { lat: -23.0644, lng: -54.1989 },
  'PIRACICABA_SP':             { lat: -22.7338, lng: -47.6476 },
  'LUIS EDUARDO MAGALHAES_BA': { lat: -12.0969, lng: -45.7958 },
  'PASSO FUNDO_RS':            { lat: -28.2612, lng: -52.4083 },
  'SORRISO_MT':                { lat: -12.5447, lng: -55.7231 },
  'RIO VERDE_GO':              { lat: -17.7925, lng: -50.9192 },
  'DOURADOS_MS':               { lat: -22.2236, lng: -54.8122 },
  'MARINGA_PR':                { lat: -23.4205, lng: -51.9333 },
  'CASCAVEL_PR':               { lat: -24.9578, lng: -53.4595 },
  'LONDRINA_PR':               { lat: -23.3045, lng: -51.1696 },
  'CAMPO MOURAO_PR':           { lat: -24.0458, lng: -52.3789 },
  'PRIMAVERA DO LESTE_MT':     { lat: -15.5594, lng: -54.2969 },
  'RONDONOPOLIS_MT':           { lat: -16.4674, lng: -54.6372 },
  'SINOP_MT':                  { lat: -11.8608, lng: -55.5097 },
  'LUCAS DO RIO VERDE_MT':     { lat: -13.0506, lng: -55.9103 },
  'BALSAS_MA':                 { lat: -7.5322,  lng: -46.0356 },
  'URUCUI_PI':                 { lat: -7.2289,  lng: -44.5564 },
  'GURUPI_TO':                 { lat: -11.7297, lng: -49.0689 },
  'UBERLANDIA_MG':             { lat: -18.9186, lng: -48.2772 },
  'PATOS DE MINAS_MG':         { lat: -18.5789, lng: -46.5181 },
  'RIBEIRAO PRETO_SP':         { lat: -21.1767, lng: -47.8208 }
};

const UF_CENTROIDS = {
  'RS': { lat: -29.7547, lng: -53.7766 },
  'SC': { lat: -27.2423, lng: -50.2189 },
  'PR': { lat: -24.8938, lng: -51.5598 },
  'SP': { lat: -22.1868, lng: -48.7447 },
  'MS': { lat: -20.5103, lng: -54.5400 },
  'MT': { lat: -12.6819, lng: -56.9211 },
  'GO': { lat: -15.9798, lng: -49.8655 },
  'MG': { lat: -18.5122, lng: -44.5550 },
  'BA': { lat: -12.5797, lng: -41.7007 },
  'TO': { lat: -10.1753, lng: -48.2982 }
};

console.log('🔄 Iniciando backfill de coordenadas geodésicas para leads sem latitude/longitude...');

const leadsWithoutCoords = db.prepare(`
  SELECT id, nome_fantasia, razao_social, municipio, uf 
  FROM leads 
  WHERE latitude IS NULL OR longitude IS NULL OR latitude = 0
`).all();

console.log(`📊 Encontrados ${leadsWithoutCoords.length} leads sem coordenadas.`);

const updateStmt = db.prepare(`
  UPDATE leads 
  SET latitude = ?, longitude = ? 
  WHERE id = ?
`);

let updatedCount = 0;

for (const lead of leadsWithoutCoords) {
  const cNorm = String(lead.municipio || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ufNorm = String(lead.uf || '').trim().toUpperCase();
  const key = `${cNorm}_${ufNorm}`;

  let coords = CITY_COORDS[key] || UF_CENTROIDS[ufNorm];
  if (coords) {
    updateStmt.run(coords.lat, coords.lng, lead.id);
    updatedCount++;
  }
}

console.log(`✅ Backfill concluído! ${updatedCount} leads agora possuem coordenadas geodésicas.`);
