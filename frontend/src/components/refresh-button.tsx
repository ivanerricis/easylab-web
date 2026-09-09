import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { useState, type ComponentProps } from "react";

type RefreshButtonProps = Omit<ComponentProps<typeof Button>, "children" | "onClick"> & {
    /** Ricarica i dati della pagina: di norma la `reload` dell'hook che li ha caricati. */
    onRefresh: () => void | Promise<unknown>;
    label?: string;
    /**
     * Caricamento già tracciato dalla pagina. Il pulsante gira comunque per conto suo
     * finché la promise di `onRefresh` non si risolve, quindi serve solo alle pagine che
     * vogliono mostrarlo occupato anche durante i caricamenti che non ha avviato lui.
     */
    isRefreshing?: boolean;
};

/**
 * I dati vengono letti al montaggio della pagina e poi solo quando è la pagina stessa a
 * modificarli: se un altro operatore crea o chiude qualcosa nel frattempo, qui non si vede
 * finché non si cambia pagina. Questo pulsante rilegge gli stessi dati senza ricaricare
 * l'applicazione (che azzererebbe filtri, ricerca e pagina corrente).
 */
const RefreshButton = ({
    onRefresh,
    label = "Aggiorna dati",
    isRefreshing = false,
    size = "icon-lg",
    variant = "outline",
    className,
    disabled,
    ...props
}: RefreshButtonProps) => {
    const [isPending, setIsPending] = useState(false);
    const isBusy = isPending || isRefreshing;
    // I pulsanti grandi delle intestazioni di pagina portano icone da 20px, quelli
    // dentro le card delle impostazioni da 16px: l'icona segue la taglia del pulsante.
    const iconClassName = size === "lg" || size === "icon-lg" ? "size-5" : "size-4";

    const handleClick = async () => {
        if (isBusy) {
            return;
        }

        try {
            setIsPending(true);
            await onRefresh();
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={variant}
                    size={size}
                    className={cn(className)}
                    aria-label={label}
                    aria-busy={isBusy}
                    disabled={disabled ?? isBusy}
                    onClick={handleClick}
                    {...props}
                >
                    <RefreshCw
                        data-slot={isBusy ? "spinner" : undefined}
                        className={cn(iconClassName, isBusy && "animate-spin")}
                    />
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
};

export default RefreshButton;
