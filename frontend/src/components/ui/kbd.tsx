import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Il tasto di una scorciatoia, disegnato come un tastino: lo mostrano il pulsante della ricerca
 * globale, il campo di ricerca delle liste e l'elenco delle scorciatoie. Le tre copie della
 * stessa classe avevano già preso misure diverse fra loro.
 */
const Kbd = ({ className, ...props }: ComponentProps<"kbd">) => (
    <kbd
        data-slot="kbd"
        className={cn(
            "pointer-events-none rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
            className
        )}
        {...props}
    />
);

export default Kbd;
