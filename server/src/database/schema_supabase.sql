-- ==============================================================================
-- PROJETO VERSUS / API LEADS — SCHEMA RELACIONAL SUPABASE (POSTGRESQL 15+)
-- FASES 1 A 71: CONSOLIDADO PARA PRODUÇÃO (RLS, POSTGIS, SPARKS, COGNITIVE & MULTI-TENANT)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extensões Criptográficas e Geoespaciais
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. Tabela de Tenants (Multi-Tenant Corporativo - Fase 32 & 59)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(20) UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'ENTERPRISE',
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  max_users INTEGER NOT NULL DEFAULT 5,
  daily_quota_limit INTEGER NOT NULL DEFAULT 500,
  monthly_quota_limit INTEGER NOT NULL DEFAULT 5000,
  whatsapp_inbound VARCHAR(50) DEFAULT NULL,
  settings_json JSONB DEFAULT '{}'::jsonb,
  allowed_niches JSONB DEFAULT '["agro","b2b","saude"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir tenant padrão 'tenant-root-default' para compatibilidade imediata
INSERT INTO tenants (id, name, cnpj, plan, status)
VALUES ('tenant-root-default', 'Organização Raiz VERSUS', '00000000000191', 'ENTERPRISE', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. Tabela de Usuários, RBAC & Governança (Fase 26 & 32)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  access_password TEXT DEFAULT NULL,
  name VARCHAR(150) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'ADMIN', -- 'ADMIN', 'GESTOR', 'OPERADOR', 'VISUALIZADOR'
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS export_quotas (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_limit INTEGER NOT NULL DEFAULT 500,
  monthly_limit INTEGER NOT NULL DEFAULT 5000,
  used_today INTEGER NOT NULL DEFAULT 0,
  used_this_month INTEGER NOT NULL DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  query_params JSONB DEFAULT '{}'::jsonb,
  records_count INTEGER DEFAULT 0,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. Segmentos de Mercado e Matriz CNAE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  icon VARCHAR(50),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS segment_cnaes (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  cnae_code VARCHAR(20) NOT NULL,
  cnae_description TEXT NOT NULL,
  target_type VARCHAR(20) NOT NULL DEFAULT 'BUYER',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. Tabela Principal de Leads & Inteligência Corporativa
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  cnpj TEXT NOT NULL UNIQUE,
  cnpj_raw TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnae_principal_codigo VARCHAR(20) NOT NULL,
  cnae_principal_descricao TEXT NOT NULL,
  cnaes_secundarios TEXT,
  natureza_juridica TEXT,
  porte VARCHAR(50) NOT NULL DEFAULT 'DEMAIS',
  capital_social NUMERIC(18, 2) DEFAULT 0.00,
  target_type VARCHAR(20) NOT NULL DEFAULT 'BUYER',
  situacao_cadastral VARCHAR(50) DEFAULT 'ATIVA',
  qsa JSONB DEFAULT '[]'::jsonb,
  logradouro TEXT,
  numero VARCHAR(30),
  complemento TEXT,
  bairro TEXT,
  cep VARCHAR(10),
  municipio VARCHAR(100) NOT NULL,
  uf VARCHAR(2) NOT NULL,
  telefone VARCHAR(50),
  telefone_sanitized VARCHAR(20),
  email VARCHAR(150),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  vertical_type VARCHAR(50) DEFAULT 'GERAL',
  vertical_data JSONB DEFAULT '{}'::jsonb,
  audit_status VARCHAR(50) DEFAULT NULL,
  audited_at TIMESTAMPTZ DEFAULT NULL,
  audited_by VARCHAR(100) DEFAULT 'OPERADOR_LOCAL',
  endereco_operacional TEXT DEFAULT NULL,
  lat_operacional DOUBLE PRECISION DEFAULT NULL,
  lng_operacional DOUBLE PRECISION DEFAULT NULL,
  address_reconciled BOOLEAN DEFAULT FALSE,
  reconciliation_source TEXT DEFAULT NULL,
  reconciliation_confidence DOUBLE PRECISION DEFAULT NULL,
  is_competitor BOOLEAN NOT NULL DEFAULT FALSE,
  icp_score INTEGER DEFAULT 0,
  vitality_score INTEGER DEFAULT 0,
  status_operacional VARCHAR(50) DEFAULT 'Operação Ativa',
  dados_adicionais JSONB DEFAULT '{}'::jsonb,
  -- FASE 66: Auditoria Visual de Fachada & Risco Zumbi
  visual_audit_status VARCHAR(50) DEFAULT NULL,
  visual_audit_tier VARCHAR(50) DEFAULT NULL,
  visual_audit_score DOUBLE PRECISION DEFAULT NULL,
  visual_audit_at TIMESTAMPTZ DEFAULT NULL,
  zombie_risk_score DOUBLE PRECISION DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. Sócios & QSA (Fase 27)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads_socios (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_cnpj VARCHAR(20) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  qualificacao VARCHAR(150) DEFAULT 'Sócio / Administrador',
  faixa_etaria VARCHAR(50),
  pais VARCHAR(100) DEFAULT 'Brasil',
  representante_legal VARCHAR(255),
  qualificacao_rep_legal VARCHAR(150),
  data_entrada VARCHAR(50),
  email_presumido VARCHAR(255),
  telefone_presumido VARCHAR(50),
  linkedin_presumido TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 7. Propriedades Rurais (Malha Fundiária SICAR / SIGEF / INCRA - Fases 44, 45, 66.B)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS propriedades_rurais (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  id_sigef TEXT UNIQUE,
  codigo_imovel TEXT,
  nome_imovel TEXT NOT NULL,
  municipio VARCHAR(100) NOT NULL,
  uf VARCHAR(2) NOT NULL,
  area_hectares DOUBLE PRECISION DEFAULT 0.0,
  geometria_poligono JSONB NOT NULL,
  centroide_lat DOUBLE PRECISION,
  centroide_lng DOUBLE PRECISION,
  raio_abrangencia_km DOUBLE PRECISION DEFAULT 5.0,
  nome_titular TEXT NOT NULL,
  cpf_cnpj_titular VARCHAR(30),
  status_geo VARCHAR(50) NOT NULL DEFAULT 'SEM_GEO',
  intent_score INTEGER DEFAULT 0,
  intent_classification VARCHAR(20) DEFAULT 'COLD',
  intent_triggers JSONB DEFAULT '[]'::jsonb,
  whatsapp_validado VARCHAR(50) DEFAULT NULL,
  linkedin_url_real TEXT DEFAULT NULL,
  email_validado VARCHAR(150) DEFAULT NULL,
  osint_status VARCHAR(50) DEFAULT 'PENDING',
  dados_agronomicos JSONB DEFAULT NULL,
  -- FASE 66.B: Auditoria Orbital por Satélite
  visual_audit_status VARCHAR(50) DEFAULT NULL,
  visual_audit_tier VARCHAR(50) DEFAULT NULL,
  visual_audit_score DOUBLE PRECISION DEFAULT NULL,
  visual_audit_at TIMESTAMPTZ DEFAULT NULL,
  pivots_detected INTEGER DEFAULT 0,
  silos_detected INTEGER DEFAULT 0,
  dams_detected INTEGER DEFAULT 0,
  vegetative_vigor_index DOUBLE PRECISION DEFAULT NULL,
  satellite_audit_at TIMESTAMPTZ DEFAULT NULL,
  data_ultima_sync TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 8. Gaps de Mercado & Indicadores Municipais (Fases 16, 67, 71)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_gaps (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  municipio VARCHAR(100) NOT NULL,
  uf VARCHAR(2) NOT NULL,
  gap_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  prioridade VARCHAR(30) DEFAULT 'MÉDIA',
  potencial_demanda_anual NUMERIC(18, 2) DEFAULT 0.00,
  distancia_concorrente_km DOUBLE PRECISION DEFAULT 0.0,
  radius_km DOUBLE PRECISION DEFAULT 50.0,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  competitor_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  mode VARCHAR(50) DEFAULT 'AGGREGATED_NETWORK',
  h3_index VARCHAR(20),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS municipal_indicators (
  ibge_code VARCHAR(20) PRIMARY KEY,
  municipio VARCHAR(100) NOT NULL,
  uf VARCHAR(2) NOT NULL,
  populacao_estimada INTEGER DEFAULT 0,
  pib_per_capita NUMERIC(15, 2) DEFAULT 0.00,
  consumo_mensal_per_capita NUMERIC(15, 2) DEFAULT 0.00,
  consumo_setorial_json JSONB DEFAULT '{}'::jsonb,
  ipc_score DOUBLE PRECISION DEFAULT 0.0,
  frota_total INTEGER DEFAULT 0,
  frota_pesados_agro INTEGER DEFAULT 0,
  frota_caminhoes_tratores INTEGER DEFAULT 0,
  hectares_lavoura_estimados DOUBLE PRECISION DEFAULT 0.0,
  obras_ativas_estimadas INTEGER DEFAULT 0,
  metragem_alvaras_m2 DOUBLE PRECISION DEFAULT 0.0,
  leitos_totais INTEGER DEFAULT 0,
  estabelecimentos_saude INTEGER DEFAULT 0,
  densidade_leitos_mil_hab DOUBLE PRECISION DEFAULT 0.0,
  comarcas_varas_total INTEGER DEFAULT 0,
  volume_processual_anual INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 9. Acessos aos Dossiês & Webhooks WhatsApp (Fase 40 & 44)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_dossier_views (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_cnpj VARCHAR(20) NOT NULL,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  ip_address VARCHAR(50),
  user_agent TEXT,
  referrer TEXT,
  query_params JSONB DEFAULT '{}'::jsonb,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_inbound_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  sender_phone VARCHAR(50) NOT NULL,
  recipient_phone VARCHAR(50),
  message_text TEXT,
  message_type VARCHAR(20) DEFAULT 'text',
  payload_json JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(30) DEFAULT 'RECEIVED',
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_outbound_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT,
  recipient_phone VARCHAR(50) NOT NULL,
  e164 VARCHAR(30) NOT NULL,
  quality_score INTEGER DEFAULT 0,
  quality_tier VARCHAR(30) DEFAULT 'UNKNOWN',
  message_text TEXT NOT NULL,
  channel VARCHAR(30) DEFAULT 'whatsapp_web',
  status VARCHAR(30) DEFAULT 'SENT',
  direct_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 10. Configurações Super Admin & Tenant APIs (Fase 59)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS super_admin_settings (
  id TEXT PRIMARY KEY DEFAULT 'host_master_settings',
  master_openai_key TEXT DEFAULT NULL,
  master_meta_app_id TEXT DEFAULT NULL,
  master_meta_token TEXT DEFAULT NULL,
  master_bureau_key TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO super_admin_settings (id) VALUES ('host_master_settings') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_api_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  openai_key TEXT DEFAULT NULL,
  meta_app_id TEXT DEFAULT NULL,
  meta_token TEXT DEFAULT NULL,
  bureau_key TEXT DEFAULT NULL,
  use_master_key INTEGER NOT NULL DEFAULT 1,
  test_drive_expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 11. VERSUS Sparks: Radar Autônomo de Intenção & Trigger Events 24/7 (Fase 60)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sparks_monitors (
  id TEXT PRIMARY KEY,
  spark_type VARCHAR(50) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  prioridade_tier INTEGER DEFAULT 1,
  frequencia_minutos INTEGER DEFAULT 60,
  status VARCHAR(30) DEFAULT 'ACTIVE',
  ultimo_disparo_em TIMESTAMPTZ,
  proximo_disparo_em TIMESTAMPTZ,
  total_sinais_capturados INTEGER DEFAULT 0,
  total_leads_qualificados INTEGER DEFAULT 0,
  ultimo_erro TEXT,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sparks_signals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  monitor_id TEXT NOT NULL REFERENCES sparks_monitors(id) ON DELETE CASCADE,
  spark_type VARCHAR(50) NOT NULL,
  titulo TEXT NOT NULL,
  resumo TEXT,
  conteudo_bruto TEXT,
  orgao_emissor VARCHAR(150),
  data_publicacao DATE,
  valor_monetario NUMERIC(18, 2) DEFAULT 0.00,
  volume_m3h DOUBLE PRECISION DEFAULT 0.0,
  documento_identificado VARCHAR(50),
  titular_identificado VARCHAR(255),
  nome_imovel TEXT,
  municipio VARCHAR(100),
  uf VARCHAR(2),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  propriedade_id TEXT,
  lead_id TEXT,
  status_processamento VARCHAR(30) DEFAULT 'NOVO',
  score_gerado INTEGER DEFAULT 0,
  trigger_texto TEXT,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sparks_alert_recipients (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  telefone VARCHAR(50) NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  tipos_alertas TEXT DEFAULT 'ALL',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sparks_whatsapp_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  status_conexao VARCHAR(50) DEFAULT 'DISCONNECTED',
  modo_envio VARCHAR(50) DEFAULT 'AUTO_WEB',
  qr_code_base64 TEXT,
  numero_conectado VARCHAR(50),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 12. Evolução Cognitiva: Visão Computacional, RL & Fila Assíncrona (Fase 66)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cognitive_vision_audits (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  entity_type VARCHAR(50) NOT NULL,
  entity_id TEXT NOT NULL,
  coords_hash VARCHAR(64) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  image_source VARCHAR(50) DEFAULT 'GOOGLE_STREET_VIEW',
  infrastructure_tier VARCHAR(50) DEFAULT 'UNKNOWN',
  fleet_count INTEGER DEFAULT 0,
  facade_confidence DOUBLE PRECISION DEFAULT 0.0,
  is_zombie_risk INTEGER DEFAULT 0,
  raw_inference_json JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cognitive_rl_states (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_type VARCHAR(50) NOT NULL,
  state_key TEXT NOT NULL,
  weights_json JSONB DEFAULT '{}'::jsonb,
  exploration_rate DOUBLE PRECISION DEFAULT 0.2,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_reward DOUBLE PRECISION DEFAULT 0.0,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cognitive_async_queue (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_type VARCHAR(50) NOT NULL,
  payload_json JSONB NOT NULL,
  status VARCHAR(30) DEFAULT 'PENDING',
  result_json JSONB DEFAULT NULL,
  error_msg TEXT DEFAULT NULL,
  attempts INTEGER DEFAULT 0,
  latency_ms DOUBLE PRECISION DEFAULT 0.0,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rl_rewards_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT,
  cnpj VARCHAR(20),
  source_crm VARCHAR(50) DEFAULT 'GENERIC_WEBHOOK',
  event_type VARCHAR(50) NOT NULL,
  deal_value DOUBLE PRECISION DEFAULT 0.0,
  reward_score DOUBLE PRECISION NOT NULL,
  context_state_key TEXT,
  payload_json JSONB DEFAULT '{}'::jsonb,
  processed_by_rl INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scraping_job_queue (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT DEFAULT 'tenant-root-default' REFERENCES tenants(id) ON DELETE CASCADE,
  estado VARCHAR(2) NOT NULL,
  municipio VARCHAR(100) NOT NULL,
  cultura_foco VARCHAR(100) DEFAULT 'Geral',
  status VARCHAR(30) DEFAULT 'PENDING',
  delay_seconds INTEGER DEFAULT 300,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_summary TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 13. Índices de Alta Performance
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_cnpj ON leads(cnpj);
CREATE INDEX IF NOT EXISTS idx_leads_cnpj_raw ON leads(cnpj_raw);
CREATE INDEX IF NOT EXISTS idx_leads_razao ON leads(razao_social);
CREATE INDEX IF NOT EXISTS idx_leads_uf_municipio ON leads(uf, municipio);
CREATE INDEX IF NOT EXISTS idx_leads_cnae ON leads(cnae_principal_codigo);
CREATE INDEX IF NOT EXISTS idx_leads_target_type ON leads(target_type);
CREATE INDEX IF NOT EXISTS idx_leads_coords ON leads(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_leads_operacional_coords ON leads(lat_operacional, lng_operacional);
CREATE INDEX IF NOT EXISTS idx_leads_is_competitor ON leads(is_competitor);
CREATE INDEX IF NOT EXISTS idx_leads_icp_score ON leads(icp_score DESC);

CREATE INDEX IF NOT EXISTS idx_socios_lead_cnpj ON leads_socios(lead_cnpj);
CREATE INDEX IF NOT EXISTS idx_socios_nome ON leads_socios(nome);

CREATE INDEX IF NOT EXISTS idx_prop_rurais_sigef ON propriedades_rurais(id_sigef);
CREATE INDEX IF NOT EXISTS idx_prop_rurais_uf_mun ON propriedades_rurais(uf, municipio);
CREATE INDEX IF NOT EXISTS idx_prop_rurais_titular ON propriedades_rurais(nome_titular);
CREATE INDEX IF NOT EXISTS idx_prop_rurais_intent ON propriedades_rurais(intent_classification);

CREATE INDEX IF NOT EXISTS idx_sparks_signals_type ON sparks_signals(spark_type);
CREATE INDEX IF NOT EXISTS idx_sparks_signals_loc ON sparks_signals(uf, municipio);
CREATE INDEX IF NOT EXISTS idx_sparks_signals_status ON sparks_signals(status_processamento);

CREATE INDEX IF NOT EXISTS idx_cog_audits_entity ON cognitive_vision_audits(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_cog_audits_coords_hash ON cognitive_vision_audits(coords_hash);
CREATE INDEX IF NOT EXISTS idx_cog_queue_status ON cognitive_async_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_rl_rewards_event ON rl_rewards_log(event_type);

-- ------------------------------------------------------------------------------
-- 14. Função e Triggers Automáticos de Atualização de Timestamp (updated_at)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_leads_updated_at') THEN
    CREATE TRIGGER trigger_update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_tenants_updated_at') THEN
    CREATE TRIGGER trigger_update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_props_updated_at') THEN
    CREATE TRIGGER trigger_update_props_updated_at BEFORE UPDATE ON propriedades_rurais FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 15. Políticas de Segurança (Row Level Security - RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_cnaes ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE propriedades_rurais ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipal_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_dossier_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_api_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sparks_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sparks_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_vision_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_rl_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_async_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE rl_rewards_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_job_queue ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso total para backend autenticado (service_role ou conexão direta VPS)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS "backend_all_%I" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "backend_all_%I" ON %I FOR ALL USING (true);', t, t);
  END LOOP;
END $$;
