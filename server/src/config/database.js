import './env.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'leads.sqlite');

let DatabaseSync = null;
try {
  const sqliteMod = await import('node:sqlite');
  DatabaseSync = sqliteMod.DatabaseSync;
} catch (errSqlite) {
  console.warn('⚠️ [SQLITE] Driver nativo node:sqlite não disponível neste runtime:', errSqlite.message);
}

// ------------------------------------------------------------------------------
// 1. Inicialização do Driver SQLite Local (Fallback / Dev)
// ------------------------------------------------------------------------------
let sqliteDb = null;
if (DatabaseSync) {
  try {
    sqliteDb = new DatabaseSync(DB_PATH);
    sqliteDb.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
    `);
  } catch (errInit) {
    console.warn('⚠️ [SQLITE INIT ERROR]:', errInit.message);
  }
}

// Criação das tabelas base SQLite
if (sqliteDb) {
  sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS segments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    icon TEXT,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS segment_cnaes (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL,
    cnae_code TEXT NOT NULL,
    cnae_description TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT 'BUYER',
    FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    cnpj TEXT UNIQUE NOT NULL,
    cnpj_raw TEXT NOT NULL,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnae_principal_codigo TEXT NOT NULL,
    cnae_principal_descricao TEXT NOT NULL,
    cnaes_secundarios TEXT,
    natureza_juridica TEXT,
    porte TEXT NOT NULL,
    capital_social REAL DEFAULT 0,
    target_type TEXT NOT NULL DEFAULT 'BUYER',
    situacao_cadastral TEXT DEFAULT 'ATIVA',
    qsa TEXT,
    logradouro TEXT,
    numero TEXT,
    bairro TEXT,
    cep TEXT,
    municipio TEXT NOT NULL,
    uf TEXT NOT NULL,
    telefone TEXT,
    telefone_sanitized TEXT,
    email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  `);
}

