export type CsvColumn<TRow> = {
    header: string;
    value: (row: TRow) => string | number | boolean | Date | null | undefined;
};

// RFC 4180: un campo va tra virgolette solo se contiene il separatore, virgolette o un
// a-capo, e le virgolette al suo interno si raddoppiano. Tutto il resto esce così com'è.
const escapeCsvField = (raw: string): string => (/[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw);

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
