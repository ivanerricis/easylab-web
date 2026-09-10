import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

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
    onSearch?: (query: string) => Promise<string[]>;
    onCreate?: (value: string) => Promise<void> | void;
    required?: boolean;
    inputClassName?: string;
    /**
     * Col campo vuoto, al focus srotola l'intero elenco di `options` invece di aspettare che
     * si digiti. Pensato per i cataloghi corti (i difetti) in cui scorrere è più rapido che
     * indovinare la parola giusta; non ha effetto con `onSearch`, dove l'elenco sta sul server.
     */
    showAllOnFocus?: boolean;
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
        if (!onSearch) {
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

        const runSearch = async () => {
            const results = await onSearch(query);

            if (!isCancelled) {
                setSearchResults(results);
            }
        };

        void runSearch();

        return () => {
            isCancelled = true;
        };
    }, [onSearch, debouncedValue]);

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
                className={cn("group h-full text-lg!", inputClassName)}
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
                <div className="absolute z-10 mt-2 w-full rounded-md border bg-background shadow-sm">
                    <div className="max-h-48 overflow-auto">
                        {filteredOptions.map((option) => (
                            <Button
                                key={option}
                                type="button"
                                variant="ghost"
                                size={"lg"}
                                className="w-full justify-start rounded-sm"
                                onMouseDown={() => {
                                    onChange(option);
                                    setIsOpen(false);
                                }}
                            >
                                {option}
                            </Button>
                        ))}
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
                            {isCreating
                                ? "Creazione..."
                                : onCreate
                                  ? `Crea "${value.trim()}"`
                                  : `Usa "${value.trim()}"`}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export default InputWithAdd;
