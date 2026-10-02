/**
 * server/src/config/seedAdminMaster.js
 * 
 * FASE 26 — ETAPA 1: SEED SEGURO DO SUPER ADMIN MASTER
 * 
 * Cria ou atualiza o usuário Super Admin padrão e quota irrestrita
 * com credenciais provenientes de variáveis de ambiente ou defaults de segurança.
 * Suporta arquitetura Dual-Engine: SQLite Local + PostgreSQL / Supabase.
 */

import crypto from 'crypto';
import db from './database.js';
import { hashPassword } from '../utils/security.js';

export async function seedSuperAdmin() {
  const adminEmail = (process.env.SUPER_ADMIN_EMAIL || 'hajaluzstudio@gmail.com').toLowerCase().trim();
  const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'sophia11052016';
  const adminName = process.env.SUPER_ADMIN_NAME || 'Super Admin Master';

  try {
    const passwordHash = await hashPassword(adminPass);

    // 1. Seed no SQLite local
    if (db.sqlite) {
      try {
        const existingSqlite = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(adminEmail);
        if (!existingSqlite) {
          const userId = `usr-admin-${crypto.randomBytes(4).toString('hex')}`;
          db.prepare(`
            INSERT INTO users (id, tenant_id, email, password_hash, access_password, name, role, is_active, created_at)
            VALUES (?, 'tenant-root-default', ?, ?, ?, ?, 'SUPER_ADMIN', 1, CURRENT_TIMESTAMP)
          `).run(userId, adminEmail, passwordHash, adminPass, adminName);

          db.prepare(`
            INSERT OR IGNORE INTO export_quotas (user_id, daily_limit, monthly_limit, used_today, used_this_month, last_reset_date)
            VALUES (?, 999999, 9999999, 0, 0, date('now'))
          `).run(userId);
          console.log(`👑 [ADMIN MASTER SEED SQLITE] Super Admin provisionado: ${adminEmail}`);
        } else {
          db.prepare("UPDATE users SET role = 'SUPER_ADMIN', password_hash = ?, access_password = ?, is_active = 1 WHERE id = ?").run(passwordHash, adminPass, existingSqlite.id);
        }

        // Garante também o usuário Felipe Corá da Avall no SQLite
        const existingFelipe = db.prepare("SELECT id FROM users WHERE email = 'felipecostaprodutor@gmail.com'").get();
        if (!existingFelipe) {
          const felipePassHash = await hashPassword('123456');
          db.prepare(`
            INSERT INTO users (id, tenant_id, email, password_hash, access_password, name, role, is_active, created_at)
            VALUES ('usr-48779d7ce1', 'tenant-e6094206', 'felipecostaprodutor@gmail.com', ?, '123456', 'Felipe Corá', 'Admin', 1, CURRENT_TIMESTAMP)
          `).run(felipePassHash);

          db.prepare(`
            INSERT OR IGNORE INTO export_quotas (user_id, daily_limit, monthly_limit, used_today, used_this_month, last_reset_date)
            VALUES ('usr-48779d7ce1', 5000, 100000, 0, 0, date('now'))
          `).run();
        }
      } catch (errSqlite) {
        console.warn('⚠️ [ADMIN MASTER SEED SQLITE WARNING]:', errSqlite.message);
      }
    }

    // 2. Seed no PostgreSQL / Supabase
    if (db.isPostgres && db.pool) {
      try {
        const pRes = await db.query('SELECT id, email, role FROM users WHERE email = ?', [adminEmail]);
        if (!pRes.rows || pRes.rows.length === 0) {
          const userId = `usr-admin-${crypto.randomBytes(4).toString('hex')}`;
          await db.query(`
            INSERT INTO users (id, tenant_id, email, password_hash, access_password, name, role, is_active, created_at)
            VALUES (?, 'tenant-root-default', ?, ?, ?, ?, 'SUPER_ADMIN', TRUE, NOW())
          `, [userId, adminEmail, passwordHash, adminPass, adminName]);

          await db.query(`
            INSERT INTO export_quotas (user_id, daily_limit, monthly_limit, used_today, used_this_month, last_reset_date)
            VALUES (?, 999999, 9999999, 0, 0, CURRENT_DATE)
            ON CONFLICT (user_id) DO NOTHING
          `, [userId]);
          console.log(`👑 [ADMIN MASTER SEED POSTGRES] Super Admin provisionado: ${adminEmail}`);
        } else {
          await db.query("UPDATE users SET role = 'SUPER_ADMIN', password_hash = ?, access_password = ?, is_active = TRUE WHERE id = ?", [passwordHash, adminPass, pRes.rows[0].id]);
        }

        // Garante também o usuário Felipe Corá da Avall no Postgres
        const felipePg = await db.query("SELECT id FROM users WHERE email = 'felipecostaprodutor@gmail.com'");
        if (!felipePg.rows || felipePg.rows.length === 0) {
          const felipePassHash = await hashPassword('123456');
          await db.query(`
            INSERT INTO users (id, tenant_id, email, password_hash, access_password, name, role, is_active, created_at)
            VALUES ('usr-48779d7ce1', 'tenant-e6094206', 'felipecostaprodutor@gmail.com', ?, '123456', 'Felipe Corá', 'Admin', TRUE, NOW())
          `, [felipePassHash]);

          await db.query(`
            INSERT INTO export_quotas (user_id, daily_limit, monthly_limit, used_today, used_this_month, last_reset_date)
            VALUES ('usr-48779d7ce1', 5000, 100000, 0, 0, CURRENT_DATE)
            ON CONFLICT (user_id) DO NOTHING
          `);
        }
      } catch (errPg) {
        console.warn('⚠️ [ADMIN MASTER SEED POSTGRES WARNING]:', errPg.message);
      }
    }
  } catch (err) {
    console.error('❌ [ADMIN MASTER SEED ERROR] Falha ao provisionar Super Admin:', err.message);
  }
}

// Execução direta se invocado via CLI
if (process.argv[1] && process.argv[1].endsWith('seedAdminMaster.js')) {
  seedSuperAdmin().then(() => process.exit(0));
}
