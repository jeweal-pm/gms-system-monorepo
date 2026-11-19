#!/usr/bin/env node
// One-time, idempotent local setup for backend-api-inventory (ADR-0052, infra bundle backend-api-inventory/1).
// Dev only — never used in production. Run: pnpm docker:inventory:setup
//
// 1. Creates the three service tokens as files OUTSIDE the repository (if missing).
// 2. Adds the missing INVENTORY_* entries to .env (existing values are never changed).
// 3. Starts PostgreSQL (and auth if its views are missing) and provisions the inventory roles with the
//    reviewed SQL scripts. Existing roles are kept; their password is re-synced only when this run created it.
// Secrets are never printed. Data and volumes are never removed.
'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const COMPOSE = ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', '-f', 'docker-compose.gms.dev.yml'];
const DB_USER = 'f1_user';
const DB_NAME = 'f1_system';

const log = (msg) => console.log(`[inventory-setup] ${msg}`);
const fail = (msg) => {
  console.error(`[inventory-setup] ERROR: ${msg}`);
  process.exit(1);
};

function docker(args, opts = {}) {
  return spawnSync('docker', args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

function psql(sql) {
  const r = docker([...COMPOSE, 'exec', '-T', 'postgres', 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1', '-tAc', sql]);
  if (r.status !== 0) fail(`psql query failed: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

function psqlFile(file, env) {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const r = docker(
    [...COMPOSE, 'exec', '-T', ...envArgs, 'postgres', 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: fs.readFileSync(path.join(ROOT, file), 'utf8') },
  );
  if (r.status !== 0) fail(`${file} failed:\n${(r.stdout || '').trim()}\n${(r.stderr || '').trim()}`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitFor(label, check, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return;
    sleep(2000);
  }
  fail(`timed out waiting for ${label}`);
}

// ---- .env handling ---------------------------------------------------------------------------
function readEnv() {
  if (!fs.existsSync(ENV_FILE)) fail('.env not found. Copy .env.example to .env and fill it first.');
  const map = new Map();
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

function appendEnv(entries) {
  if (entries.length === 0) return;
  const current = fs.readFileSync(ENV_FILE, 'utf8');
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const prefix = current.length && !current.endsWith('\n') ? eol : '';
  const block = [
    '',
    '# backend-api-inventory (added by pnpm docker:inventory:setup; local dev only)',
    ...entries.map(([k, v]) => `${k}=${v}`),
    '',
  ].join(eol);
  fs.appendFileSync(ENV_FILE, prefix + block);
  log(`added to .env: ${entries.map(([k]) => k).join(', ')}`);
}

// ---- tokens ----------------------------------------------------------------------------------
function secretsDir() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), '.config');
  return path.join(base, 'f1-system-secrets');
}

function ensureToken(env, key, fileName, add) {
  let file = env.get(key);
  if (!file) {
    file = path.join(secretsDir(), fileName).split(path.sep).join('/');
    add.push([key, file]);
  }
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // 32 random bytes, base64url (43 chars): accepted by auth (exact) and master (43–512 printable).
    const mode = typeof process.getuid === 'function' && process.getuid() !== 1000 ? 0o644 : 0o600;
    fs.writeFileSync(file, crypto.randomBytes(32).toString('base64url'), { mode });
    log(`created token file for ${key} (outside the repository)`);
  }
}

// ---- database URLs ---------------------------------------------------------------------------
const ROLES = {
  INVENTORY_DATABASE_URL: { role: 'gms_inventory_app', schema: 'inventory' },
  INVENTORY_MIGRATE_DATABASE_URL: { role: 'gms_inventory_migrator', schema: 'inventory' },
  INVENTORY_AUTHZ_DATABASE_URL: { role: 'gms_inventory_authz_reader', schema: 'auth' },
};

function ensureUrls(env, add) {
  const created = new Set();
  const passwords = {};
  for (const [key, { role, schema }] of Object.entries(ROLES)) {
    let url = env.get(key);
    if (!url) {
      const pw = crypto.randomBytes(24).toString('hex');
      url = `postgresql://${role}:${pw}@postgres:5432/${DB_NAME}?schema=${schema}`;
      add.push([key, url]);
      created.add(role);
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      fail(`${key} in .env is not a valid URL`);
    }
    if (decodeURIComponent(parsed.username) !== role) fail(`${key} must use role ${role}`);
    passwords[role] = decodeURIComponent(parsed.password);
  }
  return { created, passwords };
}

// ---- main ------------------------------------------------------------------------------------
function main() {
  try {
    execFileSync('docker', ['version'], { stdio: 'ignore' });
  } catch {
    fail('Docker is not running.');
  }

  const env = readEnv();
  const add = [];
  ensureToken(env, 'INVENTORY_MASTER_SERVICE_TOKEN_SOURCE', 'inventory_master_service_token', add);
  ensureToken(env, 'INVENTORY_AUTH_SERVICE_TOKEN_SOURCE', 'inventory_auth_service_token', add);
  // Phase 2b (ADR-0052 D21): master -> inventory direction, distinct from the inventory -> master token.
  ensureToken(env, 'MASTER_INVENTORY_SERVICE_TOKEN_SOURCE', 'master_inventory_service_token', add);
  const { created, passwords } = ensureUrls(env, add);
  appendEnv(add);

  log('starting postgres…');
  if (docker([...COMPOSE, 'up', '-d', 'postgres'], { stdio: 'inherit' }).status !== 0) fail('could not start postgres');
  waitFor('postgres', () => docker([...COMPOSE, 'exec', '-T', 'postgres', 'pg_isready', '-U', DB_USER, '-d', DB_NAME]).status === 0, 90_000);

  const authViews = "SELECT to_regclass('auth.current_authorization') IS NOT NULL AND to_regclass('auth.permission_holders') IS NOT NULL";
  if (psql(authViews) !== 't') {
    log('auth views not found; starting backend-api-auth to run its migrations…');
    if (docker([...COMPOSE, 'up', '-d', 'backend-api-auth'], { stdio: 'inherit' }).status !== 0) fail('could not start backend-api-auth');
    waitFor('auth migrations', () => psql(authViews) === 't', 240_000);
  }

  const exists = (role) => psql(`SELECT count(*) FROM pg_roles WHERE rolname = '${role}'`) === '1';

  // Authz reader (backend-api-auth/prisma/roles/provision-inventory-authz-reader.sql)
  if (!exists('gms_inventory_authz_reader')) {
    psqlFile('backend-api-auth/prisma/roles/provision-inventory-authz-reader.sql', {
      INVENTORY_AUTHZ_READER_PASSWORD: passwords.gms_inventory_authz_reader,
    });
    log('created role gms_inventory_authz_reader');
  }

  // Migrator + app (backend-api-inventory/prisma/roles/provision-inventory-roles.sql)
  const migrator = exists('gms_inventory_migrator');
  const app = exists('gms_inventory_app');
  if (!migrator && !app) {
    psqlFile('backend-api-inventory/prisma/roles/provision-inventory-roles.sql', {
      INVENTORY_MIGRATOR_PASSWORD: passwords.gms_inventory_migrator,
      INVENTORY_APP_PASSWORD: passwords.gms_inventory_app,
    });
    log('created roles gms_inventory_migrator, gms_inventory_app and schema inventory');
  } else if (migrator !== app) {
    fail('only one of gms_inventory_migrator / gms_inventory_app exists; inspect the dev database manually.');
  }

  // A role that already existed but whose .env URL was created in this run: re-sync its dev password.
  for (const role of created) {
    if (!exists(role)) continue;
    const pw = passwords[role].replace(/'/g, "''");
    psql(`ALTER ROLE ${role} PASSWORD '${pw}'`);
    log(`re-synced the dev password of existing role ${role} with .env`);
  }

  log('done. Next: pnpm docker:gms:preview:install (first time / after lockfile changes), then pnpm docker:gms:preview');
}

main();
