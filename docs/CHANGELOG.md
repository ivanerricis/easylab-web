# Changelog

Registro dei miglioramenti tecnici di easylab-web: cosa è cambiato, **perché**, e quali file
sono coinvolti. Le voci più recenti stanno in cima.

Il README resta la guida operativa (installazione, backup, aggiornamento); qui si annota
solo l'evoluzione del codice e dell'infrastruttura.

> **Convenzione:** una voce per intervento, con la motivazione. Il "perché" è la parte che
> non si ricostruisce dal diff — è il motivo per cui questo file esiste.

---

## 2026-09-11 — Correzioni di sicurezza da audit: limiti sul login, sulla 2FA e sul logo

**Cosa.** Cinque correzioni emerse da un audit di sicurezza dell'intero codebase:

1. **Tentativi illimitati sul secondo fattore** (`authManager.ts`). `login` azzerava il contatore
   dei tentativi dell'IP appena la password risultava giusta, *prima* della 2FA. Chi conosceva
   la password poteva alternare un login e quattro codici sbagliati all'infinito: il limite di
   cinque tentativi per challenge non serviva a nulla, perché un challenge nuovo si otteneva
   rifacendo il login. Ora il contatore dell'IP si azzera solo quando nasce davvero una
   sessione (anche un account disabilitato non lo azzera più), e c'è un secondo contatore **per
   utente** sul secondo fattore (`utente:<id>:secondo-fattore`), che segue l'account da
   qualunque IP e da qualunque rotta arrivino i codici: login, disattivazione della 2FA,
   rigenerazione dei codici di recupero.
2. **L'admin poteva rigenerarsi la propria password** (`routes/users.ts`). La rotta consegna una
   password nuova in chiaro senza chiedere quella attuale: una sessione admin rubata bastava a
   prendersi l'account per sempre e a chiudere fuori il proprietario. Ora sul proprio account
   risponde 400, come "disabilita" ed "elimina", e il pulsante non compare più sulla propria
   riga. Togliersi la 2FA da amministratore resta possibile (è la via d'uscita per il
   telefono perso), ma sul proprio account ora chiede la password (`assertOwnPassword`). Il
   codice no, dato che il telefono è ciò che manca.
3. **Nessun limite sulle password richieste di nuovo** (`authManager.ts`). Cambio password e
   attivazione/disattivazione della 2FA verificavano la password senza limitatore: con una
   sessione rubata la si poteva indovinare a forza bruta, frenati solo da scrypt. Ora passano
   tutte da `assertCurrentPassword`, con un contatore per utente (`utente:<id>:password`).
4. **Path traversal sul logo tramite archivio ripristinato** (`logoManager.ts`). `getLogoFile`
   usava `meta.fileName` alla lettera, e `meta.json` arriva anche da un archivio di backup
   ripristinato: un archivio con `"fileName": "../secret.key"` avrebbe fatto servire la chiave di
   cifratura su `/assets/logo.jpg`, che è pubblico. Ora sono accettati solo `logo.png` e
   `logo.svg`, e il tipo MIME si deriva dal nome, non dai metadati.

5. **Un login riuscito azzerava il contatore dell'intero IP** (`authManager.ts`,
   `loginRateLimit.ts`). Chi aveva un account valido poteva provare quattro password su quello
   dell'admin, entrare con il proprio per ripartire da zero, e ricominciare all'infinito. Ora i
   contatori della password al login sono due:
   - uno per coppia IP + nome utente (`accesso:<nome>@<ip>`, 5 tentativi), l'unico che un login
     riuscito azzera, e solo per chi è appena entrato;
   - un tetto complessivo per IP (`loginRateLimitMaxAttemptsPerIp`, 20 tentativi) che non si
     azzera mai e scade solo con la finestra di 15 minuti.

   Il tetto per IP è più alto di prima (20 invece di 5) perché dietro l'IP pubblico del
   laboratorio ci sono tutti i colleghi: con 5 errori complessivi e senza azzeramento,
   qualche errore di battitura sparso fra loro avrebbe chiuso fuori tutti. Resta però
   indispensabile, perché senza di esso da un solo indirizzo si potrebbero provare cinque
   password su *ogni* nome utente.

In `loginRateLimit.ts` i parametri si chiamano ora `key` invece di `ip`, perché la stessa mappa
ospita chiavi di tipo diverso. I prefissi `utente:` e `accesso:` non possono coincidere con un
indirizzo, nemmeno IPv6, perché contengono lettere che non sono cifre esadecimali.

**Dipendenze.** `npm audit fix` su entrambi i package, solo aggiornamenti minori e patch dentro
gli intervalli di `package.json` (cambia solo `package-lock.json`):
- backend: nodemailer 9.1.1, sharp 0.35.4 (libheif), multer 2.3.0, qs 6.16.0;
- frontend: react-router 7.18.3, nanoid 3.3.19, js-yaml 4.3.2, qs.

`npm audit --omit=dev` dà ora 0 vulnerabilità in entrambi. Restano 4 segnalazioni "moderate"
nel backend, tutte su esbuild dentro drizzle-kit: è una dipendenza di sviluppo, e la falla
riguarda solo il suo server di sviluppo, mai avviato in produzione. `npm audit fix --force`
le toglierebbe riportando drizzle-kit alla 0.18.1, un downgrade incompatibile: non applicato.

**Il perché.** Il primo punto è il più serio: la 2FA esiste proprio per il caso "password
rubata", ed era aggirabile esattamente in quel caso. Gli altri tre stringono ciò che una
sessione rubata o un archivio manipolato permettono di fare. Costo accettato: chi conosce la
password può tenere un utente fuori dal secondo passo sbagliando codici apposta (15 minuti per
volta). È il male minore rispetto a indovinare il codice, e resta visibile: la password è
compromessa e va cambiata comunque.

Test aggiunti in `authManager.test.ts`, `loginRateLimit.test.ts`, `users.test.ts` e
`logoManager.test.ts`: 571 test backend e 81 frontend verdi, `tsc`, `eslint` e `prettier` puliti,
build di produzione riuscita per entrambi i package dopo l'aggiornamento delle dipendenze.

---

## 2026-09-11 — Pulizia codice morto (frontend e backend)

**Cosa.** Analisi con `knip` (dependency/export graph) su entrambi i package, verificata a mano
voce per voce prima di toccare qualsiasi file:
- Rimosso `components/mode-toggle.tsx` sul frontend: componente mai usato, l'unico riferimento
  era un import commentato in `MainLayout.tsx`.
- Rimossi in `backend/src/db/types.ts` gli 8 alias di tipo (`Report`, `Customer`, `Collaborator`,
  `Technician`, `Device`, `Issue`, `ReportTechnician`, `Intervention`) che duplicavano
  `InferSelectModel` senza che nessuno li importasse: restano solo `New*`/`Update*`, che sono
  quelli davvero usati dalle query.
