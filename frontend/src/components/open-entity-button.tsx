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
 */
const OpenEntityButton = ({ to, size = "lg", className, "aria-label": ariaLabel, ...props }: OpenEntityButtonProps) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button asChild variant="outline" size={size} className={cn("border-0 text-lg", className)} {...props}>
                    <Link to={to} aria-label={ariaLabel}>
                        <ExternalLink className="size-5" />
                    </Link>
                </Button>
            </TooltipTrigger>
            <TooltipContent>{ariaLabel ?? "Apri"}</TooltipContent>
        </Tooltip>
    );
};

export default OpenEntityButton;
