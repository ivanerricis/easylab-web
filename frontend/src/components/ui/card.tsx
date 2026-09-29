import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, size = "default", ...props }: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
    return (
        <div
            data-slot="card"
            data-size={size}
            className={cn(
                "group/card flex flex-col gap-6 overflow-hidden rounded-xl bg-card py-6 text-sm text-card-foreground shadow-xs ring-1 ring-foreground/10 has-[>img:first-child]:pt-0 data-[size=sm]:gap-4 data-[size=sm]:py-4 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
                className
            )}
            {...props}
        />
    );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="card-header"
            className={cn(
                "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-6 group-data-[size=sm]/card:px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-6 group-data-[size=sm]/card:[.border-b]:pb-4",
                className
            )}
            {...props}
        />
    );
}

// `as` per quando il titolo è davvero un titolo della pagina (es. `h2`): chi naviga per titoli
// con lo screen reader altrimenti non lo trova. Resta un `div` di default, così le card dove il
// titolo è solo un'etichetta non cambiano; l'aspetto lo decidono le classi, non il tag.
function CardTitle({
    className,
    as: Component = "div",
    ...props
}: React.ComponentProps<"div"> & { as?: "div" | "h1" | "h2" | "h3" }) {
    return (
        <Component
            data-slot="card-title"
            className={cn(
                "font-heading text-base leading-normal font-medium group-data-[size=sm]/card:text-sm",
                className
            )}
            {...props}
        />
    );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
    return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="card-action"
            className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
            {...props}
        />
    );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
    return <div data-slot="card-content" className={cn("px-6 group-data-[size=sm]/card:px-4", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="card-footer"
            className={cn(
                "flex items-center rounded-b-xl px-6 group-data-[size=sm]/card:px-4 [.border-t]:pt-6 group-data-[size=sm]/card:[.border-t]:pt-4",
                className
            )}
            {...props}
        />
    );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
