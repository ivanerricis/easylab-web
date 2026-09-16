import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3 } from "lucide-react";

type ColumnVisibilityMenuProps = {
    columns: readonly { key: string; header: string; hideable?: boolean }[];
    hiddenColumnKeys: readonly string[];
    onColumnVisibleChange: (columnKey: string, visible: boolean) => void;
    onShowAll: () => void;
};

/** La colonna dei pulsanti di riga non è un dato: non si nasconde e non compare nel menu. */
const actionsColumnKey = "actions";

/**
 * Il menu "Colonne" sopra una tabella: sceglie quali colonne mostrare.
 *
 * I report hanno undici colonne, e alcune servono di rado (password, backup dati): su uno
 * schermo da portatile tenerle tutte vuol dire colonne strette e testo troncato. La scelta
 * vale solo per la tabella, quindi il menu sparisce sotto `sm`, dove le righe diventano schede.
 *
 * Le colonne che identificano la riga (`hideable: false`) restano nel menu ma bloccate, così è
 * chiaro che esistono e perché non si tolgono.
 */
const ColumnVisibilityMenu = ({
    columns,
    hiddenColumnKeys,
    onColumnVisibleChange,
    onShowAll,
}: ColumnVisibilityMenuProps) => {
    const listedColumns = columns.filter((column) => column.key !== actionsColumnKey);
    const hiddenCount = listedColumns.filter((column) => hiddenColumnKeys.includes(column.key)).length;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="lg"
                    className="hidden sm:inline-flex"
                    aria-label={hiddenCount > 0 ? `Colonne, ${hiddenCount} nascoste` : "Colonne"}
                >
                    <Columns3 className="size-5 text-primary" aria-hidden="true" />
                    Colonne
                    {hiddenCount > 0 ? (
                        <span
                            aria-hidden="true"
                            className="rounded-full bg-primary/15 px-1.5 text-xs text-primary tabular-nums"
                        >
                            {hiddenCount}
                        </span>
                    ) : null}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {listedColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                        key={column.key}
                        checked={!hiddenColumnKeys.includes(column.key)}
                        disabled={column.hideable === false}
                        // Il menu resta aperto: di solito se ne tolgono più d'una di fila.
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) => onColumnVisibleChange(column.key, checked === true)}
                    >
                        {column.header}
                    </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={hiddenCount === 0} onSelect={onShowAll}>
                    Mostra tutte
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default ColumnVisibilityMenu;
