FROM node:24-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ARG VITE_LOGO_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LOGO_URL=$VITE_LOGO_URL

RUN npm run build

# Minore fissata, non `nginx:alpine`: quel tag non indica alcuna versione, quindi una
# ricostruzione da zero (VM nuova, immagini rimosse) poteva portare un nginx maggiore
# diverso da quello su cui gli header di sicurezza e le regole di cache sono stati
# verificati. Dentro 1.31 le patch continuano ad arrivare; a cambiare riga si decide.
FROM nginx:1.31-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Fuori da conf.d di proposito: nginx include da sé ogni conf.d/*.conf nel blocco http, e
# questo file va incluso solo dove serve, non anche come configurazione a sé stante.
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY document-csp.conf /etc/nginx/document-csp.conf

# 80 per cloudflared, 8080 solo per l'accesso d'emergenza dalla LAN (vedi nginx.conf).
EXPOSE 80 8080