import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { formatInterventionStatus, formatInterventionType, interventionStatusColor } from "@/lib/interventions";
import { useState } from "react";
import type { EventProps } from "react-big-calendar";
import type { InterventionCalendarEvent } from "../hooks/useCalendarInterventions";
import StatusBadge from "@/components/status-badge";
import InterventionSchedule from "@/components/intervention-schedule";

// Il popover si apre al passaggio del mouse (o al focus da tastiera): il click resta
// libero di propagarsi fino a .rbc-event, che naviga al dettaglio dell'intervento.
const CalendarEventPopover = ({ event, title }: EventProps<InterventionCalendarEvent>) => {
    const [open, setOpen] = useState(false);
    const intervention = event.resource;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <span
                    className="block w-full truncate"
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                >
                    {title}
                </span>
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

export default CalendarEventPopover;
