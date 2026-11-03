export type AppNotification = {
    /**
     * Identifica l'evento, non la riga: deve contenere qualcosa che cambia quando cambia
     * l'evento (data, timestamp) così una chiusura non nasconde anche quello successivo.
     */
    id: string;
    title: string;
    /** Riga secondaria sotto al titolo (stato, messaggio d'errore). */
    description?: string;
    /** Testo breve allineato a destra: orario, data. */
    meta?: string;
    /** "warning" evidenzia la voce in ambra con l'icona di avviso (il rosso è degli errori). */
    tone?: "default" | "warning";
    /** Rotta aperta cliccando la voce. */
    href?: string;
    /** Voce che non richiede più azione: descrizione barrata ed esclusa dal contatore. */
    resolved?: boolean;
};

/**
 * Una fonte di notifiche = una sezione del menu. Per aggiungerne una basta creare il file
 * della sorgente e registrarla in `notificationSources`: menu, badge, refresh periodico e
 * chiusura delle voci funzionano già per tutte allo stesso modo.
 */
export type NotificationSource = {
    /** Chiave stabile: identifica la sezione e raggruppa le voci chiuse nel localStorage. */
    key: string;
    label: string;
    /** Testo mostrato quando la sorgente non ha voci. Senza, la sezione sparisce del tutto. */
    emptyLabel?: string;
    load: () => Promise<AppNotification[]>;
    /**
     * Se presente, chiudere una voce viene delegato alla sorgente (che lo fa ricordare al
     * server, quindi su ogni dispositivo). Senza, la chiusura resta nel localStorage.
     */
    dismiss?: (notificationId: string) => Promise<void>;
};
