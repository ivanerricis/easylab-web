import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingsCard } from "@/components/settings/settingsUi";
import RefreshButton from "@/components/refresh-button";
import { formatDateTime, formatFileSize } from "@/lib/utils";
import type { BackupPanel } from "./useBackupPanel";

const BackupDumpsCard = ({ panel }: { panel: BackupPanel }) => (
    <SettingsCard
        title="Archivio dump"
        description="Dump presenti sul server: scaricali oppure ripristinali direttamente. Il ripristino sovrascrive i dati attuali ed è irreversibile."
        action={
            <RefreshButton
                size="icon"
                onRefresh={panel.loadDumpFiles}
                isRefreshing={panel.isLoadingDumps}
                label="Aggiorna elenco dump"
            />
        }
    >
        <div className="rounded-md border border-primary/15">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nome file</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Dimensione</TableHead>
                        <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {panel.isLoadingDumps && panel.dumpFiles.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center whitespace-normal text-muted-foreground">
                                Caricamento elenco dump...
                            </TableCell>
                        </TableRow>
                    ) : panel.dumpFiles.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center whitespace-normal text-muted-foreground">
                                Nessun dump disponibile sul server.
                            </TableCell>
                        </TableRow>
                    ) : (
                        panel.dumpFiles.map((dump) => (
                            <TableRow key={dump.fileName}>
                                <TableCell className="font-mono text-xs whitespace-normal">{dump.fileName}</TableCell>
                                <TableCell>{formatDateTime(dump.createdAt)}</TableCell>
                                <TableCell>{formatFileSize(dump.sizeBytes)}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    onClick={() => panel.handleDownloadDump(dump.fileName)}
                                                    aria-label={`Scarica ${dump.fileName}`}
                                                >
                                                    <Download className="size-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Scarica</TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="icon"
                                                    disabled={panel.isRestoring}
                                                    onClick={() =>
                                                        panel.openRestoreConfirm({
                                                            type: "existing",
                                                            fileName: dump.fileName,
                                                        })
                                                    }
                                                    aria-label={`Ripristina ${dump.fileName}`}
                                                >
                                                    <RotateCcw className="size-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Ripristina questo dump</TooltipContent>
                                        </Tooltip>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    </SettingsCard>
);

export default BackupDumpsCard;
