import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ToolbarProps, View } from "react-big-calendar";

/**
 * Pulsanti uniti in un unico blocco: solo il primo e l'ultimo tengono gli angoli arrotondati, e
 * il bordo sinistro di ognuno si sovrappone a quello del vicino per non raddoppiarsi. `z-10` sul
 * focus perché altrimenti l'anello finirebbe sotto il pulsante accanto.
 */
const segmentClassName =
    "rounded-none first:rounded-l-md last:rounded-r-md not-first:-ml-px focus-visible:z-10 shadow-none";

/**
 * Barra del calendario disegnata con i `Button` dell'app al posto di quella della libreria, che
 * aveva pulsanti suoi (più bassi, testo e bordi diversi) e su mobile li centrava in righe minuscole
 * una sotto l'altra. Su desktop sta su una riga: navigazione, periodo, viste. Su mobile la
 * navigazione divide la prima riga con il periodo e le viste occupano tutta la seconda, a parti
 * uguali, così restano comode da toccare senza rubare altezza al calendario.
 *
 * Indietro e Avanti sono solo frecce, ma il nome accessibile resta quello dei `messages`, come
 * testo nascosto: i messaggi sono `ReactNode` e non si possono passare ad `aria-label`.
 * Generico sull'evento perché la barra non lo usa, e così si adatta a quello del calendario.
 */
const CalendarToolbar = <TEvent extends object>({
    label,
    localizer: { messages },
    onNavigate,
    onView,
    view,
    views,
}: ToolbarProps<TEvent>) => {
    // A runtime la libreria passa l'elenco dei nomi delle viste; il tipo ammette anche la forma a oggetto.
    const viewNames = (Array.isArray(views) ? views : Object.keys(views)) as View[];

    return (
        <div className="mb-3 grid grid-cols-[auto_1fr] items-center gap-2 sm:flex sm:justify-between">
            <div role="group" aria-label="Navigazione" className="flex">
                <Button
                    type="button"
                    variant="outline"
                    className={segmentClassName}
                    onClick={() => onNavigate("TODAY")}
                >
                    {messages.today}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={segmentClassName}
                    onClick={() => onNavigate("PREV")}
                >
                    <ChevronLeft aria-hidden />
                    <span className="sr-only">{messages.previous}</span>
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={segmentClassName}
                    onClick={() => onNavigate("NEXT")}
                >
                    <ChevronRight aria-hidden />
                    <span className="sr-only">{messages.next}</span>
                </Button>
            </div>

            {/*
             * `aria-live` annuncia il nuovo periodo a ogni cambio. Maiuscola solo sulla prima lettera
             * ("Settembre 2026"): `capitalize` avrebbe preso anche il mese in "21 – 27 settembre".
             */}
            <span
                aria-live="polite"
                className="block min-w-0 truncate text-right text-sm font-semibold first-letter:uppercase sm:flex-1 sm:text-center sm:text-base"
            >
                {label}
            </span>

            {viewNames.length > 1 ? (
                <div role="group" aria-label="Vista" className="col-span-2 flex sm:col-span-1">
                    {viewNames.map((name) => (
                        <Button
                            key={name}
                            type="button"
                            variant={view === name ? "default" : "outline"}
                            aria-pressed={view === name}
                            className={cn(segmentClassName, "flex-1 sm:flex-none", view === name && "border-primary")}
                            onClick={() => onView(name)}
                        >
                            {messages[name]}
                        </Button>
                    ))}
                </div>
            ) : null}
        </div>
    );
};

export default CalendarToolbar;
