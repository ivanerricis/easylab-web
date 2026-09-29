import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { buttonVariants } from "./ui/button";
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

/** Le voci della lista, nell'ordine in cui le frecce le percorrono: "Crea …" viene per ultima. */
type ListItem = { kind: "option"; value: string } | { kind: "create" };

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

/**
 * Campo con suggerimenti secondo lo schema WAI-ARIA "combobox" con lista a comparsa.
 *
 * Il focus resta sempre sul campo: la voce "attiva" delle frecce è indicata con
 * `aria-activedescendant`, non spostando il focus sulle voci. Prima i suggerimenti erano
 * pulsanti che rispondevano solo a `onMouseDown`: da tastiera non si raggiungevano (Tab faceva
 * perdere il focus e la lista spariva), e Invio inviava l'intero modulo del dialogo.
 */
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
    /** Indice in `items` della voce evidenziata dalle frecce; -1 = nessuna. */
    const [activeIndex, setActiveIndex] = useState(-1);
    const debouncedValue = useDebouncedValue(value, 250);
    const inputRef = useRef<HTMLInputElement>(null);
    /**
     * Rimettere il focus sul campo dopo una scelta (vedi `returnFocusToInput`) non deve
     * riaprire la lista appena chiusa: `onFocus` la aprirebbe di nuovo.
     */
    const skipOpenOnFocusRef = useRef(false);

    const listboxId = `${id}-suggerimenti`;
    const optionId = (index: number) => `${id}-suggerimento-${index}`;

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
                    // Arrivano voci nuove: l'indice evidenziato si riferiva alle vecchie.
                    setActiveIndex(-1);
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

    const items = useMemo<ListItem[]>(
        () => [
            ...filteredOptions.map((option): ListItem => ({ kind: "option", value: option })),
            ...(canCreate ? [{ kind: "create" } as const] : []),
        ],
        [filteredOptions, canCreate]
    );

    const isListVisible = isOpen && items.length > 0;
    // Un indice rimasto da una lista più lunga (le voci cambiano a ogni tasto) non vale più.
    const currentIndex = isListVisible && activeIndex < items.length ? activeIndex : -1;

    /**
     * Esc a lista aperta deve chiudere solo la lista, non il dialogo. Radix ascolta Esc su
     * `document` in fase di cattura, cioè prima di qualunque `onKeyDown` di React: fermarlo lì
     * sarebbe troppo tardi. Lo si intercetta allora su `window`, che in cattura viene ancora
     * prima di `document`, e solo finché la lista è aperta e il tasto parte da questo campo: a
     * lista chiusa l'ascoltatore non c'è più, e il secondo Esc arriva al dialogo come sempre.
     */
    useEffect(() => {
        if (!isListVisible) {
            return;
        }

        const handleEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Escape" || event.target !== inputRef.current) {
                return;
            }

            event.stopPropagation();
            event.preventDefault();
            setIsOpen(false);
            setActiveIndex(-1);
        };

        window.addEventListener("keydown", handleEscape, { capture: true });
        return () => window.removeEventListener("keydown", handleEscape, { capture: true });
    }, [isListVisible]);

    // La voce evidenziata dalle frecce resta visibile anche quando la lista scorre.
    useEffect(() => {
        if (currentIndex === -1) {
            return;
        }

        // `?.`: jsdom non implementa `scrollIntoView`.
        document.getElementById(`${id}-suggerimento-${currentIndex}`)?.scrollIntoView?.({ block: "nearest" });
    }, [id, currentIndex]);

    const closeList = () => {
        setIsOpen(false);
        setActiveIndex(-1);
    };

    /**
     * Di norma il focus non lascia mai il campo (le voci trattengono il `mousedown`). Se però un
     * browser da telefono lo sposta comunque sulla lista prima del tocco, lo si riporta sul
     * campo: altrimenti, sparita la lista, il focus resterebbe sul nulla.
     */
    const returnFocusToInput = () => {
        if (inputRef.current && document.activeElement !== inputRef.current) {
            skipOpenOnFocusRef.current = true;
            inputRef.current.focus();
        }
    };

    const selectOption = (option: string) => {
        onChange(option);
        closeList();
        returnFocusToInput();
    };

    const handleCreate = async () => {
        const trimmed = value.trim();
        if (!trimmed || isCreating) {
            return;
        }

        if (!onCreate) {
            closeList();
            return;
        }

        try {
            setIsCreating(true);
            await onCreate(trimmed);
            onChange(trimmed);
            closeList();
            returnFocusToInput();
        } finally {
            setIsCreating(false);
        }
    };

    const chooseItem = (item: ListItem) => {
        if (item.kind === "create") {
            void handleCreate();
        } else {
            selectOption(item.value);
        }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            // Le frecce aprono anche la lista chiusa (dopo Esc, o dopo una scelta): è il modo
            // da tastiera di rivedere i suggerimenti senza cancellare il testo.
            event.preventDefault();
            setIsOpen(true);

            if (items.length === 0) {
                return;
            }

            const step = event.key === "ArrowDown" ? 1 : -1;
            // Senza voce attiva, giù parte dalla prima e su dall'ultima; poi si gira in tondo.
            const nextIndex =
                currentIndex === -1
                    ? step === 1
                        ? 0
                        : items.length - 1
                    : (currentIndex + step + items.length) % items.length;
            setActiveIndex(nextIndex);
            return;
        }

        // Invio sceglie solo se c'è una voce evidenziata: altrimenti non si trattiene, e invia
        // il modulo del dialogo come in qualunque altro campo.
        // Durante una composizione (tastiere IME) Invio conferma i caratteri, non la voce.
        if (event.key === "Enter" && currentIndex !== -1 && !event.nativeEvent.isComposing) {
            event.preventDefault();
            chooseItem(items[currentIndex]);
        }
    };

    const resultCount = filteredOptions.length;
    // Detto una volta dallo screen reader quando la lista cambia, senza togliere il focus.
    const announcement = !isListVisible
        ? ""
        : resultCount === 0
          ? "Nessun suggerimento"
          : resultCount === 1
            ? "1 suggerimento"
            : `${resultCount} suggerimenti`;

    const renderOption = (option: string, index: number) => {
        // Solo le voci dei clienti (quelle che arrivano da `onSearch`) hanno il telefono in
        // coda: dispositivi e difetti restano come sono, anche se contengono un trattino.
        const { name, phone } = onSearch ? splitCustomerOption(option) : { name: option, phone: null };
        const isActive = index === currentIndex;

        return (
            <div
                key={option}
                id={optionId(index)}
                role="option"
                aria-selected={isActive}
                // Il nome accessibile resta la voce intera, con il trattino: i due pezzi in
                // colonna letti di fila sarebbero "Nome333".
                aria-label={phone == null ? undefined : option}
                // `whitespace-normal` e altezza libera: "Nome Cognome - telefono" è più largo di
                // un campo su telefono, e senza andare a capo il numero finiva tagliato. Una voce
                // lunga ora occupa due righe.
                className={cn(
                    buttonVariants({ variant: "ghost", size: "lg" }),
                    "h-auto min-h-10 w-full justify-start rounded-sm py-2 text-left whitespace-normal pointer-coarse:min-h-11",
                    isActive && "bg-muted text-foreground"
                )}
                onClick={() => selectOption(option)}
            >
                {phone == null ? (
                    option
                ) : (
                    <span className="flex min-w-0 flex-col">
                        <span>{name}</span>
                        <span className="text-sm whitespace-nowrap text-muted-foreground">{phone}</span>
                    </span>
                )}
            </div>
        );
    };

    const createIndex = filteredOptions.length;
    const isCreateActive = canCreate && currentIndex === createIndex;

    return (
        <div
            className="relative w-full"
            // La lista si chiude appena il focus esce dal gruppo campo + lista, senza più il
            // `setTimeout` di 100ms che serviva solo a lasciar arrivare il `mousedown` sulla voce
            // prima di smontarla. Il focus che passa dal campo alla lista (vedi
            // `returnFocusToInput`) resta dentro, e la lista resta aperta.
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    closeList();
                }
            }}
        >
            <Input
                ref={inputRef}
                // Alto fisso come il "+" accanto (`icon-lg`: 40px, 44 su schermo touch), non
                // `h-full`: su telefono la lista sta nel flusso sotto il campo, e con `h-full` il
                // campo si allungava con lei.
                className={cn("group h-10 pointer-coarse:h-11", inputClassName)}
                id={id}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isListVisible}
                aria-controls={isListVisible ? listboxId : undefined}
                aria-activedescendant={currentIndex === -1 ? undefined : optionId(currentIndex)}
                aria-invalid={ariaInvalid}
                aria-describedby={ariaDescribedBy}
                placeholder={placeholder}
                value={value}
                onFocus={() => {
                    if (skipOpenOnFocusRef.current) {
                        skipOpenOnFocusRef.current = false;
                        return;
                    }
                    setIsOpen(true);
                }}
                onKeyDown={handleKeyDown}
                onChange={(event) => {
                    onChange(event.target.value);
                    setIsOpen(true);
                    // Il testo cambia, le voci pure: l'evidenziazione riparte da capo.
                    setActiveIndex(-1);
                }}
                required={required}
            />

            <span className="sr-only" aria-live="polite">
                {announcement}
            </span>

            {isListVisible ? (
                // Sotto `sm` la lista sta nel flusso invece che sovrapposta: nei dialoghi il campo
                // è dentro un'area che scorre, e una lista `absolute` veniva tagliata dal bordo di
                // quell'area (su telefono si vedevano due voci e mezza). Nel flusso spinge in giù
                // i campi sotto, e l'area scorre per mostrarla tutta. Da `sm` il dialogo è largo
                // e alto abbastanza, e la lista torna sovrapposta come prima.
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label="Suggerimenti"
                    // Fuori dall'ordine di Tab: serve solo da rete per il focus spostato dal tocco
                    // su telefono (vedi l'`onBlur` del contenitore).
                    tabIndex={-1}
                    className="mt-1 w-full rounded-md border bg-card shadow-sm outline-none sm:absolute sm:z-10 sm:mt-2"
                    // Trattiene il focus sul campo: senza, il `mousedown` su una voce lo toglieva
                    // al campo e la lista si chiudeva prima del `click` che sceglie. Il `click`
                    // (e non il `mousedown`) è quello che anche il tocco su telefono genera.
                    onMouseDown={(event) => event.preventDefault()}
                >
                    <div className="max-h-48 overflow-auto">{filteredOptions.map(renderOption)}</div>

                    {canCreate ? (
                        <div
                            id={optionId(createIndex)}
                            role="option"
                            aria-selected={isCreateActive}
                            aria-disabled={isCreating || undefined}
                            className={cn(
                                buttonVariants({ size: "lg" }),
                                "w-full rounded-sm",
                                isCreateActive && "bg-primary/80 ring-2 ring-focus-ring ring-inset",
                                isCreating && "pointer-events-none opacity-50"
                            )}
                            onClick={() => {
                                void handleCreate();
                            }}
                        >
                            <Plus className="size-5" />
                            {/* `canCreate` è vero solo senza `onSearch`, e i due usi senza
                                `onSearch` (dispositivi, difetti) passano sempre `onCreate`:
                                non c'è un chiamante che arrivi qui senza. Il ramo "Usa ..."
                                per quel caso non serviva a niente. `onCreate` resta comunque
                                facoltativo nel tipo, e `handleCreate` lo ricontrolla prima di
                                chiamarlo, a difesa di un chiamante futuro che lo dimentichi. */}
                            {isCreating ? "Creazione..." : `Crea "${value.trim()}"`}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export default InputWithAdd;
