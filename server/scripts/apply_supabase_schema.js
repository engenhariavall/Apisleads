import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.SUPABASE_ACCESS_TOKEN || '';
const projectRef = process.env.SUPABASE_PROJECT_REF || 'uztxhogoiresauwdvuco';

const schemaPath = path.resolve(__dirname, '../src/database/schema_supabase.sql');
const sqlContent = fs.readFileSync(schemaPath, 'utf8');

console.log('📦 Aplicando schema completo no Supabase (' + projectRef + ')...');
console.log('Tamanho do script SQL:', sqlContent.length, 'bytes');

const payload = JSON.stringify({ query: sqlContent });

const req = https.request({
  hostname: 'api.supabase.com',
  path: `/v1/projects/${projectRef}/database/query`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ Schema aplicado com sucesso!');
    } else {
      console.error('❌ Erro na aplicação do schema:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Erro de rede:', e.message);
});

req.write(payload);
req.end();
