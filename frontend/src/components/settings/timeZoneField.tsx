import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Selettore del fuso orario: tutti i nomi IANA che conosce il browser, cercabili.
 *
 * Prima era un `<input list>` con un `<datalist>` che conteneva gli stessi ~420 fusi, ma il
 * browser mostra solo i suggerimenti che combaciano con il testo già nel campo: con
 * "Europe/Rome" dentro ne compariva uno, e l'elenco sembrava avere una voce sola. Qui la
 * ricerca è separata dal valore, quindi aprendo si vedono tutti.
 */

/** I fusi noti al browser. Il `try` copre i browser senza `supportedValuesOf` (Safari < 15.4):
 * lì resta almeno il valore già impostato, che l'utente non deve perdere aprendo l'elenco. */
const supportedTimeZones = (fallback: string): string[] => {
    try {
        const zones = Intl.supportedValuesOf("timeZone");
        return zones.length > 0 ? zones : [fallback].filter(Boolean);
    } catch {
        return [fallback].filter(Boolean);
    }
};

/**
 * "GMT+2" accanto a ogni voce: senza, l'elenco è una colonna di nomi che non dicono l'ora.
 * Il risultato è in cache perché l'elenco è lungo e un `Intl.DateTimeFormat` per riga a ogni
 * battuta della ricerca si sente; cambia due volte l'anno con l'ora legale, e la pagina nel
 * frattempo viene ricaricata.
 */
const offsetCache = new Map<string, string>();

const offsetLabel = (timeZone: string): string => {
    const cached = offsetCache.get(timeZone);
    if (cached) {
        return cached;
    }

    let label: string;
    try {
        label =
            new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
                .formatToParts(new Date())
                .find((part) => part.type === "timeZoneName")?.value ?? "";
    } catch {
        // Un fuso che il browser non conosce (per esempio quello salvato da una versione più
        // vecchia del catalogo IANA): resta senza scostamento, non senza riga.
        label = "";
    }

    offsetCache.set(timeZone, label);
    return label;
};

/** "America/Argentina/Buenos_Aires" si cerca anche scrivendo "buenos aires". */
const searchableText = (timeZone: string) => timeZone.toLowerCase().replace(/[_/]/g, " ");

type Props = {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    /** Mostrato nel pulsante quando non c'è ancora un fuso scelto. */
    placeholder?: string;
};

const TimeZoneField = ({ id, value, onValueChange, placeholder = "Scegli un fuso orario", ...aria }: Props) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");

    const timeZones = useMemo(() => supportedTimeZones(value), [value]);
    const matches = useMemo(() => {
        const needle = searchableText(query.trim());
        if (!needle) {
            return timeZones;
        }

        return timeZones.filter((timeZone) => searchableText(timeZone).includes(needle));
    }, [timeZones, query]);

    const handleSelect = (timeZone: string) => {
        onValueChange(timeZone);
        setIsOpen(false);
        setQuery("");
    };

    return (
        <Popover
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
                if (!open) {
                    setQuery("");
                }
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-invalid={aria["aria-invalid"]}
                    aria-describedby={aria["aria-describedby"]}
                    className="h-9 w-full justify-between px-2.5 font-normal"
                >
                    <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
                <div className="flex items-center gap-2 border-b px-2.5 py-2">
                    <Search className="size-4 shrink-0 text-muted-foreground" />
                    <Input
                        autoFocus
                        aria-label="Cerca fuso orario"
                        placeholder="es: Rome, Tokyo, GMT"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    />
                </div>

                {/* Un elenco lungo ma non lunghissimo (~420 voci): scorre, senza paginazione né
                    virtualizzazione, che a questa scala costerebbero più di quello che risparmiano. */}
                <div role="listbox" aria-label="Fusi orari" className="max-h-72 overflow-y-auto p-1">
                    {matches.length === 0 ? (
                        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                            Nessun fuso orario trovato
                        </p>
                    ) : (
                        matches.map((timeZone) => {
                            const isSelected = timeZone === value;

                            return (
                                <button
                                    key={timeZone}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => handleSelect(timeZone)}
                                    className={cn(
                                        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                                        isSelected && "bg-primary/10"
                                    )}
                                >
                                    <Check className={cn("size-4 shrink-0", !isSelected && "opacity-0")} />
                                    <span className="truncate">{timeZone}</span>
                                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                        {offsetLabel(timeZone)}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default TimeZoneField;
