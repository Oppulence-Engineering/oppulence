# AGENTS.md - AI Coding Agent Context

This file provides context for AI coding agents working on the Rowboat monorepo.

## Quick Reference Commands

```bash
# Electron App (clients/apps/desktop)
cd clients/apps/desktop && pnpm install          # Install dependencies
cd clients/apps/desktop && npm run deps          # Build workspace packages (shared → core → preload)
cd clients/apps/desktop && npm run dev           # Development mode (builds deps, runs app)
cd clients/apps/desktop && npm run lint          # Lint check
cd clients/apps/desktop && pnpm verify           # Complete local architecture gauntlet
cd clients/apps/desktop && pnpm verify:ci        # Same gate; requires external scanners installed
cd clients/apps/desktop/apps/main && npm run package   # Production build (.app)
cd clients/apps/desktop/apps/main && npm run make      # Create DMG distributable
```

## Monorepo Structure

```
oppulence/
├── server/                     # Go backend: API, worker, scheduler, migrations (billing, LLM gateway, OAuth broker)
│   └── oauth-resource-server/  # JWT/JWKS verification lib (Go, its own module)
├── clients/
│   ├── apps/
│   │   ├── desktop/            # Electron desktop app (nested pnpm workspace; focus of this doc)
│   │   ├── web/                # Marketing site and desktop companion web app (Next.js, npm)
│   │   ├── dashboard/          # Legacy Next.js dashboard
│   │   ├── oauth-consent/      # Ory Hydra login + consent UI (TS/Express) — DEFERRED (see server/AUTH.md)
│   │   ├── cli/                # CLI tool
│   │   ├── docs/               # Documentation site
│   │   └── experimental/       # Chat widget, simulation runner, tools webhook
│   └── packages/
│       ├── ui/                 # Shared design system (@oppulence/ui)
│       ├── api-client/         # TypeScript client generated from server/api/openapi.json
│       ├── integration-templates/
│       ├── relationship-contract/
│       ├── oauth-resource-server/  # JWT/JWKS verification lib (TS, @oppulence/oauth-resource-server)
│       └── eslint-plugin-web/  # Lint rules for clients/apps/web
├── sdk/python/                 # Python SDK
├── infra/
│   ├── charts/                 # Helm charts and values
│   └── deploy/kind/            # Local kind cluster manifests
├── dev/                        # `dev` CLI for the local stack (see DEVELOPMENT.md)
├── docs/                       # Operational/product docs; architecture RFCs in docs/rfc
├── AGENTS.md                   # This file
└── README.md                   # User-facing readme
```

The Go backend (`server`) replaces the closed hosted backend the
desktop used. Architecture lives in [docs/rfc/README.md](../../../docs/rfc/README.md),
especially RFCs 010-012; deployment operations live in
[docs/BACKEND_DEPLOYMENT.md](../../../docs/BACKEND_DEPLOYMENT.md).

## Electron App Architecture (`clients/apps/desktop`)

The Electron app is a **nested pnpm workspace** with its own package management.

```
clients/apps/desktop/
├── package.json           # Workspace root, dev scripts
├── pnpm-workspace.yaml    # Defines workspace packages
├── pnpm-lock.yaml         # Lockfile
├── apps/
│   ├── main/              # Electron main process
│   │   ├── src/           # Main process source
│   │   ├── forge.config.cjs   # Electron Forge config
│   │   └── bundle.mjs    # esbuild bundler
│   ├── renderer/          # React UI (Vite)
│   │   ├── src/           # React components
│   │   └── vite.config.ts
│   └── preload/           # Electron preload scripts
│       └── src/
└── packages/
    ├── shared/            # @x/shared - Types, utilities, validators
    └── core/              # @x/core - Business logic, AI, OAuth, MCP
```

### Build Order (Dependencies)

```
shared (no deps)
   ↓
core (depends on shared)
   ↓
preload (depends on shared)
   ↓
renderer (depends on shared)
main (depends on shared, core)
```

**The `npm run deps` command builds:** shared → core → preload

### Key Entry Points

| Component | Entry                                | Output                         |
| --------- | ------------------------------------ | ------------------------------ |
| main      | `clients/apps/desktop/apps/main/src/main.ts`       | `.package/dist/main.cjs`       |
| renderer  | `clients/apps/desktop/apps/renderer/src/main.tsx`  | `apps/renderer/dist/`          |
| preload   | `clients/apps/desktop/apps/preload/src/preload.ts` | `apps/preload/dist/preload.js` |

## Build System

- **Package manager:** pnpm (required for `workspace:*` protocol)
- **Main bundler:** esbuild (bundles to single CommonJS file)
- **Renderer bundler:** Vite
- **Packaging:** Electron Forge
- **TypeScript:** ES2022 target

### Why esbuild bundling?

pnpm uses symlinks for workspace packages. Electron Forge's dependency walker can't follow these symlinks. esbuild bundles everything into a single file, eliminating the need for node_modules in the packaged app.

