---
name: visual-check
description: Come verificare a schermo una modifica di interfaccia o di layout di masso-web con Playwright e Edge, come admin, a più larghezze e nei due temi, e mostrare il risultato all'utente. Da usare prima di dichiarare finita una modifica di UI, CSS o PDF.
---

# Controllo visivo

Una modifica di interfaccia non è finita finché non è stata **vista**: screenshot a **almeno due larghezze** (telefono 390 px e desktop 1440 px), tema chiaro e scuro. Sì, si può fare: Playwright c'è.

## Playwright e il browser

- Playwright sta nella cache di npx, non nel progetto: cercarlo con
  `Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx\*\node_modules\playwright" -Directory` (PowerShell: git-bash non vede `$LOCALAPPDATA`).
- Script `.cjs`: `require("<percorso assoluto>/playwright")`. Script `.mjs`: `NODE_PATH` non vale, importare per URL assoluto e scartare il wrapper CJS: `const pw = await import("file:///.../playwright/index.js"); const chromium = pw.chromium ?? pw.default.chromium;`.
- Non ci sono browser scaricati e Chrome può non esserci: `chromium.launch({ channel: "msedge" })` (Edge è Chromium, che è ciò che conta per `::-webkit-*`).
- Node su Windows non legge `/tmp` di git-bash: tenere i file temporanei nella cartella scratchpad e usare la forma `C:/...` per node.
- Headless nasconde le scrollbar classiche: per misurarle `ignoreDefaultArgs: ["--hide-scrollbars"]` e `args: ["--disable-features=OverlayScrollbar"]`.
- Cambio tema: `localStorage.setItem("vite-ui-theme", "dark" | "light")` e ricarica.

## Entrare come admin

Si prova **come admin** (utente con id più basso), non con un utente senza privilegi: le sezioni di Impostazioni riservate all'admin (Utenti, Azienda, Email, Backup, Aggiornamenti, Log) altrimenti non si vedono e un controllo le salta in silenzio.

- L'admin ha la verifica in due passaggi: **chiedere all'utente il valore del cookie di sessione** del suo browser (DevTools, Application, Cookies) e passarlo a Playwright. Funziona senza codice. Non salvarlo da nessuna parte (né in file tracciati né in memoria) e non scriverlo nelle PR.
- Non inserire sessioni a mano nel database e non cercare password: l'inserimento di una sessione che aggira il 2FA viene negato. Se negato, fermarsi e dirlo.
- **Nome del cookie**: provarli entrambi con curl prima di concludere che è scaduto: `for n in __Host-session session; do curl -s -o /dev/null -w "$n %{http_code}\n" -H "Cookie: $n=$T" http://localhost:3000/api/auth/me; done`. Chi dà 200 è il nome giusto (`session` con `NODE_ENV=development`, altrimenti `__Host-session`, che richiede `secure: true` e `url: "https://localhost"`).
- **CORS**: il frontend (5173) chiama il backend (3000) su un'altra origine. Se ogni pagina rimanda al login e la tabella ha zero righe, guardare `page.on("console")`: di solito è "blocked by CORS policy" e il container è partito prima che `CORS_ORIGIN` fosse impostato (serve `docker compose -f docker-compose.dev.yml up -d`, non basta `docker restart`).
- Dopo `page.goto` aspettare il testo della sezione con `waitFor`, non un `waitForTimeout` fisso: si fotografa lo spinner.
- Il login via form: `#loginPassword` (non `getByLabel("Password")`, che trova anche il pulsante "Mostra password").

## Controlli solo CSS

Senza entrare: aprire `http://localhost:5173` (pagina di login) e inserire con `page.evaluate()` un elemento con le classi Tailwind del componente vero. Variabili di tema e classe `.dark` si applicano: riproduce fedelmente tutto ciò che è CSS.

## Fidarsi del test

- **Prova di controllo**: dopo aver misurato con la modifica, toglierla a runtime (`el.classList.remove(...)`) e misurare di nuovo. Se il numero non si muove, il test non discrimina e la modifica è inerte.
- `getComputedStyle(el, "::-webkit-...")` è inutile (restituisce i valori dell'elemento): fare uno screenshot e rileggerlo.
- Per vedere un'area cliccabile invisibile, tingerla con una regola temporanea e fotografare.
- I popup nativi del browser (selettore di data) sono fuori dal DOM: non si osservano.
- Per l'immagine nginx di produzione (headers, CSP): `MSYS_NO_PATHCONV=1 docker build ... --build-arg VITE_API_URL=/api ...`. **Senza `MSYS_NO_PATHCONV=1` git-bash riscrive `/api` in `C:/Program Files/Git/api`** e il bundle redirige subito al login senza richieste né errori.

## Mostrare il risultato

Guardare un'immagine con `Read` la fa vedere solo a Claude. **Ogni volta che qualcosa di visivo cambia**, aprirla sullo schermo dell'utente (`Start-Process <png>` da PowerShell) e dire in quale pagina dell'app (`http://localhost:5173`) guardare. Per i PDF: generarli con un dato reale e aprirli allo stesso modo.

Se il controllo non si è potuto fare (cookie mancante, browser scollegato), **dirlo** nella risposta e nella PR invece di far credere che la modifica sia stata vista.
