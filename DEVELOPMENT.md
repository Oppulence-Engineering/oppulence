# Development

Oppulence runs locally as three surfaces. One command, `dev`, drives all of them.

| Surface                    | Path               | Runs as                                                  |
| -------------------------- | ------------------ | -------------------------------------------------------- |
| Desktop (Electron)         | `apps/x`           | nested pnpm workspace                                    |
| Web app and marketing site | `apps/rowboat-www` | Next.js (npm), hot reload                                |
| Backend (API and worker)   | `apps/rowboat-api` | Go, in Docker Compose with Postgres, Redis, and Temporal |

## Quick start

```bash
brew bundle             # Docker Desktop, Node 24, pnpm 10, Go
./dev/cli.mjs install   # once: adds the `dev` command to your shell
dev up                  # checks tools, fills the root .env, installs, starts the backend
dev start               # web app + desktop, with prefixed logs
```

`dev up` asks for any missing [secrets](#secrets) and writes them to the
gitignored root `.env`. Rerun it after pulling: installs are skipped unless a
lockfile changed, and migrations run every time the backend starts.

## Commands

| Command                 | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `dev up`                | Check tools, fill the root `.env`, install dependencies, build and start the backend |
| `dev doctor`            | Check tools, backend ports, secrets, and git hooks; changes nothing                  |
| `dev start`             | Run the web app and desktop together; starts the backend if it is down               |
| `dev www`               | Web app only, hot reload on http://localhost:18082                                   |
| `dev desktop`           | Desktop only, pointed at the local API                                               |
| `dev api`               | Rebuild and restart the backend after Go changes                                     |
| `dev status`            | Show containers and which endpoints answer                                           |
| `dev logs [service...]` | Follow backend logs (`api`, `worker`, `temporal`, `postgres`, ...)                   |
| `dev db migrate`        | Rebuild the image and apply migrations                                               |
| `dev db psql`           | Open psql on the local database                                                      |
| `dev down [--volumes]`  | Stop the backend; `--volumes` also deletes its data                                  |

`dev` is [`dev/cli.mjs`](dev/cli.mjs): plain Node with no dependencies. It wraps
`docker-compose.rowboat-api.yml`, `npm run dev:stack` in `apps/rowboat-www`, and
`npm run dev` in `apps/x`, so those still work on their own.

## Secrets

The backend will not start without these keys in the root `.env`. `dev` reads
the list from `docker-compose.rowboat-api.yml`, so a newly required key is
picked up without changing the CLI.

| Key                                        | Used for                             | Where to get it                                                            |
| ------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------- |
| `WORKOS_API_KEY`                           | Sign-in through WorkOS AuthKit       | WorkOS dashboard; see [AUTH.md](apps/rowboat-api/AUTH.md#local-end-to-end) |
| `OPENROUTER_API_KEY`                       | Assistant chat (the worker calls it) | [openrouter.ai/keys](https://openrouter.ai/keys)                           |
| `OPENAI_API_KEY`                           | Embeddings                           | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)       |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth connections             | A Google Cloud OAuth client; see [google-setup.md](google-setup.md)        |

For an offline plumbing check, set `ROWBOAT_COMPOSE_MOCK_LLM=1`. Chat turns then
get a canned reply from devstack; `OPENROUTER_API_KEY` still needs a value.

The web app reads `apps/rowboat-www/.env.local`. `dev up` copies it from
`.env.example`, whose defaults already point at the local API.

## Ports

| Service                        | Address                                              |
| ------------------------------ | ---------------------------------------------------- |
| API (HTTP and SSE)             | http://localhost:18080                               |
| API gRPC                       | localhost:18081                                      |
| Web app                        | http://localhost:18082                               |
| devstack (mock LLM and Google) | http://localhost:8090                                |
| Postgres                       | localhost:5433 (user, password, database: `rowboat`) |
| Temporal                       | localhost:7233                                       |
| Metrics (API, worker)          | localhost:19090, localhost:19091                     |

## Before you open a PR

Run the gate for each surface you touched:

| Surface | Command                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| Desktop | `cd apps/x && pnpm verify`                                                    |
| Web app | `cd apps/rowboat-www && npm run verify:fast` (before merge: `npm run verify`) |
| Backend | `cd apps/rowboat-api && make verify`                                          |

`dev up` installs the lefthook git hooks, which format staged files and run the
architecture gauntlets on commit and push. PR titles must follow Conventional
Commits; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Other ways to run

- **kind (Kubernetes):** `make stack` deploys the backend with the production
  Helm chart; `make help` lists every target. It is slower, so use it for chart
  and infrastructure changes.
- **Legacy dashboard (`apps/rowboat`):** the root `docker-compose.yml`, with keys
  from the root `.env.example`.
