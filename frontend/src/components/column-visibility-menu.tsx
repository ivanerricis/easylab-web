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
import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";

type ColumnVisibilityMenuProps = {
    /** Nell'ordine in cui compaiono in tabella: il menu le elenca così. */
    columns: readonly { key: string; header: string; hideable?: boolean }[];
    hiddenColumnKeys: readonly string[];
    onColumnVisibleChange: (columnKey: string, visible: boolean) => void;
    onShowAll: () => void;
    /**
     * Sposta una colonna di `delta` posizioni (-1 su, +1 giù): con questa ogni voce ha i suoi
     * due pulsanti. Facoltativa, come le due che seguono: senza, il menu sceglie solo la
     * visibilità.
     */
    onColumnMoveBy?: (columnKey: string, delta: number) => void;
    /** Riporta le colonne all'ordine predefinito: la voce "Ripristina ordine". */
    onResetOrder?: () => void;
    /** L'ordine attuale non è quello predefinito: abilita "Ripristina ordine". */
    isCustomOrder?: boolean;
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
    onColumnMoveBy,
    onResetOrder,
    isCustomOrder = false,
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
                            className="rounded-full bg-primary/15 px-1.5 text-xs text-primary-text tabular-nums"
                        >
                            {hiddenCount}
                        </span>
                    ) : null}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {listedColumns.map((column, index) => (
                    // I pulsanti stanno accanto alla voce e non dentro: in un
                    // `DropdownMenuCheckboxItem` ogni clic cambierebbe anche la spunta. Sono voci
                    // di menu a loro volta, così le frecce della tastiera ci arrivano.
                    <div key={column.key} className="flex items-center">
                        <DropdownMenuCheckboxItem
                            className="flex-1"
                            checked={!hiddenColumnKeys.includes(column.key)}
                            disabled={column.hideable === false}
                            // Il menu resta aperto: di solito se ne tolgono più d'una di fila.
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={(checked) => onColumnVisibleChange(column.key, checked === true)}
                        >
                            {column.header}
                        </DropdownMenuCheckboxItem>
                        {onColumnMoveBy ? (
                            <>
                                <DropdownMenuItem
                                    className="size-8 shrink-0 justify-center p-0"
                                    aria-label={`Sposta ${column.header} su`}
                                    disabled={index === 0}
                                    onSelect={(event) => {
                                        event.preventDefault();
                                        onColumnMoveBy(column.key, -1);
                                    }}
                                >
                                    <ChevronUp aria-hidden="true" className="size-4" />
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="size-8 shrink-0 justify-center p-0"
                                    aria-label={`Sposta ${column.header} giù`}
                                    disabled={index === listedColumns.length - 1}
                                    onSelect={(event) => {
                                        event.preventDefault();
                                        onColumnMoveBy(column.key, 1);
                                    }}
                                >
                                    <ChevronDown aria-hidden="true" className="size-4" />
                                </DropdownMenuItem>
                            </>
                        ) : null}
                    </div>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={hiddenCount === 0} onSelect={onShowAll}>
                    Mostra tutte
                </DropdownMenuItem>
                {onResetOrder ? (
                    <DropdownMenuItem disabled={!isCustomOrder} onSelect={onResetOrder}>
                        Ripristina ordine
                    </DropdownMenuItem>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default ColumnVisibilityMenu;
