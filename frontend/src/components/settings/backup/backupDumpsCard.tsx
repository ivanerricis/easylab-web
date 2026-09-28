import { Download, RotateCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "@/components/settings/settingsUi";
import RefreshButton from "@/components/refresh-button";
import TableActionButton from "@/components/table-action-button";
import EntityCardList, { type EntityCardColumn } from "@/components/entity-card-list";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatFileSize } from "@/lib/utils";
import type { BackupPanel } from "./useBackupPanel";

type DumpFile = BackupPanel["dumpFiles"][number];

/** Le colonne della tabella: servono anche alle righe-scheletro, che ne disegnano una cella ciascuna. */
const dumpTableColumnCount = 4;

/**
 * L'archivio in forma di scheda quando la sezione è stretta: a 390px la tabella mostrava il nome
 * del file su quattro righe e spingeva i pulsanti fuori dal bordo. Il nome è il titolo, in
 * monospazio come nella tabella perché è il dato con cui si riconosce un dump.
 */
const dumpCardColumns: EntityCardColumn<DumpFile>[] = [
    {
        key: "fileName",
        header: "Nome file",
        render: (dump) => <span className="font-mono text-sm break-all">{dump.fileName}</span>,
        cardSlot: "title",
    },
    { key: "createdAt", header: "Data", render: (dump) => formatDateTime(dump.createdAt) },
    { key: "size", header: "Dimensione", render: (dump) => formatFileSize(dump.sizeBytes) },
];

const BackupDumpsCard = ({ panel }: { panel: BackupPanel }) => (
    <SettingsCard
        title="Archivio dump"
        keepDescriptionOnMobile
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
        {/* Tabella e schede si scambiano sulla larghezza della sezione (`@container` in
            SettingsPage), non dello schermo, come nei Log: a 768px con la barra laterale aperta
            la sezione è larga circa 440px e con `sm` la tabella c'era già, col nome del file su
            più righe.

            Non è un `EntityTable`, che farebbe da sé scheletro e schede: lì il cambio fra
            tabella e schede è fisso a `sm`, e larghezze delle colonne ricordate e posizione di
            scorrimento sono pensate per le liste delle pagine, non per quattro righe qui. Lo
            scheletro e il messaggio di lista vuota sono però gli stessi. */}
        <div className="hidden rounded-md border border-primary/15 @xl:block">
            <Table aria-busy={panel.isLoadingDumps && panel.dumpFiles.length === 0}>
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
                        Array.from({ length: 3 }, (_, rowIndex) => (
                            <TableRow key={`skeleton-${rowIndex}`}>
                                {Array.from({ length: dumpTableColumnCount }, (_, cellIndex) => (
                                    <TableCell key={cellIndex}>
                                        {cellIndex === dumpTableColumnCount - 1 ? (
                                            <Skeleton className="ml-auto h-8 w-20" />
                                        ) : (
                                            <Skeleton className="h-4 w-full" />
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : panel.dumpFiles.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={dumpTableColumnCount} className="py-6 text-muted-foreground">
                                {/* Centrato nella parte visibile della tabella, come in `EntityTable`. */}
                                <span className="sticky left-1/2 inline-block -translate-x-1/2">
                                    Nessun dump disponibile sul server.
                                </span>
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
                                        <TableActionButton
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => panel.handleDownloadDump(dump.fileName)}
                                            aria-label={`Scarica ${dump.fileName}`}
                                        >
                                            <Download className="size-4" />
                                        </TableActionButton>

                                        <TableActionButton
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
                                        </TableActionButton>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>

        <EntityCardList
            hiddenFromClassName="@xl:hidden"
            columns={dumpCardColumns}
            rows={panel.dumpFiles}
            getRowKey={(dump) => dump.fileName}
            emptyMessage="Nessun dump disponibile sul server."
            isInitialLoading={panel.isLoadingDumps && panel.dumpFiles.length === 0}
            // Con il testo, non solo l'icona: nelle schede i pulsanti si dividono la larghezza,
            // e due riquadri larghi con dentro solo un'icona non si capiva cosa facessero.
            // Niente `disabled={panel.isRestoring}` come in tabella: `EntityCardList` ridisegna
            // i pulsanti solo quando cambia la riga, e durante un ripristino il dialogo di
            // conferma resta comunque aperto sopra la pagina.
            renderActions={(dump) => (
                <>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => panel.handleDownloadDump(dump.fileName)}
                        aria-label={`Scarica ${dump.fileName}`}
                    >
                        <Download className="size-4" />
                        Scarica
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={() => panel.openRestoreConfirm({ type: "existing", fileName: dump.fileName })}
                        aria-label={`Ripristina ${dump.fileName}`}
                    >
                        <RotateCcw className="size-4" />
                        Ripristina
                    </Button>
                </>
            )}
        />
    </SettingsCard>
);

export default BackupDumpsCard;
