# Oppulence

**One assistant, wherever you work.**

Oppulence is an email-first personal assistant built around the people you work
with. It brings together conversations, meetings, and notes so you can understand
what happened, prepare a useful reply, and follow through on unfinished work.

A customer asks about a rollout. The answer is in last week's meeting, an older
email, and a note you made afterward. Oppulence's purpose is to bring that
context to the reply, with the sources available for review.

[Open Oppulence Web](https://oppulence.io/app) ·
[Explore the product](https://oppulence.io/product) ·
[Download Desktop or Voice](https://oppulence.io/download)

## One assistant, three ways to work

| Application           | Role                          | When to use it                                                                                                        |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Oppulence Web**     | Your work, organized          | Review connected relationships, prepared work, sources, and approvals in a browser. No desktop installation required. |
| **Oppulence Desktop** | Your full working environment | Work with email, local files, Markdown notes, an embedded browser, and native tools.                                  |
| **Oppulence Voice**   | Your assistant within reach   | Dictate, capture a thought, record a meeting, or edit selected text without opening the full workspace.               |

The direction is one account, one relationship memory, one assistant, and one
history of actions. Each application has a distinct role. Voice is an optional
companion; using Oppulence should not require installing two desktop apps.

Voice remains in the separate OpenWhispr-derived capture repository. It can be
useful on its own. The planned **Ask Oppulence** entry point connects its compact
panel to Oppulence's assistant and opens the full workspace for larger reviews.

## What is available and what is next

The repository contains a working desktop assistant with email, local notes,
meeting capture, live notes, background tasks, and an embedded browser. The web
app and shared API provide relationship views, assistant work, connectors, and
approval flows. Availability depends on the deployment, connected sources, and
rollout stage.

We are connecting these foundations into a more consistent experience. The
following changes are **in development**:

- A common Today, Inbox, People, Library, and Activity experience on Web and Desktop.
- Relationship context brought directly into email review and reply preparation.
- Voice's Ask Oppulence panel using the same assistant runtime and action history.
- Accepted Voice artifacts becoming relationship history after identity review,
  with deletion propagation and explicit sharing controls.
- A coordinated onboarding and optional Voice installation experience.

Capture ingestion already has a versioned handoff. Accepting a transcript is not
proof that it has been linked to a person or used in a response. See the current
implementation status in
[RFC 055](./docs/rfc/055-capture-product-boundary-and-oppulence-integration.md).

## The workflow we are building around

**Meeting → relationship memory → contextual email reply → tracked follow-up**

1. **Before the meeting:** prepare a short brief from authorized emails, prior
   meetings, relevant notes, and open questions.
2. **During the meeting:** use Voice for capture, with appropriate consent and a
   visible recording indicator.
3. **After the meeting:** review the transcript, correct speakers and suggested
   relationship matches, and choose what to share with Oppulence.
4. **When the next email arrives:** bring the relevant history beside the thread.
   Prepare a reply with its sources and any uncertain claims visible.
5. **After approval:** record the action and its verified result. Keep an open
   request visible while waiting for a response or other evidence of completion.

This is the target end-to-end experience. It is also the standard for evaluating
whether the separate applications work together usefully.

## A workspace organized around the next decision

The target navigation keeps everyday work easy to find:

| Destination  | What belongs there                                                                    |
| ------------ | ------------------------------------------------------------------------------------- |
| **Today**    | Work needing your decision, prepared replies, waiting items, and upcoming meetings.   |
| **Inbox**    | Email, triage, drafts, search, and relationship context beside a conversation.        |
| **People**   | A person or company's history across correspondence, meetings, notes, and follow-ups. |
| **Library**  | Notes, transcripts, files, and the source material behind an answer.                  |
| **Activity** | Proposals, approvals, execution results, failures, and available undo actions.        |

The assistant should be available through search, a command palette, and a
contextual panel. Relationship graphs and agent configuration support deeper
work without becoming the first thing every user has to learn.

## Memory you can inspect and correct

The relationship model connects people, companies, conversations, and ongoing
work. It retains the distinction between three kinds of information:

| Information             | How it should be used                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **Source evidence**     | What someone actually said, linked to the original email or transcript passage.        |
| **Private notes**       | What you wrote or think, attributed to you and private unless you explicitly share it. |
| **Assistant inference** | A proposed interpretation, labeled as uncertain and open to correction.                |

A private note saying a customer may be worried about price is not evidence that
the customer said so. It must not silently become a quoted fact or appear in an
outgoing email. Ambiguous speakers and relationship matches need review.

Marketing feedback, campaign responses, and customer objections can contribute
to the same relationship history when authorized. They do not need a separate
marketing dashboard or a second memory system.

The existing commitment register, account views, attention queue, and knowledge
graph remain useful tools inside this broader assistant experience. The
[relationship-state architecture](./docs/rfc/036-relationship-state-engine.md)
describes their underlying evidence model.

## Actions you can review

For each proposal, the experience should show what happened, which sources
support it, what Oppulence proposes, and whether your approval is required.

External sends and writes use the governed action path. A prepared draft, an
approved action, an execution attempt, and a verified result are different
states. A tool call alone is not proof of completion. Failed or uncertain work
must remain visible for repair.

Start with Gmail and add other sources when useful. The goal is to support work
alongside your existing email client as well as inside Oppulence. Dictating into
Outlook is separate from connecting Outlook as a relationship data source.

## Local work and sharing

Desktop maintains an Obsidian-compatible Markdown vault that you can inspect,
edit, back up, and delete. Local files, live notes, and native tools extend the
workspace. Cloud-backed work and local background tasks have different runtime
requirements.

Voice owns global dictation, meeting recording, and capture controls. Desktop
owns full-workspace navigation. Each global command should have one owner.

Local transcription can keep audio on the device. A cloud transcription or model
provider receives the content needed for that request. Signing in is not consent
to publish private notes or upload all local files. The planned shared experience
must preserve explicit artifact transfer, visibility, and deletion controls.

## Getting started

### Web

[Open Oppulence](https://oppulence.io/app), sign in, and connect only the sources
you want the assistant to use. Web requires no native application.

### Desktop and Voice

Use the [download page](https://oppulence.io/download) to choose an application
and a supported installer. Desktop and Voice currently have separate downloads.
Install the capabilities you need; the complete Voice-to-memory journey is still
being integrated.

For desktop Google connections, follow [Google setup](./google-setup.md).
Optional desktop provider configuration lives under `~/.rowboat/config/`:

| Capability                  | Configuration file |
| --------------------------- | ------------------ |
| Model provider              | `models.json`      |
| Voice input and voice notes | `deepgram.json`    |
| Voice output                | `elevenlabs.json`  |
| Exa web search              | `exa-search.json`  |
| External MCP tools          | `mcp.json`         |

The optional Deepgram, ElevenLabs, and Exa key files use this format:

```json
{ "apiKey": "<your-key>" }
```

Model configuration and supported local or hosted providers are documented in
[the desktop engineering guide](./clients/apps/desktop/AGENTS.md). Review an MCP server's access
before connecting it, especially when it can send messages or change data.

## Develop locally

```bash
brew bundle             # Docker Desktop, Node 24, pnpm 10, Go
./dev/cli.mjs install   # once: adds the `dev` command to your shell
dev up                  # secrets, dependencies, and the local backend
dev start               # web app + desktop
```

[DEVELOPMENT.md](./DEVELOPMENT.md) covers every `dev` command, the secrets the
backend needs, local ports, and the checks to run before a PR. Deployment is in
the [deployment guide](./docs/BACKEND_DEPLOYMENT.md).

---

## Architecture & Deployment

Web and Desktop share the API in this monorepo. Voice remains a separate
companion repository, connected through the versioned capture contract in
[RFC 055](./docs/rfc/055-capture-product-boundary-and-oppulence-integration.md).
The shared assistant experience is the product direction; it does not imply
that every workflow or local artifact already syncs between applications.

The main components in this repository are:

1. **Oppulence Web (`clients/apps/web`)** — the browser workspace for connected
   relationships, source review, assistant conversations, and approvals.
   Today, Inbox, People, Library, and Activity are the target experience.
2. **Oppulence Desktop (`clients/apps/desktop`)** — the full native workspace with email,
   local files, notes, an embedded browser, and native tools.
3. **Oppulence API (`server`)** — the relationship state engine,
   evidence and assertion history, connector broker, and always-on execution
   plane shared by both clients.

### Primary surfaces

**1. Oppulence Web (`clients/apps/web`)** — the browser client for the same
relationship state and workflows available on desktop. It also contains the
public product site.

**2. Oppulence Desktop (`clients/apps/desktop`)** — the Electron client and local observation
client. It adds local context and native tools; common navigation and
workflow parity with Web remain part of the product roadmap.

```
clients/apps/desktop/
├── apps/
│   ├── main/        # Electron main process (Node) — main.ts
│   ├── renderer/    # React 19 + Vite UI
│   └── preload/     # contextBridge between main and renderer
└── packages/
    ├── shared/      # @x/shared — types, validators
    └── core/        # @x/core — AI, OAuth, MCP, business logic
```

Build chain: `shared -> core -> preload -> renderer/main`. `npm run deps` builds
the workspaces; esbuild bundles the main process to a single CommonJS file
because Electron Forge's dependency walker cannot follow pnpm symlinks. See
[`clients/apps/desktop/LIVE_NOTE.md`](./clients/apps/desktop/docs/LIVE_NOTE.md) for the live-note runtime.

**3. Oppulence API (`server`)** — the Go service for canonical
relationship state, observations, assertions, projections, source health, and
always-on work. It also provides WorkOS authentication, billing and credits,
the LLM gateway, provider proxies, OAuth, background tasks, event ingestion,
Temporal workflows, durable agent sessions, and OpenAPI.

```
server/
├── cmd/
│   ├── server/       # HTTP API, auth, connectors, LLM, events, background task routes
│   ├── worker/       # Temporal worker for API-native jobs and durable agents
│   └── scheduler/    # API-owned scheduler and Google watch manager
├── ent/              # Postgres schema and generated client
└── internal/         # auth, billing, connectors, jobs, runtime, agents, telemetry
```

This shared service owns relationship state and API-backed background work,
including event processing, recommendations, approved actions, and connector
repair. Desktop-only tasks still depend on the local application. See
[server/README.md](./server/README.md),
[docs/rfc/README.md](./docs/rfc/README.md), and
[RFC 036](./docs/rfc/036-relationship-state-engine.md).

### Surrounding apps

| Path                          | What it is                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `clients/apps/cli`            | CLI tool.                                                                                                                                  |
| `clients/apps/docs`           | Docs site.                                                                                                                                 |
| `sdk/typescript`              | TypeScript SDK (`@oppulence/sdk`), generated from `server/api/openapi.json`.                                                               |
| `sdk/python`                  | The `rowboat` PyPI client.                                                                                                                 |
| `clients/apps/experimental/*` | Chat widget, simulation runner, and tool-webhook reference: satellites of the retired hosted platform, not wired into any current surface. |

### Deployment paths

The primary surfaces ship through **separate pipelines**.

**Desktop (`clients/apps/desktop`)** is the only thing released from this repo's tags. Triggered on push to `main` via [`.github/workflows/release.yml`](./.github/workflows/release.yml):

1. `release-please` scans commits under `clients/apps/desktop/` (per `.release-please-config.json`). On a `feat:`/`fix:`/`feat!:`, it opens (or updates) a Release PR with a `CHANGELOG.md` bump + version. Merging that PR causes the next push to produce `release_created: true` and a tag `clients/apps/desktop@vX.Y.Z`.
2. Three parallel builders fan out from the tag: `build-macos` (imports Apple cert into a temp keychain, makes `.dmg` + `.zip` for arm64 + x64), `build-linux` (`.deb` / `.rpm` / `.zip` per arch), `build-windows` (Squirrel `.exe` + portable `.zip`).
3. Publish job attaches 16 installer assets + SPDX/CycloneDX SBOMs to the GitHub Release.
4. Installed clients use `update-electron-app` with the project's GitHub
   Releases feed; they download updates in the background and apply them on
   the next launch.

Build and publication time depends on the release workflow. See [Distribution and operations](#distribution-and-operations)
below.

**Oppulence API (`server`)** has its own quality and deploy workflows:
[`.github/workflows/rowboat-api-quality.yml`](./.github/workflows/rowboat-api-quality.yml)
and
[`.github/workflows/rowboat-api-deploy.yml`](./.github/workflows/rowboat-api-deploy.yml).
Local API development uses
[`docker-compose.rowboat-api.yml`](./docker-compose.rowboat-api.yml). This is
the relationship-state and execution plane shared by the web and desktop
clients. That file starts Temporal and the worker; assistant chat calls
OpenRouter, so the root `.env` needs `OPENROUTER_API_KEY`.

### CI side-jobs

- [`oppulence-build.yml`](./.github/workflows/oppulence-build.yml) — `verify:ci` for `clients/apps/web`.
- [`rowboat-api-quality.yml`](./.github/workflows/rowboat-api-quality.yml) / [`rowboat-api-deploy.yml`](./.github/workflows/rowboat-api-deploy.yml) — Go API quality and deploy gates.
- [`electron-build.yml`](./.github/workflows/electron-build.yml) / [`x-publish.yml`](./.github/workflows/x-publish.yml) / [`x-smoke-test.yml`](./.github/workflows/x-smoke-test.yml) — desktop CI gates (lint, packaging dry-run, smoke test).
- [`pr-title-lint.yml`](./.github/workflows/pr-title-lint.yml) — enforces Conventional Commits on PR titles, so release-please works.

### Summary

- Oppulence Web (`clients/apps/web`) is the **browser workspace** for
  relationship context, assistant work, source review, and approvals.
- Oppulence Desktop (`clients/apps/desktop`) is the **full native workspace** — release-please + electron-forge + GitHub Releases +
  auto-update.
- Oppulence API (`server`) is the **relationship-state and always-on
  execution plane** — observations, assertions, projections, source health,
  scheduled jobs, event routing, connectors, LLM gateway, Temporal, durable
  agents, and observability.
- These surfaces share repo-level contracts and clients where useful, but have independent release and deployment paths.

---

## Distribution and operations

### Installation

Download installers from the project's releases page:

**Latest release:** https://github.com/PlaybookMediaLLC/oppulence/releases/latest

Each release ships 16 installer assets covering the full Mac/Windows/Linux matrix (macOS `.dmg` and `.zip` for both arm64 and x64; Linux `.deb`, `.rpm`, and `.zip` for arm64 and x86_64; Windows Squirrel `.exe` installer plus a portable `.zip`), plus two supply-chain SBOMs (SPDX 2.3 and CycloneDX 1.5) so consumers can scan dependencies for known CVEs without rebuilding from source.

### Auto-update

The desktop app uses
[`update-electron-app`](https://github.com/electron/update-electron-app) with
the `Oppulence-Engineering/rowboat` release feed. Installed clients check for
new versions on startup and download them in the background; the next launch
uses the new version. To opt out, quit and remove the app.

### Telemetry and crash reporting

Oppulence uses [PostHog](https://posthog.com/) for product analytics and
exception capture. The main process registers `uncaughtException` and
`unhandledRejection` handlers through `posthog-node`; the renderer uses
`posthog-js` with exception capture enabled. See
[ANALYTICS.md](./clients/apps/desktop/docs/ANALYTICS.md) for the event taxonomy and opt-out
instructions.

### Release process

Releases follow [Conventional Commits](https://www.conventionalcommits.org/). When a PR with a `feat:`, `fix:`, or `feat!:`/`fix!:` commit (squash-merged into `main`) touches `clients/apps/desktop/`, [release-please](https://github.com/googleapis/release-please) automatically opens a release PR with the version bump and changelog entry. Merging that PR cuts a tag, triggers parallel macOS/Linux/Windows builds via electron-forge, attaches all 16 installer assets to the GitHub Release, and uploads SBOMs.

### Security

To report a vulnerability, see [SECURITY.md](./SECURITY.md) or email
admin@solomon-ai.co.
