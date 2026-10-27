SHELL := /bin/bash

OPPULENCE_KIND_SCRIPT := scripts/rowboat-api-kind.sh
OPPULENCE_WWW_IMAGE ?= rowboat-www:local
OPPULENCE_WWW_CONTAINER ?= rowboat-www-local
OPPULENCE_WWW_PORT ?= 18082
OPPULENCE_WWW_PUBLIC_API_BASE_URL ?= http://localhost:18080
OPPULENCE_WWW_API_PROXY_URL ?= http://host.docker.internal:18080
OPPULENCE_WWW_SESSION_SECRET ?= dev-only-rowboat-www-session-secret-change-me

.PHONY: help ports all stack api-up desktop www-up www-down www-smoke www-capture-screenshots product-screenshots smoke-desktop perf-desktop perf-desktop-full perf-desktop-deep perf-desktop-baseline perf-desktop-quick helm-validate infisical-validate validate validate-full validate-all status logs down delete-cluster

help:
	@printf "%s\n" \
	  "Oppulence local stack targets:" \
	  "" \
	  "  make stack          Build/deploy rowboat-api in kind, run rowboat-www, then run the desktop" \
	  "  make all            Alias for make stack" \
	  "  make api-up         Build/deploy rowboat-api in kind and run smoke checks" \
	  "  make desktop        Run the desktop against the kind API" \
	  "  make www-up         Build/run rowboat-www against the kind API" \
	  "  make www-smoke      Smoke test rowboat-www locally or against OPPULENCE_WWW_SMOKE_URL" \
	  "  make www-capture-screenshots Seed demo data and refresh marketing screenshots" \
	  "  make product-screenshots Alias for make www-capture-screenshots" \
	  "  make smoke-desktop  Drive the Electron app against the kind API" \
	  "  make perf-desktop   Package, drive, profile, and budget-check the desktop app" \
	  "  make perf-desktop-full Run the desktop perf gate including the cloud workflow" \
	  "  make perf-desktop-deep Run the full desktop perf gate with deep scale/leak loops" \
	  "  make perf-desktop-baseline Capture/update this machine's desktop perf baseline" \
	  "  make perf-desktop-quick Run the desktop perf gate reusing the existing package" \
	  "  make helm-validate  Run Helm lint/template checks for kind/stage/prod values" \
	  "  make infisical-validate Validate Infisical sync for kind secrets" \
	  "  make validate       Run API smoke checks against the kind stack" \
	  "  make validate-full  Run Helm, Kubernetes, API, and desktop smoke checks" \
	  "  make ports          Show the live API/devstack/www ports" \
	  "  make status         Show kind resources and local stack state" \
	  "  make logs           Tail rowboat-api logs" \
	  "  make down           Remove the Helm release and local dependencies" \
	  "  make delete-cluster Delete the kind cluster" \
	  "" \
	  "Ports below are the live ones when the stack is up (see 'make ports')."
	@$(MAKE) --no-print-directory ports

# The kind API port is not fixed. Docker can hold a published host port whose
# forwarding is dead — the node still serves the NodePort internally while the
# host side routes nowhere — so rowboat-api-kind.sh falls back to 18081 and
# writes the port it actually chose to .rowboat-kind/ports.env. Hardcoding
# 18080 here sent readers to a dead port and produced connection errors that
# looked like a broken backend rather than a wrong address.
ports:
	@if [ -f .rowboat-kind/ports.env ]; then \
	  . ./.rowboat-kind/ports.env; \
	  printf "  API:      http://localhost:%s (live)\n" "$$OPPULENCE_API_PORT"; \
	  printf "  Devstack: http://localhost:%s (live)\n" "$$OPPULENCE_DEVSTACK_PORT"; \
	else \
	  printf "  API:      http://localhost:18080 (default; not running — may fall back to 18081)\n"; \
	  printf "  Devstack: http://localhost:18090 (default; not running — may fall back to 18091)\n"; \
	fi
	@printf "  rowboat-www: http://localhost:$(OPPULENCE_WWW_PORT)\n"

all: stack

stack:
	$(OPPULENCE_KIND_SCRIPT) up
	$(MAKE) www-up
	$(OPPULENCE_KIND_SCRIPT) desktop

api-up:
	$(OPPULENCE_KIND_SCRIPT) up

desktop:
	$(OPPULENCE_KIND_SCRIPT) desktop

www-up:
	docker build -f clients/apps/web/Dockerfile -t $(OPPULENCE_WWW_IMAGE) .
	docker rm -f $(OPPULENCE_WWW_CONTAINER) >/dev/null 2>&1 || true
	docker run --rm -d --name $(OPPULENCE_WWW_CONTAINER) \
	  --add-host=host.docker.internal:host-gateway \
	  -p $(OPPULENCE_WWW_PORT):8080 \
	  -e OPPULENCE_WWW_PUBLIC_API_BASE_URL=$(OPPULENCE_WWW_PUBLIC_API_BASE_URL) \
	  -e OPPULENCE_WWW_API_PROXY_URL=$(OPPULENCE_WWW_API_PROXY_URL) \
	  -e OPPULENCE_WWW_SESSION_SECRET=$(OPPULENCE_WWW_SESSION_SECRET) \
	  $(OPPULENCE_WWW_IMAGE)
	@printf "rowboat-www: http://localhost:%s\n" "$(OPPULENCE_WWW_PORT)"

www-down:
	-docker rm -f $(OPPULENCE_WWW_CONTAINER) >/dev/null 2>&1 || true

www-smoke:
	scripts/rowboat-www-smoke.sh "$${OPPULENCE_WWW_SMOKE_URL:-http://localhost:$(OPPULENCE_WWW_PORT)}"

www-capture-screenshots:
	cd clients/apps/web && npm run screenshots:capture

product-screenshots: www-capture-screenshots

smoke-desktop:
	$(OPPULENCE_KIND_SCRIPT) desktop-smoke

perf-desktop:
	$(OPPULENCE_KIND_SCRIPT) desktop-perf

perf-desktop-full:
	OPPULENCE_DESKTOP_PERF_TIER=full OPPULENCE_DESKTOP_PERF_INCLUDE_CLOUD=1 $(OPPULENCE_KIND_SCRIPT) desktop-perf

perf-desktop-deep:
	OPPULENCE_DESKTOP_PERF_TIER=deep OPPULENCE_DESKTOP_PERF_INCLUDE_CLOUD=1 $(OPPULENCE_KIND_SCRIPT) desktop-perf

perf-desktop-baseline:
	OPPULENCE_DESKTOP_PERF_UPDATE_BASELINE=1 $(OPPULENCE_KIND_SCRIPT) desktop-perf

perf-desktop-quick:
	OPPULENCE_DESKTOP_PERF_INCLUDE_CLOUD=0 OPPULENCE_DESKTOP_PERF_SKIP_PACKAGE=1 $(OPPULENCE_KIND_SCRIPT) desktop-perf

helm-validate:
	$(OPPULENCE_KIND_SCRIPT) helm-validate

infisical-validate:
	$(OPPULENCE_KIND_SCRIPT) infisical-validate

validate:
	$(OPPULENCE_KIND_SCRIPT) validate

validate-full:
	$(OPPULENCE_KIND_SCRIPT) validate-full

validate-all: validate-full

status:
	$(OPPULENCE_KIND_SCRIPT) status

logs:
	$(OPPULENCE_KIND_SCRIPT) logs

down: www-down
	$(OPPULENCE_KIND_SCRIPT) down

delete-cluster:
	$(OPPULENCE_KIND_SCRIPT) delete-cluster
