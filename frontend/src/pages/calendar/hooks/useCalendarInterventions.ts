import { getApiErrorMessage, listInterventions } from "@/lib/api";
import { formatInterventionType } from "@/lib/interventions";
import type { InterventionDto } from "@/types/dtos";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type InterventionCalendarEvent = {
    id: number;
    title: string;
    start: Date;
    end: Date;
    allDay?: boolean;
    resource: InterventionDto;
};

const toEventDate = (interventionDate: string, time: string) => new Date(`${interventionDate}T${time}`);

const toCalendarEvent = (intervention: InterventionDto): InterventionCalendarEvent => {
    const title = `${intervention.customer} · ${formatInterventionType(intervention.type)}`;

    if (intervention.interventionDate && intervention.startTime && intervention.endTime) {
        return {
            id: intervention.id,
            title,
            start: toEventDate(intervention.interventionDate, intervention.startTime),
            end: toEventDate(intervention.interventionDate, intervention.endTime),
            resource: intervention,
        };
    }

    // Le consegne materiale hanno solo una data (senza orario). I record creati prima
    // dell'introduzione di questo campo non hanno interventionDate: in quel caso si usa
    // la data di creazione come ripiego.
    const fallbackDate = intervention.interventionDate
        ? new Date(`${intervention.interventionDate}T00:00:00`)
        : new Date(intervention.createdAt);

    return {
        id: intervention.id,
        title,
        start: fallbackDate,
        end: fallbackDate,
        allDay: true,
        resource: intervention,
    };
};

export type CalendarRange = { from: string; to: string };

/**
 * Interventi da mostrare nel calendario, limitati all'intervallo che il calendario sta
 * visualizzando.
 *
 * Prima l'elenco veniva chiesto per intero, e `takeUnpaginated` lo tagliava a 5000 righe: con
 * più interventi di così quelli in eccesso sparivano dal calendario senza alcun errore, solo
 * un avviso nei log del server. Chiedere il periodo visibile risolve il troncamento ed è
 * anche molto più leggero — il browser riceve qualche decina di KB invece di quasi due MB.
 *
 * `range` arriva dal calendario stesso (`onRangeChange`), che è l'unico a sapere quali giorni
 * sta disegnando: la vista mensile, per esempio, mostra anche la coda del mese precedente e
 * l'inizio del successivo. Finché è `null` non si carica nulla: il primo intervallo arriva
 * al montaggio del componente, quindi si evita una richiesta iniziale sull'intervallo
 * sbagliato.
 */
export const useCalendarInterventions = (range: CalendarRange | null) => {
    const [events, setEvents] = useState<InterventionCalendarEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    // Come in usePaginatedRows: un reload richiesto dopo una modifica può risolversi
    // prima di quello che ha superato, quindi vale solo la risposta più recente.
    const latestRequestIdRef = useRef(0);

    // E, sempre come lì, la richiesta superata viene anche annullata invece che solo
    // ignorata: sfogliando i mesi in fretta ne partiva una per mese attraversato, e il
    // server le completava tutte.
    const inFlightRef = useRef<AbortController | null>(null);

    const loadEvents = useCallback(async () => {
        if (!range) {
            return;
        }

        const requestId = latestRequestIdRef.current + 1;
        latestRequestIdRef.current = requestId;

        inFlightRef.current?.abort();
        const controller = new AbortController();
        inFlightRef.current = controller;

        setIsLoading(true);

        try {
            const interventions = await listInterventions({
                scheduledFrom: range.from,
                scheduledTo: range.to,
                pageSize: 1000,
                signal: controller.signal,
            });

            if (requestId !== latestRequestIdRef.current) {
                return;
            }

            // Il periodo visibile sta comodamente sotto il tetto di righe, ma se un giorno
            // non ci stesse è meglio dirlo: un calendario che tace e mostra solo una parte
            // degli interventi è esattamente il difetto che questa modifica ha corretto.
            if (interventions.totalItems > interventions.items.length) {
                toast.warning(
                    `Nel periodo mostrato ci sono ${interventions.totalItems} interventi: ne vengono disegnati ` +
                        `${interventions.items.length}. Passa alla vista settimana o giorno per vederli tutti.`
                );
            }

            setEvents(interventions.items.map(toCalendarEvent));
        } catch (error) {
            // La richiesta annullata allo smontaggio è ancora la più recente: senza questo
            // controllo l'annullamento passerebbe per un errore di rete.
            if (controller.signal.aborted || requestId !== latestRequestIdRef.current) {
                return;
            }

            toast.error(getApiErrorMessage(error, "Impossibile caricare gli interventi"));
        } finally {
            if (!controller.signal.aborted && requestId === latestRequestIdRef.current) {
                setIsLoading(false);
                setHasLoadedOnce(true);
            }
        }
    }, [range]);

    useEffect(() => {
        startTransition(() => {
            void loadEvents();
        });
    }, [loadEvents]);

    useEffect(
        () => () => {
            inFlightRef.current?.abort();
        },
        []
    );

    return {
        events,
        isLoading,
        /**
         * Primo caricamento: solo qui ha senso il velo che copre il calendario, perché sotto non
         * c'è ancora niente. Dopo, cambiare mese ricarica gli interventi e il velo coprirebbe
         * anche le frecce con cui si cambia mese.
         */
        isInitialLoading: isLoading && !hasLoadedOnce,
        loadEvents,
    };
};
