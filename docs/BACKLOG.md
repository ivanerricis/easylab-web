# Backlog

Lavori individuati e **rimandati di proposito**: cosa non va, come è stato misurato, quali
strade ci sono. Quando uno viene fatto, la voce si sposta nel [CHANGELOG](CHANGELOG.md) con
la data e il perché, e da qui si toglie.

Fino al 2026-09-11 non c'era un posto unico: le cose da fare stavano nei paragrafi "Ancora da
fare" del CHANGELOG, nel piano della 2FA, nel README e in note fuori dal repository. L'indice
qui sotto le raccoglie; quelle con una sezione propria sono spiegate più in basso.

## Indice

**Interfaccia**
- [Contrasto del testo sulle righe gialle e verdi](#contrasto-del-testo-sulle-righe-e-sugli-eventi-gialli-e-verdi):
  testo bianco su giallo a 1,91:1, serve una scelta fra due strade.
- Colonne ridimensionabili nelle tabelle di Impostazioni (utenti, log, backup, tema): sono le
  ultime tabelle scritte a mano fuori da `EntityTable`. Dal CHANGELOG del 2026-09-08; le schede
  di cliente, collaboratore e tecnico, citate nella stessa voce, sono state coperte il 09-10 e
  il 09-11.
- Proposte dalla revisione dell'interfaccia del 2026-09-16, da decidere se farle (quelle scelte
  subito sono nel CHANGELOG dello stesso giorno):
  - **Password del dispositivo in chiaro.** La lista report ha una colonna Password, e la
    scheda la mostra per intero: chi passa davanti allo schermo al banco la legge. Proposta:
    `••••` con un pulsante per mostrarla o copiarla, in lista e in scheda. Da decidere
    insieme: l'export CSV dei report (Impostazioni → Esportazione) contiene la stessa colonna
    Password ed è scaricabile da qualunque utente autenticato, non solo dall'admin. I dati
    erano già consultabili pagina per pagina, ma l'export li consegna tutti in un file che poi
    gira fuori dall'app. Le strade: togliere la colonna dall'export, oppure riservare l'export
    all'admin (revisione di sicurezza del 2026-09-16).
  - **Azioni rapide nella scheda del report.** Chiudere il report o segnare "Avvisato" oggi
    passa dal dialogo di modifica. Proposta: due pulsanti diretti, e il telefono come link
    `tel:` (ed eventualmente WhatsApp per avvisare il cliente). Il nome del cliente come link
    è già fatto (CHANGELOG del 2026-09-16).
  - **Menu "Colonne" e ordinamento nelle altre tabelle.** Fatti per report, interventi e
    clienti (CHANGELOG del 2026-09-16). Restano fuori le quattro anagrafiche, che hanno poche
    colonne e un server che non le ordina, e le tabelle dentro le schede di cliente,
    collaboratore e tecnico.
  - **Selezione multipla nelle liste.** Per esempio chiudere o stampare più report insieme.
    Priorità bassa: ha senso solo se capita spesso.

- Nome scelto per il dispositivo di una sessione. Oggi l'elenco di Impostazioni → Utenti mostra
  l'etichetta ricavata dallo `User-Agent` ("Chrome su Windows", vedi CHANGELOG del 2026-09-16):
  basta finché i dispositivi di una persona si distinguono fra loro, non se ha due macchine
  uguali (due PC Windows con Chrome), dove le due righe restano identiche. La strada *non* è un
  nome sulla sessione — dura al massimo sette giorni e muore al logout, quindi andrebbe riscritto
  a ogni accesso — ma un'identità di dispositivo: un secondo cookie di lunga durata
  (`__Host-device`, un id casuale) più una tabella `user_device(user_id, device_id, nome)` a cui
  la sessione si collega, così il nome sopravvive ai login. Da tenere presente: il nome può
  darlo solo chi è su quel dispositivo (un amministratore che guarda le sessioni altrui non sa
  quale sia il portatile di chi), e cancellare i cookie fa comparire un dispositivo nuovo senza
  nome. Rimandato il 2026-09-16 dopo averlo valutato: si fa se in pratica due macchine risultano
  indistinguibili.

