# API do PTW in a Box (Fastify + postgres). Contexto de build: ptw-server/api.
# Estágios: deps → build (tipos + testes sem banco + dist) → test (bateria com banco, pelo
# compose.test.yaml) → execução (o padrão: só dist, dependências de produção e o contrato).

# ---------- Dependências (com as de desenvolvimento) ----------
FROM node:22.21-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- Build: mesmo portão do desenvolvimento antes de gerar dist ----------
FROM deps AS build
COPY tsconfig.json vitest.config.ts openapi.yaml ./
COPY src ./src
COPY test ./test
COPY scripts ./scripts
ENV PTW_TEST_CACHE=/tmp/vitest
RUN npm run build && npx vitest run --reporter=dot

# ---------- Testes com banco: docker compose -f compose.yaml -f api/compose.test.yaml run --rm api-test ----------
FROM build AS test
RUN apk add --no-cache python3
# O vitest grava arquivos temporários ao lado da configuração: a pasta é do usuário que roda.
RUN chown -R node:node /app
USER node
CMD ["npx", "vitest", "run"]

# ---------- Dependências de produção ----------
FROM node:22.21-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------- Execução ----------
FROM node:22.21-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json openapi.yaml ./
COPY seed ./seed
COPY scripts ./scripts
# Usuário "node" da imagem (uid 1000): nunca root. O sistema de arquivos é só leitura no compose.
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=10 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/v1/health || exit 1
# Limite de memória do serviço: 160 MB (A11).
CMD ["node", "--max-old-space-size=112", "dist/server.js"]
