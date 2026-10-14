import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type SelectorOption<TValue> = {
    value: TValue;
    label: string;
    /** Senza icona la voce è solo testo: è il caso della disposizione `segmented`. */
    icon?: LucideIcon;
};

type Props<TValue> = {
    /** `null`: nessuna voce scelta. Serve ai campi obbligatori che non devono partire già risposti. */
    value: TValue | null;
    onValueChange: (value: TValue) => void;
    options: SelectorOption<TValue>[];
    /** Etichetta letta dagli screen reader al posto del gruppo di radio. */
    ariaLabel: string;
    className?: string;
    /**
     * `vertical`: una voce per riga. `stacked`: tutte in una riga, con l'icona sopra la scritta e
     * senza il pallino a destra (la scelta si vede dal bordo e dal colore): per le colonne
     * strette, dove tre voci per intero in riga non ci stanno e una per riga costa troppa altezza.
     * `segmented`: tutte in una riga, solo testo, compatte (40 px): le risposte brevi come Sì/No.
     */
    orientation?: "horizontal" | "vertical" | "stacked" | "segmented";
    /**
     * L'`id` del gruppo, per dare il focus al campo quando la validazione lo indica (vedi
     * `focusField` nei dialoghi): il gruppo non è focalizzabile da sé, quindi appena riceve il
     * focus lo passa alla voce scelta, o alla prima se non c'è una scelta.
     */
    id?: string;
    invalid?: boolean;
    describedBy?: string;
};

/**
 * Scritte per intero e non composte a runtime (`md:grid-cols-${n}`): Tailwind genera solo le
 * classi che trova già formate nel sorgente, e una stringa costruita al volo resterebbe senza
 * regola, lasciando le voci incolonnate anche su schermi larghi.
 */
const horizontalColumnsClassName: Record<number, string> = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
};

/** Le colonne di `stacked` e `segmented`: tante quante le voci, da subito e non da `md`. */
const rowColumnsClassName: Record<number, string> = {
    2: "grid-cols-2",
    3: "grid-cols-3",
};

/**
 * Le "schede radio" usate nei form al posto di una select: metodo di pagamento e stato del
 * pagamento dei report e degli interventi condividevano lo stesso markup copiato tre volte,
 * quindi la resa a schermo vive qui una volta sola e ogni selettore porta solo le sue voci.
 */
const OptionSelector = <TValue extends string | number | boolean>({
    value,
    onValueChange,
    options,
    ariaLabel,
    className,
    orientation = "horizontal",
    id,
    invalid,
    describedBy,
}: Props<TValue>) => {
    const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
    // Una griglia vera, non `flex flex-wrap`: con il flex le classi `grid-cols-*` non facevano
    // nulla, e le voci andavano a capo come capitava, larghe ciascuna quanto la propria scritta.
    const isStacked = orientation === "stacked";
    const isSegmented = orientation === "segmented";
    const columnsClassName =
        isStacked || isSegmented
            ? (rowColumnsClassName[options.length] ?? "grid-cols-1")
            : orientation === "vertical"
              ? "grid-cols-1"
              : (horizontalColumnsClassName[options.length] ?? "grid-cols-1");

    const handleGroupFocus = (event: React.FocusEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) {
            return;
        }

        const selectedIndex = options.findIndex((option) => option.value === value);
        buttonRefs.current[Math.max(selectedIndex, 0)]?.focus();
    };

    return (
        <div
            id={id}
            role="radiogroup"
            aria-label={ariaLabel}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            tabIndex={id ? -1 : undefined}
            onFocus={id ? handleGroupFocus : undefined}
            className={cn("grid gap-2 outline-none", columnsClassName, className)}
        >
            {options.map((option, index) => {
                const isSelected = value === option.value;
                const Icon = option.icon;

                return (
                    <button
                        key={String(option.value)}
                        ref={(element) => {
                            buttonRefs.current[index] = element;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-state={isSelected ? "checked" : "unchecked"}
                        onClick={() => onValueChange(option.value)}
                        className={cn(
                            "flex cursor-pointer border-2 focus-outline transition outline-none",
                            isSegmented ? "h-10 items-center justify-center rounded-lg px-3 text-base" : "rounded-xl",
                            isStacked && "flex-col items-center justify-center gap-1 px-1 py-2 text-center",
                            !isStacked && !isSegmented && "items-center justify-start gap-3 px-4 py-3 text-left",
                            isSelected
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border bg-card hover:border-primary/40 hover:bg-muted/60",
                            invalid && !isSelected && "border-destructive"
                        )}
                    >
                        {Icon ? (
                            <Icon
                                className={cn("size-5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}
                            />
                        ) : null}

                        <span className="flex flex-col gap-0.5">
                            <span
                                className={cn(
                                    "text-base font-medium text-foreground",
                                    (isStacked || isSegmented) && isSelected && "font-semibold"
                                )}
                            >
                                {option.label}
                            </span>
                        </span>

                        {isStacked || isSegmented ? null : (
                            <span
                                className={cn(
                                    "ml-auto flex size-5 shrink-0 items-center justify-center rounded-full border",
                                    isSelected ? "border-primary" : "border-input"
                                )}
                            >
                                <span
                                    className={cn(
                                        "size-2.5 rounded-full bg-primary transition-opacity",
                                        isSelected ? "opacity-100" : "opacity-0"
                                    )}
                                />
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default OptionSelector;
