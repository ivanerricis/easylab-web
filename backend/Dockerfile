FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# tsconfig.build.json estende tsconfig.json: servono entrambi, altrimenti
# `npm run build` fallisce con TS5058.
COPY tsconfig.json tsconfig.build.json ./
COPY drizzle.config.ts ./
COPY src ./src

RUN npm run build

FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
# tzdata: senza questo pacchetto Alpine non conosce le regole DST dei fusi orari
# nominati (es. Europe/Rome) e Node.js ricade su UTC nonostante TZ sia impostata.
ENV TZ=Europe/Rome

RUN apk add --no-cache postgresql16-client samba-client tzdata su-exec

COPY package*.json ./
RUN npm ci --omit=dev

COPY drizzle ./drizzle
COPY public ./public
COPY migrate.js ./migrate.js
COPY reset-admin-password.js ./reset-admin-password.js
COPY decrypt-backup-archive.js ./decrypt-backup-archive.js
COPY --from=builder /app/dist ./dist

# L'immagine node:24-alpine porta gia' l'utente non privilegiato `node` (uid 1000).
# I file dell'app restano di root e in sola lettura per lui: l'unica cosa che il backend
# scrive sta nei quattro percorsi montati, che l'entrypoint gli assegna all'avvio.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]