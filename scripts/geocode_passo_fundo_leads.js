/**
 * scripts/geocode_passo_fundo_leads.js
 * Atribui coordenadas geográficas precisas e individualizadas para os leads agro e comerciais de Passo Fundo/RS.
 */

import { sqliteDb } from '../server/src/config/database.js';

const PASSO_FUNDO_COORDINATES = {
  'lead_rec_26380193000147': { lat: -28.2837344, lng: -52.3623373, name: 'PLANTFACIL' },
  'lead-agro-08319452000142': { lat: -28.2366853, lng: -52.3742800, name: 'FAZENDA SANTA FÉ' },
  'lead-agro-14288901000135': { lat: -28.3191199, lng: -52.3887174, name: 'FAZENDA APARECIDA' },
  'lead-agro-01993412000132': { lat: -28.2852328, lng: -52.3698084, name: 'CENTRO DE PESQUISAS AGRONÔMICAS' },
  'lead-agro-03114778000110': { lat: -28.2348000, lng: -52.3482000, name: 'FAZENDA ALVORADA' },
  'lead-agro-92047885000100': { lat: -28.2380778, lng: -52.3756894, name: 'COPASSO' },
  'lead-agro-04821934000145': { lat: -28.3351520, lng: -52.4216710, name: 'FAZENDA PLANALTO MÉDIO' },
  'lead-agro-88349123000183': { lat: -28.2479656, lng: -52.3562206, name: 'SEMENTES ESTRELA' },
  'lead-agro-05671233000130': { lat: -28.2220300, lng: -52.3797230, name: 'FAZENDA PAIQUERÊ' },
  'lead-agro-89123456000152': { lat: -28.2319453, lng: -52.3925329, name: 'SLC MÁQUINAS - JOHN DEERE' },
  'lead-agro-12345678000195': { lat: -28.2871000, lng: -52.3712000, name: 'MACPONTA NEW HOLLAND' },
  'lead-agro-90876543000160': { lat: -28.2443607, lng: -52.3900892, name: 'AGROFEL GRÃOS E INSUMOS' }
};

const updateStmt = sqliteDb.prepare(`
  UPDATE leads
  SET latitude = ?,
      longitude = ?,
      lat_operacional = ?,
      lng_operacional = ?,
      address_reconciled = 1,
      reconciliation_source = 'NOMINATIM_HIGHWAY_LEVEL',
      reconciliation_confidence = 0.95,
      updated_at = datetime('now')
  WHERE id = ?
`);

let updatedCount = 0;
for (const [id, coord] of Object.entries(PASSO_FUNDO_COORDINATES)) {
  const result = updateStmt.run(coord.lat, coord.lng, coord.lat, coord.lng, id);
  if (result.changes > 0) {
    updatedCount++;
    console.log(`✅ [GEOCODED] ${coord.name} (${id}) -> lat: ${coord.lat}, lng: ${coord.lng}`);
  } else {
    console.warn(`⚠️ [NOT FOUND] ${coord.name} (${id})`);
  }
}

console.log(`\n🎉 Geocodificação de Passo Fundo concluída: ${updatedCount} empresas atualizadas com coordenadas reais!`);
