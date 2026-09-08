import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { userRecoveryCodeTable } from "../schema";

/**
 * Rimpiazza in blocco i codici di recupero di un utente.
 *
 * In transazione perché lo svuotamento e il reinserimento sono una cosa sola: se il secondo
 * fallisse da solo, l'utente resterebbe con la 2FA attiva e zero vie d'uscita — proprio lo
 * scenario che i codici esistono per evitare.
 */
export const replaceRecoveryCodes = (userId: number, codeHashes: string[]) =>
    db.transaction(async (tx) => {
        await tx.delete(userRecoveryCodeTable).where(eq(userRecoveryCodeTable.userId, userId));

        if (codeHashes.length > 0) {
            await tx.insert(userRecoveryCodeTable).values(codeHashes.map((codeHash) => ({ userId, codeHash })));
        }
    });

/**
 * Marca usato un codice e dice se c'è riuscito.
 *
 * Tutto in una `UPDATE ... WHERE used_at IS NULL`, non in una lettura seguita da una
 * scrittura: due richieste in parallelo con lo stesso codice devono poter vincere una sola,
 * e qui a decidere è il database.
 */
export const consumeRecoveryCode = async (userId: number, codeHash: string): Promise<boolean> => {
    const consumed = await db
        .update(userRecoveryCodeTable)
        .set({ usedAt: sql`now()` })
        .where(
            and(
                eq(userRecoveryCodeTable.userId, userId),
                eq(userRecoveryCodeTable.codeHash, codeHash),
                isNull(userRecoveryCodeTable.usedAt)
            )
        )
        .returning({ id: userRecoveryCodeTable.id });

    return consumed.length > 0;
};

/** Quanti ne restano: la UI lo mostra per invitare a rigenerarli prima di finirli. */
export const countUnusedRecoveryCodes = async (userId: number): Promise<number> => {
    const rows = await db
        .select({ value: count() })
        .from(userRecoveryCodeTable)
        .where(and(eq(userRecoveryCodeTable.userId, userId), isNull(userRecoveryCodeTable.usedAt)));

    return rows[0]?.value ?? 0;
};

export const deleteRecoveryCodes = (userId: number) =>
    db.delete(userRecoveryCodeTable).where(eq(userRecoveryCodeTable.userId, userId));
