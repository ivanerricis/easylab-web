import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ReactNode } from "react";

type HoverDetailCellProps = {
    text: ReactNode;
    detail?: string | null;
};

/**
 * Per le colonne il cui valore visibile (es. "Altro") non basta a capire cosa sia successo
 * davvero: al tocco/click mostra il testo libero scritto a mano dietro quella voce.
 *
 * Era un Tooltip aperto al passaggio del mouse: su touch non c'è hover, quindi su mobile
 * (dove queste colonne diventano righe di scheda in EntityCardList) il dettaglio non si
 * poteva proprio raggiungere. Popover apre allo stesso modo con mouse, tastiera e tocco.
 */
const HoverDetailCell = ({ text, detail }: HoverDetailCellProps) => {
    if (!detail) {
        return <>{text}</>;
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                {/* `block max-w-full truncate`: con la tabella a larghezze fisse la cella tronca
                    il testo con i puntini, ma un bottone inline non si lascia troncare e veniva
                    tagliato di netto sul bordo della colonna. */}
                <button
                    type="button"
                    className="block max-w-full cursor-pointer truncate text-left underline decoration-muted-foreground decoration-dotted underline-offset-4"
                >
                    {text}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto max-w-xs p-2 text-left text-sm whitespace-pre-wrap">
                {detail}
            </PopoverContent>
        </Popover>
    );
};

export default HoverDetailCell;
