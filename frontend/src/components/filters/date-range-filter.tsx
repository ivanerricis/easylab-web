import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterX } from "lucide-react";

type DateRangeFilterProps = {
    dateFrom: string | undefined;
    onDateFromChange: (value: string | undefined) => void;
    dateTo: string | undefined;
    onDateToChange: (value: string | undefined) => void;
    /**
     * Azzera entrambe le date in un colpo solo. Non basta chiamare `onDateFromChange` e
     * `onDateToChange` in sequenza: in Report e Interventi entrambi scrivono nello stesso
     * `URLSearchParams` tramite `updateParams`, e due chiamate sincrone nello stesso gestore
     * leggono entrambe l'indirizzo di partenza — l'ultima vince e riscrive da sola quella
     * precedente, così "Pulisci date" toglieva solo la data di fine.
     */
    onClearDates: () => void;
    /**
     * `inline` (il default) sono i due campi in barra, con il trattino in mezzo. `stacked` è per
     * il pannello dei filtri su mobile: due colonne uguali con l'etichetta "Da"/"A" sopra, che
     * occupano una riga sola invece di due.
     */
    layout?: "inline" | "stacked";
    /**
     * Le etichette visibili dei due campi nel layout `stacked` (di serie "Da" e "A"). In
     * Esportazione diventano "Dal"/"Al", e fanno da etichette della riga di filtri insieme a
     * "Stato" e "Tipo". Il nome accessibile resta "Data di inizio"/"Data di fine".
     */
    stackedLabels?: { from: string; to: string };
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
const DateRangeFilter = ({
    dateFrom,
    onDateFromChange,
    dateTo,
    onDateToChange,
    onClearDates,
    layout = "inline",
    stackedLabels = { from: "Da", to: "A" },
}: DateRangeFilterProps) => {
    if (layout === "stacked") {
        return (
            <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5 text-sm font-medium">
                        {stackedLabels.from}
                        <Input
                            type="date"
                            aria-label="Data di inizio"
                            value={dateFrom ?? ""}
                            max={dateTo}
                            onChange={(event) => onDateFromChange(event.target.value || undefined)}
                            className="h-10 w-full"
                        />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                        {stackedLabels.to}
                        <Input
                            type="date"
                            aria-label="Data di fine"
                            value={dateTo ?? ""}
                            min={dateFrom}
                            onChange={(event) => onDateToChange(event.target.value || undefined)}
                            className="h-10 w-full"
                        />
                    </label>
                </div>
                {dateFrom || dateTo ? (
                    <Button
                        variant="ghost"
                        size="lg"
                        className="gap-2 self-start px-2"
                        onClick={onClearDates}
                        aria-label="Pulisci date"
                    >
                        <FilterX className="size-4" />
                        <span>Pulisci date</span>
                    </Button>
                ) : null}
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    type="date"
                    aria-label="Data di inizio"
                    value={dateFrom ?? ""}
                    max={dateTo}
                    onChange={(event) => onDateFromChange(event.target.value || undefined)}
                    // Sotto `md` il testo è a 16px (vedi `Input`, evita lo zoom automatico di
                    // iOS): misurato via `getComputedStyle` sul campo reale, a quella dimensione
                    // il controllo nativo riserva da solo ~32px di padding a destra per la sua
                    // icona, oltre al testo "31/12/2026" (~126px) — 144px fisse tagliavano
                    // cifre e icona. `flex-wrap` sul contenitore lascia che il secondo campo vada
                    // a capo da solo sui telefoni più stretti, invece di restringersi sotto la
                    // soglia leggibile.
                    className="h-10 w-44 md:w-40"
                />
                <span className="text-sm text-muted-foreground">-</span>
                <Input
                    type="date"
                    aria-label="Data di fine"
                    value={dateTo ?? ""}
                    min={dateFrom}
                    onChange={(event) => onDateToChange(event.target.value || undefined)}
                    className="h-10 w-44 md:w-40"
                />
            </div>

            {dateFrom || dateTo ? (
                <Button
                    variant="ghost"
                    size="lg"
                    className="gap-2 px-2 sm:ml-auto sm:px-4"
                    onClick={onClearDates}
                    aria-label="Pulisci date"
                >
                    <FilterX className="size-4" />
                    {/* Sempre visibile: sotto `sm` questo pulsante può finire da solo a
                        capo (vedi i commit di questo file), e senza testo sembra rotto. */}
                    <span>Pulisci date</span>
                </Button>
            ) : null}
        </>
    );
};

export default DateRangeFilter;
