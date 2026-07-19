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
};
