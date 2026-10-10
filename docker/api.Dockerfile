# syntax=docker/dockerfile:1.7
# API gRPC. Contexte de build : la RACINE du dépôt (docker compose s'en charge).
# Cibles : `migrate` (migrations + outils d'administration), `runtime` (image finale, minimale).

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- base : Node + pnpm (version lue dans package.json) ----------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# ---------- build : installation complète, génération du code (buf, Prisma), bundle tsup ----------
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @center/api build
# Moteur de migration Prisma téléchargé au BUILD (le runtime n'a pas besoin d'Internet)
RUN cd apps/api && ./node_modules/.bin/prisma --version
# Dépendances de production seules (sans devDependencies ni postinstall : prisma/buf sont des outils de build)
RUN pnpm --filter @center/api deploy --prod --legacy --ignore-scripts /out

# ---------- migrate : applique les migrations ; sert aussi à `pnpm admin:create` ----------
FROM build AS migrate
RUN test -d apps/api/prisma/migrations || { echo "ERREUR : apps/api/prisma/migrations est absent. Lancez 'pnpm db:migrate' en local et COMMITEZ le dossier prisma/migrations." >&2; exit 1; }
WORKDIR /repo/apps/api
ENV NODE_ENV=production
USER node
# Binaires appelés directement : pas de pnpm/corepack au runtime (pas d'accès Internet requis)
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# ---------- runtime : bundle + dépendances de production, utilisateur non root ----------
FROM ${NODE_IMAGE} AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=50051
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 50051
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "require('net').connect(+process.env.API_PORT||50051,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main.js"]
