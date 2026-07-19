import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root (3 levels up from src/config/ or dist/config/)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  // Server
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '127.0.0.1',

  // CDP (Chrome DevTools Protocol)
  CDP_HOST: process.env.CDP_HOST || '127.0.0.1',
  CDP_PORT: parseInt(process.env.CDP_PORT || '9000', 10),

  // Auth
  AUTH_ENABLED: process.env.AUTH_ENABLED === 'true',
  AUTH_PASSWORD: process.env.AUTH_PASSWORD || '',
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET || 'default-secret-change-me',
};
