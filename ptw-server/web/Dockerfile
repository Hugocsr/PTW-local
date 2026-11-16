# Frontend: compila o protótipo (ptw-mockup-v2) e serve os arquivos estáticos pelo Caddy.
# Contexto de build: ../ptw-mockup-v2 (definido no compose.yaml).

# ---------- Build ----------
FROM node:22.21-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Esquema e exemplo do pacote ptw.modelo/1, no mesmo caminho relativo do repositório (/app/../.claude).
COPY --from=modelo . /.claude/skills/ptw-modelo-de-formulario
ENV VITE_DADOS=api
# Mesmo portão do desenvolvimento: tipos e testes antes de gerar os arquivos.
RUN npx tsc -b && npx vitest run --reporter=dot && npx vite build

# ---------- Execução: só o Caddy e os arquivos gerados ----------
FROM caddy:2.10-alpine
# O binário vem com a capacidade de abrir portas baixas; não precisamos (8080/8443) e
# com cap_drop ALL + no-new-privileges ela impediria o exec.
# /status: volume do coletor de recursos (stats, uid 1002), montado só leitura aqui.
RUN setcap -r /usr/bin/caddy \
 && addgroup -S -g 1001 web && adduser -S -u 1001 -G web web \
 && mkdir -p /data /config && chown web:web /data /config \
 && mkdir /status && chown 1002:1002 /status
COPY --from=build /app/dist /srv
COPY --from=caddyfile Caddyfile /etc/caddy/Caddyfile
USER web
EXPOSE 8080 8443
