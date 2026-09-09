import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsEmptyBox, SettingsSection } from "@/components/settings/settingsUi";
import RefreshButton from "@/components/refresh-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SearchInput from "@/components/search-input";
import TablePagination from "@/components/table-pagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import {
    getApiErrorMessage,
    getLogDownloadUrl,
    listLogEntries,
    listLogFiles,
    type LogEntryDto,
    type LogFileDto,
} from "@/lib/api";
import { cn, formatDateTime, formatFileSize } from "@/lib/utils";

const formatDayKey = (dayKey: string) => formatDateTime(`${dayKey}T00:00:00.000Z`).split(",")[0]?.trim() ?? dayKey;

const LogsSettingsPanel = () => {
    const [pageSize, setPageSize] = useTableRowsPerPage("logs");
    const [logFiles, setLogFiles] = useState<LogFileDto[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [selectedDayKey, setSelectedDayKey] = useState<string>("");
    const [entries, setEntries] = useState<LogEntryDto[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoadingEntries, setIsLoadingEntries] = useState(false);
    const [searchText, setSearchText] = useState("");
    const debouncedSearchText = useDebouncedValue(searchText);
    const { currentPage, setCurrentPage } = useTablePagination({
        resetDependencies: [selectedDayKey, debouncedSearchText, pageSize],
    });

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

    const loadEntries = useCallback(async () => {
        if (!selectedDayKey) {
            setEntries([]);
            setTotalItems(0);
            setTotalPages(1);
            return;
        }

        setIsLoadingEntries(true);

        try {
            const result = await listLogEntries(selectedDayKey, {
                page: currentPage,
                pageSize,
                search: debouncedSearchText,
            });
            setEntries(result.items);
            setTotalItems(result.totalItems);
            setTotalPages(result.totalPages);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare il log selezionato"));
        } finally {
            setIsLoadingEntries(false);
        }
    }, [selectedDayKey, currentPage, pageSize, debouncedSearchText]);

    useEffect(() => {
        startTransition(() => {
            void loadLogFiles();
        });
    }, [loadLogFiles]);

    useEffect(() => {
        startTransition(() => {
            void loadEntries();
        });
    }, [loadEntries]);

    const handleDownload = () => {
        if (!selectedDayKey) {
            return;
        }

        window.location.href = getLogDownloadUrl(selectedDayKey);
    };

    const handleRefresh = () => {
        void loadLogFiles();
        void loadEntries();
    };

    return (
        <SettingsSection className="flex h-full min-h-0 flex-col">
            <SettingsCard
                title="Log azioni"
                description="Consulta il registro delle azioni eseguite sull'applicazione, giorno per giorno."
                className="min-h-0 flex-1"
                contentClassName={logFiles.length === 0 ? undefined : "flex min-h-0 flex-1 flex-col gap-3 pt-4"}
                action={
                    <Button type="button" variant="outline" disabled={!selectedDayKey} onClick={handleDownload}>
                        Scarica log selezionato
                    </Button>
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
                                <SelectTrigger className="w-full sm:w-auto sm:min-w-[220px]">
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

                            <RefreshButton
                                size="icon"
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
