import LoadingPage from "@/components/loadingPage";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { entityPaths } from "@/lib/entityPaths";
import { getStoredCalendarView, setStoredCalendarView } from "@/lib/calendarView";
import { lazyWithPrefetch, useHasBeenOpen, usePrefetchWhenIdle } from "@/lib/lazyDialog";
import type { CreateInterventionSubmitValues } from "@/components/dialogs/create/createInterventionDialog";
import type { InterventionStatus } from "@/types/dtos";
import { addDays, endOfMonth, endOfWeek, format, getDay, parse, startOfMonth, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import {
    memo,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    Suspense,
    type SyntheticEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    type AgendaTimeProps,
    Calendar,
    type Components,
    dateFnsLocalizer,
    type EventPropGetter,
    type Formats,
    type Messages,
    type SlotInfo,
    type View,
} from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "../calendar-theme.css";
import { AgendaEvent, CalendarEventWrapper } from "./calendar-event-popover";
import CalendarToolbar from "./calendar-toolbar";
import { useNavigate } from "react-router-dom";
import type { CalendarRange, InterventionCalendarEvent } from "../hooks/useCalendarInterventions";

/**
 * Il dialogo di creazione si scarica solo quando serve (con il modulo, il campo cliente e il
 * dialogo del nuovo cliente sono ~43 KB compressi) e non rallenta la prima apertura della
 * dashboard; `prefetchCreateInterventionDialog` lo chiede in anticipo, a pagina ferma, così al
 * doppio clic su un giorno l'animazione di apertura non aspetta la rete.
 */
const { Component: CreateInterventionDialog, prefetch: prefetchCreateInterventionDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/create/createInterventionDialog")
);

/**
 * Settimana e giorno si aprono sulle 8, non a mezzanotte: la griglia partiva dall'alba e per
 * vedere la prima ora di lavoro bisognava ogni volta scorrere. Conta solo l'ora, il giorno no.
 */
const scrollToEightAm = new Date(1970, 0, 1, 8, 0);

const locales = { it };

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    getDay,
    locales,
});

/**
 * Un intervallo di giorni come lo si scrive in italiano: "21 – 27 settembre 2026", "28 settembre –
 * 4 ottobre 2026"; l'anno compare anche sulla prima data solo se l'intervallo lo attraversa
 * ("28 dicembre 2026 – 3 gennaio 2027"). Il formato di serie della libreria
 * seguiva l'ordine inglese ("settembre 21 – 27") e l'agenda mostrava due date numeriche
 * ("24/09/2026 – 24/10/2026").
 */
const formatDayRange = ({ start, end }: { start: Date; end: Date }) => {
    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    const startText = format(start, sameMonth ? "d" : sameYear ? "d MMMM" : "d MMMM yyyy", { locale: it });

    return `${startText} – ${format(end, "d MMMM yyyy", { locale: it })}`;
};

const formats: Formats = {
    dayRangeHeaderFormat: formatDayRange,
    agendaHeaderFormat: formatDayRange,
};

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

/**
 * L'orario nella vista agenda. Le consegne materiale non hanno un orario, e la libreria
 * scriveva "tutto il giorno" su ognuna: su un elenco fatto quasi solo di consegne era la
 * stessa scritta ripetuta a ogni riga, in una colonna che su mobile toglieva spazio al nome.
 * Il trattino dice lo stesso ("nessun orario") e lo dice anche agli screen reader.
 *
 * Gli orari sono due blocchi che non si spezzano: su mobile la cella va a capo (vedi
 * `calendar-theme.css`) e senza questa divisione il trattino finiva da solo su una riga.
 */
const AgendaTime = ({ event, label }: AgendaTimeProps) => {
    if (event.allDay) {
        return <span aria-label="Senza orario">—</span>;
    }

    if (!event.start || !event.end) {
        return <>{label}</>;
    }

    return (
        <span className="inline-flex flex-wrap gap-x-1">
            <span className="whitespace-nowrap">{format(event.start, "HH:mm")}</span>
            <span className="whitespace-nowrap">– {format(event.end, "HH:mm")}</span>
        </span>
    );
};

