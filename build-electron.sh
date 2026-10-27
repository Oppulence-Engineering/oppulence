#!/bin/bash
set -e

# build rowboat-www Next.js app
(cd clients/apps/web && \
    npm install && \
    npm run build)

# build rowboat server
(cd clients/apps/cli && \
    npm install && \
    npm run build)
