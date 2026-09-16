import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import CustomDialog from "@/components/dialogs/customDialog";
import SessionsList from "@/components/settings/sessionsList";
import { getApiErrorMessage, listUserSessions, revokeUserSession, type SessionDto, type UserDto } from "@/lib/api";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: UserDto | null;
};

/**
 * Quello che il server sa davvero e niente di più: l'hash del token (mai il cookie), le date,
 * l'ultimo utilizzo e il dispositivo ricavato dallo User-Agent del login. Nessun IP, nessuna
 * posizione: non sono in tabella e non si inventano.
 */

const UserSessionsDialog = ({ open, onOpenChange, user }: Props) => {
    const [sessions, setSessions] = useState<SessionDto[]>([]);
    /** Il momento della lettura: l'età di una sessione si misura da lì, non da un `Date.now()`
     * chiamato mentre si disegna, che cambierebbe risultato a ogni re-render. */
    const [loadedAt, setLoadedAt] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [sessionToRevoke, setSessionToRevoke] = useState<SessionDto | null>(null);

    const loadSessions = useCallback(async () => {
        if (!user) {
            return;
        }

        setIsLoading(true);

        try {
            const loaded = await listUserSessions(user.id);
            setSessions(loaded);
            setLoadedAt(Date.now());
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare le sessioni"));
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!open) {
            return;
        }

        startTransition(() => {
            void loadSessions();
        });
    }, [open, loadSessions]);

    const handleRevoke = async (session: SessionDto) => {
        if (!user || revokingId) {
            return;
        }

        setRevokingId(session.id);

        try {
            await revokeUserSession(user.id, session.id);
            setSessions((prev) => prev.filter((existing) => existing.id !== session.id));
            toast.success("Sessione disconnessa");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile disconnettere la sessione"));
        } finally {
            setRevokingId(null);
            setSessionToRevoke(null);
        }
    };

    return (
        <>
            <CustomDialog
                open={open}
                onOpenChange={onOpenChange}
                title="Sessioni attive"
                description={user ? `Accessi aperti per "${user.username}".` : undefined}
                showConfirmButton={false}
                cancelLabel="Chiudi"
                onCancel={() => onOpenChange(false)}
                content={
                    <div className="py-2">
                        <SessionsList
                            sessions={sessions}
                            isLoading={isLoading}
                            loadedAt={loadedAt}
                            revokingId={revokingId}
                            onRevoke={(session) => setSessionToRevoke(session)}
                        />
                    </div>
                }
            />

            <CustomDialog
                open={sessionToRevoke !== null}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setSessionToRevoke(null);
                    }
                }}
                title="Disconnetti sessione"
                description={
                    sessionToRevoke
                        ? `Disconnettere "${sessionToRevoke.device ?? "questo dispositivo"}"? L'utente dovrà accedere di nuovo.`
                        : undefined
                }
                destructive
                confirmLabel={revokingId ? "Disconnessione..." : "Disconnetti"}
                confirmDisabled={revokingId !== null}
                cancelDisabled={revokingId !== null}
                onCancel={() => setSessionToRevoke(null)}
                onConfirm={() => {
                    if (sessionToRevoke) {
                        void handleRevoke(sessionToRevoke);
                    }
                }}
            />
        </>
    );
};

export default UserSessionsDialog;
