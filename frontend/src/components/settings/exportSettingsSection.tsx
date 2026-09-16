import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import DateRangeFilter from "@/components/filters/date-range-filter";
import { SettingsCard, SettingsGroup, SettingsSection } from "@/components/settings/settingsUi";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    getCustomersExportUrl,
    getInterventionsExportUrl,
    getReportsExportUrl,
    type InterventionExportParams,
    type ReportExportParams,
} from "@/lib/api";
import { interventionStatusOptions, interventionTypeOptions } from "@/lib/interventions";

/**
 * Esportazione CSV di clienti, report e interventi.
 *
 * I primi due pulsanti stavano nell'intestazione delle pagine Clienti e Report ed esportavano
 * "quello che c'è a schermo", cioè i filtri attivi in quel momento. Sono stati spostati qui
 * perché scaricare l'archivio è un'operazione sui dati, non una delle azioni quotidiane di
 * quelle pagine, che intanto si erano riempite di pulsanti. Il filtro non si è perso nel
 * trasloco: è diventato esplicito qui dentro, ed è ridotto a quello che serve a un'esportazione
 * (periodo, stato, tipo); la ricerca libera, che filtrava anche l'export, non ha senso in un
 * file da archiviare.
 */

/** Gli stessi valori accettati dalle rotte di export, non una copia scritta a mano. */
type ReportVisibility = NonNullable<ReportExportParams["visibility"]>;
type InterventionStatusFilter = NonNullable<InterventionExportParams["status"]>;
type InterventionTypeFilter = NonNullable<InterventionExportParams["type"]>;

const reportVisibilityOptions: { value: ReportVisibility; label: string }[] = [
    { value: "all", label: "Tutti" },
    { value: "open", label: "Solo aperti" },
    { value: "closed", label: "Solo chiusi" },
];

// "all" davanti alle opzioni già usate dall'elenco interventi: le etichette dei tre stati e dei
// tre tipi restano scritte una volta sola, in `lib/interventions.ts`.
const interventionStatusFilterOptions: { value: InterventionStatusFilter; label: string }[] = [
    { value: "all", label: "Tutti" },
    ...interventionStatusOptions,
];

const interventionTypeFilterOptions: { value: InterventionTypeFilter; label: string }[] = [
    { value: "all", label: "Tutti" },
    ...interventionTypeOptions,
];

const ExportFilterSelect = <TValue extends string>({
    id,
    label,
    value,
    options,
    onValueChange,
}: {
    id: string;
    label: string;
    value: TValue;
    options: { value: TValue; label: string }[];
    onValueChange: (value: TValue) => void;
}) => (
    <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Select value={value} onValueChange={(next) => onValueChange(next as TValue)}>
            <SelectTrigger id={id} className="w-full">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    </div>
);

const ExportDateRange = ({
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange,
}: {
    dateFrom: string | undefined;
    dateTo: string | undefined;
    onDateFromChange: (value: string | undefined) => void;
    onDateToChange: (value: string | undefined) => void;
}) => (
    <div className="grid gap-2">
        <Label>Periodo</Label>
        <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter
                dateFrom={dateFrom}
                onDateFromChange={onDateFromChange}
                dateTo={dateTo}
                onDateToChange={onDateToChange}
            />
        </div>
    </div>
);

const ExportButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <Button type="button" variant="outline" onClick={onClick}>
        <Download className="size-4" />
        {label}
    </Button>
);

const ExportFilters = ({ children }: { children: ReactNode }) => (
    <SettingsGroup title="Cosa esportare" description="Senza filtri esce l'archivio intero, in un file solo.">
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-3">{children}</div>
    </SettingsGroup>
);

