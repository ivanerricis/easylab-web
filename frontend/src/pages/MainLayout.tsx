import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import LoadingPage from "@/components/loadingPage";
// import { ModeToggle } from "@/components/mode-toggle"
import { NotificationsMenu } from "@/components/notifications-menu";
import { UserBadge } from "@/components/user-badge";
import MainSidebar from "@/components/main-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useUpdateWatcher } from "@/hooks/useUpdateWatcher";

export const MainLayout = () => {
    useUpdateWatcher();

    return (
        <SidebarProvider defaultOpen>
            {/* Primo elemento focusabile della pagina: senza di lui, chi naviga da tastiera
                attraversa le nove voci della barra laterale a ogni cambio di pagina prima di
                arrivare alla tabella. Invisibile finché non riceve il focus. */}
            <a
                href="#contenuto-principale"
                className="sr-only z-50 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
            >
                Vai al contenuto
            </a>

            <MainSidebar />
            <SidebarInset className="h-svh overflow-hidden">
                <header className="flex h-13 items-center justify-between border-b px-2">
                    <SidebarTrigger />
                    <div className="flex items-center gap-2">
                        <NotificationsMenu />
                        {/* <ModeToggle /> */}
                        <UserBadge />
                    </div>
                </header>
                <main
                    id="contenuto-principale"
                    className="relative flex min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto p-3"
                >
                    {/* Il caricamento delle pagine è già asincrono per conto suo: le rotte sono
                        `lazy` in App.tsx. Qui serve un confine `Suspense` *dentro* il layout,
                        perché quello di App.tsx sta sopra le rotte e mentre arriva il chunk
                        sostituirebbe anche barra laterale e intestazione, facendo sparire la
                        struttura dell'applicazione a ogni navigazione.

                        Prima di questo confine il layout mostrava invece un velo di 150ms fissi
                        a ogni cambio di rotta: un'attesa inventata, che si vedeva anche quando
                        la pagina era già pronta. Ora il velo compare solo se c'è davvero da
                        aspettare, e per il tempo che serve. */}
                    <Suspense
                        fallback={
                            <LoadingPage className="absolute inset-3 z-10 rounded-2xl bg-background/70 backdrop-blur-sm" />
                        }
                    >
                        <Outlet />
                    </Suspense>
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
};
