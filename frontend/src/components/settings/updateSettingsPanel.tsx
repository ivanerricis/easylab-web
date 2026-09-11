import { startTransition, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    SettingsCard,
    SettingsErrorNote,
    SettingsLoadingBox,
    SettingsSection,
    SettingsStatusBadge,
    SettingsTile,
    SettingsTileGrid,
    type SettingsRunStatus,
} from "@/components/settings/settingsUi";
import CustomDialog from "@/components/dialogs/customDialog";
import { useBusyGuard } from "@/components/use-busy-guard";
import {
    checkForUpdates,
    getApiErrorMessage,
    getBackupSettings,
    getUpdateStatus,
    runUpdateNow,
    type UpdateStatusDto,
} from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { Download } from "lucide-react";

const POLL_INTERVAL_MS = 3000;
const CHECK_MAX_ATTEMPTS = 20; // ~1 minute
const UPDATE_MAX_ATTEMPTS = 120; // ~6 minutes

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const UpdateSettingsPanel = () => {
    const { setBusy } = useBusyGuard();
    const [status, setStatus] = useState<UpdateStatusDto | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [lastBackup, setLastBackup] = useState<{ at: string | null; status: SettingsRunStatus } | null>(null);
    const [isLoadingLastBackup, setIsLoadingLastBackup] = useState(false);
    const cancelledRef = useRef(false);

    useEffect(() => {
        cancelledRef.current = false;
        return () => {
            cancelledRef.current = true;
        };
    }, []);

    const loadStatus = async () => {
        setIsLoading(true);

        try {
            const result = await getUpdateStatus();
            if (!cancelledRef.current) {
                setStatus(result);
            }
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare lo stato dell'aggiornamento"));
        } finally {
            if (!cancelledRef.current) {
                setIsLoading(false);
            }
        }
    };

    useEffect(() => {
        startTransition(() => {
            void loadStatus();
        });
    }, []);

    const handleCheck = async () => {
        if (isChecking || isUpdating) {
            return;
        }

        const previousCheckedAt = status?.lastCheckedAt ?? null;
        setIsChecking(true);

        try {
            await checkForUpdates();

            for (let attempt = 0; attempt < CHECK_MAX_ATTEMPTS; attempt += 1) {
                await sleep(POLL_INTERVAL_MS);
                if (cancelledRef.current) {
                    return;
                }

                try {
                    const result = await getUpdateStatus();
                    if (result.lastCheckedAt && result.lastCheckedAt !== previousCheckedAt) {
                        setStatus(result);
                        if (result.updateAvailable) {
                            toast.warning("È disponibile un aggiornamento", { richColors: true });
                        } else {
                            toast.success("Applicazione già aggiornata");
                        }
                        return;
                    }
                } catch {
                    // il backend potrebbe non rispondere per un istante, si ritenta
                }
            }

            toast.error("Verifica aggiornamenti: nessuna risposta, riprova più tardi");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile avviare la verifica aggiornamenti"));
        } finally {
            if (!cancelledRef.current) {
                setIsChecking(false);
            }
        }
    };

    // La data dell'ultimo backup si legge all'apertura della conferma, non al caricamento
    // del pannello: e' li' che serve, ed e' li' che deve essere fresca.
    const handleOpenConfirm = async () => {
        setIsConfirmOpen(true);
        setLastBackup(null);
        setIsLoadingLastBackup(true);

        try {
            const backup = await getBackupSettings();

            if (!cancelledRef.current) {
                setLastBackup({ at: backup.lastRunAt, status: backup.lastRunStatus });
            }
        } catch {
            // Nessun toast: l'avviso di fare il backup resta valido comunque, e la sezione
            // Backup mostra l'errore vero. Qui manca solo la data.
        } finally {
            if (!cancelledRef.current) {
                setIsLoadingLastBackup(false);
            }
        }
    };

    const handleUpdate = async () => {
        if (isChecking || isUpdating) {
            return;
        }

        setIsConfirmOpen(false);
        const previousCommit = status?.currentCommit ?? null;
        setIsUpdating(true);
        setBusy({
            title: "Aggiornamento in corso...",
            description:
                "Non chiudere o ricaricare la pagina: l'applicazione si ricaricherà automaticamente al termine.",
        });

        try {
            await runUpdateNow();

            for (let attempt = 0; attempt < UPDATE_MAX_ATTEMPTS; attempt += 1) {
                await sleep(POLL_INTERVAL_MS);
                if (cancelledRef.current) {
                    return;
                }

                try {
                    const result = await getUpdateStatus();

                    if (result.state === "failed") {
                        setStatus(result);
                        toast.error(result.lastError ?? "Aggiornamento non riuscito");
                        return;
                    }

                    if (result.state === "success" && result.currentCommit !== previousCommit) {
                        setStatus(result);
                        toast.success("Aggiornamento completato. Ricarico la pagina...");
                        await sleep(1500);
                        window.location.reload();
                        return;
                    }
                } catch {
                    // atteso: i container vengono ricreati durante l'aggiornamento
                }
            }

            toast.error("Aggiornamento in corso da troppo tempo, controlla lo stato del server");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile avviare l'aggiornamento"));
        } finally {
            if (!cancelledRef.current) {
                setIsUpdating(false);
            }
            setBusy(null);
        }
    };

    const isBusy = isChecking || isUpdating || isLoading;

    return (
        <SettingsSection>
            <SettingsCard
                title="Stato aggiornamenti"
                description="Verifica e applica gli aggiornamenti dell'applicazione sul server."
                action={
                    <>
                        <Button type="button" variant="outline" disabled={isBusy} onClick={() => void handleCheck()}>
                            {isChecking ? "Verifica in corso..." : "Verifica aggiornamenti"}
                        </Button>
                        <Button
                            type="button"
                            disabled={isBusy || !status?.updateAvailable}
                            onClick={() => void handleOpenConfirm()}
                        >
                            {isUpdating ? "Aggiornamento in corso..." : "Aggiorna adesso"}
                        </Button>
                    </>
                }
            >
                {isLoading && !status ? (
                    <SettingsLoadingBox label="Caricamento stato aggiornamento..." />
                ) : (
                    <>
                        <SettingsTileGrid>
                            <SettingsTile label="Versione installata" value={status?.currentCommit ?? "-"} />
                            <SettingsTile
                                label="Ultima verifica"
                                value={formatDateTime(status?.lastCheckedAt ?? null)}
                            />
                            <SettingsTile
                                label="Aggiornamento disponibile"
                                value={status?.updateAvailable ? `Sì (${status.remoteCommit ?? "-"})` : "No"}
                                highlight={status?.updateAvailable}
                            />
                            <SettingsTile
                                label="Ultimo aggiornamento"
                                value={formatDateTime(status?.lastUpdateAt ?? null)}
                                status={status?.lastUpdateStatus ?? "idle"}
                            />
                        </SettingsTileGrid>

                        {status?.state === "unknown" ? (
                            <p className="text-xs text-muted-foreground">
                                Servizio di aggiornamento non ancora configurato su questo server.
                            </p>
                        ) : null}

                        {status?.lastError ? (
                            <SettingsErrorNote label="Ultimo errore" message={status.lastError} />
                        ) : null}
                    </>
                )}
            </SettingsCard>

            <CustomDialog
                open={isConfirmOpen}
                onOpenChange={setIsConfirmOpen}
                title="Aggiorna applicazione"
                description="I servizi verranno ricostruiti e riavviati: l'applicazione sarà brevemente non raggiungibile. Continuare?"
                content={
                    <div className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                        <p className="font-medium">Esegui un backup prima di aggiornare</p>
                        <p className="text-muted-foreground">
                            L&apos;aggiornamento può applicare modifiche al database che non si annullano da sole. Se
                            qualcosa va storto, il backup è l&apos;unico modo per tornare indietro: lo esegui da
                            Impostazioni &gt; Backup.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">Ultimo backup:</span>
                            {isLoadingLastBackup ? (
                                <span className="text-muted-foreground">verifica in corso...</span>
                            ) : lastBackup ? (
                                <>
                                    <span className="font-medium">{formatDateTime(lastBackup.at)}</span>
                                    <SettingsStatusBadge status={lastBackup.status} />
                                </>
                            ) : (
                                <span className="font-medium">non disponibile</span>
                            )}
                        </div>
                    </div>
                }
                confirmLabel="Aggiorna adesso"
                confirmIcon={Download}
                cancelLabel="Annulla"
                onCancel={() => setIsConfirmOpen(false)}
                onConfirm={() => void handleUpdate()}
            />
        </SettingsSection>
    );
};

export default UpdateSettingsPanel;
