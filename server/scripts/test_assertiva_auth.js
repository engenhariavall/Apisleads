/**
 * server/scripts/test_assertiva_auth.js
 * Testa EXCLUSIVAMENTE o endpoint de autenticacao OAuth2 da Assertiva (/oauth2/v3/token).
 * NAO realiza nenhuma consulta de CPF/CNPJ (Zero creditos consumidos).
 */
import '../src/config/env.js';

const clientId = process.env.ASSERTIVA_CLIENT_ID;
const clientSecret = process.env.ASSERTIVA_CLIENT_SECRET;

console.log('--- TESTE DE CREDENCIAIS ASSERTIVA OAUTH2 ---');
console.log('Client ID tamanho:', clientId?.length);
console.log('Client Secret tamanho:', clientSecret?.length);

async function runTests() {
  const url = 'https://api.assertivasolucoes.com.br/oauth2/v3/token';

  // 1. Basic Auth padrao
  const basicStandard = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  console.log('\n[1] Testando Basic Auth padrao...');
  try {
    const res1 = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': basicStandard,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials'
    });
    const text1 = await res1.text();
    console.log(`Status: ${res1.status}`, text1);
    if (res1.ok) {
      console.log('SUCESSO! Token gerado com sucesso!');
      return;
    }
  } catch (err) {
    console.error('Erro 1:', err.message);
  }

  // 2. Body com client_id e client_secret
  console.log('\n[2] Testando Credenciais no Body (URLSearchParams)...');
  try {
    const res2 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      }).toString()
    });
    const text2 = await res2.text();
    console.log(`Status: ${res2.status}`, text2);
    if (res2.ok) {
      console.log('SUCESSO! Token gerado com sucesso!');
      return;
    }
  } catch (err) {
    console.error('Erro 2:', err.message);
  }

  // 3. Trim de espacos / caracteres ocultos
  console.log('\n[3] Testando com .trim() rigoroso...');
  const cleanId = clientId.trim();
  const cleanSecret = clientSecret.trim();
  const basicTrimmed = 'Basic ' + Buffer.from(`${cleanId}:${cleanSecret}`).toString('base64');
  try {
    const res3 = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': basicTrimmed,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials'
    });
    const text3 = await res3.text();
    console.log(`Status: ${res3.status}`, text3);
  } catch (err) {
    console.error('Erro 3:', err.message);
  }
}

runTests().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
