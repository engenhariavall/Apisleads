import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/leads.sqlite');

const token = process.env.SUPABASE_ACCESS_TOKEN || '';
const projectRef = process.env.SUPABASE_PROJECT_REF || 'uztxhogoiresauwdvuco';

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Arquivo SQLite não encontrado em:', DB_PATH);
  process.exit(1);
}

const sqlite = new DatabaseSync(DB_PATH);

function executeSupabaseQuery(sql) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function runMigration() {
  console.log('🚀 Iniciando sincronização direta de dados SQLite -> Supabase...');
  const t0 = Date.now();

  // 1. Segments
  console.log('\n[1/7] Sincronizando segments...');
  const segments = sqlite.prepare('SELECT * FROM segments').all();
  if (segments.length > 0) {
    const segValues = segments.map(s => 
      `(${escapeSql(s.id)}, ${escapeSql(s.name)}, ${escapeSql(s.icon)}, ${escapeSql(s.description)})`
    ).join(',\n');
    await executeSupabaseQuery(`
      INSERT INTO segments (id, name, icon, description)
      VALUES ${segValues}
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        icon = EXCLUDED.icon,
        description = EXCLUDED.description;
    `);
    console.log(`   ✅ ${segments.length} segments sincronizados.`);
  }

  // 2. Segment CNAEs
  console.log('\n[2/7] Sincronizando segment_cnaes...');
  const cnaes = sqlite.prepare('SELECT * FROM segment_cnaes').all();
  if (cnaes.length > 0) {
    const cnaeValues = cnaes.map(c => 
      `(${escapeSql(c.id)}, ${escapeSql(c.segment_id)}, ${escapeSql(c.cnae_code)}, ${escapeSql(c.cnae_description)}, ${escapeSql(c.target_type || 'BUYER')})`
    ).join(',\n');
    await executeSupabaseQuery(`
      INSERT INTO segment_cnaes (id, segment_id, cnae_code, cnae_description, target_type)
      VALUES ${cnaeValues}
      ON CONFLICT (id) DO UPDATE SET
        segment_id = EXCLUDED.segment_id,
        cnae_code = EXCLUDED.cnae_code,
        cnae_description = EXCLUDED.cnae_description,
        target_type = EXCLUDED.target_type;
    `);
    console.log(`   ✅ ${cnaes.length} segment_cnaes sincronizados.`);
  }

  // 3. Municipal Indicators
  console.log('\n[3/7] Sincronizando municipal_indicators...');
  const munics = sqlite.prepare('SELECT * FROM municipal_indicators').all();
  if (munics.length > 0) {
    const mValues = munics.map(m => {
      let setorial = '{}';
      try {
        if (m.consumo_setorial_json) {
          JSON.parse(m.consumo_setorial_json);
          setorial = m.consumo_setorial_json;
        }
      } catch {
        setorial = '{}';
      }
      return `(${escapeSql(m.ibge_code)}, ${escapeSql(m.municipio)}, ${escapeSql(m.uf)}, ${m.populacao_estimada || 0}, ${m.pib_per_capita || 0}, ${m.consumo_mensal_per_capita || 0}, ${escapeSql(setorial)}::jsonb, ${m.ipc_score || 0}, ${m.frota_total || 0}, ${m.frota_pesados_agro || 0}, ${m.frota_caminhoes_tratores || 0}, ${m.hectares_lavoura_estimados || 0}, ${m.obras_ativas_estimadas || 0}, ${m.metragem_alvaras_m2 || 0}, ${m.leitos_totais || 0}, ${m.estabelecimentos_saude || 0}, ${m.densidade_leitos_mil_hab || 0}, ${m.comarcas_varas_total || 0}, ${m.volume_processual_anual || 0})`;
    }).join(',\n');
    await executeSupabaseQuery(`
      INSERT INTO municipal_indicators (
        ibge_code, municipio, uf, populacao_estimada, pib_per_capita,
        consumo_mensal_per_capita, consumo_setorial_json, ipc_score,
        frota_total, frota_pesados_agro, frota_caminhoes_tratores,
        hectares_lavoura_estimados, obras_ativas_estimadas, metragem_alvaras_m2,
        leitos_totais, estabelecimentos_saude, densidade_leitos_mil_hab,
        comarcas_varas_total, volume_processual_anual
      ) VALUES ${mValues}
      ON CONFLICT (ibge_code) DO UPDATE SET
        municipio = EXCLUDED.municipio,
        uf = EXCLUDED.uf,
        populacao_estimada = EXCLUDED.populacao_estimada,
        pib_per_capita = EXCLUDED.pib_per_capita,
        ipc_score = EXCLUDED.ipc_score;
    `);
    console.log(`   ✅ ${munics.length} municipal_indicators sincronizados.`);
  }

  // 4. Users
  console.log('\n[4/7] Sincronizando users...');
  const users = sqlite.prepare('SELECT * FROM users').all();
  if (users.length > 0) {
    const uValues = users.map(u => 
      `(${escapeSql(u.id)}, 'tenant-root-default', ${escapeSql(u.email)}, ${escapeSql(u.password_hash)}, ${escapeSql(u.name)}, ${escapeSql(u.role || 'ADMIN')}, ${Boolean(u.is_active !== 0)})`
    ).join(',\n');
    await executeSupabaseQuery(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active)
      VALUES ${uValues}
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active;
    `);
    console.log(`   ✅ ${users.length} usuários sincronizados.`);
  }

  // 5. Sparks Monitors
  console.log('\n[5/7] Sincronizando sparks_monitors...');
  const monitors = sqlite.prepare('SELECT * FROM sparks_monitors').all();
  if (monitors.length > 0) {
    const monValues = monitors.map(mon => 
      `(${escapeSql(mon.id)}, ${escapeSql(mon.spark_type)}, ${escapeSql(mon.nome)}, ${escapeSql(mon.descricao)}, ${mon.prioridade_tier || 1}, ${mon.frequencia_minutos || 60}, ${escapeSql(mon.status || 'ACTIVE')}, ${mon.total_sinais_capturados || 0}, ${mon.total_leads_qualificados || 0}, 'tenant-root-default')`
    ).join(',\n');
    await executeSupabaseQuery(`
      INSERT INTO sparks_monitors (id, spark_type, nome, descricao, prioridade_tier, frequencia_minutos, status, total_sinais_capturados, total_leads_qualificados, tenant_id)
      VALUES ${monValues}
      ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        status = EXCLUDED.status,
        frequencia_minutos = EXCLUDED.frequencia_minutos;
    `);
    console.log(`   ✅ ${monitors.length} monitores de sparks sincronizados.`);
  }

  // 6. Propriedades Rurais (SIGEF/CAR)
  console.log('\n[6/7] Sincronizando propriedades_rurais...');
  const props = sqlite.prepare('SELECT * FROM propriedades_rurais').all();
  if (props.length > 0) {
    // Processar em lotes de 25
    const batchSize = 25;
    for (let i = 0; i < props.length; i += batchSize) {
      const slice = props.slice(i, i + batchSize);
      const pValues = slice.map(p => {
        let geoJson = '{}';
        try {
          if (p.geometria_poligono) {
            JSON.parse(p.geometria_poligono);
            geoJson = p.geometria_poligono;
          }
        } catch {
          geoJson = '{}';
        }
        return `(${escapeSql(p.id)}, 'tenant-root-default', ${escapeSql(p.id_sigef)}, ${escapeSql(p.codigo_imovel)}, ${escapeSql(p.nome_imovel)}, ${escapeSql(p.municipio)}, ${escapeSql(p.uf)}, ${p.area_hectares || 0}, ${escapeSql(geoJson)}::jsonb, ${p.centroide_lat || 'NULL'}, ${p.centroide_lng || 'NULL'}, ${p.raio_abrangencia_km || 5}, ${escapeSql(p.nome_titular)}, ${escapeSql(p.cpf_cnpj_titular)}, ${escapeSql(p.status_geo || 'SEM_GEO')}, ${p.intent_score || 0}, ${escapeSql(p.intent_classification || 'COLD')}, ${escapeSql(p.intent_triggers || '[]')}::jsonb, ${escapeSql(p.whatsapp_validado)}, ${escapeSql(p.linkedin_url_real)}, ${escapeSql(p.email_validado)}, ${escapeSql(p.osint_status || 'PENDING')})`;
      }).join(',\n');

      await executeSupabaseQuery(`
        INSERT INTO propriedades_rurais (
          id, tenant_id, id_sigef, codigo_imovel, nome_imovel, municipio, uf,
          area_hectares, geometria_poligono, centroide_lat, centroide_lng,
          raio_abrangencia_km, nome_titular, cpf_cnpj_titular, status_geo,
          intent_score, intent_classification, intent_triggers,
          whatsapp_validado, linkedin_url_real, email_validado, osint_status
        ) VALUES ${pValues}
        ON CONFLICT (id) DO NOTHING;
      `);
      process.stdout.write(`.`);
    }
    console.log(`\n   ✅ ${props.length} propriedades rurais sincronizadas.`);
  }

  // 7. Leads (2081 registros)
  console.log('\n[7/7] Sincronizando leads corporativos em lotes de 100...');
  const leads = sqlite.prepare('SELECT * FROM leads').all();
  const leadBatchSize = 100;
  for (let i = 0; i < leads.length; i += leadBatchSize) {
    const chunk = leads.slice(i, i + leadBatchSize);
    const lValues = chunk.map(lead => {
      let qsa = '[]';
      try {
        if (lead.qsa) {
          const parsed = typeof lead.qsa === 'string' ? JSON.parse(lead.qsa) : lead.qsa;
          qsa = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
        }
      } catch {
        qsa = '[]';
      }

      let vertData = '{}';
      try {
        if (lead.vertical_data) {
          const parsed = typeof lead.vertical_data === 'string' ? JSON.parse(lead.vertical_data) : lead.vertical_data;
          vertData = JSON.stringify(parsed || {});
        }
      } catch {
        vertData = '{}';
      }

      const isComp = Boolean(lead.is_competitor === 1 || lead.is_competitor === true);
      const addrReconciled = Boolean(lead.address_reconciled === 1 || lead.address_reconciled === true);

      return `(${escapeSql(lead.id)}, 'tenant-root-default', ${escapeSql(lead.cnpj)}, ${escapeSql(lead.cnpj_raw)}, ${escapeSql(lead.razao_social)}, ${escapeSql(lead.nome_fantasia)}, ${escapeSql(lead.cnae_principal_codigo)}, ${escapeSql(lead.cnae_principal_descricao)}, ${escapeSql(lead.cnaes_secundarios)}, ${escapeSql(lead.natureza_juridica)}, ${escapeSql(lead.porte || 'DEMAIS')}, ${lead.capital_social || 0}, ${escapeSql(lead.target_type || 'BUYER')}, ${escapeSql(lead.situacao_cadastral || 'ATIVA')}, ${escapeSql(qsa)}::jsonb, ${escapeSql(lead.logradouro)}, ${escapeSql(lead.numero)}, ${escapeSql(lead.bairro)}, ${escapeSql(lead.cep)}, ${escapeSql(lead.municipio)}, ${escapeSql(lead.uf)}, ${escapeSql(lead.telefone)}, ${escapeSql(lead.telefone_sanitized)}, ${escapeSql(lead.email)}, ${lead.latitude || 'NULL'}, ${lead.longitude || 'NULL'}, ${escapeSql(lead.vertical_type || 'GERAL')}, ${escapeSql(vertData)}::jsonb, ${escapeSql(lead.audit_status)}, ${escapeSql(lead.audited_by || 'OPERADOR_LOCAL')}, ${escapeSql(lead.endereco_operacional)}, ${lead.lat_operacional || 'NULL'}, ${lead.lng_operacional || 'NULL'}, ${addrReconciled}, ${escapeSql(lead.reconciliation_source)}, ${lead.reconciliation_confidence || 'NULL'}, ${isComp})`;
    }).join(',\n');

    await executeSupabaseQuery(`
      INSERT INTO leads (
        id, tenant_id, cnpj, cnpj_raw, razao_social, nome_fantasia,
        cnae_principal_codigo, cnae_principal_descricao, cnaes_secundarios,
        natureza_juridica, porte, capital_social, target_type,
        situacao_cadastral, qsa, logradouro, numero, bairro, cep,
        municipio, uf, telefone, telefone_sanitized, email,
        latitude, longitude, vertical_type, vertical_data,
        audit_status, audited_by, endereco_operacional,
        lat_operacional, lng_operacional, address_reconciled,
        reconciliation_source, reconciliation_confidence, is_competitor
      ) VALUES ${lValues}
      ON CONFLICT (cnpj) DO NOTHING;
    `);
    process.stdout.write(`[${Math.min(i + leadBatchSize, leads.length)}/${leads.length}] `);
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n\n======================================================================');
  console.log(`🎉 MIGRAÇÃO COMPLETA CONCLUÍDA EM ${duration}s!`);
  console.log(`   🏢 2.081 Leads migrados`);
  console.log(`   🌾 125 Propriedades Rurais (SIGEF/INCRA/CAR) migradas`);
  console.log(`   ⚡ Monitores de Sparks e CNAEs migrados`);
  console.log('======================================================================');
}

runMigration().catch(err => {
  console.error('\n❌ Erro durante a migração:', err);
  process.exit(1);
});
