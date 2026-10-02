import fs from 'fs';
import assert from 'assert';

console.log('--- 1. VERIFICANDO NOMENCLATURA API LEADS ---');
const adminHtml = fs.readFileSync('client/admin.html', 'utf8');
assert(!adminHtml.includes('CRM Operacional'), 'admin.html não deve conter CRM Operacional');
assert(adminHtml.includes('Painel API Leads'), 'admin.html deve conter Painel API Leads no menu');
assert(adminHtml.includes('Acessar API Leads'), 'admin.html deve conter Acessar API Leads no topo');
console.log('✔ admin.html validado: CRM Operacional substituído por API Leads.');

const preloadJs = fs.readFileSync('client/js/preload.js', 'utf8');
assert(!preloadJs.includes('CRM Operacional'), 'preload.js não deve conter CRM Operacional');
assert(preloadJs.includes('Iniciando API Leads...'), 'preload.js deve conter Iniciando API Leads...');
console.log('✔ preload.js validado: mensagens de transição atualizadas.');

const loginCanvasJs = fs.readFileSync('client/js/login-canvas.js', 'utf8');
assert(!loginCanvasJs.includes('CRM Operacional'), 'login-canvas.js não deve conter CRM Operacional');
assert(loginCanvasJs.includes('Iniciando API Leads...'), 'login-canvas.js deve conter Iniciando API Leads...');
console.log('✔ login-canvas.js validado: mensagens de transição atualizadas.');

console.log('\n--- 2. VERIFICANDO ETAPA 1: CONTROLE DE SESSÃO NO HEADER ---');
const indexHtml = fs.readFileSync('client/index.html', 'utf8');
assert(indexHtml.includes('id="btnToggleProfileMenu"'), 'index.html deve conter btnToggleProfileMenu');
assert(indexHtml.includes('id="topbarProfileDropdown"'), 'index.html deve conter topbarProfileDropdown');
assert(indexHtml.includes('id="btnDropdownAdmin"'), 'index.html deve conter btnDropdownAdmin');
assert(indexHtml.includes('id="btnHeaderLogout"'), 'index.html deve conter btnHeaderLogout');
assert(indexHtml.includes('Voltar para Administração'), 'index.html deve conter texto Voltar para Administração');
assert(indexHtml.includes('Sair do Sistema'), 'index.html deve conter texto Sair do Sistema');
console.log('✔ index.html validado: componentes de perfil e dropdown de navegação presentes.');

const stylesCss = fs.readFileSync('client/css/styles.css', 'utf8');
assert(stylesCss.includes('.topbar-user-control'), 'styles.css deve conter .topbar-user-control');
assert(stylesCss.includes('.topbar-profile-dropdown'), 'styles.css deve conter .topbar-profile-dropdown');
assert(stylesCss.includes('.btn-topbar-profile'), 'styles.css deve conter .btn-topbar-profile');
console.log('✔ styles.css validado: estilização do componente de perfil aplicada.');

console.log('\n--- 3. VERIFICANDO ETAPA 2 & 3: LOGOUT SEGURO & ROTEAMENTO DE ROLES ---');
const appJs = fs.readFileSync('client/js/app.js', 'utf8');
assert(appJs.includes('window.handleLogout = handleLogout'), 'app.js deve exportar window.handleLogout');
assert(appJs.includes("localStorage.removeItem('versus_token')"), 'app.js handleLogout deve remover versus_token');
assert(appJs.includes("localStorage.removeItem('versus_role')"), 'app.js handleLogout deve remover versus_role');
assert(appJs.includes('sessionStorage.clear()'), 'app.js handleLogout deve limpar sessionStorage');
assert(appJs.includes("isSuperAdmin ? 'flex' : 'none'"), 'app.js deve controlar visibilidade do botão admin estritamente por role SUPER_ADMIN');
console.log('✔ app.js validado: handleLogout, controle de role e binds de eventos ativos.');

const adminJs = fs.readFileSync('client/js/admin.js', 'utf8');
assert(adminJs.includes('window.handleLogout = handleLogout'), 'admin.js deve conter window.handleLogout');
assert(adminJs.includes('handleLogout()'), 'admin.js deve chamar handleLogout no popoverBtnLogout');
console.log('✔ admin.js validado: logout seguro com pré-loader integrado.');

console.log('\n🎉 TODOS OS TESTES ESTATICOS FORAM APROVADOS COM SUCESSO! 🎉');