- Tolto `export` (senza toccare l'implementazione) da funzioni e costanti usate solo all'interno
  del proprio file ma marcate pubbliche per errore: `unpaginatedMaxRows` (pagination.ts),
  `deleteExpiredSessions`/`deleteAllSessionsForUser` (authManager.ts),
  `listSmbBackupFileNames`/`deleteSmbFile` (backupSmb.ts),
  `totpDigits`/`totpAllowedStepDrift` (totp.ts), `ListParams` (crudRouter.ts),
  `EmailAttachment` (emailManager.ts), `NotificationSeverity` (notificationManager.ts),
  `UpdateStatusState` (updateManager.ts).

Non toccati: le re-esportazioni di tipo in `backupManager.ts` (`BackupDumpFile`,
`SmbConnectionConfig`, `BackupSettingsPublic`, `BackupSettingsState`) — il file le documenta
esplicitamente come facciata unica per rotte e test, non sono codice morto anche se knip le
segnala. Lasciati intatti anche `migrate.js`/`reset-admin-password.js` (script invocati da
Docker/CLI, non da import) e i sotto-componenti generati da shadcn/ui (`components/ui/*`),
volutamente barrel-exported.

**Il perché.** Richiesta dell'utente di individuare ed eliminare codice morto. Distinzione
importante emersa durante l'analisi: la maggior parte degli "unused export" segnalati da knip
non erano funzioni morte ma funzioni usate internamente e solo esportate per errore —
cancellarle avrebbe rotto i chiamanti reali nello stesso file, quindi la correzione è stata
togliere `export`, non il corpo.

`tsc --noEmit` pulito su entrambi i package, `eslint` pulito su entrambi, 550 test backend verdi.

---

## 2026-09-11 — Requisiti della password mostrati come lista, non come frase fissa

**Cosa.** Nel dialogo "Cambia password", sotto il campo della nuova password, la frase
statica dei requisiti (`passwordRequirementsHint`) è sostituita da una lista che si aggiorna a
ogni carattere digitato: un requisito non soddisfatto è rosso con una ✕, uno soddisfatto è
verde con una ✓ e il testo barrato. `lib/passwordPolicy.ts` espone ora `passwordRequirements`,
un array di `{ label, isSatisfied }` da cui `isPasswordCompliant` deriva (prima duplicava la
stessa logica in un'unica espressione booleana).

**Il perché.** Richiesta dell'utente: sapere subito quali requisiti mancano invece di scoprirli
tutti insieme dal toast di errore al momento del salvataggio.

`tsc --noEmit` sul frontend passa.

---

## 2026-09-11 — Icone giuste sui pulsanti di conferma; il report porta con sé il suo tecnico

Le due voci erano in [BACKLOG.md](BACKLOG.md) dalla mattina; da lì sono state tolte.

**Cosa.**
- **Icone.** `CustomDialog` non mette più un'icona predefinita sul pulsante di conferma: la
  prop `confirmIcon` riceve il componente (`confirmIcon={Save}`) e la misura la decide il
  dialogo. Ogni dialogo dichiara la sua: floppy per i dieci moduli che salvano, cestino per
  "Elimina", stampante per "Stampa", aereo di carta per "Invia", `UserPlus` per "Crea utente",
  `ShieldCheck`/`ShieldOff` per attivare e disattivare la 2FA, `RefreshCw` e `KeyRound` per le
  due "Rigenera", `UserX` per "Disabilita", `ArchiveRestore` per "Ripristina", `Download` per
  "Aggiorna adesso", la spunta per "Ho copiato… / Ho salvato…, chiudi". "Continua" (passaggio
  intermedio dell'attivazione 2FA) resta senza. `TwoFactorConfirmDialog` inoltra la prop.
- **Tecnico con il report.** `GET /api/reports/:id` restituisce anche `technicianId` e
  `technicianPrice` (nuova `getReportTechnicianByReportId`, una riga al più perché `report_id` è
  l'intera chiave primaria). Il dialogo "Modifica report" e la pagina di dettaglio li usano e non
  chiamano più `listReportTechnicians()`, tolta dal frontend. Nuovo tipo `ReportDetailDto`, perché
  le risposte di creazione e modifica quei campi non li hanno.

**Il perché.**
- *Icone.* Il default era il floppy, o il cestino con `destructive`. Così nove pulsanti che non
  salvano niente mostravano il floppy (il caso peggiore: "Invia", che manda un'email al cliente)
  e quattro che non eliminano niente il cestino ("Ripristina", "Disabilita", due "Disattiva").
  L'icona prometteva un'azione e il pulsante ne faceva un'altra. Correggerli uno per uno non
  bastava: il dialogo successivo avrebbe ereditato di nuovo il floppy. Con il default vuoto un
  dialogo nuovo può al più non avere icona, mai averne una sbagliata. Verificato nel browser
  leggendo l'icona effettiva di "Invia", "Elimina" e "Salva".
- *Tecnico.* Per sapere il tecnico di un report, dialogo e pagina scaricavano l'intera
  `report_technician`: 8000 righe, 376 KB sul database di sviluppo, a ogni apertura, ed era il 97%
  di quello che il dialogo caricava. Misurato nel browser dopo la modifica: l'apertura del dialogo
  fa 5 richieste per 15,8 KB (prima circa 392 KB), e il costo non cresce più con l'archivio.
  Tecnico e prezzo mostrati coincidono con il database (report 20000: tecnico 9, 110 €; report 1:
  tecnico 8, 47 €).

Test: due casi nuovi su `GET /:id` (report con e senza tecnico). `tsc`, `eslint`, Prettier, 550
test backend e 81 frontend passano.

---

## 2026-09-11 — Schede di cliente e tecnico come quella del collaboratore; cliente cercato sul server alla creazione; `BACKLOG.md`

**Cosa.**
- **Scheda cliente.** `CustomerPage` ha la forma della scheda collaboratore: intestazione,
  riquadro "Dati del cliente" (telefoni, email, località, cliente dal), due tab Report e
  Interventi con `EntityTable`, filtro a destra, impaginazione in fondo. Le colonne
  (`customer-detail-columns.tsx`) sono quelle del collaboratore meno nome e telefono del
  cliente, che stanno già nel riquadro; ci sono in più difetto, prezzo totale e data. L'indirizzo
  segue il tab (`/clients/:id` e `/clients/:id/interventions`), quindi i due pulsanti
  dell'elenco clienti portano dove portavano. `CustomerInterventionsPage` è stata eliminata; la
  stampa del resoconto segue il tab attivo.
- **Scheda tecnico.** Stessa forma: riquadro "Dati del tecnico" (telefono, partita IVA) e
  `EntityTable` con la colonna **Prezzo tecnico**, che prima mancava ed è il motivo per cui la
  scheda si apre.
- `DetailItem` è diventato un componente condiviso (`components/detail-item.tsx`): era copiato in
  `ReportPage` e `InterventionPage`, e le schede nuove ne avrebbero fatte quattro copie.
- **Cliente scritto a mano alla creazione.** Nuovo `lib/customerLookup.ts`: quando il cliente non
  è stato scelto dai suggerimenti, lo si cerca sul server, prima per telefono e poi per la parola
  più lunga del nome, e fra i candidati decide la stessa `resolveSelectedCustomer` di prima. Lo
  usano la creazione dei report (`resolveReportReferences`) e degli interventi, sia dalla
  dashboard sia dalla pagina Interventi. Se i candidati sono più di 1000, non sceglie e chiede di
  prendere il cliente dai suggerimenti.
- **`docs/BACKLOG.md`**, nuovo: il posto unico per le cose da fare. Ci sono il contrasto delle
  righe gialle e verdi (misure, due strade, raccomandazione), l'icona del floppy sui pulsanti che
  non salvano, il costo del dialogo "Modifica report", e un indice delle voci che prima stavano
  nei paragrafi "Ancora da fare" di questo file, nel piano della 2FA, nel README o fuori dal
  repository.

**Il perché.**
- *Schede.* Nel giro visivo cliente e tecnico erano le sole schede ancora diverse dalle altre:
  nessun dato di contatto, tabelle a tre o quattro colonne scritte a mano, filtro ed etichetta
  rientrati di 48px. Questo chiude l'"Ancora da fare" della voce del 2026-09-10 sulla scheda
  collaboratore, e per le schede quello del 2026-09-08 sulle colonne ridimensionabili; restano
  le tabelle di Impostazioni.
- *Tab che non ricaricano la pagina.* Cambiare tab cambia l'indirizzo, e `useNavigate` cambia
  identità a ogni cambio di indirizzo: con `navigate` fra le dipendenze dell'effetto di
  caricamento, ogni cambio di tab richiedeva di nuovo il cliente e copriva la pagina con lo
  spinner. Il redirect per id non valido ora sta in un effetto a parte. Verificato dalle
  richieste di rete: il cambio di tab non ne fa nessuna.
- *Creazione.* Le tre copie cercavano il cliente dentro `listCustomers()`, che senza
  paginazione si ferma a 5000 righe: con un cliente in più, uno scritto a mano risultava "non
  esistente". Una delle tre, quella della dashboard, confrontava anche il testo in modo diverso
  dalle altre due (uguaglianza esatta, senza tolleranza su maiuscole e accenti). La
  pagina Interventi aveva inoltre una copia locale di `resolveSelectedCustomer` e
  `formatCustomerOption`, ora rimossa. Verificato dal vivo senza scrivere nel database: nuovo
  intervento con il cliente scritto a mano, la creazione intercettata e rifiutata dal test;
  una sola ricerca (per telefono) e `customerId` corretto nel corpo della richiesta.

Test: 11 nuovi in `customerLookup.test.ts` (scelta dei termini, ripiego sul nome, omonimi,
candidati troppi, id già risolto). `tsc`, `eslint`, Prettier, 549 test backend e 81 frontend
passano.

---

## 2026-09-11 — Schede di cliente e tecnico filtrate dal server; ritocchi alle pagine di dettaglio

Esito di un giro visivo su tutte le pagine e i dialoghi, a 1920 e 400 px.

**Cosa.**
- **Schede filtrate dal server.** `GET /api/reports` accetta `customerId` e `technicianId`,
  `GET /api/interventions` accetta `customerId` (nelle query `customerId` c'era già, mancava
  nelle rotte; `technicianId` è una sottoquery su `report_technician`). `CustomerPage`,
  `CustomerInterventionsPage` e `TechnicianPage` usano `usePaginatedRows` come la scheda del
  collaboratore, e leggono nome del cliente/tecnico con i nuovi `getCustomer`/`getTechnician`.
  Anche `ReportPage` e `InterventionPage` leggono il cliente per id.
- **Dettaglio report.** Tolti i doppioni (stato e metodo di pagamento stavano sia nelle card
  in alto sia nelle schede sotto), aggiunto "Avvisato", che non compariva da nessuna parte;
  "Descrizione servizio" diventa "Descrizione intervento", come nel dialogo. Nel dettaglio
  intervento tolto lo "Stato" ripetuto in Anagrafica.
- **Mobile.** Le card in alto di report e intervento vanno due per riga invece di una (su
  400 px da circa 650 a circa 400 px prima dei dati); nell'intervento stato, tipo e data
  prendono la riga intera perché "In lavorazione" in mezza card usciva dal bordo. Le card non
  hanno più `h-fit!`, quindi in una riga sono tutte alte uguali.
- **Agenda della dashboard.** Il titolo va a capo invece di allargare la tabella oltre il
  riquadro; "tutto il giorno" diventa un trattino; su mobile l'orario va su due righe
  ("09:00" / "– 10:30") e la colonna scende da circa 108 a 64 px.
- **Rifiniture.** `CustomDialog` accetta `confirmIcon`: i dialoghi di stampa mostrano la
  stampante invece del floppy di "Salva". Nel dialogo di stampa etichette e date sono
  `text-lg` come negli altri, staccate dalla descrizione e impilate sotto `sm`. Nei dialoghi
  dell'intervento gli orari hanno la stessa misura della data, e il titolo di modifica porta
  il numero. La pagina "Tecnici" si chiama "Tecnici esterni", come nel menu.

**Il perché.** Le tre schede scaricavano elenchi interi e filtravano nel browser, ma senza
paginazione le liste si fermano a `unpaginatedMaxRows` (5000): sul DB di sviluppo il cliente
4260 ha 5 report e la sua scheda diceva "Nessun report associato"; il tecnico 12 ha 179 report
aperti e ne mostrava 43. Verificato dopo la correzione: 5, 179, e 2 interventi per il cliente
1246, uguali ai conteggi SQL. Il nome del cliente nelle pagine di dettaglio aveva lo stesso
limite: i clienti sono esattamente 5000, quindi dal prossimo sarebbe comparso "Cliente
sconosciuto". Il resto sono incoerenze trovate guardando le pagine.

Nota per chi prova in locale: dopo aver cambiato file del backend va fatto
`docker restart backend_dev`, altrimenti il container continua a servire il codice vecchio
(qui i nuovi filtri venivano ignorati e le liste tornavano tutte le righe).

Test: quattro casi nuovi in `collaboratorFilter.test.ts` (inoltro dei due filtri e rifiuto di
id non validi). `tsc`, `eslint`, Prettier, 549 test backend e 70 frontend passano.

---

## 2026-09-11 — Dialogo "Modifica report" riorganizzato

**Cosa.**
- `editReportDialog.tsx`: i campi sono raggruppati come nella pagina di dettaglio del report.
  *Anagrafica*: cliente, dispositivo, collaboratore. *Intervento*: difetto e password, poi
  problema (solo con "Altro"), descrizione e note. In fondo tre riquadri affiancati da `lg`,
  alti uguali: *Tecnico esterno* (tecnico e suo prezzo), *Pagamento* (prezzo interno e metodo),
  *Stato* (le quattro spunte). Il titolo riporta il numero del report; il dialogo passa da
  `xl:max-w-[88rem]` a `xl:max-w-6xl`; l'altezza del modulo segue lo schermo
  (`calc(100dvh-12rem)`) invece di un `70vh` fisso.
- I prezzi hanno il simbolo € davanti (`EuroInput`), le spunte di stato sono riquadri
  cliccabili per intero con evidenza quando sono attive, e le griglie dei campi usano
  `items-start`.
- `fieldOrder` segue il nuovo ordine: il focus va sul primo campo in errore *come appare*.
- Cambiare metodo di pagamento cancella l'errore del prezzo interno, che dipende dal metodo.
- `payment-method-selector.tsx`: il contenitore è una griglia vera (`grid`, tre colonne da
  `md`) e le voci hanno il corpo del testo a `text-base`.

**Il perché.** Richiesta dell'utente di sistemare il dialogo a vista. Con i problemi trovati
guardandolo:
- il difetto aveva un quarto di riga ed era troncato a quasi ogni larghezza, pur essendo il
  testo più lungo del modulo;
- il collaboratore stava in "Anagrafica" ma password e prezzi in "Intervento", e il prezzo
  interno era lontano dal metodo di pagamento pur dipendendone ("Non pagato" lo azzera, con
  contanti o carta non può restare a zero);
- nel selettore del pagamento le classi `grid-cols-*` erano applicate a un contenitore
  `flex flex-wrap`, dove non fanno nulla: "Non pagato" finiva da solo su una riga e le card
  avevano larghezze diverse;
- nelle spunte era cliccabile solo la scritta, non il bordo interno del riquadro;
- quando un campo mostrava l'errore sotto di sé, la riga si allungava e le celle vicine si
  stiravano: etichetta e controllo scendevano di 12 e 24 px. Verificato con test di controllo
  (misura con `items-start`, poi senza a runtime): allineati con, disallineati senza.

Controllato con Playwright a 1920, 1366, 1024, 820 e 400 px, in tema chiaro e scuro, con
difetto "Altro" ed errori di validazione attivi. `tsc`, `eslint`, Prettier e i 70 test del
frontend passano.

---

## 2026-09-10 — CI backend di nuovo verde: formattazione dei test

**Cosa.** Passati con Prettier 14 file di test del backend (`routes/interventions`,
`reports`, `reportTechnicians` e dodici in `services/`): solo a capo di import e argomenti
oltre i 120 caratteri, nessun cambiamento di logica.

**Il perché.** Il job "Backend" della CI falliva su `format:check` da `test(backend): fill in
test coverage…` di stamattina, e ogni push successivo è rimasto rosso. In locale la violazione
non spiccava: con `core.autocrlf=true` Prettier segnala 28 file, metà dei quali solo per i fine
riga CRLF. Il controllo che coincide con la CI è
`npx prettier --check --end-of-line auto "src/**/*.ts"`, che ignora i fine riga e lascia solo
le violazioni vere. Verificato con `lint`, `typecheck` e i 543 test.

---

## 2026-09-10 — Elenco completo dei difetti al focus nel dialogo "Nuovo report"

**Cosa.**
- `inputWithAdd.tsx`: nuova prop opzionale `showAllOnFocus`. Col campo vuoto il menu mostra
  tutte le `options` appena la casella prende il focus (scorrevole, come prima); appena si
  digita torna il filtro di sempre. Non ha effetto con `onSearch` (clienti), dove il catalogo
  sta sul server e la ricerca a vuoto resta evitata di proposito.
- `createReportDialog.tsx`: la prop è attiva solo sul campo "Difetto".

**Il perché.** Richiesta dell'utente: al focus sul campo dei difetti va mostrata subito tutta
la lista. Il catalogo dei difetti è corto e chi apre il report spesso non sa con quale parola
è stata registrata la voce: scorrere l'elenco è più rapido che provare a indovinarla. La regola
generale del componente ("i suggerimenti partono solo digitando", per non coprire il modulo
con un elenco non filtrato) resta invariata per dispositivi, clienti e il dialogo
dell'intervento: l'eccezione è opt-in.

---

## 2026-09-10 — Pulsante di creazione quadrato accanto al titolo su mobile; report del tecnico visibili su mobile

**Cosa.**
- `page-header.tsx`: titolo e azione tornano sulla stessa riga anche sotto `sm`
  (`flex flex-wrap items-center justify-between`), con a capo solo se non ci stanno. Il
  `flex-col` introdotto per la dashboard (voce "Header di pagina che non va in overflow sotto
  `sm`") impilava i due blocchi, e in colonna ogni figlio si stira: su Report, Interventi,
  Clienti, Tecnici, Collaboratori, Dispositivi e Difetti il singolo pulsante "+" diventava una
  barra blu larga quanto lo schermo, sotto il titolo.
- `DashboardPage.tsx`: il gruppo refresh + "Report" + "Intervento" chiede da sé la riga
  intera sotto `sm` (`w-full sm:w-auto`), quindi la dashboard resta esattamente com'era.
- `create-entity-button.tsx`: sotto `md`, quando mostra solo l'icona (nessuna `mobileLabel`),
  il pulsante è esplicitamente quadrato (`max-md:aspect-square max-md:px-0`), 40×40 come il
  refresh e le azioni di riga; da `md` in su torna il testo ("Crea nuovo report").
- `TechnicianPage.tsx`: su mobile i report del tecnico **non si vedevano affatto** — la tabella
  è `hidden sm:table` e al suo posto non c'era alcuna scheda, restava solo il conteggio in
  fondo ("1-10 di 56" su una lista vuota). Aggiunto `EntityCardList` come nelle schede di
  cliente e collaboratore (cliente come titolo, stato nel badge, dispositivo, pulsanti Apri e
  Modifica); il rientro `ml-12` della lista vale ora solo da `sm` in su, così le schede usano
  tutta la larghezza.

**Il perché.** Richiesta dell'utente: "il tasto per creare un nuovo report non dovrebbe
prendersi tutta la riga, nome della pagina a sinistra e pulsante quadrato a destra, su tutte
le pagine con questo problema". Il bug del tecnico è emerso passando in rassegna le pagine per
questa verifica. Le pagine di dettaglio (report, intervento, cliente) hanno i pulsanti su una
riga propria ma non a tutta larghezza, e non sono state toccate. Verificato con `typecheck`,
`lint`, `format:check` e Playwright autenticato: il "+" misura 40×40 alla stessa altezza del
titolo a 320, 390 e 700px, a 1280px è il pulsante con testo come prima; la dashboard ha le
stesse posizioni di prima a tutte le larghezze; nessuno scroll orizzontale.

**File.** `frontend/src/components/page-header.tsx`,
`frontend/src/components/create-entity-button.tsx`,
`frontend/src/pages/dashboard/DashboardPage.tsx`,
`frontend/src/pages/technicians/TechnicianPage.tsx`.

---

## 2026-09-10 — Schede delle liste su mobile ridisegnate

**Cosa.** Le schede che sotto `sm` prendono il posto delle tabelle (`EntityCardList`) hanno un
layout nuovo:
- **Intestazione**: il titolo in grassetto, sotto l'ID come `#3174` in piccolo, e a destra lo
  stato in un badge colorato con pallino e testo ("Aperto", "Programmato"...). Prima l'ID
  occupava una riga intera come qualsiasi altro campo e lo stato stava in mezzo alla lista.
- **Dettagli su due colonne**, etichetta piccola sopra il valore, invece di una riga
  etichetta-a-sinistra/valore-a-destra per ogni campo: i valori lunghi andavano a capo
  allineati a destra, difficili da leggere. I campi che tendono a essere lunghi (difetto,
  email, orario nella scheda cliente) prendono tutta la larghezza.
- **Stato** come striscia sottile a sinistra al posto della barra da 8px in alto; niente
  striscia dove non c'è stato. Prima la barra c'era sempre, grigia e senza significato, su
  clienti, tecnici, collaboratori, dispositivi e difetti. Bordo da 1px con ombra leggera
  invece di `border-2`.
- **Pulsanti** in una fascia in fondo, a dividersi la larghezza della scheda, alti 44px (erano
  icone da 40px allineate a destra). La fascia sparisce se la riga non ha pulsanti (la voce
  fissa "Altro" dei difetti mostrava una fascia vuota).
- **Titolo anche per le anagrafiche**: nome e cognome per clienti, tecnici e collaboratori,
  nome per i dispositivi, descrizione per i difetti. Prima avevano l'ID come prima riga.
- Lo scheletro di caricamento ricalca il nuovo layout; le schede utenti in Impostazioni,
  scritte a mano, adottano lo stesso aspetto.

**Come.** Il posto di una colonna nella scheda lo dichiara la colonna stessa
(`cardSlot: "title" | "badge" | "wide"`) invece della prop `titleColumnKey`, che andava fatta
passare per `EntityTable`, `EntityCrudTable` e ogni pagina: è per questo che le quattro
anagrafiche un titolo non l'avevano. Il colore delle schede viene ora da `getRowStatusColor`,
lo stesso della riga in tabella: sparisce `getAccentClassName` con la sua mappa di classi
`border-t-*` (`interventionAccentClassName` in `lib/interventions.ts`), una seconda
corrispondenza stato → colore da tenere allineata a mano. I colori sono token semantici
nuovi (`--status-{red,yellow,green}` e `-foreground`, in chiaro e scuro) invece di classi
Tailwind grezze; il testo del badge è scuro abbastanza da reggere il contrasto sul fondo
tenue, e il giallo resta all'hue 85 come per le righe. L'orario "13:00-14:30" della colonna
Data/Orario non va più a capo sul trattino.

**Il perché.** Richiesta dell'utente di sistemare graficamente le schede su mobile. Le
linee guida consultate (skill ui-ux-pro-max) hanno fissato i vincoli: stato scritto oltre che
colorato, bersagli touch da 44px, scheletro che ricalca il contenuto. Verificato con
`typecheck`, `lint`, `format:check` e Playwright autenticato a 390px in chiaro e scuro su
report, interventi, clienti, scheda cliente, scheda collaboratore, tecnici, difetti e utenti;
a 320px nessuno scroll orizzontale. Controprova sui pulsanti: togliendo le classi `*:` della
fascia tornano a 40×40, quindi l'override è quello che li porta a 44px.

**File.** `frontend/src/components/entity-card-list.tsx`, `entity-table.tsx`,
`entity-crud-table.tsx`, `hover-detail-cell.tsx`, `settings/usersSettingsSection.tsx`,
`frontend/src/index.css`, `frontend/src/lib/interventions.ts`, le definizioni di colonna in
`frontend/src/pages/*/components/*-columns.tsx`, `reports-table.tsx`,
`interventions-table.tsx`, `CollaboratorPage.tsx`, `CustomerPage.tsx`,
`CustomerInterventionsPage.tsx`.

---

## 2026-09-10 — Ricerca e paginazione allineate alle altre pagine su mobile

**Cosa.**
- `reports-filters.tsx` e `interventions-filters.tsx`: sotto `sm`, refresh e campo di ricerca
  ora stanno in una riga propria (`flex items-center gap-2`, resa trasparente da `sm:contents`
  sopra `sm` per tornare al `flex-wrap` unico di prima). Prima condividevano la riga con tutti
  i filtri via un unico `flex-wrap`: la ricerca è `flex-1` e si allarga a riempire lo spazio
  che resta sulla sua riga, quindi con due o tre filtri compatti accanto (stato, tipo,
  ordina) restava visibilmente più stretta che nella pagina Clienti, che ne ha uno solo. Ora
  la sua larghezza dipende solo dal pulsante di refresh accanto, uguale ovunque.
- `table-pagination.tsx`: sotto `sm` (nuova soglia `PAGINATION_COMPACT_BREAKPOINT`, la stessa
  di `EntityTable` per tabella/schede) conteggio, paginazione e selettore delle righe stavano
  impilati su tre righe — corretto per lo spazio, ma diverso dalla riga unica del desktop, e
  segnalato dall'utente da uno screenshot reale (Report, 637 pagine). Ora stanno su una riga
  sola anche su mobile: le etichette "Visualizzati" e "Righe per pagina" spariscono lasciando
  solo i numeri, e la lista numerata di pagine (fino a 7 pulsanti con "…" quando le pagine
  sono centinaia) diventa un indicatore "pagina/totale" tra le due sole frecce — la lista
  intera non ci sta su una riga stretta insieme a conteggio e selettore. `RowsPerPageSelect`
  guadagna una prop `compact` per nascondere la propria etichetta. Il conteggio usa `truncate`
  invece di andare a capo, così un totale a molte cifre si tronca invece di rompere la riga
  (il testo integrale resta comunque nell'annuncio `role="status"` per lo screen reader).

**Il perché.** Entrambi i bug condividono la causa della voce precedente (azioni schiacciate
in uno spazio condiviso con altri elementi) applicata a due punti diversi: la ricerca perde
alla lotta per lo spazio contro i filtri, la paginazione doveva letteralmente stare su tre
righe per non farlo. La richiesta esplicita dell'utente — stessa riga del desktop, etichette
sacrificabili pur di tenerla — ha guidato la scelta di comprimere invece di continuare a
impilare. Verificato con `typecheck`, `lint`, `format:check` e controllo visivo Playwright
(markup reale, 320/360/375/900px).

**File.** `frontend/src/pages/reports/components/reports-filters.tsx`,
`frontend/src/pages/interventions/components/interventions-filters.tsx`,
`frontend/src/components/table-pagination.tsx`, `frontend/src/components/rows-per-page-select.tsx`.

---

## 2026-09-10 — Azioni della dashboard e delle card di Impostazioni riordinate/contenute su mobile

**Cosa.**
- `DashboardPage.tsx`: sotto `sm` i due pulsanti di creazione ("Nuovo report" / "Nuovo
  intervento") stavano insieme al refresh nello stesso `flex-wrap`, in ordine
  refresh-report-intervento. Separati in due gruppi con `order` (`order-1`/`order-2`,
  invertiti da `sm:`) dentro un contenitore `justify-between`: sotto `sm` i due pulsanti di
  creazione stanno a sinistra e il refresh da solo a destra; da `sm` in su l'ordine
  originale (refresh, report, intervento) resta invariato.
- `settingsUi.tsx` (`SettingsCard`): l'azione della card (`CardAction`) sfruttava il layout a
  due colonne `grid-cols-[1fr_auto]` di `CardHeader`, pensato per un'unica azione compatta.
  Con più pulsanti e testo lungo (es. "Verifica aggiornamenti" / "Aggiorna adesso" in
  `updateSettingsPanel.tsx`) la colonna `auto` non si riduceva: i pulsanti uscivano dal bordo
  della card invece di andare a capo, sovrapponendosi al titolo. Sostituita la coppia
  `CardTitle`/`CardDescription` + `CardAction` con una riga propria
  (`flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between`), lo stesso pattern già
  usato in `PageHeader` (voce successiva): sotto `sm` l'azione scende sotto testo e
  descrizione invece di condividerne la riga.

**Il perché.** Bug segnalati dall'utente controllando la dashboard su mobile, con richiesta
esplicita di verificare anche altre pagine e dialog. Le altre pagine/dialog sono risultati a
posto: i dettagli (Report/Intervento/Cliente) impilano già testata e azioni con lo stesso
pattern mobile-first (`flex-col ... lg:flex-row`), e tutti i dialog passano da `CustomDialog`,
che usa `DialogFooter` di shadcn (`flex-col-reverse gap-2 sm:flex-row`) — già corretto. Il
problema era isolato ai due punti sopra, entrambi contenitori `flex`/`grid` che non lasciavano
spazio alle azioni di andare a capo sotto il titolo quando il contenuto non ci stava affiancato.
Verificato con `typecheck`, `lint`, `format:check` e controllo visivo Playwright (markup reale,
320/375/900px, prima e dopo).

**File.** `frontend/src/pages/dashboard/DashboardPage.tsx`, `frontend/src/components/settings/settingsUi.tsx`.

---

## 2026-09-10 — Header di pagina che non va in overflow sotto `sm`

**Cosa.** `page-header.tsx`: la riga che affianca titolo e azioni era `flex items-center
justify-between` senza `flex-wrap`. Con più di un pulsante nell'azione (es. "Nuovo report" +
"Nuovo intervento" in `DashboardPage.tsx`) e viewport sotto i 640px, la riga non aveva spazio
per entrambi ma non poteva nemmeno andare a capo: il blocco delle azioni veniva schiacciato in
una colonna stretta accanto al titolo, e il secondo pulsante — che wrappava dentro il proprio
contenitore `flex-wrap` — restava agganciato lì invece di scendere su una riga piena.
Cambiato in `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`: sotto `sm`
titolo e azioni si impilano, ognuno con tutta la larghezza; da `sm` in su il layout affiancato
è invariato.

**Il perché.** Bug segnalato dall'utente ("il layout dei due pulsanti nella dashboard su
mobile è completamente sballato"); la causa non era nei pulsanti ma nel contenitore comune a
tutte le pagine che usano `PageHeader` (Dashboard, Reports, Interventions, Customers), quindi
il fix si applica a tutte. Verificato con screenshot Playwright a 375px e 320px, prima e dopo,
iniettando il markup reale nella pagina di login (nessun dato necessario, il bug è puramente
strutturale).

**File.** `frontend/src/components/page-header.tsx`.

---

## 2026-09-10 — Tre correzioni UI/UX emerse da una revisione con ui-ux-pro-max

**Cosa.**
- `create-entity-button.tsx`: nuova prop opzionale `mobileLabel`, sul modello del `mobileText`
  già usato in `CardDashboard`. `DashboardPage.tsx` la passa ai due pulsanti "Nuovo report" /
  "Nuovo intervento" ("Report" / "Intervento"), che sotto `md` mostravano la sola icona
  `PlusCircle` — identica per entrambi, quindi indistinguibili al tocco (il tooltip che li
  spiegherebbe è hover-based e su touch non si apre). Gli altri usi del componente, tutti
  singoli, restano invariati non passando la prop.
- `hover-detail-cell.tsx`: sostituito `Tooltip` (hover-only) con `Popover` (click/tap),
  riusando lo stesso primitivo Radix già in produzione in `date-picker-field.tsx` e
  `calendar-event-popover.tsx`. Il componente mostra il testo libero dietro "Altro" nelle
  colonne Difetto/Tipo (report, interventi, collaboratori): con l'hover era irraggiungibile su
  mobile, dove le stesse colonne diventano righe di scheda in `EntityCardList`.
- `DashboardPage.tsx`: le icone di "Report chiusi" e "Interventi completati" usavano
  `text-green-400` non condizionato al tema (~1.74:1 di contrasto su sfondo card chiaro,
  sotto il 3:1 richiesto da WCAG 1.4.11 per gli oggetti grafici). Allineato al pattern
  `text-green-700 dark:text-green-400` già usato ovunque nel resto del codebase (~5:1).

**Il perché.** I tre problemi condividono la stessa causa: pattern di interazione o colore
pensati per il mouse/hover e mai riverificati su touch o contrasto quando riusati altrove.
Il primo e il secondo sono varianti dello stesso anti-pattern (hover-only su dispositivi
touch); il terzo è la stessa classe di bug già corretta per le icone stampa/email (vedi
commento in `index.css` sulle soglie WCAG), semplicemente non applicata qui. Verificato con
`typecheck`, `lint` e controllo visivo Playwright (CSS/token del tema reale).

**File.** `frontend/src/components/create-entity-button.tsx`,
`frontend/src/components/hover-detail-cell.tsx`, `frontend/src/pages/dashboard/DashboardPage.tsx`.

---

## 2026-09-10 — Impaginazione ancorata in fondo nella scheda collaboratore

**Cosa.** Con lo stack verticale sostituito dalle tab (voce precedente), l'area tabella dentro
ogni `TabsContent` non aveva l'altezza vincolata: "Visualizzati" e "Righe per pagina" finivano
subito sotto l'ultima riga invece che in fondo alla pagina, comportamento diverso da tutte le
altre pagine a elenco (che invece pinnano quel controllo). Applicato lo stesso pattern
`h-full`/`min-h-0`/`flex-1` + area tabella con `overflow-auto` già usato in
`simple-entity-page.tsx` e `ReportsPage.tsx`.

**Il perché.** Coerenza con il resto dell'applicazione: l'utente ha notato la differenza
appena vista la nuova scheda. Verificato con Playwright autenticato sia sul dataset pieno
(1198 report) sia su un filtro che lascia una sola riga in ultima pagina — l'impaginazione
resta ancorata in fondo in entrambi i casi.

**File.** `frontend/src/pages/collaborators/CollaboratorPage.tsx`.

---

## 2026-09-10 — Tab per report/interventi nella scheda collaboratore

**Cosa.** La scheda collaboratore (`CollaboratorPage.tsx`) mostrava le tabelle di report e
interventi impilate una sopra l'altra, ciascuna con il proprio filtro e la propria
impaginazione. Sostituito lo stack verticale con un componente `Tabs` (shadcn/radix-ui,
nuovo `frontend/src/components/ui/tabs.tsx` — non esisteva ancora nel progetto), tab "Report"
di default.

**Il perché.** Entrambe le liste sono già impaginate lato server, quindi un collaboratore con
molti report non appesantisce il DOM — a schermo ci sono sempre e solo le righe della pagina
corrente (testato con un collaboratore da 1198 report / 564 interventi). Il problema segnalato
dall'utente era la lunghezza della pagina: filtro, tabella e impaginazione di entrambe le
sezioni insieme obbligavano a scorrere anche per un collaboratore con pochi record. Il tab
Report è il default perché è la vista più cercata.

**File.** `frontend/src/components/ui/tabs.tsx` (nuovo);
`frontend/src/pages/collaborators/CollaboratorPage.tsx`.

---

## 2026-09-10 — Tooltip sulla descrizione libera in tabella report/interventi

**Cosa.** La colonna "Difetto" della tabella report (elenco report e scheda collaboratore)
mostrava solo l'etichetta del catalogo difetti: con "Altro" il dato utile — cosa ha scritto
davvero chi ha compilato il report — restava invisibile senza aprire il dettaglio. Stesso
problema sulla colonna "Tipo" della tabella interventi (elenco interventi e scheda
collaboratore): il tipo (consegna materiale / intervento sede / intervento remoto) non dice
cosa è stato fatto o consegnato. Aggiunto un tooltip al passaggio del mouse (nuovo componente
`hover-detail-cell.tsx`, basato sul `Tooltip` di radix-ui già usato altrove) che mostra
`issueDescription` sulla colonna Difetto e `description` sulla colonna Tipo, quando presenti.

**Il perché.** Lo stesso identificato per il popover del calendario interventi
(`calendar-event-popover.tsx`): l'informazione utile c'è già nei dati (`issueDescription` è
valorizzato solo quando il difetto è "Altro"; `description` dell'intervento porta il lavoro
svolto o il materiale consegnato) ma prima si vedeva solo aprendo la scheda di dettaglio.

**File.** `frontend/src/components/hover-detail-cell.tsx` (nuovo);
`frontend/src/pages/reports/components/report-columns.tsx`,
`frontend/src/pages/interventions/components/intervention-columns.tsx`,
`frontend/src/pages/collaborators/components/collaborator-detail-columns.tsx`.

---

## 2026-09-10 — Copertura di test completa sul backend

**Cosa.** Il backend aveva test solo su un sottoinsieme di rotte e servizi (soprattutto
autenticazione/sicurezza). Aggiunti 28 nuovi file di test, uno per ogni rotta, servizio e
middleware che ne era privo: le rotte `collaborators`, `technicians`, `notifications`,
`users`, `customers`, `reportTechnicians`, `interventions`, `reports`, `formatting`; i
middleware `requireAuth`, `requestLogger`, `userActionLogger`; e i servizi `companyManager`,
`notificationManager`, `issueCatalog`, `logoManager`, `logManager`, `emailManager`,
`interventionEmail`, `updateManager`, l'intera famiglia di backup (`backupLock`,
`backupFiles`, `backupState`, `backupProcess`, `backupRestore`) e i generatori PDF
(`interventionPdf`, `reportPdf`, `pdf/shared`). La suite passa da 17 a 45 file, da un centinaio
a **543 test**, tutti verdi; `tsc --noEmit` ed `eslint` puliti.

**Il perché.** "Abbiamo dei test per tutto?" — no: gran parte della logica di business
(validazioni, regole di stato, generazione PDF, backup/restore, invio email) non aveva
nessuna rete di sicurezza contro le regressioni.

**Le scelte.** Stessa convenzione già in uso: query layer e dipendenze esterne (fs,
child_process, nodemailer, sharp, pdfmake, drizzle `db`) mockate con `vi.mock`, nessun
Postgres richiesto in CI. Per i generatori PDF (`pdfmake`) non si verifica il rendering
reale — mockato interamente — ma solo la struttura condizionale del documento (quali sezioni
compaiono con quali dati) e le stringhe che vi finiscono dentro.

**Trovato nel farlo, e corretto.** `backupRestore.ts`: `performRestore` chiamava
`prepareRestoreSource` *fuori* dal blocco `try/finally` che circonda l'operazione. Un
archivio senza `dump.sql` veniva rifiutato prima che il lock di restore potesse essere
rilasciato da `endRestore()` — il lock restava quindi acquisito indefinitamente e bloccava
ogni backup/restore successivo finché non si riavviava il processo. Spostata la chiamata
dentro il `try`: ora anche questo fallimento rilascia il lock e viene registrato in
`lastRestoreStatus`/`lastRestoreError` come ogni altro errore di ripristino. Il test che lo
documentava (`backupRestore.test.ts`) ora verifica il comportamento corretto.

**Ancora da fare.** Il frontend resta scoperto quasi ovunque: solo `LoginPage` tra le pagine,
pochi hook/lib condivisi, 4 componenti su una trentina. Vedi la nota nella memoria del
progetto (`project_quality_backlog`) per l'elenco completo lasciato per una sessione futura.
- File: `backend/src/**/*.test.ts` (28 nuovi file, elencati sopra).

---

## 2026-09-10 — La scheda del collaboratore: due sezioni a tabella al posto dei riquadri

**Cosa.** [CollaboratorPage](../frontend/src/pages/collaborators/CollaboratorPage.tsx) ha ora
due sezioni, "Report del collaboratore" e "Interventi del collaboratore", ciascuna con il
proprio filtro di stato, la propria impaginazione e le proprie righe per pagina. Le schede
`CardReport` sono sparite — insieme al componente, che non aveva altri usi — e al loro posto
ci sono due `EntityTable`, le stesse degli elenchi principali. Le colonne stanno in
[collaborator-detail-columns.tsx](../frontend/src/pages/collaborators/components/collaborator-detail-columns.tsx).

**Il perché.** Gli interventi mancavano del tutto. Il collaboratore è la persona che li
esegue — `collaboratorId` è obbligatorio su ogni intervento, non facoltativo come sul report
— ma la sua scheda mostrava solo i report: per sapere cosa avesse in agenda bisognava tornare
all'elenco generale e cercarlo a mano. Il dato c'era, la strada per arrivarci no.

I riquadri, poi, erano l'unica lista dell'applicazione a non essere una tabella. Mostravano
tre campi (cliente, dispositivo, stato) e non potevano mostrarne altri senza diventare
cartelloni: niente telefono, niente difetto, niente data, e niente colonne da allargare.
Ognuno occupava un riquadro fisso di 384x200px per tre righe di testo, contro le poche decine
di pixel di una riga di tabella. Ora le colonne sono sette più le azioni, uguali per nome e
formato a quelle degli elenchi report e interventi.

**Le scelte.** Le due sezioni impaginano separatamente, con chiavi distinte
(`collaborator-reports`, `collaborator-interventions`): sfogliare i report non deve riportare
gli interventi alla prima pagina, e chi guarda venti report per volta non vuole per forza
venti interventi. Ogni tabella scorre orizzontalmente per conto suo, perché il contenitore
del layout ha `overflow-x` nascosto e allargando le colonne le taglierebbe.

Filtro e impaginazione sono del server, tramite il nuovo parametro `collaboratorId` (voce
qui sotto): la pagina non si porta più in memoria l'elenco completo dei report per filtrarlo
nel browser. Cliente, dispositivo e difetto arrivano già risolti dentro i DTO delle liste,
quindi non servono più nemmeno `listCustomers` e `listDevices` per ricostruire due nomi. Al
posto dello spinner a tutta pagina ci sono ora gli scheletri di riga delle due tabelle, come
in tutti gli altri elenchi; lo spinner resta solo finché non si conosce il nome del
collaboratore, che è l'intestazione della pagina.

La corrispondenza stato -> colore degli interventi era ricopiata in ogni lista che li mostra
e sarebbe diventata la terza copia: ora sta in
[lib/interventions.ts](../frontend/src/lib/interventions.ts) (`interventionStatusColor`,
`interventionAccentClassName`) e la usano anche l'elenco interventi e gli interventi del
cliente.

**Ancora da fare.** Le liste dentro le schede di cliente e tecnico restano tabelle scritte a
mano, senza colonne ridimensionabili: la scheda collaboratore era la terza di quelle elencate
nella voce dell'8 settembre, e ora è coperta.
- File: `frontend/src/pages/collaborators/CollaboratorPage.tsx`,
  `frontend/src/pages/collaborators/components/collaborator-detail-columns.tsx`,
  `frontend/src/lib/interventions.ts`,
  `frontend/src/pages/interventions/components/interventions-table.tsx`,
  `frontend/src/pages/customers/CustomerInterventionsPage.tsx`,
  `frontend/src/components/cardReport.tsx` (eliminato).

---

## 2026-09-10 — Le liste per collaboratore si filtrano sul server

**Cosa.** Le rotte `GET /api/reports` e `GET /api/interventions` accettano `collaboratorId`,
che diventa un confronto esatto nel `where` della query. La scheda del collaboratore lo usa
per entrambe le sezioni e impagina lato server con `usePaginatedRows`, come gli elenchi
principali.

**Il perché.** La pagina chiedeva l'elenco *completo* e lo filtrava nel browser. Ma "completo"
senza paginazione si ferma a `unpaginatedMaxRows` — 5000 righe della tabella intera, un tetto
che esiste apposta per non caricare in memoria l'intero database. Sul database di sviluppo, che
ha 20000 report, il collaboratore con 1198 report ne mostrava **305**: le prime cinquemila
righe per data di creazione, filtrate, e in fondo alla pagina il conteggio diceva 305 senza il
minimo segnale che il resto fosse stato tagliato via. Un numero sbagliato che sembra giusto è
peggio di un errore: nessuno va a controllarlo.

Il tetto era già stato pensato per questo — tronca e scrive un warning nei log — e infatti il
warning c'era, a ogni apertura della scheda. Il difetto non era il tetto ma il chiamante:
filtrare nel client una lista che il server sa filtrare significa scaricare 5000 righe per
mostrarne dieci, e sbagliare il conteggio appena la tabella cresce.

**Le scelte.** Il parametro sta accanto a `customerId`, che nel livello query esisteva già ma
non era esposto sulle rotte di lista (lo usavano solo le stampe): stessa forma, stessa
validazione (`z.coerce.number().int().positive().optional()`), nessun join in più — la colonna
sta sulla tabella dei report e su quella degli interventi. Le stesse schede di cliente e
tecnico continuano a filtrare nel browser e hanno lo stesso difetto: sono la prossima voce del
backlog prestazioni.

**Verificato** contro il database di sviluppo: `collaboratorId=13` risponde `totalItems` 1198
per i report e 564 per gli interventi, esattamente i valori di `select count(*)`; con
`visibility=open` risponde 181, di nuovo il conteggio esatto. In pagina: contatori 1198 e 564,
pagina 2 dei report che non muove la sezione interventi, filtro "Report aperti" che porta il
contatore a 181 con tutte le righe in stato "Aperto". Quattro test sulle rotte
(`collaboratorFilter.test.ts`) coprono l'inoltro del parametro e il rifiuto di un id non
valido.
- File: `backend/src/db/queries/report.ts`, `backend/src/db/queries/intervention.ts`,
  `backend/src/routes/reports.ts`, `backend/src/routes/interventions.ts`,
  `backend/src/routes/collaboratorFilter.test.ts`, `frontend/src/lib/api/reports.ts`,
  `frontend/src/lib/api/interventions.ts`,
  `frontend/src/pages/collaborators/CollaboratorPage.tsx`.

---

## 2026-09-10 — Le larghezze delle colonne restano dove le si lascia

**Cosa.** Al primo trascinamento si salva il layout **intero** della tabella e non la sola
colonna spostata, e la rimisurazione innescata dal caricamento dei font avviene una volta
sola invece che a ogni `loadingdone`.
[useResizableColumns](../frontend/src/hooks/useResizableColumns.ts) espone
`resolveWidthsToPersist`, che è la funzione pura in cui vive la regola (e ha i suoi test).

**Il perché.** Le colonne mai toccate non avevano una voce salvata e ricadevano sulla
larghezza *naturale*, che non è una costante: la decide il browser sul contenuto della
pagina che si sta guardando in quel momento. Sistemata una colonna e tornati nella scheda,
quella restava larga com'era stata lasciata e tutte le altre no — misurate su righe diverse,
si spostavano da sole. Il risultato era una sistemazione a metà, che è il modo peggiore di
non funzionare: sembra che il salvataggio non abbia tenuto.

La seconda causa era `loadingdone`, che si ripete a ogni faccia del font che finisce di
caricare — i sottoinsiemi Unicode di Inter arrivano quando compare il primo carattere che li
richiede, quindi anche minuti dopo l'apertura. Ogni ripetizione azzerava le larghezze
naturali e rifaceva il layout sulle righe di quel momento: le colonne si spostavano sotto gli
occhi di chi stava leggendo. Una sola rimisurazione basta allo scopo per cui era stata
introdotta (correggere quella fatta con il font di ripiego, vedi la voce dell'8 settembre) e
si salta del tutto se una misura non c'è ancora, perché in quel caso avverrà già con il font
giusto.

**Le scelte.** La colonna elastica ("Azioni") resta fuori dal salvataggio: non ha una
larghezza propria per definizione. Il doppio click sulla maniglia continua a riportare la
colonna alla larghezza naturale, con la differenza che ora quel valore viene congelato
insieme al resto del layout invece di restare libero di cambiare: è la stessa scelta di
fondo, la stabilità vale più dell'adattamento automatico. Le chiavi salvate restano quelle
delle colonne, quindi una colonna aggiunta o rinominata non eredita per sbaglio la misura di
un'altra: semplicemente non ha ancora una voce.

**Verificato** con i test della funzione pura (`useResizableColumns.test.ts`) e con Playwright
su Edge, sulla scheda del collaboratore. Il test in browser include la controprova, senza la
quale non direbbe niente: ricaricando la stessa pagina con un numero diverso di righe, il
salvataggio vecchio stile (solo `{customer: 273}`) fa derivare sei colonne su otto —
"Dispositivo" +16px, "Difetto" -12px, "Telefono" -5px — mentre con il layout completo si
muove solo la colonna elastica, di 2px, che è il suo mestiere. Dopo il trascinamento la voce
salvata contiene tutte e sette le colonne non elastiche, e al ricaricamento la deriva è zero
su tutte.
- File: `frontend/src/hooks/useResizableColumns.ts`,
  `frontend/src/hooks/useResizableColumns.test.ts`, `frontend/src/lib/theme.ts`.

---

## 2026-09-09 — Gli spinner girano anche con le animazioni ridotte

**Cosa.** L'eccezione a `prefers-reduced-motion` in `frontend/src/index.css` ora vale per
ogni elemento con la classe `animate-spin`, non solo per quelli marcati a mano con
`data-slot="spinner"`.

**Il perché.** Sulle postazioni che hanno chiesto al sistema operativo di ridurre le
animazioni (su Windows: Impostazioni > Accessibilità > Effetti visivi > Effetti di
animazione) la regola generica azzerava anche la rotazione dei caricamenti. L'unico spinner
esentato era quello di `loadingPage`, perché l'esenzione era legata a un attributo da
ricordarsi di scrivere: lo spinner del blocco "Aggiornamento in corso" non ce l'aveva e
restava immobile per tutti i minuti dell'aggiornamento, proprio mentre la pagina chiedeva
di non chiudere né ricaricare. Uno spinner fermo è il segnale universale di applicazione
bloccata: sulla macchina da cui si lancia l'aggiornamento dava l'impressione che fosse
andato storto, mentre dalle altre postazioni — senza motion ridotto — lo stesso blocco
girava regolarmente.

**Le scelte.** Ancorare l'eccezione alla classe invece che all'attributo la rende valida per
gli spinner che ci sono oggi (blocco occupato, pulsante di aggiornamento elenchi, toast di
caricamento) e per quelli che verranno, senza dipendere dalla memoria di chi li scrive.
`data-slot="spinner"` resta nel selettore per gli indicatori che non usano la utility di
Tailwind. Il resto della regola non cambia: le animazioni decorative restano azzerate, si
toglie il movimento inutile, non l'informazione.

---

## 2026-09-09 — L'email al cliente: data al posto del numero, logo e testo riscritto

**Cosa.** L'email che accompagna il PDF dell'intervento è stata rifatta: niente più numero
interno, l'intervento è identificato dalla sua data nell'oggetto, nel corpo e nel nome del
file allegato; il corpo è HTML, con il logo del laboratorio in testa e i recapiti in fondo;
il testo è stato riscritto. `emailManager` ha imparato a mandare HTML e allegati inline.

**Il perché.** `Intervento #42` è un dato del database, non un'informazione per chi legge: il
cliente non ha modo di sapere cosa sia il 42, mentre la data gli dice subito di quale
intervento si parla ed è il criterio con cui archivia i documenti. Per lo stesso motivo
l'allegato ora si chiama `intervento-2026-09-09.pdf` e non `intervento-42.pdf`. Il vecchio
testo, per intero, era «in allegato trova il riepilogo dell'intervento #42»: nessun saluto
d'apertura degno di questo nome, nessun recapito, nessuna traccia visiva del laboratorio,
in un messaggio che è a tutti gli effetti la faccia dell'azienda verso il cliente.

**Le scelte.** Il logo viaggia come allegato inline referenziato via `cid:`, non come URL
remoto né come `data:`: i client di posta bloccano le prime per privacy e non supportano le
seconde (Outlook in testa), il `cid:` è l'unica forma che si vede ovunque senza che il
destinatario debba autorizzare nulla. L'HTML è a tabelle annidate e stili in linea per la
stessa ragione. `text` resta sempre valorizzato accanto a `html`, così chi legge in solo
testo riceve le stesse informazioni e non un messaggio vuoto.

La costruzione del messaggio sta in `interventionEmail.ts` e non nella rotta: la rotta
carica i dati, il modulo decide cosa scrivere: il testo è la parte che verrà ritoccata più
spesso ed è giusto che si trovi in un posto solo. `loadImageDataUrl` è stata spaccata in
`loadImage` (scarica) più il vecchio nome (formatta per pdfmake), così l'email riusa lo
scaricamento invece di dover disfare un data URL.

Quando l'intervento non ha una data pianificata si ripiega su quella di apertura della
scheda: il messaggio deve poter nominare *una* data comunque, e quella è la migliore
disponibile.

**File:** `backend/src/services/interventionEmail.ts` (nuovo),
`backend/src/services/emailManager.ts`, `backend/src/routes/interventions.ts`,
`backend/src/services/pdf/shared.ts`, `backend/src/services/interventionPdf.ts`.

---

## 2026-09-09 — I due bordi in cima si trovano sulla stessa linea

**Cosa.** L'intestazione della barra laterale ha ora un'altezza fissa `h-13`, la stessa
dell'intestazione della pagina in `MainLayout`.

**Il perché.** L'altezza della prima era il risultato del suo contenuto (`py-2` più il logo e
le due righe di testo), quella della seconda era fissata a `h-13`: le due misure coincidevano
per caso, ma non del tutto. Misurato con Playwright sul CSS dell'applicazione: 53px contro
52px, cioè i due bordi inferiori — che sono affiancati e a tutta larghezza — disegnavano una
linea spezzata di un pixel a metà schermo. Dopo la correzione entrambe misurano 52px.

**Le scelte.** L'altezza fissa sta sull'intestazione della barra, non sul contenuto: così
resta uguale anche in modalità icona, dove il logo cresce a `size-9`. Un commento nel codice
lega esplicitamente le due `h-13`, perché sono due file diversi e la seconda non si scopre
leggendo il primo.

**File:** `frontend/src/components/main-sidebar.tsx`.

---

## 2026-09-09 — Le righe-scheletro non seguono più "Tutte"

**Cosa.** `EntityTable` disegna al massimo 15 righe-scheletro, qualunque numero le passi la
pagina.

**Il perché.** Lo scheletro introdotto poche ore prima disegnava una riga per ogni riga per
pagina. Con 10 o 50 è la cosa giusta — occupa lo spazio che i dati occuperanno — ma "Tutte"
vale 5000 (`allTableRowsPageSize`), quindi aprire una lista con quella preferenza costruiva
**45.016 nodi animati prima ancora che i dati arrivassero**. Misurato: thread principale
bloccato per oltre tre minuti, la pagina sembrava piantata. Valeva per tutte e sette le liste;
è comparso sui clienti perché è lì che quella preferenza era impostata.

**Le scelte.** Il tetto sta in `EntityTable` e non nei chiamanti, così vale per tutte le liste
comprese quelle che verranno: passare le proprie righe per pagina resta la cosa giusta da fare
per chi chiama, ed è il componente a sapere che oltre lo schermo non serve. Dopo la correzione i
nodi di scheletro sono 151.

**Quello che resta, e che c'era già.** Con "Tutte" la tabella disegna comunque 5000 righe vere,
cioè circa 540.000 nodi, e il blocco resta di circa tre minuti: quel costo non dipende da questa
modifica — il diff del percorso che disegna le righe vere è invariato rispetto a 661c68e — ma con
i volumi attuali (migliaia di record) quella voce del menu è di fatto inutilizzabile. Va
affrontata a parte, con la virtualizzazione delle righe o abbassando il tetto di
`allTableRowsPageSize`.

---

## 2026-09-09 — Revisione UI/UX: accessibilità, stati di caricamento, validazione dei form

**Cosa.** Diciotto correzioni emerse da una revisione dell'interfaccia condotta con la skill
`ui-ux-pro-max` (database locale di linee guida UX, interrogato per stack React). Le tre più
sostanziali: il velo di caricamento non copre più la pagina a ogni ricerca, lo stato dei report
è scritto e non solo colorato, e gli errori di validazione dei dialoghi stanno sotto il campo
che li riguarda invece che in un toast.

### Caricamenti: primo caricamento e ricarica non sono la stessa cosa

**Il perché.** [usePaginatedRows.ts](../frontend/src/hooks/usePaginatedRows.ts) esponeva un solo
`isLoading`, e tutte le pagine-lista lo usavano per alzare un `LoadingPage` con
`absolute inset-0 bg-background/70 backdrop-blur-sm`. Quel velo copriva tutta la pagina — campo
di ricerca compreso — e siccome `isLoading` è vero anche per le *ricariche*, digitando nella
ricerca compariva a ogni pausa di battitura (300ms di debounce). Il div non aveva
`pointer-events-none`, quindi durante quel lampo il campo in cui si stava scrivendo non era
nemmeno cliccabile.

**Le scelte.** L'hook distingue ora `isInitialLoading` da `isRefetching`:

- **primo caricamento** → righe-scheletro in tabella (`Skeleton`, che il progetto aveva già in
  `components/ui` e che non usava nessuno) e schede-scheletro su mobile;
- **ricarica** → i dati precedenti restano visibili e leggibili, appena attenuati
  (`opacity-60`), con `aria-busy` sulla tabella.

Misurato con Playwright su `/reports`: lo spostamento verticale del layout al primo caricamento
scende **da 510px a 80px**, perché lo scheletro occupa lo spazio che i dati occuperanno; durante
la ricerca l'opacità va a 0.6 senza velo e il campo resta cliccabile per tutta la durata.

`isInitialLoading` è `!hasLoadedOnce` e non `isLoading && !hasLoadedOnce`: fra il montaggio e la
partenza effettiva della richiesta c'è una finestra in cui `isLoading` è ancora falso, e
sull'elenco report bastava a far lampeggiare "Nessun report disponibile." un istante prima dei
dati. `hasLoadedOnce` si segna nel `finally`, non solo in caso di successo, altrimenti un primo
caricamento fallito lascerebbe lo scheletro per sempre.

Stessa logica per il calendario ([useCalendarInterventions.ts](../frontend/src/pages/calendar/hooks/useCalendarInterventions.ts))
e per le statistiche della dashboard: lì il velo copriva le frecce con cui si cambia mese, ed è
proprio il cambio mese a ricaricare.

La transizione di rotta finta di [MainLayout.tsx](../frontend/src/pages/MainLayout.tsx) — un velo
di 150ms fissi a **ogni** navigazione, anche a pagina già pronta — è sostituita da un confine
`Suspense` attorno all'`Outlet`. Le rotte sono già `lazy` in `App.tsx`, ma quel `Suspense` sta
sopra le rotte: mentre arrivava il chunk faceva sparire anche barra laterale e intestazione.
Ora l'attesa si vede solo quando c'è davvero, e la struttura dell'applicazione resta in piedi.

### Accessibilità

**Il perché.** Sull'elenco report aperto/chiuso era comunicato **solo** dal colore della riga
(WCAG 1.4.1): invisibile a chi non distingue i due colori, e perso in stampa. La scheda cliente
aveva già una colonna "Stato" con le parole giuste; l'elenco principale no.

**Le scelte e il resto degli interventi.**

- Colonna **Stato** ("Aperto"/"Chiuso") in [report-columns.tsx](../frontend/src/pages/reports/components/report-columns.tsx),
  con la stessa formulazione della scheda cliente.
- **Skip link** "Vai al contenuto" come primo elemento focusabile: con nove voci di barra
  laterale servivano una dozzina di tab per arrivare alla tabella, a ogni pagina.
- La **paginazione** era fatta di `<a href="#">` con il click annullato. Le voci disabilitate
  restavano raggiungibili col tab (`opacity-50` e `pointer-events-none` non tolgono il focus da
  tastiera) e si annunciavano come collegamenti. Ora sono `<button disabled>`, con lo stato
  disabilitato nativo. La pagina corrente usa la variante piena invece del solo bordo:
  `outline` contro `ghost` era un pixel di contorno per l'unico elemento che dice dove sei.
- Il conteggio "Visualizzati 1-10 di 16" diventa `role="status"`: è già la frase giusta nel
  momento giusto, e copre ricerca, filtri e cambio pagina per chi usa uno screen reader. Prima
  la tabella si rinnovava in silenzio.
- **`document.title` per pagina** ([useDocumentTitle.ts](../frontend/src/hooks/useDocumentTitle.ts)):
  è un gestionale che si usa con più schede aperte, e si chiamavano tutte "EasyLab".
- **`prefers-reduced-motion`** non compariva in tutta la codebase. La regola azzera animazioni e
  transizioni, con un'eccezione dichiarata: gli indicatori di caricamento (`data-slot="spinner"`)
  continuano a girare, più lentamente. Motion ridotto vuol dire togliere il movimento inutile,
  non l'informazione.
- `LoadingPage` era un'icona e nient'altro: per uno screen reader la pagina risultava vuota. Ora
  è `role="status"` con etichetta.
- `<Label>` usata come testo dentro i pulsanti (e come titolo delle card della dashboard)
  produceva un `<label>` senza `htmlFor` annidato in `<button>`: HTML non valido, e in alcuni
  screen reader il pulsante viene letto due volte. Sostituita con `<span>` in sei punti.

### Colori delle azioni

**Il perché.** Le icone stampa/email erano scritte a mano nei componenti come `text-yellow-400`
e `text-sky-500`. Misurato: **1.57:1** e **2.71:1** su fondo chiaro, contro i **3:1** che WCAG
1.4.11 chiede agli oggetti grafici.

**Le scelte.** Due token semantici `--action-print` e `--action-email` in
[index.css](../frontend/src/index.css), più scuri in tema chiaro (3.26:1 e 4.05:1) e coi valori
vividi originali in tema scuro (12.68:1 e 7.33:1). Il giallo resta all'hue 85 e non scivola
nell'arancione, per la stessa ragione già annotata sopra le righe di stato.

I colori **delle righe** non sono stati toccati: la scelta del giallo vivo, contrasto compreso, è
già dichiarata voluta nel commento in `index.css`.

### Form: l'errore accanto al campo

**Il perché.** Tutta la validazione dei dialoghi passava per `toast.error`: un avviso in alto,
che sparisce da solo dopo qualche secondo e non dice *quale* campo sia il problema. Su
`editReportDialog` erano dieci controlli in fila, ciascuno con un `return`: con tre campi da
sistemare servivano tre salvataggi per scoprirli tutti.

**Le scelte.** [FormField](../frontend/src/components/form-field.tsx) e `FieldError`, più gli
helper in [lib/formField.ts](../frontend/src/lib/formField.ts) (separati perché un file di
componenti deve esportare solo componenti, altrimenti il refresh rapido di Vite ricarica la
pagina intera). Applicati a tutti e nove i dialoghi di creazione e modifica:

- il messaggio sta sotto il campo, collegato con `aria-describedby`, e resta finché non si
  corregge;
- gli errori si raccolgono **tutti in una passata** invece di uscire al primo;
- il focus va sul primo campo da correggere;
- i campi obbligatori portano l'asterisco e "(obbligatorio)" per gli screen reader;
- i toast restano per gli errori che non appartengono a un campo: il rifiuto del server, la rete.

`getInterventionValidationError` in [lib/interventions.ts](../frontend/src/lib/interventions.ts)
ora restituisce **quale** campo è invalido insieme al messaggio: era già condiviso fra i due
dialoghi dell'intervento, e col campo lo stesso messaggio finisce sotto il controllo giusto in
entrambi. `InputWithAdd` e `DatePickerField` accettano le due proprietà aria necessarie.

Sui campi che contengono dati di **altre** persone (nome e telefono di clienti, tecnici,
collaboratori) è stato messo `autoComplete="off"`: il completamento automatico proponeva lì i
dati di chi sta al computer.

### Ricerca ed elenchi

- Il pulsante X della ricerca compariva **anche a campo vuoto**, dove premerlo non faceva niente.
  Ora appare solo con del testo, Esc svuota il campo e il focus ci torna dentro. Aggiunti
  `type="search"` (che su mobile porta il tasto "Cerca" sulla tastiera) e `aria-label`; la X
  nativa di Chrome è nascosta in `index.css` per non averne due. Su mobile il campo prende lo
  spazio che resta invece di stare fisso a 240px.
- Una ricerca senza esiti dice ora `Nessun risultato per "..."` invece del generico "Nessun
  dispositivo disponibile.": sono due vuoti diversi.
- Il doppio click per aprire la riga funzionava su due tabelle su sette, perché
  [entity-crud-table.tsx](../frontend/src/components/entity-crud-table.tsx) non inoltrava
  `onRowOpen`. Ora è uniforme. Resta un'aggiunta per il mouse: da tastiera la scheda si apre col
  pulsante "Apri", che c'è esattamente dove c'è il doppio click — preferito ad aggiungere un
  punto di tabulazione per ogni riga.
- Le schede su mobile riversavano tutte le colonne come coppie etichetta/valore dello stesso
  peso: su un report sono dieci righe senza un punto da cui iniziare a leggere. Con
  `titleColumnKey` la colonna del cliente diventa il titolo della scheda (report e interventi;
  per i clienti il nome è diviso su due colonne, quindi resta com'era).

**Verifica.** 67 test verdi, `tsc`, `eslint` e `prettier --check` puliti; oltre a questo, 18
controlli condotti sull'applicazione in esecuzione con Playwright (colonna Stato, paginazione a
pulsanti, `role="status"`, skip link, campo di ricerca cliccabile durante la digitazione, errore
inline collegato al campo, contrasto delle icone, motion ridotto) e le misure di layout citate
sopra.

---

## 2026-09-09 — I suggerimenti dei campi con ricerca compaiono solo quando si digita

**Cosa.** Il menu a tendina di [inputWithAdd.tsx](../frontend/src/components/inputWithAdd.tsx)
non si apre più al solo ricevere il fuoco: resta chiuso finché il campo è vuoto e compare
alla prima lettera scritta. Con esso sparisce anche la ricerca "a vuoto" che partiva
all'apertura del dialogo.

**Il perché.** Aprendo il dialogo di creazione di un report il fuoco va sul campo cliente, e
l'elenco si srotolava subito coprendo i campi sotto: otto nomi presi dal catalogo che non
hanno ancora filtrato niente, da scavalcare per arrivare al resto del modulo. Lo stesso
capitava nel dialogo dell'intervento e sui campi dispositivo e difetto del report, che
pescavano dalle opzioni locali con `options.slice(0, 8)`.

**Le scelte.** Il controllo sta in un unico punto — `hasQuery` nel componente condiviso — così
vale per tutte e quattro le caselle senza toccare i dialoghi. Il riquadro non viene proprio
disegnato quando non c'è niente da mostrare (`hasSuggestions`), invece di disegnarne uno
vuoto alto pochi pixel.

L'effetto di ricerca esce subito quando la query è vuota: i risultati della digitazione
precedente restano in stato ma non si vedono, perché è `filteredOptions` a scartarli finché
il campo è vuoto. Scritto così, e non azzerando lo stato dentro l'effetto, perché la regola
`react-hooks/set-state-in-effect` vieta il `setState` sincrono in un effetto.

Il fuoco continua ad aprire l'elenco quando il campo ha già del testo: serve a chi ci torna
sopra per correggere una scelta.

**Effetto collaterale utile.** Una chiamata a `GET /customers` in meno per ogni apertura dei
dialoghi di report e intervento.

---

## 2026-09-09 — La voce "Altro" del catalogo difetti non si può più perdere

**Cosa.** Il difetto "Altro" non si elimina e non si rinomina, non se ne può creare un
secondo, e se manca viene ricreato all'avvio del server — come già succede per l'utente
amministratore. Nella pagina Difetti quella riga porta il contrassegno "voce fissa" e non
mostra i pulsanti di modifica ed eliminazione.

**Il perché.** Con la modifica di poco prima, "Altro" ha smesso di essere una voce come le
altre: è quella che fa comparire, nel dialogo del report, la casella con cui si descrive il
problema a mano — e quel testo è l'unico che finisce sulla ricevuta del cliente. Toglierla
dal catalogo non avrebbe dato nessun errore: il programma avrebbe continuato a funzionare
stampando ricevute meno utili, e capire perché sarebbe stato tutt'altro che immediato.

**Le scelte.** Il riconoscimento resta sul nome, in
[issueCatalog.ts](../backend/src/services/issueCatalog.ts) sul server e in
[lib/issues.ts](../frontend/src/lib/issues.ts) nel client. L'alternativa considerata era
marcarla nel database — una colonna booleana con un indice unico parziale che ne imponesse
una sola — che avrebbe permesso anche di rinominarla; è stata scartata perché "Altro" va bene
com'è, e il nome congelato è esattamente ciò che queste protezioni impongono. Se un giorno
servisse rinominarla, quella è la strada.

Il confronto è senza maiuscole perché **il vincolo di unicità di Postgres non lo è**: senza,
"altro" e "Altro" convivrebbero e nel dialogo del report sembrerebbero entrambe la voce
generica, con l'esito che dipende dall'ordine della lista.

Le guardie stanno in `extraRoutes`, registrate prima delle rotte generate da
`createCrudRouter`: controllano e proseguono con `next()`, così la logica CRUD resta una
sola. Un test fissa anche che non si mangino i 400 che spettano a un corpo malformato — un
errore di battitura del client non deve diventare un 409 incomprensibile.

**In interfaccia i pulsanti spariscono invece di restare a raccogliere rifiuti**, e il
contrassegno "voce fissa" dice perché: senza una parola lì accanto, una riga senza pulsanti
sembrerebbe un difetto dell'elenco e non una scelta.

**Verificato davvero:** la voce è stata cancellata dal database e ricreata al riavvio; via
API sono state respinte l'eliminazione, la rinomina, la creazione di un secondo "altro" e la
promozione di un difetto qualunque a "ALTRO"; un difetto normale si crea ed elimina come
prima. I test nuovi sono stati verificati mutando il codice.

---

## 2026-09-09 — Sulla ricevuta il cliente leggeva "Altro" al posto del suo problema

**Cosa.** Il campo difetto del report diventa due campi. La casella con il **+** resta
scrivibile ma ora serve solo a **cercare** nel catalogo: quello che si scrive deve
corrispondere a una voce, e per una voce nuova c'è il pulsante. Quando il difetto scelto è
**"Altro"** compare sotto una casella "Problema riscontrato", obbligatoria, ed è quella che
finisce sulla ricevuta. La stessa casella c'è ora anche nel dialogo di modifica.

**Il perché.** Il modo di lavorare del laboratorio era: difetto "Altro", problema vero
scritto nelle Note. Il risultato, verificato generando un PDF reale, era una ricevuta che
diceva:

```
Problema riscontrato
Altro
Note
Si spegne da solo dopo 10 minuti, anche con la batteria carica
```

Il problema del cliente c'era, ma sotto l'etichetta sbagliata, mentre la riga che prometteva
di descriverlo diceva "Altro". Il motivo stava nel dialogo: **una casella sola** faceva sia
da ricerca nel catalogo sia da descrizione, quindi `issueDescription` finiva per essere quasi
sempre una copia dell'etichetta di catalogo.

**Le scelte.** I due campi hanno destinatari diversi e ora si vede: `issueId` è per il
laboratorio (la colonna "Difetto" nell'elenco, il raggruppamento), `issueDescription` è per
il cliente (l'unica cosa che compare sul PDF — la rotta di stampa non faceva nemmeno il join
con la tabella dei difetti). Fuori da "Altro" `issueDescription` resta vuoto invece di
duplicare l'etichetta, e il PDF stampa l'etichetta stessa: per un difetto di catalogo è già
una descrizione, e ripeterla in due colonne non aggiungeva niente.

**Niente migrazione.** I report esistenti hanno `issueDescription` uguale all'etichetta, e la
regola "stampa il testo se c'è, altrimenti l'etichetta" li lascia identici a prima.

**Cade anche la divergenza fra le due pagine.** Non potendo più scrivere un difetto fuori
catalogo, non c'è più niente da decidere quando non si trova: `unknownIssue` sparisce, e il
difetto si comporta come cliente e dispositivo — se non esiste, il salvataggio si ferma e lo
dice. Le voci di catalogo si creano solo di proposito, col **+**.

**Da sapere:** la regola si regge sul fatto che nel catalogo esista una voce chiamata
"Altro", riconosciuta dal testo ([lib/issues.ts](../frontend/src/lib/issues.ts)) perché la
tabella non ha una colonna che la marchi come speciale. Rinominarla o cancellarla dalla
pagina Difetti farebbe sparire la casella del problema, senza errori.

**Una duplicazione tolta di conseguenza.** Le tre pagine da cui si modifica un report — la
scheda, l'elenco, la scheda tecnico — costruivano lo stesso payload di aggiornamento in tre
copie identiche. Aggiungere `issueDescription` voleva dire ricordarsi di tre punti, e
dimenticarne uno non avrebbe rotto niente in compilazione, perché nel payload i campi sono
tutti facoltativi: sarebbe stato un campo che non si salva. Ora è `toReportUpdatePayload` in
[lib/reportForm.ts](../frontend/src/lib/reportForm.ts), con un test che elenca cosa deve
arrivare all'API.

**Verificato nel browser, e sulle ricevute.** Difetto normale: la casella non compare e
`issue_description` resta vuoto nel database; "Altro" senza testo: il salvataggio si ferma;
"Altro" con testo: la ricevuta stampa il problema; difetto fuori catalogo: rifiutato e il
catalogo non viene toccato; modifica: il testo si corregge e la ricevuta cambia. I due PDF,
prima e dopo, sono stati generati e guardati. I test nuovi sono stati verificati mutando il
codice.

---

## 2026-09-09 — Quattro colori principali in più: da cinque a nove

**Cosa.** In Impostazioni > Tema si aggiungono **Oliva**, **Mattone**, **Viola** e
**Grafite** ([theme.ts](../frontend/src/lib/theme.ts)). L'elenco a schermo non è cambiato:
legge l'array, quindi bastava aggiungere i preset.

**Il perché.** I cinque colori esistenti lasciavano scoperti tre settori della ruota — niente
viola, niente rosso pieno, niente verde-giallo — e nessuna opzione neutra per chi preferisce
un'interfaccia senza un colore dominante. Le nuove tinte sono state scelte proprio per
riempire quei buchi, non a caso: rispetto alle tinte già presenti stanno a 52°, 51°, 27° e
(Grafite) fuori discorso, perché con il 17% di saturazione si legge come grigio.

**Il contrasto è stato calcolato, non giudicato a occhio.** Sul colore principale ci va sopra
il testo bianco dei pulsanti: i quattro nuovi stanno fra 4,65 e 7,53 contro il bianco, tutti
sopra il migliore dei preesistenti tranne Grafite che è il più alto di tutti. Un test in
[theme.test.ts](../frontend/src/lib/theme.test.ts) fissa la soglia a 3,5 per l'intera palette,
così un colore troppo chiaro non può più entrare per distrazione.

**Una cosa da sapere, non toccata:** il preset **Ambra** è il più debole della palette
(3,64) e non passerebbe la soglia 4,5 richiesta per il testo piccolo — i pulsanti di
quest'app usano testo grande, dove la soglia è 3, quindi è a norma, ma è il colore meno
leggibile. È rimasto com'è di proposito: cambiarlo cambierebbe l'aspetto a chi l'ha già
scelto. Se lo si vuole scurire, è una riga.

**Le scelte.** L'ordine nell'elenco segue la tinta (blu → verde-azzurro → verde → oliva →
ambra → mattone → rosa → viola), con Grafite in fondo perché è l'unico senza tinta: a schermo
la griglia si legge come una ruota di colori invece che come un elenco casuale. Grafite tiene
comunque grafici colorati, con saturazione bassa ma tinte ben separate: un accento neutro non
è una richiesta di grafici grigi, che sarebbero illeggibili.

**Verificato nel browser:** le nove voci a schermo, i quattro colori nuovi che scrivono le
variabili giuste e restano salvati dopo un ricaricamento, il ritorno al predefinito che
rimuove le variabili inline, e il colore effettivamente dipinto su sidebar e pulsanti
(`rgb(109, 74, 175)` per Viola, cioè esattamente `#6D4AAF`). Tre dei quattro test nuovi sono
stati verificati mutando il codice.

---

## 2026-09-09 — Le quattro pagine di anagrafica erano quattro copie della stessa pagina

**Cosa.** Tecnici, Collaboratori, Dispositivi e Difetti non hanno più una pagina ciascuna:
condividono [SimpleEntityPage](../frontend/src/components/simple-entity-page.tsx) e
[EntityCrudTable](../frontend/src/components/entity-crud-table.tsx), e i quattro file di
pagina sono diventati una trentina di righe di configurazione l'uno. Spariti anche i quattro
`*-table.tsx`, identici a meno dell'etichetta di accessibilità. In tutto il ramo di lavoro:
1248 righe tolte, 496 aggiunte, con dentro dei test in più.

**Il perché.** Erano identiche riga per riga a meno dei nomi dei campi e delle scritte —
stessa ricerca con debounce, stessa paginazione, stessi tre dialoghi, stessa gestione degli
errori. È la stessa duplicazione che il backend aveva già tolto con `createCrudRouter` e che
le tabelle avevano già tolto con `EntityTable`; qui restava la pagina. E stava già facendo
danno: in tre pagine su quattro c'era un `useEffect` di troppo che ricaricava la lista subito
dopo il caricamento iniziale — **due richieste a ogni apertura invece di una**, verificato nel
browser prima e dopo (4 → 2 conteggiando il raddoppio di StrictMode). In `CollaboratorsPage`
quell'`useEffect` non c'era: nessuno se n'era accorto perché non c'è modo di accorgersene
guardando una copia alla volta.

**Le scelte.** Restano fuori di proposito Clienti, Report e Interventi: hanno filtri,
ordinamenti e azioni di riga davvero propri, e ridurli a configurazione costerebbe più di
quanto farebbe risparmiare. Il pulsante "Apri" è una proprietà facoltativa e non una
costante, perché solo tecnici e collaboratori hanno una scheda. Le scritte sono passate una
per una come stringhe invece di essere derivate dal nome dell'entità: in italiano cambiano
articolo e genere ("il tecnico", "la segnalazione"), e indovinarle sarebbe stato più fragile
che scriverle.

**Verificato nel browser**, non solo con i test: giro completo crea → cerca → modifica →
elimina su Dispositivi con controllo delle righe nel database, presenza del pulsante "Apri"
dove serve e assenza dove non serve, e nessun errore in console.

---

## 2026-09-09 — I valori dei form non passano più da `Record<string, string>`

**Cosa.** Ogni dialogo dichiara il tipo dei valori che consegna (`DeviceSubmitValues`,
`CustomerSubmitValues`, `CreateReportSubmitValues`, …), come già facevano
`editReportDialog` e `createInterventionDialog`. Spariti i 56 `String(values.nomeCampo)`
sparsi nelle pagine, e con loro l'idioma
`String(values.x).trim() === "" ? null : String(values.x).trim()`, ora
[trimOrNull](../frontend/src/lib/utils.ts).

**Il perché.** In una codebase per il resto rigorosa — TypeScript strict, zod su ogni rotta —
i nomi dei campi dei form erano l'unico punto in cui un refuso **non rompeva la
compilazione**: diventava un `"undefined"` salvato nel database, o un ramo di codice che non
si esegue mai.

**E infatti ce n'era uno.** Appena messo il tipo, il compilatore ha segnalato che la
Dashboard leggeva `values.saveIssueInCatalog`, un campo che il dialogo **non manda**. Quel
ramo era morto: `Boolean(undefined)` è sempre falso, quindi da anni la Dashboard non creava
mai il difetto scritto a mano e cadeva sempre sul ripiego "Altro". Nessuno poteva vederlo
leggendo il codice, perché leggerlo non bastava.

---

## 2026-09-09 — Creare un report faceva due cose diverse a seconda della pagina

**Cosa.** La risoluzione di cliente, dispositivo e difetto sta ora in un posto solo,
[lib/reportCreation.ts](../frontend/src/lib/reportCreation.ts), con il confronto sui nomi dei
clienti in [lib/customers.ts](../frontend/src/lib/customers.ts). Pagina Report e Dashboard la
chiamano entrambe.

**Il perché.** Erano due copie della stessa funzione, allontanatesi nel tempo, e la
differenza non l'aveva decisa nessuno:

- **Il cliente.** La pagina Report lo cercava ignorando accenti, maiuscole e spazi doppi, e
  segnalava i casi ambigui; la Dashboard faceva un confronto esatto fra stringhe, quindi
  falliva su "Nicolò" scritto in un modo invece che in un altro.
- **Il difetto.** La pagina Report metteva a catalogo il testo digitato; la Dashboard puntava
  alla voce "Altro" (per via del ramo morto della voce qui sopra).
- **`formatCustomerOption`**, cioè come il cliente viene scritto nella casella, esisteva in
  **tre** copie identiche — dialogo, pagina Report, Dashboard. Devono per forza restare
  uguali, perché è la stringa con cui il testo digitato viene poi ricercato: tre copie erano
  tre occasioni di romperlo in silenzio.

**Le scelte.** Il confronto migliore (quello della pagina Report) vale ora anche sulla
Dashboard: è un miglioramento netto, e riguarda comunque solo il ramo di ripiego, quello che
scatta quando il dialogo non è riuscito a risolvere l'id da solo. La differenza sul difetto
invece **è rimasta**, ma come opzione con un nome — `unknownIssue: "create"` per la pagina
Report, `"fallbackToAltro"` per la Dashboard — perché quale delle due sia giusta è una
decisione di prodotto, non una da prendere di nascosto dentro un refactoring. Ora è scritta
in un posto solo e si vede.

**Verificato nel browser:** creazione di un report da entrambe le pagine, controllando nel
database che il difetto finisca a catalogo dalla pagina Report e che dalla Dashboard il
report punti ad "Altro" lasciando il catalogo intatto.

---

## 2026-09-09 — Le liste annullano la richiesta superata, non si limitano a ignorarla

**Cosa.** [usePaginatedRows](../frontend/src/hooks/usePaginatedRows.ts) e
[useCalendarInterventions](../frontend/src/pages/calendar/hooks/useCalendarInterventions.ts)
creano un `AbortController` per ogni richiesta e annullano la precedente; il `signal` arriva
fino ad axios attraverso le funzioni di lista. Viene annullata anche la richiesta ancora in
volo quando si cambia pagina.

**Il perché.** La guardia sull'id introdotta a luglio scartava le risposte superate, il che
basta alla correttezza ma non ferma il lavoro già avviato: il server portava a termine ogni
ricerca, comprese quelle di cui nessuno avrebbe letto il risultato — e una ricerca libera sui
report è la query più cara dell'applicazione. Cambiare pagina mentre una lista carica è il
caso più comune di tutti.

**Le scelte.** Il ramo `signal.aborted` nel `catch` non è ridondante con la guardia sull'id:
la richiesta annullata allo smontaggio **è** ancora la più recente, quindi senza quel
controllo l'annullamento verrebbe scambiato per un errore di rete e mostrerebbe un avviso
rosso a chi ha semplicemente cambiato pagina. Due test lo fissano, uno per ciascuno dei due
casi.

**Quanto rende, onestamente.** Nel browser si vede soprattutto sul cambio pagina, che è
deterministico: la richiesta in volo risulta `net::ERR_ABORTED` e nessun avviso compare.
Digitando nella ricerca gli annullamenti sono pochi, perché il debounce da 300 ms fa già la
maggior parte del lavoro e le richieste raramente si sovrappongono davvero.

---

## 2026-09-09 — Il totale dei report non ripete più i join che non gli servono

**Cosa.** Due modifiche in [report.ts](../backend/src/db/queries/report.ts). Il compenso del
tecnico si legge con un join diretto sulla chiave primaria di `report_technician` invece che
con una sottoquery `GROUP BY`; il conteggio totale della pagina non porta con sé i join di
cliente, dispositivo e difetto quando non c'è una ricerca libera.

**Il perché.** La sottoquery, per restituire le dieci righe di una pagina, aggregava l'intera
tabella `report_technician` e poi buttava via decine di migliaia di righe. Il `GROUP BY` era
inutile fin dalla migration 0004, che ha reso `report_id` da solo la chiave primaria: un
report ha al massimo una riga lì, quindi non c'è niente da sommare. Il conteggio invece
univa tabelle che servono a *mostrare* un report, non a contarlo — e `device_id`, `issue_id`
e `customer_id` sono NOT NULL con vincolo di chiave esterna, quindi quelle inner join non
possono né scartare né duplicare righe. Il pianificatore elimina da solo le left join
inutilizzate, ma non le inner join: quelle andavano tolte scrivendole.

**Misurato su questa macchina, 20.000 report** (prima/dopo, stesso database, stesso momento):
query della pagina 16,0 → 2,1 ms; conteggio 25,8 → 3,4 ms. Sull'API, dall'host: pagina Report
39,4 → 21,9 ms p50, cinquanta righe per pagina 60,8 → 31,6 ms. **Le statistiche della
dashboard non si sono mosse** (32,5 → 32,3 ms): lì la somma percorre comunque tutti i report,
quindi il join diverso non cambia niente — la modifica ci sta per coerenza, non per velocità.

**Da ricordare:** se un giorno tornassero più tecnici per report, la chiave primaria tornerebbe
composta e quel join andrebbe rifatto sottoquery con `sum(price)`. Il conteggio senza join
vale solo sul ramo senza ricerca: con una ricerca libera le condizioni parlano proprio di
quelle tabelle, e i join restano.

---

## 2026-09-09 — Test su `authManager`, il file che decide chi entra

**Cosa.** [authManager.test.ts](../backend/src/services/authManager.test.ts): 12 test su
`login` e `getSessionUser`. Il backend passa da 151 a 163 test.

**Il perché.** Era il file più grande del backend (727 righe) e l'unico davvero critico
rimasto senza test. Le sue dipendenze erano coperte — `totp`, `recoveryCodes`,
`twoFactorChallenge`, `loginRateLimit`, `passwordPolicy`, `secretCrypto` — ma non le decisioni
prese *intorno* a loro, che sono quelle spiegate nei commenti e che quindi nessuno avrebbe
notato se qualcuno le avesse tolte: la password esca verificata anche quando lo username non
esiste (senza, il tempo di risposta rivela quali account esistono), il secondo fattore
annunciato solo a password già valida, il segreto TOTP illeggibile che azzera la 2FA invece di
chiudere fuori l'utente, la sessione scaduta o dell'utente disattivato cancellata al primo
accesso, il token salvato solo come hash.

**Le scelte.** `authManager` è l'unico servizio che parla con il database senza passare dal
query layer, quindi qui il mock è di `db` stesso: un costruttore di query concatenabile che
restituisce le righe preparate dal test per quella coppia operazione+tabella. Non riproduce
SQL, e non serve — quello che va fissato non sono le query. La CI continua a non aver bisogno
di un Postgres.

**I test sono stati verificati mutando il codice**, perché un test con molti mock può passare
a vuoto: tolta la password esca, salvato il token in chiaro, non cancellata la sessione
scaduta e reso errore il segreto illeggibile, ogni mutazione ha fatto fallire esattamente il
test che la riguarda e nessun altro.

---

## 2026-09-09 — La CI era rossa su `main`, e `cloudflared` si aggiornava da solo

**Cosa.** Due correzioni piccole e indipendenti. Una riga di
[ReportsPage.tsx](../frontend/src/pages/reports/ReportsPage.tsx) non era formattata secondo
prettier, quindi il passo `npm run format:check` del job frontend **falliva da `78586b2`**;
e `cloudflared` in [docker-compose.yml](../docker-compose.yml) era fissato a `latest`, ora a
`2026.8.3`.

**Il perché.** La CI rossa non era stata notata perché in locale, su Windows, `format:check`
segnala comunque dei file per via dei fine riga, quindi il rumore copriva il segnale. Su
`latest` invece una versione nuova di cloudflared entrava in produzione da sola al primo
`up --build` dell'aggiornamento automatico: senza che nessuno l'avesse decisa e senza comparire
in nessun diff — esattamente il motivo per cui nginx sta su `1.31-alpine`, come argomenta il
commento in `frontend/Dockerfile`. La stessa attenzione mancava alla riga accanto.

**Le scelte.** cloudflared usa versioni a data e non offre un tag "minore" a cui agganciarsi,
quindi aggiornarlo è per forza una modifica esplicita di quella riga. È il comportamento
voluto: il costo è ricordarsene, il guadagno è che nessuna versione entra in produzione senza
che qualcuno l'abbia scelta.

---

## 2026-09-09 — Uno stato "running" rimasto appeso non blocca più il programma per sempre

**Cosa.** [check-updates.sh](../scripts/check-updates.sh), che gira 5 minuti dopo l'avvio del
server e poi ogni 30 minuti, quando trova lo stato su `running` non si limita più a farsi da
parte: chiede a systemd se `easylab-update.service` sta davvero girando e, se non sta girando,
chiude quello stato come fallito, con un messaggio che dice cos'è successo.

**Il perché.** `running` lo scrive `update-server.sh` quando parte e lo riscrive alla fine,
quindi un aggiornamento interrotto di forza — corrente che va via, VM riavviata, processo
ucciso — lo lasciava lì per sempre: nessuno lo cancellava, né il controllo periodico (che si
fermava apposta per non disturbare) né l'app (che rifiuta di intervenire mentre risulta un
aggiornamento in corso). Il difetto c'era già e costava l'impossibilità di lanciare un nuovo
aggiornamento; da quando ogni sessione mostra il blocco a schermo è diventato caro davvero,
perché blocca tutte le postazioni finché qualcuno non corregge il file a mano sulla VM.

**Le scelte.** Il recupero sta nello script del controllo periodico e non in una nuova unità
systemd, così i server già installati lo prendono con il solo aggiornamento del codice, senza
rifare la procedura di installazione. Chi decide se l'aggiornamento è vivo è systemd e non un
tempo massimo arbitrario: un'unità `Type=oneshot` resta `activating` per tutta la durata del
suo script, quindi `activating`, `active`, `reloading` e `deactivating` valgono tutti come
"in corso" e lo stato non viene toccato. Se `systemctl` non risponde affatto — non c'è
systemd, oppure l'aggiornamento è stato lanciato a mano fuori dall'unità — non c'è prova che
lo stato sia un residuo e lo script si tira indietro: meglio un blocco da rimuovere a mano
che sbloccare tutti nel mezzo di un aggiornamento vero.

---

## 2026-09-09 — L'aggiornamento blocca tutte le postazioni, non solo quella che lo avvia

**Cosa.** Ogni scheda autenticata interroga ogni 5 secondi la nuova rotta
`GET /api/settings/update-state` ([settings.ts](../backend/src/routes/settings.ts)) e, se sul
server è in corso un aggiornamento, mostra lo stesso blocco a schermo già usato da chi l'ha
lanciato; quando l'aggiornamento riesce ricarica la pagina da sola. Il tutto sta in
[useUpdateWatcher](../frontend/src/hooks/useUpdateWatcher.ts), agganciato a
[MainLayout](../frontend/src/pages/MainLayout.tsx).

**Il perché.** Il blocco era stato React locale del pannello Impostazioni: lo vedeva solo il
browser che aveva premuto "Aggiorna adesso". Con il programma aperto su due PC, l'altro
continuava a lavorare mentre i container venivano ricostruiti — scrivendo nel database
proprio mentre giravano le migrazioni — e a fine aggiornamento restava con il bundle vecchio
in pagina, che parla con un backend nuovo.

**Le scelte.** La rotta sta sopra il `requireAdmin` del router impostazioni, accanto a
`/company` e `/logo`: serve a chiunque sia autenticato, perché è chiunque che deve fermarsi.
Restituisce solo `state` — commit installato, log ed errore restano su `/update`, riservata
all'amministratore — e un test lo fissa, così non diventa per sbaglio la versione libera di
`/update`. È in `ignoredPaths` di [requestLogger](../backend/src/middleware/requestLogger.ts)
per lo stesso motivo di `/api/health`: interrogata ogni 5 secondi da ogni scheda, riempirebbe
i log senza dire niente. Un errore di rete non toglie il blocco (durante la ricostruzione dei
container il backend *non risponde*: è la normalità, non la fine dei lavori) e un
aggiornamento fallito lo toglie senza ricaricare, perché non c'è niente di nuovo da caricare
e il ricaricamento butterebbe via l'errore mostrato a chi l'ha lanciato.

**Fuori perimetro, di proposito.** Il pannello Impostazioni resta com'era: mostra il blocco
subito al clic, senza aspettare il giro di interrogazione, e continua a seguire l'esito per
i suoi avvisi. La sorveglianza globale riafferma il blocco a ogni giro, quindi se il pannello
lo toglie perché ha smesso di aspettare, entro 5 secondi torna su.

---

## 2026-09-09 — Pulsante di aggiornamento accanto alla ricerca

**Cosa.** In tutte le pagine con elenco (Clienti, Interventi, Report, Dispositivi, Tecnici,
Collaboratori, Difetti) e nel pannello Log delle impostazioni, il pulsante di aggiornamento
dati (`RefreshButton`) si è spostato dall'intestazione della pagina alla riga dei filtri,
subito a sinistra della casella di ricerca. Nell'intestazione resta solo il pulsante di
creazione.

**Il perché.** Il pulsante viveva accanto ad azioni distruttive/di creazione in alto a destra,
lontano dalla ricerca e dai filtri che è più naturale voler "far ripartire" insieme a lui.
Accostarlo alla casella di ricerca lo rende parte del blocco filtri, coerente con il flusso:
cerca/filtra, poi aggiorna se serve.

---

## 2026-09-08 — Note sugli interventi, in scheda, dialoghi e PDF

**Cosa.** Gli interventi hanno un campo `note`: testo libero facoltativo, disponibile per
qualunque tipo e qualunque stato. Compare come campo nei dialoghi di creazione e modifica
(sotto la descrizione del lavoro), come voce "Note" nella card Dettagli di
[InterventionPage](../frontend/src/pages/interventions/InterventionPage.tsx), e come sezione
"NOTE" nel PDF dell'intervento, dopo "ORE TECNICI" e prima delle diciture di legge. Nuova
migrazione [0024_add_intervention_note.sql](../backend/drizzle/0024_add_intervention_note.sql).

**Il perché.** Fra "problema riscontrato" e "assistenza effettuata" non c'era posto per quello
che non è né l'uno né l'altro: accordi presi col cliente, materiale lasciato in prestito da
riportare, promemoria per il passaggio successivo. Finiva schiacciato dentro la descrizione,
mescolato al lavoro svolto, e sul foglio che il cliente firma non si distingueva.

**Le scelte.** Il campo è `text` come `description` e `problem` — non `varchar(255)` come la
nota dei report — perché convive con quei due e ne condivide il limite di 4000 caratteri in
validazione. È facoltativo sempre: a differenza di `problem` non dipende dal tipo, e a
differenza di `description` non diventa obbligatorio quando l'intervento esce da
"programmato"; una nota per definizione può non esserci. Stringa vuota e campo assente
diventano entrambi NULL, come già fa `description`. Nel PDF è una sezione a sé e non una riga
dentro "REPORT ATTIVITA", perché è informazione di natura diversa e chi firma deve
distinguerla a colpo d'occhio; quando la nota manca la sezione sparisce del tutto, come già
fa il problema riscontrato — una barra "NOTE" seguita dal vuoto è peggio che niente.

**Fuori perimetro, di proposito.** La colonna non entra nella lista interventi (la tabella ha
già nove colonne) né fra i campi cercati dalla ricerca: `report.note` ha un indice trigram
perché la ricerca report lo interroga, qui aggiungerlo vorrebbe dire allargare la `OR` della
ricerca interventi, che è già uno dei punti aperti sulle prestazioni. Non entra nemmeno nel
PDF riepilogativo degli interventi per cliente, che è una tabella a sei colonne già fitta.

**Verificato in locale**: creazione via API con nota (201, valore riletto identico), PDF 200
`application/pdf` che cresce di 353 byte con la nota e torna al valore precedente quando la
si azzera, sezione "NOTE" confermata visivamente rendendo il PDF con PDF.js, voce "Note"
presente nella card Dettagli, valore precaricato correttamente nel dialogo di modifica, e
campo presente anche per "consegna materiale" (dove "Problema" giustamente non c'è).

**Nota per chi applica la migrazione.** Il registro delle migrazioni sta nello schema
`drizzle`, non in `public`: lo stack applica le migrazioni con `node migrate.js`
(docker-compose, sia dev sia produzione), che usa il migrator di `drizzle-orm` con la tabella
di default. Lo script `npm run db:migrate` usa invece `drizzle.config.ts`, dove
`migrations.schema` è `public`: punta a un registro vuoto e tenterebbe di riapplicare l'intera
storia dalla 0000. Usare `node migrate.js`.
- File: `backend/drizzle/0024_add_intervention_note.sql`, `backend/drizzle/meta/_journal.json`,
  `backend/src/db/schema.ts`, `backend/src/routes/interventions.ts`,
  `backend/src/services/interventionPdf.ts`, `frontend/src/lib/api/interventions.ts`,
  `frontend/src/components/dialogs/create/createInterventionDialog.tsx`,
  `frontend/src/components/dialogs/edit/editInterventionDialog.tsx`,
  `frontend/src/pages/interventions/InterventionPage.tsx`.

## 2026-09-08 — Colonne delle tabelle ridimensionabili trascinando l'intestazione

**Cosa.** Le sette liste principali (interventi, report, clienti, collaboratori, tecnici,
dispositivi, difetti) hanno le colonne trascinabili per il bordo destro dell'intestazione. La
larghezza è ricordata per tabella in `localStorage`, doppio click sulla maniglia riporta la
colonna alla larghezza naturale, e le frecce sinistra/destra la regolano da tastiera di 16px
per volta (la maniglia è un `role="separator"` raggiungibile con Tab). Nuovo hook
[useResizableColumns](../frontend/src/hooks/useResizableColumns.ts), usato da
[entity-table.tsx](../frontend/src/components/entity-table.tsx), che è il punto in cui tutte e
sette convergono; le chiavi di salvataggio sono le stesse già usate per le righe per pagina
("interventions", "customers", ...).

**Il perché.** Le colonne erano dimensionate dal browser sul contenuto della pagina corrente,
senza nessun modo di dare più spazio a quella che serve. La conseguenza non ovvia è che
trascinare un bordo richiede larghezze esplicite, quindi `table-layout: fixed`: le tabelle non
si auto-dimensionano più sul contenuto e un valore più lungo della sua colonna viene troncato
con i puntini invece di allargarla. Per non cambiare l'aspetto a chi non trascina niente le
larghezze di partenza non sono inventate — si lascia fare il primo render in `auto`, si misura
quello che il browser ha deciso e solo allora si passa a `fixed` con quelle stesse misure, il
tutto in `useLayoutEffect`, cioè prima del paint.

**La trappola dei font.** La misurazione va fatta a font caricato, altrimenti congela le
larghezze del font di ripiego (più stretto) e il testo resta troncato per sempre: "Data/Orario"
nasceva a 178px invece dei 186px che le servono, e l'ID "4982" si leggeva "49...".
`document.fonts.ready` **non** risolve il problema, perché si risolve appena non c'è nessun
caricamento in corso e Inter parte solo quando la tabella disegna il primo testo — misurato in
Edge: `ready` risolta a 919ms, il font carica tra 3988ms e 4196ms, la misurazione nel mezzo a
3977ms. L'unico segnale affidabile è l'evento `loadingdone`, alla cui ricezione si azzerano le
larghezze naturali: la tabella torna in `table-layout: auto` per un render — l'unico modo di
rimisurare, perché una tabella già a larghezze fisse restituirebbe quelle stesse larghezze — e
la misura riparte con il font vero.

**Scelte di dettaglio.** La colonna "Azioni" non ha maniglia e non ha larghezza propria: è la
colonna elastica che assorbe lo spazio avanzato, necessaria perché con `table-layout: fixed`
una tabella più larga della somma delle colonne ridistribuirebbe il resto da sola, allargando
in modo arbitrario tutte le altre. È anche l'unica cella esclusa dal troncamento, dove
`overflow: hidden` taglierebbe i contorni di focus dei pulsanti. Minimo 56px per colonna. Si
misura solo con righe vere sotto le intestazioni: su una tabella vuota le colonne verrebbero
larghe quanto il loro titolo. Le larghezze salvate sono solo quelle effettivamente trascinate,
così una colonna aggiunta o rinominata non eredita per sbaglio la misura di un'altra. Su
mobile non cambia niente: sotto `sm` le righe sono già schede e la tabella non è nemmeno resa.

**Verificato in locale** con Playwright su Edge, sulla pagina Interventi: trascinamento di
+120px che sposta esattamente quella colonna e lascia le altre invariate (delta 0 sulla
colonna ID), persistenza dopo reload, minimo a 56px con ellissi confermata
(`clientWidth` 55 < `scrollWidth` 92), doppio click che riporta a 144px cioè la larghezza
naturale, nessuna maniglia sull'ultima colonna con i 5 pulsanti azione tutti presenti, e a
480px di viewport tabella non resa con le 10 schede al suo posto. Nessuna cella troncata nello
stato iniziale.

**Ancora da fare.** Le tabelle scritte a mano fuori da `EntityTable` non sono coperte:
Impostazioni (utenti, log, backup, tema) e le liste dentro le schede di cliente,
collaboratore e tecnico. L'hook è generico apposta, ma ognuna va adattata a parte perché ha
i suoi `<TableHead>` inline.
- File: `frontend/src/hooks/useResizableColumns.ts`, `frontend/src/components/entity-table.tsx`,
  `frontend/src/lib/theme.ts`, `frontend/src/pages/*/components/*-table.tsx`.

## 2026-09-08 — `.env.example` con valori segnaposto invece di configurazioni reali

**Cosa.** I valori di [.env.example](../.env.example) non sono più quelli di una
configurazione funzionante (`easylab`, `easylab_password`, `easylab_db`, `EasyLab`,
`info@easylab.local`, `/opt/easylab-web/backups`) ma segnaposto costruiti sul nome della
variabile in minuscolo: `postgres_user`, `postgres_password`, `postgres_db`, `lab_name`,
`lab_address`, `lab_logo_text`, `lab_email@example.com`, `/path/to/backup_host_dir`.
Restano invariate le due voci in cui il valore *è* la configurazione corretta e non un
esempio: `PUBLIC_DOMAIN` (vuoto, lo scrive `install-tunnel.sh`) e `LAB_LOGO_URL`
(`/assets/logo.jpg`, il percorso servito dal backend). Aggiunta in testa una nota che
spiega la natura del file e rimanda a `scripts/edit-env.sh` per i default veri.

**Il perché.** Un file di esempio con valori plausibili si copia e si dimentica: `cp
.env.example .env` produceva uno stack che parte, quindi niente spingeva a cambiare la
password del database, che restava `easylab_password` anche in produzione. Con segnaposto
evidenti la sostituzione diventa un passo obbligato e visibile, e il file torna a fare solo
il mestiere per cui esiste — elencare le chiavi e il loro formato. I default operativi non
si perdono: `scripts/edit-env.sh` li propone già uno per uno nel prompt interattivo, che è
il percorso consigliato dal README subito dopo la copia.

**Compatibilità.** Nessun consumatore legge i valori di `.env.example`: `edit-env.sh` e
`restore-db.sh` hanno i propri default interni, e la CI usa il file solo come sorgente di
variabili per `docker compose --env-file .env.example build`. Verificato con `docker compose
--env-file .env.example config -q` (esce senza errori: `BACKUP_HOST_DIR` resta un percorso
assoluto non vuoto, requisito del bind mount `${BACKUP_HOST_DIR}:/app/backups`).
- File: `.env.example`.

## 2026-09-08 — Stato dell'intervento come card, pillole ridondanti rimosse

**Cosa.** `InterventionPage` mostrava sopra la griglia le stesse tre pillole che il 2026-09-07
sono state tolte da `ReportPage`: "Creato:", "Aggiornato:" e lo stato dell'intervento. Le
pillole sono state rimosse e lo stato è diventato la prima card della griglia, che passa da
`xl:grid-cols-4` a `xl:grid-cols-5` per tenere le cinque card su una riga; sotto `xl` resta a
due colonne. Il badge conserva i colori di `statusBadgeClass` (verde completato, ambra in
lavorazione, rosso il resto), invariati in tema chiaro e scuro.

**Il perché.** Erano tutte e tre informazioni duplicate poche righe più in basso: le due date
compaiono tal quali nella card "Dettagli" come "Creato il" e "Ultimo aggiornamento", lo stato
nella card "Anagrafica". Ripeterle in cima non aggiungeva nulla e rubava una fascia di
altezza sopra i dati che contano davvero; lo stato, che è l'unico dato di quel gruppo a
meritare rilievo, ora lo ottiene nel posto dove l'occhio già cerca i numeri della pagina. Le
copie in basso restano: nelle due card di dettaglio servono a leggere l'intervento per intero
senza risalire.

**Coerenza tra le due pagine di dettaglio.** Report e intervento hanno la stessa struttura —
intestazione con azioni, griglia di card numeriche, due card di dettaglio — e ora anche la
stessa prima card. Chi passa dall'una all'altra trova lo stato sempre nello stesso punto.
- File: `frontend/src/pages/interventions/InterventionPage.tsx`.

## 2026-09-08 — Pulsante di aggiornamento dati su tutte le pagine che leggono dal server

**Cosa.** Ogni pagina che mostra dati del server ha ora un pulsante con l'icona di
aggiornamento: elenchi (Dashboard, Report, Interventi, Clienti, Collaboratori, Tecnici,
Dispositivi, Difetti), pagine di dettaglio (report, intervento, cliente, interventi del
cliente, tecnico, collaboratore) e l'elenco utenti in Impostazioni. Il componente condiviso è
[refresh-button.tsx](../frontend/src/components/refresh-button.tsx).

**Il perché.** I dati vengono letti al montaggio della pagina e poi solo quando è la pagina
stessa a modificarli. In laboratorio però lavorano più persone insieme: se qualcun altro chiude
un report o sposta un intervento, chi ha la lista aperta continua a vedere lo stato di dieci
minuti fa, senza alcun segnale che sia successo qualcosa. L'unico rimedio era F5, che ricarica
tutta l'applicazione e **azzera ricerca, filtri e pagina corrente** — cioè fa pagare un
aggiornamento con la perdita del contesto di lavoro. Il pulsante rilegge gli stessi dati con i
parametri già impostati.

**Il pulsante sa aspettare da solo.** `onRefresh` restituisce una promise e il componente si
disabilita finché non si risolve, facendo girare l'icona. Serve a evitare la raffica di click
su una lista lenta: senza, ogni click avvia una richiesta in più e l'ultima che arriva vince —
proprio il tipo di corsa che `usePaginatedRows` scarta con `latestRequestIdRef`. Le pagine che
già tracciano il proprio caricamento passano anche `isRefreshing`, così il pulsante risulta
occupato pure durante i caricamenti che non ha avviato lui.

**Sulle pagine di dettaglio il caricamento iniziale è stato separato dall'aggiornamento
manuale.** Lì `loadData` viveva dentro l'effetto e alzava `isLoading`, che sostituisce l'intera
pagina con lo spinner: riusarlo per il pulsante avrebbe fatto sparire i dati a ogni click.
`loadData` è quindi diventata una `useCallback` che non tocca `isLoading`, ed è l'effetto di
montaggio a gestire lo spinner a tutta pagina. L'aggiornamento manuale lascia il contenuto a
schermo e segnala l'attesa solo nel pulsante.

**Due pulsanti scritti a mano sono spariti.** L'elenco log
([logsSettingsPanel.tsx](../frontend/src/components/settings/logsSettingsPanel.tsx)) e
l'archivio dump ([backupDumpsCard.tsx](../frontend/src/components/settings/backup/backupDumpsCard.tsx))
avevano già ciascuno la propria copia di `Tooltip` + `Button` + `RefreshCw` con
`animate-spin`: ora usano il componente condiviso, che è la stessa ragione per cui esiste
`useSearchableRows`. La taglia dell'icona segue quella del pulsante (20px nelle intestazioni di
pagina, 16px nelle card delle impostazioni), così le due rese restano identiche a prima.

**Test.** [refresh-button.test.tsx](../frontend/src/components/refresh-button.test.tsx) copre il
caso che conta, cioè il doppio click durante una richiesta in corso. Ha richiesto uno stub di
`ResizeObserver` in [test/setup.ts](../frontend/src/test/setup.ts): jsdom non lo implementa e il
Tooltip di Radix lo usa per misurare la freccia, quindi qualunque test che clicchi un pulsante
con tooltip falliva per un motivo che non c'entrava con quello che stava verificando.

---

## 2026-09-08 — Autenticazione a due fattori (TOTP), opzionale per utente

**Cosa.** Ogni utente può attivare da **Impostazioni > Sicurezza** la verifica in due passaggi:
dopo la password, l'accesso chiede un codice a 6 cifre generato da un'app sul telefono. Con
l'attivazione arrivano otto **codici di recupero** monouso, mostrati una volta sola. Chi resta
fuori viene sbloccato da un amministratore (Impostazioni > Utenti > Disattiva 2FA) o, se è
l'ultimo amministratore, da `./scripts/reset-admin-password.sh --reset-2fa` sulla macchina.

**Il perché adesso.** Finché si entrava dalla LAN, una password rubata richiedeva comunque di
essere dentro la rete del laboratorio. Da quando l'app risponde sul dominio pubblico via
Cloudflare Tunnel, il form di login è raggiungibile da chiunque, e fra un estraneo e i dati di
tutti i clienti c'è una sola stringa — che una persona può riusare da un altro sito o farsi
rubare con un phishing. Il limitatore per IP
([loginRateLimit.ts](../backend/src/services/loginRateLimit.ts)) ferma il tentativo a forza
bruta, non la password già nota. Aggrava il quadro il fatto che l'admin può lanciare
l'aggiornamento, che **esegue codice sull'host**, e leggere o ripristinare i backup: un account
admin compromesso non è una fuga di dati, è la macchina. Il piano stava in
[docs/2FA-PLAN.md](2FA-PLAN.md) da mesi; qui vengono realizzate le fasi 1-4, cioè tutto tranne
l'obbligo per l'admin, che è meglio imporre a flusso collaudato.

**TOTP scritto a mano invece che con una libreria.** RFC 6238 è un HMAC-SHA1 su un contatore a
8 byte più un troncamento: [totp.ts](../backend/src/services/totp.ts) sono un centinaio di
righe con `node:crypto`, Base32 compreso. È la stessa scelta già fatta per scrypt e AES-GCM, e
il guadagno vero è che si verifica contro i **vettori ufficiali della RFC** — sei casi in
[totp.test.ts](../backend/src/services/totp.test.ts), che è una garanzia di correttezza più
forte di "la libreria è popolare", senza aggiungere una dipendenza sul percorso critico del
login. L'unica dipendenza nuova è `qrcode`, per il QR.

**Lo stato "password ok, manca il codice" sta in memoria, non nel database.**
[twoFactorChallenge.ts](../backend/src/services/twoFactorChallenge.ts) è calcato su
`loginRateLimit.ts`: mappa con TTL di 5 minuti, tetto ai tentativi e tetto alle entry.
L'alternativa — una colonna `pending_totp` su `session` — sopravviverebbe al riavvio, ma
metterebbe in giro un cookie di sessione **non ancora valido**, da ricontrollare in
`requireAuth` a ogni richiesta dell'app: molta più superficie per un errore che vale un
accesso. Costo accettato: al riavvio del backend chi era a metà login ridigita la password.

**Il primo passo non consegna nessun cookie.** È la differenza fra una porta chiusa e una
schermata da saltare, ed è anche l'errore che un giorno si reintrodurrebbe rifattorizzando
`login()`. Per questo `login` restituisce un'unione discriminata invece di una sessione, e
[routes/auth.test.ts](../backend/src/routes/auth.test.ts) asserisce esplicitamente
`set-cookie` assente sul ramo `twoFactorRequired`.

**410 e non 401 per il challenge morto.** Un codice sbagliato è 401 ("riprova"); un challenge
scaduto o bruciato dai tentativi è **410** ("non c'è più niente da verificare, ricomincia dalla
password"). Sono due comportamenti diversi nell'interfaccia, e la prima versione li distingueva
confrontando il testo italiano del messaggio — che è scritto per le persone e cambierà. Da qui
`getApiErrorStatus` in [lib/api/errors.ts](../frontend/src/lib/api/errors.ts), accanto a
`getApiErrorMessage` che invece lo stato lo scarta di proposito.

**Il caso che decideva se il lavoro era fatto bene: il ripristino su una macchina nuova.** Il
segreto è cifrato con `secretCrypto`, la cui chiave (`data/secret.key`) è **esclusa dai backup
di proposito**, mentre i segreti cifrati stanno nel dump. Ripristinato altrove, nessuno di essi
si decifra: trattarlo come un errore avrebbe lasciato fuori dall'app chiunque avesse la 2FA
attiva — e se era l'admin, senza nessuno che potesse sbloccarlo. `readTotpSecret` quindi azzera
la 2FA, lascia entrare con la sola password e scrive una notifica in-app, la stessa scelta già
fatta per la password del NAS in [backupState.ts](../backend/src/services/backupState.ts).

**Tre cose che sembravano dettagli e non lo erano.** *(a)* `totp_last_step` sulla tabella
`user`: un codice vale trenta secondi, e senza ricordare l'ultimo passo accettato chi lo
intercetta può rigiocarlo finché è vivo. *(b)* `startTwoFactorSetup` **rifiuta** di generare un
nuovo segreto se la 2FA è già attiva: senza quel controllo la sola password basterebbe a
sostituirla, e la 2FA non proteggerebbe dal caso per cui esiste. *(c)*
`requirePasswordChangeCompleted` è montato su `/api` **dopo** l'auth router, quindi le rotte di
autenticazione ne sono esenti per costruzione — giusto per login e cambio password, sbagliato
per le rotte 2FA, dove la guardia è ripetuta a mano e un test la sorveglia.

**Il consumo di un codice di recupero è una query sola.** `UPDATE ... WHERE used_at IS NULL
RETURNING id` in [queries/recoveryCode.ts](../backend/src/db/queries/recoveryCode.ts): con una
lettura seguita da una scrittura, due richieste in parallelo spenderebbero due volte lo stesso
codice. Del codice resta in tabella solo lo sha256, come per i token di sessione — sono già 40
bit casuali, non c'è niente da indovinare a forza bruta e non serve il costo di scrypt.

**Lato interfaccia** il login diventa a due passi dentro la stessa card, con il challenge nello
stato della pagina e **non** nel contesto di autenticazione: non è una sessione, e tenerlo lì
avrebbe significato uno stato di autenticazione a metà visibile a tutta l'app. "Sicurezza" è la
prima sezione personale delle impostazioni oltre al tema, quindi resta fuori da
`adminOnlySections`. Il blocco "valore più bottone copia" è stato estratto da
`generatedPasswordDialog` in [copyableValue.tsx](../frontend/src/components/dialogs/settings/copyableValue.tsx),
perché ormai serviva in tre punti.

**Cosa resta fuori.** L'obbligo di 2FA per l'admin (fase 5 del piano), da imporre dopo aver
collaudato il flusso opzionale: è l'account che vale la pena rubare, ma è anche l'unico che può
sbloccare gli altri. Restano fuori anche WebAuthn/passkey, l'OTP via email e il "ricorda questo
dispositivo".

**Verificato.** 149 test backend (erano 137) e 51 frontend (erano 45), typecheck e lint puliti
su entrambi i progetti. I test nuovi coprono i vettori RFC, il rifiuto del passo già usato, la
morte del challenge dopo cinque tentativi, l'assenza di cookie al primo passo e il rimbalzo del
frontend alla password sul 410. **Da fare a mano prima di considerarla in produzione:**
attivazione con un'app reale, login da telefono, e un ripristino di backup con `secret.key`
diversa.

**File:** [backend/src/services/totp.ts](../backend/src/services/totp.ts),
[recoveryCodes.ts](../backend/src/services/recoveryCodes.ts),
[twoFactorChallenge.ts](../backend/src/services/twoFactorChallenge.ts),
[authManager.ts](../backend/src/services/authManager.ts),
[db/queries/recoveryCode.ts](../backend/src/db/queries/recoveryCode.ts),
[db/schema.ts](../backend/src/db/schema.ts),
[drizzle/0023_add_user_totp.sql](../backend/drizzle/0023_add_user_totp.sql),
[routes/auth.ts](../backend/src/routes/auth.ts), [routes/users.ts](../backend/src/routes/users.ts),
[reset-admin-password.js](../backend/reset-admin-password.js),
[scripts/reset-admin-password.sh](../scripts/reset-admin-password.sh),
[frontend/src/lib/api/twoFactor.ts](../frontend/src/lib/api/twoFactor.ts),
[lib/api/auth.ts](../frontend/src/lib/api/auth.ts), [lib/api/errors.ts](../frontend/src/lib/api/errors.ts),
[components/auth-provider.tsx](../frontend/src/components/auth-provider.tsx),
[pages/auth/LoginPage.tsx](../frontend/src/pages/auth/LoginPage.tsx),
[components/settings/securitySettingsSection.tsx](../frontend/src/components/settings/securitySettingsSection.tsx),
[components/settings/usersSettingsSection.tsx](../frontend/src/components/settings/usersSettingsSection.tsx),
[pages/settings/SettingsPage.tsx](../frontend/src/pages/settings/SettingsPage.tsx),
più i dialoghi in `components/dialogs/settings/` e il README.

---

## 2026-09-08 — Opzione "Tutte" nel selettore delle righe per pagina

**Cosa.** "Righe per pagina" ha ora una quarta voce, **Tutte**, accanto a 10 / 20 / 50. Scelta
quella, la tabella mostra l'intero elenco su una pagina sola: i controlli di pagina spariscono
da soli e il conteggio legge "Visualizzati 1-16 di 16". Come le altre voci, la scelta è
ricordata per singola tabella.

**Il perché di un numero e non di un valore `"all"`.** La strada apparentemente più pulita era
aggiungere `"all"` alla `TableRowsPerPageKey`. Ma `pageSize` non vive in un posto solo:
attraversa dodici pagine, i rispettivi hook di caricamento, i parametri della richiesta e il
calcolo di "Visualizzati X-Y di Z". Una stringa in mezzo a quei numeri avrebbe richiesto un
caso speciale in ognuno di quei punti — dodici occasioni di dimenticarne uno. Con
`allTableRowsPageSize` (un numero) non cambia niente a valle: `totalPages` diventa 1 e la barra
si adatta da sé, con la logica che c'era già.

**L'altra strada scartata, che era una trappola.** Il backend sa già rispondere senza
paginazione se si omettono `page`/`pageSize` (`takeUnpaginated`), e sembrava il posto giusto
dove agganciare "Tutte". Ma in quel caso la risposta cambia **forma** — array semplice invece
di `items + totalItems` — e ogni tabella avrebbe dovuto gestirle entrambe. Peggio:
[routes/reports.ts](../backend/src/routes/reports.ts) usa la presenza di quei parametri per
decidere il `visibility` predefinito (`all` senza paginazione, `open` con), quindi passare a
"Tutte" sui report avrebbe **cambiato in silenzio quali report si vedono**. Mandare un
`pageSize` grande evita entrambe le cose: stessa forma di risposta, stessi filtri.

**Il tetto è uno solo, condiviso.** Lo zod delle rotte di lista fermava `pageSize` a 1000, che
avrebbe respinto "Tutte" con un 400. Ora il tetto è `maxPageSize` in
[db/queries/pagination.ts](../backend/src/db/queries/pagination.ts), definito come lo stesso
numero di `unpaginatedMaxRows` (5000): è la stessa domanda ("quante righe può chiedere una
schermata in un colpo solo") e due costanti diverse si sarebbero prima o poi contraddette.
Il tetto valeva in due schemi, quello condiviso e quello dei log in `settings.ts`: aggiornati
entrambi.

**Oltre le 5000 righe "Tutte" non mostra tutto — ma degrada bene.** `totalPages` torna a 2 e i
controlli di pagina riappaiono, quindi le righe restano raggiungibili invece di sparire senza
avviso. Da tenere presente che la tabella non è virtualizzata: "Tutte" su una tabella molto
grande disegna davvero tutte le righe nel DOM.

**Verificato.** Test nuovo in [routes/devices.test.ts](../backend/src/routes/devices.test.ts):
`pageSize` pari al tetto passa, il valore successivo dà 400 — le due asserzioni insieme
inchiodano il tetto esatto, così riabbassarlo non passa inosservato. Suite complete verdi (98
backend, 45 frontend) e typecheck pulito sui due progetti. Misurata poi con Playwright la barra
con "Tutte" selezionata: il trigger passa da 52px a 71px, ma il bordo destro resta a **0px** dal
bordo del contenitore — la griglia della voce qui sotto assorbe la differenza.

**File:** [frontend/src/lib/theme.ts](../frontend/src/lib/theme.ts),
[backend/src/db/queries/pagination.ts](../backend/src/db/queries/pagination.ts),
[backend/src/routes/crudRouter.ts](../backend/src/routes/crudRouter.ts),
[backend/src/routes/settings.ts](../backend/src/routes/settings.ts),
[backend/src/routes/devices.test.ts](../backend/src/routes/devices.test.ts).

---

## 2026-09-08 — Barra di paginazione a tre zone: conteggio, pagine al centro, selettore a destra

**Cosa.** Sotto ogni tabella la barra ha ora tre zone distinte: il conteggio "Visualizzati
1-10 di 16" tutto a sinistra, i controlli di pagina **al centro della tabella**, il selettore
"Righe per pagina" tutto a destra. Prima selettore e controlli di pagina stavano appaiati nello
stesso gruppo a destra (vedi la voce del 2026-09-07), e la paginazione risultava sbilanciata.

**Il perché della griglia al posto di `justify-between`.** Con tre figli in un flex
`justify-between` l'elemento centrale non è centrato rispetto al contenitore: è centrato in ciò
che gli avanza fra i due lati, quindi si sposta ogni volta che uno dei due cambia larghezza. E
qui cambiano di continuo — "Visualizzati 1-10 di 16" e "Visualizzati 1-10 di 1.234" non sono
larghi uguali. La griglia `sm:grid-cols-[1fr_auto_1fr]` risolve alla radice: le due colonne
laterali si dividono lo spazio in parti uguali per costruzione, quindi la colonna `auto` di
mezzo cade sempre sull'asse della tabella, qualunque cosa contengano i lati.

**La trappola: i contenitori vuoti.** I due lati sono opzionali — la paginazione non si
renderizza con una pagina sola, il selettore manca dove non è passato `onPageSizeChange`. Se
il contenitore corrispondente non venisse emesso, la griglia riassegnerebbe le colonne per
posizione e il selettore scivolerebbe **al centro**. I contenitori quindi ci sono sempre, e a
gestire i due casi è una coppia di varianti: `empty:hidden` toglie il gap fantasma nello stack
verticale del mobile, `sm:empty:flex` lo rimette in griglia da `sm` in su, dove serve che occupi
la sua colonna anche a larghezza zero.

**Verificato con Playwright, con controllo e casi limite.** Struttura iniettata nella pagina di
login (la dev DB ha 2 righe per tabella: su una pagina sola i controlli non esistono e la
verifica sulla pagina reale non proverebbe nulla — stessa trappola della voce precedente).
Con il fix, su viewport 1280: conteggio a **0px** dal bordo sinistro, centro della paginazione a
**0px** dal centro del contenitore, selettore a **0px** dal bordo destro. Togliendo le classi
nuove a runtime i numeri si muovono di 235px e 876px, cioè il test discrimina davvero. Provati
poi i quattro casi: pagina unica (selettore comunque a filo destro), assenza del selettore
(paginazione comunque centrata), mobile a 420px (impilato, altezza 116px = 20+36+36 più i due
gap) e mobile con pagina unica (altezza 68px, nessun gap di troppo).

**File:** [frontend/src/components/table-pagination.tsx](../frontend/src/components/table-pagination.tsx).

---

## 2026-09-07 — Un intervento programmato non ha più bisogno di orari né di lavoro svolto

**Cosa.** Creando un intervento con stato "Programmato", ora **ora inizio, ora fine e la
descrizione del lavoro svolto** possono restare vuote; le etichette lo dicono con un
"(facoltativo)" che compare e sparisce al cambio di stato. Restano obbligatorie negli stati
"In lavorazione" e "Completato", anche passando per la modifica: chiudere un intervento
lasciando quei campi vuoti viene rifiutato.

**Il perché.** Un intervento programmato descrive un lavoro **non ancora svolto**: l'orario
esatto e l'assistenza effettuata sono informazioni che nascono quando lo si fa, non quando lo
si mette in agenda. Obbligarle in fase di programmazione costringeva a inventare un testo e
un orario, cioè a scrivere nel database qualcosa di falso pur di poter salvare.

**Il problema riscontrato resta invece obbligatorio**, e non è un'incoerenza: quello si conosce
già dalla telefonata del cliente ed è esattamente il motivo per cui l'intervento viene
programmato.

**La regola vale anche in modifica, e questa è la parte che rende la cosa sensata.** Se
l'obbligo scattasse solo alla creazione, un intervento nato programmato resterebbe per sempre
senza descrizione anche una volta completato: basterebbe cambiargli stato. Il controllo è
quindi applicato sulla combinazione fra il corpo parziale della richiesta e la riga già
salvata — stesso schema già usato in `reports.ts` per "un report chiuso richiede un
collaboratore" — così al momento del passaggio di stato i campi si compilano nella stessa
richiesta.

**Sul database.** `intervention.description` era `NOT NULL` e diventa facoltativa
([migrazione 0022](../backend/drizzle/0022_intervention_description_optional.sql)), con lo
stesso significato che ha già `problem`: NULL = non ancora noto, non "vuoto". L'obbligo negli
altri due stati è una regola applicativa, non un vincolo della colonna, perché al passaggio di
stato il testo arriva nella stessa richiesta e un vincolo di colonna non saprebbe distinguere
i due momenti. Le stringhe vuote in arrivo vengono normalizzate a NULL, così non esistono due
modi diversi di dire la stessa cosa.

**La regola sta in un punto solo per lato.** Le due finestre (creazione e modifica)
applicavano gli stessi controlli ciascuna per conto proprio, copiati carattere per carattere:
sono confluiti in `getInterventionValidationError`
([lib/interventions.ts](../frontend/src/lib/interventions.ts)), per lo stesso motivo per cui
esiste `DateRangeFilter` — due copie di una regola sono due occasioni perché una cambi da sola.
Il server riapplica comunque tutto.

**Verificato sulle rotte reali**, otto casi: programmato senza orari né descrizione (creato,
`description` e `startTime` a NULL), consegna programmata senza descrizione (creata),
completato senza descrizione (rifiutato), completato senza orari (rifiutato), completato con
tutto (creato), programmato con ora fine prima dell'inizio (rifiutato — la coerenza fra orari
vale anche quando sono facoltativi), chiusura via modifica senza compilare nulla (rifiutata),
chiusura compilando tutto (accettata).

**File:** [routes/interventions.ts](../backend/src/routes/interventions.ts),
[db/schema.ts](../backend/src/db/schema.ts),
[lib/interventions.ts](../frontend/src/lib/interventions.ts), i due dialoghi degli interventi,
[interventionPdf.ts](../backend/src/services/interventionPdf.ts) e la scheda intervento (che
ora mostrano "-" quando il lavoro non è ancora stato descritto).

---

## 2026-09-07 — Il calendario carica solo il periodo che sta mostrando

**Cosa.** La dashboard chiedeva **tutti** gli interventi e ne riceveva al massimo 5000, il
tetto di `takeUnpaginated`. Ora chiede solo l'intervallo di giorni che il calendario sta
disegnando, tramite i nuovi parametri `scheduledFrom`/`scheduledTo`.

**Il perché è prima di tutto la correttezza, non la velocità.** Con 8000 interventi in
archivio il calendario ne mostrava 5000 e gli altri 3000 sparivano: nessun errore a schermo,
nessun segnale per chi guarda, solo una riga `Lista "interventions" … risultato troncato` nei
log del server a ogni caricamento della dashboard. Un calendario che tace e mostra una parte
degli appuntamenti è peggio di uno lento.

| | prima | dopo |
| --- | ---: | ---: |
| Interventi ricevuti | 5000 su 8000, troncati in silenzio | 982, **tutti** quelli del periodo |
| Peso della risposta | 1,87 MB | 361 KB |
| Durata lato server | ~240 ms | ~110 ms |
| Avvisi di troncamento nei log | a ogni caricamento | nessuno |

Il guadagno maggiore però non è nei millisecondi del server: è il browser, che prima doveva
interpretare quasi due MB di JSON e costruire 5000 eventi per disegnarne una manciata.

**Due dettagli che hanno richiesto una verifica, non un'ipotesi.**

*Il filtro giusto non esisteva.* `dateFrom`/`dateTo` degli interventi filtrano la **data di
creazione**, mentre il calendario colloca gli eventi sulla **data dell'intervento**: usarli
avrebbe filtrato la colonna sbagliata. Da qui i due parametri nuovi, più
l'[indice su `intervention_date`](../backend/drizzle/0021_add_intervention_date_index.sql) che
rende quel filtro una lettura d'indice (`BitmapOr`, verificato con `EXPLAIN ANALYZE`) invece di
una scansione a ogni cambio di mese.

*Il primo caricamento non partiva.* `onRangeChange` di react-big-calendar sembra il modo
naturale di sapere quali giorni sono visibili, ma nel sorgente della libreria viene chiamato
solo da `handleNavigate` e `handleViewChange`: **non al montaggio**. Con il solo
`onRangeChange` il calendario restava vuoto finché non si premeva "Avanti" — difetto scoperto
osservando le richieste di rete del browser, dove la chiamata con l'intervallo compariva solo
dopo la navigazione, non al caricamento. Il primo intervallo viene quindi calcolato in
`initialRangeFor`, che riproduce le regole delle viste della libreria (compresa la griglia
mensile, che mostra anche la coda del mese precedente e l'inizio del successivo).

**Cosa non è stato lasciato indietro.** I record creati prima dell'introduzione di
`intervention_date` non ne hanno una, e il calendario li colloca sulla data di creazione:
filtrare solo sulla prima colonna li avrebbe fatti sparire del tutto. La condizione copre
entrambi i casi, scritta come `OR` di due confronti e non con `coalesce(...)`, perché
un'espressione calcolata non sarebbe coperta da nessun indice.

Resta infine un tetto di 1000 righe per periodo, ma ora **se scatta lo dice**: compare un
avviso che invita a passare alla vista settimana o giorno, invece di disegnare in silenzio una
parte degli interventi.

**File:** [queries/intervention.ts](../backend/src/db/queries/intervention.ts),
[routes/interventions.ts](../backend/src/routes/interventions.ts),
[useCalendarInterventions.ts](../frontend/src/pages/calendar/hooks/useCalendarInterventions.ts),
[interventions-calendar.tsx](../frontend/src/pages/calendar/components/interventions-calendar.tsx),
[DashboardPage.tsx](../frontend/src/pages/dashboard/DashboardPage.tsx).

---

## 2026-09-07 — La casella di ricerca smette di confrontare colonne che testo non sono

**Cosa.** Le sette liste con ricerca libera non convertono più in testo id, date, booleani,
prezzi e metodo di pagamento per confrontarli con `ILIKE '%…%'`. Restano le colonne di testo,
più il numero del record come **confronto esatto sulla chiave primaria** quando quello che si
digita è tutto cifre. Nuovo helper condiviso [parseIdSearch](../backend/src/db/queries/search.ts).

**Il perché, misurato e non ipotizzato** (dati di prova generati da
[seed-fake-data.sql](../scripts/dev/seed-fake-data.sql), tempi da
[bench-api.mjs](../scripts/dev/bench-api.mjs), 20.000 report / 8.000 interventi / 5.000 clienti):

| | prima | dopo |
| --- | ---: | ---: |
| Report, ricerca "rossi" | 770 ms | **323 ms** |
| Report, ricerca senza risultati | 714 ms | **410 ms** |
| Clienti, typeahead della combobox | 51 ms | **16 ms** |
| Interventi, ricerca | 118 ms | **74 ms** |

Nient'altro si è mosso più del rumore di misura (±5 ms su 46 scenari).

**Il difetto era doppio, ed è la parte che vale la pena ricordare.**

*Costavano.* Un `ILIKE` su un'espressione calcolata non è coperto da nessun indice, e basta
**un solo** ramo del genere in un `OR` perché Postgres rinunci a combinare i bitmap degli
indici trigram di tutti gli altri rami. In più `created_at::text` converte un timestamp in
stringa per ogni riga esaminata, che è molto più caro di un confronto fra varchar: sui soli
clienti quei tre rami valevano 33 ms → 24 ms del conteggio.

*E non servivano.* Confrontavano il valore grezzo nel database, non quello mostrato a schermo.
Verificato sui dati: cercare **"contanti" dava 0 risultati** (in tabella c'è `cash`), e
**"07/09/2026" dava 0 risultati** (in tabella c'è `2026-09-07 04:42:00.746771`). Si pagava
metà del tempo di ogni ricerca per rami che nessuno poteva far scattare, se non digitando
valori interni che l'interfaccia non mostra da nessuna parte.

**Anche tipo e stato degli interventi sono usciti, ed è il caso meno ovvio.** A differenza del
metodo di pagamento, quei due rami *funzionavano*: in tabella ci sono le stesse parole italiane
che si leggono a schermo (`completato`, `consegna_materiale`), quindi digitarle trovava
qualcosa. Ma nessuno dei due ha un indice che regga un `ILIKE '%…%'` — gli indici btree su
`type` e `status` servono per l'uguaglianza, non per la sottostringa — e la pagina interventi
ha già i due menù a tendina dedicati, che arrivano qui come parametri `status`/`type` e
diventano confronti esatti. La capacità non si perde: si sposta sul controllo che c'era già e
che filtra meglio, a costo zero. Stesso discorso per data e stato di pagamento dei report, che
hanno i loro filtri sopra la tabella.

Verificato dopo la modifica: cercare "completato" o "remoto" nella casella dà 0 risultati,
mentre i filtri `status=completato` (6.118) e `type=intervento_remoto` (2.667), da soli e
combinati (2.300), rispondono correttamente.

**Una differenza di comportamento da sapere:** cercare `12` ora trova il record 12, non più
anche 120 e 1234. Il numero fuori dalla scala dell'intero a 32 bit viene ignorato invece di
far fallire la query con "integer out of range".

**Questo non è il rimedio completo.** Sulle liste che uniscono più tabelle (report,
interventi) l'`OR` continua ad attraversare cinque tabelle, e un indice può essere usato solo
se il predicato riguarda una tabella sola: il piano resta una scansione completa con il filtro
applicato dopo il join, e il costo continua a crescere con l'archivio invece che con i
risultati trovati. Il rimedio vero è un ramo per tabella con `UNION` degli id — prototipato e
misurato a **35 ms** contro i 323 attuali — ma è un lavoro a parte. Prova di quanto pesi
davvero l'indice, sulla stessa macchina e sugli stessi dati: lo stesso `OR` ristretto alla
sola tabella `report` usa `BitmapOr` su quattro indici trigram ed esegue in **1,1 ms**.

**File:** [search.ts](../backend/src/db/queries/search.ts) (nuovo),
[report.ts](../backend/src/db/queries/report.ts),
[customer.ts](../backend/src/db/queries/customer.ts),
[intervention.ts](../backend/src/db/queries/intervention.ts),
[collaborator.ts](../backend/src/db/queries/collaborator.ts),
[technician.ts](../backend/src/db/queries/technician.ts),
[device.ts](../backend/src/db/queries/device.ts),
[issue.ts](../backend/src/db/queries/issue.ts).

---

## 2026-09-07 — Dati fittizi e misura della latenza delle API

**Cosa.** Due script di sviluppo: [scripts/dev/seed-fake-data.sql](../scripts/dev/seed-fake-data.sql)
riempie il database con dati verosimili (di default 20.000 report, 8.000 interventi, 5.000
clienti, più anagrafiche e notifiche) e [scripts/dev/bench-api.mjs](../scripts/dev/bench-api.mjs)
misura la latenza di 46 scenari di chiamata — liste, ricerche, ordinamenti, dettagli, PDF,
scritture e i "pacchetti" di chiamate che una pagina lancia al mount.

**Il perché.** Finora la dev DB conteneva due righe per tabella: qualunque verifica di
prestazioni era priva di significato, e anche le verifiche funzionali (paginazione,
troncamenti, ordinamenti) non toccavano i casi che contano. Il seme di `setseed` è fisso e i
volumi sono parametri (`-v n_reports=100000`), quindi due esecuzioni producono lo stesso
database e i confronti prima/dopo una modifica restano paragonabili. Lo script di misura si
autentica creando una riga in `session` con l'hash del token e la cancella in `finally`: non
serve la password dell'utente e l'ambiente resta come prima.

**Cosa hanno detto le misure** (p50 su host, 12 richieste per scenario, ai volumi di default
e poi a 5×: 100.000 report / 40.000 interventi / 20.000 clienti):

| Chiamata | 20k report | 100k report |
| --- | ---: | ---: |
| Report, pagina 1 × 10 | 49 ms | 110 ms |
| Report, ricerca testuale | **770 ms** | **3.510 ms** |
| Report, ordina per cliente / totale | 116 ms | 385 ms |
| Report, offset profondo (ultima pagina) | 157 ms | 572 ms |
| Report, PDF di stampa | 472 ms | 477 ms |
| Clienti, typeahead della combobox | 51 ms | 173 ms |
| Dettaglio / scritture / cataloghi | 10-20 ms | 12-20 ms |

**1. La ricerca è il collo di bottiglia, e il motivo è quello già annotato ma ora
quantificato.** `listReports` costruisce un `OR` di 28 condizioni `::text ILIKE '%…%'`, molte
su colonne senza indice trgm (`created_at`, i booleani, il totale calcolato). Con anche un
solo ramo non indicizzabile Postgres non può usare `BitmapOr`: il piano reale è un hash join
di *tutto* il prodotto report × cliente × dispositivo × difetto, con le 28 `ILIKE` valutate
riga per riga come `Join Filter` (`Rows Removed by Join Filter: 17.997`). Il costo non dipende
da quanto matcha: una ricerca **senza risultati costa quanto una che ne trova** (714 ms /
3.574 ms). Prova di controllo sulla stessa macchina e sullo stesso dato: `count(*) FROM
customer WHERE last_name ILIKE '%rossi%'`, che l'indice trgm copre davvero, esegue in
**0,8 ms** contro i 668 ms del `count(*)` della ricerca report. Non è quindi "il database è
lento", è la forma della query.

**2. Il `count(*)` della paginazione fa join che non gli servono.** Ogni pagina lancia due
query in parallelo, righe e totale; il conteggio ripete gli stessi join su cliente,
dispositivo e difetto anche quando non c'è nessuna ricerca, cioè quando quei join non possono
cambiare il totale (sono FK non nulle). Sono 28 ms dei ~49 della pagina.

**3. La sottoquery dei prezzi tecnico aggrega tutta la tabella per restituire 10 righe.**
`technician_prices` fa `GROUP BY report_id` su tutto `report_technician`, poi il planner la
unisce con un `Nested Loop` + `Materialize` che scarta 55.422 righe per trovarne 10. Ma
`report_technician` ha la chiave primaria **sul solo `report_id`**: c'è al massimo una riga per
report, quindi il `GROUP BY` è ridondante e un left join diretto sulla PK farebbe lo stesso
lavoro con un index scan.

**4. Il tetto di 5.000 righe delle liste non paginate scatta davvero a questi volumi.**
`unpaginatedMaxRows` fa il suo mestiere — niente esplosioni di memoria — ma il calendario
della dashboard e le combobox ricevono un elenco troncato, con il warning previsto nei log
(`Lista "interventions" … risultato troncato`). A 8.000 interventi il calendario mensile
mostra già "+119 altri" per giorno: è il segnale che quel chiamante ha bisogno di un filtro
per intervallo di date, non dell'elenco completo.

**Non toccato in questa voce:** nessuna di queste quattro cose è stata corretta qui. Lo script
serve proprio a poterle correggere misurando, invece che a intuito.

**File:** [scripts/dev/seed-fake-data.sql](../scripts/dev/seed-fake-data.sql),
[scripts/dev/bench-api.mjs](../scripts/dev/bench-api.mjs).

---

## 2026-09-07 — Barra di paginazione: conteggio a sinistra, selettore righe a destra

**Cosa.** Sotto ogni tabella il conteggio "Visualizzati 1-10 di 15" resta a sinistra, mentre
il selettore "Righe per pagina" si è spostato a destra, in linea con le frecce e i numeri di
pagina. Prima stava a sinistra, appiccicato al conteggio.

**Il perché della trappola, che è la parte da ricordare.** Spostare il selettore ha voluto
dire raggrupparlo in un contenitore comune con i controlli di pagina, e lì il layout si è
rotto: il selettore finiva su una riga e le frecce sulla riga sotto, disallineati rispetto al
conteggio. La causa è che `Pagination` di shadcn nasce con `mx-auto flex w-full
justify-center` ([ui/pagination.tsx](../frontend/src/components/ui/pagination.tsx)). Come
figlio diretto della riga esterna in `justify-between` quel `w-full` si limitava a
restringersi, quindi il difetto non si vedeva; dentro un contenitore `flex-wrap` invece
rivendica tutta la larghezza e si porta su una riga propria. Rimediato con `mx-0 w-auto` sul
solo punto d'uso, così il `nav` si dimensiona sul contenuto — senza toccare il componente
`ui/` condiviso, che va lasciato aderente all'originale shadcn.

**Verificato con Playwright, con test di controllo.** La dev DB ha 2 righe per tabella, cioè
una pagina sola: i controlli di pagina non venivano proprio renderizzati e la verifica sulla
pagina reale non provava nulla. Misurata quindi la struttura iniettata nel DOM dell'app
(stesse classi, stessi CSS globali): scarto verticale fra i centri dei tre elementi **0px con
il fix, 42px rimettendo `w-full` a runtime**. Il controllo serviva a escludere un test inerte,
trappola già incontrata in questo progetto.

**File:** [frontend/src/components/table-pagination.tsx](../frontend/src/components/table-pagination.tsx).

---

## 2026-09-07 — Rassegna di sicurezza: iniezione in smbclient, SVG del logo, permessi delle impostazioni

**Tre difetti sfruttabili da un utente autenticato qualsiasi, più tre irrobustimenti.** La
revisione è nata dalla domanda "ci sono problemi di sicurezza?" dopo la pubblicazione su
dominio: finché si entrava solo dalla LAN il modello di minaccia erano gli errori in buona
fede, adesso è chiunque ottenga una credenziale.

**1. La cartella remota del NAS pilotava smbclient.** `backupSmb.ts` componeva la stringa
passata a `smbclient -c` come `cd "<percorso>"; ls`, ripulendo il percorso dalle sole
virgolette. Ma smbclient spezza quella stringa sui `;` *prima* di interpretare il quoting:
le virgolette non isolavano niente, e chi scriveva quel campo sceglieva i comandi eseguiti.

**Verificato contro un server Samba vero**, perché sul meccanismo esatto era facile
sbagliarsi: la shell escape `!` **non** esiste più (`!: command not found` su Samba 4.12),
quindi non si arriva a una shell, ma `put` e `get` bastano da soli. Nella prova
`put /etc/passwd` ha copiato un file locale sulla condivisione remota, e
`get payload /app/dist/index.js` ha **sovrascritto il codice che il backend esegue**. In
mano a un utente qualsiasi dell'app significa: portare fuori `data/secret.key` e i dump del
database verso una condivisione propria (host e credenziali li sceglie lui, nello stesso
form), e riscrivere file dentro il container - che fino a oggi girava anche come root.

- Ora il percorso passa per una **whitelist** (`smbPathPattern`: lettere, cifre, spazio e
  `. _ - / \`) invece che per una ripulitura. Togliere i caratteri pericolosi è una difesa
  che si rompe appena se ne dimentica uno — ed è esattamente quello che era successo.
- Il controllo sta in due punti: nello schema zod delle rotte (così l'utente riceve un 400
  comprensibile) e in `safeRemotePath`, subito prima di comporre il comando. Il secondo non
  è ridondante: il percorso arriva anche dalle impostazioni salvate su disco, che un
  ripristino da archivio può sostituire.
- File: `backend/src/services/backupSmb.ts`, `backend/src/routes/settings.ts`,
  `backend/src/services/backupSmb.test.ts`.

**2. Il logo SVG era una XSS persistente sull'origin dell'app.** L'upload accetta l'SVG e lo
salva senza rasterizzarlo, per non perdere la resa vettoriale; `/assets/logo.jpg` lo
restituiva con `Content-Type: image/svg+xml` e **senza autenticazione**. Dentro un `<img>` un
SVG non esegue script, ma aprendo l'URL direttamente il browser lo tratta come un documento
sulla stessa origin dell'app: da lì può chiamare `/api/*` con la sessione di chi lo apre, e
`httpOnly` sul cookie non protegge da una richiesta same-origin. Bastava caricare un logo e
mandare il link a un amministratore.

- Due header sulla rotta, non un divieto: `Content-Security-Policy: sandbox` e
  `Content-Disposition: attachment`. Il primo toglie gli script al documento e gli dà origin
  opaca, il secondo fa scaricare il file invece di aprirlo.
- **Verificato in Edge**, perché la scelta si regge su un dettaglio di comportamento dei
  browser: con i vecchi header la navigazione diretta eseguiva davvero lo script dell'SVG
  (che cambiava il titolo della pagina), con i nuovi parte un download e il titolo resta
  vuoto; il `<img>` continua a caricare l'immagine a 64x64 in entrambi i casi, perché sulle
  sottorisorse `Content-Disposition` è ignorato. Provata anche la sola CSP: script non
  eseguito e `window.origin` a `null`. Logo in sidebar, in anteprima e nei PDF intatto.
- File: `backend/src/index.ts`.

**3. Le impostazioni erano riservate solo "agli autenticati".** Su `/api/settings` c'era il
solo `requireAuth`: un utente qualunque poteva **scaricare un dump completo del database** —
che contiene gli hash delle password di tutti e i segreti cifrati — leggere il registro delle
azioni altrui, riconfigurare NAS e SMTP e far partire connessioni verso host e porte a
scelta. Il commento sulle rotte di aggiornamento diceva già "un singolo account compromesso
non deve bastare per arrivarci": vale identico per il download dei backup.

- `settingsRouter.use(requireAdmin)` subito dopo le uniche due letture innocue
  (`GET /company` e `GET /logo`: nome del laboratorio e presenza di un logo, dati già
  visibili nell'interfaccia). I `requireAdmin` per-rotta su restore e update sono stati tolti
  perché ora ridondanti.
- Lato interfaccia `adminOnlySections` passa da due sezioni a sei: a un non amministratore
  resta il **Tema**, che è una preferenza di chi guarda. Nascondere è cosmetica, il permesso
  lo impone il backend — ma una sezione che risponde solo 403 è peggio che assente.
- File: `backend/src/routes/settings.ts`, `frontend/src/pages/settings/SettingsPage.tsx`,
  `backend/src/routes/settings.test.ts`.

**4. Il token di sessione non è più in chiaro nel database.** In tabella finisce
`sha256(token)`, il cookie continua a portare il token vero. È il complemento del punto 3: un
archivio di backup contiene anche la tabella `session`, e un token in chiaro lì dentro è una
credenziale riutilizzabile senza conoscere nessuna password. Basta un hash semplice, senza
salt né costo di calcolo — il token è già 256 bit casuali, non c'è nulla da indovinare a
forza bruta come per una password scelta da una persona, e la ricerca deve restare una
lookup su indice a ogni richiesta.

- Migrazione `0020`: `DELETE FROM "session"` e rinomina della colonna in `token_hash`. Le
  righe esistenti non sono convertibili in hash utilizzabili, quindi **dopo l'aggiornamento
  tutti rifanno il login una volta sola**.
- File: `backend/src/db/schema.ts`, `backend/src/services/authManager.ts`,
  `backend/drizzle/0020_hash_session_tokens.sql`.

**5. Il backend non gira più come root.** Un difetto sfruttabile nel container (come il punto
1) non deve consegnare anche i privilegi di root. Il processo Node passa all'utente `node`,
già presente nell'immagine.

- Il passaggio avviene in un `docker-entrypoint.sh` che parte come root, sistema il
  proprietario dei quattro percorsi montati e poi scende con `su-exec`. Un semplice
  `USER node` nel Dockerfile avrebbe rotto **le installazioni esistenti**: i volumi con nome
  già creati e i bind mount che arrivano dall'host appartengono a root, e l'aggiornamento
  automatico avrebbe lasciato l'app senza poter scrivere backup, log e `data/`, in silenzio.
- Il `chown -R` scatta solo se il proprietario è davvero sbagliato: su una cartella con molti
  archivi ripeterlo a ogni avvio sarebbe lavoro inutile. `exec su-exec` serve a far arrivare
  SIGTERM a Node, altrimenti l'arresto pulito di `src/index.ts` non verrebbe mai eseguito.
- `Dockerfile.dev` resta invariato: in sviluppo il sorgente è montato dall'host e i
  `node_modules` sono del container, cambiare utente lì crea solo attriti.
- File: `backend/Dockerfile`, `backend/docker-entrypoint.sh`.

**6. L'upload di un dump aveva un tetto di 2 GB, tenuti in memoria.** `multer` conservava il
file interamente in RAM senza `limits`, e nginx accettava `client_max_body_size 2048m`: una
sola richiesta poteva esaurire la memoria del container. Ora il limite è 512 MB su entrambi —
molto sopra i dump reali e comunque sotto il tetto di 100 MB per richiesta del piano
Cloudflare, che nella pratica taglia prima.

- `errorHandler` traduce `LIMIT_FILE_SIZE` in **413** con un messaggio leggibile: gli errori
  di multer hanno un campo `code` testuale come quelli di Postgres, e senza un ramo dedicato
  finivano nel caso generico, cioè "errore imprevisto" con status 500. Riguardava anche il
  limite di 5 MB sul logo, che esisteva già.
- File: `backend/src/routes/settings.ts`, `backend/src/middleware/errorHandler.ts`,
  `frontend/nginx.conf`.

**Non toccato, di proposito:** la CSP resta limitata a `frame-ancestors 'none'` e manca
`Permissions-Policy`; `update-server.sh` continua a fare `chmod 666` su `status.json`; resta
la segnalazione *moderate* di `npm audit` su `qs` (transitiva da express). Scelte fatte in
sede di revisione, annotate qui perché non vadano perse.

**Verificato ed escluso** durante la rassegna: SQL injection (drizzle parametrizza, `sortBy`
è mappato su colonne costanti e non interpolato), path traversal sul download di backup e log
(pattern ancorati), `dangerouslySetInnerHTML` ed `eval` nel frontend (assenti), CSRF (cookie
`SameSite=Lax`, nessuna rotta di scrittura esposta in GET), enumerazione degli username sul
login (hash esca), falsificazione dell'IP nel limitatore dei login (`CF-Connecting-IP` dietro
tunnel), `secret.key` e password admin iniziale esclusi dagli archivi di backup.

## 2026-09-07 — Avviso di backup prima di aggiornare

**La conferma di "Aggiorna adesso" ricorda di fare un backup e dice quando è stato fatto
l'ultimo.** L'aggiornamento fa `git reset --hard` e ricostruisce i container, e al riavvio il
backend applica le migrazioni pendenti: sono modifiche al database che non si annullano da
sole. Il dialog avvertiva solo che l'app sarebbe stata brevemente irraggiungibile, cioè del
disagio momentaneo e non del rischio vero.
- L'avviso è un riquadro ambra dentro il dialog, la stessa forma già usata in
  `backupRestoreCard` per le password da reinserire dopo un ripristino.
- Sotto l'avviso c'è **data ed esito dell'ultimo backup** (`SettingsStatusBadge`, come nella
  sezione Backup): "fai un backup" senza dire se ne esiste già uno recente è un consiglio su
  cui non si può decidere. La data si legge all'apertura della conferma, non al caricamento
  del pannello, così è fresca nel momento in cui serve.
- Se la lettura fallisce non compare nessun toast: l'avviso resta valido comunque, l'errore
  vero lo mostra la sezione Backup, e qui manca solo la data.
- Il pulsante di conferma **non** è bloccato in assenza di backup: la richiesta era di
  avvisare, e l'amministratore resta libero di procedere.
- Non toccato lo script sull'host (`scripts/update-server.sh`): lo lancia un path unit
  systemd quando compare `apply.trigger`, non c'è nessuno da avvisare lì. Il dialog è l'unico
  punto in cui una persona decide di aggiornare.
- File: `frontend/src/components/settings/updateSettingsPanel.tsx`.

## 2026-09-07 — PDF del report: il riquadro "avvisato" si divide in due

**"Completato" accanto ad "avvisato", nella striscia in fondo alla copia interna.** Il
riquadro in basso a sinistra registrava solo se il cliente è stato avvisato; ora tiene due
voci affiancate della stessa larghezza, "completato" a sinistra (vuota, da spuntare a mano
come già accade per "avvisato" quando il report non è ancora stato notificato) e "avvisato"
a destra, che continua a stampare il valore del report.
- È una tabella sola a due colonne, non due riquadri affiancati: così la barra di sezione e
  la riga sotto condividono altezza e bordi, esattamente come fa già "PAGAMENTO" con le sue
  due caselle. Due riquadri separati avrebbero raddoppiato i bordi in mezzo.
- **"Completato" e non "lavoro eseguito"** perché le due caselle devono essere uguali: a
  10,5 pt "LAVORO ESEGUITO" misura 91,3 pt (misurato con `widthOfString`, non stimato)
  contro i ~79 pt di mezza casella, quindi andrebbe a capo, e una barra su due righe
  alzerebbe questo riquadro rispetto a "IMPORTO" e "PAGAMENTO", che restano su una riga
  sola. "COMPLETATO" sta in 67,4 pt e i tre riquadri restano allineati sopra e sotto.
  Alternative misurate se un giorno servisse cambiare parola: ESEGUITO 48,6 — RIPARATO 48,9
  — TERMINATO 58,4 — PRONTO 41,3 — FATTO 31,2.
- Effetto collaterale utile: "LAVORO ESEGUITO" resta il titolo di una sola sezione, il
  riquadro grande a righe sopra. Con la prima stesura compariva due volte nella stessa
  copia.
- `sectionBarCell` estratto da `sectionBarRow` in `services/pdf/shared.ts`: serviva la
  singola cella-barra, senza il `colSpan` che `sectionBarRow` impone. `sectionBarRow` ora la
  usa, quindi lo stile della barra resta definito in un punto solo.
- Il resto dell'impaginazione è invariato: verificato rendendo il PDF prima e dopo con dati
  di prova e confrontando le due pagine — tutte le sezioni cadono alla stessa altezza.
- File: `backend/src/services/reportPdf.ts`, `backend/src/services/pdf/shared.ts`.

## 2026-09-07 — Località del cliente

**Nuovo campo `city` sul cliente, facoltativo.** La scheda cliente registrava solo nome,
telefoni ed email: per capire da dove arriva chi porta un dispositivo, o dove va fatto un
intervento a domicilio, bisognava leggerlo dalla descrizione del report. Il campo è
facoltativo per non invalidare i clienti già esistenti — la colonna nasce nullable e
nessuna riga viene toccata dalla migrazione — e resta fuori dai vincoli di validazione
(l'unico obbligo sul cliente resta almeno un numero di telefono).
- Database: migrazione `0019_add_customer_city.sql` (`ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS`) più indice GIN trigram `customer_city_trgm_idx`, allineato agli altri campi
  testuali del cliente perché la località entra nella ricerca full-text della lista clienti
  (`listCustomers`): senza indice quella condizione `ILIKE '%...%'` sarebbe l'unica a
  costringere a una scansione sequenziale.
- Backend: `db/schema.ts`, `db/queries/customer.ts` (condizione di ricerca),
  `routes/customers.ts` (`z.string().trim().min(1).max(255).nullable().optional()`, come
  email: stringa vuota non ammessa, `null` sì).
- Frontend: `CustomerDto` e `CustomerCreateInput`, campo nel dialog cliente (creazione e
  modifica), colonna "Località" in tabella, payload di `CustomersPage` e delle creazioni
  cliente inline dai dialog report e intervento — tutte usano lo stesso dialog, quindi
  omettere `city` in uno di quei punti avrebbe scartato silenziosamente il valore digitato.
- Non toccato: i PDF di resoconto cliente, che continuano a mostrare nome, telefono ed
  email.

## 2026-09-07 — Terminologia unificata su "report", stato del report come card

**"Rapportino"/"rapporto" → "report" ovunque.** L'interfaccia usava tre parole per la
stessa entità — "rapportino" nei filtri e in dashboard, "rapporto" nei titoli, nei toast e
nei messaggi d'errore del backend, "report" nelle rotte e nel codice. Chi legge non può
sapere che sono la stessa cosa, e la ricerca testuale nel codice ne risentiva. Ora la
terminologia visibile è sempre "report" (invariabile: *il report*, *i report*), allineata al
nome che l'entità ha già nel database, nell'API e nei file sorgente.
- Frontend: voce di sidebar, titoli e descrizioni pagina, filtri stato (`Tutti i report`,
  `Report aperti/chiusi`), placeholder di ricerca, `aria-label` delle azioni di riga, toast
  di creazione/modifica/eliminazione, dialog di creazione e modifica, sezioni "Report del
  cliente/collaboratore/tecnico".
- Backend: messaggi di `errorHandler.ts` (vincoli di integrità), validazione di chiusura in
  `routes/reports.ts`, intestazione del PDF (`Report #<id>`).
- Non toccato: `frontend/src/index.css`, dove "rapporto di contrasto" è il termine di
  accessibilità e non ha niente a che vedere con l'entità. Le voci storiche di questo
  changelog restano com'erano scritte allora.

**Lo stato del report diventa una card.** Sopra la griglia delle card, `ReportPage` mostrava
tre pillole ("Creato:", "Aggiornato:", stato aperto/chiuso) che duplicavano informazioni già
presenti più in basso: le due date stanno tal quali nella card "Stato e gestione", e lo
stato era l'unico dato che meritava rilievo. Le pillole sono state rimosse e lo stato è ora
la prima card della griglia, che passa da `xl:grid-cols-4` a `xl:grid-cols-5` per far stare
le cinque card su una riga; sotto `xl` la griglia continua a riflettere in due colonne. Il
badge conserva i colori di `statusBadgeClass`, verificati in tema chiaro e scuro.
- File: `frontend/src/pages/reports/ReportPage.tsx`.


## 2026-09-07 — Problema sull'intervento, data odierna predefinita, apertura col doppio click, collaboratore obbligatorio alla chiusura, righe per pagina per tabella

Sei richieste raccolte dall'uso quotidiano, più due difetti di layout emersi verificandole.

**Data odierna predefinita.** Il campo data della dialog di creazione partiva vuoto, ma
l'intervento è quasi sempre di oggi: si ridigitava ogni volta. Ora è precompilato con
`getTodayDateString()` (già esistente in `frontend/src/lib/interventions.ts`) e resta
modificabile. `initialDate` mantiene la precedenza, così lo slot cliccato nel calendario
non viene sovrascritto.

**Nuovo campo "Problema".** Per gli interventi in sede o da remoto mancava un posto dove
annotare il problema riscontrato, distinto dalla descrizione dell'attività svolta — i
rapportini ce l'hanno da sempre (`issueDescription`). È testo libero, obbligatorio per quei
due tipi e assente per le consegne materiale, dove viene forzato a `NULL`. Gli interventi
già esistenti restano vuoti. La condizione riusa i predicati che c'erano già di qua e di
là (`isOnSiteInterventionType`, `onSiteInterventionTypes`), e il campo compare anche nel PDF
di stampa e nell'email.
- Migrazione `backend/drizzle/0018_add_intervention_problem.sql` (colonna `text` nullable),
  con la voce aggiunta a mano in `meta/_journal.json`: qui le migrazioni non sono generate
  da `drizzle-kit`.
- File: `backend/src/db/schema.ts`, `backend/src/routes/interventions.ts`,
  `backend/src/services/interventionPdf.ts`, `frontend/src/lib/api/interventions.ts`, le due
  dialog di creazione/modifica intervento, `InterventionsPage`, `InterventionPage`,
  `DashboardPage`.

**Apertura con doppio click.** Rapportini e interventi si aprivano solo dal pulsante icona
in fondo alla riga. Il doppio click è stato aggiunto in `components/entity-table.tsx`, che
entrambe le tabelle già condividevano, quindi una modifica sola copre tutti e due; il
doppio click sulla cella delle azioni è fermato con `stopPropagation` perché è l'unico punto
interattivo della riga. Il pulsante "Apri" resta: su mobile le righe diventano schede e il
doppio click non è un gesto disponibile.

**Collaboratore obbligatorio per chiudere un rapporto.** `collaboratorId` è nullable e nulla
impediva di spuntare "Report chiuso" lasciando "Nessuno": si chiudevano rapporti senza sapere
chi li avesse lavorati. Il controllo è sia in `editReportDialog.handleConfirm` (la dialog è
usata da tre pagine diverse, quindi metterlo nelle pagine avrebbe voluto dire triplicarlo)
sia nel `PUT /reports/:id`, dove il valore va risolto sull'unione fra corpo parziale e riga
esistente — come già si faceva per il vincolo sul prezzo. La colonna resta nullable: il
vincolo riguarda solo la chiusura.

**Valore lungo che sfonda dalla select** (`frontend/src/components/ui/select.tsx`). Un nome
cliente lungo usciva dal bordo del suo campo e finiva sopra la select affiancata. Il
`line-clamp-1` che il `SelectTrigger` aveva già non tagliava niente, perché la regola
`*:data-[slot=select-value]:flex` sulla stessa classe gli sovrascrive il `display:
-webkit-box` da cui `line-clamp` dipende; il trigger inoltre era `overflow: visible`. Aggiunti
`overflow-hidden` sul trigger e `min-w-0` sul valore, così il testo viene troncato invece di
tracimare. Il difetto era comune a ogni select dell'app, non solo a quella segnalata.

**Righe per pagina su ogni pagina con tabella.** Era un'unica impostazione globale in
Impostazioni > Tema, valida per tutte le tabelle e per giunta letta una sola volta al mount
(cambiarla non aveva effetto finché non si cambiava pagina). Ora il selettore sta in
`table-pagination.tsx`, che è già sotto ogni tabella dell'app — la barra dei filtri esiste
solo su tre pagine su dodici — e ogni tabella ricorda il proprio valore sotto la chiave
`easylab-web-table-rows-per-page:<tabella>`. In lettura si ricade sulla vecchia chiave
globale finché la tabella non ha un valore suo, così la preferenza già configurata non si
perde; per lo stesso motivo il valore ora si scrive sempre, anche quando è 10, mentre prima
il default veniva memorizzato cancellando la chiave.
- File: `frontend/src/lib/theme.ts`, `hooks/useTableRowsPerPage.ts`, il nuovo
  `components/rows-per-page-select.tsx`, `components/table-pagination.tsx`,
  `components/settings/themeSettingsSection.tsx` (card rimossa), gli 11 call site e
  `logsSettingsPanel.tsx`, che aveva `pageSize` fisso a 25 fuori dal set 10/20/50.

---

## 2026-09-07 — Liste anagrafiche in ordine alfabetico, conferma prima di inviare l'email

Le liste di dispositivi, collaboratori e tecnici esterni erano ordinate per data di
creazione decrescente (le più recenti in cima), non per nome: su elenchi lunghi questo
rende difficile trovare una voce specifica a colpo d'occhio. La lista clienti aveva già
tutta l'infrastruttura di ordinamento (query con `sortBy`, selettore "Nome (A-Z)" in UI)
ma il default restava comunque sulla data. Inoltre l'invio dell'email di un intervento
partiva subito al click sull'icona nella tabella, senza alcuna conferma: un click per
errore mandava l'email al cliente senza possibilità di annullare.

- **`backend/src/db/queries/device.ts`**: `orderBy` cambiato da `desc(created_at)` ad
  `asc(name)`.
- **`backend/src/db/queries/collaborator.ts`** e **`technician.ts`**: `orderBy` cambiato
  da `desc(created_at)` ad `asc(firstName), asc(lastName)`.
- **`frontend/src/pages/customers/components/types.ts`**: `DEFAULT_CUSTOMER_SORT_OPTION`
  cambiato da `"createdAt:desc"` a `"name:asc"` (la pipeline di ordinamento esisteva già,
  bastava cambiare il default).
- **`frontend/src/pages/interventions/InterventionsPage.tsx`**: l'invio email ora apre
  prima una `CustomDialog` di conferma (stesso pattern già usato per l'eliminazione e per
  la stampa con intervallo di date) e chiama `sendInterventionEmail` solo alla conferma
  esplicita dell'utente.

---

## 2026-08-07 — Selezione automatica sui campi numerici, cursore a mano su checkbox/radio, textarea con altezza limitata

Nella dialog "Modifica rapporto" (e in generale ovunque si usino gli stessi componenti UI)
tre piccoli difetti di interazione: cliccare su un campo prezzo lasciava lo "0" già presente
senza selezionarlo, costringendo a cancellarlo a mano prima di digitare; checkbox e il
selettore del metodo di pagamento (un gruppo di bottoni con `role="radio"`, non input nativi)
mostravano il cursore normale invece della manina, perché solo il componente `Button`
condiviso imposta `cursor-pointer` esplicitamente — i bottoni HTML non lo ereditano di
default; la `Textarea` usa `field-sizing-content` per adattarsi al contenuto ma senza un
limite massimo, quindi un campo Note molto lungo faceva crescere la textarea senza fine,
trascinando in altezza anche la cella affiancata nella stessa riga della griglia (es.
"Descrizione intervento" si allungava con spazio vuoto per pareggiare "Note").

- **`ui/input.tsx`**: `onFocus` ora chiama `event.target.select()` quando `type="number"`,
  così il valore esistente è pronto per essere sovrascritto appena si clicca o si passa
  al campo con Tab.
- **`ui/checkbox.tsx`**: aggiunto `cursor-pointer` alla root del checkbox.
- **`payment-method-selector.tsx`**: aggiunto `cursor-pointer` ai bottoni radio e un'icona
  per opzione (`Ban`, `Banknote`, `CreditCard` da lucide-react) per riconoscerle a colpo
  d'occhio oltre che dal testo.
- **`ui/textarea.tsx`**: aggiunto `max-h-64 overflow-y-auto`, così la crescita automatica
  si ferma a un'altezza ragionevole e il testo in eccesso scorre internamente invece di
  spingere in basso il resto del form.
- File: `frontend/src/components/ui/input.tsx`, `frontend/src/components/ui/checkbox.tsx`,
  `frontend/src/components/payment-method-selector.tsx`, `frontend/src/components/ui/textarea.tsx`.

---

## 2026-08-07 — L'importo degli incassi mensili non è più visibile a colpo d'occhio in dashboard

La card "Incassi mese" mostrava l'incasso del mese corrente in chiaro nella dashboard,
visibile a chiunque guardi lo schermo senza dover aprire nulla. L'importo dettagliato
(mese selezionato e andamento degli ultimi 6 mesi) resta comunque a un click di distanza
nella dialog della stessa card.

- **`DashboardPage.tsx`**: la card chiusa mostra un placeholder mascherato (`••••••`) al
  posto di `formatEuro(monthlyRevenue)`; l'importo reale compare solo nella `DialogContent`
  aperta cliccando la card.
- File: `frontend/src/pages/dashboard/DashboardPage.tsx`.

---

## 2026-08-07 — Fix allineamento e stato del selettore file nel ripristino backup

Nella card "Ripristino da file esterno" il pulsante "Ripristina da questo file" si
spostava verso il basso non appena veniva scelto un file: il testo "File selezionato: ..."
viveva nella stessa cella di griglia di label e input, quindi allungava la riga e
l'allineamento `items-end` spingeva il bottone più in basso insieme a lei. Inoltre
l'etichetta nativa del browser mostrava sempre "Nessun file selezionato", perché
`handleRestoreFileSelected` azzerava `event.target.value` subito dopo la lettura del
file — utile solo per permettere di riselezionare lo stesso file, ma qui il reset
sincrono cancellava anche l'indicazione nativa del nome scelto.

- **`backupRestoreCard.tsx`**: il testo "File selezionato" è ora fuori dalla riga a due
  colonne (label/input + bottone), su una riga propria che non ne influenza più
  l'altezza — il bottone resta allineato all'input indipendentemente dal file scelto.
- **`useBackupPanel.ts`**: `handleRestoreFileSelected` non azzera più `event.target.value`,
  così l'etichetta nativa del file input riflette il file effettivamente selezionato,
  coerente con il testo custom sotto.
- File: `frontend/src/components/settings/backup/backupRestoreCard.tsx`,
  `frontend/src/components/settings/backup/useBackupPanel.ts`.

---

## 2026-08-07 — La retention dei backup ora si applica anche alla copia sul NAS

`pruneOldBackups` cancellava i dump più vecchi del limite configurato (`maxBackupsToKeep`,
default 14) solo nella cartella locale (`backups/`). La copia caricata via SMB sul NAS
non veniva mai ripulita: `uploadDumpToSmb` esegue solo `put`, quindi ogni esecuzione
automatica aggiungeva un file senza mai rimuoverne — accumulo indefinito sul NAS anche
con la retention locale attiva.

- **`backupSmb.ts`**: `runSmbClient` ora restituisce lo stdout (prima solo `resolve()`),
  necessario per leggere l'output di `ls`. Nuove funzioni: `listSmbBackupFileNames`
  (estrae i nomi dei dump dall'output di `ls` via `backupFileNameScanPattern`, non uno
  split per spazi — i nomi di backup non contengono spazi ma il resto della cartella non
  è garantito), `deleteSmbFile` (`del` via smbclient), `computeSmbFilesToDelete` (stessa
  logica di ordinamento cronologico di `sortBackupFileNamesByAge`, isolata e testabile
  senza I/O) e `pruneOldSmbBackups` che le combina, cancellando in sequenza — al più un
  file da eliminare per esecuzione, quindi il costo resta trascurabile.
- **`backupManager.ts`**: `runBackupNow` chiama `pruneOldSmbBackups` subito dopo un
  upload riuscito, con lo stesso `maxBackupsToKeep` della retention locale. Un fallimento
  della pulizia non retrocede `smbLastStatus` a `failed` (il backup sul NAS c'è ed è
  intatto) ma genera una notifica dedicata (`backup:auto-nas-prune-failed`) e viene
  aggiunto al messaggio restituito, sullo stesso modello del fallimento di upload.
- File: `backend/src/services/backupFiles.ts` (nuovo `backupFileNameScanPattern`),
  `backend/src/services/backupSmb.ts`, `backend/src/services/backupManager.ts`,
  `backend/src/services/backupManager.test.ts`.

---

## 2026-08-07 — Il logo caricato viene normalizzato in PNG invece di essere servito grezzo

Il logo dell'azienda (sidebar, impostazioni, header dei PDF) viene caricato dall'utente
e salvato su disco così com'è, senza alcuna elaborazione — nessuna libreria di image
processing era presente nel backend. Un logo caricato come JPEG lossy con forme piatte
e bordi netti (tipico di un'icona) produce artefatti a blocchi 8×8 dovuti alla
compressione, invisibili a piena risoluzione ma evidenti quando l'immagine viene
rimpicciolita nel box di 32px della sidebar (`object-cover`, nessun hint di
`image-rendering`): il logo appare pixellato.

- **`saveLogo` ora passa i file raster per `sharp`**, li ridimensiona dentro un
  riquadro massimo di 512×512 (`fit: "inside", withoutEnlargement: true` — mai
  ingrandire un'immagine piccola, che peggiorerebbe la nitidezza) e li ri-codifica come
  PNG, formato lossless che non introduce blocking artifacts. Gli SVG restano intoccati:
  sono già vettoriali, passarli per sharp li rasterizzerebbe inutilmente.
- Il logo già presente su disco (JPEG 232×242, caricato il 2026-07-30) è stato
  riprocessato una tantum con la stessa pipeline, così l'effetto è visibile subito senza
  richiedere un nuovo upload dall'utente.
- File: `backend/src/services/logoManager.ts`; nuova dipendenza `sharp` in
  `backend/package.json`.

---

## 2026-08-05 — Barre dei filtri: estratti il menu a tendina e l'intervallo di date

Seguito della pulizia qui sotto, che aveva lasciato intatti i tre file dei filtri di
clienti, rapporti e interventi perché — a differenza degli altri quattro — non erano
semplici inoltri a `SearchInput`. Contengono però tre duplicazioni misurate.

- **Il blocco dell'intervallo di date era in due copie identiche carattere per carattere**
  (31 righe l'una) fra rapporti e interventi, insieme al proprio `handleClearDates` e al
  pulsante "Pulisci date". Non è impaginazione: dentro c'è il vincolo `max={dateTo}` /
  `min={dateFrom}` incrociato fra i due campi, che impedisce di scegliere un inizio
  successivo alla fine. Una regola di comportamento in due copie sono due occasioni perché
  una cambi da sola, e nessuno confronta due file di pagine diverse.

- **Il menu a tendina con l'icona in modalità compatta era in sei copie** (una nei clienti,
  due nei rapporti, tre negli interventi), tutte con lo stesso `SelectTrigger` da 12 righe.
  Gli elenchi di opzioni erano già tutti nella forma `{ value, label }[]`, quindi un
  `FilterSelect<T extends string>` li copre senza forzature. La voce "tutti gli stati" è una
  prop opzionale, perché nei rapporti era scritta a mano e negli interventi mappata: erano
  già due modi diversi di fare la stessa cosa.

- **`COMPACT_BREAKPOINT = 640` era dichiarato tre volte.** Cambiarne una copia sola avrebbe
  fatto passare in modalità compatta le barre di elenchi diversi a larghezze diverse — una
  differenza che si nota solo ridimensionando la finestra, cioè quasi mai. Ora vive accanto
  al componente che lo usa.

I tre file restano separati: i clienti hanno un solo menu, gli interventi tre più le date, e
la configurazione capace di coprirli tutti sarebbe più difficile da leggere dei tre file.
Per lo stesso motivo le prop non sono state compattate in un unico oggetto di stato: dodici
prop sono verbose, ma dalla firma si vede quali filtri esistono.

*Verifica:* Docker non era in esecuzione, quindi invece del giro con Playwright usato per le
tabelle sono stati scritti dieci test sui due componenti — più adatti allo scopo, perché
coprono proprio ciò che uno screenshot non mostra: il vincolo min/max che si aggiorna quando
cambia una delle due date, il fatto che "Pulisci date" azzeri **entrambi** i campi e non solo
quello impostato, la presenza o assenza della voce "tutti", e il trigger che sotto i 640px
perde il testo **mantenendo il nome accessibile**.

Ha richiesto due stub in `src/test/setup.ts`: jsdom non implementa la Pointer Events API né
`scrollIntoView`, che i componenti Radix usano, e senza di essi un semplice click su un menu
falliva con `target.hasPointerCapture is not a function` — un errore che non c'entra con ciò
che il test verifica. Servono a qualunque futuro test su Select, DropdownMenu o Popover.
→ [frontend/src/components/filters/](../frontend/src/components/filters/)

---

## 2026-08-05 — Pulizia del codice morto e delle duplicazioni

Revisione sistematica di manutenibilità su tutto il repository. Sei interventi distinti,
raccolti qui perché nascono dalla stessa lettura.

### Codice morto rimosso

- **Nove file non raggiungibili da nessuna parte del programma.** `errorDialog.tsx` era
  vuoto (0 byte); `combobox.tsx` erano 299 righe di componente shadcn che nessuno importa;
  `tableLoadingSkeleton.tsx` era stato sostituito da `LoadingPage` senza essere cancellato;
  `assets/react.svg` è un residuo dello scaffold di Vite; `lib/api.ts` conteneva solo
  `export * from "./api/index"`, un rimbalzo che la risoluzione per directory rende inutile.
  → [frontend/src/](../frontend/src/)

- **`db/relations.ts` (75 righe) descriveva relazioni che Drizzle non ha mai letto.** Le
  `relations()` servono solo all'API relazionale (`db.query.*`), che richiede di passare lo
  schema a `drizzle()`. In [db/index.ts](../backend/src/db/index.ts) la chiamata è
  `drizzle(pool)`, senza schema, e nel backend non esiste una sola `db.query`: tutte le
  query sono `db.select()` con join espliciti. Il file dichiarava quindi una mappa del
  dominio che nessuno consultava — peggio che inutile, perché a leggerla si crede che
  cambiarla abbia un effetto.
  → `backend/src/db/relations.ts`, `backend/src/routes/utils.ts`

- **Le pagine di dettaglio di dispositivi e difetti erano segnaposto irraggiungibili.**
  `DevicePage` e `IssuePage` mostravano "Pagina dettaglio in preparazione" su rotte
  (`/devices/:id`, `/issues/:id`) che nessun link dell'app apre: le rispettive tabelle
  hanno solo modifica ed eliminazione, e la sidebar punta agli elenchi. Restavano
  raggiungibili solo digitando l'URL a mano, dove mostravano un cantiere aperto dentro un
  prodotto finito. Difetti e dispositivi sono tabelle a due campi (nome, descrizione): una
  scheda di dettaglio non avrebbe niente da mostrare.
  → [frontend/src/App.tsx](../frontend/src/App.tsx)

- **La POST dei rapporti validava due volte la stessa regola.** Il vincolo "se il pagamento
  è in contanti o con carta il prezzo deve essere > 0" era espresso sia in un `.refine()`
  di `reportCreateBodySchema` sia in un `if` dentro l'handler. Il secondo era irraggiungibile
  — `validate()` rifiuta prima che l'handler parta — ma conteneva una seconda copia del
  messaggio d'errore, pronta a divergere dalla prima. Il controllo nella PUT resta: lì il
  metodo di pagamento e il prezzo possono arrivare uno dal corpo parziale e l'altro dalla
  riga esistente, combinazione che lo schema non può vedere.
  → [backend/src/routes/reports.ts](../backend/src/routes/reports.ts)

### Il toaster non seguiva il tema scelto nell'app

- **`ui/sonner.tsx` leggeva il tema da `next-themes`, che in questo progetto non ha nessun
  provider.** È il file come lo genera shadcn, mai adattato: l'app usa il proprio
  `ThemeProvider`, quindi `useTheme()` di `next-themes` restituiva un oggetto vuoto e il
  toaster ripiegava sul default `"system"`. Conseguenza visibile: chi sceglieva Chiaro con
  il sistema operativo in scuro riceveva notifiche scure. Ora legge da
  `@/components/use-theme`, e la dipendenza `next-themes` è stata rimossa insieme a
  `@base-ui/react` (usata solo dal combobox morto) e a `@vitest/coverage-v8` (dichiarata
  senza nessuno script o passo di CI che raccolga la copertura).
  → [frontend/src/components/ui/sonner.tsx](../frontend/src/components/ui/sonner.tsx)

### Una sola classe d'errore applicativo al posto di otto

- **Sette servizi avevano ognuno la propria classe d'errore, identica alle altre carattere
  per carattere**, e otto rotte avevano ognuna la propria copia del codice che la traduce in
  risposta HTTP (`instanceof`, `res.locals.apiErrorMessage`, `res.status().json()`). Solo
  `settings.ts` ne conteneva sei, invocate da 22 blocchi `try/catch` tutti uguali. Il costo
  non era la lunghezza ma la soglia: aggiungere l'ottavo servizio significava scrivere
  l'ottava classe e la nona copia del traduttore, e nessuno se ne sarebbe accorto.

  Ora esiste `ApiError` (messaggio già destinato al client + `statusCode`), le classi dei
  servizi la estendono, e la traduzione avviene una volta sola in
  [errorHandler.ts](../backend/src/middleware/errorHandler.ts). Le rotte non hanno più
  `try/catch`: Express 5 inoltra da sé il rifiuto di un handler `async` al middleware
  d'errore, cosa su cui `crudRouter` faceva già affidamento.

  Due dettagli emersi copia per copia, che è esattamente il motivo per cui la duplicazione
  costa: le classi di `logManager` e `logoManager` avevano `statusCode = 400` di default
  invece di 500, ma **nessuna delle 40 istanziazioni omette lo status**, quindi quei default
  divergenti non sono mai stati in gioco; e la copia in `interventions.ts` dimenticava
  `res.locals.apiErrorMessage`, per cui un invio email fallito finiva nel registro delle
  azioni utente come `error=HTTP 502`, senza il motivo. Entrambi risolti dal fatto che ora
  la logica è una sola.
  → [backend/src/services/apiError.ts](../backend/src/services/apiError.ts),
  [backend/src/routes/settings.ts](../backend/src/routes/settings.ts)

### La configurazione Prettier del frontend descriveva uno stile che il codice non usava

- **164 file su ~180 non passavano `prettier --check`.** Il frontend aveva un `.prettierrc`
  (2 spazi, niente punto e virgola, 80 colonne) e uno script `format`, ma nessun
  `format:check` e nessun passo di CI che lo verificasse: la configurazione era decorativa.
  Il codice scritto a mano nel frattempo si era assestato su 4 spazi e punto e virgola —
  123 file su 174 — cioè esattamente la configurazione del backend.

  Allineare il file di configurazione al codice, invece del contrario, è la scelta che
  riformatta di meno e che rende i due pacchetti coerenti fra loro. Il vero problema non era
  estetico: senza un controllo automatico, ogni file toccato in futuro sarebbe stato
  riformattato dall'editor di turno, seppellendo la modifica vera dentro un diff che tocca
  tutto il file. La riformattazione è in un commit separato che non cambia altro, così
  `git blame` resta leggibile.
  → [frontend/.prettierrc](../frontend/.prettierrc),
  [.github/workflows/ci.yml](../.github/workflows/ci.yml)

### Duplicazioni consolidate

- **I due generatori di PDF condividevano ~130 righe identiche.** `reportPdf.ts` e
  `interventionPdf.ts` avevano ognuno la propria copia di registrazione dei font,
  `loadImageDataUrl`, layout di tabella, `sectionBarRow`/`dualFieldRow` e dell'intero
  frontespizio dei riepiloghi per cliente; i token grafici (il blu `#2A75B9`, i corpi
  carattere) comparivano in **quattro** blocchi `styles` separati. È la duplicazione più
  cara fra quelle trovate: cambiare un colore del marchio richiedeva quattro modifiche
  coordinate, e dimenticarne una non rompe la compilazione — produce un PDF sbagliato in
  mano al cliente. Inoltre `pdfmake.addFonts()` veniva eseguita due volte all'avvio.

  *Verifica:* i quattro documenti (rapporto singolo, riepilogo rapporti per cliente,
  intervento singolo, riepilogo interventi per cliente) sono stati rigenerati con lo stesso
  input prima e dopo, e confrontati byte a byte: differiscono solo per `/CreationDate` e
  `/ID`, cioè il timestamp di generazione.
  → [backend/src/services/pdf/shared.ts](../backend/src/services/pdf/shared.ts)

- **Sette tabelle identiche a meno del nome del DTO.** Ogni entità aveva il proprio
  `*-table.tsx` che ripeteva per intero la struttura "tabella su desktop, schede su mobile":
  `diff` fra `devices-table` e `issues-table` restituiva solo rinomine — più un
  `overflow-y-auto` rimasto sul `TableBody` dei difetti e su nessun altro. È il modo tipico
  in cui questa duplicazione fa danno: una differenza involontaria che non rompe niente e
  che non nota nessuno. Ora la struttura sta in `EntityTable`; i pulsanti di riga restano
  invece nei file delle entità, perché sono davvero diversi (i clienti ne hanno sei, i
  dispositivi due) e ridurli a configurazione costerebbe più di quanto farebbe risparmiare.

  Stessa logica per gli hook di lista: quattro `use*Rows` identici a meno del nome della
  funzione API sono diventati `useSearchableRows`, mentre quelli di rapporti e interventi
  restano separati perché usano anche `updateRow`. E quattro `*-filters.tsx` che si
  limitavano a inoltrare a `SearchInput` cambiando il testo del segnaposto sono stati
  eliminati: le pagine chiamano `SearchInput` direttamente. Quelli di clienti, rapporti e
  interventi restano, perché contengono anche i menu di ordinamento e di stato.

  *Verifica:* tutte e sette le liste sono state aperte con Playwright, a 1440px e a 390px,
  confrontando numero di colonne, di righe e di pulsanti per riga, i colori di stato di
  rapporti e interventi e il bordo colorato delle schede su mobile. Nessun errore in console.
  → [frontend/src/components/entity-table.tsx](../frontend/src/components/entity-table.tsx),
  [frontend/src/hooks/useSearchableRows.ts](../frontend/src/hooks/useSearchableRows.ts)

- **Rapporti e interventi ridichiaravano lo schema di lista invece di estenderlo.**
  `page`, `pageSize`, `search`, `sortOrder` e lo schema del parametro `:id` erano riscritti
  identici a quelli già esportati da `crudRouter.ts`. Ora li estendono, aggiungendo solo i
  filtri propri e restringendo `sortBy` alle colonne che sanno davvero ordinare: i limiti
  comuni a tutte le liste (per esempio `pageSize` massimo 1000) tornano a essere decisi in
  un posto solo.
  → [backend/src/routes/reports.ts](../backend/src/routes/reports.ts),
  [backend/src/routes/interventions.ts](../backend/src/routes/interventions.ts)

### Non fatto di proposito

- **La sidebar shadcn resta com'è**, con 15 dei suoi 25 export inutilizzati (~250 righe).
  È codice di terze parti copiato nel repository: potarlo lo farebbe divergere da monte, e
  un futuro `shadcn add sidebar` entrerebbe in conflitto con le modifiche. Codice inutilizzato
  dentro un file di libreria costa molto meno di codice inutilizzato scritto da noi, e a
  runtime non costa niente perché Vite lo elimina dal bundle. Diverso il caso di
  `combobox.tsx`, cancellato sopra: era inutilizzato **per intero**, e ricrearlo è un comando.
  → [frontend/src/components/ui/sidebar.tsx](../frontend/src/components/ui/sidebar.tsx)

---

## 2026-08-03 — Versione di nginx fissata nell'immagine del frontend

- **`FROM nginx:alpine` non indicava alcuna versione.** Un tag Docker non è una versione, è
  un'etichetta che l'autore a monte può spostare: quel testo oggi risolve a nginx 1.31.3, fra
  un anno a qualcos'altro, e nel repository non restava traccia di cosa fosse stato
  effettivamente collaudato. Una ricostruzione da zero — VM nuova, o immagini rimosse —
  poteva quindi portare un nginx maggiore diverso da quello su cui sono stati verificati gli
  header di sicurezza e le regole di cache. Ora `nginx:1.31-alpine`, la stessa versione già
  in uso: dentro quella riga le patch continuano ad arrivare, cambiare riga diventa una
  decisione invece di un effetto collaterale.
  → [frontend/Dockerfile](../frontend/Dockerfile)

- **Le altre immagini restano come sono, per motivi diversi fra loro.** `postgres:16` e
  `node:24-*` hanno già fissato il numero maggiore, che è la cosa che conta (un salto a
  Postgres 17 con formato dati incompatibile è il caso peggiore, ed è escluso).
  `cloudflare/cloudflared:latest` fluttua di proposito: Cloudflare deprecia le versioni
  vecchie del tunnel e può rifiutare i client obsoleti, quindi bloccarlo creerebbe un guasto
  ad orologeria invece di prevenirne uno.
  *Non fatto di proposito:* l'ancoraggio al digest (`@sha256:...`), l'unica difesa reale
  contro un'immagine malevola pubblicata sotto lo stesso tag. Interrompe però l'arrivo
  automatico delle patch e va mantenuto a mano: su un progetto con un solo manutentore, un
  Postgres ancorato e dimenticato per due anni è messo peggio di uno che fluttua dentro `16`.
  → [docker-compose.yml](../docker-compose.yml)

---

## 2026-08-03 — Requisiti minimi delle password

- **Il requisito era solo `min(8)`**, senza controlli di complessità. Andava bene finché si
  entrava dalla LAN; con l'app pubblicata su un dominio quel campo è la porta d'ingresso da
  internet. Il limitatore dei tentativi (5 ogni 15 minuti) rende lento un attacco a forza
  bruta, ma le prime cinque prove sono proprio quelle che indovinano `password1`. Ora servono
  8 caratteri **con almeno un numero e un carattere speciale**.
  L'insieme dei simboli accettati è volutamente aperto — vale tutto ciò che non è lettera o
  cifra, lettere accentate comprese — perché un elenco chiuso rifiuterebbe password già in
  uso altrove, spingendo verso quelle più prevedibili.
  → [backend/src/services/passwordPolicy.ts](../backend/src/services/passwordPolicy.ts),
  [backend/src/routes/auth.ts](../backend/src/routes/auth.ts)

- **Le password generate dall'app non avrebbero superato i nuovi requisiti:** l'alfabeto di
  generazione conteneva solo lettere e cifre, quindi l'app avrebbe consegnato credenziali
  che avrebbe rifiutato se digitate. Generazione e validazione ora stanno nello stesso
  modulo, che non tocca il database ed è quindi verificabile senza una connessione attiva.
  Cifra e simbolo sono garantiti per costruzione e poi mescolati (Fisher-Yates): lasciarli
  in posizione fissa ridurrebbe a due i caratteri da indovinare. Colta l'occasione per
  togliere la distorsione del modulo su un byte, che favoriva i primi caratteri
  dell'alfabeto.
  → [backend/src/services/passwordPolicy.ts](../backend/src/services/passwordPolicy.ts),
  [backend/src/services/authManager.ts](../backend/src/services/authManager.ts)

- **`reset-admin-password.js` aveva una terza copia della generazione**, con l'alfabeto
  vecchio: uno script di emergenza che consegna una password non conforme è il momento
  peggiore per accorgersene. Ora richiede il modulo compilato invece di duplicare la regola.
  → [backend/reset-admin-password.js](../backend/reset-admin-password.js)

- **Il frontend controllava `length < 8` in due punti separati**, con il messaggio scritto a
  mano in entrambi. Regola e testo ora stanno in un solo file, mostrato anche sotto il campo
  come promemoria: l'utente sa cosa serve prima di inviare, invece di scoprirlo dal
  messaggio di errore. La duplicazione rispetto al backend resta voluta e annotata — il
  controllo che vale è quello del server.
  → [frontend/src/lib/passwordPolicy.ts](../frontend/src/lib/passwordPolicy.ts),
  [frontend/src/pages/auth/ForcePasswordChangePage.tsx](../frontend/src/pages/auth/ForcePasswordChangePage.tsx),
  [frontend/src/components/dialogs/settings/changePasswordDialog.tsx](../frontend/src/components/dialogs/settings/changePasswordDialog.tsx)

> Le password già in uso non vengono invalidate: chi ne ha una non conforme continua a
> entrare finché non la cambia. I nuovi requisiti valgono dal prossimo cambio password.

---

## 2026-08-03 — Esposizione su dominio pubblico via Cloudflare Tunnel

Fine della modalità "solo LAN": l'app viene pubblicata su un dominio, e le scorciatoie
prese quando la rete era considerata fidata vanno tolte tutte insieme — a metà sarebbero
peggio che non fatte.

- **Il limitatore dei tentativi di login era aggirabile in modo banale.** `app.set("trust
  proxy", true)` dice a Express di credere a qualunque `X-Forwarded-For` in arrivo, e da
  quell'header Express ricava `req.ip`, che era la chiave del limitatore: bastava mandare
  un valore diverso a ogni tentativo per avere login illimitati. In LAN era un difetto
  teorico, su internet avrebbe reso il limitatore puramente decorativo. Ora ci si fida di
  un solo hop (nginx del frontend, l'unico che può raggiungere il backend) e l'IP reale si
  legge da `CF-Connecting-IP`, che Cloudflare **sovrascrive** scartando quanto inviato dal
  chiamante. È affidabile solo perché non esiste un percorso alternativo per raggiungere
  l'origine: nessuna porta pubblicata, nessun port forward.
  → [backend/src/middleware/clientIp.ts](../backend/src/middleware/clientIp.ts),
  [backend/src/index.ts](../backend/src/index.ts)

- **La mappa dei tentativi era memoria che un estraneo poteva far crescere.** Ogni IP
  sorgente creava una entry, e le entry venivano rimosse solo al login riuscito: mai per
  scadenza. Con IP che ruotano — la norma su internet, l'eccezione in LAN — cresceva senza
  limite. Il limitatore è stato estratto in un modulo proprio (senza dipendenze dal
  database, quindi testabile davvero), con scadenza effettiva, tetto massimo di entry e
  soglia portata da 10 a 5 tentativi per finestra.
  *Volutamente non fatto:* la persistenza tra riavvii. Il conteggio si azzera a ogni
  aggiornamento automatico, ma i riavvii non sono provocabili da chi attacca, e una
  tabella dedicata costerebbe una migrazione per un guadagno marginale.
  → [backend/src/services/loginRateLimit.ts](../backend/src/services/loginRateLimit.ts)

- **L'aggiornamento dell'app era lanciabile da qualsiasi utente autenticato**, non solo
  dall'amministratore: `/settings/update/run` non aveva `requireAdmin`, e il pannello era
  visibile a tutti nella UI (solo la sezione Utenti era filtrata). Non era un'incoerenza
  del file — nelle impostazioni solo il ripristino backup era riservato all'admin — ma
  quella rotta non cambia una preferenza: esegue sull'host il codice di `origin/main` e
  ricostruisce lo stack. Con l'app su internet, un singolo account compromesso non deve
  bastare per arrivarci. Ora le tre rotte `/settings/update*` richiedono `requireAdmin` e
  la sezione è nascosta ai non-admin, insieme a "Utenti", tramite un elenco unico di
  sezioni riservate invece di un controllo ripetuto per chiave.
  → [backend/src/routes/settings.ts](../backend/src/routes/settings.ts),
  [frontend/src/pages/settings/SettingsPage.tsx](../frontend/src/pages/settings/SettingsPage.tsx)

- **Il registro delle azioni utente aveva una copia locale della stessa logica**, che
  prendeva la prima entry di `X-Forwarded-For`: un log di controllo in cui l'IP è deciso da
  chi compie l'azione non serve a niente. Ora usa la stessa funzione del limitatore.
  → [backend/src/middleware/userActionLogger.ts](../backend/src/middleware/userActionLogger.ts)

- **Il cookie di sessione viaggiava senza `secure`**, cosa corretta finché l'unico accesso
  era HTTP in LAN. Ora è `secure` in produzione e resta in chiaro solo in sviluppo, dove il
  frontend gira su `http://localhost` e un cookie `secure` non verrebbe proprio inviato.
  Nessun attributo `domain`, come già prima: è ciò che permette di cambiare dominio senza
  toccare il codice.
  → [backend/src/middleware/requireAuth.ts](../backend/src/middleware/requireAuth.ts)

- **Il CORS è stato rimosso invece che ristretto.** Era `origin: true`, cioè "rifletti
  qualunque origine". Il piano era di fissarlo sull'origine di produzione, ma in produzione
  non esiste nessuna richiesta cross-origin: nginx serve frontend e `/api` dalla stessa
  origine. Non attivare il middleware è più sicuro che configurarlo, e toglie di mezzo
  l'unico valore che sarebbe andato aggiornato a ogni cambio di dominio. Resta attivabile
  in sviluppo tramite `CORS_ORIGIN`, dove Vite su `:5173` chiama il backend su `:3000` e le
  richieste sono cross-origin per davvero.
  → [backend/src/index.ts](../backend/src/index.ts),
  [docker-compose.dev.yml](../docker-compose.dev.yml)

- **Nessun container pubblica più porte sull'host.** La `3000:3000` del backend permetteva
  di scavalcare nginx, e con esso l'unico punto in cui l'IP del client è attendibile; la
  `80:80` del frontend non serve più, visto che cloudflared raggiunge nginx dalla rete
  interna della compose. Conseguenza voluta: dalla LAN, via IP, non si entra più. Il modo
  di riaprire un accesso di emergenza è annotato nel compose e nel README.
  → [docker-compose.yml](../docker-compose.yml)

- **Aggiunti gli header di sicurezza** (`nosniff`, `X-Frame-Options`/`frame-ancestors`,
  `Referrer-Policy`, HSTS), che non c'erano affatto. Stanno in uno snippet incluso, non
  scritti una volta sola nel blocco `server`, per un motivo preciso: in nginx un
  `add_header` dentro un `location` **annulla** tutti quelli ereditati, e due location qui
  ne hanno già uno per `Cache-Control` — sarebbero rimaste scoperte proprio `index.html` e
  gli asset statici. Lo snippet sta fuori da `conf.d/` perché nginx include da sé ogni
  `conf.d/*.conf` nel blocco `http`. Verificato che su tutte e tre le location gli header
  escano e il `Cache-Control` resti quello di prima.
  → [frontend/security-headers.conf](../frontend/security-headers.conf),
  [frontend/nginx.conf](../frontend/nginx.conf)

- **Il dominio si sceglie durante l'installazione** (`scripts/install-tunnel.sh`): lo
  script lo chiede, autorizza l'account Cloudflare, crea tunnel, ingress e record DNS.
  Rilanciarlo è anche il modo di cambiare dominio, perché modificare `config.yml` a mano
  aggiornerebbe l'ingress ma non il DNS. Il tunnel è gestito localmente e non a token
  proprio per questo: la configurazione deve stare sulla VM, non nella dashboard.
  L'applicazione continua a non conoscere il proprio dominio — `PUBLIC_DOMAIN` in `.env`
  serve solo a stamparlo all'avvio — quindi il cambio resta configurazione, mai una
  ricostruzione. Aggiunto a `edit-env.sh`, che riscrivendo `.env` dalla propria lista di
  chiavi altrimenti lo avrebbe cancellato a ogni esecuzione.
  *Trappola trovata alla prima esecuzione reale:* `cloudflared tunnel login` **ignora
  `--origincert`** quando decide dove scrivere il certificato, e usa sempre la propria
  directory di default (`/home/nonroot/.cloudflared` nell'immagine ufficiale). Montando la
  cartella dell'host altrove, il `cert.pem` finiva dentro il container `--rm` e spariva con
  lui, facendo fallire il comando successivo con "cannot find a valid certificate". Ora
  script e servizio compose montano entrambi su quel percorso: uno solo, quello che
  cloudflared usa comunque.
  Il record DNS viene creato **senza** `--overwrite-dns` al primo tentativo, chiedendo
  conferma solo se esiste già: il dominio ospita altri sottodomini in uso, e un errore di
  battitura avrebbe altrimenti dirottato in silenzio uno di quelli su EasyLab.
  → [scripts/install-tunnel.sh](../scripts/install-tunnel.sh),
  [scripts/edit-env.sh](../scripts/edit-env.sh),
  [scripts/start-server.sh](../scripts/start-server.sh)

- **Documentato un limite che si sarebbe scoperto durante un'emergenza:** il piano Free di
  Cloudflare taglia le richieste sopra i 100 MB, e nginx accetta fino a 2 GB proprio per il
  caricamento dei dump. Ripristinare un backup più grande dall'interfaccia web fallirà con
  un 413 generato da Cloudflare, non dall'app. Ripristinare un backup *già sul server* non
  è soggetto al limite; per un archivio esterno più grande resta `scripts/restore-db.sh`.
  → [README.md](../README.md), [frontend/nginx.conf](../frontend/nginx.conf)

---

## 2026-08-03 — Manifest completato per l'installazione come app (Chrome/Brave)

- **Il `site.webmanifest` aggiunto in precedenza (voce sotto) non bastava a far comparire
  l'icona di installazione** di Chrome/Brave: mancavano `start_url`, `scope` e `id`, campi
  che i criteri di installabilità di Chromium richiedono esplicitamente (senza `start_url`
  il browser non sa quale URL aprire dall'icona sulla home/desktop). Aggiunti insieme a
  `lang: "it"`. Non è stato aggiunto un service worker: non serve più ai criteri di
  installabilità attuali di Chromium, ed evita il rischio di cache-obsoleta con la feature
  di auto-update già presente (vedi il commento su `/index.html` in `nginx.conf`).
  **Nota:** l'icona di installazione compare solo su un'origine "sicura" (HTTPS o
  `localhost`) — da un altro dispositivo in LAN via IP su HTTP semplice (situazione attuale,
  vedi [[project_internet_exposure_plan]]) Chrome/Brave non la mostrano; funziona già oggi
  aprendo il sito da `localhost` sulla stessa macchina del server.
  → [frontend/public/site.webmanifest](../frontend/public/site.webmanifest)

---

## 2026-08-03 — Rinominato il progetto da Masso a EasyLab

- **Il nome "Masso" viene sostituito da "EasyLab"** ovunque nel codice: testo visibile
  (titolo pagina, webmanifest, login, placeholder impostazioni, email di test), slug di
  progetto (`masso-web` → `easylab-web` in `package.json`, chiavi `localStorage` del tema
  e del calendario), unit systemd (`masso-update.*`/`masso-check-updates.*` →
  `easylab-update.*`/`easylab-check-updates.*`), valori di esempio in `.env.example` e
  `scripts/edit-env.sh` (`POSTGRES_USER`/`POSTGRES_DB`/`BACKUP_HOST_DIR`/`LAB_NAME`/
  `LAB_EMAIL`), e i riferimenti in `README.md` e negli script di deploy
  (`configure-static-ip.sh`, `install-updater.sh`, `restore-db.sh`).
  Il repository GitHub e l'eventuale deploy esistente in `/opt/masso-web` restano da
  rinominare a mano sul server (`gh` non era disponibile in questo ambiente per farlo
  automaticamente); rinominare le unit systemd installate su una VM già in produzione
  richiede di rilanciare `scripts/install-updater.sh` dopo il pull.
  → [.env.example](../.env.example), [README.md](../README.md),
  [frontend/index.html](../frontend/index.html),
  [frontend/public/site.webmanifest](../frontend/public/site.webmanifest),
  [frontend/package.json](../frontend/package.json),
  [frontend/src/lib/theme.ts](../frontend/src/lib/theme.ts),
  [frontend/src/lib/calendarView.ts](../frontend/src/lib/calendarView.ts),
  [backend/src/services/companyManager.ts](../backend/src/services/companyManager.ts),
  [backend/src/services/emailManager.ts](../backend/src/services/emailManager.ts),
  [ops/systemd/](../ops/systemd/), [scripts/](../scripts/)

---

## 2026-08-03 — Favicon e icona app al posto del default di Vite

- **L'app usava ancora la favicon di default di Vite** (`vite.svg`), mai sostituita dal
  set di icone del progetto. Aggiunto il set EasyLab (`svg`, `32px`, `apple-touch 180px`,
  `192`/`512`) in `frontend/public/` e collegato da `index.html`; aggiunto anche un
  `site.webmanifest` che referenzia le icone 192/512 per il salvataggio in home screen su
  mobile (nessun service worker/PWA plugin configurato, resta solo l'icona).
  → [frontend/index.html](../frontend/index.html),
  [frontend/public/site.webmanifest](../frontend/public/site.webmanifest)

---

## 2026-07-31 — Contenuto lo scroll della tabella Log in Impostazioni

- **La sezione Log delle Impostazioni scrollava per intero** (filtri, tabella e paginazione
  insieme), invece di contenere lo scroll nella sola tabella come nelle altre pagine
  (Interventi, Rapporti, ecc.). `SettingsCard` non esponeva un `className` per il `Card`
  esterno, quindi `LogsSettingsPanel` non poteva farlo diventare una colonna flex a
  altezza piena con la tabella come unica area `overflow-y-auto`. Aggiunta la prop
  `className` a `SettingsCard` (usata solo da questo pannello: gli altri restano invariati)
  e reso `LogsSettingsPanel` una colonna flex con selettore data/ricerca e paginazione
  fissi e solo il riquadro della tabella scrollabile.
  → [frontend/src/components/settings/settingsUi.tsx](../frontend/src/components/settings/settingsUi.tsx),
  [frontend/src/components/settings/logsSettingsPanel.tsx](../frontend/src/components/settings/logsSettingsPanel.tsx)

---

## 2026-07-31 — Doppio click sul calendario per creare un intervento, hover righe tabella più rapido

- **Doppio click su una cella libera del calendario interventi (dashboard) apre "Nuovo
  intervento" con la data già precompilata.** Il click singolo resta riservato al
  drag-to-select nativo di `react-big-calendar`, quindi si distingue tramite
  `slotInfo.action === "doubleClick"` in `onSelectSlot` (richiede la prop `selectable`).
  Aggiunta la prop opzionale `initialDate` a `CreateInterventionDialog` per precompilare il
  campo data all'apertura.
  → [frontend/src/pages/calendar/components/interventions-calendar.tsx](../frontend/src/pages/calendar/components/interventions-calendar.tsx),
  [frontend/src/components/dialogs/create/createInterventionDialog.tsx](../frontend/src/components/dialogs/create/createInterventionDialog.tsx)

- **Nuovo bottone "Nuovo intervento" in dashboard, accanto a "Nuovo rapportino".** La
  creazione dell'intervento (risoluzione cliente, chiamata API, refresh) è stata spostata
  da `interventions-calendar.tsx` a `DashboardPage`, che ora possiede anche l'hook
  `useCalendarInterventions` e lo passa come props (`events`, `isLoading`) al calendario:
  così sia il bottone in alto sia il doppio click su una cella condividono la stessa
  logica di creazione, e il calendario e i contatori delle card si aggiornano insieme
  senza reload della pagina.
  → [frontend/src/pages/dashboard/DashboardPage.tsx](../frontend/src/pages/dashboard/DashboardPage.tsx),
  [frontend/src/pages/calendar/components/interventions-calendar.tsx](../frontend/src/pages/calendar/components/interventions-calendar.tsx)

- **Transizione hover delle righe tabella accorciata** (da 150ms di default Tailwind a
  50ms) perché risultava percettibilmente lenta.
  → [frontend/src/components/ui/table.tsx](../frontend/src/components/ui/table.tsx)

---

## 2026-07-31 — Pagine "report cliente" e "interventi cliente", e fix del live-reload in sviluppo

- **Nuovo bottone "apri interventi" nella tabella Clienti, distinto da "apri report".**
  Prima la tabella Clienti aveva un solo bottone (icona generica) per aprire la pagina dei
  report del cliente; mancava l'equivalente per gli interventi. Ora ogni riga ha due
  bottoni di apertura: `ClipboardList` (giallo) per i report, `HardHat` (azzurro) per gli
  interventi — le stesse icone già usate per le voci "Rapporti" e "Interventi" nella
  sidebar. I due bottoni di stampa resoconto restano `Printer`, stessi colori di prima.
  → [frontend/src/pages/customers/components/customers-table.tsx](../frontend/src/pages/customers/components/customers-table.tsx)

- **La pagina dei report di un cliente (`/clients/:id`) ora usa una tabella invece delle
  card**, per essere coerente con Rapporti/Interventi/tutte le altre liste dell'app (stessa
  struttura tabella desktop + card list mobile, stesso colore di riga per stato). Aggiunto
  anche un bottone "Stampa" in alto a destra (prima la stampa del resoconto era disponibile
  solo dalla tabella Clienti).
  → [frontend/src/pages/customers/CustomerPage.tsx](../frontend/src/pages/customers/CustomerPage.tsx)

- **Nuova pagina `/clients/:id/interventions`**, analoga alla precedente ma per gli
  interventi del cliente: tabella con filtro per stato, paginazione e bottone "Stampa" in
  alto a destra.
  → [frontend/src/pages/customers/CustomerInterventionsPage.tsx](../frontend/src/pages/customers/CustomerInterventionsPage.tsx)

- **Vite non rilevava le modifiche ai file nel container di sviluppo.** Su Docker Desktop
  per Windows i bind mount non propagano gli eventi inotify nativi nel container Linux:
  il file cambiava (visibile dentro il container), ma chokidar non se ne accorgeva e
  l'HMR non scattava mai. Aggiunto `server.watch.usePolling: true` a `vite.config.ts`.
  → [frontend/vite.config.ts](../frontend/vite.config.ts)

- **Volume `frontend_node_modules` disallineato da `package.json`.** Il volume nominato
  persisteva da prima dell'introduzione di Vitest (commit `ae577c8`) e non veniva mai
  aggiornato ai riavvii, perché Docker ripopola un volume nominato solo se vuoto: il
  container falliva ad avviarsi con `Cannot find package 'vitest'` non appena veniva
  ricreato/riavviato. Reinstallate le dipendenze nel volume esistente. Notato anche che
  il tag immagine `masso-web-frontend:latest` è condiviso tra `docker-compose.yml`
  (produzione, nginx) e `docker-compose.dev.yml` (sviluppo, Vite): nessuno dei due
  specifica un `image:` esplicito, quindi l'ultima build eseguita sovrascrive il tag
  dell'altra. Da valutare l'assegnazione di nomi immagine distinti per evitare che una
  build di produzione rompa silenziosamente l'ambiente di sviluppo (o viceversa).

## 2026-07-31 — Scroll delle tabelle contenuto e stato del bottone di aggiornamento

- **Bottone "Aggiorna adesso" disabilitato quando non c'è nulla da aggiornare.** Prima
  restava cliccabile anche a `updateAvailable: false`, permettendo di avviare un
  aggiornamento (rebuild dei container, breve downtime) senza motivo.
  → [frontend/src/components/settings/updateSettingsPanel.tsx](../frontend/src/components/settings/updateSettingsPanel.tsx)

- **Solo la tabella scorre, non l'intera pagina.** Nelle liste (Clienti, Interventi,
  Rapporti, Tecnici, Difetti, Collaboratori, Dispositivi), con molte righe scorreva
  l'intero `<main>`, portando fuori vista intestazione, filtri e paginazione.
  *Perché:* queste pagine erano un flex-column senza un contenitore verticale delimitato:
  il contenuto cresceva oltre il viewport e il browser applicava lo scroll al livello più
  esterno che lo consentiva (`<main>`). Ora ogni pagina occupa `h-full` e solo il blocco
  della tabella è `flex-1 overflow-y-auto`; la paginazione, fuori da quel blocco, resta
  sempre visibile in fondo. Verificato con Playwright iniettando righe extra: `main` non
  supera più l'altezza del viewport, solo il contenitore della tabella scrolla.
  → `frontend/src/pages/{customers/CustomersPage,interventions/InterventionsPage,reports/ReportsPage,technicians/TechniciansPage,issues/IssuesPage,collaborators/CollaboratorsPage,devices/DevicesPage}.tsx`

## 2026-07-31 — Affidabilità, test del frontend e riduzione dei file monolitici

Passata di manutenzione su punti emersi da una revisione del codice. Nessuna modifica
funzionale visibile all'utente: cambiano robustezza, copertura di test e organizzazione.

### Affidabilità in esecuzione

- **Arresto pulito del backend.** `SIGTERM`/`SIGINT` ora fermano gli scheduler, smettono di
  accettare connessioni, lasciano finire le richieste in volo e chiudono il pool
  PostgreSQL, con un limite di 10s oltre il quale si esce comunque.
  *Perché:* l'aggiornamento automatico ricrea i container a ogni update, quindi il backend
  riceve `SIGTERM` di routine, non in casi eccezionali; prima ogni aggiornamento troncava
  le richieste in corso (un download PDF, una scrittura di backup) e chiudeva di colpo le
  connessioni al database.
  → [backend/src/index.ts](../backend/src/index.ts), [backend/src/db/index.ts](../backend/src/db/index.ts)

- **`exec` nel comando del container backend.** `docker-compose.yml` ora lancia
  `sh -c 'node migrate.js && exec node dist/src/index.js'` e dichiara
  `stop_grace_period: 30s`.
  *Perché:* senza `exec`, `sh` resta PID 1 e non inoltra `SIGTERM` al processo Node —
  l'arresto pulito qui sopra non verrebbe mai eseguito e Docker ucciderebbe il container
  con `SIGKILL`. La grace period è più ampia del timeout applicativo così l'arresto ha il
  tempo di completarsi. Rimosso anche l'`echo "DATABASE_URL=..."` iniziale, che stampava
  la password del database nei log del container.
  → [docker-compose.yml](../docker-compose.yml)

- **Healthcheck su backend e frontend.** Prima ce l'aveva solo `db`. Il frontend ora
  dipende dal backend con `condition: service_healthy`.
  *Perché:* `restart: always` copre il processo morto, non quello vivo ma bloccato.
  L'endpoint `/api/health` esisteva già e non lo usava nessuno.
  → [docker-compose.yml](../docker-compose.yml)

- **Pulizia periodica delle sessioni scadute** (ogni ora, più una passata all'avvio).
  *Perché:* `getSessionUser` cancellava una sessione scaduta solo se qualcuno presentava
  proprio quel token; le sessioni di chi chiude il browser e non torna più restavano in
  tabella per sempre.
  → [backend/src/services/authManager.ts](../backend/src/services/authManager.ts)

- **Tetto di sicurezza sulle liste non paginate** (5000 righe, con warning nei log quando
  scatta). Omettere `page`/`pageSize` resta legittimo e voluto — combobox e dashboard
  hanno bisogno dell'elenco completo — ma la query non è più illimitata.
  *Perché:* senza `limit` la query cresce con la tabella e a un certo volume carica in
  memoria l'intero contenuto a ogni richiesta. Il limite è molto sopra i volumi reali,
  quindi oggi non cambia nulla; il warning serve perché una troncatura silenziosa (una
  combobox a cui mancano voci) sarebbe difficilissima da diagnosticare.
  → [backend/src/db/queries/pagination.ts](../backend/src/db/queries/pagination.ts) e le 7 query di lista

- **`ensureDefaultAdmin` ora ha un `.catch`.** Era invocata con `void` e senza gestione
  dell'errore.
  *Perché:* trovato durante la verifica in container dello spegnimento pulito — con il
  database irraggiungibile il backend si avviava, stampava "Server running" e subito dopo
  moriva per rejection non gestita (Node 24 termina il processo). In produzione il
  problema è mascherato da `depends_on: service_healthy`, ma un intoppo momentaneo non
  deve abbattere il server: ora l'errore viene registrato e l'admin sarà creato al
  riavvio successivo.
  → [backend/src/index.ts](../backend/src/index.ts)

- **Log per richiesta su stdout** con metodo, percorso, stato e durata, e marcatura
  `slow=true` oltre 1s. Formato `chiave=valore` come il log azioni utente esistente.
  *Perché:* mancava qualunque traccia delle GET e dei tempi di risposta: quando qualcosa
  risultava lento non c'era niente su cui lavorare. Complementare a `userActionLogger`,
  che registra su file solo le modifiche ai dati, per audit.
  → [backend/src/middleware/requestLogger.ts](../backend/src/middleware/requestLogger.ts)

### Test

- **Il frontend ora ha dei test.** Vitest + Testing Library + jsdom, 33 test su 6 file,
  aggiunti allo stesso job CI di lint/typecheck/build.
  *Perché:* era il buco più grosso rimasto — il backend aveva 40 test, il frontend zero, e
  la CI si fermava a typecheck e build. La logica più delicata sta lì.
  Coperti: la guardia anti-race di `usePaginatedRows` (le risposte lente di richieste
  superate non devono sovrascrivere la tabella), `useTablePagination`,
  `useDebouncedValue`, `getApiErrorMessage`, le preferenze di tema salvate in
  `localStorage`, e `AppErrorBoundary` come primo test di componente.
  *Verifica dei test stessi:* disattivando la guardia in `usePaginatedRows` i due test
  relativi falliscono, quindi rilevano davvero la regressione.
  → [frontend/vite.config.ts](../frontend/vite.config.ts), [frontend/src/test/setup.ts](../frontend/src/test/setup.ts), i file `*.test.ts(x)`

### Verifiche eseguite

Pipeline CI completa verde su entrambe le app: lint, format (backend), typecheck, test
(40 backend + 33 frontend), build. `docker compose --env-file .env.example config`
interpola correttamente.

Lo spegnimento pulito è stato provato davvero, in container con un PostgreSQL usa e getta,
perché dipende dalla consegna del segnale e non è verificabile da un test unitario:
`ps` conferma che PID 1 è `node dist/src/index.js` (quindi `exec` fa il suo lavoro), il
comando dell'healthcheck restituisce `{"status":"ok"}`, e `docker stop` produce
"Ricevuto SIGTERM" → "Arresto completato." con uscita 0 in **1 secondo**, invece dei 10
secondi che precedevano il `SIGKILL`.

### Organizzazione del codice

- **`backupManager.ts` diviso in 7 moduli** (1092 righe → il maggiore è 293). Il file
  resta la facciata: rotte e test continuano a importare da lì, le riesportazioni tengono
  stabile l'API pubblica.
  *Perché:* mescolava impostazioni persistite, invocazione di processi esterni, protocollo
  SMB, ripristino e scheduler. La suddivisione è per responsabilità, con `backupError` e
  `backupLock` isolati apposta per non creare cicli di import fra dump e ripristino.
  → `backend/src/services/backup{Error,Files,Lock,Process,Restore,Smb,State,Manager}.ts`

- **`backupSettingsPanel.tsx` diviso in 8 file** (979 righe → 29 nel pannello). Stato e
  azioni in `useBackupPanel`, una scheda per file.
  *Perché:* un solo componente teneva ~25 variabili di stato e ~560 righe di JSX. Le
  schede ricevono l'oggetto dell'hook come unica prop: condividono lo stesso stato, e
  enumerarne i campi nelle firme non aggiungerebbe informazione.
  → [frontend/src/components/settings/backup/](../frontend/src/components/settings/backup/)

- **Prettier anche sul backend**, con config propria (4 spazi, `semi: true`, 120 colonne)
  invece di quella del frontend (2 spazi, `semi: false`, 80 colonne). `format:check` è ora
  uno step della CI.
  *Perché:* riusare la config del frontend avrebbe riformattato l'intero backend
  seppellendo i diff veri — era il motivo per cui Prettier qui era stato saltato. Una
  config allineata allo stile già in uso risolve il problema.
  → [backend/.prettierrc](../backend/.prettierrc), [.github/workflows/ci.yml](../.github/workflows/ci.yml)

### Codice morto rimosso

- **`reportPdfLegacy.ts`** (361 righe) e la variabile `REPORT_PDF_LAYOUT`. Il layout
  "sections" introdotto in `ac067e4` è ora l'unico.
  *Perché:* mantenere due generatori PDF allineati a ogni modifica del report è un costo
  ricorrente per un fallback mai usato. Resta recuperabile da git.
- **`backend/src/templates/reportPrintTemplate.ts`** (403 righe), generatore HTML
  precedente al passaggio a pdfmake, non referenziato da nessuna parte.

### Verificato, nessun intervento necessario

- **Accessibilità.** Controllati tutti i `.tsx` fuori da `components/ui/`: ogni bottone con
  sola icona ha già un `aria-label` (77 in totale), nessun `<img>` è senza `alt`, ogni
  `<Input>` ha un `<Label>` associato, e `index.html` dichiara già `lang="it"`. La
  segnalazione iniziale ("aria-label sporadici") derivava da un conteggio per file che
  contava anche i file privi di bottoni: era sbagliata.
- **Endpoint `/print`.** Erano indicati come possibile causa di caricamenti illimitati:
  in realtà sono per-id (un PDF per un record) e non esiste alcun endpoint di stampa
  massiva. La generazione del PDF resta sincrona, ma per un solo documento.

### Note

- `npm audit` sul frontend segnala 2 vulnerabilità high in `react-router` (advisory
  GHSA-qwww-vcr4-c8h2). Riguardano la modalità RSC, che questa SPA non usa; la correzione
  richiederebbe un downgrade breaking a 7.11. Non affrontato in questa passata.
