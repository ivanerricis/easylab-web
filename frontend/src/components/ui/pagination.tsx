import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
    return (
        <nav
            role="navigation"
            aria-label="Paginazione"
            className={cn("mx-auto flex w-full justify-center", className)}
            {...props}
        />
    );
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
    return <ul className={cn("flex flex-row items-center gap-1", className)} {...props} />;
}

function PaginationItem({ className, ...props }: React.ComponentProps<"li">) {
    return <li className={cn("", className)} {...props} />;
}

type PaginationButtonProps = React.ComponentProps<"button"> & {
    isActive?: boolean;
};

/**
 * Un pulsante, non un link.
 *
 * La versione originale di shadcn usa `<a href="#">` perché presuppone pagine con un URL
 * proprio (`?page=2`). Qui la pagina è stato del componente, quindi ogni `href` era un "#"
 * con il `click` annullato: un link che non porta da nessuna parte. Costava due cose vere —
 * la voce disabilitata restava raggiungibile con il tab pur non facendo niente (bastavano
 * `opacity-50` e `pointer-events-none`, che non toccano il focus da tastiera), e l'elemento
 * si annunciava come collegamento. Con `<button disabled>` lo stato disabilitato è quello
 * nativo: fuori dall'ordine di tabulazione e comunicato agli screen reader.
 *
 * La pagina corrente usa la variante piena invece del solo bordo: `outline` contro `ghost`
 * era una differenza di un pixel di contorno per l'unico elemento che dice dove sei.
 */
function PaginationButton({ className, isActive, type = "button", ...props }: PaginationButtonProps) {
    return (
        <button
            type={type}
            aria-current={isActive ? "page" : undefined}
            className={cn(buttonVariants({ variant: isActive ? "default" : "ghost" }), className)}
            {...props}
        />
    );
}

function PaginationPrevious({ className, ...props }: React.ComponentProps<typeof PaginationButton>) {
    return (
        <PaginationButton aria-label="Vai alla pagina precedente" className={cn("gap-1 px-3", className)} {...props}>
            <ChevronLeft className="size-4" />
            <span className="sr-only">Precedente</span>
        </PaginationButton>
    );
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationButton>) {
    return (
        <PaginationButton aria-label="Vai alla pagina successiva" className={cn("gap-1 px-3", className)} {...props}>
            <span className="sr-only">Successiva</span>
            <ChevronRight className="size-4" />
        </PaginationButton>
    );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
    return (
        <span aria-hidden="true" className={cn("flex size-9 items-center justify-center", className)} {...props}>
            <MoreHorizontal className="size-4" />
        </span>
    );
}

export {
    Pagination,
    PaginationButton,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
};
