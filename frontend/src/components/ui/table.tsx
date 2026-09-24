import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * `containerClassName` va al contenitore che scorre, non alla tabella. Serve soprattutto per
 * nasconderla su mobile, dove al suo posto ci sono le schede: con `hidden` sulla sola `<table>`
 * il contenitore restava lì con il suo `h-full`, cioè alto quanto tutta l'area della lista e
 * vuoto, e le schede cominciavano sotto, fuori dal primo schermo.
 */
function Table({
    className,
    containerClassName,
    ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
    return (
        <div data-slot="table-container" className={cn("relative h-full w-full overflow-auto", containerClassName)}>
            <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
        </div>
    );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
    return (
        <thead
            data-slot="table-header"
            className={cn(
                "sticky top-0 z-10 bg-primary *:*:text-background *:*:dark:text-foreground [&_tr]:border-b",
                className
            )}
            {...props}
        />
    );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
    return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
    return (
        <tfoot
            data-slot="table-footer"
            className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
            {...props}
        />
    );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
    return (
        <tr
            data-slot="table-row"
            className={cn(
                "border-b-2 border-foreground/45 transition-colors duration-50 *:border-r *:border-foreground/45 hover:bg-muted/50 in-[thead]:border-primary-foreground/25 in-[thead]:*:border-primary-foreground/25 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted dark:border-foreground/30 dark:*:border-foreground/30",
                className
            )}
            {...props}
        />
    );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
    return (
        <th
            data-slot="table-head"
            className={cn(
                "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
                className
            )}
            {...props}
        />
    );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
    return (
        <td
            data-slot="table-cell"
            className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
            {...props}
        />
    );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
    return (
        <caption data-slot="table-caption" className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
    );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
