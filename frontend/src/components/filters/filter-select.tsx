import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import type { LucideIcon } from "lucide-react";

/**
 * Sotto questa larghezza le barre dei filtri non hanno spazio per tre o quattro menu a
 * tendina larghi: i trigger si riducono alla sola icona.
 *
 * Sta qui, e non nei singoli file dei filtri, perché prima era dichiarato tre volte con lo
 * stesso valore. Cambiarne una copia sola avrebbe fatto passare in modalità compatta le
 * barre di elenchi diversi a larghezze diverse — una differenza che si nota solo
 * ridimensionando la finestra, cioè quasi mai.
 */
export const FILTERS_COMPACT_BREAKPOINT = 640;

type FilterSelectOption<TValue extends string> = {
    value: TValue;
    label: string;
};

type FilterSelectProps<TValue extends string> = {
    value: TValue;
    onValueChange: (value: TValue) => void;
    options: FilterSelectOption<TValue>[];
    /** Testo del segnaposto e `aria-label` del trigger. */
    label: string;
    /** Mostrata al posto del testo quando la barra è in modalità compatta. */
    icon: LucideIcon;
    /**
     * Voce "nessun filtro" in cima all'elenco, con la sua etichetta ("Tutti gli stati",
     * "Tutti i report"): il valore corrispondente non sta negli `options`, che
     * elencano solo gli stati reali dell'entità.
     */
    allOption?: { value: TValue; label: string };
    /**
     * `toolbar` (il default) è la barra dei filtri delle liste: sotto `sm` si riduce all'icona.
     * `inline` è il filtro accanto alle tab nelle schede di cliente, collaboratore e tecnico:
     * lì il testo resta sempre, e su mobile il menu prende lo spazio che le tab lasciano. Prima
     * quelle schede avevano cinque `Select` scritti a mano con le stesse classi.
     * `sheet` è il menu a tutta larghezza dentro il pannello dei filtri su mobile: testo sempre
     * visibile, senza la riduzione all'icona della barra.
     */
    variant?: "toolbar" | "inline" | "sheet";
};

const FilterSelect = <TValue extends string>({
    value,
    onValueChange,
    options,
    label,
    icon: Icon,
    allOption,
    variant = "toolbar",
}: FilterSelectProps<TValue>) => {
    const isCompact = useIsMobile(FILTERS_COMPACT_BREAKPOINT) && variant === "toolbar";

    return (
        <Select value={value} onValueChange={(next) => onValueChange(next as TValue)}>
            {/* 40px come gli altri controlli della barra (vedi `SearchInput`). L'altezza di serie
                del trigger sta in `data-[size=default]:h-9`, che vince su un `h-10` semplice. */}
            <SelectTrigger
                className={
                    variant === "inline"
                        ? "min-w-0 flex-1 text-base sm:w-56 sm:flex-none sm:text-lg"
                        : variant === "sheet"
                          ? "w-full text-base data-[size=default]:h-10"
                          : cn("data-[size=default]:h-10", isCompact ? "w-auto px-2" : "w-56")
                }
                aria-label={label}
            >
                {isCompact ? <Icon className="size-4" /> : <SelectValue placeholder={label} />}
            </SelectTrigger>
            <SelectContent position="popper">
                {allOption ? <SelectItem value={allOption.value}>{allOption.label}</SelectItem> : null}
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

export default FilterSelect;
