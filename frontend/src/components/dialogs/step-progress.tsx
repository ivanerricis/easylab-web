import { cn } from "@/lib/utils";

type StepProgressProps = {
    /** I titoli dei passi, nell'ordine. */
    steps: readonly string[];
    /** L'indice del passo visibile, da 0. */
    current: number;
};

/**
 * "Passo N di M: titolo" con una barra a segmenti: l'intestazione dei dialoghi di creazione quando
 * su telefono diventano a passi (report e intervento). `aria-live` perché cambiando passo il
 * focus resta su "Avanti", e senza annuncio chi usa un lettore di schermo non saprebbe che il
 * contenuto sopra è cambiato.
 */
const StepProgress = ({ steps, current }: StepProgressProps) => (
    <div className="grid gap-2" aria-live="polite">
        <p className="text-sm text-muted-foreground">
            Passo {current + 1} di {steps.length}: <span className="font-medium text-foreground">{steps[current]}</span>
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((step, index) => (
                <span
                    key={step}
                    className={cn(
                        "h-1.5 flex-1 rounded-full",
                        index <= current ? "bg-primary" : "bg-muted-foreground/25"
                    )}
                />
            ))}
        </div>
    </div>
);

export default StepProgress;
