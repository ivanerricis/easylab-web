import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Un campo prezzo con il simbolo dell'euro davanti: prima era un numero nudo. Stava in tre copie
 * identiche, una per dialogo (modifica report, creazione e modifica intervento).
 */
const EuroInput = ({ className, ...props }: ComponentProps<typeof Input>) => (
    <div className="relative">
        <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg text-muted-foreground"
        >
            €
        </span>
        <Input type="number" min={0} step={1} className={cn("pl-8", className)} {...props} />
    </div>
);

export default EuroInput;
