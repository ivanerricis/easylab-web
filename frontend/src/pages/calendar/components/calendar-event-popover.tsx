import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { formatInterventionStatus, formatInterventionType, interventionStatusColor } from "@/lib/interventions";
import { getEventAccessibleLabel } from "../eventAccessibleLabel";
import type { InterventionDto } from "@/types/dtos";
import { isValidElement, useState, type ComponentProps, type ReactNode } from "react";
import type { EventProps, EventWrapperProps } from "react-big-calendar";
import type { InterventionCalendarEvent } from "../hooks/useCalendarInterventions";
import StatusBadge from "@/components/status-badge";
import InterventionSchedule from "@/components/intervention-schedule";

type DetailsPopoverProps = Omit<ComponentProps<typeof PopoverAnchor>, "asChild"> & {
    intervention: InterventionDto;
    children: ReactNode;
};

/**
 * Il riquadro con i dettagli, agganciato all'elemento che riceve il focus: si apre al passaggio
 * del mouse o al focus da tastiera. Prima era agganciato a uno `span` dentro l'evento, che non
 * poteva ricevere il focus: da tastiera il riquadro non si apriva mai. Il click resta libero di
 * arrivare all'evento, che naviga al dettaglio dell'intervento.
 *
 * Le altre prop (`tabIndex`, `role`, `aria-label`) passano all'elemento figlio insieme ai gestori.
 */
const InterventionDetailsPopover = ({ intervention, children, ...anchorProps }: DetailsPopoverProps) => {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor
                asChild
                {...anchorProps}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
            >
                {children}
            </PopoverAnchor>
            <PopoverContent
                className="w-80"
                onOpenAutoFocus={(autoFocusEvent) => autoFocusEvent.preventDefault()}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
            >
                <div className="grid gap-3">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="font-semibold">{intervention.customer}</p>
                            <p className="text-sm text-muted-foreground">{intervention.collaborator}</p>
                        </div>
                        <StatusBadge color={interventionStatusColor[intervention.status]}>
                            {formatInterventionStatus(intervention.status)}
                        </StatusBadge>
                    </div>

                    <div className="grid gap-1 text-sm">
                        <p>
                            <span className="text-muted-foreground">Tipo: </span>
                            {formatInterventionType(intervention.type)}
                        </p>
                        <p>
                            <span className="text-muted-foreground">Quando: </span>
                            <InterventionSchedule
                                interventionDate={intervention.interventionDate}
                                startTime={intervention.startTime}
                                endTime={intervention.endTime}
                            />
                        </p>
                    </div>

                    {intervention.description ? (
                        <p className="line-clamp-3 text-sm text-muted-foreground">{intervention.description}</p>
                    ) : null}
                </div>
            </PopoverContent>
        </Popover>
    );
};

/**
 * `eventWrapper` delle viste mese, settimana e giorno (e del popup "+N altri"): il figlio è il
 * riquadro `.rbc-event` della libreria. Nella vista mese quel riquadro non aveva `tabIndex`, e
 * con la tastiera non si raggiungeva nessun intervento; qui diventa un pulsante raggiungibile
 * con Tab, con il nome completo, e il riquadro dei dettagli si apre sul suo focus. Invio e
 * Spazio li gestisce `onKeyPressEvent` del calendario, che la libreria collega a quel riquadro.
 */
export const CalendarEventWrapper = ({
    event,
    children,
}: EventWrapperProps<InterventionCalendarEvent> & { children?: ReactNode }) => {
    if (!isValidElement(children)) {
        return <>{children}</>;
    }

    return (
        <InterventionDetailsPopover
            intervention={event.resource}
            tabIndex={0}
            role="button"
            aria-label={getEventAccessibleLabel(event)}
        >
            {children}
        </InterventionDetailsPopover>
    );
};

/**
 * L'evento nella vista agenda, dove la libreria non usa `eventWrapper` e non collega
 * `onKeyPressEvent`: lì il click lo ascolta la cella della tabella. Un `button` vero si
 * raggiunge con Tab e con Invio o Spazio produce un click, che risale alla cella e apre il
 * dettaglio come con il mouse. Va a capo invece di troncarsi: la tabella dell'agenda non ha
 * larghezze fisse, e una riga che non poteva andare a capo allargava la colonna oltre il
 * riquadro, tagliando il nome su mobile.
 */
export const AgendaEvent = ({ event, title }: EventProps<InterventionCalendarEvent>) => (
    <InterventionDetailsPopover intervention={event.resource} aria-label={getEventAccessibleLabel(event)}>
        <button
            type="button"
            className="cursor-pointer rounded-sm text-left [overflow-wrap:anywhere] whitespace-normal focus-outline"
        >
            {title}
        </button>
    </InterventionDetailsPopover>
);
