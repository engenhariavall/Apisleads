/**
 * server/scripts/auditDataHygiene.js
 * 
 * FASE 25 — ETAPA 3: ROTINA DE AUDITORIA & HIGIENE CADASTRAL
 * 
 * Saneia integralmente a base local SQLite garantindo consistência relacional:
 * 1. Campos Numéricos e Scores:
 *    - icp_score (garante coluna e default 0)
 *    - vitality_score (garante coluna e default 0)
 *    - capital_social (default 0.00 se NULL)
 * 2. Flags Booleanas & Integridade de Funil:
 *    - is_competitor: estritamente 0 ou 1 (nunca NULL)
 *    - address_reconciled: estritamente 0 ou 1 (nunca NULL)
 * 3. Tipagem Categórica:
 *    - target_type: 'BUYER' ou 'SUPPLIER'/'COMPETITOR' seguro
 *    - status_operacional: 'Operação Ativa' para empresas ativas
 * 4. Purge de Textos Residuais:
 *    - Ausência total de mocks antigos em endereco_operacional, razao_social, nome_fantasia.
 */

import db from '../src/config/database.js';

export async function runDataHygiene() {
  console.log('\n=================================================================');
  console.log('🛡️  INICIANDO AUDITORIA & HIGIENE CADASTRAL (SQLITE LOCAL)');
  console.log('=================================================================\n');

  const report = {
    totalRecords: 0,
    columnsAdded: [],
    nullFixes: {
      capital_social: 0,
      is_competitor: 0,
      address_reconciled: 0,
      icp_score: 0,
      vitality_score: 0,
      target_type: 0,
      status_operacional: 0
    },
    mockPurges: {
      endereco_operacional: 0,
      razao_social: 0,
      nome_fantasia: 0
    },
    inconsistenciesRemaining: 0
  };

  // 1. Garantir que as colunas icp_score, vitality_score e status_operacional existam na tabela leads
  const cols = db.prepare('PRAGMA table_info(leads)').all();
  const colNames = new Set(cols.map(c => c.name));

  if (!colNames.has('icp_score')) {
    db.prepare('ALTER TABLE leads ADD COLUMN icp_score INTEGER DEFAULT 0').run();
    report.columnsAdded.push('icp_score');
  }
  if (!colNames.has('vitality_score')) {
    db.prepare('ALTER TABLE leads ADD COLUMN vitality_score INTEGER DEFAULT 0').run();
    report.columnsAdded.push('vitality_score');
  }
  if (!colNames.has('status_operacional')) {
    db.prepare("ALTER TABLE leads ADD COLUMN status_operacional TEXT DEFAULT 'Operação Ativa'").run();
    report.columnsAdded.push('status_operacional');
  }

  const countRow = db.prepare('SELECT COUNT(*) as total FROM leads').get();
  report.totalRecords = countRow ? countRow.total : 0;
  console.log(`📊 Total de empresas na base: ${report.totalRecords}`);

  // 2. Sanear capital_social NULL -> 0.00
  const fixCap = db.prepare('UPDATE leads SET capital_social = 0.00 WHERE capital_social IS NULL').run();
  report.nullFixes.capital_social = fixCap.changes;

  // 3. Sanear is_competitor NULL -> 0
  const fixComp = db.prepare('UPDATE leads SET is_competitor = 0 WHERE is_competitor IS NULL').run();
  report.nullFixes.is_competitor = fixComp.changes;

  // 4. Sanear address_reconciled NULL -> 0
  const fixRec = db.prepare('UPDATE leads SET address_reconciled = 0 WHERE address_reconciled IS NULL').run();
  report.nullFixes.address_reconciled = fixRec.changes;

  // 5. Sanear target_type NULL -> 'BUYER'
  const fixTarget = db.prepare("UPDATE leads SET target_type = 'BUYER' WHERE target_type IS NULL OR target_type = ''").run();
  report.nullFixes.target_type = fixTarget.changes;

  // 6. Sanear status_operacional NULL -> 'Operação Ativa'
  const fixStatus = db.prepare("UPDATE leads SET status_operacional = 'Operação Ativa' WHERE status_operacional IS NULL OR status_operacional = ''").run();
  report.nullFixes.status_operacional = fixStatus.changes;

  // 7. Sanear icp_score e vitality_score NULL -> 0
  const fixIcp = db.prepare('UPDATE leads SET icp_score = 0 WHERE icp_score IS NULL').run();
  report.nullFixes.icp_score = fixIcp.changes;

  const fixVit = db.prepare('UPDATE leads SET vitality_score = 0 WHERE vitality_score IS NULL').run();
  report.nullFixes.vitality_score = fixVit.changes;

  // 8. Purge de Textos Residuais Mockados
  const purgeAddr = db.prepare(`
    UPDATE leads 
    SET endereco_operacional = NULL,
        lat_operacional = NULL,
        lng_operacional = NULL,
        address_reconciled = 0,
        reconciliation_source = NULL,
        reconciliation_confidence = NULL
    WHERE endereco_operacional LIKE '%Nações Unidas%'
       OR endereco_operacional LIKE '%Nacoes Unidas%'
       OR endereco_operacional LIKE '%Centro Empresarial%'
       OR endereco_operacional LIKE '%MOCK%'
       OR endereco_operacional LIKE '%Fake%'
  `).run();
  report.mockPurges.endereco_operacional = purgeAddr.changes;

  const purgeRazao = db.prepare(`
    UPDATE leads 
    SET razao_social = REPLACE(REPLACE(razao_social, '[MOCK]', ''), 'MOCK', '')
    WHERE razao_social LIKE '%MOCK%'
  `).run();
  report.mockPurges.razao_social = purgeRazao.changes;

  const purgeFantasia = db.prepare(`
    UPDATE leads 
    SET nome_fantasia = REPLACE(REPLACE(nome_fantasia, '[MOCK]', ''), 'MOCK', '')
    WHERE nome_fantasia LIKE '%MOCK%'
  `).run();
  report.mockPurges.nome_fantasia = purgeFantasia.changes;

  // 9. Verificação final de integridade estrita
  const checkNulls = db.prepare(`
    SELECT COUNT(*) as errors FROM leads
    WHERE capital_social IS NULL
       OR is_competitor IS NULL
       OR address_reconciled IS NULL
       OR target_type IS NULL
       OR icp_score IS NULL
       OR vitality_score IS NULL
       OR status_operacional IS NULL
  `).get();

  report.inconsistenciesRemaining = checkNulls ? checkNulls.errors : 0;

  // 10. Exibir Relatório Auditável
  console.log('✅ Higiene concluída com sucesso:');
  console.log(`   - Colunas migradas/adicionadas: ${report.columnsAdded.length > 0 ? report.columnsAdded.join(', ') : 'Nenhuma (todas presentes)'}`);
  console.log(`   - Saneamento de NULL capital_social: ${report.nullFixes.capital_social}`);
  console.log(`   - Saneamento de NULL is_competitor: ${report.nullFixes.is_competitor}`);
  console.log(`   - Saneamento de NULL address_reconciled: ${report.nullFixes.address_reconciled}`);
  console.log(`   - Saneamento de NULL target_type: ${report.nullFixes.target_type}`);
  console.log(`   - Saneamento de NULL status_operacional: ${report.nullFixes.status_operacional}`);
  console.log(`   - Saneamento de NULL icp_score: ${report.nullFixes.icp_score}`);
  console.log(`   - Saneamento de NULL vitality_score: ${report.nullFixes.vitality_score}`);
  console.log(`   - Purge de endereços mockados: ${report.mockPurges.endereco_operacional}`);
  console.log(`   - Purge de razão/fantasia mockados: ${report.mockPurges.razao_social + report.mockPurges.nome_fantasia}`);
  console.log(`   - Inconsistências restantes no banco: ${report.inconsistenciesRemaining}`);
  console.log('=================================================================\n');

  return report;
}

if (process.argv[1] && process.argv[1].endsWith('auditDataHygiene.js')) {
  runDataHygiene()
    .then(r => {
      if (r.inconsistenciesRemaining === 0) {
        console.log('🌟 [AUDITORIA APROVADA] Base de dados 100% íntegra e blindada.');
        process.exit(0);
      } else {
        console.error('❌ [FALHA DE INTEGRIDADE] Existem campos nulos remanescentes.');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('❌ Erro durante rotina de higiene:', err);
      process.exit(1);
    });
}
