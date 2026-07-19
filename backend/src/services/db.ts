import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure data folder exists
const dbDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'config.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

export const dbService = {
  get(key: string): string | null {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  },

  set(key: string, value: string): void {
    db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
  },

  delete(key: string): void {
    db.prepare('DELETE FROM config WHERE key = ?').run(key);
  }
};
