# CLAUDE.md - AI Coding Agent Context

This file provides context for AI coding agents working on the Oppulence monorepo.

## Quick Reference Commands

```bash
# Whole local stack (DEVELOPMENT.md); humans run these as `dev <command>`
node dev/cli.mjs doctor            # Check tools, ports, secrets, git hooks
node dev/cli.mjs up                # Fill root .env, install deps, start the backend
node dev/cli.mjs status            # Containers and which endpoints answer

# Electron App (clients/apps/desktop)
cd clients/apps/desktop && pnpm install          # Install dependencies
cd clients/apps/desktop && npm run deps          # Build workspace packages (shared → core → preload)
cd clients/apps/desktop && npm run dev           # Development mode (builds deps, runs app)
cd clients/apps/desktop && npm run lint          # Lint check
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
│   │   ├── oauth-consent/      # Ory Hydra login + consent UI (TS/Express) — DEFERRED (see server/AUTH.md)
│   │   ├── cli/                # CLI tool
│   │   ├── docs/               # Documentation site
│   │   └── experimental/       # Chat widget, simulation runner, tools webhook
│   └── packages/
│       ├── ui/                 # Shared design system (@oppulence/ui)
│       ├── integration-templates/
│       ├── relationship-contract/
│       ├── oauth-resource-server/  # JWT/JWKS verification lib (TS, @oppulence/oauth-resource-server)
│       └── eslint-plugin-web/  # Lint rules for clients/apps/web
├── sdk/
│   ├── python/                 # Python SDK
│   └── typescript/             # TypeScript SDK (@oppulence/sdk), generated from server/api/openapi.json
├── infra/
│   ├── charts/                 # Helm charts and values
│   └── deploy/kind/            # Local kind cluster manifests
├── dev/                        # `dev` CLI for the local stack (see DEVELOPMENT.md)
├── docs/                       # Operational/product docs; architecture RFCs in docs/rfc
├── CLAUDE.md                   # This file
└── README.md                   # User-facing readme
```

The Go backend (`server`) replaces the closed hosted backend the
desktop used. Architecture lives in [docs/rfc/README.md](docs/rfc/README.md),
especially RFCs 010-012; deployment operations live in
[docs/BACKEND_DEPLOYMENT.md](docs/BACKEND_DEPLOYMENT.md).

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
│   │   └── bundle.mjs     # esbuild bundler
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

| Component | Entry                         | Output                         |
| --------- | ----------------------------- | ------------------------------ |
| main      | `apps/main/src/main.ts`       | `.package/dist/main.cjs`       |
| renderer  | `apps/renderer/src/main.tsx`  | `apps/renderer/dist/`          |
| preload   | `apps/preload/src/preload.ts` | `apps/preload/dist/preload.js` |

## Build System

- **Package manager:** pnpm (required for `workspace:*` protocol)
- **Main bundler:** esbuild (bundles to single CommonJS file)
- **Renderer bundler:** Vite
- **Packaging:** Electron Forge
- **TypeScript:** ES2022 target

### Why esbuild bundling?

pnpm uses symlinks for workspace packages. Electron Forge's dependency walker can't follow these symlinks. esbuild bundles everything into a single file, eliminating the need for node_modules in the packaged app.

## Key Files Reference

| Purpose                  | File                                                |
| ------------------------ | --------------------------------------------------- |
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

| Feature                                                                                                                                                                                                                 | Doc                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Live Notes — single `live:` frontmatter block (one objective + optional cron / windows / eventMatchCriteria) that turns a note into a self-updating artifact, panel UI, Copilot skill, prompts catalog                  | `clients/apps/desktop/LIVE_NOTE.md`        |
| Analytics — PostHog event catalog, person properties, use-case taxonomy, how to add a new event                                                                                                                         | `clients/apps/desktop/ANALYTICS.md`        |
| Meeting Capture — local dual-track recording (mic + system audio) through the `oppulence-audiocap` Swift sidecar, the filesystem-as-queue transcription pipeline, retention, and the manual signal-verification runbook | `clients/apps/desktop/MEETING_CAPTURE.md`  |
| rowboat-www growth standard — `npm run gen` for pages, components, Zod, hooks, mutations, stores, stories                                                                                                               | `clients/apps/web/docs/growth-standard.md` |

## Common Tasks

### Add a rowboat-www product feature

Do not hand-create the file tree. From `clients/apps/web`:

```bash
npm run gen -- feature --domain forecasts --route forecasts --name forecasts --title "Forecasts"
npm run gen -- hook --operation listConnectors
npm run gen -- mutation --operation createRevenueAction
```

Then fill the generated `/* implementation */` regions. Do not hand-create the
tree — WEB029 rejects new product units without `@oppulence-gen`. Agents must
follow `clients/apps/web/AGENTS.md` (**How to add a new product feature**) and
`clients/apps/web/docs/growth-standard.md`. Zod + `z.infer` only; no new naked
domain types; no new surfaces in `product-dashboard-client.tsx`. Remote JSON
goes through Orval + `requestJson`, not tRPC.

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

<!-- code-review-graph MCP tools -->

## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool                             | Use when                                               |
| -------------------------------- | ------------------------------------------------------ |
| `detect_changes_tool`            | Reviewing code changes — gives risk-scored analysis    |
| `get_review_context_tool`        | Need source snippets for review — token-efficient      |
| `get_impact_radius_tool`         | Understanding blast radius of a change                 |
| `get_affected_flows_tool`        | Finding which execution paths are impacted             |
| `query_graph_tool`               | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool`     | Finding functions/classes by name or keyword           |
| `get_architecture_overview_tool` | Understanding high-level codebase structure            |
| `refactor_tool`                  | Planning renames, finding dead code                    |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.

## Ponytail and code-review-graph

- Load the `ponytail` skill at the start of every coding task and follow it: make the smallest change that fully solves the task. Where it conflicts with the rest of this repository's instructions, those instructions win.
