# @oppulence/sdk

TypeScript SDK for the Oppulence API.

The contract is [`server/api/openapi.json`](../../server/api/openapi.json).
Everything under `src/generated/` is generated from it; do not edit it by hand.

## Install

```bash
npm install @oppulence/sdk
```

## Usage

```ts
import { createOppulenceClient } from "@oppulence/sdk";

const api = createOppulenceClient({
  baseUrl: "https://api.example.com",
  accessToken: () => tokenStore.currentAccessToken(),
});

const { data, error } = await api.GET("/v1/me");
if (error) {
  throw error;
}
console.log(data);
```

`createOppulenceClient` returns the `openapi-fetch` typed client, so every path,
parameter, and response type comes from the OpenAPI document.

## How it stays generated

The SDK is regenerated whenever the API contract is:

- `make generate` and `make contract-generate` in `server/` run `sdk-generate`,
  which rebuilds `src/generated/schema.ts` and `dist/` from `openapi.json`.
- The lefthook pre-commit hook runs `make contract-generate-check` when the
  OpenAPI document, ent schemas, or GraphQL config change.
- CI (`.github/workflows/rowboat-api-quality.yml`) regenerates and fails on any
  diff, so a stale SDK cannot merge.

## Develop

```bash
npm install
npm run generate
npm run typecheck
npm run build
```

Or from `server/`: `make sdk-generate`.
