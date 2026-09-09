import { sql } from "drizzle-orm";
import { db } from "../db";
import { IssueTable } from "../db/schema";

/**
 * La voce del catalogo difetti che sta per "non rientra in nessuna delle altre".
 *
 * Non è una voce come le altre: è quella che fa comparire, nel dialogo del report, la casella
 * con cui si descrive il problema a mano — l'unico testo che finisce sulla ricevuta del
 * cliente. Se sparisse dal catalogo, quella casella non comparirebbe più e nessuno avrebbe un
 * errore da leggere: il programma continuerebbe a funzionare, stampando ricevute meno utili.
 *
 * Il riconoscimento è sul nome perché la tabella non ha una colonna che la marchi. È stata
 * una scelta: marcarla nel database (colonna booleana più indice unico parziale) avrebbe
 * permesso anche di rinominarla, ma "Altro" va bene così com'è, e questo modo toglie lo stesso
 * rischio senza migration. Il prezzo è quello: il nome non si cambia più, ed è proprio quello
 * che le tre protezioni qui accanto impongono.
 */
export const catchAllIssueDescription = "Altro";

export const isCatchAllIssueDescription = (description: string) =>
    description.trim().toLowerCase() === catchAllIssueDescription.toLowerCase();

export const findCatchAllIssue = async () => {
    const rows = await db
        .select()
        .from(IssueTable)
        .where(sql`lower(${IssueTable.description}) = ${catchAllIssueDescription.toLowerCase()}`)
        .limit(1);

    return rows[0] ?? null;
};

/**
 * Ricrea la voce se manca, all'avvio del server — stessa idea di `ensureDefaultAdmin`.
 *
 * Serve a due casi: l'installazione nuova, dove il catalogo parte vuoto, e il database in cui
 * la voce è stata tolta prima che esistessero queste protezioni.
 */
export const ensureCatchAllIssue = async (): Promise<void> => {
    if (await findCatchAllIssue()) {
        return;
    }

    // `description` è unica: se due avvii si sovrappongono, il secondo non deve fallire.
    await db.insert(IssueTable).values({ description: catchAllIssueDescription }).onConflictDoNothing();

    console.log(
        `Voce "${catchAllIssueDescription}" creata nel catalogo difetti: è quella che permette ` +
            "di descrivere a mano un problema sul report."
    );
};
