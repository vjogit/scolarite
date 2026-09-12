# ── Stage Go sources ─────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS go-base

RUN apk add --no-cache git

WORKDIR /app

COPY back/ ./

# ── Stage Go backend prod ─────────────────────────────────────────────────────
FROM go-base AS backend-prod

ARG VERSION
ARG BUILD_TIME
RUN VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo "dev")}" && \
    BUILD_TIME="${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" && \
    go build -ldflags="-s -w -X main.version=${VERSION} -X main.buildTime=${BUILD_TIME}" -o /scolarite-server ./cmd/serveur

# ── Stage Go backend local (symboles de debug) ────────────────────────────────
FROM go-base AS backend-local

RUN go build -gcflags="all=-N -l" -o /scolarite-server ./cmd/serveur

# ── Stage Delve ───────────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS dlv-builder

RUN go install github.com/go-delve/delve/cmd/dlv@latest

# ── Stage React frontend ──────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY front/package*.json ./
RUN npm ci

COPY front/ ./

# Un seul bundle pour tous les environnements : le front s'adresse à l'origine
# qui le sert (window.location.origin, voir src/services/api.ts et
# src/KeycloakContext.tsx), il n'embarque aucune URL. Realm et identifiant
# client viennent de front/.env, identiques partout.
RUN npm run build

# ── Target nginx ──────────────────────────────────────────────────────────────
FROM alpine:3.22 AS nginx

RUN apk add --no-cache nginx openssl

# UID/GID fixés : le certificat TLS est monté depuis l'hôte (voir plus bas), sa
# clé doit être lisible par CET utilisateur — en prod, `chown 10001 nginx.key`
# (ou mode 0640 avec le groupe 10001) ; un identifiant attribué par adduser
# varierait d'une image à l'autre et la consigne ne pourrait pas le nommer.
RUN addgroup -S -g 10001 scolarite && adduser -S -u 10001 -G scolarite scolarite

COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# nginx.conf n'est plus embarqué : c'est un template (${NGINX_TRUSTED_PROXIES})
# rendu par start-scolarite.sh comme back/cmd/serveur/config.yaml, et monté en
# lecture seule sur ce chemin par infra/run/compose.yaml. Le fichier
# placeholder évite qu'un bind mount fichier-à-fichier ne crée un répertoire
# à la place si le montage venait à manquer.
RUN touch /etc/nginx/nginx.conf

# Le certificat TLS n'est PAS dans l'image : clé privée et certificat sont
# montés en lecture seule sur ce répertoire par infra/run/compose.yaml depuis
# ${SCOLARITE_CONF_DIR}/ssl (mkcert en local, déposé par start-scolarite.sh ;
# le certificat réel en prod). Une image poussée sur un registre ne doit
# porter aucun secret, et la même image sert à tous les environnements.
RUN mkdir -p /etc/nginx/ssl && chown -R scolarite:scolarite /etc/nginx/ssl

RUN chown -R scolarite:scolarite /usr/share/nginx/html /var/log/nginx /var/lib/nginx && \
    mkdir -p /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi && \
    chown -R scolarite:scolarite /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi

USER scolarite
EXPOSE 9021
CMD ["nginx", "-g", "daemon off;"]

# ── Target prod (backend uniquement) ─────────────────────────────────────────
FROM alpine:3.22 AS prod

RUN addgroup -S scolarite && adduser -S scolarite -G scolarite
RUN mkdir -p /opt/scolarite/conf && chown -R scolarite:scolarite /opt/scolarite

COPY --from=backend-prod /scolarite-server /usr/local/bin/scolarite-server
COPY infra/run/build/start.sh /start.sh
RUN chmod +x /start.sh

USER scolarite
EXPOSE 3333
CMD ["/start.sh"]

# ── Target local (backend + Delve) ───────────────────────────────────────────
FROM alpine:3.22 AS local

RUN addgroup -S scolarite && adduser -S scolarite -G scolarite
RUN mkdir -p /opt/scolarite/conf && chown -R scolarite:scolarite /opt/scolarite

COPY --from=backend-local /scolarite-server /usr/local/bin/scolarite-server
COPY --from=dlv-builder /go/bin/dlv /usr/local/bin/dlv
COPY infra/run/build/start-debug.sh /start.sh
RUN chmod +x /start.sh

USER scolarite
EXPOSE 3333 2345
CMD ["/start.sh"]
