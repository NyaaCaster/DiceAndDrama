# syntax=docker/dockerfile:1.7
# ----- Build stage -----
FROM node:20-alpine AS builder
WORKDIR /app
# better-sqlite3 needs a native build toolchain on alpine.
RUN apk add --no-cache python3 make g++
COPY package*.json tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund --prefer-offline
COPY src ./src
RUN npm run build

# Now produce a slim production node_modules tree (no devDeps) and strip
# documentation/source-map cruft so the runtime image stays small.
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --no-audit --no-fund --prefer-offline \
 && find node_modules -type f \( -name '*.md' -o -name '*.markdown' \) -delete \
 && find node_modules -type f \( -name 'LICENSE*' -o -name 'CHANGELOG*' -o -name 'AUTHORS*' -o -name 'CONTRIBUTORS*' \) -delete \
 && find node_modules -type f \( -name '*.d.ts' -o -name '*.map' \) -delete \
 && find node_modules -type d -name 'test' -exec rm -rf {} + 2>/dev/null || true \
 && find node_modules -type d -name '__tests__' -exec rm -rf {} + 2>/dev/null || true \
 && find node_modules -type d -name 'docs' -exec rm -rf {} + 2>/dev/null || true \
 && find node_modules -type d -name 'example' -exec rm -rf {} + 2>/dev/null || true \
 && find node_modules -type d -name 'examples' -exec rm -rf {} + 2>/dev/null || true

# ----- Runtime stage -----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5105
ENV CLOUDSAVE_DB_PATH=/app/data/cloudsave.sqlite

# Run as the non-root `node` user shipped by the base image. Pre-create
# /app/data with the right ownership so the sqlite file can be created at
# boot without root.
RUN mkdir -p /app/data && chown -R node:node /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 5105
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5105/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
