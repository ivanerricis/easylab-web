import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Un campo prezzo con il simbolo dell'euro davanti: prima era un numero nudo. Stava in tre copie
 * identiche, una per dialogo (modifica report, creazione e modifica intervento).
 *
 * È un campo di testo con la tastiera decimale, non `type="number"`: il campo numerico non
 * accetta la virgola in ogni browser e lingua, e quando non capiva il valore lo passava vuoto,
 * così "12,50" diventava 0 o nessun prezzo senza avvisare. Il testo lo legge `parseEuroAmount`
 * (`lib/euroAmount.ts`), che accetta virgola e punto e segnala il resto come "Importo non
 * valido". Sparite anche le frecce su/giù e la rotella che cambiava il prezzo scorrendo.
 */
const EuroInput = ({ className, onFocus, ...props }: ComponentProps<typeof Input>) => (
    <div className="relative">
        <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg text-muted-foreground"
        >
            €
        </span>
        <Input
            type="text"
            inputMode="decimal"
            className={cn("pl-8", className)}
            // Tutto selezionato all'ingresso, come faceva `Input` con i campi numerici: il
            // prezzo di partenza è quasi sempre "0", e si scrive sopra invece di cancellarlo.
            onFocus={(event) => {
                event.target.select();
                onFocus?.(event);
            }}
            {...props}
        />
    </div>
);

export default EuroInput;
