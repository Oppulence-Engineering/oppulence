# AGENTS.md - AI Coding Agent Context

This file provides context for AI coding agents working on the Rowboat monorepo.

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

| Feature                                                                                                                                                                                                | Doc                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Live Notes — single `live:` frontmatter block (one objective + optional cron / windows / eventMatchCriteria) that turns a note into a self-updating artifact, panel UI, Copilot skill, prompts catalog | `clients/apps/desktop/LIVE_NOTE.md`                      |
| Analytics — PostHog event catalog, person properties, use-case taxonomy, how to add a new event                                                                                                        | `clients/apps/desktop/ANALYTICS.md`                      |
| rowboat-www growth standard — `npm run gen` for pages, components, Zod, hooks, mutations, stores, stories                                                                                              | `clients/apps/web/docs/growth-standard.md` |

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

## TypeScript Standards

Baseline: the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html).
Repo rules override it: this section, app `AGENTS.md` files, the rowboat-www
[type law](clients/apps/web/docs/growth-standard.md#33-the-type-law), and the
[Electron Architecture Gauntlet](clients/apps/desktop/docs/ARCHITECTURE_GAUNTLET.md). Lint does not
enforce every rule below; review must.

### Data contracts (Zod)

- MUST make a Zod schema the source of truth for runtime data and derive its type: `type Foo = z.infer<typeof FooSchema>`.
- NEVER hand-write a `type` or `interface` that duplicates a schema.
- MUST validate at the entry boundary: route/form input, Go API responses (Orval + `requestJson`), IPC payloads (shared Zod registry), env vars, `JSON.parse`, storage and durable state (`readValidatedJson`), third-party responses, structured LLM output.
- MUST validate once at that boundary and pass the parsed type downstream.
- NEVER re-parse already-validated data unless it crosses a new trust boundary.
- MUST use `safeParse` for input that can legitimately be invalid, and `parse` only where failure is a bug.
- MUST encode real constraints (`.uuid()`, `.email()`, `.int()`, `.positive()`, `z.enum`, `z.discriminatedUnion`), not bare `z.string()`/`z.number()`.
- MUST compose with `.extend()`, `.pick()`, `.omit()`, `.partial()`; NEVER copy fields between schemas.
- MUST store money as integer minor units; NEVER as floats. ✅ `amountMinor: z.number().int()` ❌ `amount: z.number()`

### Types and assertions

`satisfies` and `as const` are compile-time checks. `any`, `as T`, and `!` are unchecked runtime claims.

- NEVER introduce `any` or `as any`; take `unknown` and narrow.
- NEVER double-assert (`as unknown as T`).
- NEVER silence errors with `@ts-ignore` or `@ts-nocheck`.
- NEVER use `as T` where narrowing, a schema, or control flow fixes the error. ❌ `JSON.parse(raw) as Settings` ✅ `SettingsSchema.parse(JSON.parse(raw))`
- NEVER use non-null `!` unless the invariant is provable and stated in a comment beside it.
- MUST use `satisfies` to check a value against a type without widening it.
- MUST use `as const` where literal inference or readonly literals are required.
- NEVER use `export let`.

### State and exhaustiveness

- MUST model mutually exclusive states as a discriminated union. ✅ `{ status: "ok"; data: T } | { status: "error"; error: E }` ❌ `{ data?: T; error?: E }`
- MUST handle every variant; end each `switch` over a union with a `never` check: `default: { const unhandled: never = state; throw new Error(String(unhandled)); }`
- NEVER add a `default` branch that silently absorbs unhandled variants.

### Immutability and contracts

- MUST default to `readonly` properties and `readonly T[]` where mutation is unnecessary.
- MUST declare return types on exported services, repositories, and money-handling functions.
- MUST rely on inference for locals and internal helpers; NEVER add annotations inference already gets right.
- MUST reserve `interface` for behavioral contracts (ports, repositories, providers); NEVER for data shapes.

### Errors

- MUST throw `Error` subclasses for domain failures.
- MUST keep the original error as `cause` when translating it into another error.
- MUST treat caught values as `unknown` and narrow before reading properties.
- NEVER swallow failures (`catch { return null }`); handle, translate, or rethrow.

### Naming

- MUST use `UpperCamelCase` for types and interfaces, `lowerCamelCase` for values, functions, and parameters.
- MUST use `CONSTANT_CASE` for module-level constant values; Zod schemas stay `FooSchema`.
- MUST treat abbreviations as words: `customerId`, not `customerID`.
- NEVER prefix interfaces with `I`.

### When a handwritten type is fine

Runtime data shape → Zod schema + `z.infer`. Compile-time behavior or abstraction → handwritten type.

- Function and callback types, generic parameters and helpers, mapped and conditional types.
- Behavioral interfaces for ports, providers, repositories, and other service contracts.
- NEVER hand-write a data shape because it is "internal"; if it is parsed, persisted, or crosses a process or network boundary, it gets a schema.
- NEVER export an object `type`/`interface` beside a rowboat-www lit; the type law is stricter there (WEB023).

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
