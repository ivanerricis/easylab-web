import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsEmptyBox, SettingsLoadingBox, SettingsSection } from "@/components/settings/settingsUi";
import SessionsList from "@/components/settings/sessionsList";
import CustomDialog from "@/components/dialogs/customDialog";
import RecoveryCodesDialog from "@/components/dialogs/settings/recoveryCodesDialog";
import TwoFactorConfirmDialog from "@/components/dialogs/settings/twoFactorConfirmDialog";
import TwoFactorSetupDialog from "@/components/dialogs/settings/twoFactorSetupDialog";
import RefreshButton from "@/components/refresh-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    disableTwoFactor,
    getApiErrorMessage,
    getTwoFactorStatus,
    listOwnSessions,
    listRecentFailedLogins,
    regenerateRecoveryCodes,
    revokeOwnSession,
    type LogEntryDto,
    type SessionDto,
    type TwoFactorStatusDto,
} from "@/lib/api";
import { useAuth } from "@/components/use-auth";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * La sezione "Sicurezza" delle impostazioni: riguarda il proprio account, non il laboratorio,
 * ed è quindi — insieme al tema — una delle poche visibili anche a chi non è amministratore.
 */
const SecuritySettingsSection = () => {
    const { user, refresh } = useAuth();
    const [status, setStatus] = useState<TwoFactorStatusDto | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSetupOpen, setIsSetupOpen] = useState(false);
    const [isDisableOpen, setIsDisableOpen] = useState(false);
    const [isRegenerateOpen, setIsRegenerateOpen] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [failedLogins, setFailedLogins] = useState<LogEntryDto[] | null>(null);
    const [isLoadingFailedLogins, setIsLoadingFailedLogins] = useState(false);
    const [sessions, setSessions] = useState<SessionDto[]>([]);
    const [sessionsLoadedAt, setSessionsLoadedAt] = useState(0);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
    const [sessionToRevoke, setSessionToRevoke] = useState<SessionDto | null>(null);

    const loadSessions = useCallback(async () => {
        setIsLoadingSessions(true);

        try {
            setSessions(await listOwnSessions());
            setSessionsLoadedAt(Date.now());
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare le sessioni"));
        } finally {
            setIsLoadingSessions(false);
        }
    }, []);

    useEffect(() => {
        startTransition(() => {
            void loadSessions();
        });
    }, [loadSessions]);

    const handleRevokeSession = async (session: SessionDto) => {
        if (revokingSessionId) {
            return;
        }

        setRevokingSessionId(session.id);

        try {
            await revokeOwnSession(session.id);
            setSessions((prev) => prev.filter((existing) => existing.id !== session.id));
            toast.success("Sessione disconnessa");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile disconnettere la sessione"));
        } finally {
            setRevokingSessionId(null);
            setSessionToRevoke(null);
        }
    };

    const loadFailedLogins = async () => {
        setIsLoadingFailedLogins(true);

        try {
            setFailedLogins(await listRecentFailedLogins());
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare i tentativi di accesso falliti"));
        } finally {
            setIsLoadingFailedLogins(false);
        }
    };

    useEffect(() => {
        if (!user?.isAdmin) {
            return;
        }

        startTransition(() => {
            void loadFailedLogins();
        });
    }, [user?.isAdmin]);

    const loadStatus = async () => {
        setIsLoading(true);

        try {
            setStatus(await getTwoFactorStatus());
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile leggere lo stato della verifica"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        startTransition(() => {
            void loadStatus();
        });
    }, []);

    /**
     * `refresh` oltre a `loadStatus`: `twoFactorEnabled` sta anche dentro l'utente in
     * sessione, che alimenta il resto dell'interfaccia. Senza, l'elenco utenti mostrerebbe
     * ancora lo stato di prima fino al ricaricamento della pagina.
     */
    const reloadEverything = async () => {
        await Promise.all([loadStatus(), refresh()]);
    };

    const handleEnabled = (codes: string[]) => {
        setRecoveryCodes(codes);
        void reloadEverything();
    };

    const handleDisable = async (password: string, code: string) => {
        try {
            await disableTwoFactor({ password, code });
            toast.success("Verifica in due passaggi disattivata");
            await reloadEverything();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile disattivare la verifica"));
            throw error;
        }
    };

    const handleRegenerate = async (password: string, code: string) => {
        try {
            const { recoveryCodes: codes } = await regenerateRecoveryCodes({ password, code });
            setRecoveryCodes(codes);
            await loadStatus();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile rigenerare i codici"));
            throw error;
        }
    };

    const isEnabled = status?.enabled ?? false;
    const remaining = status?.remainingRecoveryCodes ?? 0;

    return (
        <SettingsSection>
            <SettingsCard
                title="Verifica in due passaggi"
                description="Oltre alla password, all'accesso viene chiesto un codice generato dal tuo telefono. Una password rubata da sola non basta più per entrare."
                action={
                    status && !isEnabled ? (
                        <Button type="button" onClick={() => setIsSetupOpen(true)}>
                            <ShieldCheck className="size-4" />
                            Attiva
                        </Button>
                    ) : null
                }
            >
                {isLoading && !status ? (
                    <SettingsLoadingBox label="Caricamento impostazioni..." />
                ) : (
                    <div className="grid gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">Stato:</span>
                            <span
                                className={cn(
                                    "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                    isEnabled
                                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                        : "bg-muted text-muted-foreground"
                                )}
                            >
                                {isEnabled ? "Attiva" : "Non attiva"}
                            </span>
                        </div>

                        {isEnabled ? (
                            <>
                                <p
                                    className={cn(
                                        "text-sm",
                                        remaining === 0 ? "text-destructive" : "text-muted-foreground"
                                    )}
                                >
                                    {remaining === 0
                                        ? "Non ti resta nessun codice di recupero: se perdi il telefono non potrai più entrare da solo. Rigenerali adesso."
                                        : `Codici di recupero ancora utilizzabili: ${remaining} su 8.`}
                                </p>

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsRegenerateOpen(true)}
                                    >
                                        <RefreshCw className="size-4" />
                                        Rigenera codici di recupero
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsDisableOpen(true)}
                                    >
                                        <ShieldOff className="size-4" />
                                        Disattiva
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Ti servirà un&apos;app di autenticazione sul telefono, per esempio Google Authenticator,
                                Aegis o 1Password. Riceverai anche otto codici di recupero da conservare per quando il
                                telefono non è a portata di mano.
                            </p>
                        )}
                    </div>
                )}
            </SettingsCard>

            <SettingsCard
                title="Le tue sessioni"
                description="Gli accessi aperti col tuo account, su questo e altri dispositivi."
                action={
                    <RefreshButton
                        size="icon"
                        onRefresh={loadSessions}
                        isRefreshing={isLoadingSessions}
                        label="Aggiorna sessioni"
                    />
                }
            >
                <SessionsList
                    sessions={sessions}
                    isLoading={isLoadingSessions}
                    loadedAt={sessionsLoadedAt}
                    revokingId={revokingSessionId}
                    onRevoke={(session) => setSessionToRevoke(session)}
                />
            </SettingsCard>

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
                        ? `Disconnettere "${sessionToRevoke.device ?? "questo dispositivo"}"? Dovrai accedere di nuovo da lì.`
                        : undefined
                }
                destructive
                confirmLabel={revokingSessionId ? "Disconnessione..." : "Disconnetti"}
                confirmDisabled={revokingSessionId !== null}
                cancelDisabled={revokingSessionId !== null}
                onCancel={() => setSessionToRevoke(null)}
                onConfirm={() => {
                    if (sessionToRevoke) {
                        void handleRevokeSession(sessionToRevoke);
                    }
                }}
            />

            {user?.isAdmin ? (
                <SettingsCard
                    title="Tentativi di accesso falliti"
                    description="Gli ultimi accessi respinti su tutti gli account, dal registro delle azioni."
                    action={
                        <RefreshButton
                            size="icon"
                            onRefresh={loadFailedLogins}
                            isRefreshing={isLoadingFailedLogins}
                            label="Aggiorna tentativi di accesso falliti"
                        />
                    }
                >
                    {isLoadingFailedLogins && failedLogins === null ? (
                        <SettingsLoadingBox label="Caricamento tentativi di accesso..." />
                    ) : !failedLogins || failedLogins.length === 0 ? (
                        <SettingsEmptyBox>Nessun accesso fallito negli ultimi giorni.</SettingsEmptyBox>
                    ) : (
                        <Table containerClassName="max-h-64 overflow-y-auto">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data e ora</TableHead>
                                    <TableHead>IP</TableHead>
                                    <TableHead>Utente</TableHead>
                                    <TableHead>Errore</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {failedLogins.map((entry, index) => (
                                    <TableRow key={`${entry.timestamp}-${index}`}>
                                        <TableCell>{formatDateTime(entry.timestamp)}</TableCell>
                                        <TableCell>{entry.ip}</TableCell>
                                        <TableCell>{entry.user}</TableCell>
                                        <TableCell className="whitespace-normal text-destructive">
                                            {entry.error ?? ""}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </SettingsCard>
            ) : null}

            <TwoFactorSetupDialog open={isSetupOpen} onOpenChange={setIsSetupOpen} onEnabled={handleEnabled} />

            <TwoFactorConfirmDialog
                open={isDisableOpen}
                onOpenChange={setIsDisableOpen}
                title="Disattiva la verifica in due passaggi"
                description={
                    user?.isAdmin
                        ? "Per l'amministratore è obbligatoria: subito dopo ti verrà chiesto di configurarla di nuovo, per esempio su un altro telefono. Conferma con la password e con un codice, dell'app o di recupero."
                        : "Da quel momento per entrare basterà la password. Conferma con la password e con un codice, dell'app o di recupero."
                }
                confirmLabel="Disattiva"
                confirmIcon={ShieldOff}
                submittingLabel="Disattivazione..."
                destructive
                onConfirm={handleDisable}
            />

            <TwoFactorConfirmDialog
                open={isRegenerateOpen}
                onOpenChange={setIsRegenerateOpen}
                title="Rigenera i codici di recupero"
                description="I codici attuali smetteranno tutti di funzionare e ne riceverai otto nuovi. Conferma con la password e con un codice, dell'app o di recupero."
                confirmLabel="Rigenera"
                confirmIcon={RefreshCw}
                submittingLabel="Rigenerazione..."
                onConfirm={handleRegenerate}
            />

            <RecoveryCodesDialog
                open={recoveryCodes !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setRecoveryCodes(null);
                    }
                }}
                codes={recoveryCodes ?? []}
            />
        </SettingsSection>
    );
};

export default SecuritySettingsSection;
