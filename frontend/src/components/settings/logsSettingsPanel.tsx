import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard, SettingsEmptyBox, SettingsLoadingBox, SettingsSection } from "@/components/settings/settingsUi";
import RefreshButton from "@/components/refresh-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SearchInput from "@/components/search-input";
import EntityCardList, { LoadErrorState, type EntityCardColumn } from "@/components/entity-card-list";
import TablePagination from "@/components/table-pagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import {
    getApiErrorMessage,
    getLogDownloadUrl,
    getLogRetention,
    listLogEntries,
    listLogFiles,
    updateLogRetention,
    type LogEntryDto,
    type LogFileDto,
    type LogRetentionDto,
} from "@/lib/api";
import { cn, formatDate, formatDateTime, formatFileSize } from "@/lib/utils";

const minRetentionDays = 1;
const maxRetentionDays = 90;

type RetentionForm = { maxDays: number | null };
const emptyRetentionForm: RetentionForm = { maxDays: null };

// Il giorno del file ("2026-09-20") passa com'è: `formatDate` legge una data solo-giorno come
// mezzanotte locale. Prima diventava "…T00:00:00.000Z", mezzanotte UTC, e su un dispositivo con
// un fuso a ovest di Greenwich il file del 20 si leggeva "19/09/2026".
const formatDayKey = (dayKey: string) => formatDate(dayKey);

const isFailedEntry = (entry: LogEntryDto) => entry.status >= 400;

// Colonne della tabella (data, IP, utente, azione, stato, errore) e righe-scheletro mostrate
// mentre arriva una pagina: poche, perché la card è alta quanto il contenuto.
const logColumnCount = 6;
const logSkeletonRowCount = 5;

/**
 * Le stesse sei colonne della tabella, nella forma a schede sotto `sm`: a 390px la tabella
 * mostrava solo data, IP e utente, e l'azione, cioè il dato che si cerca, finiva tagliata a
 * destra. Lo stato va nel badge, rosso per le richieste respinte come nella tabella; azione ed
 * errore prendono tutta la larghezza perché sono frasi.
 */
const logCardColumns: EntityCardColumn<LogEntryDto>[] = [
    { key: "timestamp", header: "Data e ora", render: (entry) => formatDateTime(entry.timestamp), cardSlot: "title" },
    { key: "status", header: "Stato", render: (entry) => entry.status, cardSlot: "badge" },
    { key: "ip", header: "IP", render: (entry) => entry.ip },
    { key: "user", header: "Utente", render: (entry) => entry.user },
    { key: "action", header: "Azione", render: (entry) => entry.action, cardSlot: "wide" },
    {
        key: "error",
        header: "Errore",
        render: (entry) => <span className="text-destructive">{entry.error}</span>,
        cardSlot: "wide",
    },
];

// Senza la colonna "Errore" quando non c'è: una riga "Errore" vuota su ogni scheda riuscita
// era solo rumore.
const logCardColumnsWithoutError = logCardColumns.filter((column) => column.key !== "error");

