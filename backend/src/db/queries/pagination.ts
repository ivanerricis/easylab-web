/**
 * Tetto di sicurezza per le liste chiamate senza `page`/`pageSize`.
 *
 * Omettere i parametri di paginazione è legittimo e voluto: alcune schermate (le combobox
 * di selezione, la dashboard) hanno bisogno dell'elenco completo. Il problema è che senza
 * alcun `limit` la query cresce insieme alla tabella, e con abbastanza righe carica in
 * memoria l'intero contenuto a ogni richiesta.
 *
 * Il limite è deliberatamente molto sopra i volumi reali del laboratorio, quindi non
 * cambia il comportamento di oggi. Se un giorno scatta davvero, la troncatura sarebbe
 * silenziosa e difficile da diagnosticare (una combobox a cui mancano voci, senza errori):
 * per questo viene registrato un warning esplicito nei log.
 */
export const unpaginatedMaxRows = 5000;

/**
 * Tetto del `pageSize` accettato dalle rotte di lista, volutamente lo stesso numero.
 *
 * Serve all'opzione "Tutte" del selettore righe per pagina: il client la manda come
 * `pageSize` grande invece di omettere la paginazione, così la risposta resta nella forma
 * `items + totalItems` che tutte le tabelle si aspettano. Due tetti diversi per la stessa
 * domanda ("quante righe può chiedere una schermata in un colpo solo") si sarebbero prima o
 * poi contraddetti, quindi il numero è uno solo e la motivazione è quella qui sopra.
 */
export const maxPageSize = unpaginatedMaxRows;

type LimitableQuery<TRow> = {
    limit: (count: number) => PromiseLike<TRow[]>;
};

export const takeUnpaginated = async <TRow>(query: LimitableQuery<TRow>, entityName: string): Promise<TRow[]> => {
    // Una riga in più del limite: serve solo a capire se il tetto è stato raggiunto.
    const rows = await query.limit(unpaginatedMaxRows + 1);

    if (rows.length > unpaginatedMaxRows) {
        console.warn(
            `Lista "${entityName}" richiesta senza paginazione con più di ${unpaginatedMaxRows} righe: ` +
                `risultato troncato. Va introdotta la paginazione sul chiamante.`
        );
        return rows.slice(0, unpaginatedMaxRows);
    }

    return rows;
};
