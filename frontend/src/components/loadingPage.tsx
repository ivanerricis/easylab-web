import Spinner from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type LoadingPageProps = {
    className?: string;
    /** Cosa si sta caricando, se dirlo aiuta: finisce nell'annuncio dello screen reader. */
    label?: string;
};

/**
 * L'indicatore di caricamento a tutta area.
 *
 * `role="status"` con un'etichetta è l'unica cosa che rende questo stato percepibile a chi
 * non vede la rotellina: prima qui c'era un'icona e nient'altro, quindi per uno screen
 * reader la pagina risultava semplicemente vuota. L'esenzione dal motion ridotto sta in
 * `Spinner`.
 */
const LoadingPage = ({ className, label = "Caricamento in corso" }: LoadingPageProps) => {
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn("flex h-full w-full items-center justify-center", className)}
        >
            <Spinner />
            <span className="sr-only">{label}</span>
        </div>
    );
};

export default LoadingPage;
