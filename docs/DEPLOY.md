# Deploy e configurazione server

Guida per installare l'app su una VM/CT Proxmox in produzione: primo avvio, dominio pubblico via Cloudflare Tunnel, aggiornamenti, gestione dei container.

Per lo sviluppo locale vedi il [README](../README.md#modalità-1-sviluppo-locale-hot-reload). Per backup/restore vedi [BACKUP.md](BACKUP.md). Per 2FA e reset password vedi [OPERATIONS.md](OPERATIONS.md).

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

	Il file esiste solo finché la password generata non viene sostituita: l'app lo cancella appena l'amministratore la cambia, perché da lì in poi sarebbe solo una credenziale in chiaro, e per giunta scaduta.

	Al primo accesso l'app chiede di sostituire la password generata con una propria, e subito dopo di attivare la verifica in due passaggi (QR da inquadrare con un'app di autenticazione sul telefono, poi otto codici di recupero da conservare): finché non si completano entrambi i passi non apre nessuna pagina. Tieni il telefono a portata di mano. Vedi [OPERATIONS.md](OPERATIONS.md#verifica-in-due-passaggi-2fa). Gli altri utenti si creano da Impostazioni > Utenti; in seguito la propria password si cambia dal badge utente in alto a destra > Cambia password.

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

3. **Da qui in poi i passaggi sono identici alla VM**: clona il repo, configura `.env`, primo avvio, updater — vedi i punti 3-6 di [Installazione su Proxmox VM](#installazione-su-proxmox-vm-prima-volta). Anche [`configure-static-ip.sh`](../scripts/configure-static-ip.sh) funziona invariato nel CT (rileva netplan/NetworkManager/ifupdown allo stesso modo).

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

`--configure-ufw` è opzionale e oggi si limita a mostrare lo stato di `ufw`: con il Cloudflare Tunnel non serve aprire nessuna porta in ingresso, e restano consentite solo quelle già aperte (SSH).

I campi `LAB_*` (nome, email, indirizzo e telefono del laboratorio) sono solo i valori di partenza dei dati azienda: dopo il primo avvio si modificano da Impostazioni > Azienda, e da lì in poi valgono quelli.

Al termine, `edit-env.sh` chiede anche se impostare un **IP statico** per la VM. Se confermi, viene eseguito `scripts/configure-static-ip.sh`, che:
- rileva l'interfaccia di rete e i valori attuali (IP, gateway, DNS) come default;
- fa scegliere il nuovo IP/prefisso (es. `192.168.1.50/24`), gateway e DNS;
- rileva automaticamente se la VM usa netplan, NetworkManager o ifupdown (`/etc/network/interfaces`) e scrive la configurazione corrispondente (con backup del file esistente per ifupdown);
- chiede sempre conferma esplicita prima di applicare la modifica, perché un valore errato interrompe subito la connessione SSH alla VM.

Puoi anche eseguirlo da solo, in qualunque momento:

```bash
./scripts/configure-static-ip.sh
```

## Modalità 2: Condivisione / Server (VM Proxmox)

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

Per un accesso di emergenza dalla LAN, aggiungi temporaneamente `ports: ["80:8080"]` al servizio `frontend` in `docker-compose.yml` e rilancia `docker compose up -d`. Ricordati di rimuoverlo dopo. La porta del container è la 8080, non la 80: su quella nginx ignora l'header `CF-Connecting-IP`, che dalla LAN chiunque potrebbe falsificare per aggirare il limite ai tentativi di login.

### File da conservare

`ops/cloudflared/` contiene `cert.pem` e le credenziali del tunnel: sono **segreti**, esclusi da git, e non finiscono nei backup dell'applicazione. Se perdi la VM, si rigenerano semplicemente rilanciando lo script di installazione.

## Arresto servizi

Per fermare i container della modalità in uso:

```bash
docker compose down
```

Oppure, per la modalità dev:

```bash
docker compose -f docker-compose.dev.yml down
```

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
- **Aggiorna adesso**: applica l'aggiornamento e ricostruisce i container. Per tutta la durata l'app è coperta da un avviso in **ogni** scheda aperta, anche sulle altre postazioni, così nessuno scrive dati mentre girano le migrazioni; a fine aggiornamento le schede si ricaricano da sole con la versione nuova.

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
- **Backup database**: a ogni nuovo backup si eliminano i più vecchi, tenendo il numero impostato in Impostazioni > Backup (14 di default). Vale sia per la cartella sul server sia per le copie sul NAS.
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
| `backend_data` | `/app/data` | chiavi di cifratura (segreti e backup), impostazioni email/backup, dati azienda, logo |
| `backend_logs` | `/app/logs` | log azioni utente |
| *(bind mount)* | `/app/backups` | archivi di backup, in `BACKUP_HOST_DIR` |

Il backend gira come utente non privilegiato `node` (uid 1000), non come root: un difetto
sfruttabile nel container non deve consegnare anche i privilegi di amministratore della
macchina virtuale. Non serve nessun intervento manuale sui permessi — `backend/docker-entrypoint.sh`
parte come root, corregge il proprietario dei quattro percorsi montati (compresi quelli creati
prima di questa modifica, che appartengono a root) e poi cede i privilegi. Vale anche per
`BACKUP_HOST_DIR` e `ops/update/` sull'host, che dopo il primo avvio risultano di uid 1000.

`backend_logs` è un volume proprio perché senza di esso i log starebbero nel layer scrivibile del container, che viene ricreato ad ogni `up --build`: si azzererebbero ad ogni aggiornamento.
