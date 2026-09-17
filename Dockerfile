# syntax=docker/dockerfile:1

# Debian-Basis statt Alpine: better-sqlite3 findet dafür fertige Binärdateien
# und muss nicht bei jedem Build kompiliert werden.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Beim Build wird nichts aus der Datenbank gelesen; der Pfad wird erst zur
# Laufzeit aus DATABASE_PATH gesetzt.
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Liegt auf dem dauerhaften Laufwerk, damit die Daten ein Deployment überleben.
ENV DATABASE_PATH=/data/d2d.db

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs \
 && mkdir -p /data && chown nextjs:nodejs /data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
VOLUME ["/data"]

# Startet als root, übereignet das Laufwerk und wechselt dann auf den
# Nutzer "nextjs" (UID 1001) - siehe docker-entrypoint.sh.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
