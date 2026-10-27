# AGENTS.md - AI Coding Agent Contract

This is the canonical instruction file for every AI coding agent working in this monorepo.
Tool-specific files such as `CLAUDE.md` import or point to this file.
**MUST**, **MUST NOT**, and **NEVER** are requirements. **SHOULD** is a default you may depart
from when your handoff states why.

## Instruction Hierarchy

1. This file applies to every change in the repository.
2. Before editing files under a directory that has its own `AGENTS.md`, you MUST read it. Nested
   files add stricter local rules and win for their directory where the two differ.
3. Before changing a feature that has a [deep-dive doc](#feature-deep-dives), you MUST read it.

| Area                                     | Read before editing                                                                                                                                                                | Final gate (run after the last edit)                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `clients/apps/desktop`                   | [clients/apps/desktop/AGENTS.md](clients/apps/desktop/AGENTS.md), [Architecture Gauntlet](clients/apps/desktop/docs/ARCHITECTURE_GAUNTLET.md)                                      | `cd clients/apps/desktop && pnpm verify`                                                |
| `server`                                 | [server/AGENTS.md](server/AGENTS.md), [engineering docs](server/docs/engineering/README.md)                                                                                        | `cd server && make verify`, plus `make verify-ci` where that file requires it           |
| `clients/apps/web`                       | [clients/apps/web/AGENTS.md](clients/apps/web/AGENTS.md), [growth standard](clients/apps/web/docs/growth-standard.md), [component standard](clients/apps/web/components/README.md) | `cd clients/apps/web && npm run verify` (`verify:fast` while iterating)                 |
| `clients/packages/ui`                    | [clients/packages/ui/DESIGN_SYSTEM.md](clients/packages/ui/DESIGN_SYSTEM.md)                                                                                                       | The final gates of both consumers: `clients/apps/desktop` and `clients/apps/web`        |
| `clients/packages/relationship-contract` | [RFC 038](docs/rfc/038-trustworthy-first-account-beta.md) (the client capabilities both apps must expose)                                                                          | `npm test` in the package, then the `clients/apps/desktop` and `clients/apps/web` gates |
| Root docs and configuration              | This file, [CONTRIBUTING.md](CONTRIBUTING.md)                                                                                                                                      | `pnpm exec prettier --check <changed files>` from the root                              |

Install the git hooks once with `pnpm install --ignore-workspace` at the root. Lefthook formats
and lints staged files on commit and runs the app gates on push. Hooks are fast feedback, not a
substitute for the final gate; CI is authoritative.

## Reuse Before Writing New Code

A second implementation of an existing component, helper, schema, query, service, or business
rule is a defect here. Copies drift, and tenancy, money, and contract fixes then land in only one
of them. Every implementation change follows this section.

### Required workflow

Before you write new code, you MUST:

1. **Read the instructions.** Read this file, the nested `AGENTS.md` for every directory you will
   touch, and the deep-dive doc for the feature.
2. **Find the owner.** Name the owning app, package, and layer before you decide where code goes.
   Start from [Where to look](#where-to-look) and [Ownership and Boundaries](#ownership-and-boundaries).
3. **Search for the behavior, not only a name.** Look for components, hooks, schemas and types,
   queries and fetchers, services, repositories, jobs and workflows, adapters, tests, and
   fixtures that already do the work or most of it. Search by domain term, API operation, Ent
   entity, IPC channel, and error code, not only the name you would give new code.
4. **Read the candidates.** Open each candidate's source, its callers, its contract (Zod schema,
   OpenAPI operation, IPC registry entry, Ent schema), and its tests. Use the code-review-graph
   MCP tools when they are available (`semantic_search_nodes_tool`, `query_graph_tool` with
   `callers_of` or `tests_for`, `get_impact_radius_tool`). Use repository search (`rg`) when the
   graph is unavailable or cannot answer the question. An empty graph result does not prove
   absence, and the source wins when the two disagree.
5. **Decide with the reuse ladder** before you create a file, function, schema, or dependency.

Scale the search to the change. Editing an existing function needs its owner, callers, and tests.
Adding a new component, schema, query, service, job, or dependency needs the full search.

### Reuse ladder

Take the first option that is correct:

1. **Use** the existing implementation when its behavior and contract fit.
2. **Extend** it when the new behavior belongs to that owner and every existing caller and
   invariant still holds. Read the callers before you change it.
3. **Extract** shared behavior into its correct owner when two or more real, compatible
   consumers exist now, in the codebase or in this change.
4. **Write new code** when the candidate is unsuitable: reuse would break a dependency rule,
   couple unrelated workflows, change behavior existing callers rely on, or compromise
   correctness.

### Similar is not the same

Reuse only when the candidate matches on behavior, authorization, tenant scope, error handling,
performance, and side effects. These pairs look interchangeable and are not:

- A query under `auth.WithInternal` and a tenant-scoped query.
- A money display formatter and money arithmetic.
- A desktop local-workspace rule and a cloud organization-tenant rule for the same concept.
- A helper that writes, retries, or calls a provider and one that is pure.

### Reuse rules

- NEVER write a parallel implementation because the existing one is hard to find, awkwardly named,
  or needs a reasonable extension.
- NEVER copy a function, schema, component, query, or fixture and edit the copy. Extend or extract
  the original.
- NEVER create an abstraction, a `utils`/`helpers`/`common` module, or a shared package for a
  single consumer just to make code look reusable.
- NEVER move code into a shared package when the move breaks an ownership boundary or couples apps
  that do not share the behavior.
- NEVER add a dependency for a capability that an existing dependency or module already provides.
  Check the owning `package.json` or `go.mod` and the shared packages first. Go additions also
  follow [code-review.md](server/docs/engineering/code-review.md).
- When you write new code even though a candidate exists, MUST name the candidate and the reason
  in one line of your handoff. Routine exceptions need no separate approval. Add a code comment
  only when a future reader would otherwise merge the two.

### Where to look

This table is a starting point, not a boundary. Search other areas when the task calls for them.

| You need                                                   | Search first                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design tokens, icons, domain-neutral UI primitives         | `clients/packages/ui` (`@oppulence/ui`) and its [design system](clients/packages/ui/DESIGN_SYSTEM.md). For web app product chrome, `@sim/emcn` first. |
| Relationship capabilities that desktop and web both expose | `clients/packages/relationship-contract` (`@oppulence/relationship-contract`)                                                                         |
| Desktop domain logic, AI, OAuth, MCP                       | `clients/apps/desktop/packages/core/src` (`@x/core`)                                                                                                  |
| Desktop IPC channels, payload schemas, renderer events     | `clients/apps/desktop/packages/shared/src` (`@x/shared`), starting with the `ipc.ts` registry                                                         |
| Desktop durable state, service lifecycle, external URLs    | The Gauntlet [process-boundary helpers](clients/apps/desktop/docs/ARCHITECTURE_GAUNTLET.md#process-boundary-helpers)                                  |
| Go API behavior, persistence, background work              | `server/internal/<feature>`, Ent schemas in `server/ent/schema`, worker registration in `server/cmd/worker`                                           |
| Calls to vendors and providers                             | `server/internal/outbound` and the existing client (`internal/connectors`, `googleapi`, `hubspotapi`, `slackclient`, `composioapi`, `faculties`)      |
| Web reads and writes against the Go API                    | Orval clients and Zod in `clients/apps/web/lib/api/generated`, `requestJson` in `lib/api/request-json.ts`, query factories in `hooks/queries`         |
| Web session and WorkOS sign-in                             | `clients/apps/web/lib/auth`                                                                                                                           |
| API identity, authorization, and tenancy                   | `server/internal/auth`, `server/internal/workosauth`, and [security.md](server/docs/engineering/security.md)                                          |
| A typed client for the public API                          | `sdk/typescript` (generated)                                                                                                                          |
| Integration onboarding templates                           | `clients/packages/integration-templates`                                                                                                              |
| OAuth resource-server JWT verification                     | `server/oauth-resource-server`, `clients/packages/oauth-resource-server`                                                                              |
| Earlier design decisions                                   | [docs/rfc/README.md](docs/rfc/README.md)                                                                                                              |

## Ownership and Boundaries

- **Shared UI.** `clients/packages/ui` holds only domain-neutral tokens, icons, and primitives. It MUST
  NOT import application, data-access, authentication, or storage code. Promote UI there only
  when it is domain-neutral and reused across applications; add primitives with `npm run ui:add`
  from `clients/apps/web`. UI for one domain stays a product-feature or route-private component
  ([component standard](clients/apps/web/components/README.md)).
- **Product logic stays in its app.** Desktop behavior lives in `@x/core`, cloud behavior in
  `server/internal/<feature>`, and web presentation and BFF code in `clients/apps/web`.
  Share a contract between them (OpenAPI, Zod, `clients/packages/relationship-contract`) before you share
  an implementation. Do not assume the desktop and cloud versions of a concept follow the same
  rules.
- **Portfolio products.** Conduitt, Cadence, and Eigen are separate products with their own
  contracts ([RFC 008](docs/rfc/008-conduit-eigen-faculties.md),
  [RFC 013](docs/rfc/013-oppulence-product-connector-fabric.md),
  [RFC 026](docs/rfc/026-finance-command-center.md)). Reach them only through the existing
  server adapters: `server/internal/faculties`, the product connectors, and the
  agent tool registry in `internal/agentregistry`. NEVER copy their business logic into this
  repository or read their data stores directly.
- **Thin transport.** Go handlers translate transport and services own invariants. BFF route
  handlers authenticate, validate, and proxy. Electron IPC handlers validate and delegate to
  `@x/core`. Presentation components keep network access, persistence, authentication, and domain
  orchestration out and take data and callbacks through props. Put reusable logic and data access
  in those owners, never in a handler, route, or component.
- **Dependency direction.** Desktop: renderer → typed preload → validated IPC → main → `@x/core` →
  adapters. Web: browser → BFF → Go API; browser code never calls Go or receives WorkOS tokens.
  Go: `cmd` may import `internal`, never the reverse, and one feature imports another only for a
  narrow capability that the other owns.
- **Contracts.** Change a generated contract at its source and regenerate it. Ent schema and
  OpenAPI changes go through `make generate` in `server`, which refreshes the SDK and the
  web app Orval clients. NEVER hand-edit `clients/apps/web/lib/api/generated` or
  `sdk/typescript/src/generated`. Desktop IPC payloads and renderer events go
  through the `@x/shared` Zod registry and `emitRendererEvent`. Cloud events go through
  `server/internal/cloudevents`.
- **Background work.** Durable cloud work uses Temporal as described in
  [temporal.md](server/docs/engineering/temporal.md). Desktop services register with
  `LifecycleRegistry` and keep a concurrency guard and bounded backoff (Gauntlet X014, X017,
  X018). NEVER add an ad hoc poller, queue, or retry loop beside them.
- **Errors.** Go returns RFC 9457 problem codes through `server/internal/httpx`. The web
  app parses error envelopes in `requestJson`. The desktop renderer maps failures with
  `userFacingError`. Reuse existing error codes and sentinel errors before you add new ones.
- **Tests and fixtures.** Extend the existing test file, fake, and fixture for the same behavior:
  Ent-backed tests and `cmd/devstack` mocks in the server, Orval-generated MSW mocks in
  the web app, and the suites under `clients/apps/desktop/tests` and `clients/apps/desktop/packages/core`.

## Engineering Standards

Each rule below is checkable in a diff. App-level files add more.

- **Types and validation.** Follow [TypeScript Standards](#typescript-standards) and the Go rules
  in [server/AGENTS.md](server/AGENTS.md). Validate data at runtime boundaries
  with the existing Zod or OpenAPI-derived schema and derive types from it.
- **One source of truth.** NEVER redefine a schema, enum, route, configuration key, error code, or
  business rule that already has an owner. Import it, or regenerate it from its source. Go
  configuration belongs in `server/internal/appconfig`.
- **Compatibility.** Before you change shared code, list its callers and keep them working. Public
  APIs, persisted data, IPC payloads, events, and workflow histories change only with a migration
  or versioning plan in the same change.
- **Security and tenancy.** Reuse the established authentication, authorization, tenant-scoping,
  and input-validation paths: Ent interceptors and hooks in the server, the BFF session in
  `clients/apps/web/lib/auth`, and `ipc-security.ts` on the desktop. NEVER weaken them to make
  reuse easier, and NEVER use `auth.WithInternal` or `auth.WithInternalOnly` to make a shared
  query work for a new caller.
- **Financial correctness.** Money MUST be integer minor units with an explicit currency; reuse the
  existing `amountMinor` + `currency` shape in `clients/apps/desktop/packages/shared/src/relationships.ts`
  before defining another. NEVER do money arithmetic with floats or a display formatter. Changes
  to billing, credits, quota, pricing, or revenue MUST preserve idempotency keys, guarded state
  transitions, and append-only audit records, and MUST test duplicate execution and invalid
  transitions.
- **Errors.** Use the established error conventions and make failures visible. NEVER add a silent
  fallback, a `catch { return null }`, a fake success, or a default that hides broken behavior.
- **Testing.** Follow the owning app's test policy:
  [server](server/AGENTS.md#business-logic-testing) with
  [testing.md](server/docs/engineering/testing.md),
  [web app](clients/apps/web/AGENTS.md#testing-and-quality-gates) with the
  [component standard](clients/apps/web/components/README.md), and the desktop layers in the
  [quality gates plan](docs/ENGINEERING_QUALITY_GATES_PLAN.md). Assert behavior; mock-call
  counts, status codes, and snapshots may supplement behavioral assertions but never replace them.
  A bug fix SHOULD include a regression test that fails without the fix; the server makes it a
  MUST.
- **Quality gates.** Run the final gate for every area you touched. NEVER weaken, skip, or
  suppress a check to get green. That covers ESLint configs and plugins, `.golangci.yml`, Prettier,
  lefthook, the Gauntlet baselines in `clients/apps/desktop/config/baselines`, and the web app architecture
  baselines and bundle and Lighthouse budgets. Baselines and budgets record legacy debt: reduce or
  preserve them. Grow one only for an explicitly reviewed legacy exception, never to land a
  routine change.
- **Documentation.** When you change behavior that a nested `AGENTS.md`, deep-dive doc, or RFC
  describes, update that document in the same change.

## Handoff Evidence

End every implementation task with a short report. Scale it to the change; a small fix needs one
line per item.

- **Reused or extended:** the existing code or patterns you built on, by path.
- **New despite a candidate:** what you added, the candidate, and why it was unsuitable.
- **Shared impact:** shared modules, contracts, or consumers your change affects.
- **Checks:** each command you ran with its result, and each required check you could not run with
  the reason. NEVER report an unrun or failing check as passing.

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

| Feature                                                                                                                                                                                                | Doc                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Live Notes — single `live:` frontmatter block (one objective + optional cron / windows / eventMatchCriteria) that turns a note into a self-updating artifact, panel UI, Copilot skill, prompts catalog | `clients/apps/desktop/docs/LIVE_NOTE.md`             |
| Analytics — PostHog event catalog, person properties, use-case taxonomy, how to add a new event                                                                                                        | `clients/apps/desktop/docs/ANALYTICS.md`             |
| Meeting capture — local dual-track recording, transcription, recovery, and packaging                                                                                                                   | `clients/apps/desktop/docs/MEETING_CAPTURE.md`       |
| Desktop architecture enforcement — executable rules, ratchets, package boundaries, and security checks                                                                                                 | `clients/apps/desktop/docs/ARCHITECTURE_GAUNTLET.md` |
| rowboat-www growth standard — `npm run gen` for pages, components, Zod, hooks, mutations, stores, stories                                                                                              | `clients/apps/web/docs/growth-standard.md`           |
| Server engineering standards — architecture, security and tenancy, database, Temporal, API design, testing                                                                                             | `server/docs/engineering/README.md`                  |

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

- Config file: `~/.oppulence/config/models.json`
- Schema: `{ provider: { flavor, apiKey?, baseURL?, headers? }, model: string }`
- Models catalog cache: `~/.oppulence/config/models.dev.json` (OpenAI/Anthropic/Google only)

### Add a new shared type

1. Search `clients/apps/desktop/packages/shared/src/` for an existing schema to reuse or extend first.
2. Edit `clients/apps/desktop/packages/shared/src/`
3. Run `cd clients/apps/desktop && npm run deps` to rebuild

### Modify main process

1. Edit `clients/apps/desktop/apps/main/src/`
2. Restart dev server (main doesn't hot-reload)

### Modify renderer (React UI)

1. Edit `clients/apps/desktop/apps/renderer/src/`
2. Changes hot-reload automatically in dev mode

### Add a new dependency to main

1. Confirm no existing dependency in `clients/apps/desktop` already covers the need.
2. `cd clients/apps/desktop/apps/main && pnpm add <package>`
3. Import in source - esbuild will bundle it

### Verify compilation

Quick compile and lint check while iterating. It does not replace the `pnpm verify` final gate.

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
