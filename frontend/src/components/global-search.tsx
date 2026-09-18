import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandLoading,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getApiErrorMessage, listCustomers, listInterventions, listReports } from "@/lib/api";
import { entityPaths } from "@/lib/entityPaths";
import { formatInterventionStatus, formatInterventionType } from "@/lib/interventions";
import { formatDate, isMacLike, modifierKey } from "@/lib/utils";
import Kbd from "@/components/ui/kbd";
import type { CustomerDto, InterventionDto, ReportDto } from "@/types/dtos";
import {
    BookUser,
    Bug,
    ClipboardList,
    HardHat,
    LayoutDashboard,
    Laptop,
    Search,
    Settings,
    User,
    Users,
    Wrench,
    type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatPersonName } from "@/lib/people";
import { formatReportStatus } from "@/lib/reports";

/** Quanti risultati per gruppo: è una scorciatoia, non un elenco. Per il resto c'è "Vedi tutti". */
const resultsPerGroup = 5;

type SearchResults = {
    /** La ricerca a cui questi risultati rispondono: vedi `isSearching` più sotto. */
    query: string;
    customers: CustomerDto[];
    reports: ReportDto[];
    interventions: InterventionDto[];
};

const pages: { label: string; path: string; icon: LucideIcon }[] = [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Report", path: "/reports", icon: ClipboardList },
    { label: "Interventi", path: "/interventions", icon: HardHat },
    { label: "Clienti", path: "/clients", icon: Users },
    { label: "Collaboratori", path: "/collaborators", icon: BookUser },
    { label: "Tecnici esterni", path: "/technicians", icon: Wrench },
    { label: "Dispositivi", path: "/devices", icon: Laptop },
    { label: "Difetti", path: "/issues", icon: Bug },
    { label: "Impostazioni", path: "/settings", icon: Settings },
];