// Migração segura de colunas no SQLite
try {
  const leadCols = sqliteDb.prepare("PRAGMA table_info(leads)").all();
  if (leadCols.length > 0) {
    if (!leadCols.some(c => c.name === 'target_type')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN target_type TEXT NOT NULL DEFAULT 'BUYER';");
    if (!leadCols.some(c => c.name === 'qsa')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN qsa TEXT;");
    if (!leadCols.some(c => c.name === 'latitude')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN latitude REAL;");
    if (!leadCols.some(c => c.name === 'longitude')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN longitude REAL;");
    if (!leadCols.some(c => c.name === 'vertical_type')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN vertical_type TEXT DEFAULT 'GERAL';");
    if (!leadCols.some(c => c.name === 'vertical_data')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN vertical_data TEXT;");
    if (!leadCols.some(c => c.name === 'audit_status')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN audit_status TEXT DEFAULT NULL;");
    if (!leadCols.some(c => c.name === 'audited_at')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN audited_at TEXT DEFAULT NULL;");
    if (!leadCols.some(c => c.name === 'audited_by')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN audited_by TEXT DEFAULT 'OPERADOR_LOCAL';");
    if (!leadCols.some(c => c.name === 'endereco_operacional')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN endereco_operacional TEXT DEFAULT NULL;");
    if (!leadCols.some(c => c.name === 'lat_operacional')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN lat_operacional REAL DEFAULT NULL;");
    if (!leadCols.some(c => c.name === 'lng_operacional')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN lng_operacional REAL DEFAULT NULL;");
    if (!leadCols.some(c => c.name === 'address_reconciled')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN address_reconciled INTEGER DEFAULT 0;");
    if (!leadCols.some(c => c.name === 'reconciliation_source')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN reconciliation_source TEXT DEFAULT NULL;");
    if (!leadCols.some(c => c.name === 'reconciliation_confidence')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN reconciliation_confidence REAL DEFAULT NULL;");
    if (!leadCols.some(c => c.name === 'is_competitor')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN is_competitor INTEGER NOT NULL DEFAULT 0;");
    if (!leadCols.some(c => c.name === 'tenant_id')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-root-default';");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);");
    }
    // FASE 40: Telemetria do Cavalo de Troia (Tracking de Acesso aos Dossiês)
    if (!leadCols.some(c => c.name === 'visualizacoes_dossie')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN visualizacoes_dossie INTEGER NOT NULL DEFAULT 0;");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_leads_visualizacoes_dossie ON leads(visualizacoes_dossie);");
    }
    if (!leadCols.some(c => c.name === 'ultimo_acesso_dossie')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN ultimo_acesso_dossie TEXT DEFAULT NULL;");
    }
    if (!leadCols.some(c => c.name === 'ip_acesso')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN ip_acesso TEXT DEFAULT NULL;");
    }
    // FASE 47: Injeção Manual de Leads e Tagging para Custom Audiences / Warm-up
    if (!leadCols.some(c => c.name === 'origem')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN origem TEXT DEFAULT 'RECEITA_FEDERAL';");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_leads_origem ON leads(origem);");
    }
    if (!leadCols.some(c => c.name === 'tag')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN tag TEXT DEFAULT NULL;");
    }
    if (!leadCols.some(c => c.name === 'contato_nome')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN contato_nome TEXT DEFAULT NULL;");
    }
    if (!leadCols.some(c => c.name === 'updated_at')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN updated_at TEXT DEFAULT NULL;");
    }
    // FASE ASSERTIVA v3: Colunas para Score de Crédito e Procedência de Bureau
    if (!leadCols.some(c => c.name === 'score_credito')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN score_credito INTEGER DEFAULT NULL;");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_leads_score_credito ON leads(score_credito);");
    }
    if (!leadCols.some(c => c.name === 'faixa_risco_credito')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN faixa_risco_credito TEXT DEFAULT NULL;");
    }
    if (!leadCols.some(c => c.name === 'bureau_status')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN bureau_status TEXT DEFAULT NULL;");
    }
    if (!leadCols.some(c => c.name === 'bureau_updated_at')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN bureau_updated_at TEXT DEFAULT NULL;");
    }
    if (!leadCols.some(c => c.name === 'bureau_payload')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN bureau_payload TEXT DEFAULT NULL;");
    }
    sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_leads_cnpj_raw ON leads(cnpj_raw);");
  }
} catch (err) {
  console.warn('Verificação de colunas leads (SQLite):', err.message);
}

// FASE 40: Tabela Histórica Detalhada de Acessos ao Dossiê Público
try {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS lead_dossier_views (
      id TEXT PRIMARY KEY,
      lead_cnpj TEXT NOT NULL,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      ip_address TEXT,
      user_agent TEXT,
      referrer TEXT,
      query_params TEXT DEFAULT '{}',
      viewed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_dossier_views_cnpj ON lead_dossier_views(lead_cnpj);
    CREATE INDEX IF NOT EXISTS idx_dossier_views_tenant ON lead_dossier_views(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_dossier_views_date ON lead_dossier_views(viewed_at DESC);
  `);
} catch (err) {
  console.warn('Criação da tabela lead_dossier_views (SQLite):', err.message);
}

try {
  const cnaeCols = sqliteDb.prepare("PRAGMA table_info(segment_cnaes)").all();
  if (cnaeCols.length > 0 && !cnaeCols.some(c => c.name === 'target_type')) {
    sqliteDb.exec("ALTER TABLE segment_cnaes ADD COLUMN target_type TEXT NOT NULL DEFAULT 'BUYER';");
  }
} catch (err) {
  console.warn('Verificação de coluna segment_cnaes (SQLite):', err.message);
}

// Fase 31: Migração de Telemetria Avançada em audit_logs (status_code e latency_ms)
try {
  const auditCols = sqliteDb.prepare("PRAGMA table_info(audit_logs)").all();
  if (auditCols.length > 0) {
    if (!auditCols.some(c => c.name === 'status_code')) {
      sqliteDb.exec("ALTER TABLE audit_logs ADD COLUMN status_code INTEGER DEFAULT 200;");
    }
    if (!auditCols.some(c => c.name === 'latency_ms')) {
      sqliteDb.exec("ALTER TABLE audit_logs ADD COLUMN latency_ms REAL DEFAULT 0;");
    }
    if (!auditCols.some(c => c.name === 'tenant_id')) {
      sqliteDb.exec("ALTER TABLE audit_logs ADD COLUMN tenant_id TEXT DEFAULT 'tenant-root-default';");
    }
  }
} catch (err) {
  console.warn('Verificação de colunas audit_logs (SQLite):', err.message);
}

// Fase 32: Migração de Coluna tenant_id na tabela users
try {
  const userCols = sqliteDb.prepare("PRAGMA table_info(users)").all();
  if (userCols.length > 0) {
    if (!userCols.some(c => c.name === 'tenant_id')) {
      sqliteDb.exec("ALTER TABLE users ADD COLUMN tenant_id TEXT DEFAULT 'tenant-root-default';");
    }
  }
} catch (err) {
  console.warn('Verificação de coluna tenant_id em users (SQLite):', err.message);
}

// Fase 35: Migração de Colunas de Inbound & Configurações do Tenant (Multi-Tenant)
try {
  const tenantCols = sqliteDb.prepare("PRAGMA table_info(tenants)").all();
  if (tenantCols.length > 0) {
    if (!tenantCols.some(c => c.name === 'whatsapp_inbound')) {
      sqliteDb.exec("ALTER TABLE tenants ADD COLUMN whatsapp_inbound TEXT DEFAULT NULL;");
    }
    if (!tenantCols.some(c => c.name === 'settings_json')) {
      sqliteDb.exec("ALTER TABLE tenants ADD COLUMN settings_json TEXT DEFAULT '{}';");
    }
    if (!tenantCols.some(c => c.name === 'allowed_niches')) {
      sqliteDb.exec("ALTER TABLE tenants ADD COLUMN allowed_niches TEXT DEFAULT '[\"agro\",\"b2b\",\"saude\"]';");
      console.log('📦 [DB FASE59] Coluna allowed_niches adicionada à tabela tenants.');
    }
  }
} catch (err) {
  console.warn('Verificação de colunas em tenants (SQLite):', err.message);
}

// Fase 32: Seed do Tenant Raiz Padrão e Tenants Corporativos
try {
  sqliteDb.exec(`
    INSERT OR IGNORE INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit)
    VALUES ('tenant-root-default', 'VERSUS INTELLIGENCE (ROOT)', '00.000.000/0001-00', 'ENTERPRISE UNLIMITED', 'ACTIVE', 999, 999999, 9999999);

    INSERT OR IGNORE INTO tenants (id, name, cnpj, plan, status, max_users, daily_quota_limit, monthly_quota_limit)
    VALUES ('tenant-e6094206', 'Avall Marketing e Vendas', NULL, 'ENTERPRISE UNLIMITED', 'ACTIVE', 5, 5000, 100000);
  `);
  // Atualiza usuários e logs órfãos para o tenant raiz caso tenham ficado com NULL
  sqliteDb.exec(`
    UPDATE users SET tenant_id = 'tenant-root-default' WHERE tenant_id IS NULL;
    UPDATE audit_logs SET tenant_id = 'tenant-root-default' WHERE tenant_id IS NULL;
  `);
} catch (err) {
  console.warn('Bootstrap do Tenant Raiz (SQLite):', err.message);
}

// Fase 39: Migração de Colunas de Enriquecimento OSINT Real em leads_socios
try {
  const sociosCols = sqliteDb.prepare("PRAGMA table_info(leads_socios)").all();
  if (sociosCols.length > 0) {
    if (!sociosCols.some(c => c.name === 'email_validado')) {
      sqliteDb.exec("ALTER TABLE leads_socios ADD COLUMN email_validado TEXT DEFAULT NULL;");
    }
    if (!sociosCols.some(c => c.name === 'email_validation_status')) {
      sqliteDb.exec("ALTER TABLE leads_socios ADD COLUMN email_validation_status TEXT DEFAULT NULL;");
    }
    if (!sociosCols.some(c => c.name === 'linkedin_url_real')) {
      sqliteDb.exec("ALTER TABLE leads_socios ADD COLUMN linkedin_url_real TEXT DEFAULT NULL;");
    }
  }
} catch (err) {
  console.warn('Verificação de colunas leads_socios (SQLite):', err.message);
}

// Índices B-Tree SQLite
sqliteDb.exec(`
  CREATE INDEX IF NOT EXISTS idx_leads_uf_municipio ON leads(uf, municipio);
  CREATE INDEX IF NOT EXISTS idx_leads_uf ON leads(uf);
  CREATE INDEX IF NOT EXISTS idx_leads_cnae ON leads(cnae_principal_codigo);
  CREATE INDEX IF NOT EXISTS idx_leads_porte ON leads(porte);
  CREATE INDEX IF NOT EXISTS idx_leads_capital ON leads(capital_social);
  CREATE INDEX IF NOT EXISTS idx_leads_target_type ON leads(target_type);
  CREATE INDEX IF NOT EXISTS idx_leads_coords ON leads(latitude, longitude);
  CREATE INDEX IF NOT EXISTS idx_leads_cnpj_raw ON leads(cnpj_raw);
  CREATE INDEX IF NOT EXISTS idx_leads_razao ON leads(razao_social);
  CREATE INDEX IF NOT EXISTS idx_leads_vertical_type ON leads(vertical_type);
  CREATE INDEX IF NOT EXISTS idx_leads_is_competitor ON leads(is_competitor);

  CREATE INDEX IF NOT EXISTS idx_segment_cnaes_seg ON segment_cnaes(segment_id);
  CREATE INDEX IF NOT EXISTS idx_segment_cnaes_code ON segment_cnaes(cnae_code);
  CREATE INDEX IF NOT EXISTS idx_segment_cnaes_target ON segment_cnaes(target_type);

  CREATE TABLE IF NOT EXISTS municipal_indicators (
    ibge_code                TEXT PRIMARY KEY,
    municipio                TEXT NOT NULL,
    uf                       TEXT NOT NULL,
    populacao_estimada       INTEGER DEFAULT 0,
    pib_per_capita           REAL DEFAULT 0,
    consumo_mensal_per_capita REAL DEFAULT 0,
    consumo_setorial_json    TEXT DEFAULT '{}',
    ipc_score                REAL DEFAULT 0,
    frota_total              INTEGER DEFAULT 0,
    frota_pesados_agro       INTEGER DEFAULT 0,
    frota_caminhoes_tratores INTEGER DEFAULT 0,
    hectares_lavoura_estimados REAL DEFAULT 0,
    obras_ativas_estimadas   INTEGER DEFAULT 0,
    metragem_alvaras_m2      REAL DEFAULT 0,
    leitos_totais            INTEGER DEFAULT 0,
    estabelecimentos_saude   INTEGER DEFAULT 0,
    densidade_leitos_mil_hab REAL DEFAULT 0,
    comarcas_varas_total     INTEGER DEFAULT 0,
    volume_processual_anual  INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_munic_uf        ON municipal_indicators(uf);
  CREATE INDEX IF NOT EXISTS idx_munic_municipio ON municipal_indicators(municipio);
  CREATE INDEX IF NOT EXISTS idx_munic_ipc       ON municipal_indicators(ipc_score DESC);

  -- Fase 32: Arquitetura Multi-Tenant Corporativa & Governança de Empresas
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cnpj TEXT UNIQUE,
    plan TEXT NOT NULL DEFAULT 'ENTERPRISE',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    max_users INTEGER NOT NULL DEFAULT 5,
    daily_quota_limit INTEGER NOT NULL DEFAULT 500,
    monthly_quota_limit INTEGER NOT NULL DEFAULT 5000,
    whatsapp_inbound TEXT DEFAULT NULL,
    settings_json TEXT DEFAULT '{}',
    allowed_niches TEXT DEFAULT '["agro","b2b","saude"]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Fase 26 & 32: Painel Admin Master, Autenticação, RBAC & Multi-Tenant
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'tenant-root-default',
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    access_password TEXT DEFAULT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'VISUALIZADOR',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT DEFAULT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS export_quotas (
    user_id TEXT PRIMARY KEY,
    daily_limit INTEGER NOT NULL DEFAULT 500,
    monthly_limit INTEGER NOT NULL DEFAULT 5000,
    used_today INTEGER NOT NULL DEFAULT 0,
    used_this_month INTEGER NOT NULL DEFAULT 0,
    last_reset_date TEXT DEFAULT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'tenant-root-default',
    user_id TEXT,
    user_email TEXT,
    action TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    query_params TEXT DEFAULT '{}',
    records_count INTEGER DEFAULT 0,
    ip_address TEXT,
    user_agent TEXT,
    status_code INTEGER DEFAULT 200,
    latency_ms REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
  CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

  -- Fase 27: Motor ABM, Enriquecimento QSA & Cavalo de Troia B2B
  CREATE TABLE IF NOT EXISTS leads_socios (
    id TEXT PRIMARY KEY,
    lead_cnpj TEXT NOT NULL,
    nome TEXT NOT NULL,
    qualificacao TEXT DEFAULT 'Sócio / Administrador',
    faixa_etaria TEXT DEFAULT NULL,
    pais TEXT DEFAULT 'Brasil',
    representante_legal TEXT DEFAULT NULL,
    qualificacao_rep_legal TEXT DEFAULT NULL,
    data_entrada TEXT DEFAULT NULL,
    email_presumido TEXT DEFAULT NULL,
    email_validado TEXT DEFAULT NULL,
    email_validation_status TEXT DEFAULT NULL,
    telefone_presumido TEXT DEFAULT NULL,
    linkedin_presumido TEXT DEFAULT NULL,
    linkedin_url_real TEXT DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_socios_lead_cnpj ON leads_socios(lead_cnpj);
  CREATE INDEX IF NOT EXISTS idx_socios_nome ON leads_socios(nome);

  -- FASES 44 E 45: MASTERPLAN MOTOR FUNDIÁRIO B2B (SIGEF / INCRA / CAR & MALHAS GEOESPACIAIS)
  CREATE TABLE IF NOT EXISTS propriedades_rurais (
    id TEXT PRIMARY KEY,
    id_sigef TEXT UNIQUE,
    codigo_imovel TEXT,
    nome_imovel TEXT NOT NULL,
    municipio TEXT NOT NULL,
    uf TEXT NOT NULL,
    area_hectares REAL DEFAULT 0,
    geometria_poligono TEXT NOT NULL, -- GeoJSON Feature ou Polygon em formato String JSON
    centroide_lat REAL,
    centroide_lng REAL,
    raio_abrangencia_km REAL DEFAULT 5,
    nome_titular TEXT NOT NULL,
    cpf_cnpj_titular TEXT,
    status_geo TEXT NOT NULL DEFAULT 'SEM_GEO', -- 'CERTIFICADO' ou 'SEM_GEO'
    intent_score INTEGER DEFAULT 0, -- Score de Intenção de Compra
    intent_classification TEXT DEFAULT 'COLD', -- 'HOT', 'WARM', 'COLD'
    intent_triggers TEXT DEFAULT '[]', -- JSON Array de motivos de intenção
    whatsapp_validado TEXT DEFAULT NULL,
    linkedin_url_real TEXT DEFAULT NULL,
    email_validado TEXT DEFAULT NULL,
    osint_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'ENRICHED', 'NOT_FOUND'
    dados_agronomicos TEXT DEFAULT NULL, -- FASE 49: Perfil de Uso do Solo e Cultivo (MapBiomas / Sentinel)
    tenant_id TEXT DEFAULT 'tenant-root-default',
    data_ultima_sync TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prop_rurais_sigef ON propriedades_rurais(id_sigef);
  CREATE INDEX IF NOT EXISTS idx_prop_rurais_uf_mun ON propriedades_rurais(uf, municipio);
  CREATE INDEX IF NOT EXISTS idx_prop_rurais_status_geo ON propriedades_rurais(status_geo);
  CREATE INDEX IF NOT EXISTS idx_prop_rurais_titular ON propriedades_rurais(nome_titular);
  CREATE INDEX IF NOT EXISTS idx_prop_rurais_cpf_cnpj ON propriedades_rurais(cpf_cnpj_titular);
  CREATE INDEX IF NOT EXISTS idx_prop_rurais_intent ON propriedades_rurais(intent_classification);

  -- BASE ESPELHO DO CAR HISTÓRICO PRÉ-MAIO/2023 (DESMASCARAMENTO DE DECLARANTES)
  CREATE TABLE IF NOT EXISTS car_proprietarios_historico (
    codigo_car TEXT PRIMARY KEY,
    nome_proprietario TEXT NOT NULL,
    cpf_cnpj_parcial TEXT,
    municipio TEXT,
    uf TEXT,
    condicao TEXT,
    area_hectares REAL,
    matricula_declarada TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_car_hist_car ON car_proprietarios_historico(codigo_car);
  CREATE INDEX IF NOT EXISTS idx_car_hist_mun_uf ON car_proprietarios_historico(uf, municipio);
  CREATE INDEX IF NOT EXISTS idx_car_hist_nome ON car_proprietarios_historico(nome_proprietario);

  -- FASE 52 (PASSO 3): Diários Oficiais e Editais Ambientais (DOU / DOEs)
  CREATE TABLE IF NOT EXISTS editais_diarios_oficiais (
    id TEXT PRIMARY KEY,
    codigo_car TEXT,
    uf TEXT,
    municipio TEXT,
    nome_titular TEXT NOT NULL,
    cpf_cnpj TEXT,
    tipo_ato TEXT DEFAULT 'NOTIFICACAO_VALIDACAO_CAR', -- 'NOTIFICACAO_VALIDACAO_CAR', 'OUTORGA_IRRIGACAO', 'LICENCA_AMBIENTAL', 'TERMO_EMBARGO'
    orgao_emissor TEXT DEFAULT 'IBAMA', -- 'IBAMA', 'SEMA', 'FEPAM', 'ANA', 'INCRA'
    diario_oficial_tipo TEXT DEFAULT 'DOU', -- 'DOU', 'DOE'
    diario_oficial_numero TEXT,
    diario_oficial_data TEXT,
    diario_oficial_url TEXT,
    conteudo_resumo TEXT,
    tenant_id TEXT DEFAULT 'tenant-root-default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_editais_car ON editais_diarios_oficiais(codigo_car);
  CREATE INDEX IF NOT EXISTS idx_editais_mun_uf ON editais_diarios_oficiais(municipio, uf);
  CREATE INDEX IF NOT EXISTS idx_editais_cpf_cnpj ON editais_diarios_oficiais(cpf_cnpj);
  CREATE INDEX IF NOT EXISTS idx_editais_nome ON editais_diarios_oficiais(nome_titular);

  -- Fase 44/45 Etapa 5: Auditoria e Resiliência de Webhooks/Mensagens Inbound do WhatsApp (Catch-Up & Offline Sync)
  CREATE TABLE IF NOT EXISTS whatsapp_inbound_messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'tenant-root-default',
    sender_phone TEXT NOT NULL,
    recipient_phone TEXT,
    message_text TEXT,
    message_type TEXT DEFAULT 'text',
    payload_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'RECEIVED', -- 'RECEIVED', 'PROCESSED', 'FAILED'
    received_at TEXT DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_wa_inbound_tenant ON whatsapp_inbound_messages(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_wa_inbound_sender ON whatsapp_inbound_messages(sender_phone);
  CREATE INDEX IF NOT EXISTS idx_wa_inbound_received ON whatsapp_inbound_messages(received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_wa_inbound_status ON whatsapp_inbound_messages(status);

  -- FASE 59: EPIC MULTI-TENANT — MOTOR DE ROTEAMENTO DE APIS E TEST DRIVE
  CREATE TABLE IF NOT EXISTS super_admin_settings (
    id TEXT PRIMARY KEY DEFAULT 'host_master_settings',
    master_openai_key TEXT DEFAULT NULL,
    master_meta_app_id TEXT DEFAULT NULL,
    master_meta_token TEXT DEFAULT NULL,
    master_bureau_key TEXT DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tenant_api_configs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    openai_key TEXT DEFAULT NULL,
    meta_app_id TEXT DEFAULT NULL,
    meta_token TEXT DEFAULT NULL,
    bureau_key TEXT DEFAULT NULL,
    use_master_key INTEGER NOT NULL DEFAULT 1,
    test_drive_expires_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tenant_api_configs_tenant ON tenant_api_configs(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tenant_api_configs_test_drive ON tenant_api_configs(use_master_key, test_drive_expires_at);

  -- FASE ASSERTIVA v3: Tabela de Cache Anti-Desperdício para Consultas de Bureau
  CREATE TABLE IF NOT EXISTS bureau_cache_consultas (
    id TEXT PRIMARY KEY,
    documento_limpo TEXT NOT NULL,
    tipo_documento TEXT NOT NULL,
    tipo_consulta TEXT NOT NULL DEFAULT 'COMPLETA',
    score_credito INTEGER,
    faixa_risco TEXT,
    renda_faturamento_presumido REAL,
    qtd_protestos INTEGER DEFAULT 0,
    valor_protestos REAL DEFAULT 0,
    situacao_cadastral TEXT,
    telefones_json TEXT,
    whatsapp_principal TEXT,
    dados_completos_json TEXT,
    tenant_id TEXT DEFAULT 'tenant-root-default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_bureau_cache_doc ON bureau_cache_consultas(documento_limpo);
  CREATE INDEX IF NOT EXISTS idx_bureau_cache_tenant ON bureau_cache_consultas(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_bureau_cache_created ON bureau_cache_consultas(created_at DESC);

  -- FASE ASSERTIVA v3: Tabela de Comentarios / Anotacoes do CRM de Consulta
  CREATE TABLE IF NOT EXISTS bureau_comments (
    id TEXT PRIMARY KEY,
    documento TEXT NOT NULL,
    autor TEXT DEFAULT 'operador@sistema.local',
    texto TEXT NOT NULL,
    tenant_id TEXT DEFAULT 'tenant-root-default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_bureau_comments_doc ON bureau_comments(documento);

  -- FASE CAR HISTÓRICO: Tabela Espelho Pré-Maio/2023 de Titulares Rurais (SICAR Open Data)
  CREATE TABLE IF NOT EXISTS car_proprietarios_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_car TEXT UNIQUE NOT NULL,
    nome_proprietario TEXT NOT NULL,
    cpf_cnpj_parcial TEXT,
    municipio TEXT NOT NULL,
    uf TEXT NOT NULL DEFAULT 'RS',
    condicao TEXT DEFAULT 'PROPRIETÁRIO',
    area_hectares REAL DEFAULT 0,
    matricula_declarada TEXT,
    nome_imovel_declarado TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_car_hist_codigo ON car_proprietarios_historico(codigo_car);
  CREATE INDEX IF NOT EXISTS idx_car_hist_mun_uf ON car_proprietarios_historico(uf, municipio);
  CREATE INDEX IF NOT EXISTS idx_car_hist_proprietario ON car_proprietarios_historico(nome_proprietario);
`);

try {
  const carHistCols = sqliteDb.prepare("PRAGMA table_info(car_proprietarios_historico)").all();
  if (carHistCols.length > 0) {
    if (!carHistCols.some(c => c.name === 'nome_imovel_declarado')) {
      sqliteDb.exec("ALTER TABLE car_proprietarios_historico ADD COLUMN nome_imovel_declarado TEXT DEFAULT NULL;");
    }
    if (!carHistCols.some(c => c.name === 'updated_at')) {
      sqliteDb.exec("ALTER TABLE car_proprietarios_historico ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;");
    }
  }
} catch (err) {
  console.warn('Verificação de colunas car_proprietarios_historico:', err.message);
}

// Fase 44 Etapa 3 & Fase 49: Migração de Colunas de Enriquecimento OSINT e Agronômico em propriedades_rurais
try {
  const propCols = sqliteDb.prepare("PRAGMA table_info(propriedades_rurais)").all();
  if (propCols.length > 0) {
    if (!propCols.some(c => c.name === 'whatsapp_validado')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN whatsapp_validado TEXT DEFAULT NULL;");
    }
    if (!propCols.some(c => c.name === 'linkedin_url_real')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN linkedin_url_real TEXT DEFAULT NULL;");
    }
    if (!propCols.some(c => c.name === 'email_validado')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN email_validado TEXT DEFAULT NULL;");
    }
    if (!propCols.some(c => c.name === 'osint_status')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN osint_status TEXT DEFAULT 'PENDING';");
    }
    if (!propCols.some(c => c.name === 'dados_agronomicos')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN dados_agronomicos TEXT DEFAULT NULL;");
    }
  }
} catch (err) {
  console.warn('Verificação de colunas propriedades_rurais OSINT/Agronômico (SQLite):', err.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 57 — ETAPA 2: SCHEMA AMBIENTAL SICAR/CAR & BUGFIX DE PERSISTÊNCIA
//
// BUGFIX "Falha de API no MT": Imóveis originários do SICAR/CAR chegam sem
// nome_imovel e nome_titular preenchidos (campos opcionais na base pública).
// A restrição NOT NULL sem DEFAULT na tabela causava falha silenciosa de INSERT.
// Solução: relaxar restrição via DEFAULT '' nas colunas afetadas + adicionar
// colunas ambientais do CAR para a Fase 57.
// ─────────────────────────────────────────────────────────────────────────────
try {
  const propCols57 = sqliteDb.prepare("PRAGMA table_info(propriedades_rurais)").all();
  if (propCols57.length > 0) {
    // ── Novos campos ambientais do SICAR/CAR ──────────────────────────────
    if (!propCols57.some(c => c.name === 'codigo_car')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN codigo_car TEXT DEFAULT NULL;");
      console.log('📦 [DB FASE57] Coluna codigo_car adicionada a propriedades_rurais.');
    }
    if (!propCols57.some(c => c.name === 'status_car')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN status_car TEXT DEFAULT NULL;");
      console.log('📦 [DB FASE57] Coluna status_car adicionada a propriedades_rurais.');
    }
    if (!propCols57.some(c => c.name === 'condicao_car')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN condicao_car TEXT DEFAULT NULL;");
      console.log('📦 [DB FASE57] Coluna condicao_car adicionada a propriedades_rurais.');
    }
    if (!propCols57.some(c => c.name === 'tag_fonte')) {
      // DEFAULT 'SIGEF': registros existentes são do SIGEF/INCRA por retrocompatibilidade
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN tag_fonte TEXT NOT NULL DEFAULT 'SIGEF';");
      console.log('📦 [DB FASE57] Coluna tag_fonte adicionada a propriedades_rurais (DEFAULT SIGEF).');
    }
    if (!propCols57.some(c => c.name === 'area_app_ha')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN area_app_ha REAL DEFAULT NULL;");
      console.log('📦 [DB FASE57] Coluna area_app_ha adicionada a propriedades_rurais.');
    }
    if (!propCols57.some(c => c.name === 'area_reserva_legal_ha')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN area_reserva_legal_ha REAL DEFAULT NULL;");
      console.log('📦 [DB FASE57] Coluna area_reserva_legal_ha adicionada a propriedades_rurais.');
    }
    if (!propCols57.some(c => c.name === 'tem_passivo_ambiental')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN tem_passivo_ambiental INTEGER DEFAULT 0;");
      console.log('📦 [DB FASE57] Coluna tem_passivo_ambiental adicionada a propriedades_rurais.');
    }
    if (!propCols57.some(c => c.name === 'alerta_ambiental')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN alerta_ambiental TEXT DEFAULT NULL;");
      console.log('📦 [DB FASE57] Coluna alerta_ambiental adicionada a propriedades_rurais.');
    }

    // ── BUGFIX: Relaxa campos NOT NULL que bloqueavam imóveis do SICAR ────
    // SQLite não suporta ALTER COLUMN diretamente. A solução é garantir que
    // o INSERT/UPSERT em geoFundiarioService sempre forneça um valor fallback
    // para nome_imovel e nome_titular antes de bater no banco.
    // A coluna nome_titular também recebe DEFAULT '' via tabela auxiliar.
    // (Registrado no geoFundiarioService.saveOrUpdateRuralProperty abaixo)

    // ── Índices de busca rápida Fase 57 ──────────────────────────────────
    sqliteDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_prop_rurais_codigo_car ON propriedades_rurais(codigo_car);
      CREATE INDEX IF NOT EXISTS idx_prop_rurais_tag_fonte ON propriedades_rurais(tag_fonte);
      CREATE INDEX IF NOT EXISTS idx_prop_rurais_status_car ON propriedades_rurais(status_car);
      CREATE INDEX IF NOT EXISTS idx_prop_rurais_alerta_ambiental ON propriedades_rurais(alerta_ambiental);
    `);
    console.log('📦 [DB FASE57] Índices CAR criados em propriedades_rurais.');
  }
} catch (err57) {
  console.warn('⚠️ [DB FASE57] Migração de colunas CAR (SQLite):', err57.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 62: MOTOR DE INSCRIÇÃO ESTADUAL (SEFAZ) & PRODUTOR RURAL (PESSOA FÍSICA)
// ─────────────────────────────────────────────────────────────────────────────
try {
  const propCols = sqliteDb.prepare("PRAGMA table_info(propriedades_rurais)").all();
  if (propCols.length > 0) {
    if (!propCols.some(c => c.name === 'inscricao_estadual')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN inscricao_estadual TEXT DEFAULT NULL;");
    if (!propCols.some(c => c.name === 'produtor_pf_nome')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN produtor_pf_nome TEXT DEFAULT NULL;");
    if (!propCols.some(c => c.name === 'produtor_pf_cpf')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN produtor_pf_cpf TEXT DEFAULT NULL;");
    if (!propCols.some(c => c.name === 'sefaz_status')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN sefaz_status TEXT DEFAULT NULL;");
    if (!propCols.some(c => c.name === 'sefaz_uf')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN sefaz_uf TEXT DEFAULT NULL;");
    if (!propCols.some(c => c.name === 'whatsapp_produtor_pf')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN whatsapp_produtor_pf TEXT DEFAULT NULL;");
    console.log('📦 [DB FASE62] Colunas de Inscrição Estadual (SEFAZ/Produtor PF) ativas em propriedades_rurais.');
  }
} catch (err62) {
  console.warn('⚠️ [DB FASE62] Migração de colunas SEFAZ/IE:', err62.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 63: INTELIGÊNCIA HIDROGRÁFICA, ÁREA ÚTIL DE LAVOURA & MAQUINÁRIO / GPS
// ─────────────────────────────────────────────────────────────────────────────
try {
  const propCols63 = sqliteDb.prepare("PRAGMA table_info(propriedades_rurais)").all();
  if (propCols63.length > 0) {
    if (!propCols63.some(c => c.name === 'area_lavoura_util_ha')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN area_lavoura_util_ha REAL DEFAULT NULL;");
    if (!propCols63.some(c => c.name === 'dados_hidrograficos')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN dados_hidrograficos TEXT DEFAULT NULL;");
    if (!propCols63.some(c => c.name === 'dados_maquinario')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN dados_maquinario TEXT DEFAULT NULL;");
    console.log('📦 [DB FASE63] Colunas de Área Útil, Hidrografia e Maquinário ativas em propriedades_rurais.');
  }
} catch (err63) {
  console.warn('⚠️ [DB FASE63] Migração de colunas Área Útil/Maquinário:', err63.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 65: FEEDBACK LOOP COMERCIAL & ROTEAMENTO B2B IMPLEMENTOS
// ─────────────────────────────────────────────────────────────────────────────
try {
  const propCols65 = sqliteDb.prepare("PRAGMA table_info(propriedades_rurais)").all();
  if (propCols65.length > 0) {
    if (!propCols65.some(c => c.name === 'feedback_comercial')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN feedback_comercial TEXT DEFAULT NULL;");
    if (!propCols65.some(c => c.name === 'feedback_status')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN feedback_status TEXT DEFAULT NULL;");
    if (!propCols65.some(c => c.name === 'interesse_maquinario')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN interesse_maquinario TEXT DEFAULT NULL;");
    if (!propCols65.some(c => c.name === 'decisor_nome')) sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN decisor_nome TEXT DEFAULT NULL;");
  }
  const leadCols65 = sqliteDb.prepare("PRAGMA table_info(leads)").all();
  if (leadCols65.length > 0) {
    if (!leadCols65.some(c => c.name === 'feedback_comercial')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN feedback_comercial TEXT DEFAULT NULL;");
    if (!leadCols65.some(c => c.name === 'feedback_status')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN feedback_status TEXT DEFAULT NULL;");
    if (!leadCols65.some(c => c.name === 'interesse_maquinario')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN interesse_maquinario TEXT DEFAULT NULL;");
    if (!leadCols65.some(c => c.name === 'decisor_nome')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN decisor_nome TEXT DEFAULT NULL;");
    if (!leadCols65.some(c => c.name === 'whatsapp')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN whatsapp TEXT DEFAULT NULL;");
    if (!leadCols65.some(c => c.name === 'intent_stage')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN intent_stage TEXT DEFAULT 'WARM';");
    if (!leadCols65.some(c => c.name === 'dados_fundiarios')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN dados_fundiarios TEXT DEFAULT NULL;");
    if (!leadCols65.some(c => c.name === 'area_lavoura_util_ha')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN area_lavoura_util_ha REAL DEFAULT NULL;");
    if (!leadCols65.some(c => c.name === 'dados_hidrograficos')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN dados_hidrograficos TEXT DEFAULT NULL;");
    if (!leadCols65.some(c => c.name === 'dados_maquinario')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN dados_maquinario TEXT DEFAULT NULL;");
    if (!leadCols65.some(c => c.name === 'sefaz_ie_pf')) sqliteDb.exec("ALTER TABLE leads ADD COLUMN sefaz_ie_pf TEXT DEFAULT NULL;");
  }
  console.log('📦 [DB FASE65] Colunas de Feedback Comercial, Paridade Fundiária e Decisor ativas em leads e propriedades_rurais.');
} catch (err65) {
  console.warn('⚠️ [DB FASE65] Migração de colunas Feedback Comercial:', err65.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 66: ESTEIRA DE PROSPECÇÃO ATIVA B2B & FUNIL COMERCIAL TERRITORIAL
// ─────────────────────────────────────────────────────────────────────────────
try {
  const leadCols66 = sqliteDb.prepare("PRAGMA table_info(leads)").all();
  if (leadCols66.length > 0) {
    if (!leadCols66.some(c => c.name === 'funnel_status')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN funnel_status TEXT NOT NULL DEFAULT 'NOVOS';");
      sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_leads_funnel_status ON leads(funnel_status);");
    }
    if (!leadCols66.some(c => c.name === 'funnel_updated_at')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN funnel_updated_at TEXT DEFAULT NULL;");
    }
    // Normaliza leads legados para 'NOVOS' caso o valor seja nulo
    sqliteDb.exec("UPDATE leads SET funnel_status = 'NOVOS' WHERE funnel_status IS NULL OR funnel_status = '';");
  }

  const propCols66 = sqliteDb.prepare("PRAGMA table_info(propriedades_rurais)").all();
  if (propCols66.length > 0) {
    if (!propCols66.some(c => c.name === 'funnel_status')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN funnel_status TEXT DEFAULT 'NOVOS';");
    }
  }
  console.log('📦 [DB FASE66] Colunas de Funil Comercial e Esteira Territorial ativas.');
} catch (err66) {
  console.warn('⚠️ [DB FASE66] Migração de colunas Funil Comercial:', err66.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// VERSUS SPARKS: RADAR AUTÔNOMO DE INTENÇÃO AGRO & TRIGGER EVENTS (MÁQUINAS & OUTORGAS)
// ─────────────────────────────────────────────────────────────────────────────
try {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS sparks_monitors (
      id TEXT PRIMARY KEY,
      spark_type TEXT NOT NULL,
      nome TEXT NOT NULL,
      descricao TEXT,
      prioridade_tier INTEGER DEFAULT 1,
      frequencia_minutos INTEGER DEFAULT 60,
      status TEXT DEFAULT 'ACTIVE',
      ultimo_disparo_em DATETIME,
      proximo_disparo_em DATETIME,
      total_sinais_capturados INTEGER DEFAULT 0,
      total_leads_qualificados INTEGER DEFAULT 0,
      ultimo_erro TEXT,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sparks_signals (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL,
      spark_type TEXT NOT NULL,
      titulo TEXT NOT NULL,
      resumo TEXT,
      conteudo_bruto TEXT,
      orgao_emissor TEXT,
      data_publicacao DATE,
      valor_monetario REAL DEFAULT 0,
      volume_m3h REAL DEFAULT 0,
      documento_identificado TEXT,
      titular_identificado TEXT,
      nome_imovel TEXT,
      municipio TEXT,
      uf TEXT,
      lat REAL,
      lng REAL,
      propriedade_id TEXT,
      lead_id TEXT,
      status_processamento TEXT DEFAULT 'NOVO',
      score_gerado INTEGER DEFAULT 0,
      trigger_texto TEXT,
      url_fonte TEXT DEFAULT NULL,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monitor_id) REFERENCES sparks_monitors(id)
    );

    CREATE TABLE IF NOT EXISTS sparks_alert_recipients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      tipos_alertas TEXT DEFAULT 'ALL',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sparks_whatsapp_config (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      status_conexao TEXT DEFAULT 'DISCONNECTED',
      modo_envio TEXT DEFAULT 'AUTO_WEB',
      qr_code_base64 TEXT,
      numero_conectado TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sparks_signals_type ON sparks_signals(spark_type);
    CREATE INDEX IF NOT EXISTS idx_sparks_signals_doc ON sparks_signals(documento_identificado);
    CREATE INDEX IF NOT EXISTS idx_sparks_signals_loc ON sparks_signals(uf, municipio);
    CREATE INDEX IF NOT EXISTS idx_sparks_signals_status ON sparks_signals(status_processamento);
    CREATE INDEX IF NOT EXISTS idx_sparks_monitors_type ON sparks_monitors(spark_type);
    CREATE INDEX IF NOT EXISTS idx_sparks_recipients_tenant ON sparks_alert_recipients(tenant_id);
  `);

  try {
    const sparksSignalsCols = sqliteDb.prepare("PRAGMA table_info(sparks_signals)").all();
    if (!sparksSignalsCols.some(c => c.name === 'url_fonte')) {
      sqliteDb.exec("ALTER TABLE sparks_signals ADD COLUMN url_fonte TEXT DEFAULT NULL;");
    }
  } catch (colErr) {
    console.warn('Verificação de coluna url_fonte em sparks_signals:', colErr.message);
  }

  // Seed idempotente dos 6 Monitores Canônicos (Priorizando Crédito e Outorgas)
  const monitorCount = sqliteDb.prepare("SELECT COUNT(*) as cnt FROM sparks_monitors").get().cnt;
  if (monitorCount === 0) {
    const seedMonitors = [
      {
        id: 'spark-credito-rural',
        spark_type: 'CREDITO_BNDES',
        nome: 'Spark de Crédito Rural (BNDES Finame / Moderfrota)',
        descricao: 'Rastreia portais de transparência e bases do BNDES/BACEN identificando aprovações de crédito para maquinário pesado, tratores e colheitadeiras.',
        prioridade_tier: 1,
        frequencia_minutos: 60,
        status: 'ACTIVE'
      },
      {
        id: 'spark-outorgas-agua',
        spark_type: 'OUTORGA_ANA',
        nome: 'Spark de Outorgas de Água e Irrigação (ANA / Estadual)',
        descricao: 'Monitora resoluções da ANA, DAEE, SEMA e IGAM detectando outorgas recentes de captação de água, sinalizando demanda imediata por pivô central e bombas.',
        prioridade_tier: 1,
        frequencia_minutos: 60,
        status: 'ACTIVE'
      },
      {
        id: 'spark-dou-licencas',
        spark_type: 'DOU',
        nome: 'Spark do Diário Oficial da União (DOU - Licenças & Atos)',
        descricao: 'Vasculha publicações governamentais em busca de certidões fundiárias, licenças de instalação e movimentações legais de grupos agrícolas.',
        prioridade_tier: 2,
        frequencia_minutos: 120,
        status: 'ACTIVE'
      },
      {
        id: 'spark-expansao-fundiaria',
        spark_type: 'EXPANSAO_LEILAO',
        nome: 'Spark de Expansão Fundiária (Leilões e Arrendamentos)',
        descricao: 'Monitora editais de leilões e arrendamentos para mapear produtores adquirindo novas glebas e abrindo novas frentes de plantio.',
        prioridade_tier: 2,
        frequencia_minutos: 180,
        status: 'ACTIVE'
      },
      {
        id: 'spark-eventos-agro',
        spark_type: 'EVENTO_AGRO',
        nome: 'Spark de Eventos Agropecuários (Feiras & Geofencing)',
        descricao: 'Extrai datas, coordenadas geográficas e empresas expositoras das principais feiras agrícolas para cercos de tráfego pago e captação de leads.',
        prioridade_tier: 2,
        frequencia_minutos: 240,
        status: 'ACTIVE'
      },
      {
        id: 'spark-passivo-ambiental',
        spark_type: 'PASSIVO_IBAMA',
        nome: 'Spark de Passivo Ambiental (Autuações & Embargos IBAMA)',
        descricao: 'Acompanha listas de embargos do IBAMA para identificar produtores com necessidade de serviços de adequação ambiental, CAR e topografia.',
        prioridade_tier: 3,
        frequencia_minutos: 360,
        status: 'ACTIVE'
      }
    ];

    const insertStmt = sqliteDb.prepare(`
      INSERT INTO sparks_monitors (id, spark_type, nome, descricao, prioridade_tier, frequencia_minutos, status, ultimo_disparo_em, proximo_disparo_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-10 minutes'), datetime('now', '+50 minutes'))
    `);

    for (const m of seedMonitors) {
      insertStmt.run(m.id, m.spark_type, m.nome, m.descricao, m.prioridade_tier, m.frequencia_minutos, m.status);
    }
    console.log('⚡ [DB VERSUS SPARKS] 6 Monitores canônicos criados e ativos com foco no Core de Máquinas.');
  }
} catch (errSparks) {
  console.warn('⚠️ [DB VERSUS SPARKS] Migração de tabelas de Sparks:', errSparks.message);
}

// Migration: Garante suporte à coluna access_password na tabela users
try {
  const userCols = sqliteDb.prepare("PRAGMA table_info(users)").all();
  if (!userCols.some(col => col.name === 'access_password')) {
    sqliteDb.prepare("ALTER TABLE users ADD COLUMN access_password TEXT DEFAULT NULL").run();
    console.log('📦 [DATABASE] Coluna access_password adicionada à tabela users.');
  }
  sqliteDb.prepare("UPDATE users SET access_password = 'sophia11052016' WHERE email = 'hajaluzstudio@gmail.com' AND (access_password IS NULL OR access_password = '')").run();
} catch (migErr) {
  console.warn('⚠️ [DATABASE MIGRATION WARNING] users.access_password:', migErr.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 59 — ETAPA 1: INFRAESTRUTURA DE DADOS E SEGURANÇA (SQLite)
// Tabelas: super_admin_settings e tenant_api_configs com criptografia nativa
// ─────────────────────────────────────────────────────────────────────────────
try {
  // 1. Garante existência e migração da tabela super_admin_settings
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS super_admin_settings (
      id TEXT PRIMARY KEY DEFAULT 'host_master_settings',
      master_openai_key TEXT DEFAULT NULL,
      master_meta_app_id TEXT DEFAULT NULL,
      master_meta_token TEXT DEFAULT NULL,
      master_bureau_key TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO super_admin_settings (id) VALUES ('host_master_settings');
  `);

  const masterCols = sqliteDb.prepare("PRAGMA table_info(super_admin_settings)").all();
  if (masterCols.length > 0) {
    if (!masterCols.some(c => c.name === 'master_openai_key')) sqliteDb.exec("ALTER TABLE super_admin_settings ADD COLUMN master_openai_key TEXT DEFAULT NULL;");
    if (!masterCols.some(c => c.name === 'master_meta_app_id')) sqliteDb.exec("ALTER TABLE super_admin_settings ADD COLUMN master_meta_app_id TEXT DEFAULT NULL;");
    if (!masterCols.some(c => c.name === 'master_meta_token')) sqliteDb.exec("ALTER TABLE super_admin_settings ADD COLUMN master_meta_token TEXT DEFAULT NULL;");
    if (!masterCols.some(c => c.name === 'master_bureau_key')) sqliteDb.exec("ALTER TABLE super_admin_settings ADD COLUMN master_bureau_key TEXT DEFAULT NULL;");
    if (!masterCols.some(c => c.name === 'updated_at')) sqliteDb.exec("ALTER TABLE super_admin_settings ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;");
  }

  // 2. Garante existência e migração da tabela tenant_api_configs
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS tenant_api_configs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL UNIQUE,
      openai_key TEXT DEFAULT NULL,
      meta_app_id TEXT DEFAULT NULL,
      meta_token TEXT DEFAULT NULL,
      bureau_key TEXT DEFAULT NULL,
      use_master_key INTEGER NOT NULL DEFAULT 1,
      test_drive_expires_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_api_configs_tenant ON tenant_api_configs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tenant_api_configs_test_drive ON tenant_api_configs(use_master_key, test_drive_expires_at);
  `);

  const tenantApiCols = sqliteDb.prepare("PRAGMA table_info(tenant_api_configs)").all();
  if (tenantApiCols.length > 0) {
    if (!tenantApiCols.some(c => c.name === 'openai_key')) sqliteDb.exec("ALTER TABLE tenant_api_configs ADD COLUMN openai_key TEXT DEFAULT NULL;");
    if (!tenantApiCols.some(c => c.name === 'meta_app_id')) sqliteDb.exec("ALTER TABLE tenant_api_configs ADD COLUMN meta_app_id TEXT DEFAULT NULL;");
    if (!tenantApiCols.some(c => c.name === 'meta_token')) sqliteDb.exec("ALTER TABLE tenant_api_configs ADD COLUMN meta_token TEXT DEFAULT NULL;");
    if (!tenantApiCols.some(c => c.name === 'bureau_key')) sqliteDb.exec("ALTER TABLE tenant_api_configs ADD COLUMN bureau_key TEXT DEFAULT NULL;");
    if (!tenantApiCols.some(c => c.name === 'use_master_key')) sqliteDb.exec("ALTER TABLE tenant_api_configs ADD COLUMN use_master_key INTEGER NOT NULL DEFAULT 1;");
    if (!tenantApiCols.some(c => c.name === 'test_drive_expires_at')) sqliteDb.exec("ALTER TABLE tenant_api_configs ADD COLUMN test_drive_expires_at TEXT DEFAULT NULL;");
  }

  // 3. Bootstrap seguro de credenciais com criptografia nativa
  import('../utils/cryptoUtils.js').then(({ encrypt }) => {
    // Sincroniza chaves do host se super_admin_settings estiver vazio
    const currentHost = sqliteDb.prepare("SELECT * FROM super_admin_settings WHERE id = 'host_master_settings'").get();
    if (currentHost) {
      let needsUpdate = false;
      let newOpenai = currentHost.master_openai_key;
      let newBureau = currentHost.master_bureau_key;

      if (!newOpenai && process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
        newOpenai = encrypt(process.env.OPENAI_API_KEY.trim());
        needsUpdate = true;
      }
      if (!newBureau && process.env.BUREAU_API_KEY && process.env.BUREAU_API_KEY.trim()) {
        newBureau = encrypt(process.env.BUREAU_API_KEY.trim());
        needsUpdate = true;
      }
      if (needsUpdate) {
        sqliteDb.prepare(`
          UPDATE super_admin_settings 
          SET master_openai_key = ?, master_bureau_key = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = 'host_master_settings'
        `).run(newOpenai, newBureau);
        console.log('🔒 [FASE 59] Chaves Mestre iniciais encriptadas e sincronizadas no SQLite.');
      }
    }

    // Garante que todo tenant cadastrado em tenants possua registro em tenant_api_configs
    const existingTenants = sqliteDb.prepare("SELECT id, created_at FROM tenants").all();
    const insertConfigStmt = sqliteDb.prepare(`
      INSERT OR IGNORE INTO tenant_api_configs (id, tenant_id, use_master_key, test_drive_expires_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const t of existingTenants) {
      const configId = `cfg-${t.id}`;
      if (t.id === 'tenant-root-default') {
        insertConfigStmt.run(configId, t.id, 1, '2099-12-31T23:59:59.999Z');
      } else {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        insertConfigStmt.run(configId, t.id, 1, expiresAt);
      }
    }
  }).catch(e => console.warn('⚠️ [FASE 59] Aviso na inicialização de crypto/bootstrap:', e.message));

  console.log('📦 [DB FASE59] Tabelas super_admin_settings e tenant_api_configs migradas e ativas.');
} catch (err59) {
  console.warn('⚠️ [DB FASE59] Erro na migração das tabelas de APIs (SQLite):', err59.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 66.A: EVOLUÇÃO COGNITIVA — VISÃO COMPUTACIONAL, RL & FILA ASSÍNCRONA
// ─────────────────────────────────────────────────────────────────────────────
try {
  sqliteDb.exec(`
    -- 1. Auditorias Visuais com Cache Criptográfico SHA-256 (60 Dias)
    CREATE TABLE IF NOT EXISTS cognitive_vision_audits (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL, -- 'LEAD', 'RURAL_PROPERTY', 'CUSTOM_POI'
      entity_id TEXT NOT NULL,
      coords_hash TEXT NOT NULL, -- SHA-256 das coordenadas normalizadas
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      image_source TEXT DEFAULT 'GOOGLE_STREET_VIEW', -- 'GOOGLE_STREET_VIEW', 'SENTINEL_2', 'MAPBIOMAS'
      infrastructure_tier TEXT DEFAULT 'UNKNOWN', -- 'PRIME_INDUSTRIAL', 'STANDARD_COMMERCIAL', 'RURAL_STORAGE', 'ABANDONED_ZOMBIE'
      fleet_count INTEGER DEFAULT 0,
      facade_confidence REAL DEFAULT 0.0,
      is_zombie_risk INTEGER DEFAULT 0, -- 0 = Normal/Ativo, 1 = Risco de Fantasma/Abandonado
      raw_inference_json TEXT DEFAULT '{}',
      expires_at DATETIME NOT NULL,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cog_audits_entity ON cognitive_vision_audits(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_cog_audits_coords_hash ON cognitive_vision_audits(coords_hash);
    CREATE INDEX IF NOT EXISTS idx_cog_audits_expires ON cognitive_vision_audits(expires_at);
    CREATE INDEX IF NOT EXISTS idx_cog_audits_tier ON cognitive_vision_audits(infrastructure_tier);

    -- 2. Estado de Políticas de Aprendizado por Reforço (RL / Q-Learning / LinUCB)
    CREATE TABLE IF NOT EXISTS cognitive_rl_states (
      id TEXT PRIMARY KEY,
      policy_type TEXT NOT NULL, -- 'ROUTE_OPTIMIZATION', 'SPARK_HARVESTER', 'ICP_CONVERGENCE'
      state_key TEXT NOT NULL,   -- Chave de contexto (ex: 'cnae:0111-3/01:PR' ou 'domain:dou.gov.br')
      weights_json TEXT DEFAULT '{}',
      exploration_rate REAL DEFAULT 0.2, -- Taxa epsilon de exploração
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      last_reward REAL DEFAULT 0.0,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cog_rl_policy_state ON cognitive_rl_states(policy_type, state_key);
    CREATE INDEX IF NOT EXISTS idx_cog_rl_tenant ON cognitive_rl_states(tenant_id);

    -- 3. Fila Assíncrona de Tarefas Cognitivas (Isolamento de Carga do Node.js)
    CREATE TABLE IF NOT EXISTS cognitive_async_queue (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL, -- 'AUDIT_FACADE', 'AUDIT_SATELLITE', 'RL_POLICY_UPDATE'
      payload_json TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
      result_json TEXT DEFAULT NULL,
      error_msg TEXT DEFAULT NULL,
      attempts INTEGER DEFAULT 0,
      latency_ms REAL DEFAULT 0,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cog_queue_status ON cognitive_async_queue(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_cog_queue_tenant ON cognitive_async_queue(tenant_id);
  `);

  // Colunas de paridade em leads e propriedades_rurais
  const leadsInfo = sqliteDb.prepare("PRAGMA table_info(leads)").all();
  if (leadsInfo.length > 0) {
    if (!leadsInfo.some(c => c.name === 'visual_audit_status')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN visual_audit_status TEXT DEFAULT NULL;");
    }
    if (!leadsInfo.some(c => c.name === 'visual_audit_tier')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN visual_audit_tier TEXT DEFAULT NULL;");
    }
    if (!leadsInfo.some(c => c.name === 'visual_audit_score')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN visual_audit_score REAL DEFAULT NULL;");
    }
    if (!leadsInfo.some(c => c.name === 'visual_audit_at')) {
      sqliteDb.exec("ALTER TABLE leads ADD COLUMN visual_audit_at TEXT DEFAULT NULL;");
    }
  }

  const propInfo = sqliteDb.prepare("PRAGMA table_info(propriedades_rurais)").all();
  if (propInfo.length > 0) {
    if (!propInfo.some(c => c.name === 'visual_audit_status')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN visual_audit_status TEXT DEFAULT NULL;");
    }
    if (!propInfo.some(c => c.name === 'visual_audit_tier')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN visual_audit_tier TEXT DEFAULT NULL;");
    }
    if (!propInfo.some(c => c.name === 'visual_audit_score')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN visual_audit_score REAL DEFAULT NULL;");
    }
    if (!propInfo.some(c => c.name === 'visual_audit_at')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN visual_audit_at TEXT DEFAULT NULL;");
    }
    // FASE 66.B: Sensoriamento de Satélite Orbital (Pivôs, Silos, Açudes e NDVI)
    if (!propInfo.some(c => c.name === 'pivots_detected')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN pivots_detected INTEGER DEFAULT 0;");
    }
    if (!propInfo.some(c => c.name === 'silos_detected')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN silos_detected INTEGER DEFAULT 0;");
    }
    if (!propInfo.some(c => c.name === 'dams_detected')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN dams_detected INTEGER DEFAULT 0;");
    }
    if (!propInfo.some(c => c.name === 'vegetative_vigor_index')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN vegetative_vigor_index REAL DEFAULT NULL;");
    }
    if (!propInfo.some(c => c.name === 'satellite_audit_at')) {
      sqliteDb.exec("ALTER TABLE propriedades_rurais ADD COLUMN satellite_audit_at TEXT DEFAULT NULL;");
    }
  }

  if (leadsInfo.length > 0 && !leadsInfo.some(c => c.name === 'zombie_risk_score')) {
    sqliteDb.exec("ALTER TABLE leads ADD COLUMN zombie_risk_score REAL DEFAULT 0.0;");
  }

  // FASE 66.C: Tabela de Log de Recompensas de Aprendizado por Reforço (RL Ingestion)
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS rl_rewards_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT 'tenant-root-default',
      lead_id TEXT,
      cnpj TEXT,
      source_crm TEXT DEFAULT 'GENERIC_WEBHOOK', -- 'HUBSPOT', 'PIPEDRIVE', 'RD_STATION', 'VERSUS_INTERNAL', 'WHATSAPP'
      event_type TEXT NOT NULL,                  -- 'DEAL_WON', 'DEAL_LOST', 'LEAD_QUALIFIED', 'MEETING_SCHEDULED', etc.
      deal_value REAL DEFAULT 0.0,
      reward_score REAL NOT NULL,                -- Valor normalizado (-100 a +100)
      context_state_key TEXT,                    -- Chave de estado para o agente RL (ex: 'cnae:0111-3/01:MT:PRIME_INDUSTRIAL')
      payload_json TEXT DEFAULT '{}',
      processed_by_rl INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_rl_rewards_cnpj ON rl_rewards_log(cnpj);
    CREATE INDEX IF NOT EXISTS idx_rl_rewards_event ON rl_rewards_log(event_type);
    CREATE INDEX IF NOT EXISTS idx_rl_rewards_state_key ON rl_rewards_log(context_state_key);
    CREATE INDEX IF NOT EXISTS idx_rl_rewards_created ON rl_rewards_log(created_at DESC);
  `);

  console.log('🧠 [DB FASE 66.A/B/C] Tabelas cognitivas, Satélite, Visão e Log de Recompensas RL ativas no SQLite.');
} catch (err66) {
  console.warn('⚠️ [DB FASE 66] Erro na migração das tabelas cognitivas (SQLite):', err66.message);
}

// ------------------------------------------------------------------------------
// 2. Camada Dual-Engine: Supabase (PostgreSQL) vs. SQLite Local
// ------------------------------------------------------------------------------
const databaseUrl = process.env.DATABASE_URL || '';
const isPostgres = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');

let pgPool = null;
if (isPostgres) {
  try {
    const cleanDbUrl = databaseUrl.replace(/[?&]sslmode=[^&]+/i, '');
    pgPool = new pg.Pool({
      connectionString: cleanDbUrl,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pgPool.on('error', (err) => {
      console.error('❌ [SUPABASE/PG POOL ERROR] Erro na conexão com banco remoto:', err.message);
      console.warn('⚠️ [DUAL-ENGINE] Mantendo operações ativas e registrando contingência.');
    });

    console.log('⚡ Conexão Supabase (PostgreSQL) inicializada com Pool ativo.');
  } catch (poolInitErr) {
    console.error('❌ [SUPABASE/PG INIT ERROR] Falha ao instanciar o Pool do PostgreSQL:', poolInitErr.message);
    console.warn('⚠️ [DUAL-ENGINE] Fallback para persistência SQLite WAL mantido.');
  }
} else {
  console.log('📦 Banco de dados local SQLite inicializado com Matriz de ICP (Modo WAL ativo).');
}

/**
 * Converte placeholders no padrão SQLite '?' para o padrão PostgreSQL '$1, $2, ...'
 */
function translatePlaceholdersToPg(sql) {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

/**
 * Traduz funções exclusivas do SQLite para PostgreSQL se estiver em modo Postgres
 */
function normalizeDialect(sql, targetIsPg) {
  if (targetIsPg) {
    return sql
      .replace(/datetime\('now',\s*'localtime'\)/gi, 'NOW()')
      .replace(/datetime\('now'\)/gi, 'NOW()');
  }
  return sql;
}

// ------------------------------------------------------------------------------
// 3. Objeto Unificado do Banco de Dados com Interface Dual
// ------------------------------------------------------------------------------
const db = {
  // Flag indicando o motor ativo
  isPostgres,
  sqlite: sqliteDb,
  pool: pgPool,

  /**
   * Método de consulta assíncrona unificado: funciona em SQLite e PostgreSQL
   */
  async query(sqlText, params = []) {
    if (this.isPostgres && this.pool) {
      const translatedSql = translatePlaceholdersToPg(normalizeDialect(sqlText, true));
      const res = await this.pool.query(translatedSql, params);
      return {
        rows: res.rows,
        rowCount: res.rowCount
      };
    }

    // Modo SQLite (execução síncrona embrulhada em Promise)
    const normSql = normalizeDialect(sqlText, false);
    const trimmed = normSql.trim();
    const isSelect = /^SELECT\b/i.test(trimmed) || /^PRAGMA\b/i.test(trimmed);

    const stmt = sqliteDb.prepare(normSql);
    if (isSelect) {
      const rows = stmt.all(...params);
      return {
        rows,
        rowCount: rows.length
      };
    } else {
      const result = stmt.run(...params);
      return {
        rows: [],
        rowCount: result.changes || 0,
        lastInsertRowid: result.lastInsertRowid
      };
    }
  },

  /**
   * Mantém retrocompatibilidade total com db.prepare(...).all / .get / .run no SQLite
   */
  prepare(sqlText) {
    return sqliteDb.prepare(sqlText);
  },

  exec(sqlText) {
    return sqliteDb.exec(sqlText);
  }
};

// Seed de dados demográficos municipais (se SQLite ainda não povoado)
import('./seedDemographics.js').catch(err => console.error('Erro ao importar seed de demographics:', err));

// Seed seguro do Super Admin Master (Fase 26)
import('./seedAdminMaster.js').then(m => m.seedSuperAdmin()).catch(err => console.error('Erro ao inicializar Super Admin:', err));

// Seed de cooperativas e entidades agropecuárias canônicas
import('./seedAgroLeads.js').then(m => m.seedAgroLeads()).catch(err => console.error('Erro ao semear cooperativas agro:', err));

export default db;
export { sqliteDb, pgPool, isPostgres };
