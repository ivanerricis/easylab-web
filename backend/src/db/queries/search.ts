import { and, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * "La colonna contiene il testo", senza distinguere le maiuscole: la forma che gli indici trigram
 * delle colonne di ricerca coprono. `pattern` arriva già con i `%` attorno.
 */
export const containsText = (column: SQLWrapper, pattern: string) => sql`${column}::text ILIKE ${pattern}`;

/**
 * Come `containsText`, ma ignora anche gli accenti: "Nicolo" trova anche "Nicolò". Confronta
 * `immutable_unaccent(colonna)` con `immutable_unaccent(pattern)` invece del testo grezzo — la
 * funzione è definita nella migration 0034_customer_search_unaccent, un wrapper IMMUTABLE
 * attorno a `unaccent()` (che di suo è STABLE e quindi non ammessa in un'espressione di indice).
 * Copre un sovrainsieme di `containsText`: per testo senza accenti si comporta allo stesso modo,
 * quindi non toglie mai corrispondenze già trovate, ne aggiunge solo di nuove.
 *
 * Usata solo dalla ricerca clienti (nome, cognome, città) per ora, di proposito: estenderla alle
 * altre anagrafiche (collaboratori, tecnici, dispositivi, difetti, report, interventi)
 * significherebbe aggiungere altrettanti indici funzionali GIN, fuori dallo scopo di questo
 * intervento.
 */
export const containsTextAccentInsensitive = (column: SQLWrapper, pattern: string) =>
    sql`immutable_unaccent(${column}::text) ILIKE immutable_unaccent(${pattern})`;

/**
 * Ricerca di più parole sparse su più colonne: "Anna Romano" trova nome "Anna" + cognome "Romano"
 * (e anche "Romano Anna": l'ordine non conta). Ogni parola deve comparire in almeno una delle
 * colonne: AND sulle parole, OR sulle colonne, con `containsTextAccentInsensitive` come il resto
 * della ricerca clienti.
 *
 * Perché non un `concat_ws(' ', nome, cognome) ILIKE '%Anna Romano%'`: sarebbe un'espressione
 * calcolata, coperta da nessun indice, e basta un solo ramo del genere perché Postgres rinunci
 * a combinare i bitmap degli indici trigram degli altri rami (vedi `parseIdSearch`). Qui ogni
 * confronto resta sulla singola colonna, quindi gli indici GIN restano utilizzabili.
 *
 * Restituisce `undefined` con meno di due parole: il chiamante la aggiunge come ramo in più
 * del proprio OR, accanto a quelli che confrontano l'intera frase (un telefono scritto con lo
 * spazio, una città come "La Spezia"), e la ricerca a parola singola resta identica a prima.
 * Le parole si separano su qualsiasi sequenza di spazi; `%` e `_` non vengono protetti, come
 * nel pattern dell'intera frase.
 */
export const matchesAllWords = (columns: SQLWrapper[], search: string): SQL | undefined => {
    const words = search.split(/\s+/).filter((word) => word !== "");

    if (words.length < 2 || columns.length === 0) {
        return undefined;
    }

    return and(
        ...words.map((word) => or(...columns.map((column) => containsTextAccentInsensitive(column, `%${word}%`))))
    );
};

/**
 * Ricerca per numero nella casella di testo libero.
 *
 * Le liste confrontavano con il testo digitato anche colonne che testo non sono — id, date,
 * booleani, prezzi — convertendole con `::text ILIKE '%…%'`. Due difetti, entrambi misurati
 * sui dati generati da `scripts/dev/seed-fake-data.sql`:
 *
 * - un `ILIKE` su un'espressione calcolata non è coperto da nessun indice, e **basta un solo
 *   ramo del genere perché Postgres rinunci a combinare i bitmap degli indici trigram degli
 *   altri rami**: la ricerca finiva in scansione completa. Sulle liste di una sola tabella
 *   (clienti, dispositivi, difetti, tecnici, collaboratori) togliere quei rami riporta in
 *   gioco gli indici e fa la differenza fra una scansione e una lettura d'indice;
 * - quei rami quasi non trovavano nulla comunque, perché confrontano il valore grezzo nel
 *   database e non quello mostrato a schermo: cercare "07/09/2026" dava zero risultati
 *   (in tabella c'è `2026-09-07 04:42:00.746771`), come cercare "contanti" (in tabella c'è
 *   `cash`).
 *
 * Resta il caso che serve davvero — cercare un record per numero — ma come confronto esatto
 * sulla chiave primaria: una lettura d'indice invece di una scansione di tutta la tabella.
 *
 * Differenza di comportamento da tenere presente: prima "12" trovava anche 120 e 1234, ora
 * trova il record 12. Per il resto la ricerca per numero continua a funzionare come prima.
 */
export const parseIdSearch = (search: string): number | null => {
    if (!/^\d+$/.test(search)) {
        return null;
    }

    const value = Number(search);

    // Oltre l'intero a 32 bit il confronto con la colonna `id` non darebbe zero risultati:
    // darebbe errore ("integer out of range"), cioè una ricerca che fallisce invece di non
    // trovare niente.
    return Number.isSafeInteger(value) && value > 0 && value <= 2147483647 ? value : null;
};
