# easylab-web

Applicazione full stack per la gestione di un laboratorio, composta da:
- frontend React + Vite
- backend Node.js + Express
- database PostgreSQL

Questo README è la guida operativa (installazione, backup, aggiornamento). Per l'evoluzione
tecnica del codice — cosa è cambiato e perché — vedi [docs/CHANGELOG.md](docs/CHANGELOG.md).

## Prerequisiti

Sviluppo locale:
- Docker con supporto a Docker Compose
- Porte libere: `80` (frontend shared), `3000` (backend), `5433` (db in dev), `5173` (frontend dev)

Produzione (VM Proxmox): vedi [Installazione su Proxmox VM (prima volta)](#installazione-su-proxmox-vm-prima-volta).

In alternativa, produzione su CT Proxmox: vedi [Installazione su Proxmox CT (LXC, alternativa alla VM)](#installazione-su-proxmox-ct-lxc-alternativa-alla-vm).

## Installazione su Proxmox VM (prima volta)

1. **Crea la VM** su Proxmox: Debian 13 o Ubuntu Server (consigliato Debian 13), rete in bridge sulla LAN, risorse minime indicative 2 vCPU / 4 GB RAM / 20 GB disco.

2. **Installa i prerequisiti sulla VM** (fuori da qualunque container):

	```bash
	sudo apt update
	sudo apt install -y git jq ca-certificates curl
	# Docker Engine + plugin compose (repo ufficiale Docker):
	curl -fsSL https://get.docker.com | sudo sh
	```

3. **Clona il repository** sulla VM, ad es. in `/opt/easylab-web`:

	```bash
	sudo git clone https://github.com/ivanerricis/easylab-web.git /opt/easylab-web
	cd /opt/easylab-web
	```

	Il repository è **pubblico**, quindi basta l'URL HTTPS: non serve alcuna autenticazione (né deploy key SSH né token), sia per il clone iniziale sia per `git fetch`/`git reset` eseguiti da systemd durante gli aggiornamenti.

4. **Configura l'ambiente**:

	```bash
	cp .env.example .env
	./scripts/edit-env.sh --configure-ufw
	```

5. **Configura il dominio pubblico** (Cloudflare Tunnel):

	```bash
	sudo ./scripts/install-tunnel.sh
	```

	Lo script chiede il dominio con cui l'app sarà raggiungibile (es. `easylab.iltuodominio.it`), autorizza l'account Cloudflare, crea il tunnel e il record DNS. Prerequisiti sul lato Cloudflare: vedi [Dominio pubblico e Cloudflare Tunnel](#dominio-pubblico-e-cloudflare-tunnel).

	Rilancia lo stesso script per cambiare dominio in seguito: non serve ricostruire nulla.

6. **Primo avvio**:

	```bash
	docker compose up --build -d
	# oppure:
	./scripts/start-server.sh
	```

	L'app è raggiungibile su `https://<dominio configurato>`. Nessun container pubblica porte sull'host: dalla LAN, via IP, non si entra più.

	Al primissimo avvio viene creato automaticamente un utente amministratore (`admin`) con una password casuale sicura, necessaria per accedere all'app. Per recuperarla:

	```bash
	docker compose logs backend | grep -A3 "Utente amministratore"
	```

	La password viene stampata una sola volta nei log, al momento della creazione. Se te la sei persa (log ruotati, container riavviato dopo, ecc.), è comunque salvata in un file dentro il volume `backend_data`:

	```bash
	docker cp backend:/app/data/initial-admin-password.txt .
	```

	Dopo il primo accesso, cambia subito la password da Impostazioni > Utenti (o dal badge utente in alto a destra) e crea eventuali altri utenti da lì.

7. **Abilita l'aggiornamento da interfaccia web** (opzionale ma consigliato):

	```bash
	sudo ./scripts/install-updater.sh
	```

	Vedi [Aggiornamento applicazione](#aggiornamento-applicazione) per i dettagli.

## Installazione su Proxmox CT (LXC, alternativa alla VM)

In alternativa alla VM, puoi usare un **container LXC (CT)** Proxmox: meno overhead (nessuna virtualizzazione hardware, boot più rapido, meno RAM/disco), ma isolamento più debole (kernel condiviso con l'host) e la necessità di eseguire Docker "annidato" dentro il CT.

1. **Crea il CT** su Proxmox:
	- Template: Debian 13 (consigliato, come per la VM).
	- **Unprivileged**: sì, lascia l'impostazione di default.
	- **Opzioni avanzate → Features**: abilita `nesting=1` e `keyctl=1` (necessari per far girare Docker dentro il CT). Dalla shell del nodo Proxmox:

		```bash
		pct set <CTID> --features nesting=1,keyctl=1
		```

	- Rete in bridge sulla LAN, risorse minime indicative 2 vCPU / 4 GB RAM / 10-15 GB disco (un CT richiede meno disco della VM equivalente perché condivide il kernel dell'host).

2. **Installa i prerequisiti sul CT** (stessi comandi della VM):

	```bash
	sudo apt update
	sudo apt install -y git jq ca-certificates curl
	curl -fsSL https://get.docker.com | sudo sh
	```

	Con `nesting=1,keyctl=1` su un host Proxmox con kernel recente (8.x+), Docker gira senza ulteriori modifiche (storage driver `overlay2`). Se `docker compose up` fallisce con errori di permessi/storage, verifica con `docker info` che il nesting sia effettivamente attivo sul CT.

3. **Da qui in poi i passaggi sono identici alla VM**: clona il repo, configura `.env`, primo avvio, updater — vedi i punti 3-6 di [Installazione su Proxmox VM](#installazione-su-proxmox-vm-prima-volta). Anche [`configure-static-ip.sh`](scripts/configure-static-ip.sh) funziona invariato nel CT (rileva netplan/NetworkManager/ifupdown allo stesso modo).

Nota: se preferisci non annidare Docker nel CT, l'alternativa è eseguire i processi Node/Postgres nativamente nel CT senza Docker — ma è un cambio di architettura più profondo, non supportato dagli script/Dockerfile attuali di questo repo.

## Configurazione ambiente

1. Copia il file di esempio:

```bash
cp .env.example .env
```

2. Aggiorna i valori in `.env` secondo il tuo ambiente.

Per modificare il file in modo interattivo puoi usare:

```bash
./scripts/edit-env.sh --configure-ufw
```

`--configure-ufw` è opzionale e apre le porte 80/3000 con `ufw`, se presente.

Al termine, `edit-env.sh` chiede anche se impostare un **IP statico** per la VM. Se confermi, viene eseguito `scripts/configure-static-ip.sh`, che:
- rileva l'interfaccia di rete e i valori attuali (IP, gateway, DNS) come default;
- fa scegliere il nuovo IP/prefisso (es. `192.168.1.50/24`), gateway e DNS;
- rileva automaticamente se la VM usa netplan, NetworkManager o ifupdown (`/etc/network/interfaces`) e scrive la configurazione corrispondente (con backup del file esistente per ifupdown);
- chiede sempre conferma esplicita prima di applicare la modifica, perché un valore errato interrompe subito la connessione SSH alla VM.

Puoi anche eseguirlo da solo, in qualunque momento:

```bash
./scripts/configure-static-ip.sh
```

## Modalita 1: Sviluppo locale (hot reload)

Usa il compose dedicato allo sviluppo:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Servizi disponibili:
- frontend dev: http://localhost:5173
- backend api: http://localhost:3000/api
- postgres: localhost:5433

Note:
- in questa modalita frontend e backend usano volumi bind per aggiornarsi in tempo reale
- i `node_modules` sono isolati in volumi Docker dedicati

## Modalita 2: Condivisione / Server (VM Proxmox)

Il server di produzione gira su una **VM Proxmox** (Debian/Ubuntu, systemd) con Docker Engine nativo, non su Docker Desktop. Prerequisiti sulla VM (fuori da qualunque container): `git`, `docker` (Docker Engine + plugin `docker compose`), `jq` (usato dallo script di aggiornamento).

Clona il repo sulla VM, configura `.env` (`scripts/edit-env.sh`), poi avvia:

```bash
docker compose up --build -d
```

In alternativa puoi usare lo script dedicato:

```bash
./scripts/start-server.sh
```

Servizio disponibile:
- frontend (nginx), via Cloudflare Tunnel: `https://<dominio configurato>`

Nessun container pubblica porte sull'host: backend e frontend sono raggiungibili solo dalla rete interna di Docker, e l'unico ingresso dall'esterno è il tunnel. Lo script di avvio stampa il dominio configurato.

Comportamento rete:
- il frontend usa path relativi (`/api`, `/assets`)
- nginx inoltra `/api` e `/assets` al backend interno
- il dominio non è scritto da nessuna parte nel codice né nella build: cambiarlo è una modifica di configurazione, non una ricompilazione

Nota sicurezza: la funzione di aggiornamento esegue codice preso da `origin/main` sull'host. È protetta dal login, ma ora che l'app è su internet un repository GitHub compromesso diventa una via d'attacco diretta: tieni protetto l'account GitHub del repository (2FA).

## Dominio pubblico e Cloudflare Tunnel

L'app è pubblicata su internet tramite **Cloudflare Tunnel**: è il demone `cloudflared` (un container dello stack) ad aprire una connessione in uscita verso Cloudflare, quindi **non serve nessun port forward sul router e nessuna porta in ingresso aperta sulla VM**. È anche il motivo della scelta: l'IP pubblico ha già le porte 80/443 inoltrate a un altro servizio, e un tunnel non entra in conflitto con quello.

### Da fare su Cloudflare (una tantum)

1. Registra o trasferisci il dominio, e aggiungilo al tuo account Cloudflare (piano **Free** sufficiente).
2. Imposta i **nameserver del dominio su quelli indicati da Cloudflare**, presso il registrar dove il dominio è registrato. La propagazione richiede da pochi minuti a qualche ora; Cloudflare manda un'email a completamento.
3. Se il dominio aveva già dei record DNS attivi, ricreali in Cloudflare **prima** di cambiare i nameserver, altrimenti i servizi che li usano smettono di rispondere.
4. Scegli il sottodominio da dedicare a EasyLab (es. `easylab.iltuodominio.it`), diverso da quelli già in uso.

Non serve creare a mano né il tunnel né il record DNS: li crea `scripts/install-tunnel.sh`.

**Convivenza con altri sottodomini:** il tunnel rivendica un solo record DNS, quello del sottodominio indicato. Gli altri sottodomini restano record indipendenti e continuano a funzionare come prima — la regola `404` finale nell'ingress del tunnel riguarda solo il traffico che arriva a questo tunnel, non il dominio nel suo insieme. Se il sottodominio scelto esiste già, lo script si ferma e chiede conferma prima di sovrascriverlo.

### Da fare sulla VM

```bash
sudo ./scripts/install-tunnel.sh
```

Lo script chiede il dominio, poi mostra un link di autorizzazione Cloudflare: aprilo in un browser (anche da un altro PC), accedi e seleziona il dominio. Al termine crea il tunnel, scrive `ops/cloudflared/config.yml` e il record DNS. Poi:

```bash
./scripts/start-server.sh
```

### Cambiare dominio in seguito

Rilancia `sudo ./scripts/install-tunnel.sh` e indica il nuovo nome, poi `docker compose up -d`. Nessuna immagine da ricostruire: l'applicazione non conosce il proprio dominio (il frontend usa path relativi e il cookie di sessione non ha attributo `domain`, quindi si adatta da sé all'host che lo serve).

### Se il tunnel non funziona

```bash
docker compose logs -f cloudflared
```

Per un accesso di emergenza dalla LAN, aggiungi temporaneamente `ports: ["80:80"]` al servizio `frontend` in `docker-compose.yml` e rilancia `docker compose up -d`. Ricordati di rimuoverlo dopo.

### File da conservare

`ops/cloudflared/` contiene `cert.pem` e le credenziali del tunnel: sono **segreti**, esclusi da git, e non finiscono nei backup dell'applicazione. Se perdi la VM, si rigenerano semplicemente rilanciando lo script di installazione.

## Arresto servizi

Per fermare i container della modalita in uso:

```bash
docker compose down
```

Oppure, per la modalita dev:

```bash
docker compose -f docker-compose.dev.yml down
```

## Cosa contiene un backup

Ogni backup produce un archivio `db-backup-YYYYMMDD-HHMMSS.tar.gz`:

| Contenuto | Note |
|---|---|
| `dump.sql` | tutti i dati: clienti, report, interventi, utenti |
| `data/email-settings.json` | server SMTP, porta, utente, mittente |
| `data/backup-settings.json` | pianificazione, destinazione NAS, retention |
| `data/logo/` | logo del laboratorio usato nei PDF |

**Non** è incluso, di proposito:

- **`data/secret.key`**, la chiave che cifra le password SMTP e NAS. Includerla significherebbe mettere nello stesso archivio sia i segreti cifrati sia la chiave per aprirli — e quell'archivio viene copiato anche su una condivisione di rete. Conseguenza: ripristinando su una macchina diversa quelle due password non sono più leggibili e vanno reinserite a mano (l'app dice quali).
- **`data/initial-admin-password.txt`**, credenziale in chiaro utile solo al primo avvio.
- **`.env`**, che non è scritto dall'applicazione: va ricreato a mano sul server nuovo. Conviene tenerne una copia nel proprio gestore di password.

> I backup nel formato storico `db-dump-YYYYMMDD-HHMMSS.sql` (solo database) restano elencabili, scaricabili e ripristinabili.

## Restore database

Il ripristino è disponibile da Impostazioni > Backup database (solo per utenti amministratore): si può scegliere un backup già presente sul server oppure caricarne uno da file, con l'opzione per svuotare prima lo schema `public`. Richiede di digitare `RESTORE` per confermare, essendo un'operazione irreversibile.

> **Limite di caricamento via web:** Cloudflare impone un tetto di **100 MB per richiesta** sul piano Free, quindi il caricamento di un backup più grande di così fallisce dall'interfaccia web (errore 413 generato da Cloudflare, non dall'app). Scegliere un backup **già presente sul server** non è soggetto al limite, perché non carica nulla. Per un archivio esterno più grande di 100 MB, copialo sulla VM e usa lo script da terminale qui sotto.

In alternativa, da terminale:

```bash
./scripts/restore-db.sh --dump-path /path/to/db-backup-YYYYMMDD-HHMMSS.tar.gz
```

Se non passi il percorso, lo script usa il backup più recente (`.tar.gz` o `.sql`) trovato nella directory configurata in `.env` tramite `BACKUP_HOST_DIR`, oppure in `backups/` se la variabile non è presente. Con un archivio ripristina anche le impostazioni e riavvia il backend per farle rileggere.

Opzione distruttiva (svuota prima lo schema `public` nel database target):

```bash
./scripts/restore-db.sh --dump-path /path/to/db-backup.tar.gz --reset-database
```

## Migrazione su un nuovo server

Procedura per ricostruire l'installazione altrove partendo da un backup: cambio di macchina, guasto del disco, o passaggio a una VM nuova.

**1. Recupera l'archivio.** Dal NAS oppure dalla directory `BACKUP_HOST_DIR` del vecchio server. Serve un file `db-backup-*.tar.gz`.

**2. Installa da zero** seguendo [Installazione su Proxmox VM (prima volta)](#installazione-su-proxmox-vm-prima-volta) fino al primo avvio incluso.

**3. Ricrea `.env`.** Non è nel backup. Conta soprattutto per i campi `LAB_*` (nome, email, indirizzo, telefono del laboratorio), che compaiono nell'intestazione di ogni PDF. Le credenziali `POSTGRES_*` **non devono coincidere** con quelle del vecchio server: il dump è generato con `--no-owner --no-privileges` e si ripristina su qualsiasi utente.

**4. Accedi con l'amministratore temporaneo.** Il ripristino da interfaccia richiede una sessione admin, e a questo punto esiste solo l'utente creato al primo avvio:

```bash
docker compose logs backend | grep -A3 "Utente amministratore"
# oppure
docker cp backend:/app/data/initial-admin-password.txt .
```

**5. Ripristina**, da Impostazioni > Backup database (caricando l'archivio o dopo averlo copiato in `BACKUP_HOST_DIR`), oppure da terminale con `./scripts/restore-db.sh`. **Attiva il reset dello schema**: le migrazioni hanno già creato le tabelle al primo avvio e senza reset il dump andrebbe in conflitto.

**6. Rientra con le vecchie credenziali.** Il ripristino sostituisce la tabella utenti, quindi l'amministratore temporaneo del passo 4 non esiste più e l'app forza il logout. Usa un utente del vecchio server.

**7. Reinserisci le due password**, che il pannello Backup elenca in un riquadro giallo:

- Impostazioni > Email > password SMTP
- Impostazioni > Backup > password NAS

L'avviso sparisce da solo quando entrambe tornano leggibili.

Per la stessa ragione — `data/secret.key` non è nel backup — chi aveva la **verifica in due passaggi** attiva se la ritrova disattivata: l'app lo rileva al primo accesso, lo annuncia con una notifica e lascia entrare con la sola password invece di bloccare fuori tutti. Va riattivata da Impostazioni > Sicurezza.

**8. Verifica**: logo presente nei PDF, test connessione email, test connessione NAS, e prossima esecuzione del backup automatico valorizzata.

> Tutto il resto della configurazione — server SMTP, porta, utente, mittente, indirizzo NAS, condivisione, percorso, dominio, pianificazione, logo — viene ripristinato dall'archivio: le due password sono l'unico intervento manuale.

## Verifica in due passaggi (2FA)

Ogni utente può attivarla per sé da **Impostazioni > Sicurezza**: da quel momento, dopo la password, l'accesso chiede un codice a 6 cifre generato da un'app di autenticazione sul telefono (Google Authenticator, Aegis, 1Password o equivalente). Serve perché l'app risponde su un dominio pubblico: il limitatore dei tentativi ferma chi tira a indovinare, non chi la password ce l'ha già.

**Attivazione.** Impostazioni > Sicurezza > Attiva: si conferma la propria password, si inquadra il QR (o si copia il codice mostrato accanto, per chi lo inserisce a mano), e si digita il codice che l'app genera. Alla fine compaiono **otto codici di recupero**, mostrati una volta sola: vanno stampati o salvati in un posto sicuro **diverso dal telefono**, perché servono proprio quando il telefono non c'è. In tabella ne resta solo l'hash, quindi nessuno — amministratore incluso — può rimostrarli.

**Se perdi il telefono.** Al login, "Usa un codice di recupero" e si inserisce uno degli otto: vale una volta sola, e conviene rigenerare il blocco (Impostazioni > Sicurezza > Rigenera codici di recupero) appena si torna operativi. Finiti anche quelli, un amministratore sblocca l'account da **Impostazioni > Utenti > Disattiva 2FA**; l'operazione compare nel registro azioni e non gli mostra mai il segreto.

**Se a restare fuori è l'unico amministratore**, l'unica via è la riga di comando sulla macchina: vedi [Reset password utente](#reset-password-utente) con `--reset-2fa`.

> **Il segreto è cifrato con `data/secret.key`, che non finisce nei backup.** Dopo un ripristino su una macchina diversa i segreti non sono più leggibili: l'app se ne accorge da sola, disattiva la 2FA degli utenti interessati invece di lasciarli fuori, e lo annuncia con una notifica. Va semplicemente riattivata dopo il primo accesso.

## Reset password utente

Se un utente perde la password e non riesce più ad accedere (tipicamente: unico utente rimasto, quindi nessun altro può rigenerargliela da Impostazioni > Utenti), usa lo script dedicato per rigenerarla direttamente sul database, senza toccare il resto dei dati.

```bash
./scripts/reset-admin-password.sh
```

Per default agisce sull'utente `admin`; per un altro utente passa `--username nomeutente`. Lo script stampa una sola volta la nuova password generata casualmente: al primo accesso verrà richiesto di impostarne una propria, ed eventuali sessioni attive di quell'utente vengono disconnesse.

La verifica in due passaggi **resta attiva**: la nuova password da sola non basterà ad accedere. Reimpostare una password non è una buona ragione per togliere anche il secondo fattore, e farlo di default significherebbe che chi ruba una password sa già come disinnescarlo. Quando anche la 2FA è irraggiungibile — telefono perso, codici di recupero finiti e nessun altro amministratore che possa sbloccare l'account — aggiungi il flag:

```bash
./scripts/reset-admin-password.sh --reset-2fa
```

Disattiva il secondo fattore e cancella i codici di recupero di quell'utente, che potrà riattivarlo dalle impostazioni dopo l'accesso.

## Aggiornamento applicazione

Sulla VM Proxmox, la pagina **Impostazioni > Aggiornamenti** permette di verificare e applicare gli aggiornamenti (`git fetch`/`reset --hard origin/main` + rebuild Docker) direttamente dall'interfaccia web, senza accesso SSH.

Il backend gira in un container senza accesso a `git`/Docker (scelta di sicurezza): quando si clicca "Aggiorna adesso", il backend scrive solo un file trigger in una cartella condivisa (`ops/update/`); sull'host, un **systemd path unit** osserva quel file ed esegue realmente l'aggiornamento. Un timer periodico (ogni 30 minuti) controlla in background se è disponibile un nuovo commit su `origin/main`.

**Setup una tantum sulla VM** (dopo il primo `docker compose up --build -d`):

```bash
sudo ./scripts/install-updater.sh
```

Lo script installa ed abilita le unit systemd in `ops/systemd/` (`easylab-update.path`, `easylab-check-updates.path`, `easylab-check-updates.timer`), installa `jq` se mancante e imposta i permessi sulla cartella `ops/update/`.

Da quel momento, in Impostazioni > Aggiornamenti sono disponibili:
- **Verifica aggiornamenti**: esegue un `git fetch` e mostra se è disponibile un nuovo commit, senza modificare nulla.
- **Aggiorna adesso**: applica l'aggiornamento e ricostruisce i container. L'app risulta brevemente irraggiungibile durante il rebuild; la pagina ripropone lo stato non appena il backend torna online.

> **Nota (aggiornamento del 07/09/2026):** questo aggiornamento cambia il modo in cui le
> sessioni sono salvate nel database (ora solo l'hash del token, mai il token stesso), quindi
> le sessioni aperte vengono invalidate: al primo accesso successivo tutti dovranno rifare il
> login una volta sola. Le password non cambiano.

**Rollback manuale** (nessun rollback automatico in caso di crash post-deploy): sulla VM,

```bash
cd /percorso/del/repo
git log --oneline -5        # individua il commit precedente funzionante
git reset --hard <sha>
docker compose up --build -d
```

Log dettagliati dell'ultima esecuzione: `journalctl -u easylab-update.service` (aggiornamento) o `journalctl -u easylab-check-updates.service` (verifica).

Ogni aggiornamento esegue anche `docker builder prune -f --filter until=24h`, per evitare che la cache di build si accumuli indefinitamente sulla VM ad ogni rebuild.

## Spazio su disco

Alcuni accorgimenti per limitare lo spazio occupato su una VM di produzione a lungo termine:

- **Immagini**: backend e frontend usano Dockerfile multi-stage su basi Alpine (più leggere delle equivalenti Debian).
- **Cache di build**: `scripts/update-server.sh` esegue `docker builder prune` ad ogni aggiornamento (mantiene solo la cache delle ultime 24h, utile per rebuild ravvicinati).
- **Backup database**: i dump creati da Impostazioni > Backup vengono conservati automaticamente solo per gli ultimi 14, i più vecchi vengono eliminati ad ogni nuovo dump.
- **Log dei container**: `docker-compose.yml` limita i log di ogni servizio a 3 file da 10 MB (driver `json-file`), per evitare crescita illimitata su container sempre attivi (`restart: always`).

## Struttura configurazioni Docker

- `docker-compose.yml`: configurazione shared/server
- `docker-compose.dev.yml`: configurazione sviluppo locale
- `backend/Dockerfile`: backend produzione
- `backend/Dockerfile.dev`: backend sviluppo
- `frontend/Dockerfile`: frontend produzione (build statico + nginx)
- `frontend/Dockerfile.dev`: frontend sviluppo (vite)
- `frontend/nginx.conf`: reverse proxy frontend verso backend
- `ops/systemd/`: unit systemd (template) usate da `scripts/install-updater.sh` sulla VM Proxmox per l'aggiornamento da UI
- `ops/update/`: cartella condivisa (bind mount, non versionata) tra backend e host per il meccanismo di aggiornamento

### Volumi persistenti (produzione)

Sopravvivono a `docker compose down` e agli aggiornamenti; si perdono solo con `down -v` o con la macchina.

| Volume | Percorso | Contenuto |
|---|---|---|
| `postgres_data` | `/var/lib/postgresql/data` | database |
| `backend_data` | `/app/data` | chiave di cifratura, impostazioni email/backup, logo |
| `backend_logs` | `/app/logs` | log azioni utente |
| *(bind mount)* | `/app/backups` | archivi di backup, in `BACKUP_HOST_DIR` |

Il backend gira come utente non privilegiato `node` (uid 1000), non come root: un difetto
sfruttabile nel container non deve consegnare anche i privilegi di amministratore della
macchina virtuale. Non serve nessun intervento manuale sui permessi — `backend/docker-entrypoint.sh`
parte come root, corregge il proprietario dei quattro percorsi montati (compresi quelli creati
prima di questa modifica, che appartengono a root) e poi cede i privilegi. Vale anche per
`BACKUP_HOST_DIR` e `ops/update/` sull'host, che dopo il primo avvio risultano di uid 1000.

`backend_logs` è un volume proprio perché senza di esso i log starebbero nel layer scrivibile del container, che viene ricreato ad ogni `up --build`: si azzererebbero ad ogni aggiornamento.