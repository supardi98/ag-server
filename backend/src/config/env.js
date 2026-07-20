"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
var dotenv_1 = require("dotenv");
var path_1 = require("path");
var url_1 = require("url");
var __dirname = path_1.default.dirname((0, url_1.fileURLToPath)(import.meta.url));
// Load .env from project root (3 levels up from src/config/ or dist/config/)
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
exports.config = {
    // Server
    PORT: parseInt(process.env.PORT || '3000', 10),
    HOST: process.env.HOST || '127.0.0.1',
    // CDP (Chrome DevTools Protocol)
    CDP_HOST: process.env.CDP_HOST || '127.0.0.1',
    CDP_PORT: parseInt(process.env.CDP_PORT || '9000', 10),
    // Antigravity Process
    ANTIGRAVITY_PATH: process.env.ANTIGRAVITY_PATH || 'antigravity',
    ANTIGRAVITY_PORT: parseInt(process.env.ANTIGRAVITY_PORT || '9000', 10),
    // Auth
    AUTH_ENABLED: process.env.AUTH_ENABLED === 'true',
    AUTH_PASSWORD: process.env.AUTH_PASSWORD || '',
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET || 'default-secret-change-me',
    // Proxy
    PROXY_API_KEY: process.env.PROXY_API_KEY || '',
};
