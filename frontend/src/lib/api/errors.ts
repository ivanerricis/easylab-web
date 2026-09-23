import axios from "axios";

/**
 * D13: prima, quando il server non aveva dato un `message`, il testo inglese di axios finiva
 * dritto nel toast — "Network Error" con la rete assente, "timeout of 5000ms exceeded" con un
 * timeout, "Request failed with status code 502" con un 502/524 di Cloudflare a corpo HTML
 * (senza JSON, quindi senza `message`). `error.message` di axios non è mai testo per l'utente:
 * o c'è un messaggio del server in italiano, o tocca a questa funzione scegliere cosa dire, mai
 * ad axios.
 */
export const getApiErrorMessage = (error: unknown, fallbackMessage = "Operazione non riuscita") => {
    if (axios.isAxiosError<{ message?: string }>(error)) {
        const serverMessage = error.response?.data?.message;

        if (typeof serverMessage === "string" && serverMessage.trim() !== "") {
            return serverMessage;
        }

        if (!error.response) {
            // Nessuna risposta: rete assente, server irraggiungibile, o il timeout della
            // richiesta (codice `ECONNABORTED` nelle versioni di axios in uso, `ETIMEDOUT` in
            // altre). Le richieste annullate (`ERR_CANCELED`, es. da `AbortController`) passano
            // di qui anche loro, ma chi le annulla controlla già `signal.aborted` prima di
            // chiamare questa funzione e non arriva a mostrarne il testo.
            return error.code === "ECONNABORTED" || error.code === "ETIMEDOUT"
                ? "Il server non ha risposto in tempo. Riprova."
                : "Connessione al server non riuscita. Controlla la rete e riprova.";
        }

        // C'è una risposta ma senza un messaggio leggibile: meglio il fallback scritto per
        // quel punto dell'app che il testo generico di axios.
        return fallbackMessage;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return fallbackMessage;
};

/**
 * Lo stato HTTP di una risposta di errore, quando c'è.
 *
 * `getApiErrorMessage` lo scarta di proposito — a chi mostra un toast serve solo il testo —
 * ma alcune decisioni dipendono dal codice e non dal messaggio: il login a due passi deve
 * distinguere "codice sbagliato, riprova" (401) da "non c'è più niente da verificare" (410),
 * e farlo confrontando stringhe italiane sarebbe fragile alla prima riformulazione.
 */
export const getApiErrorStatus = (error: unknown): number | null => {
    if (axios.isAxiosError(error)) {
        return error.response?.status ?? null;
    }

    return null;
};
