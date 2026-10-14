import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type FormSectionProps = {
    title: string;
    /**
     * Sotto `sm` il riquadro diventa solo una linea sopra il titolo: padding del dialogo più
     * bordo e padding della sezione lasciavano ai campi ~268px su 358, e i valori lunghi (il
     * cliente col telefono) finivano tagliati. Con la sola linea i campi guadagnano 34px, e le
     * sezioni restano distinte. Lo usa la modifica del report, il modulo più fitto; gli altri
     * dialoghi tengono il riquadro anche su telefono.
     */
    flatOnMobile?: boolean;
    /**
     * Senza riquadro, a tutte le larghezze: solo il titolo con una linea sottile che prosegue a
     * destra. Per i moduli fitti (la creazione del report) dove tre riquadri con bordo e sfondo
     * costavano più altezza dei campi stessi.
     */
    ruled?: boolean;
    className?: string;
    children: ReactNode;
};

/**
 * Un riquadro con titolo dentro un dialogo di modifica o creazione ("Anagrafica", "Intervento",
 * "Stato"…). Prima lo stesso `<section>` con le stesse classi era copiato in sei punti fra i
 * dialoghi di report e interventi, e la modifica del report ne aveva una versione sua.
 *
 * `content-start` tiene i campi in alto quando la sezione si allunga per pareggiare le vicine
 * nella stessa riga (i tre riquadri in fondo alla modifica del report): senza, la griglia
 * distribuirebbe lo spazio in più fra le righe e i campi finirebbero sparsi. Dove la sezione
 * non si allunga non cambia niente.
 */
const FormSection = ({ title, flatOnMobile = false, ruled = false, className, children }: FormSectionProps) => (
    <section
        className={cn(
            "grid content-start gap-3",
            !ruled && "rounded-md border border-primary/15 bg-muted/20 p-4",
            !ruled &&
                flatOnMobile &&
                "max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:bg-transparent max-sm:px-0 max-sm:pt-3 max-sm:pb-0",
            className
        )}
    >
        <h3
            className={cn(
                "text-sm font-semibold tracking-wide text-muted-foreground uppercase",
                ruled && "flex items-center gap-3 after:h-px after:flex-1 after:bg-primary/15"
            )}
        >
            {title}
        </h3>
        {children}
    </section>
);

/**
 * Il riquadro della parte che segue l'avanzamento della pratica (stato e pagamento nella modifica
 * del report e degli interventi, la nuova password nel cambio password): sfondo e bordo del
 * colore del tema, appena accennati, e titolo dello stesso colore. Il colore del tema e non uno
 * fisso, perché verde, giallo e rosso sono già i colori di stato delle righe: così segue anche
 * il colore scelto in Impostazioni e il tema scuro. Su telefono, con `flatOnMobile`, il riquadro
 * resta senza sfondo.
 */
export const tintedSectionClassName = "border-primary/25 bg-primary/[0.04] [&_h3]:text-primary-text";

export default FormSection;
