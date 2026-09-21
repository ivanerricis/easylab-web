/**
 * I contenitori che fanno scorrere una lista, dal più interno al più esterno: il contenitore
 * della tabella (`data-slot="table-container"`, che scorre su desktop), il riquadro della
 * pagina che la avvolge (che scorre su mobile, dove al posto della tabella ci sono le schede)
 * e infine il `<main>` del layout, che scorre nelle pagine di dettaglio.
 *
 * Il browser ricorda da solo solo lo scroll della finestra, che in quest'app non si muove
 * mai: tutto scorre dentro questi contenitori, quindi tornare in cima o ripristinare la
 * posizione tocca a noi.
 */
export const getListScrollContainers = (start: Element | null) => {
    const containers: HTMLElement[] = [];

    for (let element = start; element instanceof HTMLElement; element = element.parentElement) {
        const { overflowY } = getComputedStyle(element);

        if (element === start || overflowY === "auto" || overflowY === "scroll") {
            containers.push(element);
        }

        if (element.tagName === "MAIN") {
            break;
        }
    }

    return containers;
};

/**
 * Riporta una lista all'inizio dopo un cambio pagina: senza, chi era sceso fino ai pulsanti
 * di paginazione restava in fondo e vedeva la fine della pagina nuova invece dei primi record.
 *
 * `list` è il riquadro che contiene la tabella. Lui e ciò che sta dentro tornano a zero; i
 * contenitori esterni (il `<main>` delle pagine di dettaglio) si muovono solo quanto basta a
 * rendere visibile l'inizio della lista, senza saltare in cima alla scheda del cliente.
 */
export const scrollListToTop = (list: Element) => {
    list.scrollTop = 0;
    list.querySelectorAll<HTMLElement>('[data-slot="table-container"]').forEach((container) => {
        container.scrollTop = 0;
    });

    const outer = getListScrollContainers(list.parentElement).at(-1);

    if (outer && list.getBoundingClientRect().top < outer.getBoundingClientRect().top) {
        list.scrollIntoView({ block: "start" });
    }
};
