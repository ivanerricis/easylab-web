# easylab-web

Applicazione full stack per la gestione di un laboratorio, composta da:
- frontend React + Vite
- backend Node.js + Express
- database PostgreSQL

Questo README copre solo l'avvio in sviluppo locale. La documentazione operativa completa (deploy, backup, sicurezza) è su **[docs/](https://ivanerricis.github.io/easylab-web/)**:

- [Deploy e configurazione server](docs/DEPLOY.md) — Proxmox (VM/CT), dominio pubblico e Cloudflare Tunnel, aggiornamento, struttura Docker
- [Backup, restore e migrazione](docs/BACKUP.md)
- [Sicurezza account e accesso](docs/OPERATIONS.md) — 2FA, reset password
- [Changelog](docs/CHANGELOG.md) — evoluzione tecnica del codice, cosa è cambiato e perché
- [Backlog](docs/BACKLOG.md) — lavoro rimandato in attesa di essere ripreso

## Prerequisiti

Sviluppo locale:
- Docker con supporto a Docker Compose
- Porte libere: `3000` (backend), `5433` (db), `5173` (frontend)
- Node.js 24 sull'host, solo per lanciare test e controlli fuori dai container (vedi [Test e controlli](#test-e-controlli))

In produzione nessun container pubblica porte sull'host: l'unico ingresso è il Cloudflare Tunnel. Per l'installazione in produzione vedi [docs/DEPLOY.md](docs/DEPLOY.md).

## Sviluppo locale (hot reload)

Usa il compose dedicato allo sviluppo:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Servizi disponibili:
- frontend dev: http://localhost:5173
- backend api: http://localhost:3000/api
- postgres: localhost:5433

Note:
- in questa modalità frontend e backend usano volumi bind per aggiornarsi in tempo reale
- i `node_modules` sono isolati in volumi Docker dedicati
- su Docker Desktop per Windows il watcher a volte non vede le modifiche: se una modifica sembra non avere effetto, prova `docker restart frontend_dev` (o `backend_dev`) prima di cercare altrove

Per fermare i container:

```bash
docker compose -f docker-compose.dev.yml down
```

## Test e controlli

Frontend e backend hanno ciascuno la propria suite (Vitest). Si lanciano dall'host, nella cartella del pacchetto:

```bash
cd frontend   # oppure: cd backend
npm ci
npm test              # tutta la suite, una volta
npm run test:watch    # solo frontend: rilancia i test a ogni modifica
npm run lint
npm run typecheck
npm run format:check
npm run build
```

Sono gli stessi comandi che la CI (`.github/workflows/ci.yml`) esegue a ogni push, insieme alla build delle immagini Docker di produzione. Nessuno dei due pacchetti ha bisogno di un database per i test: le chiamate al database (backend) e all'API (frontend) sono simulate.

- **Frontend**: Vitest + Testing Library su jsdom. I test stanno accanto al file che provano (`*.test.ts(x)`); `src/test/setup.ts` completa jsdom con le API che non ha (matchMedia, ResizeObserver, pointer capture...) e `src/test/render.tsx` monta un componente dentro gli stessi provider di `App.tsx` (tooltip, router, blocco a schermo).
- **Backend**: Vitest + Supertest, con il livello delle query simulato.

> **Su Windows** `npm run format:check` segnala anche file corretti, perché git li consegna con fine riga CRLF mentre `.prettierrc` chiede LF. Il controllo attendibile in locale è `npx prettier --check --end-of-line auto "**/*.{ts,tsx}"`, e `--write --end-of-line auto` per correggere senza toccare i fine riga.
