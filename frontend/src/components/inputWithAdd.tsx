import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/**
 * Le voci dei clienti arrivano come "Nome Cognome - telefono" (`formatCustomerOption`): una
 * stringa sola, che è anche la chiave con cui il dialogo ritrova l'id. Andando a capo come testo
 * normale il numero si spezzava a metà ("+39 343" / "8880123"). Qui la si divide solo per
 * mostrarla, sull'ultimo " - " (il telefono viene per ultimo): il nome sopra, il telefono sotto,
 * grigio e mai spezzato. Il valore scelto resta la stringa intera.
 */
const splitCustomerOption = (option: string): { name: string; phone: string | null } => {
    const separatorIndex = option.lastIndexOf(" - ");

    return separatorIndex === -1
        ? { name: option, phone: null }
        : { name: option.slice(0, separatorIndex), phone: option.slice(separatorIndex + 3) };
};

type Props = Readonly<{
    id: string;
    /** Segnala il campo come invalido: accende il bordo rosso che `Input` ha già. */
    "aria-invalid"?: boolean;
    /** L'id del paragrafo d'errore, così lo screen reader lo legge insieme al campo. */
    "aria-describedby"?: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    options?: string[];
    /**
     * `signal` va inoltrato alla richiesta (per esempio `listCustomers({ ..., signal })`): è
     * quello che annulla per davvero la ricerca superata invece di limitarsi a scartarne la
     * risposta, come fa `usePaginatedRows`.
     */
    onSearch?: (query: string, signal: AbortSignal) => Promise<string[]>;
    onCreate?: (value: string) => Promise<void> | void;
    required?: boolean;
    inputClassName?: string;
    /**
     * Col campo vuoto, al focus srotola l'intero elenco di `options` invece di aspettare che
     * si digiti. Pensato per i cataloghi corti (i difetti) in cui scorrere è più rapido che
     * indovinare la parola giusta; non ha effetto con `onSearch`, dove l'elenco sta sul server.
     */
    showAllOnFocus?: boolean;
    /**
     * `value` è già un'opzione scelta (dai suggerimenti, da un dialogo di creazione, o
     * precompilata all'apertura) e non testo ancora da cercare: `onSearch` non parte.
     *
     * Senza, scegliere un suggerimento cliente faceva comunque partire — dopo 250ms di debounce
     * — una ricerca inutile con l'intera etichetta scelta ("Mario Rossi - 333...") come testo;
     * la stessa ricerca a vuoto ripartiva anche aprendo il dialogo con un cliente già compilato.
     */
    isSelectedOption?: boolean;
}>;

