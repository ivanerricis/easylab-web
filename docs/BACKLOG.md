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
- [Eventi del calendario con fondo tenue e striscia di stato](#eventi-del-calendario-con-fondo-tenue-e-striscia-di-stato):
  provato e annullato il 2026-09-25; qui la richiesta originale e cosa è emerso.
- [Notifiche di sistema visibili e chiudibili da tutti](#notifiche-di-sistema-visibili-e-chiudibili-da-tutti):
  un utente non admin legge gli avvisi di sicurezza e dei backup e può chiuderli per tutti.
- [Rimandati dalla revisione visiva del 2026-09-25](#rimandati-dalla-revisione-visiva-del-2026-09-25):
  aree da toccare sotto i 44px, colonna Azioni fuori vista nelle tabelle larghe, alcune
  proposte non ancora decise.
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

- Esportazioni CSV aperte in Excel: telefoni e "Creato il". Da quando il separatore è il punto e
  virgola (CHANGELOG del 2026-09-22) le colonne si vedono, e con loro due letture di Excel che
  prima restavano nascoste nella colonna A. Verificate il 2026-09-22 con Excel 16 in italiano:
  - I telefoni scritti tutti attaccati diventano numeri: il fisso `0612345678` perde lo zero
    (`612345678`), e con la colonna stretta un cellulare si legge `3,33E+09`. Quelli con uno
    spazio (`06 12345678`) restano testo. Il CSV non ha un modo pulito per dire "questo è
    testo": `="0612345678"` funziona, ma è una formula, proprio quello che `neutralizeFormula`
    in `csv.ts` impedisce di scrivere. La soluzione completa è esportare in `.xlsx`, con celle
    di tipo testo.
  - "Creato il" esce come testo ISO in UTC (`2026-09-21T22:30:00.000Z` per un report delle 00:30
    del 22): per Excel non è una data, e l'ora non è quella del laboratorio. Scritta nel fuso
    del laboratorio come `2026-09-22 00:30`, Excel la legge come data vera. La data
    dell'intervento (`2026-09-22`) e gli orari (`10:30:00`) sono già letti come date e ore.

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
  - **Le cinque liste delle anagrafiche** (`db/queries/{customer,collaborator,technician,device,issue}.ts`)
    hanno lo stesso scheletro di una trentina di righe, e l'ordinamento è incoerente (i difetti per
    data di creazione, gli altri per nome). Candidata a un `listSearchable(table, colonne, ordine)`.
- Rimasti aperti dalla revisione di qualità del 2026-09-22 (finora solo nel CHANGELOG di quel
  giorno). I tre limitatori a finestra (login, 2FA, invio email) sono stati unificati il
  2026-09-23 — vedi CHANGELOG — restano:
  - `TechnicianPage` non riusa l'infrastruttura delle schede di cliente e collaboratore
    (`useReportsAndInterventionsOf`, `reports-interventions-tabs`), e ha un filtro predefinito
    diverso dalle pagine gemelle.
  - Cinque dialoghi di creazione quasi identici.
  - Tre barre dei filtri copiate a mano.
- Dalla revisione di qualità del 2026-09-23 (il resto è nel CHANGELOG dello stesso giorno):
  - **Colonne delle tabelle** (proposta "Q6", rimandata). Cinque file di colonne
    (`collaborator-columns`, `collaborator-detail-columns`, `device-columns`, `issue-columns`,
    `technician-columns`) riscrivono a mano il tipo di `EntityColumn` e perdono `sortKey` e
    `hideable`, cioè proprio quello che serve al menu "Colonne" nelle anagrafiche (vedi
    Interfaccia). E le stesse colonne dei report sono copiate in quattro array (lista, schede di
    cliente, collaboratore e tecnico), quelle degli interventi in tre. La strada: definizioni per
    chiave in `report-columns.tsx` e `intervention-columns.tsx`, da cui ogni tabella sceglie.
  - **Le etichette del registro azioni stanno in una tabella di percorsi separata dalle
    rotte** (`userActionLogger.ts`), da tenere allineata a mano: si era già disallineata
    (l'export della chiave, corretto). La strada per unificarla resta un middleware
    `auditAs("...")` dichiarato da ogni rotta, rimandata: sono solo 13 voci su 67 rotte, e non
    si sono disallineate di nuovo dopo la correzione. Il buco che contava — **export CSV e
    resoconti PDF invisibili nel registro**, compreso l'export dei report con la colonna
    Password (vedi "Password del dispositivo in chiaro" in Interfaccia) — è stato colmato il
    2026-09-23 con sette voci dedicate, senza il rifacimento generale.
  - **Il giorno "AAAA-MM-GG" nel fuso del laboratorio è ricostruito a mano** in
    `backupState.ts` (l'altra copia, in `routes/interventions.ts`, è sparita il 2026-09-23
    insieme al ripiego che la usava, vedi CHANGELOG). Un `localDayKey(date, timeZone)` accanto a
    `currentMonthKey`, da fare insieme alla voce `process.env.TZ` qui sopra.
  - **Le cinque preferenze d'aspetto** (accento, intensità, raggio, densità, dimensione del
    testo) hanno ciascuna le sue `getStored*`/`setStored*`/`apply*` in `lib/theme.ts`, quindici
    funzioni che cambiano solo per chiave e attributo, più cinque handler uguali in
    `themeSettingsSection.tsx`. Candidata a una mappa unica; rimandata perché è codice stabile
    che funziona.
  - Piccola: il clic fuori da `CustomDialog` non ha un test automatico, perché jsdom non simula
    un vero clic fuori da un dialogo Radix (verificato a mano nel browser, vedi CHANGELOG del
    2026-09-23).
- Dagli aggiornamenti delle dipendenze del 2026-09-25 (vedi CHANGELOG dello stesso giorno):
  - **`backupKey.test.ts` è instabile.** Il test "genera una chiave al primo utilizzo e la
    persiste su disco" legge e scrive il vero `data/backup.key`, che altri file di test creano e
    cancellano in parallelo: ogni tanto trova la chiave di un altro test e il confronto dei
    `Buffer` fallisce (è successo nella CI della pull request #11, rilanciata e passata). Gli
    altri test dello stesso file usano già `node:fs` finto proprio per questo. La strada: lo
    stesso `fs` finto anche qui, oppure un percorso della chiave configurabile e diverso per ogni
    file di test.
  - **jsdom 30.1 rompe i menu di Radix nei test.** La pull request #13 (gruppo delle dipendenze
    del frontend) lo porta da 30.0.1 a 30.1.0, e con quella versione select e dropdown di Radix
    non si aprono più in jsdom: 12 test falliti in `ReportsPage`, `CustomerPage` e `layout`, nessun
    difetto dell'app. Gli altri sei aggiornamenti del gruppo sono minori e passano. La strada:
    escludere `jsdom` dal gruppo in `.github/dependabot.yml` (come già per le versioni maggiori),
    unire il resto, e capire a parte cosa è cambiato nella 30.1 (eventi del puntatore o
    `hasPointerCapture`, che Radix usa per aprire i menu).
  - **Il suggerimento del cliente non compariva su CI nei test dei dialoghi a passi** (2026-09-24),
    mentre in locale sì, anche ripetendo il test, e nel browser vero pure. Un'attesa più lunga non
    è servita. Aggirato facendo scrivere il cliente a mano in quei due test; la causa non è
    chiarita. Da guardare insieme alla voce su jsdom qui sopra: stesso ambiente di test, e CI
    installa da `package-lock.json` le stesse versioni del locale, quindi la differenza è altrove
    (Linux, tempi, ordine dei file).
- [Test sul database vero, seconda parte](#test-sul-database-vero-seconda-parte): fatta per intero
  il 2026-09-21, tranne la 2FA di `authManager`, ancora provata solo con un `db` finto.

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

## Eventi del calendario con fondo tenue e striscia di stato

*Provato il 2026-09-25 e annullato su richiesta, senza commit: per ora gli eventi restano come
sono. Se si riprende, questa è la richiesta di partenza, così come era stata scritta.*

> Nella dashboard di masso-web (frontend/src/pages/calendar/) gli eventi del calendario hanno colori
> pieni e saturi: blocchi rosso/giallo/verde con testo bianco. Su telefono la vista Agenda diventa
> un muro rosso. Voglio ammorbidirli.
>
> Obiettivo: eventi con fondo tenue e una barra colorata a sinistra per lo stato, testo nel colore
> normale, come le card delle liste su mobile (vedi la striscia in entity-card-list.tsx).
>
> Dove guardare:
> - interventions-calendar.tsx: `statusEventStyle` usa var(--color-green-500), --color-yellow-400,
>   --color-red-500 con testo #fff; `eventPropGetter` li applica.
> - calendar-theme.css: stili di .rbc-event, agenda e popup "+N altri".
> - index.css: i token di stato già verificati per il contrasto (--status-red/yellow/green e i
>   relativi -foreground) da usare al posto dei colori Tailwind grezzi.
>
> Vincoli:
> - Tutte le viste: Mese, Settimana, Giorno, Agenda, e il popup "+N altri".
> - Stato riconoscibile anche senza distinguere i colori, e contrasto del testo almeno 4.5:1 in
>   tema chiaro e scuro.
> - Non toccare la barra dei pulsanti del calendario (CalendarToolbar), l'abbiamo appena rifatta.
> - Verifica con Playwright a 390 e 1440px, chiaro e scuro, e confronta prima/dopo.
> - Aggiungi la voce in docs/CHANGELOG.md; non fare commit finché non ti dico che va bene.

**Cosa era emerso nel tentativo** (utile per non ripartire da zero):
- Al posto dello stile in linea basta una classe da `eventPropGetter` (`status-event
  status-event-<colore>`) con il disegno in `calendar-theme.css`: caricato dopo il CSS della
  libreria, vince per specificità e ordine, compreso il bordo blu di `.rbc-day-slot .rbc-event`.
- Nell'agenda la classe finisce sulla `<tr>`, non su `.rbc-event`: va colorato solo orario ed
  evento, perché la cella della data ha `rowspan` e raggruppa più interventi (è lei a fare il
  "muro rosso").
- Il fondo con `color-mix()` va miscelato **in `oklab`, non in `oklch`**: col bianco (senza
  tinta) Chromium interpola la tinta da 0° e giallo e verde escono rosa. Fondo opaco (sulla
  card, o sul popover nel popup), perché nelle viste orarie gli eventi si sovrappongono. Il
  giallo al 12% sul bianco quasi non si vede: serviva il 18%; in tema scuro il 20% per tutti.
- Per lo stato senza colore: l'icona delle card della dashboard davanti al titolo
  (`CalendarClock`, `Loader`, `CircleCheck`) più il nome dello stato in `sr-only`. Nell'agenda
  l'icona va in linea col testo, non in una colonna flex: altrimenti su mobile i titoli vanno su
  tre righe.
- Contrasti misurati così: testo 7,5–17:1, icona ≥ 4,95:1, in chiaro e scuro, anche in hover.
  La striscia gialla sul fondo chiaro resta a 1,7:1 (è solo un rinforzo).
- Chiude anche la parte "calendario" della voce sul contrasto qui sopra.

## Notifiche di sistema visibili e chiudibili da tutti

*Trovato il 2026-09-25 durante la revisione visiva; non è un difetto grafico, è stato rimandato
per farlo a parte.*

**Il problema.** `GET /api/notifications` (`backend/src/routes/notifications.ts`) restituisce
tutte le notifiche a qualunque utente autenticato, senza guardare il ruolo. Un utente non admin
vede quindi avvisi pensati per l'amministratore: "Accesso da un nuovo dispositivo" con il nome
utente e il tipo di dispositivo, i backup falliti, l'SMTP, `pg_dump` non trovato. Il link di
quelle notifiche porta a sezioni di Impostazioni che lui non può aprire.

In più la chiusura è condivisa per scelta (commento nella rotta: "vale per tutti gli utenti"):
un non admin può chiudere un avviso di sicurezza o di un backup fallito prima che
l'amministratore lo veda.

**Strada proposta.** Le notifiche registrate da `recordNotification` sono tutte di sistema:
lettura e chiusura riservate agli admin (`requireAdmin` sulle due rotte), e nel frontend la
campanella nascosta o vuota per chi non lo è. Se in futuro serviranno notifiche per tutti,
un campo `audience` sulla tabella.

## Rimandati dalla revisione visiva del 2026-09-25

*Le correzioni fatte sono nel CHANGELOG dello stesso giorno. Queste sono rimaste fuori per
scelta.*

- **Aree da toccare sotto i 44px su telefono.** Quasi ovunque: pulsanti da 36–40px, la X dei
  dialoghi da 32px, le frecce della paginazione (42×36), il selettore delle righe per pagina
  (57×32), i pulsanti `sm` di Impostazioni (32px). Deciso di non toccarle in quel giro: è una
  scelta di misura di base dei pulsanti che cambia l'aspetto di tutta l'app, da fare in un
  colpo solo e da riverificare ovunque.
- **Colonna Azioni fuori vista nelle tabelle larghe.** Con la barra laterale aperta, report e
  interventi sono più larghi del contenitore anche a 1440px (report: 1623px in 1160), e i
  pulsanti di riga stanno in fondo allo scorrimento orizzontale. Una colonna Azioni fissa a
  destra (`sticky`) è stata provata e tolta: non convinceva. Restano da valutare colonne
  nascoste di serie (password, backup dati, alimentatore) o le azioni in un menu "⋯".
- **Proposte non ancora decise:**
  - ricerca globale e suggerimenti del cliente ordinati per rilevanza, mostrando il campo che
    corrisponde (oggi con "rossi" escono prima clienti che corrispondono solo per l'email);
  - conferma dell'invio email con l'indirizzo del destinatario;
  - telefono ed email cliccabili (`tel:`, `mailto:`) nelle schede;
  - negli interventi di consegna, "Ora inizio" e "Ora fine" vuote nel riepilogo;
  (fatti nello stesso giorno, vedi CHANGELOG: "Rimuovi tutte" nelle notifiche, logo e nome
  nella pagina di accesso, confronto di "Incassi mese" sugli stessi giorni, e le due pulizie
  lasciate dalla revisione.)

## Test sul database vero, seconda parte

*La prima parte è fatta il 2026-09-17 (CHANGELOG): `npm run test:db`, un database `_test` a parte,
il servizio Postgres in CI e 61 test su `listReports` e `listInterventions`. Istruzioni nel
README, "Test e controlli".*

*Il resto della lista qui sotto è fatto il 2026-09-21 (CHANGELOG): le cancellazioni con chiavi
esterne, le statistiche della dashboard, le liste delle cinque anagrafiche, e login/sessioni di
`authManager` (`login`, `getSessionUser`, `deleteSession`, la scadenza e la pulizia).*

**Cosa resta scoperto.** Solo la 2FA di `authManager` — `startTwoFactorSetup`,
`confirmTwoFactorSetup`, `regenerateRecoveryCodes`, `disableTwoFactor` — gira ancora solo contro il
`db` finto a catena di `authManager.test.ts`. Lasciata fuori il 2026-09-21 per il tempo che
richiede tradurre in query reali il contratto di quei test finti (segreto TOTP cifrato, codici di
recupero monouso, sessioni da invalidare) senza indovinarlo.

Come aggiungerne: un file `*.db.test.ts` accanto alla query, righe create con gli helper di
`backend/src/test/db/fixtures.ts` (da estendere se serve), tabelle già vuote a ogni test.
Quando un test passa al primo colpo, conviene alterare la query di proposito e controllare che
fallisca.
