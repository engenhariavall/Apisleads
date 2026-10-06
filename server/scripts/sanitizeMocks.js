import db from '../src/config/database.js';

async function sanitizeDatabase() {
  console.log('🧹 [SANITIZE] Iniciando limpeza de dados sintéticos e mocks...');

  const query = `
    UPDATE propriedades_rurais 
    SET produtor_pf_nome = NULL, 
        produtor_pf_cpf = NULL, 
        inscricao_estadual = NULL, 
        sefaz_status = NULL, 
        sefaz_uf = NULL, 
        whatsapp_produtor_pf = NULL 
    WHERE produtor_pf_nome IN (
      'NESTOR JOÃO GRAZZIOTIN', 
      'DARCI ZANCHET', 
      'GILBERTO RIZZOTTO', 
      'VALDOMIRO SCORTEGAGNA', 
      'LEOMIR TRENTIN', 
      'ADELAR JOSÉ FACCIO', 
      'ODIRLEI LUIZ FIORENTIN', 
      'CLÁUDIO ZAMBONIN', 
      'ERNANI PIVA', 
      'IVO DALL AGNOL', 
      'JAIME BIAZUS', 
      'FERNANDO PAIQUERE BECKER'
    )
  `;

  const res = await db.query(query);
  console.log(`✅ [SANITIZE] Limpeza concluída: ${res.rowCount} registros sanitizados com sucesso.`);
  process.exit(0);
}

sanitizeDatabase().catch(err => {
  console.error('❌ [SANITIZE ERROR]:', err);
  process.exit(1);
});
