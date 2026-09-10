import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

type HoverDetailCellProps = {
    text: ReactNode;
    detail?: string | null;
};

/**
 * Per le colonne il cui valore visibile (es. "Altro") non basta a capire cosa sia successo
 * davvero: al passaggio del mouse mostra il testo libero scritto a mano dietro quella voce.
 */
const HoverDetailCell = ({ text, detail }: HoverDetailCellProps) => {
    if (!detail) {
        return <>{text}</>;
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="cursor-help underline decoration-muted-foreground decoration-dotted underline-offset-4">
                    {text}
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-left whitespace-pre-wrap">{detail}</TooltipContent>
        </Tooltip>
    );
};

export default HoverDetailCell;
