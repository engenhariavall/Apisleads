import pg from 'pg';
import { loadEnv } from '../src/config/env.js';

loadEnv();

async function syncSchema() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL não definida.');
    process.exit(1);
  }

  const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]+/i, '');
  const pool = new pg.Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔄 Aplicando colunas das Fases 57 a 66 no PostgreSQL do Supabase...');

    const leadsSql = `
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS funnel_status VARCHAR(50) DEFAULT 'NOVOS';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS funnel_updated_at TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS feedback_status VARCHAR(50) DEFAULT NULL;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS decisor_nome VARCHAR(150) DEFAULT NULL;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50) DEFAULT NULL;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent_stage VARCHAR(50) DEFAULT 'DESCOBERTA';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS dados_fundiarios JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS area_lavoura_util_ha DOUBLE PRECISION DEFAULT NULL;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS dados_hidrograficos JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS dados_maquinario JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS sefaz_ie_pf VARCHAR(50) DEFAULT NULL;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_credito INTEGER DEFAULT NULL;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS faixa_risco_credito VARCHAR(20) DEFAULT NULL;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS bureau_status VARCHAR(50) DEFAULT 'PENDING';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS bureau_updated_at TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS bureau_payload JSONB DEFAULT '{}'::jsonb;

      CREATE INDEX IF NOT EXISTS idx_leads_funnel_status ON leads(funnel_status);
    `;

    const propSql = `
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS funnel_status VARCHAR(50) DEFAULT 'NOVOS';
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS funnel_updated_at TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS codigo_car VARCHAR(100) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS status_car VARCHAR(50) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS condicao_car VARCHAR(50) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS tag_fonte VARCHAR(50) DEFAULT 'SIGEF';
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS area_app_ha DOUBLE PRECISION DEFAULT 0.0;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS area_reserva_legal_ha DOUBLE PRECISION DEFAULT 0.0;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS tem_passivo_ambiental BOOLEAN DEFAULT FALSE;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS alerta_ambiental TEXT DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS inscricao_estadual VARCHAR(50) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS produtor_pf_nome VARCHAR(255) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS produtor_pf_cpf VARCHAR(20) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS sefaz_status VARCHAR(50) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS sefaz_uf VARCHAR(2) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS whatsapp_produtor_pf VARCHAR(50) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS area_lavoura_util_ha DOUBLE PRECISION DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS dados_hidrograficos JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS dados_maquinario JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS feedback_comercial TEXT DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS feedback_status VARCHAR(50) DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS interesse_maquinario TEXT DEFAULT NULL;
      ALTER TABLE propriedades_rurais ADD COLUMN IF NOT EXISTS decisor_nome VARCHAR(150) DEFAULT NULL;

      CREATE INDEX IF NOT EXISTS idx_propriedades_funnel_status ON propriedades_rurais(funnel_status);
      CREATE INDEX IF NOT EXISTS idx_propriedades_codigo_car ON propriedades_rurais(codigo_car);
    `;

    await pool.query(leadsSql);
    console.log('✅ Colunas de leads aplicadas com sucesso!');

    await pool.query(propSql);
    console.log('✅ Colunas de propriedades_rurais aplicadas com sucesso!');

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro ao atualizar schema no Supabase:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

syncSchema();
