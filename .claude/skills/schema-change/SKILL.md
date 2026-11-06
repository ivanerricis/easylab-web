---
name: schema-change
description: Come si modifica lo schema del database di masso-web (tabella, colonna, vincolo, enum, chiave esterna) - migrazione Drizzle, diagramma delle classi rigenerato nello stesso commit, test sul database vero. Da usare quando si tocca backend/src/db/schema.ts.
---

# Modifica dello schema

Lo schema è in `backend/src/db/schema.ts` (Drizzle). Le migrazioni stanno in `backend/drizzle/` (SQL numerati più `meta/`).

## Passi

1. Modificare `schema.ts`.
2. Generare la migrazione con drizzle-kit (config in `backend/drizzle.config.ts`: schema `./src/db/schema.ts`, uscita `./drizzle`), poi **leggere l'SQL generato**: una colonna `NOT NULL` su una tabella con dati ha bisogno di un valore di default o di un riempimento, altrimenti la migrazione fallisce sulla VM di produzione.
3. Applicarla in sviluppo con `npm run db:migrate` (cartella `backend`).
4. **Aggiornare il diagramma delle classi nello stesso commit della migrazione.** Il file `docs/diagrams/class-diagram.drawio` è **generato**: modificare i blocchi classe/enum di `scripts/dev/generate-class-diagram.py`, rigenerare con `python scripts/dev/generate-class-diagram.py` e committare entrambi. Vale anche per una sola colonna.
5. Guardare il risultato: esportare un PNG (draw.io desktop: `draw.io.exe -x -f png -s 1 -o <png> <drawio>`) e controllare che scatole e linee non si sovrappongano e che le linee siano dritte e non si incrocino. Aprire il PNG sullo schermo dell'utente.
6. Test: `npm test` e anche **`npm run test:db`** in `backend` (test su un database vero, non su mock).
7. Voce di CHANGELOG che cita anche il diagramma (skill `changelog-entry`).

## Convenzioni del diagramma

- PK in blu, FK in rosso, colonne appena aggiunte in verde.
- Attributi derivati come `/nome`; `[1]` = NOT NULL.
- Enumerazioni come `«enumeration»`, valori in inglese; timestamp come `datetime`.
- Testo delle note in italiano, identificatori in inglese.

## Attenzione

- Se l'utente ha modificato a mano il `.drawio` in draw.io, rigenerare cancella le sue modifiche: guardare `git diff` del file e portare le sue modifiche nel generatore (o chiedere) **prima** di sovrascrivere.
- Il generatore non ricostruisce i dati: non rieseguire `scripts/dev/seed-fake-data.sql` (fa `TRUNCATE` delle tabelle) senza chiedere.
- Una migrazione è un rischio per la VM di produzione: avvisare l'utente prima del push (skill `release-flow`, punto 2). Dopo l'aggiornamento il server la applica all'avvio.
- Dopo un cambio dello schema controllare backup e restore: il formato di backup può dipendere dalle colonne (`docs/BACKUP.md`).
