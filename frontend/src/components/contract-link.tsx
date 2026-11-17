import { entityPaths } from "@/lib/entityPaths";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Il collegamento alla scheda di un contratto: nella scheda dell'intervento che lo consuma e nelle
 * righe degli elenchi. Come `CustomerLink`, è un link vero e non un pulsante, così si apre anche in
 * un'altra scheda del browser.
 */
const ContractLink = ({
    contractId,
    className,
    children,
}: {
    contractId: number;
    className?: string;
    children: ReactNode;
}) => (
    <Link
        to={entityPaths.contract(contractId)}
        className={cn("text-primary-text underline-offset-4 hover:underline focus-visible:underline", className)}
    >
        {children}
    </Link>
);

export default ContractLink;
