/**
 * Scarta le voci scadute di una mappa e, se ancora non bastasse, quelle che scadono per
 * prime: sacrificare le più vicine alla scadenza è preferibile a sacrificare quelle appena
 * create, che sono le meno informative rimaste (o, per un secondo fattore o un login,
 * appartengono a chi sta interagendo proprio adesso).
 *
 * Condivisa da `loginRateLimit.ts`, `twoFactorChallenge.ts` ed `emailSendRateLimit.ts`: tre
 * mappe in memoria con lo stesso identico bisogno (un tetto di voci, sotto scansione o abuso
 * continuo), che avevano ciascuna la propria copia di questa funzione — la stessa a meno del
 * nome del campo con la scadenza. Una politica cambiata in una sola di quelle copie sarebbe
 * silenziosamente divergente dalle altre due, senza che nulla lo segnali.
 */
export const pruneExpiring = <K, V>(
    entries: Map<K, V>,
    maxEntries: number,
    now: number,
    expiresAt: (value: V) => number
): void => {
    for (const [key, value] of entries) {
        if (expiresAt(value) <= now) {
            entries.delete(key);
        }
    }

    if (entries.size < maxEntries) {
        return;
    }

    const excess = entries.size - maxEntries + 1;
    const oldestFirst = [...entries.entries()].sort((a, b) => expiresAt(a[1]) - expiresAt(b[1]));

    for (const [key] of oldestFirst.slice(0, excess)) {
        entries.delete(key);
    }
};
