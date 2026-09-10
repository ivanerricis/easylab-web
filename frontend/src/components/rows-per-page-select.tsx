import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tableRowsPerPageOptions, type TableRowsPerPageKey } from "@/lib/theme";

type RowsPerPageSelectProps = {
    value: TableRowsPerPageKey;
    onValueChange: (value: TableRowsPerPageKey) => void;
    /** Nasconde l'etichetta "Righe per pagina": su mobile serve al numero il posto che libera. */
    compact?: boolean;
};

/**
 * Selettore delle righe per pagina, accanto al conteggio dei risultati.
 *
 * Non riusa `FilterSelect` perché quello è generico su `TValue extends string`, mentre qui
 * i valori sono numerici (`10 | 20 | 50`): passare da una parte all'altra richiederebbe una
 * conversione a ogni chiamata. Le classi del trigger restano però le stesse, per non avere
 * due menu a tendina di larghezza diversa nella stessa pagina.
 */
const RowsPerPageSelect = ({ value, onValueChange, compact = false }: RowsPerPageSelectProps) => {
    return (
        <div className="flex items-center gap-2">
            {compact ? null : <span className="text-sm whitespace-nowrap text-muted-foreground">Righe per pagina</span>}
            <Select value={String(value)} onValueChange={(next) => onValueChange(Number(next) as TableRowsPerPageKey)}>
                <SelectTrigger className="w-auto px-2" aria-label="Righe per pagina" size="sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                    {tableRowsPerPageOptions.map((option) => (
                        <SelectItem key={option.key} value={String(option.key)}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};

export default RowsPerPageSelect;
