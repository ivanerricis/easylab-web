/**
 * Tetto agli invii di email ai clienti, per utente.
 *
 * "Invia per email" spedisce dall'SMTP del laboratorio a un indirizzo scritto nella scheda del
 * cliente, e ogni account autenticato può farlo. Senza un tetto, un account compromesso — anche
 * il meno privilegiato — poteva mandare email all'infinito a nome del laboratorio, e rovinare la
 * reputazione del suo indirizzo presso i provider di posta. Il limite è largo rispetto all'uso
 * vero (un invio a intervento concluso) e serve solo a fermare l'abuso.
 *
 * In memoria, come i limiti del login: a un riavvio si riparte da zero, ed è accettabile.
 */
export const emailSendWindowMs = 60 * 60 * 1000;
export const emailSendMaxPerWindow = 30;
const maxTrackedUsers = 10_000;

type Window = { count: number; resetAt: number };

const windowsByUser = new Map<string, Window>();

/** Registra un invio e dice se era ammesso: false quando il tetto della finestra è già pieno. */
export const consumeEmailSendSlot = (userKey: string, now = Date.now()): boolean => {
    const current = windowsByUser.get(userKey);

    if (!current || current.resetAt <= now) {
        if (windowsByUser.size >= maxTrackedUsers) {
            for (const [key, window] of windowsByUser) {
                if (window.resetAt <= now) {
                    windowsByUser.delete(key);
                }
            }
        }

        windowsByUser.set(userKey, { count: 1, resetAt: now + emailSendWindowMs });
        return true;
    }

    if (current.count >= emailSendMaxPerWindow) {
        return false;
    }

    current.count += 1;
    return true;
};

export const resetEmailSendRateLimit = () => {
    windowsByUser.clear();
};
