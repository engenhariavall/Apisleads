import fs from 'fs';
import path from 'path';

function sanitizeCoordinateArray(coords) {
  if (!Array.isArray(coords)) return coords;
  
  // Se for um array de strings ou de números misturados
  const cleaned = [];
  for (let i = 0; i < coords.length; i++) {
    const item = coords[i];
    if (typeof item === 'string') {
      if (item.includes(',')) {
        // String contendo "lng,lat"
        const parts = item.split(',');
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lng) && !isNaN(lat)) {
          cleaned.push([lng, lat]);
        }
      } else {
        const num = parseFloat(item);
        if (!isNaN(num)) cleaned.push(num);
      }
    } else if (Array.isArray(item)) {
      // Se for um array [lng, lat] onde os elementos podem ser strings
      if (item.length === 2 && (typeof item[0] === 'number' || typeof item[0] === 'string') && (typeof item[1] === 'number' || typeof item[1] === 'string')) {
        const lng = typeof item[0] === 'number' ? item[0] : parseFloat(item[0]);
        const lat = typeof item[1] === 'number' ? item[1] : parseFloat(item[1]);
        if (!isNaN(lng) && !isNaN(lat)) {
          cleaned.push([lng, lat]);
        } else {
          cleaned.push(sanitizeCoordinateArray(item));
        }
      } else {
        cleaned.push(sanitizeCoordinateArray(item));
      }
    } else {
      cleaned.push(item);
    }
  }
  return cleaned;
}

function processGeoJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const features = Array.isArray(data.features) ? data.features : (Array.isArray(data) ? data : []);
    
    let modified = 0;
    for (const f of features) {
      if (f.geometry && f.geometry.coordinates) {
        f.geometry.coordinates = sanitizeCoordinateArray(f.geometry.coordinates);
        modified++;
      } else if (f.geometria_poligono && f.geometria_poligono.coordinates) {
        f.geometria_poligono.coordinates = sanitizeCoordinateArray(f.geometria_poligono.coordinates);
        modified++;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[CLEANED] ${filePath} - ${modified} features processadas.`);
  } catch (err) {
    console.error(`[ERROR] ${filePath}:`, err.message);
  }
}

const targetDir = path.resolve('data/sigef');
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith('.geojson') || entry.name.endsWith('.json')) {
      processGeoJsonFile(fullPath);
    }
  }
}

walk(targetDir);
console.log('Sanitização concluída com sucesso!');
