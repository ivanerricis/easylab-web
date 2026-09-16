import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterX } from "lucide-react";

type DateRangeFilterProps = {
    dateFrom: string | undefined;
    onDateFromChange: (value: string | undefined) => void;
    dateTo: string | undefined;
    onDateToChange: (value: string | undefined) => void;
};

/**
 * Intervallo di date per filtrare un elenco, con il pulsante che lo azzera.
 *
 * Il vincolo "inizio ≤ fine" è espresso con `max`/`min` incrociati fra i due campi, così è
 * il selettore del browser stesso a impedire la combinazione impossibile invece di
 * segnalarla dopo. È il motivo per cui questo componente esiste: report e interventi ne
 * avevano due copie identiche carattere per carattere, e quella regola è comportamento,
 * non impaginazione — due copie di una regola sono due occasioni perché una cambi da sola.
 */
const DateRangeFilter = ({ dateFrom, onDateFromChange, dateTo, onDateToChange }: DateRangeFilterProps) => {
    const handleClearDates = () => {
        onDateFromChange(undefined);
        onDateToChange(undefined);
    };

    return (
        <>
            <div className="flex items-center gap-2">
                <Input
                    type="date"
                    aria-label="Data di inizio"
                    value={dateFrom ?? ""}
                    max={dateTo}
                    onChange={(event) => onDateFromChange(event.target.value || undefined)}
                    // 40px come gli altri controlli della barra (vedi `SearchInput`).
                    className="h-10 w-36 sm:w-40"
                />
                <span className="text-sm text-muted-foreground">-</span>
                <Input
                    type="date"
                    aria-label="Data di fine"
                    value={dateTo ?? ""}
                    min={dateFrom}
                    onChange={(event) => onDateToChange(event.target.value || undefined)}
                    className="h-10 w-36 sm:w-40"
                />
            </div>

            {dateFrom || dateTo ? (
                <Button
                    variant="ghost"
                    size="lg"
                    className="gap-2 px-2 sm:ml-auto sm:px-4"
                    onClick={handleClearDates}
                    aria-label="Pulisci date"
                >
                    <FilterX className="size-4" />
                    <span className="hidden sm:inline">Pulisci date</span>
                </Button>
            ) : null}
        </>
    );
};

export default DateRangeFilter;
