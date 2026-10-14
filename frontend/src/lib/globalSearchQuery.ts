export type GlobalQuery = {
    /** `numbered`: la ricerca comincia con "#" e guarda solo le entità numerate, mai i clienti. */
    scope: "all" | "numbered";
    /** Il testo da cercare, senza il "#". */
    text: string;
    /** `#123`: si cerca il record con quel numero, e basta (niente confronto sul testo). */
    exact: boolean;
    /**
     * Il numero di `#123`, se può essere un id. `null` anche per `#0` e per un numero oltre i 32
     * bit: nessun record può averlo, e chiederlo al server sarebbe solo un errore 400.
     */
    exactId: number | null;
};

const maxId = 2_147_483_647;

/**
 * Il "#" davanti al testo restringe la ricerca a report e interventi. Prima veniva
 * tolto e il resto cercato dappertutto: "#123" trovava anche i clienti con 123 nel telefono, e i
 * report con 123 in una nota. Con solo cifre dopo il "#" è invece il numero esatto del record.
 * Gli spazi attorno al testo non contano ("# 12" è "#12"); "##5" cerca il testo "#5".
 */
export const parseGlobalQuery = (query: string): GlobalQuery => {
    const trimmed = query.trim();

    if (!trimmed.startsWith("#")) {
        return { scope: "all", text: trimmed, exact: false, exactId: null };
    }

    const text = trimmed.slice(1).trim();
    const exact = /^\d+$/.test(text);
    const id = exact ? Number(text) : null;

    return {
        scope: "numbered",
        text,
        exact,
        exactId: id != null && id >= 1 && id <= maxId ? id : null,
    };
};

/**
 * Da quando vale la pena chiedere al server: due lettere, oppure un numero di qualunque
 * lunghezza (il numero di un report o di un intervento, che la ricerca confronta esatto).
 */
export const isSearchable = ({ text }: GlobalQuery) => text.length >= 2 || /^\d+$/.test(text);