## Key Files Reference

| Purpose                  | File                                  |
| ------------------------ | ------------------------------------- |
| Electron main entry      | `clients/apps/desktop/apps/main/src/main.ts`        |
| React app entry          | `clients/apps/desktop/apps/renderer/src/main.tsx`   |
| Forge config (packaging) | `clients/apps/desktop/apps/main/forge.config.cjs`   |
| Main process bundler     | `clients/apps/desktop/apps/main/bundle.mjs`         |
| Vite config              | `clients/apps/desktop/apps/renderer/vite.config.ts` |
| Shared types             | `clients/apps/desktop/packages/shared/src/`         |
| Core business logic      | `clients/apps/desktop/packages/core/src/`           |
| Workspace config         | `clients/apps/desktop/pnpm-workspace.yaml`          |
| Root scripts             | `clients/apps/desktop/package.json`                 |

## Feature Deep-Dives

Long-form docs for specific features. Read the relevant file before making changes in that area — it has the full product flow, technical flows, and (where applicable) a catalog of the LLM prompts involved with exact file:line pointers.

| Feature                                                                                                                                                                                                | Doc                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Live Notes — single `live:` frontmatter block (one objective + optional cron / windows / eventMatchCriteria) that turns a note into a self-updating artifact, panel UI, Copilot skill, prompts catalog | `clients/apps/desktop/docs/LIVE_NOTE.md`             |
| Analytics — PostHog event catalog, person properties, use-case taxonomy, how to add a new event                                                                                                        | `clients/apps/desktop/docs/ANALYTICS.md`             |
| Meeting capture — local dual-track recording, transcription, recovery, and packaging                                                                                                                   | `clients/apps/desktop/docs/MEETING_CAPTURE.md`       |
| Architecture enforcement — executable rules, ratchets, package boundaries, and security checks                                                                                                         | `clients/apps/desktop/docs/ARCHITECTURE_GAUNTLET.md` |

## Common Tasks

### LLM configuration (single provider)

- Config file: `~/.rowboat/config/models.json`
- Schema: `{ provider: { flavor, apiKey?, baseURL?, headers? }, model: string }`
- Models catalog cache: `~/.rowboat/config/models.dev.json` (OpenAI/Anthropic/Google only)

### Add a new shared type

1. Edit `clients/apps/desktop/packages/shared/src/`
2. Run `cd clients/apps/desktop && npm run deps` to rebuild

### Modify main process

1. Edit `clients/apps/desktop/apps/main/src/`
2. Restart dev server (main doesn't hot-reload)

### Modify renderer (React UI)

1. Edit `clients/apps/desktop/apps/renderer/src/`
2. Changes hot-reload automatically in dev mode

### Add a new dependency to main

1. `cd clients/apps/desktop/apps/main && pnpm add <package>`
2. Import in source - esbuild will bundle it

### Verify compilation

```bash
cd clients/apps/desktop && npm run deps && npm run lint
```

## Electron Architecture Gauntlet

All changes must preserve this dependency and trust path:

```text
renderer → typed preload bridge → validated IPC → main orchestration → core domains → adapters/filesystem
```

- Import `@x/core` and `@x/shared` only through their package root or declared subpaths. Never import `dist/` or `src/` internals.
- Keep Electron out of `packages/core`; construct platform adapters in `apps/main`.
- Add IPC calls and main-to-renderer events to the shared Zod registry. Use the centralized IPC registration and renderer-event adapters so both payload directions are runtime validated.
- Use `emitRendererEvent` / `onRendererEvent` for application-level renderer events; do not add raw DOM event strings.
- Use `readValidatedJson` and atomic/repository writes for durable state. New direct persistence writes, service-locator calls, and unowned pollers are rejected against the architecture baseline.
- Use `openTrustedExternal` for external navigation and declare hardened `webPreferences` on every privileged Electron view.
- Register new long-running services with `LifecycleRegistry` and provide deterministic cancellation/teardown.
- Run `pnpm verify` before handing off changes. Architecture baselines may only be updated for an explicitly reviewed legacy exception; routine changes must reduce or preserve them.

## Tech Stack

| Layer   | Technology                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| Desktop | Electron 39.x                                                                                              |
| UI      | React 19, Vite 7                                                                                           |
| Styling | TailwindCSS, Radix UI                                                                                      |
| State   | React hooks                                                                                                |
| AI      | Vercel AI SDK, OpenAI/Anthropic/Google/OpenRouter providers, Vercel AI Gateway, Ollama, models.dev catalog |
| IPC     | Electron contextBridge                                                                                     |
| Build   | TypeScript 5.9, esbuild, Electron Forge                                                                    |

## Environment Variables (for packaging)

For production builds with code signing:

- `APPLE_ID` - Apple Developer ID
- `APPLE_PASSWORD` - App-specific password
- `APPLE_TEAM_ID` - Team ID

Not required for local development.
