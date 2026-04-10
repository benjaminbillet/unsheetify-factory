# ── Stage 1: Build client + compile native deps ────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Build tools required to compile better-sqlite3 native addon from source.
# Alpine uses musl libc so prebuilt glibc binaries don't work.
RUN apk add --no-cache python3 make g++

# Copy workspace manifests first for layer-cache efficiency
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all deps (compiles better-sqlite3; Vite devDeps needed for build)
RUN npm ci

# Copy client source and build the React SPA
COPY client/ ./client/
RUN npm run build

# Remove devDependencies so only production deps are copied to the runtime stage
RUN npm prune --omit=dev

# ── Stage 2: Production runtime ────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Copy workspace manifests
COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Copy pre-built, production-only node_modules from build stage.
# better-sqlite3 native binary is already compiled — no build tools needed here.
COPY --from=build /app/node_modules ./node_modules

# Copy server source
COPY server/ ./server/

# Copy pre-built client SPA assets from build stage
COPY --from=build /app/client/dist ./client/dist

# Create data directory for SQLite, set ownership before switching user
RUN mkdir -p /app/data \
    && addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run directly via node (not npm) so the process receives OS signals correctly.
# WORKDIR /app means process.cwd() = /app, so the default DB path
# 'data/kanban.db' resolves to /app/data/kanban.db (the named volume mount).
CMD ["node", "server/index.js"]
