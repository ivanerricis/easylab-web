# Backup, restore e migrazione

Cosa contiene un backup, come ripristinarlo e come ricostruire l'installazione su un server nuovo.

## Cosa contiene un backup

Ogni backup produce un archivio `db-backup-YYYYMMDD-HHMMSS.tar.gz`, **cifrato** (AES-256-GCM): aprirlo con `tar` o un altro strumento non mostra nulla di leggibile, solo il ripristino (da interfaccia o da `scripts/restore-db.sh`) lo decifra. Nome ed estensione restano `.tar.gz` come prima. Il contenuto, una volta decifrato:

| Contenuto | Note |
|---|---|
| `dump.sql` | tutti i dati: clienti, report, interventi, utenti |
| `data/email-settings.json` | server SMTP, porta, utente, mittente |
| `data/backup-settings.json` | pianificazione, destinazione NAS, retention |
| `data/company-settings.json` | dati azienda (nome, email, indirizzo, telefono) nell'intestazione dei PDF |
| `data/logo/` | logo del laboratorio usato nei PDF |

**Non** è incluso, di proposito:

- **`data/backup.key`**, la chiave che cifra l'archivio stesso. Includerla vorrebbe dire spedire, nello stesso file copiato anche su una condivisione di rete, sia i dati sia la chiave per leggerli. Va invece **esportata una volta da Impostazioni > Backup** ("Chiave di cifratura dei backup") e conservata altrove (un password manager, per esempio): senza una copia esterna, un disastro che porta via server e disco insieme rende illeggibile anche l'ultimo backup sul NAS.
- **`data/secret.key`**, la chiave che cifra le password SMTP e NAS **dentro** `dump.sql`/`backup-settings.json` — una chiave diversa dalla precedente, dedicata solo a quei due segreti. Conseguenza: ripristinando su una macchina diversa quelle due password non sono più leggibili e vanno reinserite a mano (l'app dice quali).
- **`data/initial-admin-password.txt`**, credenziale in chiaro utile solo al primo avvio: l'app la cancella appena l'amministratore cambia la password generata.
- **`.env`**, che non è scritto dall'applicazione: va ricreato a mano sul server nuovo. Conviene tenerne una copia nel proprio gestore di password.

> I backup nel formato storico `db-dump-YYYYMMDD-HHMMSS.sql` (solo database, mai cifrato) restano elencabili, scaricabili e ripristinabili.

## Restore database

Il ripristino è disponibile da Impostazioni > Backup (solo per utenti amministratore): si può scegliere un backup già presente sul server oppure caricarne uno da file, con l'opzione per svuotare prima lo schema `public`. Richiede di digitare `RESTORE` per confermare, essendo un'operazione irreversibile. Un archivio cifrato con la chiave di *questo* server viene decifrato da solo; se invece proviene da un altro server (vedi [Migrazione su un nuovo server](#migrazione-su-un-nuovo-server)), il dialogo di conferma ha un campo facoltativo per incollare la chiave esportata da lì.

> **Limite di caricamento via web:** Cloudflare impone un tetto di **100 MB per richiesta** sul piano Free, quindi il caricamento di un backup più grande di così fallisce dall'interfaccia web (errore 413 generato da Cloudflare, non dall'app). Scegliere un backup **già presente sul server** non è soggetto al limite, perché non carica nulla. Per un archivio esterno più grande di 100 MB, copialo sulla VM e usa lo script da terminale qui sotto.

In alternativa, da terminale:

```bash
./scripts/restore-db.sh --dump-path /path/to/db-backup-YYYYMMDD-HHMMSS.tar.gz
```

Se non passi il percorso, lo script usa il backup più recente (`.tar.gz` o `.sql`) trovato nella directory configurata in `.env` tramite `BACKUP_HOST_DIR`, oppure in `backups/` se la variabile non è presente. Un archivio cifrato viene decifrato automaticamente dentro il container backend (dove vive `data/backup.key`) prima di essere estratto. Con un archivio ripristina anche le impostazioni e riavvia il backend per farle rileggere.

Opzione distruttiva (svuota prima lo schema `public` nel database target):

```bash
./scripts/restore-db.sh --dump-path /path/to/db-backup.tar.gz --reset-database
```

Se l'archivio proviene da un altro server (chiave locale diversa), aggiungi la chiave esportata da lì:

```bash
./scripts/restore-db.sh --dump-path /path/to/db-backup.tar.gz --backup-key <chiave-esadecimale-a-64-caratteri>
```

## Migrazione su un nuovo server

Procedura per ricostruire l'installazione altrove partendo da un backup: cambio di macchina, guasto del disco, o passaggio a una VM nuova.

**1. Recupera l'archivio *e* la chiave di backup.** L'archivio: dal NAS oppure dalla directory `BACKUP_HOST_DIR` del vecchio server (un file `db-backup-*.tar.gz`). La chiave: quella esportata in precedenza da Impostazioni > Backup sul vecchio server (o da chi la conserva). **Senza quella chiave l'archivio non si decifra e la migrazione si ferma qui** — se il vecchio server è ancora raggiungibile, esportala ora da Impostazioni > Backup prima di procedere.

**2. Installa da zero** seguendo [Installazione su Proxmox VM (prima volta)](DEPLOY.md#installazione-su-proxmox-vm-prima-volta) fino al primo avvio incluso.

**3. Ricrea `.env`.** Non è nel backup. I campi `LAB_*` qui contano poco: sono solo i valori di partenza dei dati azienda, e il ripristino riporta quelli salvati in Impostazioni > Azienda. Le credenziali `POSTGRES_*` **non devono coincidere** con quelle del vecchio server: il dump è generato con `--no-owner --no-privileges` e si ripristina su qualsiasi utente.

**4. Accedi con l'amministratore temporaneo.** Il ripristino da interfaccia richiede una sessione admin, e a questo punto esiste solo l'utente creato al primo avvio:

```bash
docker compose logs backend | grep -A3 "Utente amministratore"
# oppure
docker cp backend:/app/data/initial-admin-password.txt .
```

**5. Ripristina**, da Impostazioni > Backup (caricando l'archivio o dopo averlo copiato in `BACKUP_HOST_DIR`) — incolla la chiave di backup del passo 1 nel campo facoltativo del dialogo di conferma — oppure da terminale con `./scripts/restore-db.sh --backup-key <chiave>`. **Attiva il reset dello schema**: le migrazioni hanno già creato le tabelle al primo avvio e senza reset il dump andrebbe in conflitto. Una volta decifrato con successo, quella chiave diventa quella di questo server: i prossimi backup qui la useranno senza doverla incollare di nuovo.

**6. Rientra con le vecchie credenziali.** Il ripristino sostituisce la tabella utenti, quindi l'amministratore temporaneo del passo 4 non esiste più e l'app forza il logout. Usa un utente del vecchio server.

**7. Reinserisci le due password**, che il pannello Backup elenca in un riquadro giallo:

- Impostazioni > Email > password SMTP
- Impostazioni > Backup > password NAS

L'avviso sparisce da solo quando entrambe tornano leggibili.

Per la stessa ragione — `data/secret.key` non è nel backup — chi aveva la **verifica in due passaggi** attiva se la ritrova disattivata: l'app lo rileva alla fine del ripristino, lo scrive nel messaggio di esito e in una notifica, e da lì si entra con la sola password invece di restare bloccati fuori. Va riattivata da Impostazioni > Sicurezza. Succede solo durante un ripristino, che è un'operazione avviata da un amministratore: se il segreto di un utente smette di decifrarsi in un altro momento, la 2FA resta attiva e si entra con un codice di recupero (vedi [Sicurezza account e accesso](OPERATIONS.md)).

**8. Verifica**: logo presente nei PDF, test connessione email, test connessione NAS, e prossima esecuzione del backup automatico valorizzata.

> Tutto il resto della configurazione — dati azienda, server SMTP, porta, utente, mittente, indirizzo NAS, condivisione, percorso, dominio, pianificazione, logo — viene ripristinato dall'archivio: le due password sono l'unico intervento manuale.
