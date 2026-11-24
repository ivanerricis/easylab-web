import type { InterventionFormState } from "@/lib/interventionForm";
import type { ContractDto, LinkedDeviceDto } from "@/types/dtos";
import { startTransition, useEffect, useState, type Dispatch, type SetStateAction } from "react";

type Params<T extends InterventionFormState> = {
    values: T;
    setValues: Dispatch<SetStateAction<T>>;
    /** I contratti collegabili (`useLinkableContracts`): ognuno porta i suoi dispositivi. */
    contractOptions: ContractDto[];
    /** Finché i contratti non sono arrivati non si può dire se il dispositivo scelto sia ancora valido. */
    areContractsReady: boolean;
    /** Con un solo dispositivo lo si sceglie già (creazione); in modifica un vecchio intervento resta com'è. */
    preselectSingle: boolean;
    /** Cambia a ogni apertura del dialogo (di norma `open`): azzera la memoria delle proposte già fatte. */
    resetKey: unknown;
};

/**
 * Il campo "Dispositivo" dell'intervento: i dispositivi del contratto scelto, che sono le sole scelte
 * valide (il server rifiuta qualunque altro). Restituisce l'elenco per il campo, vuoto se non c'è
 * contratto o se il contratto non ha dispositivi, e tiene il valore coerente:
 * - cambiando contratto, un dispositivo che non è fra quelli del nuovo si toglie da solo;
 * - con un solo dispositivo nel contratto lo si propone già, una volta per contratto: se l'utente lo
 *   toglie non torna (come per il contratto stesso, vedi `CreateInterventionDialog`).
 */
export const useInterventionDeviceChoice = <T extends InterventionFormState>({
    values,
    setValues,
    contractOptions,
    areContractsReady,
    preselectSingle,
    resetKey,
}: Params<T>): LinkedDeviceDto[] => {
    const { contractId, customerDeviceId } = values;
    const choices =
        contractId === ""
            ? []
            : (contractOptions.find((contract) => String(contract.id) === contractId)?.devices ?? []);
    const isStale =
        customerDeviceId !== "" &&
        (contractId === "" || (areContractsReady && !choices.some((device) => String(device.id) === customerDeviceId)));
    const [preselectedFor, setPreselectedFor] = useState<string | null>(null);
    const onlyDeviceId = choices.length === 1 ? String(choices[0].id) : null;

    // Alla riapertura del dialogo il modulo riparte da capo: la proposta torna possibile.
    useEffect(() => {
        startTransition(() => setPreselectedFor(null));
    }, [resetKey]);

    useEffect(() => {
        if (isStale) {
            startTransition(() => setValues((prev) => ({ ...prev, customerDeviceId: "" })));
            return;
        }

        if (
            preselectSingle &&
            onlyDeviceId != null &&
            customerDeviceId === "" &&
            contractId !== "" &&
            preselectedFor !== contractId
        ) {
            startTransition(() => {
                setValues((prev) => ({ ...prev, customerDeviceId: onlyDeviceId }));
                setPreselectedFor(contractId);
            });
        }
    }, [isStale, onlyDeviceId, customerDeviceId, contractId, preselectedFor, preselectSingle, setValues]);

    return choices;
};
