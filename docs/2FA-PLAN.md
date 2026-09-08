# Piano d'azione — Autenticazione a due fattori (TOTP via app)

Stato: **fasi 1-4 implementate l'8 settembre 2026.** La 2FA è attiva e opzionale per utente;
resta da fare la fase 5 (obbligo per l'admin), volutamente rimandata a flusso collaudato.
Il documento resta come traccia del ragionamento: la voce del
[CHANGELOG](CHANGELOG.md) racconta cosa è stato fatto davvero e dove il codice si è discostato
da questo piano — la migration è la `0023` e non la `0021`, il challenge morto risponde 410 e
non 401, e il reset da riga di comando è un flag `--reset-2fa` invece di un azzeramento
automatico.

---

## 1. Serve adesso?

**Sì, ed è l'intervento di sicurezza con il rapporto valore/costo migliore rimasto** — ma
non è urgente al punto da fermare altro lavoro.

Il motivo è cambiato di recente: finché si entrava solo dalla LAN, una password rubata
richiedeva comunque di essere dentro la rete del laboratorio. Da quando l'app risponde sul
dominio pubblico via Cloudflare Tunnel, il form di login è raggiungibile da chiunque, e
l'unica cosa fra un estraneo e tutti i dati dei clienti è una stringa che una persona può
scrivere su un post-it, riusare da un altro sito o farsi rubare con un phishing. Il
limitatore per IP (`backend/src/services/loginRateLimit.ts`) ferma il tentativo a forza
bruta, non la password già nota.

Peggiora il quadro il fatto che l'admin può lanciare l'aggiornamento, che **esegue codice
sull'host**, e leggere/ripristinare i backup: un account admin compromesso non è una fuga
di dati, è la macchina.

**Contro (motivi legittimi per rimandare):**

- Aggiunge un modo per restare chiusi fuori: telefono perso o rubato, app disinstallata,
  orologio del telefono sballato. Va risolto *prima* di attivarla (codici di recupero +
  reset da admin, sezioni 5 e 8).
- Sono pochi utenti conosciuti di persona: il rischio reale è più il phishing che
  l'attaccante mirato.
- Tocca il login, cioè la strada che usano tutti tutti i giorni: un bug qui si nota subito
  e blocca il lavoro. Vuole test veri, non un pomeriggio di fretta.

**Raccomandazione:** in due fasi (sezione 10). Fase 1 = 2FA **opzionale**, che ogni utente
attiva quando vuole; nessun rischio di lockout di massa, si prova sul proprio account.
Fase 2, quando la prima è collaudata = **obbligatoria per l'admin**, che è l'account che
vale la pena rubare.

---

## 2. Da cosa si parte (già presente)

| Serve | Dove sta oggi |
| --- | --- |
| Utenti, password scrypt, flag `active`/`mustChangePassword` | `backend/src/services/authManager.ts`, tabella `user` in `backend/src/db/schema.ts` |
| Sessioni con token nel cookie e **sha256 in tabella** | tabella `session`, `backend/src/middleware/requireAuth.ts` |
| Limitatore tentativi per IP, in memoria | `backend/src/services/loginRateLimit.ts` |
| Cifratura di segreti a riposo (AES-256-GCM, chiave in `data/secret.key`) | `backend/src/services/secretCrypto.ts` |
| Generazione e consegna "una volta sola" di una credenziale | `regeneratePassword` + `frontend/src/components/dialogs/settings/generatedPasswordDialog.tsx` |
| Registro azioni utente | `backend/src/middleware/userActionLogger.ts` |
| Notifiche in-app | `backend/src/services/notificationManager.ts` |
| Login, cambio password forzato, contesto auth lato client | `frontend/src/pages/auth/`, `frontend/src/components/auth-provider.tsx`, `frontend/src/lib/api/auth.ts` |

Nulla da riscrivere: la 2FA si innesta su `login()` e sulla tabella `user`.

---

## 3. Scelte di progetto (da decidere prima di scrivere codice)

### 3.1 TOTP: libreria o a mano?

**Raccomandato: a mano, in `services/totp.ts`.** TOTP (RFC 6238) è un HMAC-SHA1 su un
contatore a 8 byte più un troncamento: ~40 righe con `node:crypto`, più ~20 per il Base32.
È lo stesso stile già adottato per scrypt e AES-GCM, si verifica contro i vettori ufficiali
della RFC, e non aggiunge una dipendenza da aggiornare sul percorso critico del login.
Alternativa se si preferisce non toccare crypto: `otpauth` (JS puro, senza dipendenze
transitive).

### 3.2 QR code

Il segreto **non deve finire in un URL** (log, cronologia, referrer). Quindi il QR si genera
lato server e si restituisce nel JSON come data URL PNG: `<img src={...}>` passa
tranquillamente la CSP attuale (`frontend/security-headers.conf` imposta solo
`frame-ancestors`).

Dipendenza nuova: `qrcode` sul backend — l'unica necessaria. Insieme al QR va sempre
mostrato il **segreto in Base32 leggibile**, per chi lo inserisce a mano.

### 3.3 Dove sta il segreto TOTP

Cifrato con `secretCrypto` (come la password SMTP e quella SMB), in una colonna della
tabella `user`. **Conseguenza da gestire, non da subire:** `data/secret.key` è escluso dai
backup di proposito (`backend/src/services/backupFiles.ts`), quindi un dump ripristinato su
una macchina con chiave diversa rende i segreti indecifrabili. Vedi 8.1.

### 3.4 Come si "ricorda" il login a metà strada

Dopo la password corretta serve uno stato "password ok, manca il codice".

- **Raccomandato: mappa in memoria** (`pendingLoginChallenges`), stessa forma di
  `loginRateLimit.ts`: id casuale → `{ userId, expiresAt, attempts }`, TTL 5 minuti, tetto
  massimo di entry. Semplice, non sporca il database, e il container è uno solo. Costo: al
  riavvio del backend chi era a metà login riscrive la password. Accettabile.
- Alternativa: colonna `pending_totp` sulla tabella `session` — sopravvive al riavvio, ma
  mette in giro un cookie di sessione non ancora valido e obbliga a controllarlo in
  `requireAuth` a ogni richiesta. Più superficie per un errore.

Il `challengeId` viaggia nel corpo della risposta, non in un cookie: non è una sessione.

### 3.5 Codici di recupero

8 codici monouso (formato `xxxx-xxxx`, ~40 bit ciascuno), generati all'attivazione, mostrati
**una volta sola** riusando l'impianto del dialogo delle password generate. In tabella solo
lo sha256: stesso ragionamento dei token di sessione — sono già casuali, non c'è nulla da
indovinare a forza bruta, non serve scrypt.

---

## 4. Modello dati (migration `0021_add_user_totp.sql`)

Su `user`:

- `totp_secret` `varchar(255)` nullable — segreto cifrato (payload `iv:tag:dati`).
- `totp_confirmed_at` `timestamp` nullable — la 2FA è attiva **solo se valorizzato**. Un
  segreto generato ma mai confermato resta lì innocuo e viene sovrascritto al tentativo
  successivo.
- `totp_last_step` `integer` nullable — ultimo passo temporale accettato, per impedire il
  riuso dello stesso codice entro i suoi 30 secondi (vedi 8.3).

Nuova tabella `user_recovery_code`: `id`, `user_id` (FK cascade), `code_hash` `varchar(64)`,
`used_at` `timestamp` nullable, `created_at`. Indice su `user_id`.

`PublicUser` guadagna `twoFactorEnabled: boolean` (mai il segreto), così la UI sa cosa
mostrare senza una chiamata in più.

---

## 5. API

**Login (modificato)**

- `POST /api/auth/login` — se l'utente ha la 2FA attiva **non** imposta il cookie e risponde
  `200 { twoFactorRequired: true, challengeId }`. Senza 2FA, comportamento identico a oggi:
  la UI distingue sul campo.
- `POST /api/auth/login/2fa` — `{ challengeId, code }`, dove `code` è un TOTP a 6 cifre
  oppure un codice di recupero. Successo → crea la sessione e imposta il cookie esattamente
  come oggi. Fallimento → 401 e contatore del challenge +1; al quinto tentativo il challenge
  viene bruciato.

**Gestione del proprio account (autenticato)**

- `POST /api/auth/2fa/setup` — richiede la **password attuale** nel corpo. Genera il
  segreto, lo salva cifrato con `totp_confirmed_at` NULL, restituisce
  `{ secretBase32, otpauthUri, qrDataUrl }`.
- `POST /api/auth/2fa/enable` — `{ code }`. Conferma il segreto, genera e restituisce i
  codici di recupero (unica volta). Invalida le altre sessioni dell'utente, come già fa il
  cambio password.
- `DELETE /api/auth/2fa` — `{ password, code }`. Disattiva e cancella segreto e codici.
- `POST /api/auth/2fa/recovery-codes` — `{ password, code }`. Rigenera il blocco, utile dopo
  averne consumati alcuni.

**Amministrazione**

- `POST /api/users/:id/disable-2fa` (già dietro `requireAdmin`) — sblocco per telefono perso.
  L'admin **non vede mai** il segreto; l'azione finisce nel registro azioni e genera una
  notifica in-app. Da non estendere mai a "vedi il QR di un altro".

L'URI `otpauth` usa come issuer il nome del laboratorio (`backend/src/config/lab.ts`) e come
account lo username: nell'app dell'utente comparirà "EasyLab (mario)".

---

## 6. Flussi

**Attivazione:** Impostazioni → Sicurezza → "Attiva" → chiede la password → mostra QR +
segreto → l'utente inquadra e digita il codice → attivata, compaiono gli 8 codici di
recupero, con spunta obbligatoria "li ho salvati" prima di poter chiudere.

**Login:** username + password → se la 2FA è attiva, la card del login sostituisce i campi
con un solo campo a 6 cifre (`inputMode="numeric"`, `autoComplete="one-time-code"`,
autofocus) più un link "Usa un codice di recupero" → entrato, si prosegue come oggi,
compreso il rimando a `ForcePasswordChangePage` se `mustChangePassword`.

**Recupero:** codice di recupero → si entra, il codice viene marcato usato, e appare un
avviso persistente "ti restano N codici" con l'invito a rigenerarli. Zero codici e telefono
perso → reset da admin.

---

## 7. Frontend (file toccati)

- `lib/api/auth.ts` — nuovo tipo di ritorno del login (`UserDto | TwoFactorChallenge`) e le
  cinque chiamate nuove.
- `components/auth-provider.tsx` — `login()` restituisce l'esito discriminato; il challenge
  vive nello stato della pagina di login, **non** nel provider: non è una sessione.
- `pages/auth/LoginPage.tsx` — secondo passo, gestione errori, "torna indietro".
- `components/settings/securitySettingsSection.tsx` (nuovo) + voce "Sicurezza" in
  `pages/settings/SettingsPage.tsx`. **Non** in `adminOnlySections`: sarebbe la prima
  sezione personale oltre al tema.
- `components/dialogs/settings/twoFactorSetupDialog.tsx` (nuovo), sul modello dei dialoghi
  esistenti. Se riusare `generatedPasswordDialog` per i codici di recupero convenga davvero
  si vede in corsa: probabile che serva un componente gemello, i testi sono diversi.
- `components/settings/usersSettingsSection.tsx` — colonna "2FA" e azione di reset admin.

---

## 8. Casi limite e rischi (la parte che decide se il lavoro è fatto bene)

**8.1 Ripristino di un backup su una macchina nuova.** Il dump contiene i segreti cifrati,
`secret.key` no. Dopo un ripristino con chiave diversa la decifratura fallisce e chi ha la
2FA attiva non entra più — e se è l'admin, non c'è nessuno che possa sbloccarlo.
*Mitigazione obbligatoria:* al fallimento della decifratura il login non deve dare errore
generico, ma trattare la 2FA come non configurata, azzerare le colonne e scrivere una
notifica ("2FA disattivata durante il ripristino, riattivala"). È la stessa logica già usata
per la password SMB in `backupState.ts`. Va detto anche nel README, nella sezione ripristino.

**8.2 Ultimo admin chiuso fuori.** Serve una via di terra: estendere
`backend/reset-admin-password.js` (o affiancargli uno script gemello) perché azzeri anche la
2FA da riga di comando sull'host. Chi ha accesso alla macchina ha già tutto, quindi non
indebolisce nulla.

**8.3 Riuso del codice.** Un codice vale 30 secondi: chi lo intercetta può rigiocarlo. Da qui
`totp_last_step`: rifiutare ogni passo ≤ all'ultimo accettato.

**8.4 Orologio sfasato.** Accettare ±1 passo, cioè una finestra di 90s. Non di più: ogni
passo in più moltiplica i codici validi contemporaneamente.

**8.5 Forza bruta sul secondo fattore.** Un milione di combinazioni non sono tante se si può
provare all'infinito. Due limiti: 5 tentativi per challenge (poi il challenge muore) e il
limitatore per IP esistente, esteso a contare anche i fallimenti sul codice.

**8.6 Confronti a tempo costante.** `crypto.timingSafeEqual` su codici TOTP e di recupero,
come già per le password.

**8.7 Enumerazione utenti.** La risposta del primo passo rivela se un account ha la 2FA — ma
solo dopo che la password è già risultata corretta, quindi non aggiunge informazione. Da non
anticipare mai *prima* della verifica della password.

**8.8 Un codice di recupero è monouso.** Marcarlo usato nella stessa transazione della
verifica, altrimenti due richieste in parallelo lo spendono due volte.

**8.9 Il registro azioni** deve tracciare attivazione, disattivazione, uso di un codice di
recupero e reset da admin: sono esattamente gli eventi che si vanno a cercare dopo.

---

## 9. Test (vitest, già configurato su entrambi i lati)

- `services/totp.test.ts` — vettori RFC 6238, Base32 andata e ritorno, finestra ±1, rifiuto
  del passo già usato.
- `services/recoveryCodes.test.ts` — generazione, verifica, consumo, doppio consumo.
- `services/twoFactorChallenge.test.ts` — TTL, tetto tentativi, pulizia; specchio di
  `loginRateLimit.test.ts`.
- `routes/auth.test.ts` (supertest) — login senza 2FA invariato, login con 2FA in due passi,
  codice sbagliato, challenge scaduto, codice di recupero.
- Frontend: secondo passo del login e sezione Sicurezza.
- A mano, prima di considerarla finita: attivazione con Google Authenticator/Aegis reale,
  login da telefono, ripristino di un backup con `secret.key` diversa (8.1).

---

## 10. Fasi e stima

| Fase | Contenuto | Stima |
| --- | --- | --- |
| 1 | `totp.ts`, migration, challenge, rotte, test unitari | ~1 giorno |
| 2 | UI: login a due passi, sezione Sicurezza, dialoghi | ~mezza giornata |
| 3 | Reset admin, script CLI, gestione 8.1, notifiche, log | ~mezza giornata |
| 4 | README + voce nel CHANGELOG con il *perché* | ~1 ora |
| 5 (dopo) | 2FA obbligatoria per l'admin | ~2 ore |

Le fasi 1-4 sono un blocco unico: rilasciare la 2FA senza la via di recupero (fase 3) è
peggio che non averla.

---

## 11. Fuori perimetro (per ora)

WebAuthn/passkey (meglio del TOTP, ma molto più lavoro); OTP via email (dipende dallo SMTP
configurato, che può essere rotto proprio quando serve); "ricorda questo dispositivo" per 30
giorni (comodo, ma è un terzo tipo di token da gestire: semmai dopo); 2FA obbligatoria per
tutti (decisione organizzativa, non tecnica).
