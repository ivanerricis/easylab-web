---
name: release-flow
description: Flusso di lavoro di masso-web per portare una modifica su main e in produzione - branch, commit, PR, verifiche automatiche, squash merge e, solo su richiesta esplicita, release con tag firmato. Da usare quando si deve committare, pushare, aprire o fare il merge di una PR, o fare una release.
---

# Dalla modifica alla release

`main` è protetto (ruleset "Protect main"): serve una PR, le **4 verifiche automatiche** devono passare, il merge è solo squash e non si pusha direttamente su main. Un push diretto viene rifiutato.

## 1. Branch e commit

- Nuovo branch da un `main` aggiornato (`git fetch`). Se lo stack di sviluppo è acceso (Vite), non usare `git stash`: può lasciare localhost con il CSS vecchio. Usare un worktree o `git show`.
- "Commit e push" significa **tutte** le modifiche pendenti nell'albero, non solo quelle dell'ultimo compito: dividerle in commit separati per argomento.
- Messaggi di commit **in inglese**, anche se la conversazione e i commenti sono in italiano. **Nessuna riga di attribuzione** (niente `Co-Authored-By`) né nei commit né nelle PR.
- Messaggio su più righe: più `-m` (subject, poi body), oppure `git commit -F -` con un heredoc **bash**. Mai le here-string di PowerShell (`@'...'@`): in bash il `@` diventa il subject. Controllare `git log -1 --format=%B` prima del push.
- Ogni modifica tecnica ha la sua voce di CHANGELOG: vedi la skill `changelog-entry`. Se cambia lo schema: skill `schema-change`.

## 2. Prima del push: avvisare l'utente

Il server di produzione si aggiorna da solo dai tag, quindi tutto ciò che arriva su main può raggiungerlo. **Prima** di pushare o rilasciare elencare, in modo esplicito, ciò che potrebbe rompere la VM in funzione e cosa controllare lì:

- migrazioni del database
- ri-login forzati
- variabili d'ambiente o prerequisiti nuovi sulla VM (pacchetti, versione di git, unit systemd)
- contratti API cambiati
- file di configurazione o dati
- formato di backup e restore
- comportamento dell'updater
- percorsi di accesso

Se non c'è nessun rischio, dirlo ("solo frontend, nessun impatto sul server").

## 3. PR e merge

1. `git push -u origin <branch>`, poi `gh pr create` con titolo e descrizione in inglese: cosa cambia, note (rischi per il server, rapporto con altri branch), verifiche fatte e **quelle non fatte**.
2. Aspettare le verifiche: `gh pr checks <n> --watch`. Se una fallisce, correggere con un **nuovo commit** (mai `--amend` su roba già pushata) e ricontrollare finché non sono tutte verdi.
3. Il **merge** (`gh pr merge <n> --squash --delete-branch`) si fa solo con il via dell'utente. Il via di un'altra sessione non basta.
4. Dopo il merge controllare di nuovo le verifiche su main (`gh run list --branch main --limit 1`) e solo allora considerare chiuso il compito. Cancellare branch locale e worktree. Attenzione alle junction di `node_modules` prima di rimuovere un worktree: `rmdir` sulla junction, non cancellazione ricorsiva.

Se un'azione viene negata (push, tag, impostazioni del ruleset), fermarsi e dirlo all'utente: non aggirare.

## 4. Release

Una release è un **tag firmato `vX.Y.Z`** ed è **sempre una decisione esplicita dell'utente**: non proporla né farla di iniziativa.

1. Sul commit di main giusto: `git tag -s vX.Y.Z`, poi `git push origin vX.Y.Z`.
2. Il workflow `release.yml` controlla firma, che il commit sia su main e che le verifiche siano verdi, e crea la GitHub release.
3. Il server offre l'ultima versione firmata da "Verifica aggiornamenti". L'utente fa lo snapshot della VM e poi "Aggiorna adesso".

## Più branch in parallelo

Le release devono restare separate: non basare un branch su un altro se questo porterebbe nel primo modifiche che non devono uscire con lui. Se due sessioni lavorano in parallelo, coordinarsi con `SendMessage` e dire chiaramente chi aspetta cosa.