**Prestazioni**
- Ordinare i report per "Cliente" costa circa 100 ms a pagina (20.000 report), contro i 15-25 ms
  della paginazione semplice o dell'ordine per data. La causa: l'espressione di ordinamento
  (`concat_ws` su nome e cognome del cliente) nasce dal join col cliente e non ha un indice,
  quindi Postgres deve materializzare e ordinare tutte le righe che passano i filtri prima di
  applicare `LIMIT`/`OFFSET` — il costo cresce con l'archivio, non con la pagina. Misurato il 2026-09-17 (`backend/src/db/queries/report.ts`, `customerSortExpr`).
  Nessuna soluzione ancora valutata. Stessa natura, più lieve: la lista report predefinita (solo
  aperti) e il riquadro stati della dashboard contano su `closed` senza indice, quindi scorrono la
  tabella intera (pochi ms oggi su 20.000 report, crescono con l'archivio); un indice parziale
  `report(created_at) WHERE NOT closed` li coprirebbe (revisione del 2026-09-18).
  **L'ordinamento per "Totale" aveva lo stesso costo ed è
  stato tolto lo stesso giorno** (CHANGELOG), non risolto: la colonna resta in tabella, solo non
  più cliccabile per ordinare.
- I dialoghi di creazione (report, intervento) caricano `listDevices()` e `listIssues()` interi
  all'apertura. Oggi sono cataloghi piccoli (pochi KB); il tetto delle 5000 righe li
  troncherebbe senza avviso se crescessero. Il cliente invece è già cercato sul server
  (`lib/customerLookup.ts`, 2026-09-11).
- Nessuna cache per i PDF, e generazione sincrona: il server resta fermo per tutta la durata
  della stampa. Dal 2026-09-15 una ricevuta costa due impaginazioni invece di tre (CHANGELOG):
  circa 260 ms su questa macchina sotto carico, un terzo in meno di prima, costanti con il
  volume. Se le stampe diventassero tante, la strada è spostare pdfmake in un `worker_thread`
  (il server resta libero) più che una cache, perché una ricevuta si stampa di rado due volte
  uguale. Urgenza bassa.

**Qualità**
- Dalla revisione di qualità del 2026-09-18 (il resto è nel CHANGELOG dello stesso giorno):
  - **Il fuso orario cambia `process.env.TZ` per tutto il processo** (`companyManager.applyTimeZone`).
    Il bug del 2026-09-17 ("Date solo giorno un giorno indietro") nasceva da qui, ed è stato curato
    rendendo immune `formatting.ts`, ma la causa è rimasta: oggi convivono il fuso passato come
    parametro (query, PDF) e quello globale implicito (scheduler dei backup, nomi degli archivi,
    `backupState.computeNextRunAt`). Il prossimo formattatore creato all'import ripete il bug. La
    strada: passare il fuso anche a scheduler e nomi dei file, ricavando le parti della data con
    `Intl` come fa `currentMonthKey`, e smettere di toccare `TZ`. Rimandato perché tocca backup e
    scheduler, che vanno riprovati a mano.
  - **Regole di dominio scritte due volte.** "Pagato ⇒ prezzo > 0" sta nello schema zod della POST
    dei report e a mano nella PUT; "chiuso ⇒ collaboratore" a mano in entrambe; per gli interventi
    `superRefine` in creazione e `if` in modifica, con messaggi diversi. Per i report la forma
    giusta sono due CHECK di riga nel database tradotti in `errorHandler`; per gli interventi una
    funzione sola applicata alla riga risultante (corpo + riga esistente). Serve una migration che
    prima verifichi i dati esistenti.
  - **Le cinque liste delle anagrafiche** (`db/queries/{customer,collaborator,technician,device,issue}.ts`)
    hanno lo stesso scheletro di una trentina di righe, e l'ordinamento è incoerente (i difetti per
    data di creazione, gli altri per nome). Candidata a un `listSearchable(table, colonne, ordine)`.
  - **`text-lg!` su circa 40 campi dei dialoghi**, per battere il `text-base md:text-sm` del
    primitivo `Input`. Un campo nuovo che lo dimentica esce più piccolo. Va deciso una volta sola,
    in `CustomDialog` o come variante del primitivo, con una verifica visiva di tutti i dialoghi.
  - **`EntityTable` disegna ogni riga due volte** (tabella e scheda mobile, una delle due nascosta
    via CSS) e senza memo: con "Tutte" (fino a 5000 righe) si sente sulla digitazione nella ricerca
    e sul trascinamento delle colonne. Con 10-50 righe è irrilevante. Attenzione: il ResizeObserver
    di `useResizableColumns` presuppone che la tabella sia sempre montata.
