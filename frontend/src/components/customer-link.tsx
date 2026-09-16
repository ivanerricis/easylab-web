import { entityPaths } from "@/lib/entityPaths";
import { Link } from "react-router-dom";

/**
 * Il nome del cliente nelle schede di report e intervento, come link alla sua scheda.
 *
 * Prima era testo: per passare dal report al cliente (i suoi altri report, il telefono
 * secondario) bisognava tornare all'elenco clienti e cercarlo. Un link vero si apre anche in
 * un'altra scheda del browser, come gli "Apri" delle liste.
 */
const CustomerLink = ({ customerId, name }: { customerId: number; name: string }) => (
    <Link
        to={entityPaths.customer(customerId)}
        className="text-primary underline-offset-4 hover:underline focus-visible:underline"
    >
        {name}
    </Link>
);

export default CustomerLink;
