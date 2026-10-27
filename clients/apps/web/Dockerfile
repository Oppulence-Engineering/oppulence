# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /repo/clients/apps/web
COPY clients/apps/web/package.json clients/apps/web/package-lock.json clients/apps/web/.npmrc ./
# file: deps resolve from this tree, same as clients/packages/ui below.
COPY clients/apps/web/vendor/sim /repo/clients/apps/web/vendor/sim
COPY clients/packages/relationship-contract /repo/clients/packages/relationship-contract
COPY clients/packages/ui /repo/clients/packages/ui
COPY clients/packages/eslint-plugin-web /repo/clients/packages/eslint-plugin-web
RUN npm ci
# Turbopack resolves @oppulence/ui from clients/packages/ui (next.config turbopack.root). npm ci does
# not hoist file:-linked package deps where the bundler looks — symlink this app's tree.
RUN ln -s /repo/clients/apps/web/node_modules /repo/clients/packages/ui/node_modules

FROM deps AS build
WORKDIR /repo/clients/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# The deploy passes the commit SHA. Next.js bakes it into the standalone build,
# so a browser still running an older deploy reloads instead of crashing.
ARG NEXT_DEPLOYMENT_ID=""
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID}
COPY clients/apps/web .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app/clients/apps/web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV ROWBOAT_WWW_PUBLIC_API_BASE_URL=https://api.oppulence.io
ENV ROWBOAT_WWW_API_PROXY_URL=https://api.oppulence.io
ENV ROWBOAT_WWW_PORT=8080

COPY --from=build --chown=101:101 /repo/clients/apps/web/.next/standalone /app
COPY --from=build --chown=101:101 /repo/clients/apps/web/.next/static ./.next/static
COPY --from=build --chown=101:101 /repo/clients/apps/web/public ./public
COPY --chown=101:101 clients/apps/web/scripts/docker-entrypoint.sh /docker-entrypoint.sh

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${ROWBOAT_WWW_PORT}/healthz" >/dev/null || exit 1

USER 101:101
ENTRYPOINT ["/bin/sh", "/docker-entrypoint.sh"]
