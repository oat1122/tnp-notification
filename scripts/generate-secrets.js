#!/usr/bin/env node
/**
 * Idempotent secret bootstrap for the tnp-notification ↔ tnp-backend
 * trust boundary. Run from the tnp-notification project root:
 *
 *   npm run generate-secrets
 *
 * Behavior:
 *   - Auto-writes SOCKET_TOKEN_SECRET and API_SECRET_KEY to ./.env.
 *     If .env doesn't exist, copies from .env.example first.
 *   - If a key is already set (non-empty, uncommented), it is KEPT —
 *     re-running the script is safe and won't break Laravel sync.
 *   - Prints the matching Laravel-side env vars (NOTIFICATION_TOKEN_SECRET,
 *     NOTIFICATION_API_KEY) for the operator to paste into tnp-backend/.env.
 */

const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT, ".env.example");

// notify-side key → Laravel-side key (different names, same value)
const KEY_MAP = [
  { notify: "SOCKET_TOKEN_SECRET", laravel: "NOTIFICATION_TOKEN_SECRET" },
  { notify: "API_SECRET_KEY", laravel: "NOTIFICATION_API_KEY" },
];

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) return;
  if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
    console.log(`📄 Created .env from .env.example`);
  } else {
    fs.writeFileSync(ENV_PATH, "");
    console.log(`📄 Created empty .env`);
  }
}

/**
 * Returns { content, value, status } where status is:
 *   "kept"      — key already had a non-empty value
 *   "generated" — generated and inserted/updated a new value
 */
function ensureKey(content, key) {
  // Match uncommented KEY=value with a non-empty value
  const setRe = new RegExp(`^${key}=(.+)$`, "m");
  const setMatch = content.match(setRe);
  if (setMatch && setMatch[1].trim()) {
    return { content, value: setMatch[1].trim(), status: "kept" };
  }

  const fresh = randomBytes(32).toString("hex");

  // Match any existing line for this key (commented, blank, etc.) and replace
  const anyLineRe = new RegExp(`^[#\\s]*${key}=.*$`, "m");
  if (anyLineRe.test(content)) {
    return {
      content: content.replace(anyLineRe, `${key}=${fresh}`),
      value: fresh,
      status: "generated",
    };
  }

  // No existing line — append
  const trailing = content.endsWith("\n") ? "" : "\n";
  return {
    content: `${content}${trailing}\n${key}=${fresh}\n`,
    value: fresh,
    status: "generated",
  };
}

ensureEnvFile();
let content = fs.readFileSync(ENV_PATH, "utf8");

const results = [];
for (const { notify, laravel } of KEY_MAP) {
  const r = ensureKey(content, notify);
  content = r.content;
  results.push({ notify, laravel, value: r.value, status: r.status });
}

fs.writeFileSync(ENV_PATH, content);

const line = "=".repeat(72);
const anyGenerated = results.some((r) => r.status === "generated");

console.log(`
${line}
🔐  Secret bootstrap — tnp-notification/.env
${line}
`);

for (const r of results) {
  const icon = r.status === "generated" ? "✨ wrote " : "✓  kept  ";
  console.log(`    ${icon} ${r.notify}=${r.value}`);
}

console.log(`
${line}
📝  Paste into tnp-backend/.env  (Laravel side — same values, different names)
${line}
`);

for (const r of results) {
  console.log(`    ${r.laravel}=${r.value}`);
}

console.log(`    NOTIFICATION_TOKEN_TTL=3600
${line}
`);

if (anyGenerated) {
  console.log(`✅  Wrote new secret(s) to .env.`);
  console.log(`    Restart 'npm run dev' if it doesn't auto-reload.\n`);
} else {
  console.log(`✓   All keys already set — nothing changed in .env.`);
  console.log(`    Re-run is safe; existing values are kept.\n`);
}

console.log(`⚠️   After updating tnp-backend/.env, run:`);
console.log(`        php artisan config:clear\n`);
