#!/usr/bin/env node
// `dev`: one front door for local development. See DEVELOPMENT.md.
//
// Plain Node with no dependencies, so it runs before anything is installed.
// Every command wraps an entry point that already exists (the rowboat-api
// compose stack, rowboat-www `dev:stack`, the desktop `dev` script) rather than
// re-implementing it, so those stay the source of truth.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = path.join(ROOT, "docker-compose.rowboat-api.yml");
const ENV_FILE = path.join(ROOT, ".env");
const DESKTOP = path.join(ROOT, "apps/x");
const WWW = path.join(ROOT, "apps/rowboat-www");
const API_URL = "http://localhost:18080";
const WWW_URL = "http://localhost:18082";

const HELP = `Usage: dev <command>

Setup
  up                 Check tools, fill the root .env, install deps, start the backend
  doctor             Check tools, backend ports, secrets, and git hooks
  install            Add the \`dev\` shell function to your shell rc

Run
  start              Run rowboat-www and the desktop together (starts the backend if needed)
  www                Run rowboat-www with hot reload on ${WWW_URL}
  desktop            Run the Electron desktop against the local API
  api                Rebuild and restart the backend after Go changes

Inspect
  status             Show containers and which endpoints answer
  logs [service...]  Follow backend logs (api, worker, temporal, postgres, ...)
  db migrate         Rebuild the image and apply migrations
  db psql            Open psql on the local database

Stop
  down [--volumes]   Stop the backend; --volumes also deletes its data`;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function run(cmd, args, { cwd = ROOT, env = {} } = {}) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.error) fail(`${cmd}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function succeeds(cmd, args) {
  return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
}

// Compose interpolates every `${KEY:?}` for any command, but only `up` passes
// the secrets to a container. Stand in for missing ones elsewhere so `status`,
// `logs`, `down`, and `db` work before the root .env is filled in.
function compose(args) {
  const standIns =
    args[0] === "up" ? {} : Object.fromEntries(missingKeys().map((key) => [key, "unset"]));
  run("docker", ["compose", "-f", COMPOSE_FILE, ...args], { env: standIns });
}

async function answers(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false; // Refused or timed out: the service is not up yet.
  }
}

// The compose file marks every secret it cannot start without as `${KEY:?...}`.
// Reading the list from there keeps this command in step with the stack.
function requiredKeys() {
  const source = readFileSync(COMPOSE_FILE, "utf8");
  return [...new Set([...source.matchAll(/\$\{(\w+):\?/g)].map((match) => match[1]))];
}

// Compose reads the shell environment before the root .env. A `<KEY>` value is
// the legacy .env.example placeholder, which compose would accept as a real key.
function missingKeys() {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const fromFile = new Map(
    [...text.matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/gm)].map((m) => [
      m[1],
      m[2].replace(/^(['"])(.*)\1$/, "$2"),
    ]),
  );
  return requiredKeys().filter((key) => {
    const value = process.env[key] || fromFile.get(key);
    return !value || /^<.*>$/.test(value);
  });
}

async function fillEnv() {
  const missing = missingKeys();
  if (missing.length === 0) return;
  if (!process.stdin.isTTY)
    fail(`Set ${missing.join(", ")} in ${ENV_FILE} (see DEVELOPMENT.md#secrets).`);

  console.log(
    "rowboat-api needs these keys in the root .env (DEVELOPMENT.md#secrets explains each):",
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  for (const key of missing) {
    // Ctrl+C / Ctrl+D reject the question; nothing has been written yet.
    const value = (
      await rl.question(`  ${key}: `).catch(() => fail("Cancelled; the root .env is unchanged."))
    ).trim();
    if (!value) fail(`${key} is required.`);
    const line = `${key}=${value}`;
    const existing = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
    // A function replacement keeps `$` in a secret from being read as a pattern.
    if (existing.test(text)) text = text.replace(existing, () => line);
    else text += `${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  }
  rl.close();
  writeFileSync(ENV_FILE, text, { mode: 0o600 });
}

// Installs only when the lockfile is newer than the last install, so rerunning
// `dev up` after a pull is cheap. pnpm and npm each stamp a file in node_modules.
function installDeps(dir, lockfile, stamp, cmd, args) {
  const stampPath = path.join(dir, "node_modules", stamp);
  if (
    existsSync(stampPath) &&
    statSync(stampPath).mtimeMs >= statSync(path.join(dir, lockfile)).mtimeMs
  )
    return;
  console.log(`→ installing ${path.relative(ROOT, dir) || "root tooling"}`);
  run(cmd, args, { cwd: dir });
}

async function backendUp({ build }) {
  await fillEnv();
  console.log("→ starting rowboat-api (Postgres, Redis, Temporal, API, worker)");
  // `up -d` already waits for each depends_on health check, so this returns
  // once Temporal is healthy and the API container has started.
  compose(["up", "-d", ...(build ? ["--build"] : [])]);
  for (let second = 0; second < 90; second++) {
    if (await answers(`${API_URL}/healthz`)) {
      console.log(`✓ rowboat-api  ${API_URL}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`rowboat-api did not answer ${API_URL}/healthz within 90s. Check \`dev logs api\`.`);
}

function requireInstalled(...dirs) {
  for (const dir of dirs) {
    if (!existsSync(path.join(dir, "node_modules")))
      fail(`${path.relative(ROOT, dir)} is not installed. Run dev up first.`);
  }
}

function toolChecks() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  // CI installs the pnpm pinned in package.json; a different major can reject
  // the lockfiles. Missing pnpm fails, a different major only warns.
  const pnpmPin = JSON.parse(
    readFileSync(path.join(ROOT, "package.json"), "utf8"),
  ).packageManager.split("@")[1];
  const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" }).stdout?.trim() ?? "";
  return [
    { label: `node ${process.versions.node} (need 22+)`, ok: nodeMajor >= 22, hint: "brew bundle" },
    {
      label: pnpm ? `pnpm ${pnpm} (repo pins ${pnpmPin})` : "pnpm",
      ok: pnpm.split(".")[0] === pnpmPin.split(".")[0],
      hint: "brew bundle",
      optional: pnpm !== "",
    },
    { label: "docker daemon", ok: succeeds("docker", ["info"]), hint: "start Docker Desktop" },
    {
      label: "docker compose v2",
      ok: succeeds("docker", ["compose", "version"]),
      hint: "update Docker Desktop",
    },
    {
      label: "go (rowboat-api tests and lint)",
      ok: succeeds("go", ["version"]),
      hint: "brew bundle",
      optional: true,
    },
  ];
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

// Another project's container on 7233 or 5433 makes `up` fail half way, after
// the image build. Ports this stack already holds are fine.
async function portCheck() {
  const source = readFileSync(COMPOSE_FILE, "utf8");
  const project = source.match(/^name:\s*(\S+)/m)[1];
  const ports = [...source.matchAll(/"127\.0\.0\.1:(\d+):\d+"/g)].map((match) => match[1]);
  const docker = spawnSync("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"], {
    encoding: "utf8",
  });
  const containers = (docker.stdout ?? "").split("\n");
  const busy = [];
  for (const port of ports) {
    const owner = containers.find((line) => line.includes(`:${port}->`))?.split("\t")[0];
    if (owner?.startsWith(`${project}-`)) continue;
    if (owner || !(await portFree(Number(port)))) busy.push(owner ? `${port} (${owner})` : port);
  }
  return {
    label: "backend ports free",
    ok: busy.length === 0,
    hint: `in use: ${busy.join(", ")}. Stop it, or find it with lsof -nP -iTCP:<port> -sTCP:LISTEN`,
  };
}

function report(checks) {
  for (const { label, ok, hint, optional } of checks) {
    console.log(`${ok ? "✓" : optional ? "!" : "✗"} ${label}${ok ? "" : `  →  ${hint}`}`);
  }
  return checks.every((check) => check.ok || check.optional);
}

const commands = {
  help: () => console.log(HELP),

  async doctor() {
    const missing = missingKeys();
    // --git-path honours core.hooksPath and worktrees; it may be relative or absolute.
    const gitPath = spawnSync("git", ["rev-parse", "--git-path", "hooks/pre-commit"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const hooks = path.resolve(ROOT, gitPath.stdout.trim());
    const ok = report([
      ...toolChecks(),
      await portCheck(),
      {
        label: "root .env secrets",
        ok: missing.length === 0,
        hint: `missing ${missing.join(", ")}; run dev up`,
      },
      { label: "git hooks", ok: existsSync(hooks), hint: "dev up installs them", optional: true },
    ]);
    if (!ok) process.exit(1);
  },

  async up() {
    if (!report([...toolChecks(), await portCheck()])) fail("Fix the above, then rerun dev up.");
    await fillEnv();
    const wwwEnv = path.join(WWW, ".env.local");
    if (!existsSync(wwwEnv)) copyFileSync(path.join(WWW, ".env.example"), wwwEnv);
    installDeps(ROOT, "pnpm-lock.yaml", ".modules.yaml", "pnpm", [
      "install",
      "--ignore-workspace",
      "--frozen-lockfile",
    ]);
    installDeps(DESKTOP, "pnpm-lock.yaml", ".modules.yaml", "pnpm", [
      "install",
      "--frozen-lockfile",
    ]);
    installDeps(WWW, "package-lock.json", ".package-lock.json", "npm", ["ci"]);
    await backendUp({ build: true });
    console.log(
      "\nNext: dev start   (rowboat-www + desktop), or dev www / dev desktop on their own",
    );
  },

  async start() {
    requireInstalled(DESKTOP, WWW);
    if (!(await answers(`${API_URL}/healthz`))) await backendUp({ build: false });
    // concurrently is already a desktop devDependency; it prefixes each line and
    // stops both processes when either exits.
    run(
      "pnpm",
      [
        "exec",
        "concurrently",
        "--kill-others",
        "--names=www,desktop",
        "--prefix-colors=cyan,magenta",
        "npm --prefix ../rowboat-www run dev:stack",
        "npm run dev",
      ],
      { cwd: DESKTOP, env: { API_URL } },
    );
  },

  www() {
    requireInstalled(WWW);
    run("npm", ["run", "dev:stack"], { cwd: WWW });
  },

  desktop() {
    requireInstalled(DESKTOP);
    run("npm", ["run", "dev"], { cwd: DESKTOP, env: { API_URL } });
  },

  api: () => backendUp({ build: true }),

  async status() {
    compose(["ps"]);
    for (const [name, url] of [
      ["api", `${API_URL}/healthz`],
      ["www", WWW_URL],
    ]) {
      console.log(`${(await answers(url)) ? "✓" : "✗"} ${name.padEnd(4)} ${url}`);
    }
  },

  logs: (...services) => compose(["logs", "-f", ...services]),

  db(action) {
    if (action === "migrate") return compose(["run", "--build", "--rm", "migrate"]);
    if (action === "psql") return compose(["exec", "postgres", "psql", "-U", "rowboat"]);
    fail("Usage: dev db migrate | dev db psql");
  },

  down: (...flags) => compose(["down", ...(flags.includes("--volumes") ? ["--volumes"] : [])]),

  install() {
    // Resolves the checkout at call time, so one function serves every clone
    // and worktree.
    const fn = `dev() { node "$(git rev-parse --show-toplevel)/dev/cli.mjs" "$@"; }`;
    const rc = process.env.SHELL?.endsWith("bash")
      ? path.join(process.env.HOME, ".bashrc")
      : path.join(process.env.ZDOTDIR || process.env.HOME, ".zshrc");
    if (!(existsSync(rc) && readFileSync(rc, "utf8").includes(fn)))
      appendFileSync(rc, `\n# oppulence dev CLI\n${fn}\n`);
    console.log(`✓ dev is in ${rc}. Open a new terminal, then run: dev up`);
  },
};

const [name = "help", ...rest] = process.argv.slice(2);
if (!Object.hasOwn(commands, name)) {
  console.error(HELP);
  process.exit(1);
}
await commands[name](...rest);