const ExportSettingsSection = () => {
    const [reportVisibility, setReportVisibility] = useState<ReportVisibility>("all");
    const [reportDateFrom, setReportDateFrom] = useState<string | undefined>(undefined);
    const [reportDateTo, setReportDateTo] = useState<string | undefined>(undefined);

    const [interventionStatus, setInterventionStatus] = useState<InterventionStatusFilter>("all");
    const [interventionType, setInterventionType] = useState<InterventionTypeFilter>("all");
    const [interventionDateFrom, setInterventionDateFrom] = useState<string | undefined>(undefined);
    const [interventionDateTo, setInterventionDateTo] = useState<string | undefined>(undefined);

    // Un download, non una chiamata XHR: il file lo serve il browser con il nome che arriva
    // dall'header `Content-Disposition`, e la sessione viaggia nel cookie come in ogni altra
    // richiesta. È lo stesso meccanismo delle stampe PDF.
    const download = (url: string) => {
        window.location.href = url;
    };

    return (
        <SettingsSection>
            <SettingsCard
                title="Clienti"
                description="L'anagrafica completa in un file CSV."
                action={<ExportButton label="Esporta clienti" onClick={() => download(getCustomersExportUrl())} />}
            >
                <p className="text-sm text-muted-foreground">
                    Una riga per cliente con id, nome, cognome, email, i due numeri di telefono, città e data di
                    creazione. Il file è in UTF-8 con il segnabyte in testa, così Excel su Windows apre gli accenti
                    senza sbagliarli.
                </p>
            </SettingsCard>

            <SettingsCard
                title="Report"
                description="Tutti i report, o solo quelli di un periodo."
                action={
                    <ExportButton
                        label="Esporta report"
                        onClick={() =>
                            download(
                                getReportsExportUrl({
                                    visibility: reportVisibility,
                                    dateFrom: reportDateFrom,
                                    dateTo: reportDateTo,
                                })
                            )
                        }
                    />
                }
            >
                <ExportFilters>
                    <ExportFilterSelect
                        id="export-reports-visibility"
                        label="Stato"
                        value={reportVisibility}
                        options={reportVisibilityOptions}
                        onValueChange={setReportVisibility}
                    />
                    <ExportDateRange
                        dateFrom={reportDateFrom}
                        dateTo={reportDateTo}
                        onDateFromChange={setReportDateFrom}
                        onDateToChange={setReportDateTo}
                    />
                </ExportFilters>

                <p className="text-sm text-muted-foreground">
                    Una riga per report con cliente e telefono, dispositivo, difetto, descrizione del problema e
                    dell'intervento, prezzi, metodo di pagamento, stato e date.
                </p>
            </SettingsCard>

            <SettingsCard
                title="Interventi"
                description="Consegne, interventi in sede e da remoto."
                action={
                    <ExportButton
                        label="Esporta interventi"
                        onClick={() =>
                            download(
                                getInterventionsExportUrl({
                                    status: interventionStatus,
                                    type: interventionType,
                                    dateFrom: interventionDateFrom,
                                    dateTo: interventionDateTo,
                                })
                            )
                        }
                    />
                }
            >
                <ExportFilters>
                    <ExportFilterSelect
                        id="export-interventions-status"
                        label="Stato"
                        value={interventionStatus}
                        options={interventionStatusFilterOptions}
                        onValueChange={setInterventionStatus}
                    />
                    <ExportFilterSelect
                        id="export-interventions-type"
                        label="Tipo"
                        value={interventionType}
                        options={interventionTypeFilterOptions}
                        onValueChange={setInterventionType}
                    />
                    <ExportDateRange
                        dateFrom={interventionDateFrom}
                        dateTo={interventionDateTo}
                        onDateFromChange={setInterventionDateFrom}
                        onDateToChange={setInterventionDateTo}
                    />
                </ExportFilters>

                <p className="text-sm text-muted-foreground">
                    Una riga per intervento con cliente e telefono, collaboratore, tipo, stato, data e orari,
                    descrizione, prezzo e data di creazione. Il periodo filtra la data di creazione, come nell'elenco
                    interventi.
                </p>
            </SettingsCard>
        </SettingsSection>
    );
};

export default ExportSettingsSection;