const InputWithAdd = ({
    id,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
    placeholder,
    value,
    onChange,
    options = [],
    onSearch,
    onCreate,
    required,
    inputClassName,
    showAllOnFocus = false,
    isSelectedOption = false,
}: Props) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [searchResults, setSearchResults] = useState<string[]>([]);
    const debouncedValue = useDebouncedValue(value, 250);

    const normalizedValue = value.trim().toLowerCase();
    /**
     * I suggerimenti partono solo da quando si digita: aprendo un dialogo il campo è vuoto e
     * un elenco già srotolato coprirebbe il resto del modulo senza aver filtrato nulla. Fa
     * eccezione `showAllOnFocus`, dove l'elenco intero è proprio ciò che si vuole vedere.
     */
    const hasQuery = normalizedValue.length > 0;
    const showsFullList = showAllOnFocus && !onSearch && !hasQuery;

    useEffect(() => {
        // Niente ricerca se `value` è già un'opzione scelta: è testo da mostrare, non da
        // cercare. Senza, ogni selezione faceva ripartire una ricerca col proprio stesso
        // risultato appena scelto.
        if (!onSearch || isSelectedOption) {
            return;
        }

        const query = debouncedValue.trim();

        // Niente query, niente chiamata: evita anche la ricerca "a vuoto" all'apertura.
        // I risultati precedenti restano in stato ma non si vedono: `filteredOptions` li scarta
        // finche' il campo e' vuoto.
        if (query.length === 0) {
            return;
        }

        let isCancelled = false;
        const controller = new AbortController();

        const runSearch = async () => {
            try {
                const results = await onSearch(query, controller.signal);

                if (!isCancelled) {
                    setSearchResults(results);
                }
            } catch {
                // La ricerca annullata (superata da una più recente, o smontato il campo)
                // finisce qui: non c'è altro da fare, il risultato non serve più a nessuno.
            }
        };

        void runSearch();

        return () => {
            isCancelled = true;
            controller.abort();
        };
    }, [onSearch, debouncedValue, isSelectedOption]);

    const filteredOptions = useMemo(() => {
        if (showsFullList) {
            return options;
        }

        if (!hasQuery) {
            return [];
        }

        if (onSearch) {
            return searchResults;
        }

        return options.filter((option) => option.toLowerCase().includes(normalizedValue)).slice(0, 8);
    }, [showsFullList, hasQuery, onSearch, searchResults, normalizedValue, options]);

    const hasExactMatch = useMemo(() => {
        if (!normalizedValue) {
            return false;
        }

        return options.some((option) => option.toLowerCase() === normalizedValue);
    }, [normalizedValue, options]);

    const canCreate = !onSearch && hasQuery && !hasExactMatch;
    const hasSuggestions = filteredOptions.length > 0 || canCreate;

    const handleCreate = async () => {
        const trimmed = value.trim();
        if (!trimmed) {
            return;
        }

        if (!onCreate) {
            setIsOpen(false);
            return;
        }

        try {
            setIsCreating(true);
            await onCreate(trimmed);
            onChange(trimmed);
            setIsOpen(false);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="relative w-full">
            <Input
                // 40px fissi come il "+" accanto (`icon-lg`), non `h-full`: su telefono la lista
                // sta nel flusso sotto il campo, e con `h-full` il campo si allungava con lei.
                className={cn("group h-10", inputClassName)}
                id={id}
                aria-invalid={ariaInvalid}
                aria-describedby={ariaDescribedBy}
                placeholder={placeholder}
                value={value}
                onFocus={() => setIsOpen(true)}
                onBlur={() => {
                    setTimeout(() => setIsOpen(false), 100);
                }}
                onChange={(event) => {
                    onChange(event.target.value);
                    setIsOpen(true);
                }}
                required={required}
            />

            {isOpen && hasSuggestions ? (
                // Sotto `sm` la lista sta nel flusso invece che sovrapposta: nei dialoghi il campo
                // è dentro un'area che scorre, e una lista `absolute` veniva tagliata dal bordo di
                // quell'area (su telefono si vedevano due voci e mezza). Nel flusso spinge in giù
                // i campi sotto, e l'area scorre per mostrarla tutta. Da `sm` il dialogo è largo
                // e alto abbastanza, e la lista torna sovrapposta come prima.
                <div className="mt-1 w-full rounded-md border bg-card shadow-sm sm:absolute sm:z-10 sm:mt-2">
                    <div className="max-h-48 overflow-auto">
                        {filteredOptions.map((option) => {
                            // Solo le voci dei clienti (quelle che arrivano da `onSearch`) hanno il
                            // telefono in coda: dispositivi e difetti restano come sono, anche se
                            // contengono un trattino.
                            const { name, phone } = onSearch
                                ? splitCustomerOption(option)
                                : { name: option, phone: null };

                            return (
                                <Button
                                    key={option}
                                    type="button"
                                    variant="ghost"
                                    size={"lg"}
                                    // `whitespace-normal` e altezza libera: "Nome Cognome - telefono"
                                    // è più largo di un campo su telefono, e senza andare a capo il
                                    // numero finiva tagliato. Una voce lunga ora occupa due righe.
                                    className="h-auto min-h-10 w-full justify-start rounded-sm py-2 text-left whitespace-normal"
                                    // Il nome accessibile resta la voce intera, con il trattino:
                                    // i due pezzi in colonna letti di fila sarebbero "Nome333".
                                    aria-label={phone == null ? undefined : option}
                                    onMouseDown={() => {
                                        onChange(option);
                                        setIsOpen(false);
                                    }}
                                >
                                    {phone == null ? (
                                        option
                                    ) : (
                                        <span className="flex min-w-0 flex-col">
                                            <span>{name}</span>
                                            <span className="text-sm whitespace-nowrap text-muted-foreground">
                                                {phone}
                                            </span>
                                        </span>
                                    )}
                                </Button>
                            );
                        })}
                    </div>

                    {canCreate ? (
                        <Button
                            type="button"
                            size="lg"
                            className="w-full rounded-sm"
                            onMouseDown={() => {
                                void handleCreate();
                            }}
                            disabled={isCreating}
                        >
                            <Plus className="size-5" />
                            {/* `canCreate` è vero solo senza `onSearch`, e i due usi senza
                                `onSearch` (dispositivi, difetti) passano sempre `onCreate`:
                                non c'è un chiamante che arrivi qui senza. Il ramo "Usa ..."
                                per quel caso non serviva a niente. `onCreate` resta comunque
                                facoltativo nel tipo, e `handleCreate` lo ricontrolla prima di
                                chiamarlo, a difesa di un chiamante futuro che lo dimentichi. */}
                            {isCreating ? "Creazione..." : `Crea "${value.trim()}"`}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export default InputWithAdd;
