import { Search, X } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
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

    const handleClear = () => {
        onValueChange("");
        // Il focus torna nel campo: chi ha appena svuotato la ricerca vuole ridigitare,
        // non ritrovarsi il cursore su un pulsante che è appena scomparso.
        inputRef.current?.focus();
    };

    return (
        // Su mobile prende lo spazio che resta accanto al pulsante di aggiornamento invece di
        // restare fisso a 240px; da `sm` in su torna alla larghezza di prima.
        <InputGroup className={cn("min-w-0 flex-1 border-primary! sm:w-60 sm:flex-none", className)}>
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
                anche a campo vuoto, dove premerlo non faceva niente. */}
            {value === "" ? null : (
                <InputGroupButton className="mr-1" size="icon-sm" aria-label="Cancella ricerca" onClick={handleClear}>
                    <X className="text-primary" />
                </InputGroupButton>
            )}
        </InputGroup>
    );
};

export default SearchInput;
