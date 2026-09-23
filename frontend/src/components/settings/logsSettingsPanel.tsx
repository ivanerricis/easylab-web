import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard, SettingsEmptyBox, SettingsSection } from "@/components/settings/settingsUi";
import RefreshButton from "@/components/refresh-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SearchInput from "@/components/search-input";
import TablePagination from "@/components/table-pagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import {
    getApiErrorMessage,
    getLogDownloadUrl,
    getLogRetention,
    listLogEntries,
    listLogFiles,
    updateLogRetention,
    type LogEntryDto,
    type LogFileDto,
} from "@/lib/api";
import { cn, formatDate, formatDateTime, formatFileSize } from "@/lib/utils";

const minRetentionDays = 1;
const maxRetentionDays = 90;

const formatDayKey = (dayKey: string) => formatDate(`${dayKey}T00:00:00.000Z`);

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
    const [retentionDays, setRetentionDays] = useState<number | null>(null);
    const [isLoadingRetention, setIsLoadingRetention] = useState(false);
    const [isSavingRetention, setIsSavingRetention] = useState(false);

    const loadRetention = useCallback(async () => {
        setIsLoadingRetention(true);

        try {
            const result = await getLogRetention();
            setRetentionDays(result.maxDays);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare la conservazione dei log"));
        } finally {
            setIsLoadingRetention(false);
        }
    }, []);

    useEffect(() => {
        startTransition(() => {
            void loadRetention();
        });
    }, [loadRetention]);

    const handleSaveRetention = async () => {
        if (retentionDays === null || !Number.isInteger(retentionDays)) {
            return;
        }

        setIsSavingRetention(true);

        try {
            const result = await updateLogRetention(retentionDays);
            setRetentionDays(result.maxDays);
            toast.success("Conservazione log aggiornata");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile salvare la conservazione dei log"));
        } finally {
            setIsSavingRetention(false);
        }
    };

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
        <SettingsSection className="flex h-full min-h-0 flex-col">
            <SettingsCard
                title="Log azioni"
                description="Consulta il registro delle azioni eseguite sull'applicazione, giorno per giorno."
                className="min-h-0 flex-1"
                contentClassName={logFiles.length === 0 ? undefined : "flex min-h-0 flex-1 flex-col gap-3 pt-4"}
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
                                onChange={(event) => setRetentionDays(Number(event.target.value))}
                            />
                            <span className="text-sm whitespace-nowrap text-muted-foreground">giorni</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={
                                    isLoadingRetention ||
                                    isSavingRetention ||
                                    retentionDays === null ||
                                    !Number.isInteger(retentionDays) ||
                                    retentionDays < minRetentionDays ||
                                    retentionDays > maxRetentionDays
                                }
                                onClick={() => void handleSaveRetention()}
                            >
                                {isSavingRetention ? "Salvataggio..." : "Salva"}
                            </Button>
                        </div>
                        <Button type="button" variant="outline" disabled={!selectedDayKey} onClick={handleDownload}>
                            Scarica log selezionato
                        </Button>
                    </>
                }
            >
                {isLoadingFiles && logFiles.length === 0 ? (
                    <SettingsEmptyBox>Caricamento elenco log...</SettingsEmptyBox>
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

                        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-primary/15">
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
                                    {isLoadingEntries ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={6}
                                                className="text-center whitespace-normal text-muted-foreground"
                                            >
                                                Caricamento log...
                                            </TableCell>
                                        </TableRow>
                                    ) : entries.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={6}
                                                className="text-center whitespace-normal text-muted-foreground"
                                            >
                                                Nessuna voce trovata per i criteri selezionati.
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
                                                        entry.status >= 400 && "font-semibold text-destructive"
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
