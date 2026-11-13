# Contribuire

Il codice di easylab-web è **proprietario**: vedi [LICENSE](LICENSE). Non è software aperto e le pull request di estranei non vengono accettate. Si contribuisce **solo su invito del proprietario**.

Per segnalare una vulnerabilità non usare questo flusso: vedi [SECURITY.md](SECURITY.md).

Le regole che seguono valgono per chi è stato invitato.

## Avvio in sviluppo

Prerequisiti, avvio con Docker e comandi di test sono nel [README](README.md).

## Flusso di lavoro

1. Crea un branch da un `main` aggiornato (`git fetch`, poi il branch da `origin/main`).
2. Lavora sul branch e fai commit con messaggi **in inglese**, chiari e brevi.
3. Prima di aprire la pull request lancia, nella cartella del pacchetto che hai toccato (`frontend/` o `backend/`):

   ```bash
   npm run lint
   npm run format:check
   npm run typecheck
   npm test
   ```

   Se hai toccato le query del backend, prova anche `npm run test:db` (vedi il README).

4. Aggiungi una **voce di changelog** per ogni modifica tecnica, in italiano: il testo va in `docs/changelog/AAAA-MM.md` e una riga nell'indice `docs/CHANGELOG.md`. Racconta cosa cambia e soprattutto **perché**, non solo cosa fa il codice.
5. Apri la pull request verso `main`, con titolo e descrizione in inglese: cosa cambia, rischi, verifiche fatte e quelle non fatte.

## Il branch main è protetto

- Non si pusha direttamente su `main`: serve sempre una pull request.
- Le **4 verifiche automatiche** della CI devono passare: Frontend (lint, format, typecheck, test, build), Frontend (browser tests), Backend (lint, format, typecheck, test, build) e Production images (docker compose build). Se una fallisce, correggi con un nuovo commit.
- Il merge avviene solo con **squash**.
- La copertura dei test (Codecov) è informativa: non blocca la pull request.

## Release

Le release le decide e le fa il proprietario. Non serve proporle né prepararle.
