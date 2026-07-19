import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';

// Simple custom file-based store to avoid native library dependencies/issues
class FileSessionStore {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  private getPath(sid: string): string {
    return path.join(this.dir, `${encodeURIComponent(sid)}.json`);
  }

  get(sid: string, callback: (err: any, session?: any) => void): void {
    const filePath = this.getPath(sid);
    if (!fs.existsSync(filePath)) {
      return callback(null, null);
    }
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return callback(err);
      try {
        const session = JSON.parse(data);
        callback(null, session);
      } catch (e) {
        callback(e);
      }
    });
  }

  set(sid: string, session: any, callback: (err?: any) => void): void {
    const filePath = this.getPath(sid);
    fs.writeFile(filePath, JSON.stringify(session), 'utf8', (err) => {
      callback(err);
    });
  }

  destroy(sid: string, callback: (err?: any) => void): void {
    const filePath = this.getPath(sid);
    if (!fs.existsSync(filePath)) {
      return callback(null);
    }
    fs.unlink(filePath, (err) => {
      callback(err);
    });
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionDir = path.resolve(__dirname, '../../../data/sessions');

export async function registerSession(fastify: FastifyInstance) {
  const store = new FileSessionStore(sessionDir);

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
