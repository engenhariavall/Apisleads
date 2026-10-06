import db from '../src/config/database.js';

async function audit() {
  const leads = db.prepare(`SELECT id, cnpj, razao_social, municipio, uf FROM leads WHERE length(replace(replace(replace(cnpj, '.', ''), '-', ''), '/', '')) = 14 LIMIT 40`).all();
  console.log(`Testando ${leads.length} CNPJs diretamente na Receita Federal (minhareceita.org)...`);
  
  const valid = [];
  const invalid = [];

  for (const l of leads) {
    const clean = l.cnpj.replace(/\D/g, '');
    try {
      const res = await fetch(`https://minhareceita.org/${clean}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`✅ [REAL RFB] ${clean} | ${data.razao_social} | ${data.municipio}/${data.uf} | Status: ${data.descricao_situacao_cadastral}`);
        valid.push({
          cnpj: clean,
          cnpj_formatado: l.cnpj,
          razao_social: data.razao_social,
          nome_fantasia: data.nome_fantasia,
          municipio: data.municipio,
          uf: data.uf,
          capital_social: data.capital_social,
          cnae: data.cnae_fiscal_descricao
        });
      } else {
        console.log(`❌ [INVÁLIDO RFB ${res.status}] ${clean} | ${l.razao_social}`);
        invalid.push(clean);
      }
    } catch (e) {
      console.log(`⚠️ [ERRO NET] ${clean}: ${e.message}`);
    }
  }

  console.log('\n--- RESUMO ---');
  console.log(`Total Válidos Reais na Receita Federal: ${valid.length}`);
  console.log(`Total Inválidos/Inexistentes: ${invalid.length}`);
}

audit().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
