import ContractLink from "@/components/contract-link";
import DetailItem from "@/components/detail-item";
import { getContract } from "@/lib/api";
import { formatContractPackage, formatDeviceNames } from "@/lib/contracts";
import type { ContractDto } from "@/types/dtos";
import { useEffect, useState } from "react";

/**
 * La riga "Contratto" della scheda dell'intervento, quando le sue ore sono imputate a un contratto.
 *
 * L'intervento porta solo l'id del contratto: la descrizione ("Remota - 10 h/mese - Notebook") si
 * chiede a parte. Finché non arriva (o se la richiesta fallisce) resta il solo numero, che è già un
 * collegamento valido: un contratto illeggibile non deve togliere la riga né far fallire la scheda.
 */
const InterventionContractItem = ({ contractId }: { contractId: number }) => {
    const [contract, setContract] = useState<ContractDto | null>(null);

    useEffect(() => {
        let cancelled = false;

        getContract(contractId)
            .then((loaded) => {
                if (!cancelled) {
                    setContract(loaded);
                }
            })
            .catch(() => {
                // Resta il solo numero: vedi sopra.
            });

        return () => {
            cancelled = true;
        };
    }, [contractId]);

    const shownContract = contract?.id === contractId ? contract : null;

    return (
        <DetailItem
            label="Contratto di assistenza"
            value={
                <ContractLink contractId={contractId}>
                    {shownContract
                        ? `#${contractId} ${formatContractPackage(shownContract)}${formatDeviceNames(shownContract.devices, " - ")}`
                        : `Contratto #${contractId}`}
                </ContractLink>
            }
        />
    );
};

export default InterventionContractItem;
