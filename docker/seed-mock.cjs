#!/usr/bin/env node
/*
 * DEV-ONLY mock data seeder for backend-api-master and backend-api-inventory (same PostgreSQL, schemas partner/stone/inventory).
 *
 *   node docker/seed-mock.cjs [all|master|inventory] [--reset] [--master=1000] [--docs=100000] [--loads=100000]
 *                             [--lines=N | --lines=MIN-MAX] [--lines-<module>=N | MIN-MAX ...]
 *
 *   all (default)  master data + 8 master modules, then Load to Stock (inventory depends on the master purchases)
 *   --reset        remove the previous mock rows first (inventory before master), then seed again
 *   --reset-only   only remove the mock rows
 *   --lines        lines per document for every module (default 20-50, max 200); a range picks per document
 *   --lines-<module> per module, overrides --lines. Modules: quotation reserve memo-receive memo-return memo-out
 *                  memo-out-return purchase-order purchase load-to-stock (Load to Stock = rows, one stock each).
 *                  Memo Return / Memo Out Return / Purchase from PO or Memo Stock / Load to Stock copy lines from their
 *                  source document, so they get at most as many lines as the source has.
 *
 * Seeding is idempotent: a second run without --reset skips. SQL lives in backend-api-master|inventory/prisma/seed.
 * psql runs inside the Compose `postgres` service by default; set SEED_DATABASE_URL to use a local `psql` instead.
 * Refuses NODE_ENV=production.
 */
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const files = {
  master: resolve(root, "backend-api-master/prisma/seed/mock-master.sql"),
  masterReset: resolve(root, "backend-api-master/prisma/seed/mock-master-reset.sql"),
  inventory: resolve(root, "backend-api-inventory/prisma/seed/mock-inventory.sql"),
  inventoryReset: resolve(root, "backend-api-inventory/prisma/seed/mock-inventory-reset.sql"),
};

if (process.env.NODE_ENV === "production") {
  console.error("seed-mock: refusing to run with NODE_ENV=production");
  process.exit(1);
}

const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith("--")) ?? "all";
if (!["all", "master", "inventory"].includes(target)) {
  console.error(`seed-mock: unknown target "${target}" (all | master | inventory)`);
  process.exit(1);
}
const flag = (name) => args.includes(`--${name}`);
const num = (name, fallback) => {
  const raw = args.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.split("=")[1]);
  if (!Number.isInteger(value) || value < 1 || value > 1_000_000) {
    console.error(`seed-mock: --${name} must be an integer 1..1000000`);
    process.exit(1);
  }
  return value;
};
const MODULES = ["quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase", "load-to-stock"];
const range = (name, raw) => {
  const match = /^(\d+)(?:-(\d+))?$/.exec(raw ?? "");
  const lo = match ? Number(match[1]) : NaN;
  const hi = match ? Number(match[2] ?? match[1]) : NaN;
  if (!match || lo < 1 || hi > 200 || lo > hi) {
    console.error(`seed-mock: --${name} must be N or MIN-MAX within 1..200 (got "${raw}")`);
    process.exit(1);
  }
  return { lo, hi };
};
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
for (const arg of args.filter((a) => a.startsWith("--lines-"))) {
  const module = arg.slice("--lines-".length).split("=")[0];
  if (!MODULES.includes(module)) {
    console.error(`seed-mock: unknown module in ${arg.split("=")[0]} (${MODULES.join(", ")})`);
    process.exit(1);
  }
}
// Default 20-50 lines (Load to Stock: rows) per document, random per document.
const allLines = option("lines") === undefined ? { lo: 20, hi: 50 } : range("lines", option("lines"));
const lines = Object.fromEntries(MODULES.map((m) => [m, option(`lines-${m}`) === undefined ? allLines : range(`lines-${m}`, option(`lines-${m}`))]));
const vars = {
  n_master: num("master", 1000), n_doc: num("docs", 100_000), n_load: num("loads", 100_000),
  lines_spec: MODULES.map((m) => `${m}=${lines[m].lo}-${lines[m].hi}`).join(","),
};

