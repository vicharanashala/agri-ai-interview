FROM node:20-alpine AS base

# Install dependencies only
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Generate Prisma client
FROM base AS prisma
WORKDIR /app
# Install libssl1.1 for Prisma query engine (Alpine 3.17+ dropped it)
RUN apk add --no-cache \
    libssl1.1 \
    || apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/v3.16/main libssl1.1
COPY --from=deps /app/node_modules ./node_modules
COPY prisma/schema.prisma ./prisma/
RUN npx prisma generate

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY . .
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma

# Build-time env (defaults for Docker)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG BACKEND_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BACKEND_URL=$BACKEND_URL

RUN npm run build

# Runtime image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install libssl1.1 for Prisma query engine (Alpine 3.17+ dropped it)
RUN apk add --no-cache \
    libssl1.1 \
    || apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/v3.16/main libssl1.1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]