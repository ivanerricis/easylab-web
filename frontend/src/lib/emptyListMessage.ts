type EmptyListMessageOptions = {
    /** La frase della lista davvero vuota: di norma un invito a creare il primo elemento. */
    emptyMessage: string;
    /** Il testo cercato in vigore (quello già applicato, non quello che si sta digitando). */
    searchText?: string;
    /** Se c'è almeno un filtro che restringe la lista (stato, tipo, date...). */
    hasActiveFilters?: boolean;
    /** La frase per "nessun elemento passa i filtri", es. "Nessun report corrisponde ai filtri.". */
    filteredMessage?: string;
};

/**
 * Il messaggio di una lista senza righe, che dipende dal perché è vuota.
 *
 * Tre vuoti diversi meritano tre frasi diverse: una lista vuota è un invito a creare il primo
 * elemento, una ricerca senza esiti è un vicolo cieco da cui bisogna poter uscire — e chi cerca
 * "mrio" per errore deve capire che il problema è quello che ha scritto — e un filtro troppo
 * stretto va nominato, altrimenti "Nessun report disponibile." con "Report aperti" selezionato
 * fa credere che di report non ce ne siano affatto. Nato dentro `SimpleEntityPage`, che
 * conosceva solo la ricerca; qui perché le liste con filtri (report, interventi, la scheda
 * tecnico) dicano la stessa cosa nello stesso modo.
 */
export const resolveEmptyListMessage = ({
    emptyMessage,
    searchText = "",
    hasActiveFilters = false,
    filteredMessage = "Nessun elemento corrisponde ai filtri.",
}: EmptyListMessageOptions): string => {
    const trimmedSearchText = searchText.trim();

    if (trimmedSearchText !== "") {
        return hasActiveFilters
            ? `Nessun risultato per "${trimmedSearchText}" con i filtri attivi.`
            : `Nessun risultato per "${trimmedSearchText}".`;
    }

    return hasActiveFilters ? filteredMessage : emptyMessage;
};
