import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { FastifyInstance } from 'fastify';
import { db } from '../services/db.js';
import { config } from '../config/env.js';

// Custom session store that uses the existing better-sqlite3 DB connection
class SqliteSessionStore {
  constructor() {
    // Create sessions table in our shared SQLite DB
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions (expired);
    `);
  }

  get(sid: string, callback: (err: any, session?: any) => void): void {
    try {
      const row = db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?').get(sid) as
        | { sess: string; expired: number }
        | undefined;

      if (!row) {
        return callback(null, null);
      }

      // Check if session has expired
      if (Date.now() > row.expired) {
        this.destroy(sid, () => callback(null, null));
        return;
      }

      const session = JSON.parse(row.sess);
      callback(null, session);
    } catch (err) {
      callback(err);
    }
  }

  set(sid: string, session: any, callback: (err?: any) => void): void {
    try {
      const sessStr = JSON.stringify(session);
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days fallback
      const expired = Date.now() + (session.cookie?.maxAge ?? maxAge);

      db.prepare(`
        INSERT OR REPLACE INTO sessions (sid, sess, expired)
        VALUES (?, ?, ?)
      `).run(sid, sessStr, expired);

      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid: string, callback: (err?: any) => void): void {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

export async function registerSession(fastify: FastifyInstance) {
  const store = new SqliteSessionStore();

  await fastify.register(fastifyCookie);
  await fastify.register(fastifySession, {
    secret: config.AUTH_SESSION_SECRET,
    cookieName: 'ag_session',
    store: store as any,
    cookie: {
      secure: false, // set true if behind HTTPS
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });
}
