import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type SelectorOption<TValue> = {
    value: TValue;
    label: string;
    icon: LucideIcon;
};

type Props<TValue> = {
    value: TValue;
    onValueChange: (value: TValue) => void;
    options: SelectorOption<TValue>[];
    /** Etichetta letta dagli screen reader al posto del gruppo di radio. */
    ariaLabel: string;
    className?: string;
    orientation?: "horizontal" | "vertical";
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
}: Props<TValue>) => {
    // Una griglia vera, non `flex flex-wrap`: con il flex le classi `grid-cols-*` non facevano
    // nulla, e le voci andavano a capo come capitava, larghe ciascuna quanto la propria scritta.
    const columnsClassName =
        orientation === "vertical" ? "grid-cols-1" : (horizontalColumnsClassName[options.length] ?? "grid-cols-1");

    return (
        <div role="radiogroup" aria-label={ariaLabel} className={cn("grid gap-2", columnsClassName, className)}>
            {options.map((option) => {
                const isSelected = value === option.value;
                const Icon = option.icon;

                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-state={isSelected ? "checked" : "unchecked"}
                        onClick={() => onValueChange(option.value)}
                        className={cn(
                            "flex cursor-pointer items-center justify-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            isSelected
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border bg-card hover:border-primary/40 hover:bg-muted/60"
                        )}
                    >
                        <Icon
                            className={cn("size-5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}
                        />

                        <span className="flex flex-col gap-0.5">
                            <span className="text-base font-medium text-foreground">{option.label}</span>
                        </span>

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
                    </button>
                );
            })}
        </div>
    );
};

export default OptionSelector;
