# DigiPuls — the application image. infra/README.md explains the stack.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    EVIDENCE_DIR=/data/evidence

# Prisma's schema engine (used by `prisma migrate deploy`) needs OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a code-only change reuses this layer. The schema has
# to be present because installing runs `prisma generate`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public

# Evidence files live on a volume mounted here. Created and owned by the app
# user in the image, so a fresh named volume takes that ownership.
RUN mkdir -p /data/evidence && chown -R node:node /data /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run on start, before the app accepts requests. deploy.sh takes a
# database dump before it replaces the running container.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/app.js"]
