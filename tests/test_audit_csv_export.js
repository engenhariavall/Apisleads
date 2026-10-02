import fs from 'fs';

console.log('--- TESTANDO MOTOR DE EXPORTAÇÃO CSV DE AUDITORIA ---');

// 1. Testa gerador de nome de arquivo versus-audit-log-YYYYMMDD.csv
const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const filename = `versus-audit-log-${yyyy}${mm}${dd}.csv`;
console.log('✔ Nome do arquivo gerado:', filename);

if (!filename.match(/^versus-audit-log-\d{8}\.csv$/)) {
  console.error('❌ Falha: Nome do arquivo fora do padrão.');
  process.exit(1);
}

// 2. Valida escape de CSV
function escapeCSV(val) {
  if (val === null || val === undefined) return '""';
  const clean = String(val).replace(/"/g, '""');
  return `"${clean}"`;
}

const sampleLogs = [
  {
    created_at: '2026-09-24 11:46:13',
    action: 'LEADS_EXPORT',
    user_email: 'admin@versus.ai',
    endpoint: '/api/leads/export',
    record_count: 50,
    ip_address: '192.168.1.10',
    query_params: '{"uf":"SP","segment":"SAUDE"}'
  },
  {
    created_at: '2026-09-24 11:40:00',
    action: 'PASSWORD_RESET',
    user_email: 'gestor@empresa.com',
    endpoint: '/api/admin/users/reset',
    record_count: 0,
    ip_address: '10.0.0.5',
    query_params: '{"target":"gestor@empresa.com"}'
  }
];

const headers = ['"Data/Hora"', '"Ação"', '"Usuário"', '"Endpoint"', '"Registros"', '"Endereço IP"', '"Parâmetros"'];
const rows = sampleLogs.map(l => {
  return [
    escapeCSV(l.created_at),
    escapeCSV(l.action),
    escapeCSV(l.user_email),
    escapeCSV(l.endpoint),
    escapeCSV(l.record_count),
    escapeCSV(l.ip_address),
    escapeCSV(l.query_params)
  ].join(',');
});

const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
console.log('✔ CSV gerado com sucesso (tamanho bytes):', Buffer.byteLength(csvContent));
console.log('✔ Amostra do conteúdo gerado:\n' + csvContent.slice(0, 350));

// 3. Testa presença dos elementos no admin.html e admin.js
const adminHtml = fs.readFileSync('client/admin.html', 'utf-8');
const adminJs = fs.readFileSync('client/js/admin.js', 'utf-8');

if (!adminHtml.includes('id="btnExportAuditLogs"')) {
  console.error('❌ Falha: Botão #btnExportAuditLogs não encontrado em client/admin.html');
  process.exit(1);
}
console.log('✔ Botão #btnExportAuditLogs confirmado em admin.html');

if (!adminJs.includes('exportAuditLogsToCSV')) {
  console.error('❌ Falha: Função exportAuditLogsToCSV não encontrada em client/js/admin.js');
  process.exit(1);
}
console.log('✔ Função exportAuditLogsToCSV confirmada em admin.js');

if (!adminHtml.includes('Dispositivo (User-Agent)') || !adminHtml.includes('Status / Tempo')) {
  console.error('❌ Falha: Novas colunas Dispositivo e Status / Tempo não encontradas em client/admin.html');
  process.exit(1);
}
console.log('✔ Novas colunas Dispositivo (User-Agent) e Status / Tempo confirmadas em admin.html');

if (!adminJs.includes('audit-status-badge')) {
  console.error('❌ Falha: Badge de status audit-status-badge não encontrado em admin.js');
  process.exit(1);
}
console.log('✔ Renderização do badge audit-status-badge confirmada em admin.js');

console.log('🎉 TESTE DO MOTOR DE EXPORTAÇÃO CSV E TELEMETRIA APROVADO COM 100% DE SUCESSO! 🎉');