const LogsSettingsPanel = () => {
    const [pageSize, setPageSize] = useTableRowsPerPage("logs");
    const [logFiles, setLogFiles] = useState<LogFileDto[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [selectedDayKey, setSelectedDayKey] = useState<string>("");
    const [searchText, setSearchText] = useState("");
    const debouncedSearchText = useDebouncedValue(searchText);
    const { currentPage, setCurrentPage } = useTablePagination({
        resetDependencies: [selectedDayKey, debouncedSearchText, pageSize],
    });
    // La conservazione è un modulo di un solo campo, con lo stesso ciclo degli altri pannelli:
    // caricamento, salvataggio e riallineamento alla risposta del server. `null` finché non è
    // arrivata (o se il caricamento è fallito): il campo resta vuoto e "Salva" spento.
    const {
        formValues: { maxDays: retentionDays },
        setFormValues: setRetentionForm,
        isLoading: isLoadingRetention,
        isSaving: isSavingRetention,
        handleSave: handleSaveRetention,
    } = useSettingsForm<LogRetentionDto, RetentionForm>({
        load: getLogRetention,
        // Mai null qui: "Salva" è spento finché il valore non è un intero nell'intervallo.
        save: (values) => updateLogRetention(values.maxDays ?? minRetentionDays),
        toForm: (retention) => ({ maxDays: retention.maxDays }),
        defaultValues: emptyRetentionForm,
        messages: {
            loadError: "Impossibile caricare la conservazione dei log",
            saveError: "Impossibile salvare la conservazione dei log",
            saved: "Conservazione log aggiornata",
        },
    });
    const isRetentionValid =
        retentionDays !== null &&
        Number.isInteger(retentionDays) &&
        retentionDays >= minRetentionDays &&
        retentionDays <= maxRetentionDays;

    const loadLogFiles = useCallback(async () => {
        setIsLoadingFiles(true);

        try {
            const files = await listLogFiles();
            setLogFiles(files);
            setSelectedDayKey((current) =>
                current && files.some((file) => file.dayKey === current) ? current : (files[0]?.dayKey ?? "")
            );
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare l'elenco dei log"));
        } finally {
            setIsLoadingFiles(false);
        }
    }, []);

    // Nessuna guardia manuale contro le risposte superate: la fornisce `usePaginatedRows`,
    // che oltretutto annulla per davvero la richiesta scavalcata (`signal`) invece di
    // limitarsi a scartarne la risposta. Prima una ricerca o un cambio di pagina veloci
    // potevano far arrivare per ultima la risposta più vecchia, sovrascrivendo la tabella
    // con risultati non più validi.
    const {
        rows: entries,
        totalItems,
        totalPages,
        isLoading: isLoadingEntries,
        error: entriesLoadError,
        reload: reloadEntries,
    } = usePaginatedRows<LogEntryDto>({
        fetchRows: (signal) =>
            selectedDayKey
                ? listLogEntries(selectedDayKey, { page: currentPage, pageSize, search: debouncedSearchText, signal })
                : Promise.resolve({ items: [], totalItems: 0, totalPages: 1, page: currentPage, pageSize }),
        queryKey: [selectedDayKey, currentPage, pageSize, debouncedSearchText],
        errorMessage: "Impossibile caricare il log selezionato",
    });

    useEffect(() => {
        startTransition(() => {
            void loadLogFiles();
        });
    }, [loadLogFiles]);

    const handleDownload = () => {
        if (!selectedDayKey) {
            return;
        }

        window.location.href = getLogDownloadUrl(selectedDayKey);
    };

    const handleRefresh = () => {
        void loadLogFiles();
        void reloadEntries();
    };

    return (
        // L'altezza fissa (tutta l'area della sezione, con la tabella che scorre dentro) solo da
        // `sm`: sotto ci sono le schede, e con un'altezza fissa sarebbero uscite dalla card.
        // La card non si allunga più fino in fondo (`flex-1`): con tre righe restavano ~370px di
        // tabella vuota sopra la paginazione. Ora è alta quanto il contenuto, e si restringe
        // (con la tabella che scorre) solo quando le righe non ci stanno.
        <SettingsSection className="flex min-h-0 flex-col sm:h-full">
            <SettingsCard
                title="Log azioni"
                className="min-h-0"
                contentClassName={logFiles.length === 0 ? undefined : "flex min-h-0 flex-1 flex-col gap-3"}
                action={
                    <>
                        <div className="flex items-center gap-1.5">
                            <Label htmlFor="log-retention-days" className="text-sm whitespace-nowrap">
                                Conserva per
                            </Label>
                            <Input
                                id="log-retention-days"
                                type="number"
                                min={minRetentionDays}
                                max={maxRetentionDays}
                                className="w-16 text-center"
                                disabled={isLoadingRetention}
                                value={retentionDays ?? ""}
                                onChange={(event) => setRetentionForm({ maxDays: Number(event.target.value) })}
                            />
                            <span className="text-sm whitespace-nowrap text-muted-foreground">giorni</span>
                            {/* Misura di serie (36px) come il campo accanto e "Scarica log
                                selezionato": con `sm` era alto 32px, a scalini sulla stessa riga. */}
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isLoadingRetention || isSavingRetention || !isRetentionValid}
                                onClick={() => void handleSaveRetention()}
                            >
                                <Save className="size-4" />
                                {isSavingRetention ? "Salvataggio..." : "Salva"}
                            </Button>
                        </div>
                        <Button type="button" variant="outline" disabled={!selectedDayKey} onClick={handleDownload}>
                            <Download className="size-4" />
                            Scarica log selezionato
                        </Button>
                    </>
                }
            >
                {isLoadingFiles && logFiles.length === 0 ? (
                    <SettingsLoadingBox label="Caricamento elenco log..." />
                ) : logFiles.length === 0 ? (
                    <SettingsEmptyBox>Nessun log disponibile sul server.</SettingsEmptyBox>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={selectedDayKey} onValueChange={setSelectedDayKey}>
                                <SelectTrigger className="w-full data-[size=default]:h-10 sm:w-auto sm:min-w-[220px]">
                                    <SelectValue placeholder="Seleziona una data" />
                                </SelectTrigger>
                                <SelectContent>
                                    {logFiles.map((file) => (
                                        <SelectItem key={file.dayKey} value={file.dayKey}>
                                            {`${formatDayKey(file.dayKey)} — ${formatFileSize(file.sizeBytes)}`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Stessa altezza della ricerca accanto: 40px, come nelle barre delle liste. */}
                            <RefreshButton
                                onRefresh={handleRefresh}
                                isRefreshing={isLoadingEntries || isLoadingFiles}
                                label="Aggiorna elenco log"
                            />

                            <SearchInput
                                value={searchText}
                                onValueChange={setSearchText}
                                placeholder="Cerca nel log..."
                            />
                        </div>

                        {/* Tabella e schede si scambiano sulla larghezza della sezione (`@container`
                            in SettingsPage), non dello schermo: a 768px con la barra laterale aperta
                            la sezione è larga circa 440px e le sei colonne non ci stavano, la
                            tabella scorreva in orizzontale. Sotto i 36rem si usano le schede, come
                            su telefono. */}
                        <div className="hidden min-h-0 overflow-y-auto rounded-md border border-primary/15 @xl:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data e ora</TableHead>
                                        <TableHead>IP</TableHead>
                                        <TableHead>Utente</TableHead>
                                        <TableHead>Azione</TableHead>
                                        <TableHead>Stato</TableHead>
                                        <TableHead>Errore</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {/* Righe-scheletro e messaggio vuoto come in EntityTable, così il
                                        caricamento dei log ha lo stesso aspetto delle altre liste. La
                                        scritta resta per i lettori di schermo. */}
                                    {isLoadingEntries ? (
                                        Array.from({ length: logSkeletonRowCount }, (_, rowIndex) => (
                                            <TableRow key={`skeleton-${rowIndex}`} aria-hidden={rowIndex > 0}>
                                                {Array.from({ length: logColumnCount }, (_, cellIndex) => (
                                                    <TableCell key={cellIndex}>
                                                        {rowIndex === 0 && cellIndex === 0 ? (
                                                            <span className="sr-only">Caricamento log...</span>
                                                        ) : null}
                                                        <Skeleton aria-hidden="true" className="h-4 w-full" />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : entries.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={logColumnCount} className="py-6 text-muted-foreground">
                                                {/* Centrato nella parte visibile anche se la tabella scorre
                                                    in orizzontale: vedi lo stesso messaggio in EntityTable. */}
                                                <span className="sticky left-1/2 inline-block -translate-x-1/2">
                                                    {/* Un registro che non si è potuto leggere non è un
                                                        registro vuoto: vedi `LoadErrorState`. */}
                                                    {entriesLoadError ? (
                                                        <LoadErrorState
                                                            message={entriesLoadError}
                                                            onRetry={() => void reloadEntries()}
                                                        />
                                                    ) : (
                                                        "Nessuna voce trovata per i criteri selezionati."
                                                    )}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        entries.map((entry, index) => (
                                            <TableRow key={`${entry.timestamp}-${index}`}>
                                                <TableCell>{formatDateTime(entry.timestamp)}</TableCell>
                                                <TableCell>{entry.ip}</TableCell>
                                                <TableCell>{entry.user}</TableCell>
                                                <TableCell className="whitespace-normal">{entry.action}</TableCell>
                                                <TableCell
                                                    className={cn(
                                                        isFailedEntry(entry) && "font-semibold text-destructive"
                                                    )}
                                                >
                                                    {entry.status}
                                                </TableCell>
                                                <TableCell className="whitespace-normal text-destructive">
                                                    {entry.error ?? ""}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        <EntityCardList
                            hiddenFromClassName="@xl:hidden"
                            columns={entries.some((entry) => entry.error) ? logCardColumns : logCardColumnsWithoutError}
                            rows={entries}
                            getRowKey={(entry) => `${entry.timestamp}-${entry.ip}-${entry.action}-${entry.status}`}
                            getStatusColor={(entry) => (isFailedEntry(entry) ? "red" : undefined)}
                            emptyMessage="Nessuna voce trovata per i criteri selezionati."
                            loadError={entriesLoadError}
                            onRetry={() => void reloadEntries()}
                            isInitialLoading={isLoadingEntries}
                        />

                        <TablePagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={setPageSize}
                        />
                    </>
                )}
            </SettingsCard>
        </SettingsSection>
    );
};

export default LogsSettingsPanel;
