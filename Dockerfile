# syntax=docker/dockerfile:1.7
#
# Production image for Humlens Procurement. Targets:
#   runner   the app (default), serves on port 4100
#   migrate  one-off job that applies Prisma migrations, then exits
# docker-compose.selfhost.yml runs migrate before starting the app.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma's query engine needs OpenSSL.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are baked into the browser bundle at build time.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_HUMLENS_COMMERCE_URL
ARG NEXT_PUBLIC_HUMLENS_INVENTORY_URL
ARG NEXT_PUBLIC_HUMLENS_PROCUREMENT_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
  NEXT_PUBLIC_HUMLENS_COMMERCE_URL=$NEXT_PUBLIC_HUMLENS_COMMERCE_URL \
  NEXT_PUBLIC_HUMLENS_INVENTORY_URL=$NEXT_PUBLIC_HUMLENS_INVENTORY_URL \
  NEXT_PUBLIC_HUMLENS_PROCUREMENT_URL=$NEXT_PUBLIC_HUMLENS_PROCUREMENT_URL

# The build needs no database: migrations run in the migrate target instead
# of in `npm run build`. Prisma only wants a well-formed URL to generate.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
  NEXT_OUTPUT=standalone
RUN npx prisma generate && npx next build

FROM deps AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production \
  HOSTNAME=0.0.0.0 \
  PORT=4100
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
