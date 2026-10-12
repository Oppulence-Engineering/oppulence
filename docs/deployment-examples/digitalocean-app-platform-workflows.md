# Reusable DigitalOcean App Platform workflow

The reusable workflow is published in the public [Oppulence shared-workflows repository](https://github.com/Oppulence-Engineering/shared-workflows/blob/main/.github/workflows/digitalocean-app-platform.yml), with its current release at [v1.1.0](https://github.com/Oppulence-Engineering/shared-workflows/releases/tag/v1.1.0). Each app repository calls that workflow. No DigitalOcean caller has been activated in this monorepo; its Kubernetes and Fly deployments remain in place.

A **public** repository can host this workflow even when callers are private, if the organization's Actions policy permits public reusable workflows. Public workflow code and commit history are visible to everyone. Keep DigitalOcean tokens and app runtime secrets in the calling repository's GitHub secrets or DigitalOcean App Platform, never in the workflow repository. Pin the called workflow to a reviewed commit SHA in production; a branch or mutable tag can change the code that receives the deployment token.

## Per-app setup

1. Create a **complete** DigitalOcean App Platform app spec in the **app repository**, for example `.do/app.yaml`. For an existing app, start from `doctl apps spec get <app-id>` so an update does not remove its domains, components, or environment variables. Review secret fields before committing the spec; use DigitalOcean's encrypted secret values rather than plaintext credentials. Keep its `name` stable and unique. For GitHub-source components, set `github.repo` and `github.branch` to the app repository and authorized deployment branch. Set `deploy_on_push: false` so GitHub Actions is the only deployment trigger.
2. Connect the app repository to App Platform. Create the app once from its spec (for example, `doctl apps create --spec .do/app.yaml --wait`) and record its app ID as a GitHub repository or organization variable. The shared workflow updates that **existing** app; it never creates one. Create a DigitalOcean token with App Platform read and write access and store it as an organization or repository secret in each caller repository. Use separate tokens for staging and production where those environments are isolated.
3. Create GitHub `staging` and `production` environments in each caller repository. Restrict their deployment branches; add reviewers to production if required. The reusable workflow selects the environment before it uses the deployment token.
4. Keep each app's build, test, migration, smoke check, and path filtering in its caller workflow. The shared workflow validates the ref and spec, then runs `doctl apps update --update-sources --wait`. It verifies the new active deployment and the deployed source commit under its default `exact` policy. Configure source policy, image digest enforcement, runner, doctl version, timeout, and optional HTTPS health check through [workflow inputs](https://github.com/Oppulence-Engineering/shared-workflows#inputs).

Assign each App Platform app ID to one caller repository. GitHub serializes deployments within a repository, while separate repositories can still race when updating the same app.

Example app spec for a GitHub-source service:

```yaml
name: example-web-production
region: nyc
services:
  - name: web
    github:
      repo: YOUR_ORG/YOUR_APP_REPO
      branch: main
      deploy_on_push: false
    source_dir: /
    dockerfile_path: Dockerfile
    http_port: 8080
    instance_size_slug: basic-xxs
```

For this monorepo, a Dockerfile such as `apps/rowboat-www/Dockerfile` copies shared packages from the repository root. Its App Platform spec therefore needs `source_dir: /` and `dockerfile_path: apps/rowboat-www/Dockerfile`, followed by its real routes, environment variables, health check, and instance size. Review each app's current deployment contract before using App Platform; the API's migrations, workers, scheduler, secrets, and staging gates require app-specific work.

## Caller: one app, production

Save this in the **app repository** as `.github/workflows/deploy-app-platform.yml`. The `uses:` reference is pinned to the reviewed v1.1.0 workflow commit. Replace the app-specific quality job with that app's required checks. GitHub evaluates the `uses:` reference as a literal value; it cannot come from an expression or organization variable.

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

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: apps/rowboat-www/package-lock.json
      - run: npm ci
        working-directory: apps/rowboat-www
      - run: npm run verify:ci
        working-directory: apps/rowboat-www

  deploy:
    needs: quality
    uses: Oppulence-Engineering/shared-workflows/.github/workflows/digitalocean-app-platform.yml@f7215a700a8ea15c7c1a378fa240ccdba1ac2098
    with:
      app_id: ${{ vars.ROWBOAT_WWW_APP_ID }}
      app_spec_path: .do/rowboat-www-production.yaml
      environment: production
      deploy_ref: refs/heads/main
    secrets:
      digitalocean_token: ${{ secrets.DIGITALOCEAN_PRODUCTION_TOKEN }}
```

For a second app, copy the small caller and change its trigger paths, quality job, app ID, spec path, environment, and token mapping. For staging, add a separate caller or deploy job with `environment: staging`, `deploy_ref` matching its source branch, a staging app ID and spec, and a staging token. Keep the app spec's `github.branch` aligned with `deploy_ref`.

The CLI updates the existing app using the checked-out app spec and waits for deployment. App Platform builds GitHub-source components from the branch named in that spec. The default `exact` policy checks the remote branch head before updating and compares App Platform's recorded source commit to `github.sha` afterward. A later commit can reach that branch between those checks; the workflow then fails, but App Platform may already have deployed that newer commit. For atomic build promotion, build an image once, push it to a registry, and deploy its immutable digest through an image-based app spec.

## References

- [GitHub reusable workflow access and caller behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)
- [GitHub reuse syntax and secret passing](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [DigitalOcean GitHub Actions deployment guide](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/)
- [DigitalOcean doctl setup action](https://github.com/digitalocean/action-doctl)
- [DigitalOcean doctl app update](https://docs.digitalocean.com/reference/doctl/reference/apps/update/)
- [DigitalOcean doctl app spec get](https://docs.digitalocean.com/reference/doctl/reference/apps/spec/get/)
- [DigitalOcean app spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
