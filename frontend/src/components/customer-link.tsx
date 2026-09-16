import { entityPaths } from "@/lib/entityPaths";
import { cn } from "@/lib/utils";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

type CustomerLinkProps = {
    customerId: number;
    name: string;
    /**
     * `inherit` tiene il colore del testo intorno e segna il link solo con la sottolineatura:
     * serve nelle righe delle tabelle, colorate in base allo stato, dove il blu dei link su
     * rosso o verde si leggerebbe male.
     */
    tone?: "primary" | "inherit";
    className?: string;
};

/**
 * Il nome del cliente come link alla sua scheda: nell'intestazione delle schede di report e
 * intervento, e nelle righe delle liste.
 *
 * Prima era testo: per passare dal report al cliente (i suoi altri report, il telefono
 * secondario) bisognava tornare all'elenco clienti e cercarlo. Un link vero si apre anche in
 * un'altra scheda del browser, come gli "Apri" delle liste.
 */
const CustomerLink = ({ customerId, name, tone = "primary", className }: CustomerLinkProps) => (
    <Link
        to={entityPaths.customer(customerId)}
        // Nelle righe il doppio clic apre il report: su questo link il gesto è già "apri il
        // cliente", e il secondo clic non deve arrivare alla riga.
        onDoubleClick={(event: MouseEvent) => event.stopPropagation()}
        className={cn(
            "underline-offset-4 focus-visible:underline",
            tone === "primary"
                ? "text-primary hover:underline"
                : "underline decoration-current/40 hover:decoration-current",
            className
        )}
    >
        {name}
    </Link>
);

export default CustomerLink;
