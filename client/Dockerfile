# syntax=docker/dockerfile:1.7
# ----- Build stage -----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Cache mount on /root/.npm so installs reuse already-downloaded tarballs
# across rebuilds. We use `npm install` (not `npm ci`) because the host
# package-lock.json may have been generated on Windows and miss Linux-only
# optional native deps; `npm install` resolves them on the fly while still
# honoring the lock for everything else.
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund --prefer-offline
COPY . .
# Cache mount on Vite's dep pre-bundle dir so rebuilds reuse pre-bundled deps
# when only application source changes.
RUN --mount=type=cache,target=/app/node_modules/.vite \
    npm run build

# ----- Production stage -----
FROM nginx:1.27-alpine
# Drop the upstream default site config — we ship our own via templates/.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx.conf.template is rendered by docker-entrypoint.d/20-envsubst-on-templates.sh
# at container start. NGINX_ENVSUBST_FILTER (set in compose) limits substitution
# to MCP_-prefixed vars so nginx's own $variables stay intact.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
