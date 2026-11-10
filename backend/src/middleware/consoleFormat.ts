import { format } from "node:util";

/**
 * Dà a ogni riga scritta con `console.log/warn/error` lo stesso inizio del log di richiesta:
 * `ISO | level=... | testo`. Prima gli errori di avvio, backup, aggiornamenti e disco uscivano
 * come testo libero, senza ora né livello, e in `docker logs` non si distinguevano da una riga
 * informativa. Le righe che iniziano già con un'ora (quelle di `requestLogger`) restano come sono.
 * Lo stack di un errore resta nelle righe successive, intatto.
 */
const startsWithTimestamp = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z \| /;

const levelByMethod = { log: "info", warn: "warn", error: "error" } as const;

export const installConsoleFormat = () => {
    for (const method of Object.keys(levelByMethod) as (keyof typeof levelByMethod)[]) {
        const original = console[method].bind(console);

        console[method] = (...args: unknown[]) => {
            const text = format(...args);
            original(
                startsWithTimestamp.test(text)
                    ? text
                    : `${new Date().toISOString()} | level=${levelByMethod[method]} | ${text}`
            );
        };
    }
};
