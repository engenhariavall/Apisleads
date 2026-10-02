/**
 * server/src/config/seedAdminMaster.js
 * 
 * FASE 26 — ETAPA 1: SEED SEGURO DO SUPER ADMIN MASTER
 * 
 * Cria ou atualiza o usuário Super Admin padrão e quota irrestrita
 * com credenciais provenientes de variáveis de ambiente ou defaults de segurança.
 */

import crypto from 'crypto';
import db from './database.js';
import { hashPassword } from '../utils/security.js';

export async function seedSuperAdmin() {
  const adminEmail = (process.env.SUPER_ADMIN_EMAIL || 'hajaluzstudio@gmail.com').toLowerCase().trim();
  const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'sophia11052016';
  const adminName = process.env.SUPER_ADMIN_NAME || 'Super Admin Master';

  try {
    // 1. Verifica se já existe QUALQUER SUPER_ADMIN ativo
    const anySuperAdmin = db.prepare("SELECT id, email, role FROM users WHERE role = 'SUPER_ADMIN'").get();
    if (anySuperAdmin) {
      console.log(`👑 [ADMIN MASTER SEED] Super Admin já ativo: ${anySuperAdmin.email}`);
      return;
    }

    const existing = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(adminEmail);

    if (!existing) {
      const passwordHash = await hashPassword(adminPass);
      const userId = `usr-admin-${crypto.randomBytes(4).toString('hex')}`;

      db.prepare(`
        INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active, created_at)
        VALUES (?, 'tenant-root-default', ?, ?, ?, 'SUPER_ADMIN', 1, CURRENT_TIMESTAMP)
      `).run(userId, adminEmail, passwordHash, adminName);

      // Quota ilimitada para o Super Admin (999.999/dia e 9.999.999/mês)
      db.prepare(`
        INSERT INTO export_quotas (user_id, daily_limit, monthly_limit, used_today, used_this_month, last_reset_date)
        VALUES (?, 999999, 9999999, 0, 0, date('now'))
      `).run(userId);

      // Log inicial de sistema
      db.prepare(`
        INSERT INTO audit_logs (id, tenant_id, user_id, user_email, action, endpoint, query_params, ip_address, user_agent)
        VALUES (?, 'tenant-root-default', ?, ?, 'SYSTEM_INIT_SUPER_ADMIN', 'seedAdminMaster', '{"event":"bootstrap_complete"}', '127.0.0.1', 'VersusSystemEngine/1.0')
      `).run(`log-${crypto.randomBytes(6).toString('hex')}`, userId, adminEmail);

      console.log(`👑 [ADMIN MASTER SEED] Super Admin provisionado com sucesso: ${adminEmail} (Role: SUPER_ADMIN)`);
    } else {
      // Garante que o role seja SUPER_ADMIN caso tenha sido alterado
      if (existing.role !== 'SUPER_ADMIN') {
        db.prepare("UPDATE users SET role = 'SUPER_ADMIN' WHERE id = ?").run(existing.id);
      }
      console.log(`👑 [ADMIN MASTER SEED] Super Admin já existente e ativo: ${adminEmail}`);
    }
  } catch (err) {
    console.error('❌ [ADMIN MASTER SEED ERROR] Falha ao provisionar Super Admin:', err.message);
  }
}

// Execução direta se invocado via CLI
if (process.argv[1] && process.argv[1].endsWith('seedAdminMaster.js')) {
  seedSuperAdmin().then(() => process.exit(0));
}
