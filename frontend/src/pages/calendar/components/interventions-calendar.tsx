import LoadingPage from "@/components/loadingPage";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getStoredCalendarView, setStoredCalendarView } from "@/lib/calendarView";
import CreateInterventionDialog, {
    type CreateInterventionSubmitValues,
} from "@/components/dialogs/create/createInterventionDialog";
import type { InterventionStatus } from "@/types/dtos";
import { addDays, endOfMonth, endOfWeek, format, getDay, parse, startOfMonth, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Calendar,
    dateFnsLocalizer,
    type EventPropGetter,
    type Messages,
    type SlotInfo,
    type View,
} from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "../calendar-theme.css";
import CalendarEventPopover from "./calendar-event-popover";
import { useNavigate } from "react-router-dom";
import type { CalendarRange, InterventionCalendarEvent } from "../hooks/useCalendarInterventions";

const locales = { it };

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    getDay,
    locales,
});

const messages: Messages = {
    date: "Data",
    time: "Ora",
    event: "Intervento",
    allDay: "Tutto il giorno",
    week: "Settimana",
    work_week: "Settimana lavorativa",
    day: "Giorno",
    month: "Mese",
    previous: "Indietro",
    next: "Avanti",
    yesterday: "Ieri",
    tomorrow: "Domani",
    today: "Oggi",
    agenda: "Agenda",
    noEventsInRange: "Nessun intervento programmato in questo intervallo.",
    showMore: (total) => `+${total} altri`,
};

// Stili inline: il CSS di react-big-calendar definisce già .rbc-event con la stessa
// specificità delle classi Tailwind e viene caricato dopo, quindi vincerebbe sempre lui.
const statusEventStyle: Record<InterventionStatus, { backgroundColor: string; color: string }> = {
    completato: { backgroundColor: "var(--color-green-500)", color: "#fff" },
    in_lavorazione: { backgroundColor: "var(--color-yellow-400)", color: "#fff" },
    programmato: { backgroundColor: "var(--color-red-500)", color: "#fff" },
};

const components = { event: CalendarEventPopover };

/**
 * Giorni effettivamente disegnati dalla vista corrente, che non coincidono con il mese di
 * calendario: la griglia mensile mostra anche la coda del mese precedente e l'inizio del
 * successivo. react-big-calendar li comunica come elenco di date (viste mese, settimana,
 * giorno) o come intervallo (vista agenda), ma solo quando si naviga: per il primo
 * intervallo vedi `initialRangeFor` qui sotto.
 */
const toCalendarRange = (range: Date[] | { start: Date; end: Date }): CalendarRange => {
    const days = Array.isArray(range) ? range : [range.start, range.end];
    const timestamps = days.map((day) => day.getTime());

    return {
        from: format(new Date(Math.min(...timestamps)), "yyyy-MM-dd"),
        to: format(new Date(Math.max(...timestamps)), "yyyy-MM-dd"),
    };
};

/**
 * Intervallo iniziale, calcolato qui perché react-big-calendar **non** chiama
 * `onRangeChange` al montaggio: nel suo sorgente parte solo da `handleNavigate` e
 * `handleViewChange`. Senza questo il calendario resterebbe vuoto fino al primo cambio di
 * mese — verificato osservando le richieste di rete, dove la chiamata con l'intervallo
 * compariva solo dopo aver premuto "Avanti".
 *
 * Riproduce le stesse regole delle viste della libreria, compresa la settimana che parte di
 * lunedì come impostato nel localizer. Un eventuale scarto durerebbe comunque solo fino alla
 * prima navigazione, che porta l'intervallo esatto.
 */
const initialRangeFor = (date: Date, view: View): CalendarRange => {
    if (view === "day") {
        return toCalendarRange([date]);
    }

    if (view === "week" || view === "work_week") {
        return toCalendarRange([startOfWeek(date, { weekStartsOn: 1 }), endOfWeek(date, { weekStartsOn: 1 })]);
    }

    if (view === "agenda") {
        // `length` di default nella vista agenda: 30 giorni a partire dalla data corrente.
        return toCalendarRange([date, addDays(date, 30)]);
    }

    // Vista mese: la griglia mostra anche la coda del mese precedente e l'inizio del successivo.
    return toCalendarRange([
        startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
        endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
    ]);
};

type Props = Readonly<{
    className?: string;
    events: InterventionCalendarEvent[];
    isLoading: boolean;
    /**
     * Primo caricamento: solo qui va il velo che copre il calendario. Dopo, ogni cambio di mese
     * ricarica gli interventi, e un velo su ogni cambio coprirebbe le frecce stesse con cui si
     * sta sfogliando.
     */
    isInitialLoading: boolean;
    onCreateIntervention: (values: CreateInterventionSubmitValues) => Promise<void> | void;
    onRangeChange: (range: CalendarRange) => void;
}>;

const InterventionsCalendar = ({
    className,
    events,
    isLoading,
    isInitialLoading,
    onCreateIntervention,
    onRangeChange,
}: Props) => {
    const navigate = useNavigate();
    const [view, setView] = useState<View>(() => getStoredCalendarView());
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [initialInterventionDate, setInitialInterventionDate] = useState("");

    // Solo al montaggio: da qui in poi è la libreria a comunicare l'intervallo navigando.
    const hasAnnouncedInitialRange = useRef(false);

    useEffect(() => {
        if (hasAnnouncedInitialRange.current) {
            return;
        }

        hasAnnouncedInitialRange.current = true;
        onRangeChange(initialRangeFor(new Date(), view));
    }, [onRangeChange, view]);

    const eventPropGetter = useMemo<EventPropGetter<InterventionCalendarEvent>>(
        () => (event) => ({
            style: statusEventStyle[event.resource.status],
        }),
        []
    );

    const handleViewChange = (nextView: View) => {
        setView(nextView);
        setStoredCalendarView(nextView);
    };

    // Il doppio click su una cella libera del calendario apre la creazione di un
    // nuovo intervento con la data precompilata; il click singolo (usato per il
    // drag-to-select) non deve aprire nulla.
    const handleSelectSlot = (slotInfo: SlotInfo) => {
        if (slotInfo.action !== "doubleClick") {
            return;
        }

        setInitialInterventionDate(format(slotInfo.start, "yyyy-MM-dd"));
        setIsCreateDialogOpen(true);
    };

    return (
        <Card className={cn("relative flex flex-col", className)} aria-busy={isLoading}>
            <CardContent
                className={cn(
                    "h-full overflow-x-auto",
                    isLoading && !isInitialLoading && "opacity-60 transition-opacity"
                )}
            >
                <Calendar
                    localizer={localizer}
                    culture="it"
                    events={events}
                    messages={messages}
                    view={view}
                    onView={handleViewChange}
                    eventPropGetter={eventPropGetter}
                    components={components}
                    onSelectEvent={(event) => navigate(`/interventions/${event.id}`)}
                    selectable
                    onSelectSlot={handleSelectSlot}
                    onRangeChange={(range) => onRangeChange(toCalendarRange(range))}
                    popup
                    style={{ height: "100%" }}
                />
            </CardContent>

            <CreateInterventionDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSubmit={onCreateIntervention}
                initialDate={initialInterventionDate}
            />

            {isInitialLoading ? (
                <LoadingPage className="absolute inset-0 z-10 rounded-2xl bg-background/70 backdrop-blur-sm" />
            ) : null}
        </Card>
    );
};

export default InterventionsCalendar;
