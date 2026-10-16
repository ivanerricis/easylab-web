import { startTransition, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import RefreshButton from "@/components/refresh-button";
import {
    SettingsCard,
    SettingsLoadingBox,
    SettingsSection,
    SettingsTile,
    SettingsTileGrid,
    SettingsWarningNote,
} from "@/components/settings/settingsUi";
import { getApiErrorMessage, getSystemStatus, type SystemDiskDto, type SystemStatusDto } from "@/lib/api";
import { cn, formatDateTime, formatFileSize } from "@/lib/utils";

const usedPercent = (disk: SystemDiskDto) =>
    disk.totalBytes > 0 ? Math.min(100, Math.max(0, Math.round((disk.usedBytes / disk.totalBytes) * 100))) : 0;

// Il valore del riquadro porta anche la barra: `SettingsTile` non ha uno spazio per contenuti
// extra, e la barra fa parte di quel valore ("quanto è pieno"). Gli `span` a blocco evitano
// un `div` dentro lo `span` del valore. Lo stato `failed` di `SettingsTile` direbbe "Fallito":
// per un disco quasi pieno l'avviso giallo (barra e scritta) è più onesto.
const DiskValue = ({ disk }: { disk: SystemDiskDto }) => {
    const percent = usedPercent(disk);

    return (
        <>
            <span className="block">
                {/* Usato e non libero: è il numero di Proxmox e di `df`, mentre il libero dell'API
                    esclude il 5% riservato a root e non tornerebbe con quei due. */}
                {formatFileSize(disk.usedBytes)} usati su {formatFileSize(disk.totalBytes)} ({percent}%)
            </span>
            <span
                role="progressbar"
                aria-label={`Spazio usato su ${disk.label}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="mt-1.5 block h-2 overflow-hidden rounded-full bg-muted"
            >
                <span
                    className={cn("block h-full rounded-full", disk.low ? "bg-status-yellow" : "bg-primary")}
                    style={{ width: `${percent}%` }}
                />
            </span>
            {disk.low ? (
                <span className="mt-1 block text-xs font-medium text-status-yellow-foreground">
                    Spazio in esaurimento
                </span>
            ) : null}
        </>
    );
};

const SystemSettingsPanel = () => {
    const [status, setStatus] = useState<SystemStatusDto | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const cancelledRef = useRef(false);

    useEffect(() => {
        cancelledRef.current = false;
        return () => {
            cancelledRef.current = true;
        };
    }, []);

    const loadStatus = async () => {
        try {
            const result = await getSystemStatus();
            if (!cancelledRef.current) {
                setStatus(result);
            }
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare lo stato del sistema"));
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

    const hasLowDisk = status?.disks.some((disk) => disk.low) ?? false;

    return (
        <SettingsSection>
            <SettingsCard
                title="Spazio su disco"
                description="Occupazione dei dischi del server e dimensione del database."
                action={<RefreshButton size="icon" onRefresh={loadStatus} label="Aggiorna stato del sistema" />}
            >
                {isLoading ? (
                    <SettingsLoadingBox />
                ) : status ? (
                    <>
                        {status.disks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Spazio su disco non disponibile su questo server.
                            </p>
                        ) : null}

                        <SettingsTileGrid>
                            {status.disks.map((disk) => (
                                <SettingsTile key={disk.key} label={disk.label} value={<DiskValue disk={disk} />} />
                            ))}
                            <SettingsTile
                                label="Database"
                                value={
                                    status.databaseSizeBytes == null
                                        ? "Non disponibile"
                                        : formatFileSize(status.databaseSizeBytes)
                                }
                            />
                        </SettingsTileGrid>

                        {hasLowDisk ? (
                            <SettingsWarningNote title="Spazio su disco in esaurimento">
                                <p>
                                    Libera spazio o sposta i backup: sotto il 10% (o 2 GB) liberi arriva un avviso nella
                                    campanella e per email.
                                </p>
                            </SettingsWarningNote>
                        ) : null}

                        <p className="text-xs text-muted-foreground">
                            Ultimo controllo: {formatDateTime(status.checkedAt)}
                        </p>
                    </>
                ) : null}
            </SettingsCard>
        </SettingsSection>
    );
};

export default SystemSettingsPanel;
