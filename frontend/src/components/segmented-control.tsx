import { cn } from "@/lib/utils";

type SegmentedControlProps<TValue extends string> = {
    /** L'id del gruppo: lo usano l'etichetta (`aria-labelledby`) e chi vuole portarci il focus. */
    id: string;
    /** Il nome accessibile del gruppo, se non c'è già un'etichetta che lo nomina. */
    "aria-label"?: string;
    value: TValue;
    options: readonly { value: TValue; label: string }[];
    onChange: (value: TValue) => void;
    /** Il gruppo non si può cambiare (il tipo di un contratto già creato): la scelta resta visibile. */
    disabled?: boolean;
    className?: string;
};

/**
 * Due o tre scelte sempre in vista, al posto di un menu a tendina: per quelle che decidono cosa
 * mostra il resto del modulo (il tipo del contratto) il menu nascondeva proprio ciò che serve capire
 * subito. È un gruppo di radio (`role="radiogroup"`): si sceglie con un tocco, e con le frecce da
 * tastiera come i radio nativi.
 */
const SegmentedControl = <TValue extends string>({
    id,
    value,
    options,
    onChange,
    disabled = false,
    className,
    ...rest
}: SegmentedControlProps<TValue>) => (
    <div
        id={id}
        role="radiogroup"
        aria-label={rest["aria-label"]}
        className={cn("inline-grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg border bg-muted p-0.5", className)}
    >
        {options.map((option, index) => {
            const isSelected = option.value === value;

            return (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    // Un solo elemento del gruppo è raggiungibile con Tab: le frecce fanno il resto.
                    tabIndex={isSelected ? 0 : -1}
                    disabled={disabled}
                    onClick={() => onChange(option.value)}
                    onKeyDown={(event) => {
                        const step =
                            event.key === "ArrowRight" || event.key === "ArrowDown"
                                ? 1
                                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                                  ? -1
                                  : 0;

                        if (step === 0 || disabled) {
                            return;
                        }

                        event.preventDefault();
                        const next = options[(index + step + options.length) % options.length];

                        onChange(next.value);
                        (
                            event.currentTarget.parentElement?.querySelectorAll("button")[options.indexOf(next)] as
                                HTMLElement | undefined
                        )?.focus();
                    }}
                    className={cn(
                        "rounded-md px-4 py-1.5 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed",
                        isSelected
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground disabled:opacity-50"
                    )}
                >
                    {option.label}
                </button>
            );
        })}
    </div>
);

export default SegmentedControl;
