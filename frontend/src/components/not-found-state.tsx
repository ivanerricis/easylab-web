import { Button } from "@/components/ui/button";
import { FileQuestion, Home } from "lucide-react";
import { Link } from "react-router-dom";

type NotFoundStateProps = {
    title: string;
    description: string;
    /** Il posto più utile in cui andare da qui: di norma l'elenco a cui la scheda appartiene. */
    backTo: string;
    backLabel: string;
};

/**
 * Quello che si vede al posto di una scheda che non esiste: un link vecchio, un report
 * eliminato, un numero scritto male.
 *
 * Prima una scheda inesistente mostrava un avviso che spariva da solo e riportava all'elenco,
 * e un indirizzo sbagliato riportava alla dashboard senza dire niente: in entrambi i casi chi
 * aveva seguito un link non capiva che cosa fosse successo. Qui il motivo resta scritto, con
 * una strada per uscire.
 */
const NotFoundState = ({ title, description, backTo, backLabel }: NotFoundStateProps) => {
    return (
        <div className="flex min-h-[60vh] w-full items-center justify-center px-4">
            <div role="status" className="flex max-w-md flex-col items-center gap-3 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <FileQuestion className="size-7" aria-hidden="true" />
                </div>
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Button asChild size="lg">
                        <Link to={backTo}>{backLabel}</Link>
                    </Button>
                    {backTo === "/dashboard" ? null : (
                        <Button asChild size="lg" variant="outline">
                            <Link to="/dashboard">
                                <Home className="size-4" aria-hidden="true" />
                                Dashboard
                            </Link>
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotFoundState;
