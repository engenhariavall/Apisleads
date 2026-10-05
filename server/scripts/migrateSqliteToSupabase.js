/**
 * Script de Migração em Lote dos Dados: SQLite -> Supabase (PostgreSQL 15+)
 * Padrão VERSUS — Fase 24: Cloud Deploy Readiness
 * 
 * Uso:
 *   node server/scripts/migrateSqliteToSupabase.js [--dry-run]
 * 
 * Requisitos:
 *   DATABASE_URL definida no .env ou via parâmetro de ambiente.
 *   Se DATABASE_URL não estiver configurada, executa em modo dry-run / simulação estruturada.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadEnv } from '../src/config/env.js';

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/leads.sqlite');

const isDryRun = process.argv.includes('--dry-run') || !process.env.DATABASE_URL;

console.log('======================================================================');
console.log('🚀 INICIANDO SCRIPT DE MIGRAÇÃO EM LOTE: SQLITE -> SUPABASE POSTGRESQL');
console.log('======================================================================');
console.log(`📂 Origem SQLite: ${DB_PATH}`);
console.log(`🌐 Modo: ${isDryRun ? 'DRY-RUN (Simulação e Validação de Tipos)' : 'CARGA REAL NO SUPABASE'}`);
if (process.env.DATABASE_URL) {
  const masked = process.env.DATABASE_URL.replace(/:\/\/.*?:.*?@/, '://***:***@');
  console.log(`🎯 Destino: ${masked}`);
} else {
  console.log('ℹ️  DATABASE_URL não detectada. Executando em modo de validação.');
}
console.log('----------------------------------------------------------------------');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Arquivo SQLite não encontrado em:', DB_PATH);
  process.exit(1);
}

const sqlite = new DatabaseSync(DB_PATH);

async function migrateData() {
  const startTime = Date.now();
  let pool = null;

  if (!isDryRun) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Migração de Segmentos
    // -------------------------------------------------------------------------
    console.log('\n[1/4] Extraindo e transformando tabela: segments...');
    const segments = sqlite.prepare('SELECT * FROM segments').all();
    console.log(`   Lidos do SQLite: ${segments.length} registros`);

    if (!isDryRun && pool) {
      for (const seg of segments) {
        await pool.query(`
          INSERT INTO segments (id, name, icon, description)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            icon = EXCLUDED.icon,
            description = EXCLUDED.description,
            updated_at = NOW()
        `, [seg.id, seg.name, seg.icon, seg.description]);
      }
      console.log(`   ✅ ${segments.length} segmentos sincronizados no Supabase.`);
    }

    // -------------------------------------------------------------------------
    // 2. Migração de Segment_Cnaes
    // -------------------------------------------------------------------------
    console.log('\n[2/4] Extraindo e transformando tabela: segment_cnaes...');
    const segmentCnaes = sqlite.prepare('SELECT * FROM segment_cnaes').all();
    console.log(`   Lidos do SQLite: ${segmentCnaes.length} registros`);

    if (!isDryRun && pool) {
      for (const sc of segmentCnaes) {
        await pool.query(`
          INSERT INTO segment_cnaes (id, segment_id, cnae_code, cnae_description, target_type)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            segment_id = EXCLUDED.segment_id,
            cnae_code = EXCLUDED.cnae_code,
            cnae_description = EXCLUDED.cnae_description,
            target_type = EXCLUDED.target_type,
            updated_at = NOW()
        `, [sc.id, sc.segment_id, sc.cnae_code, sc.cnae_description, sc.target_type || 'BUYER']);
      }
      console.log(`   ✅ ${segmentCnaes.length} mapeamentos CNAE sincronizados no Supabase.`);
    }

    // -------------------------------------------------------------------------
    // 3. Migração de Indicadores Municipais
    // -------------------------------------------------------------------------
    console.log('\n[3/4] Extraindo e transformando tabela: municipal_indicators...');
    const municipals = sqlite.prepare('SELECT * FROM municipal_indicators').all();
    console.log(`   Lidos do SQLite: ${municipals.length} registros`);

    if (!isDryRun && pool) {
      for (const m of municipals) {
        let setorialJson = '{}';
        try {
          if (m.consumo_setorial_json) {
            JSON.parse(m.consumo_setorial_json);
            setorialJson = m.consumo_setorial_json;
          }
        } catch {
          setorialJson = '{}';
        }

        await pool.query(`
          INSERT INTO municipal_indicators (
            ibge_code, municipio, uf, populacao_estimada, pib_per_capita,
            consumo_mensal_per_capita, consumo_setorial_json, ipc_score,
            frota_total, frota_pesados_agro, frota_caminhoes_tratores,
            hectares_lavoura_estimados, obras_ativas_estimadas, metragem_alvaras_m2,
            leitos_totais, estabelecimentos_saude, densidade_leitos_mil_hab,
            comarcas_varas_total, volume_processual_anual
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8,
            $9, $10, $11,
            $12, $13, $14,
            $15, $16, $17,
            $18, $19
          )
          ON CONFLICT (ibge_code) DO UPDATE SET
            municipio = EXCLUDED.municipio,
            uf = EXCLUDED.uf,
            populacao_estimada = EXCLUDED.populacao_estimada,
            pib_per_capita = EXCLUDED.pib_per_capita,
            consumo_mensal_per_capita = EXCLUDED.consumo_mensal_per_capita,
            consumo_setorial_json = EXCLUDED.consumo_setorial_json,
            ipc_score = EXCLUDED.ipc_score,
            frota_total = EXCLUDED.frota_total,
            frota_pesados_agro = EXCLUDED.frota_pesados_agro,
            frota_caminhoes_tratores = EXCLUDED.frota_caminhoes_tratores,
            hectares_lavoura_estimados = EXCLUDED.hectares_lavoura_estimados,
            obras_ativas_estimadas = EXCLUDED.obras_ativas_estimadas,
            metragem_alvaras_m2 = EXCLUDED.metragem_alvaras_m2,
            leitos_totais = EXCLUDED.leitos_totais,
            estabelecimentos_saude = EXCLUDED.estabelecimentos_saude,
            densidade_leitos_mil_hab = EXCLUDED.densidade_leitos_mil_hab,
            comarcas_varas_total = EXCLUDED.comarcas_varas_total,
            volume_processual_anual = EXCLUDED.volume_processual_anual,
            updated_at = NOW()
        `, [
          m.ibge_code, m.municipio, m.uf, m.populacao_estimada || 0, m.pib_per_capita || 0,
          m.consumo_mensal_per_capita || 0, setorialJson, m.ipc_score || 0,
          m.frota_total || 0, m.frota_pesados_agro || 0, m.frota_caminhoes_tratores || 0,
          m.hectares_lavoura_estimados || 0, m.obras_ativas_estimadas || 0, m.metragem_alvaras_m2 || 0,
          m.leitos_totais || 0, m.estabelecimentos_saude || 0, m.densidade_leitos_mil_hab || 0,
          m.comarcas_varas_total || 0, m.volume_processual_anual || 0
        ]);
      }
      console.log(`   ✅ ${municipals.length} indicadores municipais sincronizados no Supabase.`);
    }

    // -------------------------------------------------------------------------
    // 4. Migração Principal de Leads & Inteligência Corporativa
    // -------------------------------------------------------------------------
    console.log('\n[4/4] Extraindo e transformando tabela: leads...');
    const leads = sqlite.prepare('SELECT * FROM leads').all();
    console.log(`   Lidos do SQLite: ${leads.length} leads corporativos`);

    let transformedLeads = 0;
    let competitorCount = 0;
    let reconciledCount = 0;

    for (const lead of leads) {
      // 1. Normalização de Booleans
      const isCompetitor = Boolean(lead.is_competitor === 1 || lead.is_competitor === true);
      const addressReconciled = Boolean(lead.address_reconciled === 1 || lead.address_reconciled === true);

      if (isCompetitor) competitorCount++;
      if (addressReconciled) reconciledCount++;

      // 2. Normalização de JSONB (QSA e vertical_data)
      let qsaData = '[]';
      try {
        if (lead.qsa) {
          const parsed = typeof lead.qsa === 'string' ? JSON.parse(lead.qsa) : lead.qsa;
          qsaData = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
        }
      } catch {
        qsaData = '[]';
      }

      let verticalData = '{}';
      try {
        if (lead.vertical_data) {
          const parsed = typeof lead.vertical_data === 'string' ? JSON.parse(lead.vertical_data) : lead.vertical_data;
          verticalData = JSON.stringify(parsed || {});
        }
      } catch {
        verticalData = '{}';
      }

      // 3. Normalização de Moeda e Coordenadas
      const capitalSocial = Number(lead.capital_social) || 0.00;
      const latitude = lead.latitude !== null && lead.latitude !== undefined ? Number(lead.latitude) : null;
      const longitude = lead.longitude !== null && lead.longitude !== undefined ? Number(lead.longitude) : null;
      const latOp = lead.lat_operacional !== null && lead.lat_operacional !== undefined ? Number(lead.lat_operacional) : null;
      const lngOp = lead.lng_operacional !== null && lead.lng_operacional !== undefined ? Number(lead.lng_operacional) : null;

      if (!isDryRun && pool) {
        await pool.query(`
          INSERT INTO leads (
            id, cnpj, cnpj_raw, razao_social, nome_fantasia,
            cnae_principal_codigo, cnae_principal_descricao, cnaes_secundarios,
            natureza_juridica, porte, capital_social, target_type,
            situacao_cadastral, qsa, logradouro, numero, bairro, cep,
            municipio, uf, telefone, telefone_sanitized, email,
            latitude, longitude, vertical_type, vertical_data,
            audit_status, audited_by, endereco_operacional,
            lat_operacional, lng_operacional, address_reconciled,
            reconciliation_source, reconciliation_confidence, is_competitor,
            funnel_status, funnel_updated_at, area_lavoura_util_ha
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18,
            $19, $20, $21, $22, $23,
            $24, $25, $26, $27,
            $28, $29, $30,
            $31, $32, $33,
            $34, $35, $36,
            $37, $38, $39
          )
          ON CONFLICT (cnpj) DO UPDATE SET
            razao_social = EXCLUDED.razao_social,
            nome_fantasia = EXCLUDED.nome_fantasia,
            cnae_principal_codigo = EXCLUDED.cnae_principal_codigo,
            cnae_principal_descricao = EXCLUDED.cnae_principal_descricao,
            cnaes_secundarios = EXCLUDED.cnaes_secundarios,
            porte = EXCLUDED.porte,
            capital_social = EXCLUDED.capital_social,
            target_type = EXCLUDED.target_type,
            situacao_cadastral = EXCLUDED.situacao_cadastral,
            qsa = EXCLUDED.qsa,
            logradouro = EXCLUDED.logradouro,
            numero = EXCLUDED.numero,
            bairro = EXCLUDED.bairro,
            cep = EXCLUDED.cep,
            municipio = EXCLUDED.municipio,
            uf = EXCLUDED.uf,
            telefone = EXCLUDED.telefone,
            telefone_sanitized = EXCLUDED.telefone_sanitized,
            email = EXCLUDED.email,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            vertical_type = EXCLUDED.vertical_type,
            vertical_data = EXCLUDED.vertical_data,
            audit_status = EXCLUDED.audit_status,
            audited_by = EXCLUDED.audited_by,
            endereco_operacional = EXCLUDED.endereco_operacional,
            lat_operacional = EXCLUDED.lat_operacional,
            lng_operacional = EXCLUDED.lng_operacional,
            address_reconciled = EXCLUDED.address_reconciled,
            reconciliation_source = EXCLUDED.reconciliation_source,
            reconciliation_confidence = EXCLUDED.reconciliation_confidence,
            is_competitor = EXCLUDED.is_competitor,
            funnel_status = EXCLUDED.funnel_status,
            funnel_updated_at = EXCLUDED.funnel_updated_at,
            area_lavoura_util_ha = EXCLUDED.area_lavoura_util_ha,
            updated_at = NOW()
        `, [
          lead.id, lead.cnpj, lead.cnpj_raw, lead.razao_social, lead.nome_fantasia,
          lead.cnae_principal_codigo, lead.cnae_principal_descricao, lead.cnaes_secundarios,
          lead.natureza_juridica, lead.porte, capitalSocial, lead.target_type || 'BUYER',
          lead.situacao_cadastral || 'ATIVA', qsaData, lead.logradouro, lead.numero, lead.bairro, lead.cep,
          lead.municipio, lead.uf, lead.telefone, lead.telefone_sanitized, lead.email,
          latitude, longitude, lead.vertical_type || 'GERAL', verticalData,
          lead.audit_status, lead.audited_by || 'OPERADOR_LOCAL', lead.endereco_operacional,
          latOp, lngOp, addressReconciled,
          lead.reconciliation_source, lead.reconciliation_confidence, isCompetitor,
          lead.funnel_status || 'NOVOS', lead.funnel_updated_at || null, lead.area_lavoura_util_ha || null
        ]);
      }
      transformedLeads++;
    }

    // -------------------------------------------------------------------------
    // 5. Migração de Propriedades Rurais (Fases 44, 45 & 66)
    // -------------------------------------------------------------------------
    console.log('\n[5/7] Extraindo e transformando tabela: propriedades_rurais...');
    let props = [];
    try {
      props = sqlite.prepare('SELECT * FROM propriedades_rurais').all();
    } catch {
      props = [];
    }
    console.log(`   Lidos do SQLite: ${props.length} propriedades rurais`);

    if (!isDryRun && pool) {
      for (const p of props) {
        let geoJson = '{}';
        try {
          if (p.geometria_poligono) {
            JSON.parse(p.geometria_poligono);
            geoJson = p.geometria_poligono;
          }
        } catch {
          geoJson = '{}';
        }

        // Checa se a propriedade já existe por id_sigef ou id para evitar erro de chave única
        const existing = await pool.query(
          'SELECT id FROM propriedades_rurais WHERE (id_sigef IS NOT NULL AND id_sigef = $1) OR id = $2 LIMIT 1',
          [p.id_sigef || null, p.id]
        );

        if (existing.rows.length > 0) {
          await pool.query(`
            UPDATE propriedades_rurais SET
              nome_imovel = $1,
              municipio = $2,
              uf = $3,
              area_hectares = $4,
              geometria_poligono = $5,
              centroide_lat = $6,
              centroide_lng = $7,
              codigo_car = $8,
              funnel_status = $9,
              area_lavoura_util_ha = $10,
              updated_at = NOW()
            WHERE id = $11
          `, [
            p.nome_imovel, p.municipio, p.uf, p.area_hectares || 0,
            geoJson, p.centroide_lat, p.centroide_lng,
            p.codigo_car || null, p.funnel_status || 'NOVOS', p.area_lavoura_util_ha || null,
            existing.rows[0].id
          ]);
        } else {
          await pool.query(`
            INSERT INTO propriedades_rurais (
              id, tenant_id, id_sigef, codigo_imovel, nome_imovel, municipio, uf,
              area_hectares, geometria_poligono, centroide_lat, centroide_lng,
              raio_abrangencia_km, nome_titular, cpf_cnpj_titular, status_geo,
              intent_score, intent_classification, intent_triggers,
              whatsapp_validado, linkedin_url_real, email_validado, osint_status,
              dados_agronomicos, visual_audit_status, visual_audit_tier,
              pivots_detected, silos_detected, dams_detected, vegetative_vigor_index,
              codigo_car, funnel_status, area_lavoura_util_ha,
              updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11,
              $12, $13, $14, $15,
              $16, $17, $18,
              $19, $20, $21, $22,
              $23, $24, $25,
              $26, $27, $28, $29,
              $30, $31, $32,
              NOW()
            )
          `, [
            p.id, p.tenant_id || 'tenant-root-default', p.id_sigef || null, p.codigo_imovel, p.nome_imovel, p.municipio, p.uf,
            p.area_hectares || 0, geoJson, p.centroide_lat, p.centroide_lng,
            p.raio_abrangencia_km || 5, p.nome_titular, p.cpf_cnpj_titular, p.status_geo || 'SEM_GEO',
            p.intent_score || 0, p.intent_classification || 'COLD', p.intent_triggers || '[]',
            p.whatsapp_validado, p.linkedin_url_real, p.email_validado, p.osint_status || 'PENDING',
            p.dados_agronomicos || null, p.visual_audit_status || null, p.visual_audit_tier || null,
            p.pivots_detected || 0, p.silos_detected || 0, p.dams_detected || 0, p.vegetative_vigor_index || null,
            p.codigo_car || null, p.funnel_status || 'NOVOS', p.area_lavoura_util_ha || null
          ]);
        }
      }
      console.log(`   ✅ ${props.length} propriedades rurais sincronizadas no Supabase.`);
    }

    // -------------------------------------------------------------------------
    // 6. Migração de Sparks Monitors (Radar Autônomo 24/7)
    // -------------------------------------------------------------------------
    console.log('\n[6/7] Extraindo e transformando tabela: sparks_monitors...');
    let monitors = [];
    try {
      monitors = sqlite.prepare('SELECT * FROM sparks_monitors').all();
    } catch {
      monitors = [];
    }
    console.log(`   Lidos do SQLite: ${monitors.length} monitores de sparks`);

    if (!isDryRun && pool) {
      for (const mon of monitors) {
        await pool.query(`
          INSERT INTO sparks_monitors (
            id, spark_type, nome, descricao, prioridade_tier, frequencia_minutos,
            status, total_sinais_capturados, total_leads_qualificados, tenant_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            nome = EXCLUDED.nome,
            status = EXCLUDED.status,
            frequencia_minutos = EXCLUDED.frequencia_minutos,
            updated_at = NOW()
        `, [
          mon.id, mon.spark_type, mon.nome, mon.descricao, mon.prioridade_tier || 1,
          mon.frequencia_minutos || 60, mon.status || 'ACTIVE',
          mon.total_sinais_capturados || 0, mon.total_leads_qualificados || 0,
          mon.tenant_id || 'tenant-root-default'
        ]);
      }
      console.log(`   ✅ ${monitors.length} monitores de sparks sincronizados no Supabase.`);
    }

    // -------------------------------------------------------------------------
    // 7. Migração de Usuários (RBAC & Acessos)
    // -------------------------------------------------------------------------
    console.log('\n[7/7] Extraindo e transformando tabela: users...');
    let users = [];
    try {
      users = sqlite.prepare('SELECT * FROM users').all();
    } catch {
      users = [];
    }
    console.log(`   Lidos do SQLite: ${users.length} usuários`);

    if (!isDryRun && pool) {
      for (const u of users) {
        await pool.query(`
          INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
        `, [
          u.id, u.tenant_id || 'tenant-root-default', u.email, u.password_hash,
          u.name, u.role || 'ADMIN', Boolean(u.is_active !== 0)
        ]);
      }
      console.log(`   ✅ ${users.length} usuários sincronizados no Supabase.`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('----------------------------------------------------------------------');
    console.log('🏆 RELATÓRIO CONSOLIDADO DA MIGRAÇÃO (PADRÃO VERSUS):');
    console.log(`   ⏱️  Tempo decorrido: ${duration}s`);
    console.log(`   🏢 Total de Leads processados: ${transformedLeads}`);
    console.log(`   🌾 Propriedades rurais processadas: ${props.length}`);
    console.log(`   ⚡ Monitores de Sparks processados: ${monitors.length}`);
    console.log(`   👥 Usuários processados: ${users.length}`);
    console.log(`   🕵️  Concorrentes monitorados (is_competitor = 1): ${competitorCount}`);
    console.log(`   📍 Endereços reconciliados (address_reconciled = 1): ${reconciledCount}`);
    console.log(`   📊 Segmentos: ${segments.length}`);
    console.log(`   📑 CNAEs mapeados: ${segmentCnaes.length}`);
    console.log(`   📈 Indicadores Municipais: ${municipals.length}`);
    console.log('======================================================================');
    console.log('✅ MIGRAÇÃO SQLITE -> SUPABASE HOMOLOGADA COM SUCESSO!');
    console.log('======================================================================');

  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

migrateData();
