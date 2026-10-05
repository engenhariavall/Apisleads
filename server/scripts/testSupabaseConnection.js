import pg from 'pg';
import { loadEnv } from '../src/config/env.js';

loadEnv();

async function runTest() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL não definida.');
    process.exit(1);
  }

  const masked = dbUrl.replace(/:\/\/.*?:.*?@/, '://***:***@');
  console.log('🔍 Testando conexão com Supabase:', masked);

  const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]+/i, '');
  const pool = new pg.Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  try {
    const t0 = Date.now();
    const res = await pool.query('SELECT current_database() as db, current_user as user, version() as ver;');
    const latency = Date.now() - t0;
    console.log('✅ CONEXÃO ESTABELECIDA COM SUCESSO!');
    console.log(`⏱️ Latência de resposta: ${latency}ms`);
    console.log(`🗄️ Banco de dados: ${res.rows[0].db}`);
    console.log(`👤 Usuário: ${res.rows[0].user}`);
    console.log(`🐘 Versão PostgreSQL: ${res.rows[0].ver.split(' ')[0]} ${res.rows[0].ver.split(' ')[1]}`);

    // Verifica tabelas existentes no Supabase
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`\n📋 Tabelas encontradas no schema public (${tablesRes.rows.length}):`);
    tablesRes.rows.forEach(r => console.log(`   - ${r.table_name}`));

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro ao conectar no Supabase:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTest();