// Tipizzato sull'evento: la barra è generica, e senza questo il calendario lo dedurrebbe come `object`.
// `eventWrapper` e non `event`: il riquadro da rendere raggiungibile con Tab (e a cui agganciare
// i dettagli) è `.rbc-event`, che la libreria disegna fuori dal componente `event`.
const components: Components<InterventionCalendarEvent> = {
    eventWrapper: CalendarEventWrapper,
    toolbar: CalendarToolbar,
    agenda: { time: AgendaTime, event: AgendaEvent },
};

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
    // La data mostrata è tenuta qui e non lasciata alla libreria: il suo stato interno passa da
    // `uncontrollable`, che sotto `StrictMode` (vedi `main.tsx`) si crede smontato dopo il finto
    // smontaggio di prova e da lì ignora ogni cambio. In sviluppo "Avanti" chiedeva così gli
    // interventi del mese dopo ma la griglia e il titolo restavano su quello corrente.
    const [date, setDate] = useState(() => new Date());
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const hasOpenedCreateDialog = useHasBeenOpen(isCreateDialogOpen);
    const [initialInterventionDate, setInitialInterventionDate] = useState("");
    // Il tipo dell'ultimo puntatore premuto sul calendario: la stessa azione della libreria
    // ("select") è un trascinamento col mouse ma una pressione lunga col dito.
    const lastPointerTypeRef = useRef<string | null>(null);
    // Il "+N altri" che ha aperto il popup, per rimettergli il focus quando il popup si chiude.
    const lastShowMoreButtonRef = useRef<HTMLElement | null>(null);

    // Solo al montaggio: da qui in poi è la libreria a comunicare l'intervallo navigando.
    const hasAnnouncedInitialRange = useRef(false);

    useEffect(() => {
        if (hasAnnouncedInitialRange.current) {
            return;
        }

        hasAnnouncedInitialRange.current = true;
        onRangeChange(initialRangeFor(new Date(), view));
    }, [onRangeChange, view]);

    // Il dialogo di creazione si scarica quando il browser non ha altro da fare: a quel punto il
    // calendario è già disegnato, e il primo doppio clic lo trova pronto.
    usePrefetchWhenIdle(prefetchCreateInterventionDialog);

    /**
     * Esc chiude il popup "+N altri". La libreria non lo fa: il suo popup si chiude solo con un
     * clic fuori (un `mousedown` sul documento, vedi `useClickOutside` di react-big-calendar), e
     * lo stato che lo tiene aperto è interno alla vista mese, senza una prop per chiuderlo. Qui
     * si simula proprio quel clic fuori, poi il focus torna al "+N altri" che l'aveva aperto
     * invece di perdersi sulla pagina.
     */
    useEffect(() => {
        const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
            // Il popup non sta nel calendario: la libreria lo porta in fondo al `body`.
            if (keyboardEvent.key !== "Escape" || !document.querySelector(".rbc-overlay")) {
                return;
            }

            document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

            const showMoreButton = lastShowMoreButtonRef.current;
            if (showMoreButton?.isConnected) {
                showMoreButton.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

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
    //
    // Sul telefono il doppio click non arriva mai: la libreria ignora i tocchi brevi e riconosce
    // solo la pressione lunga (250ms), che le arriva come "click" se il dito resta fermo e come
    // "select" se si trascina. Col dito entrambe valgono quindi come il doppio click: prima su
    // mobile non c'era alcun modo di creare un intervento dal calendario.
    const handleSelectSlot = (slotInfo: SlotInfo) => {
        const isTouchLongPress =
            lastPointerTypeRef.current === "touch" && (slotInfo.action === "select" || slotInfo.action === "click");

        if (slotInfo.action !== "doubleClick" && !isTouchLongPress) {
            return;
        }

        setInitialInterventionDate(format(slotInfo.start, "yyyy-MM-dd"));
        setIsCreateDialogOpen(true);
    };

    // Invio e Spazio sull'evento aprono il dettaglio, come il click. Spazio senza
    // `preventDefault` farebbe anche scorrere la pagina. Il tipo della libreria è un evento
    // generico, ma arriva sempre da un `onKeyDown`.
    const handleKeyPressEvent = (event: InterventionCalendarEvent, keyEvent: SyntheticEvent<HTMLElement>) => {
        const { nativeEvent } = keyEvent;
        if (!(nativeEvent instanceof KeyboardEvent) || (nativeEvent.key !== "Enter" && nativeEvent.key !== " ")) {
            return;
        }

        keyEvent.preventDefault();
        navigate(entityPaths.intervention(event.id));
    };

    const handlePointerDownCapture = (pointerEvent: ReactPointerEvent) => {
        lastPointerTypeRef.current = pointerEvent.pointerType;
    };

    // Il "+N altri" aperto da tastiera (un click con `detail` 0) porta il focus sul primo
    // intervento del popup: la libreria lo disegna in fondo al `body`, e con Tab ci si
    // arrivava solo dopo aver attraversato tutto il resto della pagina.
    const handleClickCapture = (mouseEvent: ReactMouseEvent) => {
        if (!(mouseEvent.target instanceof Element)) {
            return;
        }

        const showMoreButton = mouseEvent.target.closest<HTMLElement>(".rbc-show-more");
        if (!showMoreButton) {
            return;
        }

        lastShowMoreButtonRef.current = showMoreButton;

        if (mouseEvent.detail === 0) {
            requestAnimationFrame(() => {
                document.querySelector<HTMLElement>(".rbc-overlay .rbc-event")?.focus();
            });
        }
    };

    return (
        <Card className={cn("relative flex min-w-0 flex-col", className)} aria-busy={isLoading}>
            {/*
             * Niente `overflow-x-auto` qui: faceva scorrere in orizzontale anche la barra con
             * frecce e viste, che su mobile usciva dallo schermo appena si scorreva la griglia.
             * Ora scorrono solo le viste mese e settimana/giorno (vedi `calendar-theme.css`).
             * Sotto `sm` il margine interno scende a 12px: lo spazio va alla griglia.
             */}
            <CardContent
                className={cn(
                    "h-full min-w-0 max-sm:px-3",
                    isLoading && !isInitialLoading && "opacity-60 transition-opacity"
                )}
                onPointerDownCapture={handlePointerDownCapture}
                onClickCapture={handleClickCapture}
            >
                <Calendar
                    localizer={localizer}
                    culture="it"
                    events={events}
                    messages={messages}
                    formats={formats}
                    view={view}
                    onView={handleViewChange}
                    date={date}
                    onNavigate={setDate}
                    eventPropGetter={eventPropGetter}
                    components={components}
                    onSelectEvent={(event) => navigate(entityPaths.intervention(event.id))}
                    onKeyPressEvent={handleKeyPressEvent}
                    selectable
                    onSelectSlot={handleSelectSlot}
                    onRangeChange={(range) => onRangeChange(toCalendarRange(range))}
                    scrollToTime={scrollToEightAm}
                    popup
                    style={{ height: "100%" }}
                />
            </CardContent>

            {hasOpenedCreateDialog ? (
                <Suspense fallback={null}>
                    <CreateInterventionDialog
                        open={isCreateDialogOpen}
                        onOpenChange={setIsCreateDialogOpen}
                        onSubmit={onCreateIntervention}
                        initialDate={initialInterventionDate}
                    />
                </Suspense>
            ) : null}

            {isInitialLoading ? (
                <LoadingPage className="absolute inset-0 z-10 rounded-2xl bg-background/70 backdrop-blur-sm" />
            ) : null}
        </Card>
    );
};

/**
 * `memo`: la dashboard si ridisegna a ogni cambio del mese degli incassi e a ogni contatore
 * caricato, e ogni volta ridisegnava anche tutta la griglia del calendario, che è la parte più
 * pesante della pagina. Le prop che le passa restano le stesse fra un ridisegno e l'altro
 * (`useCallback` sulla creazione e sul cambio di intervallo).
 */
export default memo(InterventionsCalendar);
