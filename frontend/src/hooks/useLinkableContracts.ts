import { useEffect, useMemo, useState } from "react";
import { getApiErrorMessage, getContract, listContracts } from "@/lib/api";
import { linkableContracts } from "@/lib/contracts";
import type { ContractDto, InterventionType } from "@/types/dtos";
import { toast } from "sonner";

type Params = {
    /** Senza cliente (non ancora scelto o non ancora risolto) non c'è niente da offrire. */
    customerId: number | null;
    type: InterventionType;
    date: string;
    /** Il contratto già collegato (modifica): vedi `linkableContracts`. */
    keepContractId?: number | null;
};

/** I contratti di un cliente caricati per l'ultima volta, con il cliente a cui si riferiscono. */
type Loaded = { customerId: number; keepContractId: number | null; contracts: ContractDto[] };

/**
 * I contratti di assistenza che si possono collegare a un intervento, per il menu "Contratto di
 * assistenza" dei dialoghi.
 *
 * Il server filtra cliente, tipo "assistenza" e stato "attivo" (`customerId`, `type`, `status`);
 * data e compatibilità del pacchetto con il tipo di intervento si controllano qui, perché
 * cambiano a ogni tocco del modulo e rifare la richiesta per ciascuno sarebbe uno spreco.
 * Si ricarica solo se cambia il cliente. Il server riapplica comunque le stesse regole al salvataggio.
 */
export const useLinkableContracts = ({ customerId, type, date, keepContractId = null }: Params) => {
    const [loaded, setLoaded] = useState<Loaded | null>(null);

    useEffect(() => {
        if (customerId == null) {
            return;
        }

        let cancelled = false;

        const load = async () => {
            try {
                const [page, kept] = await Promise.all([
                    listContracts({ customerId, type: "assistance", status: "active", pageSize: 200 }),
                    // Il contratto già collegato può non essere più "attivo" (scaduto): lo si chiede
                    // a parte per non perderlo dalle scelte.
                    keepContractId != null ? getContract(keepContractId) : Promise.resolve(null),
                ]);

                if (cancelled) {
                    return;
                }

                const contracts =
                    kept && !page.items.some((contract) => contract.id === kept.id)
                        ? [...page.items, kept]
                        : page.items;

                setLoaded({ customerId, keepContractId, contracts });
            } catch (error) {
                if (!cancelled) {
                    toast.error(getApiErrorMessage(error, "Impossibile caricare i contratti del cliente"));
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [customerId, keepContractId]);

    // Le risposte di un cliente precedente non si mostrano per quello nuovo.
    const isCurrent = loaded != null && loaded.customerId === customerId && loaded.keepContractId === keepContractId;

    const options = useMemo(
        () => (isCurrent ? linkableContracts(loaded.contracts, { type, date }, keepContractId) : []),
        [isCurrent, loaded, type, date, keepContractId]
    );

    return {
        /** I contratti validi per cliente, data e tipo correnti. */
        options,
        /** Vero quando l'elenco è quello del cliente attuale: finché non lo è non si deve azzerare la scelta. */
        isReady: isCurrent,
    };
};
