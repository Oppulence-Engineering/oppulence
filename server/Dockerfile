# syntax=docker/dockerfile:1
# Multi-stage build → small, non-root, distroless runtime image.
#
# Build context is the REPO ROOT (not server) so the go.mod replace
#   github.com/Oppulence-Engineering/rowboat/packages/oauth-resource-server-go
#   => ./oauth-resource-server
# resolves. Build with:
#   docker build -f server/Dockerfile -t rowboat-api .
# (Dockerfile.dockerignore keeps the context to just the two Go modules.)

FROM golang:1.26.10 AS build
WORKDIR /src

# Module graph first (cache-friendly): both go.mod files, including the local
# replace target. The image mirrors the repo layout so `./oauth-resource-server`
# resolves the same way it does on disk.
COPY server/go.mod server/go.sum ./server/
COPY server/oauth-resource-server/go.mod ./server/oauth-resource-server/
RUN --mount=type=cache,target=/go/pkg/mod \
    cd server && go mod download

# Sources (server/oauth-resource-server comes with server/).
COPY server ./server
RUN chmod -R a=rX /src/server/migrations/postgres

WORKDIR /src/server
ARG VERSION=dev
ARG COMMIT=none
ARG DATE=unknown
# Docker Desktop VMs are often ~8GiB with every host CPU visible. Compiling the
# generated Ent graph at full GOMAXPROCS OOMs (`compile: signal: killed`).
ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOMAXPROCS=2 \
    GOMEMLIMIT=2GiB \
    GOFLAGS=-p=2
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    set -eu; \
    ldflags="-s -w \
      -X github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/version.Version=${VERSION} \
      -X github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/version.Commit=${COMMIT} \
      -X github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/version.Date=${DATE}"; \
    go build -trimpath -ldflags="$ldflags" -o /out/rowboat-api ./cmd/server; \
    go build -trimpath -ldflags="$ldflags" -o /out/rowboat-api-worker ./cmd/worker; \
    go build -trimpath -ldflags="$ldflags" -o /out/rowboat-api-scheduler ./cmd/scheduler; \
    go build -trimpath -ldflags="-s -w" -o /out/rowboat-api-migrate ./cmd/migrate; \
    go build -trimpath -o /out/devstack ./cmd/devstack

FROM gcr.io/distroless/static-debian13:nonroot
WORKDIR /
COPY --from=build /out/rowboat-api /rowboat-api
COPY --from=build /out/rowboat-api-worker /rowboat-api-worker
COPY --from=build /out/rowboat-api-scheduler /rowboat-api-scheduler
COPY --from=build /out/rowboat-api-migrate /rowboat-api-migrate
COPY --from=build /out/devstack /devstack
COPY --from=build /src/server/migrations/postgres /migrations/postgres

# 8080 = public HTTP/SSE · 8081 = gRPC · 9090 = Prometheus metrics
EXPOSE 8080 8081 9090
USER nonroot:nonroot
CMD ["/rowboat-api"]
