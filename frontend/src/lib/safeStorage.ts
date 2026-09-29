/**
 * `localStorage` che non lancia mai.
 *
 * Con i dati del sito bloccati (impostazione del browser, criteri aziendali, alcune finestre
 * private) il solo accesso a `window.localStorage` lancia `SecurityError`, e `setItem` lancia
 * `QuotaExceededError` quando lo spazio è finito. Le preferenze (tema, colori, vista del
 * calendario) si leggono già durante il primo render, e il `ThemeProvider` sta sopra il limite
 * d'errore dell'app: un'eccezione lì era uno schermo bianco. Senza storage le preferenze
 * tornano ai valori predefiniti e le scelte valgono finché la pagina resta aperta.
 */
export const safeStorage = {
    get: (key: string): string | null => {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set: (key: string, value: string) => {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            // Vedi sopra: la scelta resta in memoria finché la pagina è aperta.
        }
    },
    remove: (key: string) => {
        try {
            window.localStorage.removeItem(key);
        } catch {
            // Come `set`.
        }
    },
};
