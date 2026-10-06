import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
console.log('Lendo .env em:', envPath);

let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

// Remove linhas antigas de Assertiva e Bureau se existirem
const cleanLines = content.split(/\r?\n/).filter(line => {
  const t = line.trim();
  return !t.startsWith('ASSERTIVA_') && !t.startsWith('BUREAU_PROVIDER');
});

cleanLines.push('');
cleanLines.push('# FASE 51 & 66: Integração de Dados Reais & OSINT Oficial (Go-Live)');
cleanLines.push('ASSERTIVA_CLIENT_ID="6FdMC5l6o5P95NfTSCZzLDa02kR+xB2I3xBUqZySI52ulI3SQ9J6SdtVmtrv/JLb4HrbjOQqNBnAvA6v0k8sUg=="');
cleanLines.push('ASSERTIVA_CLIENT_SECRET="8Yi0dKRUMRpAQB3UlvEaGY6e6y+DdkRrzYhCBNW2Rp1yXy4UuU+XszF6CaXxP15wzesvw0/QRY6dnQB/JFV8Yg=="');
cleanLines.push('ASSERTIVA_AUTH_URL="https://api.assertivasolucoes.com.br/oauth2/v3/token"');
cleanLines.push('BUREAU_PROVIDER="assertiva"');
cleanLines.push('');

fs.writeFileSync(envPath, cleanLines.join('\n'), 'utf8');
console.log('.env configurado com sucesso e credenciais gravadas!');
