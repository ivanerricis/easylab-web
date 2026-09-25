import {
    Pagination,
    PaginationButton,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import RowsPerPageSelect from "@/components/rows-per-page-select";
import { useIsMobile } from "@/hooks/use-mobile";
import { scrollListToTop } from "@/lib/listScroll";
import { useCallback, useRef, useState } from "react";
import type { TableRowsPerPageKey } from "@/lib/theme";

/**
 * Sotto questa larghezza conteggio, pagine e righe-per-pagina non hanno spazio per stare
 * affiancati con le etichette per esteso: stessa soglia dello switch tabella/schede di
 * `EntityTable`, perché questo controllo sta sempre appena sotto quella tabella.
 */
const PAGINATION_COMPACT_BREAKPOINT = 640;

/**
 * La larghezza del controllo sotto cui si passa alla forma compatta, qualunque sia la finestra.
 *
 * La soglia di finestra da sola non bastava: fra 640 e ~900px, con la barra laterale aperta, il
 * controllo è largo 488–620px, e la griglia a tre zone (`1fr auto 1fr`) dava al conteggio quello
 * che avanzava dopo pagine (281px) e selettore (175px) — a 768 esattamente 0,6px, e
 * "Visualizzati 1-10 di 6361" (157px) spariva del tutto. Per stare in piedi la griglia vuole due
 * lati da ~175px più la paginazione (fino a ~340px con sette pulsanti) più i due spazi: 720.
 */
const PAGINATION_COMPACT_CONTAINER_WIDTH = 720;

type TablePaginationProps = {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    /**
     * Quando c'è, in fondo a destra compare il selettore delle righe per pagina. È il punto
     * giusto in cui metterlo: questo componente è già sotto ogni tabella dell'app, mentre la
     * barra dei filtri esiste solo su tre pagine su dodici.
     */
    onPageSizeChange?: (pageSize: TableRowsPerPageKey) => void;
};

const getVisiblePages = (currentPage: number, totalPages: number) => {
    if (totalPages <= 5) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
        return [1, 2, 3, "ellipsis", totalPages];
    }

    if (currentPage >= totalPages - 2) {
        return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
};

const TablePagination = ({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    onPageSizeChange,
}: TablePaginationProps) => {
    // Sotto `sm` la lista numerata di pagine (fino a 7 pulsanti con "..." per le liste con
    // centinaia di pagine) non ci sta accanto a conteggio e selettore sulla stessa riga: qui
    // diventa "pagina/totale" tra le sole frecce, e le due etichette spariscono lasciando solo
    // i numeri. Prima le tre zone stavano impilate su tre righe sotto `sm` — corretto per
    // spazio, ma l'utente si aspettava la stessa riga unica del desktop.
    //
    // Conta la larghezza del controllo, non della finestra: vedi `PAGINATION_COMPACT_CONTAINER_WIDTH`.
    // Finché non è misurata (primo render, o jsdom che non impagina) vale la soglia di finestra.
    const isViewportCompact = useIsMobile(PAGINATION_COMPACT_BREAKPOINT);
    const [containerWidth, setContainerWidth] = useState(0);
    const isCompact = containerWidth > 0 ? containerWidth < PAGINATION_COMPACT_CONTAINER_WIDTH : isViewportCompact;
    const rootRef = useRef<HTMLDivElement | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    // Un ref a callback e non un effetto: il controllo non esiste finché la lista è vuota
    // (`return null` qui sotto), quindi un effetto al montaggio troverebbe il ref ancora vuoto e
    // non ripartirebbe più quando il controllo compare.
    const setRootRef = useCallback((element: HTMLDivElement | null) => {
        rootRef.current = element;
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;

        if (!element || typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver(() => setContainerWidth(element.getBoundingClientRect().width));
        observer.observe(element);
        resizeObserverRef.current = observer;
        setContainerWidth(element.getBoundingClientRect().width);
    }, []);

    // La lista sta sempre subito prima di questo controllo, nello stesso contenitore: è la
    // forma di tutte le pagine con una tabella. Vedi `scrollListToTop`.
    const changePage = (page: number) => {
        onPageChange(page);

        const list = rootRef.current?.previousElementSibling;
        if (list) {
            scrollListToTop(list);
        }
    };

    if (totalItems <= 0) {
        return null;
    }

    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);
    const visiblePages = getVisiblePages(currentPage, totalPages);

    return (
        // Tre zone: conteggio a sinistra, controlli di pagina al centro, selettore a destra.
        // In forma estesa è una griglia e non `justify-between`, perché con le colonne laterali
        // a `1fr` la paginazione resta centrata sulla tabella anche quando i due lati hanno
        // larghezze diverse (ed è il caso normale: "Visualizzati 1-10 di 16" contro il
        // select). In forma compatta bastano tre elementi in riga: la versione compatta di conteggio
        // e paginazione è già abbastanza stretta da stare affiancata al selettore.
        <div
            ref={setRootRef}
            className={
                isCompact
                    ? "flex items-center justify-between gap-2"
                    : "grid grid-cols-[1fr_auto_1fr] items-center gap-4"
            }
        >
            {/* `role="status"` fa di questa riga l'annuncio dell'esito per chi usa uno screen
                reader: cambia da sola a ogni ricerca, filtro e cambio pagina, quindi è già la
                frase giusta ("Visualizzati 1-10 di 16") nel momento giusto. Senza, il
                contenuto della tabella si rinnovava in silenzio. La parola "Visualizzati"
                sparisce in versione compatta: il numero resta comunque annunciato — il
                troncamento è solo visivo, non tocca il testo letto dallo screen reader. */}
            <p role="status" className="min-w-0 truncate text-sm text-muted-foreground">
                {isCompact ? null : "Visualizzati "}
                {startItem}-{endItem} di {totalItems}
            </p>

            {/* `empty:hidden` evita che il contenitore vuoto (pagina unica) si porti dietro un
                gap in più in forma compatta; nella griglia resta visibile, altrimenti la cella
                vuota sparisce dalla griglia e il selettore scivola nella colonna centrale. */}
            <div className={isCompact ? "flex shrink-0 justify-center empty:hidden" : "flex shrink-0 justify-center"}>
                {totalPages <= 1 ? null : isCompact ? (
                    // Solo le frecce e "pagina/totale": la lista numerata (fino a 7 pulsanti
                    // con centinaia di pagine) non ci sta su una riga sotto `sm` insieme a
                    // conteggio e selettore.
                    <Pagination className="mx-0 w-auto">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    disabled={currentPage === 1}
                                    onClick={() => changePage(currentPage - 1)}
                                />
                            </PaginationItem>
                            <PaginationItem>
                                <span className="px-1 text-sm text-nowrap text-muted-foreground tabular-nums">
                                    {currentPage}/{totalPages}
                                </span>
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationNext
                                    disabled={currentPage === totalPages}
                                    onClick={() => changePage(currentPage + 1)}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                ) : (
                    // `w-auto` annulla il `w-full` di default di Pagination: a piena larghezza
                    // il `nav` rivendica tutta la colonna e si disallinea dagli altri due lati.
                    <Pagination className="mx-0 w-auto">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    disabled={currentPage === 1}
                                    onClick={() => changePage(currentPage - 1)}
                                />
                            </PaginationItem>

                            {visiblePages.map((page, index) => {
                                if (typeof page === "string") {
                                    return (
                                        <PaginationItem key={`ellipsis-${index}`}>
                                            <PaginationEllipsis />
                                        </PaginationItem>
                                    );
                                }

                                return (
                                    <PaginationItem key={page}>
                                        <PaginationButton
                                            isActive={page === currentPage}
                                            aria-label={`Vai alla pagina ${page}`}
                                            onClick={() => changePage(page)}
                                        >
                                            {page}
                                        </PaginationButton>
                                    </PaginationItem>
                                );
                            })}

                            <PaginationItem>
                                <PaginationNext
                                    disabled={currentPage === totalPages}
                                    onClick={() => changePage(currentPage + 1)}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                )}
            </div>

            <div className={isCompact ? "flex shrink-0 justify-end empty:hidden" : "flex shrink-0 justify-end"}>
                {onPageSizeChange ? (
                    <RowsPerPageSelect
                        value={pageSize as TableRowsPerPageKey}
                        onValueChange={onPageSizeChange}
                        compact={isCompact}
                    />
                ) : null}
            </div>
        </div>
    );
};

export default TablePagination;
