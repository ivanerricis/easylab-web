import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionDto } from "@/lib/api";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";

/**
 * Il corpo condiviso da `UserSessionsDialog` (un admin su un altro utente) e dalla scheda
 * "Le tue sessioni" di Sicurezza (chiunque su sé stesso): stessa forma di dato
 * (`listSessionsForUser`/`listOwnSessions` restituiscono entrambe `SessionDto[]`), stesso
 * elenco. Solo il caricamento e la revoca cambiano rotta a seconda di chi chiama, e restano
 * fuori da qui.
 */

/**
 * Oltre questa soglia una sessione viene segnalata come inattiva. Nessuna conseguenza sul
 * server — resta valida fino alla scadenza — ma è il caso di chi ha chiuso il browser senza
 * uscire: prima era indistinguibile da quella in uso, ed è il motivo per cui tutte le
 * sessioni vecchie sembravano attive.
 */
export const staleSessionMs = 24 * 60 * 60 * 1000;

type SessionsListProps = {
    sessions: SessionDto[];
    isLoading: boolean;
    /** Il momento della lettura: l'età di una sessione si misura da lì, non da un `Date.now()`
     * chiamato mentre si disegna, che cambierebbe risultato a ogni re-render. */
    loadedAt: number;
    revokingId: string | null;
    onRevoke: (session: SessionDto) => void;
    emptyLabel?: string;
};

const SessionsList = ({
    sessions,
    isLoading,
    loadedAt,
    revokingId,
    onRevoke,
    emptyLabel = "Nessuna sessione aperta.",
}: SessionsListProps) => {
    if (isLoading) {
        return <p className="text-sm text-muted-foreground">Caricamento sessioni...</p>;
    }

    if (sessions.length === 0) {
        return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
    }

    return (
        <div className="grid gap-2">
            {sessions.map((session) => {
                const isStale = !session.isCurrent && loadedAt - new Date(session.lastSeenAt).getTime() > staleSessionMs;

                return (
                    <div
                        key={session.id}
                        className={cn(
                            "flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-muted/20 p-3",
                            isStale && "border-dashed bg-transparent"
                        )}
                    >
                        <div className="grid gap-0.5 text-sm">
                            <span className="font-medium">
                                {/* Il dispositivo per primo: è il dato con cui si riconosce
                                    la propria sessione fra più accessi dello stesso utente. */}
                                {session.device ?? "Dispositivo sconosciuto"}
                                {session.isCurrent ? (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        (questa sessione)
                                    </span>
                                ) : null}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {session.isCurrent
                                    ? "In uso adesso"
                                    : `Ultimo utilizzo ${formatRelativeTime(session.lastSeenAt, new Date(loadedAt))}`}
                                {isStale ? " (inattiva)" : ""}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                Aperta il {formatDateTime(session.createdAt)} · Scade il{" "}
                                {formatDateTime(session.expiresAt)}
                            </span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={session.isCurrent || revokingId === session.id}
                            onClick={() => onRevoke(session)}
                        >
                            <LogOut className="size-4" />
                            Disconnetti
                        </Button>
                    </div>
                );
            })}
        </div>
    );
};

export default SessionsList;
