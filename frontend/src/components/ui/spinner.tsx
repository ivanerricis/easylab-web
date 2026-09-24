import { MoonLoader } from "react-spinners";
import { cn } from "@/lib/utils";

type SpinnerProps = {
    /** Il diametro in pixel. */
    size?: number;
    className?: string;
};

/**
 * L'indicatore di caricamento grande (pagine, blocco "operazione in corso"): la luna di
 * `react-spinners` al posto della rotellina di lucide.
 *
 * Il colore è `var(--primary)`, non un esadecimale: segue la tavolozza scelta in Impostazioni
 * (Predefinito, Oceano, Bosco...) e i due temi, come ogni altro elemento dell'app. La libreria
 * lo scrive in uno stile in linea, dove le variabili CSS funzionano.
 *
 * `data-slot="spinner"` lo esenta dalla regola di motion ridotto in index.css: lì la rotazione è
 * informazione, non decoro. La libreria anima degli elementi figli, non il contenitore, quindi
 * l'esenzione copre anche i discendenti (vedi la regola in index.css).
 *
 * Le icone piccole che girano dentro pulsanti e toast restano `Loader2` con `animate-spin`: a
 * 16px la luna non si distingue.
 */
const Spinner = ({ size = 48, className }: SpinnerProps) => (
    <span
        data-slot="spinner"
        aria-hidden="true"
        // L'anello (l'ultimo figlio) la libreria lo disegna al 10% di opacità, fisso in linea:
        // sullo sfondo grigio chiaro e su quello scuro quasi non si vedeva, e restava solo il
        // puntino che gira. Al 25% la sagoma si legge senza rubare la scena alla "luna".
        className={cn("inline-flex [&>span>span:last-child]:opacity-25!", className)}
    >
        <MoonLoader color="var(--primary)" size={size} speedMultiplier={0.8} />
    </span>
);

export default Spinner;
