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
    SettingsWarningNote,
    type SettingsRunStatus,
} from "@/components/settings/settingsUi";
import CustomDialog from "@/components/dialogs/customDialog";
import ScheduleUpdateDialog from "@/components/dialogs/settings/scheduleUpdateDialog";
import DetailItem, { DetailGrid } from "@/components/detail-item";
import { useBusyGuard } from "@/components/use-busy-guard";
import {
    cancelScheduledUpdate,
    checkForUpdates,
    getApiErrorMessage,
    getBackupSettings,
    getUpdateInfo,
    getUpdateStatus,
    runUpdateNow,
    scheduleUpdate,
    type UpdateInfoDto,
    type UpdateStatusDto,
} from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import { buildProgressDetail, updatePhaseSteps } from "@/lib/updatePhases";
import { formatScheduledMoment } from "@/lib/updateSchedule";
import { CalendarClock, Download, RefreshCw } from "lucide-react";

const outcomeLabels = {
    success: "completato",
    failed: "non riuscito",
    cancelled: "annullato",
} as const;

const POLL_INTERVAL_MS = 3000;
const CHECK_MAX_ATTEMPTS = 20; // ~1 minute
const UPDATE_MAX_ATTEMPTS = 120; // ~6 minutes

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `readOnly`: per chi non è amministratore. Solo le informazioni (versione, date), senza i pulsanti
 * per verificare e aggiornare, né l'ultimo errore: le rotte che servono sono dell'amministratore.
 */
