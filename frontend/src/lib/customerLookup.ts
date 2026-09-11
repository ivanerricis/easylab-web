import { listCustomers } from "@/lib/api";
import { resolveSelectedCustomer } from "@/lib/customers";
import type { CustomerDto } from "@/types/dtos";

/**
 * Quanti candidati chiedere al server per ogni tentativo. Il testo cercato è un telefono o
 * una parola del nome, quindi i risultati sono pochi; il tetto serve solo ad accorgersi dei
 * casi in cui non lo sono (vedi `findCustomerByText`).
 */
export const customerCandidatePageSize = 1000;

/**
 * I termini con cui cercare sul server il cliente scritto nella casella, dal più selettivo.
 *
 * La ricerca clienti del server confronta ogni colonna per conto suo (nome, cognome,
 * telefono...), quindi "Mario Rossi - 333 1234567" intero non trova nessuno. Si cerca prima il
 * telefono, che identifica quasi sempre un cliente solo, poi la parola più lunga del nome, che
 * di solito è la più rara; a parità di lunghezza l'ultima, cioè di norma il cognome ("Rossi"
 * restringe più di "Mario"). "N/D" è il segnaposto di `formatCustomerOption` per chi non ha
 * telefono, non un numero.
 */
export const customerSearchTerms = (rawValue: string): string[] => {
    const [namePart = "", phonePart] = rawValue.split(" - ");
    const phone = phonePart?.trim();
    const longestWord = namePart
        .trim()
        .split(/\s+/)
        .reduce((longest, word) => (word.length >= longest.length ? word : longest), "");

    const terms = [phone && phone.toUpperCase() !== "N/D" ? phone : "", longestWord];

    return terms.filter((term, index) => term !== "" && terms.indexOf(term) === index);
};

/**
 * Il cliente corrispondente a quello che è scritto nella casella, cercato sul server.
 *
 * Serve quando il testo non è stato scelto dai suggerimenti (il dialogo non ha quindi un id):
 * prima si scaricava `listCustomers()` intero e ci si cercava dentro, ma senza paginazione
 * quell'elenco si ferma a 5000 righe, e un cliente oltre la cinquemillesima risultava "non
 * esistente". Ora si chiedono al server solo i candidati, e fra quelli decide la stessa
 * `resolveSelectedCustomer` di prima: stesso confronto, stessi messaggi sui doppioni.
 *
 * Se i candidati sono più di quanti se ne sono chiesti non si sceglie: fra quelli rimasti fuori
 * potrebbe esserci un omonimo, e scegliere il primo trovato vorrebbe dire intestare il report
 * alla persona sbagliata senza accorgersene.
 *
 * Limite noto: il server non ignora gli accenti, quindi "Nicolo" scritto a mano non trova
 * "Nicolò". Scegliendo dai suggerimenti il problema non si pone.
 */
export const findCustomerByText = async (rawValue: string): Promise<CustomerDto | null> => {
    for (const term of customerSearchTerms(rawValue)) {
        const { items, totalItems } = await listCustomers({
            page: 1,
            pageSize: customerCandidatePageSize,
            search: term,
        });

        if (totalItems > items.length) {
            throw new Error("Troppi clienti corrispondono a quello che hai scritto: sceglilo dai suggerimenti.");
        }

        const customer = resolveSelectedCustomer(items, rawValue);

        if (customer) {
            return customer;
        }
    }

    return null;
};

/**
 * L'id del cliente da usare per creare un report o un intervento: quello già risolto dal
 * dialogo, altrimenti quello cercato a partire dal testo. Stava in tre copie (report,
 * intervento dalla dashboard, intervento dalla pagina Interventi), e una delle tre confrontava
 * il testo in modo diverso dalle altre due.
 */
export const resolveCustomerId = async (customerId: number | null, rawValue: string): Promise<number> => {
    if (customerId != null) {
        return customerId;
    }

    const customer = await findCustomerByText(rawValue);

    if (!customer) {
        throw new Error("Seleziona un cliente esistente o creane uno nuovo.");
    }

    return customer.id;
};
