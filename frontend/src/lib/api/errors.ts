import axios from "axios";

export const getApiErrorMessage = (error: unknown, fallbackMessage = "Operazione non riuscita") => {
    if (axios.isAxiosError<{ message?: string }>(error)) {
        return error.response?.data?.message ?? error.message ?? fallbackMessage;
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