const UpdateSettingsPanel = ({ readOnly = false }: { readOnly?: boolean }) => {
    const { setBusy } = useBusyGuard();
    const [status, setStatus] = useState<(UpdateInfoDto & Partial<UpdateStatusDto>) | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isScheduleOpen, setIsScheduleOpen] = useState(false);
    const [isCancelScheduleOpen, setIsCancelScheduleOpen] = useState(false);
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
            const result = readOnly ? await getUpdateInfo() : await getUpdateStatus();
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
        const toastId = toast.loading("Verifica aggiornamenti in corso...");

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
                            toast.warning("È disponibile un aggiornamento", { id: toastId });
                        } else {
                            toast.success("Applicazione già aggiornata", { id: toastId });
                        }
                        return;
                    }
                } catch {
                    // il backend potrebbe non rispondere per un istante, si ritenta
                }
            }

            toast.error("Verifica aggiornamenti: nessuna risposta, riprova più tardi", { id: toastId });
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile avviare la verifica aggiornamenti"), { id: toastId });
        } finally {
            if (!cancelledRef.current) {
                setIsChecking(false);
            }
        }
    };

    // Il server risponde con la programmazione aggiornata: si sostituisce nello stato, senza
    // ricaricare tutto. Un errore lo mostra il dialogo (programmazione) o il toast (annullo).
    const handleSchedule = async (fields: { date: string; time: string }) => {
        const schedule = await scheduleUpdate(fields);

        if (!cancelledRef.current) {
            setStatus((prev) => (prev ? { ...prev, schedule, scheduledAt: schedule.scheduledAt } : prev));
        }

        toast.success(
            schedule.scheduledAt
                ? `Aggiornamento programmato per ${formatScheduledMoment(schedule.scheduledAt)}`
                : "Aggiornamento programmato"
        );
    };

    const handleCancelSchedule = async () => {
        setIsCancelScheduleOpen(false);

        try {
            const schedule = await cancelScheduledUpdate();

            if (!cancelledRef.current) {
                setStatus((prev) => (prev ? { ...prev, schedule, scheduledAt: schedule.scheduledAt } : prev));
            }

            toast.success("Programmazione annullata");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile annullare la programmazione"));
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

    // `activeStepKey: null` è "oltre l'ultima fase": usato a fine aggiornamento per spuntare
    // anche l'ultima invece di lasciarla segnata come ancora in corso durante l'attesa prima
    // del reload (vedi il commento su BusyGuardState.activeStepKey).
    const setUpdateBusy = (activeStepKey: string | null, detail?: string) => {
        setBusy({
            title: "Aggiornamento in corso...",
            description:
                "Non chiudere o ricaricare la pagina: l'applicazione si ricaricherà automaticamente al termine.",
            steps: updatePhaseSteps,
            activeStepKey,
            detail,
        });
    };

    const handleUpdate = async () => {
        if (isChecking || isUpdating) {
            return;
        }

        setIsConfirmOpen(false);
        const previousLastUpdateAt = status?.lastUpdateAt ?? null;
        setIsUpdating(true);
        setUpdateBusy("verify");

        try {
            await runUpdateNow();

            for (let attempt = 0; attempt < UPDATE_MAX_ATTEMPTS; attempt += 1) {
                await sleep(POLL_INTERVAL_MS);
                if (cancelledRef.current) {
                    return;
                }

                try {
                    const result = await getUpdateStatus();

                    // Finché lastUpdateAt non cambia, questa è ancora la fotografia di prima di
                    // aver premuto il pulsante (il trigger non è ancora stato raccolto): un
                    // "success"/"failed" letto qui sarebbe quello dell'aggiornamento precedente,
                    // non di questo. scripts/update-server.sh scrive un lastUpdateAt fresco a
                    // ogni fase, a partire dalla primissima ("running"/"verify"), quindi il
                    // confronto scatta anche quando il commit non cambia — un "riapplica la
                    // stessa versione" senza niente da scaricare, dove prima lo spinner restava
                    // acceso fino al timeout perché si confrontava il commit invece della data.
                    const isThisRun = result.lastUpdateAt !== previousLastUpdateAt;

                    if (isThisRun && result.state === "failed") {
                        setStatus(result);
                        toast.error(result.lastError ?? "Aggiornamento non riuscito");
                        return;
                    }

                    if (isThisRun && result.state === "success") {
                        setStatus(result);
                        // `setUpdateBusy(null)` spunta anche l'ultima fase ma lascia l'overlay
                        // visibile (vedi il commento su BusyGuardState.activeStepKey): il reload
                        // vero va sbloccato con `setBusy(null)`, altrimenti il beforeunload di
                        // BusyGuardProvider lo intercetta e il browser chiede conferma.
                        setUpdateBusy(null);
                        toast.success("Aggiornamento completato. Ricarico la pagina...");
                        await sleep(1500);
                        setBusy(null);
                        window.location.reload();
                        return;
                    }

                    // Il container backend viene ricreato durante la fase "build": qui sotto
                    // non arriva più nulla per quella finestra, ma la fase resta quella scritta
                    // prima del riavvio finché il polling successivo non ne legge una nuova.
                    if (result.state === "running" && result.phase) {
                        setUpdateBusy(result.phase, buildProgressDetail(result.phase, result.build));
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
    // L'amministratore la legge da `schedule`, gli altri da `scheduledAt` (vedi /update-info).
    const scheduledAt = status?.schedule?.scheduledAt ?? status?.scheduledAt ?? null;
    const lastOutcome = readOnly ? null : (status?.schedule ?? null);

    return (
        <SettingsSection>
            <SettingsCard
                title="Stato aggiornamenti"
                action={
                    readOnly ? undefined : (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => void handleCheck()}
                            >
                                <RefreshCw className={cn("size-4", isChecking && "animate-spin")} />
                                {isChecking ? "Verifica in corso..." : "Verifica aggiornamenti"}
                            </Button>
                            <Button
                                type="button"
                                disabled={isBusy || !status?.updateAvailable}
                                onClick={() => void handleOpenConfirm()}
                            >
                                <Download className="size-4" />
                                {isUpdating ? "Aggiornamento in corso..." : "Aggiorna adesso"}
                            </Button>
                            {status?.updateAvailable ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isBusy}
                                    onClick={() => setIsScheduleOpen(true)}
                                >
                                    <CalendarClock className="size-4" />
                                    Programma
                                </Button>
                            ) : null}
                        </>
                    )
                }
            >
                {isLoading && !status ? (
                    <SettingsLoadingBox label="Caricamento stato aggiornamento..." />
                ) : (
                    <>
                        <SettingsTileGrid>
                            <SettingsTile
                                label="Versione installata"
                                value={status?.currentVersion ?? status?.currentCommit ?? "-"}
                            />
                            <SettingsTile
                                label="Ultima verifica"
                                value={formatDateTime(status?.lastCheckedAt ?? null)}
                            />
                            <SettingsTile
                                label="Aggiornamento disponibile"
                                value={
                                    status?.updateAvailable
                                        ? `Sì (${status.remoteVersion ?? status.remoteCommit ?? "-"})`
                                        : "No"
                                }
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

                        {scheduledAt ? (
                            <SettingsWarningNote
                                title={`Aggiornamento programmato per ${formatScheduledMoment(scheduledAt)}`}
                            >
                                <p className="text-muted-foreground">
                                    All&apos;ora fissata il server installa l&apos;ultima versione disponibile e
                                    l&apos;applicazione resta non raggiungibile per qualche minuto.
                                    {!readOnly && status?.schedule?.scheduledBy
                                        ? ` Programmato da ${status.schedule.scheduledBy}.`
                                        : null}
                                </p>
                                {readOnly ? null : (
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={isBusy}
                                            onClick={() => setIsScheduleOpen(true)}
                                        >
                                            Modifica
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={isBusy}
                                            onClick={() => setIsCancelScheduleOpen(true)}
                                        >
                                            Annulla programmazione
                                        </Button>
                                    </div>
                                )}
                            </SettingsWarningNote>
                        ) : null}

                        {lastOutcome?.lastOutcome ? (
                            lastOutcome.lastOutcome === "success" ? (
                                <p className="text-xs text-muted-foreground">
                                    Ultimo aggiornamento programmato: {outcomeLabels.success} il{" "}
                                    {formatDateTime(lastOutcome.lastOutcomeAt)}.
                                </p>
                            ) : (
                                <SettingsErrorNote
                                    label={`Ultimo aggiornamento programmato ${outcomeLabels[lastOutcome.lastOutcome]} il ${formatDateTime(lastOutcome.lastOutcomeAt)}`}
                                    message={lastOutcome.lastOutcomeMessage ?? "-"}
                                />
                            )
                        ) : null}

                        {!readOnly && status?.lastError ? (
                            <SettingsErrorNote label="Ultimo errore" message={status.lastError} />
                        ) : null}
                    </>
                )}
            </SettingsCard>

            <CustomDialog
                open={isConfirmOpen}
                onOpenChange={setIsConfirmOpen}
                title="Aggiorna applicazione"
                description={
                    scheduledAt
                        ? `I servizi verranno ricostruiti e riavviati: l'applicazione sarà brevemente non raggiungibile. L'aggiornamento programmato per ${formatScheduledMoment(scheduledAt)} verrà annullato.`
                        : "I servizi verranno ricostruiti e riavviati: l'applicazione sarà brevemente non raggiungibile."
                }
                content={
                    <SettingsWarningNote title="Esegui un backup prima di aggiornare">
                        <p className="text-muted-foreground">
                            L&apos;aggiornamento può applicare modifiche al database che non si annullano da sole. Se
                            qualcosa va storto, il backup è l&apos;unico modo per tornare indietro: lo esegui da
                            Impostazioni &gt; Backup.
                        </p>
                        <DetailGrid layout="rows">
                            <DetailItem
                                label="Ultimo backup"
                                value={
                                    isLoadingLastBackup ? (
                                        <span className="font-normal text-muted-foreground">verifica in corso...</span>
                                    ) : lastBackup ? (
                                        <span className="inline-flex flex-wrap items-center justify-end gap-2">
                                            {formatDateTime(lastBackup.at)}
                                            <SettingsStatusBadge status={lastBackup.status} />
                                        </span>
                                    ) : (
                                        "non disponibile"
                                    )
                                }
                            />
                        </DetailGrid>
                    </SettingsWarningNote>
                }
                confirmLabel="Aggiorna adesso"
                confirmIcon={Download}
                cancelLabel="Annulla"
                onCancel={() => setIsConfirmOpen(false)}
                onConfirm={() => void handleUpdate()}
            />

            <ScheduleUpdateDialog
                open={isScheduleOpen}
                onOpenChange={setIsScheduleOpen}
                currentScheduledAt={scheduledAt}
                onSubmit={handleSchedule}
            />

            <CustomDialog
                open={isCancelScheduleOpen}
                onOpenChange={setIsCancelScheduleOpen}
                title="Annulla programmazione"
                description={
                    scheduledAt
                        ? `L'aggiornamento programmato per ${formatScheduledMoment(scheduledAt)} non partirà. Potrai programmarlo di nuovo o aggiornare subito.`
                        : undefined
                }
                confirmLabel="Annulla programmazione"
                cancelLabel="Mantieni"
                destructive
                onCancel={() => setIsCancelScheduleOpen(false)}
                onConfirm={() => void handleCancelSchedule()}
            />
        </SettingsSection>
    );
};

export default UpdateSettingsPanel;
