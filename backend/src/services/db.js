"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbService = exports.db = void 0;
var better_sqlite3_1 = require("better-sqlite3");
var path_1 = require("path");
var fs_1 = require("fs");
var url_1 = require("url");
var env_js_1 = require("../config/env.js");
var __dirname = path_1.default.dirname((0, url_1.fileURLToPath)(import.meta.url));
var dbPath = path_1.default.resolve(__dirname, '../../../data/config.db');
// Ensure database directory exists
var dbDir = path_1.default.dirname(dbPath);
if (!fs_1.default.existsSync(dbDir)) {
    fs_1.default.mkdirSync(dbDir, { recursive: true });
}
exports.db = new better_sqlite3_1.default(dbPath);
// Core key-value store
exports.db.exec("\n  CREATE TABLE IF NOT EXISTS kv (\n    key   TEXT PRIMARY KEY,\n    value TEXT NOT NULL\n  );\n");
// Settings table — user-configurable, overrides .env defaults
exports.db.exec("\n  CREATE TABLE IF NOT EXISTS settings (\n    key   TEXT PRIMARY KEY,\n    value TEXT NOT NULL\n  );\n");
// Accounts table
exports.db.exec("\n  CREATE TABLE IF NOT EXISTS accounts (\n    id TEXT PRIMARY KEY,\n    email TEXT NOT NULL,\n    refresh_token TEXT NOT NULL,\n    is_active INTEGER DEFAULT 0,\n    is_disabled INTEGER DEFAULT 0,\n    last_used INTEGER,\n    custom_label TEXT,\n    quota_json TEXT\n  );\n");
// Migration from JSON
var accountsJsonPath = path_1.default.resolve(__dirname, '../../../data/accounts.json');
if (fs_1.default.existsSync(accountsJsonPath)) {
    try {
        var rawData = fs_1.default.readFileSync(accountsJsonPath, 'utf-8');
        var accounts = JSON.parse(rawData);
        // Check if db is empty before migrating
        var countRow = exports.db.prepare('SELECT COUNT(*) as count FROM accounts').get();
        if (countRow.count === 0 && Array.isArray(accounts)) {
            console.log('Migrating accounts from JSON to SQLite...');
            var insertAccount_1 = exports.db.prepare("\n        INSERT INTO accounts (id, email, refresh_token, is_active, is_disabled, last_used, custom_label, quota_json)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?)\n      ");
            var tx = exports.db.transaction(function (accs) {
                for (var _i = 0, accs_1 = accs; _i < accs_1.length; _i++) {
                    var acc = accs_1[_i];
                    insertAccount_1.run(acc.id, acc.email, acc.refreshToken, acc.isActive ? 1 : 0, acc.isDisabled ? 1 : 0, acc.last_used || null, acc.custom_label || null, acc.quota ? JSON.stringify(acc.quota) : null);
                }
            });
            insertMany(accounts);
            console.log('Migration successful. Renaming accounts.json to accounts.json.bak');
            fs_1.default.renameSync(accountsJsonPath, accountsJsonPath + '.bak');
        }
    }
    catch (err) {
        console.error('Failed to migrate accounts from JSON:', err);
    }
}
// Seed default settings from .env if not already set
var defaults = {
    antigravity_path: env_js_1.config.ANTIGRAVITY_PATH,
    antigravity_port: String(env_js_1.config.ANTIGRAVITY_PORT),
    auth_password: env_js_1.config.AUTH_PASSWORD,
};
var insertSetting = exports.db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
for (var _i = 0, _a = Object.entries(defaults); _i < _a.length; _i++) {
    var _b = _a[_i], key = _b[0], value = _b[1];
    insertSetting.run(key, value);
}
exports.dbService = {
    // KV store
    get: function (key) {
        var row = exports.db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
        return row === null || row === void 0 ? void 0 : row.value;
    },
    set: function (key, value) {
        exports.db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value);
    },
    // Settings
    getSetting: function (key) {
        var row = exports.db
            .prepare('SELECT value FROM settings WHERE key = ?')
            .get(key);
        return row === null || row === void 0 ? void 0 : row.value;
    },
    getAllSettings: function () {
        var rows = exports.db
            .prepare('SELECT key, value FROM settings')
            .all();
        return Object.fromEntries(rows.map(function (r) { return [r.key, r.value]; }));
    },
    setSetting: function (key, value) {
        exports.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    },
    // Accounts
    getAllAccounts: function () {
        var rows = exports.db.prepare('SELECT * FROM accounts').all();
        return rows.map(function (r) { return ({
            id: r.id,
            email: r.email,
            refreshToken: r.refresh_token,
            isActive: r.is_active === 1,
            isDisabled: r.is_disabled === 1,
            last_used: r.last_used,
            custom_label: r.custom_label,
            quota: r.quota_json ? JSON.parse(r.quota_json) : undefined
        }); });
    },
    getAccount: function (id) {
        var r = exports.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
        if (!r)
            return null;
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
    upsertAccount: function (acc) {
        exports.db.prepare("\n      INSERT INTO accounts (id, email, refresh_token, is_active, is_disabled, last_used, custom_label, quota_json)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?)\n      ON CONFLICT(id) DO UPDATE SET\n        email = excluded.email,\n        refresh_token = excluded.refresh_token,\n        is_active = excluded.is_active,\n        is_disabled = excluded.is_disabled,\n        last_used = excluded.last_used,\n        custom_label = excluded.custom_label,\n        quota_json = excluded.quota_json\n    ").run(acc.id, acc.email, acc.refreshToken, acc.isActive ? 1 : 0, acc.isDisabled ? 1 : 0, acc.last_used || null, acc.custom_label || null, acc.quota ? JSON.stringify(acc.quota) : null);
    },
    deleteAccount: function (id) {
        exports.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    },
    updateAccountStatus: function (id, updates) {
        var _a;
        var sets = [];
        var params = [];
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
        if (sets.length === 0)
            return;
        params.push(id);
        (_a = exports.db.prepare("UPDATE accounts SET ".concat(sets.join(', '), " WHERE id = ?"))).run.apply(_a, params);
    },
    clearActiveStatus: function () {
        exports.db.prepare('UPDATE accounts SET is_active = 0').run();
    }
};