function psqlCommand() {
  const varArgs = Object.entries(vars).flatMap(([key, value]) => ["-v", `${key}=${value}`]);
  const common = ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...varArgs, "-f", "-"];
  if (process.env.SEED_DATABASE_URL) return { cmd: "psql", argv: [process.env.SEED_DATABASE_URL, ...common] };
  const first = (argv) => spawnSync("docker", argv, { cwd: root, encoding: "utf8" }).stdout?.trim().split("\n")[0] || "";
  // 1. explicit container, 2. this checkout's Compose service, 3. any Compose `postgres` publishing 5432 (the .env URL).
  const container = process.env.SEED_PG_CONTAINER
    || first(["compose", "ps", "-q", "postgres"])
    || first(["ps", "-q", "--filter", "label=com.docker.compose.service=postgres", "--filter", "publish=5432"]);
  if (!container) {
    console.error("seed-mock: no running postgres container found (pnpm infra:up), or set SEED_PG_CONTAINER / SEED_DATABASE_URL");
    process.exit(1);
  }
  const user = process.env.POSTGRES_USER ?? "f1_user";
  const db = process.env.POSTGRES_DB ?? "f1_system";
  return { cmd: "docker", argv: ["exec", "-i", container, "psql", "-U", user, "-d", db, ...common] };
}

function run(label, file) {
  const { cmd, argv } = psqlCommand();
  const started = Date.now();
  console.log(`\n=== ${label}`);
  const result = spawnSync(cmd, argv, { input: readFileSync(file), stdio: ["pipe", "inherit", "inherit"], maxBuffer: 1 << 26 });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`seed-mock: ${label} failed after ${seconds}s (exit ${result.status}) - nothing from this step was committed`);
    process.exit(result.status || 1);
  }
  console.log(`--- ${label}: ${seconds}s`);
}

const doMaster = target !== "inventory";
// Rough size: average lines × documents per module (Load to Stock rows are capped by the purchase's lines).
const avg = (m) => (lines[m].lo + lines[m].hi) / 2;
const estLines = MODULES.filter((m) => m !== "load-to-stock").reduce((sum, m) => sum + avg(m) * vars.n_doc, 0) + avg("load-to-stock") * vars.n_load;
// Measured on the dev container: ~0.27 ms and ~0.65 KB per line, plus ~0.75 ms and ~1.8 KB per document header.
const estDocs = vars.n_doc * 8 + vars.n_load;
const estMinutes = Math.ceil((estLines * 0.27 + estDocs * 0.75) / 60000);
const estGb = (estLines * 0.65 + estDocs * 1.8) / 1024 / 1024;
if (flag("reset-only")) {
  console.log("seed-mock: removing only the seeded mock rows (created_by = 'seed-mock'); nothing is seeded");
} else {
  console.log(`seed-mock: lines per document ${MODULES.map((m) => `${m} ${lines[m].lo === lines[m].hi ? lines[m].lo : `${lines[m].lo}-${lines[m].hi}`}`).join(", ")}`);
  console.log(`seed-mock: about ${Math.round(estLines).toLocaleString("en-US")} document lines - roughly ${estMinutes} min and ${estGb.toFixed(1)} GB of database space`);
  if (estLines > 5_000_000) console.warn("seed-mock: large run - use --docs / --loads / --lines for a smaller set");
}
const doInventory = target !== "master";
if (flag("reset") || flag("reset-only")) {
  // Inventory first: its allocations hold master purchase lines.
  if (doInventory || doMaster) run("inventory reset", files.inventoryReset);
  if (doMaster) run("master reset", files.masterReset);
}
if (!flag("reset-only")) {
  if (doMaster) run(`master seed (master=${vars.n_master}, docs=${vars.n_doc})`, files.master);
  if (doInventory) run(`inventory seed (loads=${vars.n_load})`, files.inventory);
}
