import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../../data/config.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Core key-value store
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Settings table — user-configurable, overrides .env defaults
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Accounts table
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    is_disabled INTEGER DEFAULT 0,
    last_used INTEGER,
    custom_label TEXT,
    quota_json TEXT
  );
`);

// Migration from JSON
const accountsJsonPath = path.resolve(__dirname, '../../../data/accounts.json');
if (fs.existsSync(accountsJsonPath)) {
  try {
    const rawData = fs.readFileSync(accountsJsonPath, 'utf-8');
    const accounts = JSON.parse(rawData);
    
    // Check if db is empty before migrating
    const countRow = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number };
    if (countRow.count === 0 && Array.isArray(accounts)) {
      console.log('Migrating accounts from JSON to SQLite...');
      const insertAccount = db.prepare(`
        INSERT INTO accounts (id, email, refresh_token, is_active, is_disabled, last_used, custom_label, quota_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const insertMany = db.transaction((accs) => {
        for (const acc of accs) {
          insertAccount.run(
            acc.id,
            acc.email,
            acc.refreshToken,
            acc.isActive ? 1 : 0,
            acc.isDisabled ? 1 : 0,
            acc.last_used || null,
            acc.custom_label || null,
            acc.quota ? JSON.stringify(acc.quota) : null
          );
        }
      });
      
      insertMany(accounts);
      console.log('Migration successful. Renaming accounts.json to accounts.json.bak');
      fs.renameSync(accountsJsonPath, accountsJsonPath + '.bak');
    }
  } catch (err) {
    console.error('Failed to migrate accounts from JSON:', err);
  }
}

// Seed default settings from .env if not already set
const defaults: Record<string, string> = {
  antigravity_path: config.ANTIGRAVITY_PATH,
  antigravity_port: String(config.ANTIGRAVITY_PORT),
  auth_password: config.AUTH_PASSWORD,
};

const insertSetting = db.prepare(
  `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
);

for (const [key, value] of Object.entries(defaults)) {
  insertSetting.run(key, value);
}

export const dbService = {
  // KV store
  get(key: string): string | undefined {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  },
  set(key: string, value: string): void {
    db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(
      key,
      value
    );
  },

  // Settings
  getSetting(key: string): string | undefined {
    const row = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value;
  },
  getAllSettings(): Record<string, string> {
    const rows = db
      .prepare('SELECT key, value FROM settings')
      .all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  setSetting(key: string, value: string): void {
    db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    ).run(key, value);
  },

  // Accounts
  getAllAccounts(): any[] {
    const rows = db.prepare('SELECT * FROM accounts').all() as any[];
    return rows.map(r => ({
      id: r.id,
      email: r.email,
      refreshToken: r.refresh_token,
      isActive: r.is_active === 1,
      isDisabled: r.is_disabled === 1,
      last_used: r.last_used,
      custom_label: r.custom_label,
      quota: r.quota_json ? JSON.parse(r.quota_json) : undefined
    }));
  },
  
  getAccount(id: string): any {
    const r = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      email: r.email,
      refreshToken: r.refresh_token,
      isActive: r.is_active === 1,
      isDisabled: r.is_disabled === 1,
      last_used: r.last_used,
      custom_label: r.custom_label,
      quota: r.quota_json ? JSON.parse(r.quota_json) : undefined
    };
  },

  upsertAccount(acc: any): void {
    db.prepare(`
      INSERT INTO accounts (id, email, refresh_token, is_active, is_disabled, last_used, custom_label, quota_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        refresh_token = excluded.refresh_token,
        is_active = excluded.is_active,
        is_disabled = excluded.is_disabled,
        last_used = excluded.last_used,
        custom_label = excluded.custom_label,
        quota_json = excluded.quota_json
    `).run(
      acc.id,
      acc.email,
      acc.refreshToken,
      acc.isActive ? 1 : 0,
      acc.isDisabled ? 1 : 0,
      acc.last_used || null,
      acc.custom_label || null,
      acc.quota ? JSON.stringify(acc.quota) : null
    );
  },

  deleteAccount(id: string): void {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  },

  updateAccountStatus(id: string, updates: { isActive?: boolean, isDisabled?: boolean, last_used?: number, quota?: any }): void {
    const sets: string[] = [];
    const params: any[] = [];
    
    if (updates.isActive !== undefined) {
      sets.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }
    if (updates.isDisabled !== undefined) {
      sets.push('is_disabled = ?');
      params.push(updates.isDisabled ? 1 : 0);
    }
    if (updates.last_used !== undefined) {
      sets.push('last_used = ?');
      params.push(updates.last_used);
    }
    if (updates.quota !== undefined) {
      sets.push('quota_json = ?');
      params.push(updates.quota ? JSON.stringify(updates.quota) : null);
    }
    
    if (sets.length === 0) return;
    params.push(id);
    
    db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },
  
  clearActiveStatus(): void {
    db.prepare('UPDATE accounts SET is_active = 0').run();
  }
};
