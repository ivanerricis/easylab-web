import type { NextFunction, Request, Response } from "express";

/**
 * Cosa una rotta dice di sé al registro delle azioni (`userActionLogger`). Il registro scrive
 * la riga a risposta finita, quindi gli basta leggere `res.locals`: nessuna dipendenza fra i
 * due moduli oltre a queste due chiavi.
 *
 * - `auditAction`: l'etichetta dell'azione ("eliminato cliente"). Dichiarata dalla rotta
 *   stessa, accanto al suo codice, invece che in una tabella di percorsi da tenere allineata
 *   a mano (vedi BACKLOG).
 * - `auditSubject`: su cosa ha agito ("#7 Mario Rossi"). Dopo un'eliminazione la riga non c'è
 *   più, e con il solo numero il registro non dice di chi o di cosa si parlava.
 */
const auditActionKey = "auditAction";
const auditSubjectKey = "auditSubject";

/** Va prima dei validatori della rotta: se la richiesta è respinta con 400 l'etichetta resta. */
export const auditAs = (label: string) => (_request: Request, response: Response, next: NextFunction) => {
    response.locals[auditActionKey] = label;
    next();
};

export const setAuditSubject = (response: Response, subject: string) => {
    response.locals[auditSubjectKey] = subject;
};

export const readAuditContext = (response: Response) => ({
    action: typeof response.locals[auditActionKey] === "string" ? (response.locals[auditActionKey] as string) : null,
    subject: typeof response.locals[auditSubjectKey] === "string" ? (response.locals[auditSubjectKey] as string) : null,
});

/** Nome a un solo spazio e senza tutto ciò che il registro non può contenere (`|`, a capo). */
const cleanSubjectText = (text: string) => text.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

const maxSubjectLength = 80;

/** "#7 Mario Rossi": l'ID per ritrovarlo, il nome per riconoscerlo. Il nome si accorcia, l'ID no. */
export const describeSubject = (id: number | string, ...nameParts: (string | null | undefined)[]) => {
    const name = cleanSubjectText(nameParts.filter(Boolean).join(" "));
    const shortName = name.length > maxSubjectLength ? `${name.slice(0, maxSubjectLength - 1)}…` : name;

    return shortName ? `#${id} ${shortName}` : `#${id}`;
};
