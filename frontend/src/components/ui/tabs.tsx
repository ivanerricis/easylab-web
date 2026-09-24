import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
    return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-3", className)} {...props} />;
}

/**
 * Le tab come un gruppo di pulsanti a segmenti, uguale al selettore delle viste del calendario
 * (`CalendarToolbar`): segmenti con bordo sul fondo delle card, quello attivo pieno nel primario.
 * Lo stile di serie (fondo grigio con la scheda attiva bianca in rilievo) era l'unico controllo
 * dell'app con quei colori, e accanto al menu "Tutti i report" sembrava di un'altra interfaccia.
 */
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
    return (
        <TabsPrimitive.List
            data-slot="tabs-list"
            className={cn("inline-flex h-10 w-fit items-stretch justify-center", className)}
            {...props}
        />
    );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
    return (
        <TabsPrimitive.Trigger
            data-slot="tabs-trigger"
            className={cn(
                "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-none border border-border bg-card px-3 text-sm font-medium whitespace-nowrap text-foreground transition-colors outline-none not-first:-ml-px first:rounded-l-md last:rounded-r-md hover:bg-muted focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 dark:data-[state=active]:border-primary dark:data-[state=active]:bg-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className
            )}
            {...props}
        />
    );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
    return (
        <TabsPrimitive.Content
            data-slot="tabs-content"
            className={cn("flex flex-col gap-3 outline-none", className)}
            {...props}
        />
    );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
