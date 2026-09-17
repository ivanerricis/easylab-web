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

Sono gli stessi comandi che la CI (`.github/workflows/ci.yml`) esegue a ogni push, insieme alla build delle immagini Docker di produzione. `npm test` non ha bisogno di un database: le chiamate al database (backend) e all'API (frontend) sono simulate. L'SQL vero lo provano i test sul database, a parte (vedi sotto).

- **Frontend**: Vitest + Testing Library su jsdom. I test stanno accanto al file che provano (`*.test.ts(x)`); `src/test/setup.ts` completa jsdom con le API che non ha (matchMedia, ResizeObserver, pointer capture...) e `src/test/render.tsx` monta un componente dentro gli stessi provider di `App.tsx` (tooltip, router, blocco a schermo).
- **Backend**: Vitest + Supertest, con il livello delle query simulato. `app.test.ts` monta l'app intera per verificare l'ordine delle guardie su `/api`; `reportPdf.render.test.ts` usa pdfmake vero per controllare che la ricevuta riempia esattamente un foglio.
- **Backend sul database vero**: i file `*.db.test.ts` eseguono le query di `src/db/queries/` su Postgres. Oggi coprono `listReports` e `listInterventions` (ricerca, filtri, fusi orari, ordinamento, paginazione, join). Servono dove i test simulati non arrivano: un SQL sbagliato con un database finto resta verde. Si lanciano a parte, con lo stack di sviluppo acceso:

  ```bash
  cd backend
  npm run test:db
  ```

  Usano il database `<POSTGRES_DB>_test` **dentro lo stesso container** di sviluppo, con le credenziali del `.env` della radice e la porta 5433. Il database di sviluppo non viene toccato. A ogni esecuzione quello di test viene eliminato, ricreato e migrato con le migrazioni di `backend/drizzle/`, e prima di ogni test le tabelle vengono svuotate. Per usare un altro server: `TEST_DATABASE_URL=postgres://utente:password@host:porta/nome_test npm run test:db`. Il nome del database deve finire con `_test`, altrimenti la suite si rifiuta di partire. I file girano uno alla volta, perché il database è condiviso. Gli helper stanno in `backend/src/test/db/` (`fixtures.ts` crea le righe con i soli campi che interessano al test). In CI girano nel job backend, su un servizio `postgres:16`.
- **Frontend nel browser**: Playwright, per quello che jsdom non sa fare (coordinate del mouse nel calendario, validazione nativa dei form, il giro di login). I test stanno in `frontend/e2e/`, girano sulla build di produzione servita da `vite preview` e simulano l'API dentro il browser (`e2e/support/mockApi.ts`), quindi non serve né il backend né il database:

  ```bash
  cd frontend
  npm run test:e2e
  ```

  In locale usano Edge già installato; per un altro browser `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`, oppure `npx playwright install chromium` e `PLAYWRIGHT_CHANNEL=` vuoto. In CI girano sul Chromium di Playwright, in un job a parte.

> **Su Windows** `npm run format:check` segnala anche file corretti, perché git li consegna con fine riga CRLF mentre `.prettierrc` chiede LF. Il controllo attendibile in locale è `npx prettier --check --end-of-line auto "**/*.{ts,tsx}"`, e `--write --end-of-line auto` per correggere senza toccare i fine riga.
