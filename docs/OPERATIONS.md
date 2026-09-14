# Sicurezza account e accesso

Verifica in due passaggi (2FA) e recupero dell'accesso quando un utente resta fuori.

## Verifica in due passaggi (2FA)

Ogni utente può attivarla per sé da **Impostazioni > Sicurezza**: da quel momento, dopo la password, l'accesso chiede un codice a 6 cifre generato da un'app di autenticazione sul telefono (Google Authenticator, Aegis, 1Password o equivalente). Serve perché l'app risponde su un dominio pubblico: il limitatore dei tentativi ferma chi tira a indovinare, non chi la password ce l'ha già.

**Per l'amministratore è obbligatoria.** Finché non l'ha configurata, l'app non apre nessuna pagina se non quella di attivazione (e il server rifiuta ogni altra richiesta). Succede al primissimo accesso, subito dopo il cambio della password generata, e ogni volta che la sua 2FA viene tolta: disattivazione dalle impostazioni (è il modo di passare a un telefono nuovo), `--reset-2fa`, ripristino di un backup su una macchina con una `secret.key` diversa. Per gli altri utenti resta facoltativa.

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
