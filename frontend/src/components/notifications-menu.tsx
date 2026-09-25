import { Fragment, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNotifications } from "@/components/use-notifications";
import { cn } from "@/lib/utils";

export function NotificationsMenu() {
    const navigate = useNavigate();
    const { sections, badgeCount, dismiss, dismissAll, totalCount } = useNotifications();

    const handleDismiss = (event: MouseEvent, sourceKey: string, notificationId: string) => {
        event.stopPropagation();
        event.preventDefault();
        dismiss(sourceKey, notificationId);
    };

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon-lg" className="relative" aria-label="Notifiche">
                            <Bell className="size-5" />
                            {badgeCount > 0 ? (
                                <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-white">
                                    {badgeCount > 9 ? "9+" : badgeCount}
                                </span>
                            ) : null}
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Notifiche</TooltipContent>
            </Tooltip>
            {/* 24rem, ma mai più della finestra meno 8px per lato: su telefono (390px) il
                pannello da 384px ancorato al campanello usciva a sinistra. `collisionPadding`
                tiene lo stesso margine quando Radix lo sposta per farlo stare. */}
            <DropdownMenuContent align="end" collisionPadding={8} className="w-[min(24rem,calc(100vw-1rem))]">
                {/* Intestazione con il nome del pannello e, se c'è qualcosa, "Rimuovi tutte". È una
                    voce del menu, così si raggiunge con le frecce come le altre; `preventDefault`
                    su `onSelect` tiene il pannello aperto, che mostra subito "Nessuna notifica". */}
                <div className="flex items-center justify-between gap-2 pr-1">
                    <DropdownMenuLabel className="text-sm font-semibold text-foreground">Notifiche</DropdownMenuLabel>
                    {totalCount > 0 ? (
                        <DropdownMenuItem
                            className="text-xs text-muted-foreground"
                            onSelect={(event) => {
                                event.preventDefault();
                                dismissAll();
                            }}
                        >
                            Rimuovi tutte
                        </DropdownMenuItem>
                    ) : null}
                </div>
                <DropdownMenuSeparator />
                {sections.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">Nessuna notifica.</div>
                ) : (
                    sections.map((section, sectionIndex) => (
                        <Fragment key={section.source.key}>
                            {sectionIndex > 0 ? <DropdownMenuSeparator /> : null}
                            <DropdownMenuLabel className="font-normal text-muted-foreground">
                                {section.source.label}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {section.notifications.length === 0 ? (
                                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                                    {section.source.emptyLabel}
                                </div>
                            ) : (
                                section.notifications.map((notification) => {
                                    const { href } = notification;

                                    return (
                                        <DropdownMenuItem
                                            key={notification.id}
                                            className="flex-col items-start gap-0.5 pr-1.5"
                                            onClick={href ? () => navigate(href) : undefined}
                                        >
                                            <div className="flex w-full items-start justify-between gap-2">
                                                <span
                                                    className={cn(
                                                        // Il titolo va a capo invece di spingere fuori il pulsante di chiusura.
                                                        "flex min-w-0 flex-1 items-start gap-1.5 font-medium whitespace-normal",
                                                        notification.tone === "warning" && "text-destructive"
                                                    )}
                                                >
                                                    {notification.tone === "warning" ? (
                                                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                                    ) : null}
                                                    {notification.title}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="size-6 shrink-0"
                                                    aria-label="Rimuovi notifica"
                                                    onClick={(event) =>
                                                        handleDismiss(event, section.source.key, notification.id)
                                                    }
                                                >
                                                    <X className="size-3.5" />
                                                </Button>
                                            </div>
                                            {notification.description ? (
                                                <span
                                                    className={cn(
                                                        "text-xs break-words whitespace-normal text-muted-foreground",
                                                        notification.resolved && "line-through"
                                                    )}
                                                >
                                                    {notification.description}
                                                </span>
                                            ) : null}
                                            {notification.meta ? (
                                                <span className="text-xs text-muted-foreground/80">
                                                    {notification.meta}
                                                </span>
                                            ) : null}
                                        </DropdownMenuItem>
                                    );
                                })
                            )}
                        </Fragment>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
