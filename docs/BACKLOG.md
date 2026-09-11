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

**Prestazioni**
- Ricerca libera su report e interventi: la condizione `OR` attraversa cinque tabelle, quindi il
  database non può usare gli indici trigram e la scansione cresce con l'archivio. Soluzione
  provata come prototipo: una ricerca per tabella, ognuna sul suo indice, unite con `UNION` degli
  id. Misure del 2026-09-07 sul database di sviluppo: 319 → 35 ms a 20.000 report, 2893 → 558 ms
  a 100.000; una ricerca senza risultati da 359 a 3,5 ms.
- I dialoghi di creazione (report, intervento) caricano `listDevices()` e `listIssues()` interi
  all'apertura. Oggi sono cataloghi piccoli (pochi KB); il tetto delle 5000 righe li
  troncherebbe senza avviso se crescessero. Il cliente invece è già cercato sul server
  (`lib/customerLookup.ts`, 2026-09-11).
- `GET /api/report-technicians` (l'intera tabella report-tecnico) non ha più chiamanti nel
  frontend dal 2026-09-11, quando dialogo e dettaglio del report hanno iniziato a ricevere il
  tecnico con il report. Si può togliere, insieme al suo test; lasciata finché non si è certi che
  nessuno script esterno la usi.
- Nessuna cache per i PDF: circa 470 ms per ricevuta, costanti con il volume perché è lavoro di
  CPU di pdfmake, e sincroni, quindi bloccano il server per quel mezzo secondo. Urgenza bassa
  finché le stampe restano poche.

**Qualità**
- La riconciliazione del tecnico esterno al salvataggio di un report (aggiungi / aggiorna il
  prezzo / sostituisci / togli) è copiata identica in `ReportsPage`, `ReportPage` e
  `TechnicianPage`. Il commento di `toReportUpdatePayload` dice che lì "le tre non sono uguali",
  ma lo sono: cambia solo cosa si ricarica dopo. Candidata a una `syncReportTechnician` in
  `lib/reportForm.ts`, come è stato fatto per la nota degli interventi (CHANGELOG del
  2026-09-11): è esattamente il tipo di copia che prima o poi si allontana. I test di
  `ReportsPage` coprono già i quattro casi.
- `LAB_LOGO_TEXT` sta in `.env.example`, in `edit-env.sh` e nei due `docker-compose`, ma nessun
  file del codice la legge: configurazione morta, da togliere o da ricollegare.
- Il doppio click su un giorno libero del calendario (apre la creazione con la data) non ha
  test: in jsdom la selezione di react-big-calendar non funziona. Da coprire con un test nel
  browser, se ne arriverà uno.
- Ricerca del cliente scritto a mano: il server non ignora gli accenti, quindi "Nicolo" non trova
  "Nicolò" (vedi `findCustomerByText`). Scegliendo dai suggerimenti il problema non si pone; la
  soluzione completa è l'estensione `unaccent` di Postgres nella ricerca clienti.

**Sicurezza e messa in produzione**
- 2FA, fase 5: obbligo della verifica in due passaggi per l'admin, rimandato a flusso collaudato.
  Vedi [2FA-PLAN.md](2FA-PLAN.md).
- 2FA, collaudo a mano prima di considerarla in produzione: attivazione con un'app reale, login
  da telefono, ripristino di un backup con una `secret.key` diversa. Dal CHANGELOG del
  2026-09-08.
- Esposizione su dominio pubblico: la parte applicativa è fatta; restano i passi sul conto
  Cloudflare e l'installazione sulla VM, descritti nel [README](../README.md) ("Da fare su
  Cloudflare", "Da fare sulla VM"). Se sono già stati fatti, questa voce va tolta.

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
