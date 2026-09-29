/** Il messaggio per un importo che non si riesce a leggere: uguale in tutti i moduli. */
export const invalidEuroAmountMessage = "Importo non valido";

/**
 * Un importo in euro come lo scrive una persona: "12", "12,50" o "12.50", al più due decimali.
 * Restituisce `null` per il campo vuoto (ogni modulo decide cosa vuol dire) e `NaN` per un
 * testo che non è un importo, così chi lo usa può dirlo accanto al campo.
 *
 * Prima i campi prezzo erano `type="number"`: con la tastiera italiana si scrive la virgola, che
 * un campo numerico in inglese (o in Firefox) rifiutava lasciando il valore vuoto, e `Number("")`
 * lo trasformava in 0 senza dire niente — "12,50" si salvava come zero o come nessun prezzo. Il
 * punto resta accettato perché è quello che mostrano i valori arrivati dal server ("12.5").
 * Più di due decimali non si accettano: "1.234" sarebbe quasi sempre un migliaio scritto
 * all'italiana, non un euro e 23 centesimi. Il segno meno si legge, perché il messaggio giusto
 * per "-5" è "deve essere maggiore o uguale a zero", non "non valido".
 */
export const parseEuroAmount = (value: string): number | null => {
    const trimmed = value.trim();

    if (trimmed === "") {
        return null;
    }

    if (!/^-?(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(trimmed)) {
        return Number.NaN;
    }

    return Number(trimmed.replace(",", "."));
};
