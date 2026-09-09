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
import type { TableRowsPerPageKey } from "@/lib/theme";

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
    if (totalItems <= 0) {
        return null;
    }

    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);
    const visiblePages = getVisiblePages(currentPage, totalPages);

    return (
        // Tre zone: conteggio a sinistra, controlli di pagina al centro, selettore a destra.
        // Griglia e non `justify-between`, perché con le colonne laterali a `1fr` la
        // paginazione resta centrata sulla tabella anche quando i due lati hanno larghezze
        // diverse (ed è il caso normale: "Visualizzati 1-10 di 16" contro il select).
        <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
            {/* `role="status"` fa di questa riga l'annuncio dell'esito per chi usa uno screen
                reader: cambia da sola a ogni ricerca, filtro e cambio pagina, quindi è già la
                frase giusta ("Visualizzati 1-10 di 16") nel momento giusto. Senza, il
                contenuto della tabella si rinnovava in silenzio. */}
            <p role="status" className="text-sm text-muted-foreground">
                Visualizzati {startItem}-{endItem} di {totalItems}
            </p>

            {/* `empty:hidden` evita che il contenitore vuoto (pagina unica) si porti dietro un
                gap in più nello stack verticale del mobile; da `sm` in su resta invece in
                griglia, altrimenti il selettore scivolerebbe nella colonna centrale. */}
            <div className="flex justify-center empty:hidden sm:empty:flex">
                {totalPages <= 1 ? null : (
                    // `w-auto` annulla il `w-full` di default di Pagination: a piena larghezza
                    // il `nav` rivendica tutta la colonna e si disallinea dagli altri due lati.
                    <Pagination className="mx-0 w-auto">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    disabled={currentPage === 1}
                                    onClick={() => onPageChange(currentPage - 1)}
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
                                            onClick={() => onPageChange(page)}
                                        >
                                            {page}
                                        </PaginationButton>
                                    </PaginationItem>
                                );
                            })}

                            <PaginationItem>
                                <PaginationNext
                                    disabled={currentPage === totalPages}
                                    onClick={() => onPageChange(currentPage + 1)}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                )}
            </div>

            <div className="flex justify-start empty:hidden sm:justify-end sm:empty:flex">
                {onPageSizeChange ? (
                    <RowsPerPageSelect value={pageSize as TableRowsPerPageKey} onValueChange={onPageSizeChange} />
                ) : null}
            </div>
        </div>
    );
};

export default TablePagination;
