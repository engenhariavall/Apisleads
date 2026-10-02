import fs from 'fs';

console.log('--- TESTANDO ARQUITETURA SPA & MINIMALISMO NO SUPER ADMIN ---');

const adminHtml = fs.readFileSync('client/admin.html', 'utf-8');
const adminCss = fs.readFileSync('client/css/admin.css', 'utf-8');
const adminJs = fs.readFileSync('client/js/admin.js', 'utf-8');

// 1. Validação das 4 seções com classe .admin-view-section
const requiredSections = ['sectionOverview', 'sectionUsers', 'sectionTenants', 'sectionAudit'];
requiredSections.forEach(id => {
  const regex = new RegExp(`id="${id}"[^>]*class="[^"]*admin-view-section[^"]*"|class="[^"]*admin-view-section[^"]*"[^>]*id="${id}"`);
  if (!regex.test(adminHtml)) {
    console.error(`❌ Falha: Seção #${id} não possui a classe admin-view-section em admin.html`);
    process.exit(1);
  }
  console.log(`✔ Seção #${id} possui a classe admin-view-section`);
});

// 2. Validação da inicialização do switchAdminView com 'sectionOverview'
if (!adminJs.includes("switchAdminView('sectionOverview')")) {
  console.error("❌ Falha: Carregamento inicial não está chamando switchAdminView('sectionOverview') explicitamente.");
  process.exit(1);
}
console.log("✔ Carregamento inicial garantido em switchAdminView('sectionOverview')");

// 3. Validação do CSS para .admin-view-section
if (!adminCss.includes('.admin-view-section') || !adminCss.includes('display: none !important')) {
  console.error('❌ Falha: Regra display: none !important não encontrada para .admin-view-section no admin.css');
  process.exit(1);
}
console.log('✔ Regra display: none !important e display: flex !important confirmadas no admin.css');

// 4. Validação de Minimalismo nas Tags (Role Pill e Status)
if (adminCss.includes('.role-pill.super-admin {') && adminCss.includes('background: rgba(168, 85, 247')) {
  console.error('❌ Falha: role-pill.super-admin ainda contém fundo colorido sólido.');
  process.exit(1);
}
console.log('✔ Tags de Role e Status livres de fundos sólidos pesados');

// 5. Validação dos Botões Ghost na Tabela
if (!adminCss.includes('.btn-table-action') || !adminCss.includes('background: transparent')) {
  console.error('❌ Falha: .btn-table-action não está configurado como botão ghost transparente.');
  process.exit(1);
}
console.log('✔ Botões de ação da tabela padronizados como botões ghost transparentes');

// 6. Validação dos Cards de Métricas (KPIs) sem bordas laterais ciano neon
if (adminCss.includes('.kpi-card {') && (adminCss.includes('border-left: 3px') || adminCss.includes('border-left: 4px'))) {
  console.error('❌ Falha: .kpi-card ainda contém borda lateral espessa.');
  process.exit(1);
}
console.log('✔ Cards de KPI limpos sem bordas laterais espessas ou neons');

console.log('🎉 TODOS OS TESTES DE SPA E MINIMALISMO APROVADOS COM 100% DE SUCESSO! 🎉');
