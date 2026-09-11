import type { PaymentMethod } from "@/types/dtos";
import { cn } from "@/lib/utils";
import { Ban, Banknote, CreditCard, type LucideIcon } from "lucide-react";

type PaymentMethodOption = {
    value: PaymentMethod;
    label: string;
    icon: LucideIcon;
};

type Props = {
    value: PaymentMethod;
    onValueChange: (value: PaymentMethod) => void;
    className?: string;
    orientation?: "horizontal" | "vertical";
};

const paymentMethodOptions: PaymentMethodOption[] = [
    {
        value: "non_paid",
        label: "Non pagato",
        icon: Ban,
    },
    {
        value: "cash",
        label: "Contanti",
        icon: Banknote,
    },
    {
        value: "card",
        label: "Carta",
        icon: CreditCard,
    },
];

const PaymentMethodSelector = ({ value, onValueChange, className, orientation = "horizontal" }: Props) => {
    // Una griglia vera, non `flex flex-wrap`: con il flex le classi `grid-cols-*` non facevano
    // nulla, e le tre voci andavano a capo come capitava, larghe ciascuna quanto la propria scritta.
    const layoutClassName = orientation === "vertical" ? "grid-cols-1" : "md:grid-cols-3";

    return (
        <div
            role="radiogroup"
            aria-label="Metodo di pagamento"
            className={cn("grid gap-2", layoutClassName, className)}
        >
            {paymentMethodOptions.map((option) => {
                const isSelected = value === option.value;
                const Icon = option.icon;

                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        data-state={isSelected ? "checked" : "unchecked"}
                        onClick={() => onValueChange(option.value)}
                        className={cn(
                            "flex cursor-pointer items-center justify-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            isSelected
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border bg-background hover:border-primary/40 hover:bg-muted/60"
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

export default PaymentMethodSelector;
