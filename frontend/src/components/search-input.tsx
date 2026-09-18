import { Search, X } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { usePageShortcut } from "@/hooks/usePageShortcut";
import Kbd from "./ui/kbd";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./ui/input-group";

type Props = {
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    /** Da usare quando il segnaposto non basta a dire *cosa* si sta cercando. */
    label?: string;
    className?: string;
};

const SearchInput = ({ value, onValueChange, placeholder = "Cerca...", label, className }: Props) => {
    const inputRef = useRef<HTMLInputElement>(null);

    // "/" porta il focus qui, senza doverci cliccare sopra prima di scrivere.
    usePageShortcut("/", () => inputRef.current?.focus());

    const handleClear = () => {
        onValueChange("");
        // Il focus torna nel campo: chi ha appena svuotato la ricerca vuole ridigitare,
        // non ritrovarsi il cursore su un pulsante che è appena scomparso.
        inputRef.current?.focus();
    };

    return (
        // Su mobile prende lo spazio che resta accanto al pulsante di aggiornamento invece di
        // restare fisso a 240px; da `sm` in su torna alla larghezza di prima.
        // `h-10` come gli altri controlli della barra sopra le tabelle (pulsante Aggiorna, filtri,
        // date, menu Colonne): con l'altezza di serie (36px) il campo restava più basso dei
        // pulsanti accanto, e la riga non era allineata.
        <InputGroup className={cn("h-10 min-w-0 flex-1 border-primary! sm:w-60 sm:flex-none", className)}>
            <InputGroupAddon>
                <Search className="size-5 text-primary" aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
                ref={inputRef}
                // `type="search"` è quello che descrive il campo, e su mobile fa comparire il
                // tasto "Cerca" sulla tastiera. La X nativa che Chrome ci aggiunge dentro è
                // nascosta in index.css, altrimenti sarebbe doppia con quella qui sotto.
                type="search"
                aria-label={label ?? placeholder}
                aria-keyshortcuts="/"
                placeholder={placeholder}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Escape" && value !== "") {
                        // Esc svuota il campo invece di chiudere il dialogo o la pagina che sta
                        // intorno: è il comportamento che tutti i campi di ricerca hanno.
                        event.stopPropagation();
                        handleClear();
                    }
                }}
            />
            {/* Il pulsante compare solo se c'è qualcosa da cancellare. Prima stava lì sempre,
                anche a campo vuoto, dove premerlo non faceva niente. A campo vuoto lo stesso
                spazio ricorda la scorciatoia, e col focus dentro sparisce: chi ci sta già
                scrivendo non ha più bisogno di sapere come arrivarci. */}
            {value !== "" ? (
                <InputGroupButton className="mr-1" size="icon-sm" aria-label="Cancella ricerca" onClick={handleClear}>
                    <X className="text-primary" />
                </InputGroupButton>
            ) : (
                <InputGroupAddon align="inline-end" className="group-focus-within/input-group:hidden">
                    <Kbd className="hidden py-0 sm:inline-block">/</Kbd>
                </InputGroupAddon>
            )}
        </InputGroup>
    );
};

export default SearchInput;
