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
 * uguali, così restano comode da toccare senza rubare altezza al calendario. Nei contenitori più
 * stretti (un telefono da 320px) il periodo prende una riga sua, vedi sotto.
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
        // `@container` su un involucro a parte: una query di contenitore guarda un antenato, non
        // l'elemento stesso. Anche il passaggio a una riga sola segue il contenitore e non lo
        // schermo: a 768px con la barra laterale aperta il calendario ha ~440px, e con `sm:` la
        // riga unica schiacciava il periodo fino a farlo finire sotto i pulsanti delle viste.
        // Navigazione, periodo e viste stanno comodi insieme da 40rem in su.
        <div className="@container mb-3">
            <div className="grid grid-cols-[auto_1fr] items-center gap-2 @min-[40rem]:flex @min-[40rem]:justify-between">
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
                 *
                 * Niente `truncate`: accanto alle frecce, su un telefono, il periodo della settimana
                 * ("28 settembre – 4 ottobre 2026") restava tagliato fino a "S…" e non si capiva più
                 * quale settimana fosse. Ora va a capo accanto alle frecce (`text-balance` divide le
                 * righe in parti simili): due righe di testo sono alte quanto i pulsanti, e la barra
                 * non cresce. Sotto i 18rem di contenitore (un telefono da 320px) accanto alle frecce
                 * restano meno di 8rem, e il periodo prende una riga sua, sopra, centrato.
                 */}
                <span
                    aria-live="polite"
                    className="block min-w-0 text-right text-sm font-semibold text-balance first-letter:uppercase @max-[18rem]:order-first @max-[18rem]:col-span-2 @max-[18rem]:text-center @min-[40rem]:flex-1 @min-[40rem]:text-center @min-[40rem]:text-base"
                >
                    {label}
                </span>

                {viewNames.length > 1 ? (
                    <div role="group" aria-label="Vista" className="col-span-2 flex @min-[40rem]:col-span-1">
                        {viewNames.map((name) => (
                            <Button
                                key={name}
                                type="button"
                                variant={view === name ? "default" : "outline"}
                                aria-pressed={view === name}
                                className={cn(
                                    segmentClassName,
                                    "flex-1 @min-[40rem]:flex-none",
                                    view === name && "border-primary"
                                )}
                                onClick={() => onView(name)}
                            >
                                {messages[name]}
                            </Button>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default CalendarToolbar;