- `LAB_LOGO_TEXT` sta in `.env.example`, in `edit-env.sh` e nei due `docker-compose`, ma nessun
  file del codice la legge: configurazione morta, da togliere o da ricollegare.
- [Test sul database vero, seconda parte](#test-sul-database-vero-seconda-parte): l'infrastruttura
  e i test di `listReports`/`listInterventions` ci sono dal 2026-09-17 (CHANGELOG); restano le
  altre query, i vincoli e le cancellazioni.
- Ricerca del cliente scritto a mano: il server non ignora gli accenti, quindi "Nicolo" non trova
  "Nicolò" (vedi `findCustomerByText`). Scegliendo dai suggerimenti il problema non si pone; la
  soluzione completa è l'estensione `unaccent` di Postgres nella ricerca clienti.

**Sicurezza e messa in produzione**
- **L'accesso d'emergenza dalla LAN non permette il login** (da EL-08, 2026-09-14). Il cookie di
  sessione è `Secure` in produzione (dal 2026-09-15 anche `__Host-`), e il browser scarta un
  cookie `Secure` ricevuto su `http://` da un indirizzo che non sia `localhost`: aprendo
  `http://<ip-della-vm>` come descrive il compose, la pagina di login risponde ma l'accesso non
  resta. Rimedio che funziona già oggi senza toccare nulla: un tunnel SSH dalla postazione,
  `ssh -L 8080:localhost:80 <utente>@<ip-della-vm>` (dopo aver pubblicato `80:8080` come dice il
  compose) e poi `http://localhost:8080`, perché `localhost` per il browser è un'origine
  sicura. Da decidere se documentarlo così o dare alla porta 8080 un cookie non `Secure`.
- 2FA, collaudo a mano prima di considerarla in produzione: attivazione con un'app reale, login
  da telefono, ripristino di un backup con una `secret.key` diversa. Dal CHANGELOG del
  2026-09-08.
- `npm audit` sul backend segnala 4 vulnerabilità moderate, tutte in `drizzle-kit` →
  `@esbuild-kit` → `esbuild` ≤ 0.24.2 (GHSA-67mh-4wv8-2f99). Il bug riguarda il dev server di
  esbuild, e `drizzle-kit` è una devDependency che in produzione non gira, quindi il rischio
  reale è nullo. `npm audit fix --force` non è la soluzione: installerebbe `drizzle-kit`
  0.18.1, cioè una versione più vecchia e incompatibile. Va risolto con un aggiornamento di
  `drizzle-kit` quando la catena `@esbuild-kit` sparirà dalle sue dipendenze. Rilevato
  nell'audit del 2026-09-14.

---

## Contrasto del testo sulle righe e sugli eventi gialli e verdi

*Individuato il 2026-09-11, durante il giro visivo sulle pagine.*

**Il problema.** Le tabelle di report e interventi colorano l'intera riga in base allo stato
(rosso aperto/programmato, giallo in lavorazione, verde chiuso/completato) e ci scrivono sopra
in bianco. Sul rosso va bene; sul giallo il testo bianco si legge a fatica, e sul verde poco
meglio. Stessa cosa, ancora più marcata, sugli eventi del calendario della dashboard. Riguarda
chiunque, non solo chi ha problemi di vista: il giallo con il bianco sopra, al sole o su un
monitor economico, sparisce.

**Misure** (rapporto di contrasto WCAG; il minimo per il testo normale è 4,5:1, per il testo
grande 3:1). Calcolate nel browser dai colori reali, tema chiaro:

| Dove | Rosso | Giallo | Verde |
|---|---|---|---|
| Tabelle, intensità "Media" (quella di default) | 4,77 ✓ | **1,91** ✗ | **3,22** ✗ |
| Tabelle, intensità "Intensa" | 6,42 ✓ | **2,50** ✗ | 4,95 ✓ |
| Calendario della dashboard | **3,81** ✗ | **1,57** ✗ | **2,22** ✗ |

L'intensità "Tenue" non ha il problema: sfondo velato e testo scuro.

**Dove stanno i colori.**
- Tabelle: `frontend/src/index.css`, variabili `--table-row-*` nei blocchi
  `[data-table-row-intensity="default" | "soft" | "strong"]` (e i corrispondenti `.dark`). Il
  colore del testo è **uno solo per intensità** (`--table-row-foreground`), quindi oggi non si
  può dare testo scuro al giallo e bianco al rosso senza aggiungere una variabile.
- Calendario: `frontend/src/pages/calendar/components/interventions-calendar.tsx`,
  `statusEventStyle`, che usa colori Tailwind grezzi (`red-500`, `yellow-400`, `green-500`)
  invece dei token di `index.css`. Andrebbe allineato ai `--table-row-*` in ogni caso, così
  calendario e tabelle cambiano insieme.

**Le due strade.**

1. **Testo scuro sul giallo (e sul verde).** Si aggiunge `--table-row-foreground-yellow` (e
   `-green`) e si usa in `tr[data-status-color="yellow"]`. Il giallo resta quello di oggi, il
   testo passa a quello di pagina (`oklch(0.21 …)`): **9,28:1** sul giallo, **5,50:1** sul
   verde. È la soluzione più semplice e quella che cambia meno l'aspetto. Contro: nella stessa
   tabella convivono righe con testo bianco e righe con testo nero.
2. **Colori più scuri, testo sempre bianco.** Giallo → ambra scura (`amber-700`, **5,03:1**) o
   `yellow-700` (**4,93:1**); verde → `green-700` (**4,95:1**, è il verde di "Intensa"). Testo
   uniforme in tutta la tabella. Contro: il "giallo" diventa arancio-marrone e si distingue meno
   dal rosso, che è proprio la distinzione che il colore deve dare; andrebbe verificato a occhio
   su tutte e tre le intensità e in tema scuro.

**Raccomandazione:** la 1, con il calendario portato sugli stessi token. Tiene i colori
riconoscibili e risolve il contrasto con una variabile in più.

**Come verificare** (a lavoro fatto): misurare il contrasto nel browser leggendo
`getComputedStyle` delle righe `tr[data-status-color]` e degli eventi `.rbc-event`, convertendo
i colori `oklch` in RGB con un canvas (il parsing diretto delle stringhe `oklch` dà numeri
sbagliati). Controllare tutte e tre le intensità, in chiaro e in scuro.

## Test sul database vero, seconda parte

*La prima parte è fatta il 2026-09-17 (CHANGELOG): `npm run test:db`, un database `_test` a parte,
il servizio Postgres in CI e 61 test su `listReports` e `listInterventions`. Istruzioni nel
README, "Test e controlli".*

**Cosa resta scoperto.** Le altre query di `backend/src/db/queries/` girano ancora solo contro il
database finto. Le più utili da coprire, in ordine:

- ~~i vincoli che il codice controlla da sé~~: l'unicità senza maiuscole di dispositivi e difetti
  (compreso "Altro") la garantisce l'indice `lower()` della migration 0031, il controllo a mano
  è stato tolto il 2026-09-18 e `issue.db.test.ts` prova l'indice; restano da coprire gli altri
  vincoli, se ne compariranno;
- **le cancellazioni con chiavi esterne**: cliente, collaboratore, tecnico, dispositivo o difetto
  ancora usati da un report o da un intervento (cosa risponde Postgres, e cosa ne fa la rotta).
  Il caso del report con un tecnico esterno, che prima non si eliminava, è coperto da
  `reportWrite.db.test.ts` dal 2026-09-18;
- **le statistiche della dashboard** (`getReportStats`, `getInterventionStats`): somme per mese
  nel fuso del laboratorio;
- **le liste delle anagrafiche** (clienti, collaboratori, tecnici, dispositivi, difetti): ricerca e
  paginazione, più semplici di report e interventi ma con la stessa forma;
- **sessioni e codici di recupero** (`authManager`), oggi provati con un finto `db` a catena.

Come aggiungerne: un file `*.db.test.ts` accanto alla query, righe create con gli helper di
`backend/src/test/db/fixtures.ts` (da estendere se serve), tabelle già vuote a ogni test.
Quando un test passa al primo colpo, conviene alterare la query di proposito e controllare che
fallisca.
