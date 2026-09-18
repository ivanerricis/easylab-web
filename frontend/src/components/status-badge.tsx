import type { ReactNode } from "react";
import { statusStyles, type StatusColor } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
    /** Senza colore il badge resta neutro. */
    color?: StatusColor;
    /** `lg` è la card di stato in cima alle schede di report e intervento. */
    size?: "sm" | "lg";
    className?: string;
    children: ReactNode;
};

/**
 * Lo stato come pillola colorata con il pallino davanti: nelle schede su mobile delle liste, nelle
 * schede di report e intervento e nel popover del calendario. Un solo disegno sui token di stato,
 * invece di tre mappe di colori diverse.
 */
const StatusBadge = ({ color, size = "sm", className, children }: StatusBadgeProps) => {
    const style = color ? statusStyles[color] : null;

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center rounded-full font-semibold whitespace-nowrap ring-1 ring-inset",
                size === "lg" ? "px-3 py-1 text-2xl" : "gap-1.5 px-2.5 py-0.5 text-xs",
                style?.badge ?? "bg-muted text-muted-foreground ring-border",
                className
            )}
        >
            {/* Il pallino solo nella misura piccola: nella card di stato delle schede, che a 1440px
                è larga poco più di "Programmato" in 24px, spingeva la parola fuori dal bordo. */}
            {style && size === "sm" ? <span aria-hidden="true" className={cn("size-1.5 rounded-full", style.dot)} /> : null}
            {children}
        </span>
    );
};

export default StatusBadge;