const normalize = (value: string) =>
    value
        .normalize("NFKD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();

/**
 * Da quando vale la pena chiedere al server: due lettere, oppure un numero di qualunque
 * lunghezza (il numero di un report o di un intervento, che la ricerca confronta esatto).
 */
const isSearchable = (query: string) => query.length >= 2 || /^#?\d+$/.test(query);

const shortcutLabel = `${modifierKey} K`;

const customerName = (customer: CustomerDto) => formatPersonName(customer);

/**
 * La ricerca globale: una casella sola per clienti, report e interventi, più le pagine
 * dell'app. Si apre dal pulsante nell'intestazione o con Ctrl+K (⌘K su Mac).
 *
 * Prima per trovare qualcosa bisognava sapere in quale sezione stava: il report di un
 * cliente si cercava da Report, il cliente da Clienti, e il numero di un report scritto su
 * una ricevuta non si poteva digitare da nessuna parte senza prima scegliere la pagina.
 *
 * I risultati arrivano dalle stesse ricerche delle tre liste (le stesse regole, compreso il
 * numero esatto), tre richieste in parallelo con pochi risultati ciascuna. "Vedi tutti"
 * porta alla lista con la ricerca già scritta, grazie a `?q=` (vedi `useListUrlState`).
 */
const GlobalSearch = () => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const trimmedQuery = useDebouncedValue(query.trim(), 250);
    const [results, setResults] = useState<SearchResults | null>(null);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
                // Ctrl+K nel browser porta alla barra di ricerca: qui la scorciatoia è nostra.
                event.preventDefault();
                setOpen((current) => !current);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const shouldSearch = open && isSearchable(trimmedQuery);

    useEffect(() => {
        if (!shouldSearch) {
            return;
        }

        // Scrivendo, la ricerca precedente è superata: annullarla ferma anche la query sul
        // server, come fanno le liste (vedi `usePaginatedRows`).
        const controller = new AbortController();
        const search = trimmedQuery.replace(/^#/, "");
        const common = { page: 1, pageSize: resultsPerGroup, search, signal: controller.signal };

        void Promise.allSettled([
            listCustomers(common),
            listReports({ ...common, visibility: "all" }),
            listInterventions({ ...common, status: "all" }),
        ]).then(([customers, reports, interventions]) => {
            if (controller.signal.aborted) {
                return;
            }

            // Un gruppo che non risponde non deve svuotare gli altri: si mostra quello che c'è,
            // e si avvisa solo se non è arrivato niente.
            if (
                customers.status === "rejected" &&
                reports.status === "rejected" &&
                interventions.status === "rejected"
            ) {
                toast.error(getApiErrorMessage(customers.reason, "Impossibile completare la ricerca"));
            }

            setResults({
                query: trimmedQuery,
                customers: customers.status === "fulfilled" ? customers.value.items : [],
                reports: reports.status === "fulfilled" ? reports.value.items : [],
                interventions: interventions.status === "fulfilled" ? interventions.value.items : [],
            });
        });

        return () => controller.abort();
    }, [shouldSearch, trimmedQuery]);

    // Sono risultati validi solo quelli della ricerca scritta adesso: così una risposta vecchia
    // non resta a schermo sotto un testo che non c'entra più, e lo stato "sto cercando" non
    // ha bisogno di una variabile a parte.
    const currentResults = shouldSearch && results?.query === trimmedQuery ? results : null;
    const isSearching = shouldSearch && currentResults == null;

    const normalizedQuery = normalize(query.trim());
    const matchingPages =
        normalizedQuery === "" ? pages : pages.filter((page) => normalize(page.label).includes(normalizedQuery));

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);

        if (!nextOpen) {
            setQuery("");
        }
    };

    const go = (path: string) => {
        handleOpenChange(false);
        navigate(path);
    };

    const searchParam = encodeURIComponent(trimmedQuery.replace(/^#/, ""));
    const hasAnyResult =
        currentResults != null &&
        currentResults.customers.length + currentResults.reports.length + currentResults.interventions.length > 0;

    return (
        <>
            <Button
                variant="outline"
                size="icon-lg"
                className="sm:w-auto sm:justify-start sm:gap-2 sm:px-3 sm:text-muted-foreground"
                onClick={() => setOpen(true)}
                aria-label="Cerca clienti, report e interventi"
                aria-keyshortcuts={isMacLike ? "Meta+K" : "Control+K"}
            >
                <Search className="size-5" />
                <span className="hidden sm:inline">Cerca…</span>
                <Kbd className="hidden py-0 sm:inline">{shortcutLabel}</Kbd>
            </Button>

            <CommandDialog
                open={open}
                onOpenChange={handleOpenChange}
                title="Ricerca"
                description="Cerca clienti, report e interventi, o vai a una pagina."
                className="sm:max-w-xl"
            >
                {/* Il filtro di cmdk resta spento: i risultati li sceglie già il server, e
                    filtrarli di nuovo qui nasconderebbe quelli trovati per numero o telefono. */}
                <Command shouldFilter={false} loop label="Ricerca globale">
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Cliente, telefono, numero di report…"
                    />
                    <CommandList>
                        {isSearching ? <CommandLoading>Ricerca in corso…</CommandLoading> : null}

                        {!isSearching && matchingPages.length === 0 && !hasAnyResult ? (
                            <CommandEmpty>
                                {isSearchable(trimmedQuery)
                                    ? `Nessun risultato per "${trimmedQuery}".`
                                    : "Scrivi almeno due lettere, o un numero."}
                            </CommandEmpty>
                        ) : null}

                        {currentResults && currentResults.customers.length > 0 ? (
                            <CommandGroup heading="Clienti">
                                {currentResults.customers.map((customer) => (
                                    <CommandItem
                                        key={customer.id}
                                        value={`customer-${customer.id}`}
                                        onSelect={() => go(entityPaths.customer(customer.id))}
                                    >
                                        <User />
                                        <span className="truncate">{customerName(customer)}</span>
                                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                            {customer.phoneNumber ?? customer.phoneNumberSecondary ?? ""}
                                        </span>
                                    </CommandItem>
                                ))}
                                <CommandItem
                                    value="customers-all"
                                    onSelect={() => go(`/clients?q=${searchParam}`)}
                                    className="text-primary"
                                >
                                    <Search className="text-primary" />
                                    Vedi tutti i clienti trovati
                                </CommandItem>
                            </CommandGroup>
                        ) : null}

                        {currentResults && currentResults.reports.length > 0 ? (
                            <CommandGroup heading="Report">
                                {currentResults.reports.map((report) => (
                                    <CommandItem
                                        key={report.id}
                                        value={`report-${report.id}`}
                                        onSelect={() => go(entityPaths.report(report.id))}
                                    >
                                        <ClipboardList />
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate">
                                                <span className="font-medium tabular-nums">#{report.id}</span> ·{" "}
                                                {report.customer}
                                            </span>
                                            <span className="truncate text-xs text-muted-foreground">
                                                {report.device} · {report.issue}
                                            </span>
                                        </div>
                                        <CommandShortcut className="tracking-normal">
                                            {formatReportStatus(report.closed)}
                                        </CommandShortcut>
                                    </CommandItem>
                                ))}
                                <CommandItem
                                    value="reports-all"
                                    onSelect={() => go(`/reports?visibility=all&q=${searchParam}`)}
                                    className="text-primary"
                                >
                                    <Search className="text-primary" />
                                    Vedi tutti i report trovati
                                </CommandItem>
                            </CommandGroup>
                        ) : null}

                        {currentResults && currentResults.interventions.length > 0 ? (
                            <CommandGroup heading="Interventi">
                                {currentResults.interventions.map((intervention) => (
                                    <CommandItem
                                        key={intervention.id}
                                        value={`intervention-${intervention.id}`}
                                        onSelect={() => go(entityPaths.intervention(intervention.id))}
                                    >
                                        <HardHat />
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate">
                                                <span className="font-medium tabular-nums">#{intervention.id}</span> ·{" "}
                                                {intervention.customer}
                                            </span>
                                            <span className="truncate text-xs text-muted-foreground">
                                                {formatInterventionType(intervention.type)}
                                                {intervention.interventionDate
                                                    ? ` · ${formatDate(intervention.interventionDate)}`
                                                    : ""}
                                            </span>
                                        </div>
                                        <CommandShortcut className="tracking-normal">
                                            {formatInterventionStatus(intervention.status)}
                                        </CommandShortcut>
                                    </CommandItem>
                                ))}
                                <CommandItem
                                    value="interventions-all"
                                    onSelect={() => go(`/interventions?q=${searchParam}`)}
                                    className="text-primary"
                                >
                                    <Search className="text-primary" />
                                    Vedi tutti gli interventi trovati
                                </CommandItem>
                            </CommandGroup>
                        ) : null}

                        {matchingPages.length > 0 ? (
                            <>
                                {hasAnyResult ? <CommandSeparator /> : null}
                                <CommandGroup heading="Vai a">
                                    {matchingPages.map((page) => (
                                        <CommandItem
                                            key={page.path}
                                            value={`page-${page.path}`}
                                            onSelect={() => go(page.path)}
                                        >
                                            <page.icon />
                                            {page.label}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </>
                        ) : null}
                    </CommandList>
                </Command>
            </CommandDialog>
        </>
    );
};

export default GlobalSearch;
