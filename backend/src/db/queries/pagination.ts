import { ApiError } from "../../services/apiError";

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
const unpaginatedMaxRows = 5000;

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

/**
 * Cosa fare quando una lista senza paginazione supera il tetto.
 *
 * Per le schermate il troncamento con un warning resta la scelta giusta (vedi sopra). Per un
 * export no: "Esporta" promette l'archivio intero, e un file che si ferma in silenzio a 5000
 * righe è un dato sbagliato che nessuno nota — un conteggio, una contabilità, un archivio che
 * sembra completo e non lo è. Lì il tetto è più alto e, superato, la richiesta si rifiuta.
 */
export type UnpaginatedLimit =
    | { maxRows: number; onOverflow: "truncate" }
    /** `tooLargeMessage` è quello che legge l'utente: dice cosa restringere, per quel chiamante. */
    | { maxRows: number; onOverflow: "reject"; tooLargeMessage: string };

const listRowLimit: UnpaginatedLimit = { maxRows: unpaginatedMaxRows, onOverflow: "truncate" };

/**
 * Dieci volte il tetto delle liste: ben oltre i volumi del laboratorio, e ancora un file che
 * il backend compone in memoria senza problemi (qualche decina di MB nel caso peggiore).
 */
export const exportRowLimit: UnpaginatedLimit = {
    maxRows: 50_000,
    onOverflow: "reject",
    tooLargeMessage:
        "L'esportazione supera le 50.000 righe: restringi i filtri (per esempio l'intervallo di date) ed esporta in più parti.",
};

export class ExportTooLargeError extends ApiError {}

export const takeUnpaginated = async <TRow>(
    query: LimitableQuery<TRow>,
    entityName: string,
    limit: UnpaginatedLimit = listRowLimit
): Promise<TRow[]> => {
    const { maxRows } = limit;
    // Una riga in più del limite: serve solo a capire se il tetto è stato raggiunto.
    const rows = await query.limit(maxRows + 1);

    if (rows.length <= maxRows) {
        return rows;
    }

    if (limit.onOverflow === "reject") {
        throw new ExportTooLargeError(limit.tooLargeMessage, 400);
    }

    console.warn(
        `Lista "${entityName}" richiesta senza paginazione con più di ${maxRows} righe: ` +
            `risultato troncato. Va introdotta la paginazione sul chiamante.`
    );
    return rows.slice(0, maxRows);
};
