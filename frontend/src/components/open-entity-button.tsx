import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import type { ComponentProps } from "react";
import { Link } from "react-router-dom";

type OpenEntityButtonProps = Omit<ComponentProps<typeof Button>, "children" | "asChild" | "onClick"> & {
    /** Dove porta: la scheda dell'entità, es. `/reports/12`. */
    to: string;
};

/**
 * Il pulsante "Apri" delle righe. È un link con l'aspetto di un pulsante, non un pulsante
 * che chiama `navigate`: così funzionano i gesti che ci si aspetta da un collegamento —
 * Ctrl+clic o clic con la rotella per aprire la scheda in un'altra scheda del browser,
 * "Copia indirizzo link" dal menu del tasto destro — e un clic normale resta una navigazione
 * interna, senza ricaricare la pagina.
 *
 * L'aspetto è quello delle altre azioni di riga (Modifica, Stampa: vedi `reports-table.tsx`):
 * fondo `bg-muted` e icona grigia che al passaggio diventa del colore dell'azione. Prima era un
 * `outline` senza bordo, bianco su card e con l'icona nera, l'unico diverso della fila. Misura
 * di serie `icon-lg`, quadrata come le vicine: con `lg` usciva più larga di loro.
 */
const OpenEntityButton = ({
    to,
    size = "icon-lg",
    className,
    "aria-label": ariaLabel,
    ...props
}: OpenEntityButtonProps) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    asChild
                    variant="default"
                    size={size}
                    className={cn("bg-muted hover:bg-primary/20", className)}
                    {...props}
                >
                    <Link to={to} aria-label={ariaLabel}>
                        <ExternalLink className="size-5 text-muted-foreground transition-colors group-hover/button:text-primary" />
                    </Link>
                </Button>
            </TooltipTrigger>
            <TooltipContent>{ariaLabel ?? "Apri"}</TooltipContent>
        </Tooltip>
    );
};

export default OpenEntityButton;
