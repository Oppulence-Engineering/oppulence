# App Platform production operations

The production web and API apps live in DigitalOcean's Solomon-AI project:

| Component   | App ID                                 | Default URL                                               |
| ----------- | -------------------------------------- | --------------------------------------------------------- |
| rowboat-www | `f2e91ead-9963-46be-b205-4fb7518dea2d` | `https://rowboat-www-production-gmmbn.ondigitalocean.app` |
| rowboat-api | `dd11bce0-097b-459a-9c36-c66f3562cd5a` | `https://rowboat-api-production-w59vj.ondigitalocean.app` |

The app specs are `.do/rowboat-www-production.yaml` and `.do/rowboat-api-production.json`. The API app contains an HTTP service, one Temporal worker, one scheduler, and a predeploy migration job. The worker and scheduler run the distinct binaries built by `apps/rowboat-api/Dockerfile`. All API components inherit the same app-level encrypted production configuration; component-level flags enable background duties only in the respective processes. The migration job uses `MIGRATION_DATABASE_URL` for a direct Postgres connection.

The caller workflows use the public, SHA-pinned `Oppulence-Engineering/shared-workflows` workflow. GitHub Actions builds Linux AMD64 images from the main commit and pushes them to the public `ghcr.io/playbookmediallc/rowboat-www` and `ghcr.io/playbookmediallc/desktop-assistant-rowboat-api` packages. The workflow substitutes each image's digest into the complete app spec and verifies that DigitalOcean deployed that exact digest. One API image supplies the service, worker, scheduler, and migration job. Keep the GHCR packages publicly pullable; DigitalOcean has no registry credentials in these specs. The Fly deployment workflows are disabled and must not regain a `push` trigger while Fly is retired.

## Deploy and verify

1. Confirm the caller's quality job passed, the built image was pushed to GHCR, and the anonymous pull check passed. Apply database changes through the API app's `PRE_DEPLOY` job. A failed migration blocks the new service rollout. Review the migration job logs before retrying; do not repeatedly apply a non-idempotent migration manually.
2. Wait for the app deployment to reach `ACTIVE`. Inspect the worker and scheduler run logs for successful Postgres, Redis, and Temporal connections. Their `/readyz` endpoints on port 9090 become healthy after Temporal is connected; their liveness probes use `/healthz`.
3. Probe both default URLs at `/healthz` and `/readyz`; run `scripts/rowboat-www-smoke.sh` against the web default URL. Check the API's connector JWKS endpoint and verify the expected signing `kid` without copying private key material.
4. Once the App Platform background components are ready, scale the Fly worker and scheduler process groups to zero. Cloudflare DNS for `oppulence.io` is externally managed. Point `api.oppulence.io` to the API default hostname and both the apex and `www.oppulence.io` directly to the web default hostname using DNS-only CNAMEs; Cloudflare flattens the apex. Remove the old Fly A and AAAA records for the API and apex so no resolver continues to reach Fly.
5. Wait for all three custom domains to become active with valid TLS certificates. Probe `https://api.oppulence.io/readyz`, `https://oppulence.io/readyz`, and `https://www.oppulence.io/readyz`; run the web smoke script against the apex. Check the browser sign-in flow, API proxy, OAuth callbacks, and a background task before scaling the Fly request apps to zero. Allow at least the previous DNS TTL before stopping Fly's request machines so cached Fly addresses can expire.
6. Scale the two Fly request apps to zero. Keep the Fly apps and their manual workflow definitions for rollback. Enable repository GitHub Actions after confirming the Fly workflows are manual only.

The production GitHub repository variables are `ROWBOAT_API_APP_ID`, `ROWBOAT_WWW_APP_ID`, and the corresponding `*_HEALTHCHECK_URL` values. The repository secret `DIGITALOCEAN_PRODUCTION_TOKEN` expires October 12, 2027. Replace it before expiry and never commit plaintext credentials; the `EV[...]` values in the exported API spec are app-specific encrypted values.

## Rollback

For an application rollback, deploy a previous known-good GHCR digest in the app spec and verify the active digest. Treat schema migrations separately; an image rollback does not reverse them. If App Platform itself fails after DNS cutover, restore the Cloudflare DNS-only Fly records and Fly scale counts. Previously, the API had A `66.241.125.221` and AAAA `2a09:8280:1::17b:436f:0`; the apex had A `66.241.124.170` and AAAA `2a09:8280:1::17b:4371:0`. `www` pointed to the apex. The Fly API topology was two request machines, one worker, and one scheduler; the Fly web app had two request machines. Verify the current Fly addresses and certificates before using these historical values.

Restore the Fly worker and scheduler only if the App Platform background components have first been stopped, to avoid two active background fleets. Fly workflows are disabled; re-enabling them is an explicit recovery decision. Fly deployments run migrations, so review schema compatibility before deploying an older image. Keep the App Platform specs and Cloudflare record history as the forward recovery path.
