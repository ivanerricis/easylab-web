import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PlusCircle } from "lucide-react";
import type { ComponentProps } from "react";

type CreateEntityButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
    label: string;
    /**
     * Etichetta breve mostrata anche sotto `md`, dove il testo intero resta nascosto (icona
     * nuda + tooltip, che su touch non si apre). Serve solo quando più pulsanti di questo tipo
     * compaiono insieme: da soli l'icona basta, ma due "+" identici sono indistinguibili sotto
     * `md`. Senza questa prop il comportamento resta quello di sempre.
     */
    mobileLabel?: string;
    onClick: NonNullable<ComponentProps<typeof Button>["onClick"]>;
};

const CreateEntityButton = ({ label, mobileLabel, size = "lg", className, ...props }: CreateEntityButtonProps) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    size={size}
                    // Sotto `md` senza etichetta breve resta solo l'icona: il pulsante è quadrato
                    // come gli altri pulsanti-icona della pagina (refresh, azioni di riga).
                    className={cn("text-lg", !mobileLabel && "max-md:aspect-square max-md:px-0", className)}
                    aria-label={label}
                    {...props}
                >
                    <PlusCircle className="size-5" />
                    {mobileLabel ? <span className="text-lg md:hidden">{mobileLabel}</span> : null}
                    <span className="hidden text-lg md:inline">{label}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
};

export default CreateEntityButton;
