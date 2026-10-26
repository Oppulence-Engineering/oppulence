# Reusable DigitalOcean App Platform workflow

The reusable workflow is published in the public [Oppulence shared-workflows repository](https://github.com/Oppulence-Engineering/shared-workflows/blob/main/.github/workflows/digitalocean-app-platform.yml), with its image-build mode released as [v1.2.0](https://github.com/Oppulence-Engineering/shared-workflows/releases/tag/v1.2.0). Each app repository calls that workflow. This monorepo has production App Platform callers for rowboat-www and rowboat-api, including the API worker, scheduler, and predeploy migration job. See the [production operations runbook](../runbooks/app-platform-production.md) for rollout, verification, and rollback.

A **public** repository can host this workflow even when callers are private, if the organization's Actions policy permits public reusable workflows. Public workflow code and commit history are visible to everyone. Keep DigitalOcean tokens and app runtime secrets in the calling repository's GitHub secrets or DigitalOcean App Platform, never in the workflow repository. Pin the called workflow to a reviewed commit SHA in production; a branch or mutable tag can change the code that receives the deployment token. The reusable workflow also pins its nested `digitalocean/action-doctl` action to commit `3cb3953159719656269e044e0e24ca16dd2a690f` (v2.5.2).

## Per-app setup

1. Create a **complete** DigitalOcean App Platform app spec in the **app repository**, for example `.do/app.yaml`. For an existing app, start from `doctl apps spec get <app-id>` so an update does not remove its domains, components, or environment variables. Review secret fields before committing the spec; use DigitalOcean's encrypted secret values rather than plaintext credentials. Keep its `name` stable and unique. For GitHub-built images, set each component's `image` to the same registry and repository with `tag: ci-placeholder`. The workflow substitutes a digest before DigitalOcean receives the spec.
2. Connect the app repository to App Platform. Create the app once from its spec (for example, `doctl apps create --spec .do/app.yaml --wait`) and record its app ID as a GitHub repository or organization variable. The shared workflow updates that **existing** app; it never creates one. Create a DigitalOcean token with App Platform read and update access and store it as an organization or repository secret in each caller repository. Use separate tokens for staging and production where those environments are isolated. The workflow proposes the spec against the existing app ID so exported encrypted `EV[...]` secrets validate correctly.
3. Create GitHub `staging` and `production` environments in each caller repository. Restrict their deployment branches; add reviewers to production if required. The reusable workflow selects the environment before it uses the deployment token.
4. Keep each app's quality gates and path filtering in its caller workflow. The shared workflow validates the ref and spec, builds and pushes the image on GitHub's runner, verifies public GHCR pull, renders the immutable digest, then runs `doctl apps update --update-sources --wait`. It verifies the new active deployment and every component's image digest. Configure registry, Dockerfile, build context/target/args, runner, doctl version, timeout, and optional HTTPS health check through [workflow inputs](https://github.com/Oppulence-Engineering/shared-workflows#inputs).

Assign each App Platform app ID to one caller repository. GitHub serializes deployments within a repository, while separate repositories can still race when updating the same app.

Example app spec for a GHCR image service:

```yaml
name: example-web-production
region: nyc
services:
  - name: web
    image:
      registry_type: GHCR
      registry: your-organization
      repository: your-image
      tag: ci-placeholder
    http_port: 8080
    instance_size_slug: apps-s-1vcpu-0.5gb
```

For this monorepo, a Dockerfile such as `apps/rowboat-www/Dockerfile` copies shared packages from the repository root, so the caller sets `build_context: .` and `dockerfile_path: apps/rowboat-www/Dockerfile`. Those build paths are workflow inputs, not App Platform component fields. The API app spec also defines background workers and a predeploy migration job; all four components reference the same image. Its encrypted app-level environment values are inherited by all components.

## Provisioned production apps

| App | App Platform ID | Default URL | Spec | Caller |
| --- | --- | --- | --- | --- |
| rowboat-www | `f2e91ead-9963-46be-b205-4fb7518dea2d` | https://rowboat-www-production-gmmbn.ondigitalocean.app | `.do/rowboat-www-production.yaml` | `.github/workflows/rowboat-www-app-platform.yml` |
| rowboat-api | `dd11bce0-097b-459a-9c36-c66f3562cd5a` | https://rowboat-api-production-w59vj.ondigitalocean.app | `.do/rowboat-api-production.json` | `.github/workflows/rowboat-api-app-platform.yml` |

The apps are in DigitalOcean's Solomon-AI project. Their production domains are `oppulence.io` (with `www.oppulence.io` as an alias) and `api.oppulence.io`. The continuously running instances cost an estimated $65/month: $24 web, $24 API service, $12 API worker, and $5 scheduler. The predeploy migration job is billed while it runs; usage charges may be additional. Public GHCR adds no DigitalOcean registry plan charge. The repository holds `ROWBOAT_WWW_APP_ID`, `ROWBOAT_API_APP_ID`, `ROWBOAT_WWW_HEALTHCHECK_URL`, and `ROWBOAT_API_HEALTHCHECK_URL` as GitHub variables, and a scoped `DIGITALOCEAN_PRODUCTION_TOKEN` repository secret. Rotate the token before its October 12, 2027 expiry.

The exported API spec contains encrypted App Platform values for the existing production Infisical secrets; never replace them with plaintext in Git. The App Platform callers deploy on relevant pushes to `main` and through manual dispatch. The Fly callers are disabled.

## Caller: one app, production

Save this in the **app repository** as `.github/workflows/deploy-app-platform.yml`. The `uses:` reference is pinned to the reviewed v1.2.0 workflow commit. Replace the app-specific quality job with that app's required checks. GitHub evaluates the `uses:` reference as a literal value; it cannot come from an expression or organization variable.

```yaml
name: Deploy web to App Platform

on:
  push:
    branches: [main]
    paths:
      - "apps/rowboat-www/**"
      - "packages/ui/**"
      - "packages/relationship-contract/**"
      - "packages/eslint-plugin-oppulence-web/**"
      - "charts/rowboat-www/**"
      - "scripts/rowboat-www-smoke.sh"
      - ".do/rowboat-www-production.yaml"
      - ".github/workflows/deploy-app-platform.yml"
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: apps/rowboat-www/package-lock.json
      - run: npm ci
        working-directory: apps/rowboat-www
      - run: npx playwright install --with-deps chromium
        working-directory: apps/rowboat-www
      - run: npm run verify:ci
        working-directory: apps/rowboat-www

  deploy:
    needs: quality
    uses: Oppulence-Engineering/shared-workflows/.github/workflows/digitalocean-app-platform.yml@39e73ce91a0280405ae5bfd35ef7834b2f96c58f
    with:
      app_id: ${{ vars.ROWBOAT_WWW_APP_ID }}
      app_spec_path: .do/rowboat-www-production.yaml
      environment: production
      deploy_ref: refs/heads/main
      build_image: true
      image_registry_type: GHCR
      image_registry: oppulence-engineering
      image_repository: rowboat-www
      dockerfile_path: apps/rowboat-www/Dockerfile
      build_context: .
    secrets:
      digitalocean_token: ${{ secrets.DIGITALOCEAN_PRODUCTION_TOKEN }}
```

For a second app, copy the small caller and change its trigger paths, quality job, app ID, spec path, image package, Dockerfile, environment, and token mapping. For staging, add a separate caller or deploy job with `environment: staging`, `deploy_ref` matching its source branch, a staging app ID and spec, and a staging token.

The CLI updates the existing app using a rendered spec and waits for deployment. GitHub Actions builds the image once from the authorized commit, pushes it to GHCR, and pins every App Platform component to the resulting digest. The workflow checks that the remote branch head still equals the triggering commit before building and verifies the active digest after deployment. GitHub-source callers remain supported when `build_image` is false.

## References

- [GitHub reusable workflow access and caller behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)
- [GitHub reuse syntax and secret passing](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [DigitalOcean GitHub Actions deployment guide](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/)
- [DigitalOcean doctl setup action](https://github.com/digitalocean/action-doctl)
- [DigitalOcean doctl app update](https://docs.digitalocean.com/reference/doctl/reference/apps/update/)
- [DigitalOcean doctl app spec get](https://docs.digitalocean.com/reference/doctl/reference/apps/spec/get/)
- [DigitalOcean app spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
