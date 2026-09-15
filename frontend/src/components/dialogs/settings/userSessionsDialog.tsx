import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import CustomDialog from "@/components/dialogs/customDialog";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage, listUserSessions, revokeUserSession, type SessionDto, type UserDto } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: UserDto | null;
};

/**
 * Non c'è IP né dispositivo in tabella (`session` ha solo l'hash del token e le due date):
 * qui si mostra solo quello che il server sa davvero, non un dato inventato o dedotto.
 */
const UserSessionsDialog = ({ open, onOpenChange, user }: Props) => {
    const [sessions, setSessions] = useState<SessionDto[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const loadSessions = useCallback(async () => {
        if (!user) {
            return;
        }

        setIsLoading(true);

        try {
            setSessions(await listUserSessions(user.id));
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
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Sessioni attive"
            description={user ? `Accessi aperti per "${user.username}".` : undefined}
            showConfirmButton={false}
            cancelLabel="Chiudi"
            onCancel={() => onOpenChange(false)}
            content={
                <div className="grid gap-2 py-2">
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">Caricamento sessioni...</p>
                    ) : sessions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nessuna sessione aperta.</p>
                    ) : (
                        sessions.map((session) => (
                            <div
                                key={session.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-muted/20 p-3"
                            >
                                <div className="grid gap-0.5 text-sm">
                                    <span className="font-medium">
                                        Aperta il {formatDateTime(session.createdAt)}
                                        {session.isCurrent ? (
                                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                (questa sessione)
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        Scade il {formatDateTime(session.expiresAt)}
                                    </span>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={session.isCurrent || revokingId === session.id}
                                    onClick={() => void handleRevoke(session)}
                                >
                                    <LogOut className="size-4" />
                                    Disconnetti
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            }
        />
    );
};

export default UserSessionsDialog;
