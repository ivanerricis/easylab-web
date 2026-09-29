import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppErrorBoundary from "@/components/app-error-boundary";
import LoadingPage from "@/components/loadingPage";
// import { ModeToggle } from "@/components/mode-toggle"
import GlobalSearch from "@/components/global-search";
import ShortcutsLegend from "@/components/shortcuts-legend";
import { NotificationsMenu } from "@/components/notifications-menu";
import { UserBadge } from "@/components/user-badge";
import MainSidebar from "@/components/main-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUpdateWatcher } from "@/hooks/useUpdateWatcher";

/** Quanto deve restare fermo il titolo prima di annunciarlo: le pagine lo scrivono in più passi. */
const titleSettleDelay = 400;
/** Oltre questo si annuncia comunque, anche se la pagina non ha ancora un titolo suo. */
const titleMaxWait = 3000;

/**
 * Il titolo della pagina senza il nome dell'app in coda (vedi `useDocumentTitle`): "EasyLab"
 * ripetuto a ogni cambio pagina è solo rumore. `null` quando il titolo è ancora il solo nome
 * dell'app, cioè la pagina non ha ancora detto il suo (una scheda che sta caricando).
 */
const readPageTitle = () => {
    const [pageTitle, ...appName] = document.title.split(" · ");
    return appName.length > 0 ? pageTitle : null;
};

/**
 * Cosa succede, per chi usa tastiera o screen reader, quando cambia pagina.
 *
 * In un'app a pagina singola il browser non ricarica niente: il focus restava sul link
 * cliccato (o finiva su `body`, se la pagina vecchia lo portava via con sé) e lo screen reader
 * taceva, quindi non c'era modo di sapere che la pagina era cambiata né da dove ripartire.
 * Qui il focus va su `<main>`, come dopo il link "Vai al contenuto", e il titolo nuovo si
 * annuncia in una regione `aria-live` educata, che aspetta la fine di quello che sta leggendo.
 *
 * Solo quando cambia il percorso: filtri, ricerca e pagina della tabella stanno nei parametri
 * dell'indirizzo, e lì il focus deve restare dov'è. E non al primo caricamento, dove il
 * browser annuncia già la pagina da sé.
 */
const useRouteChangeFocus = (pathname: string) => {
    const mainRef = useRef<HTMLElement>(null);
    const announcerRef = useRef<HTMLDivElement>(null);
    const previousPathname = useRef(pathname);

    useEffect(() => {
        if (previousPathname.current === pathname) {
            return;
        }

        previousPathname.current = pathname;

        // Un dialogo rimasto aperto sulla pagina nuova tiene il focus dentro di sé: portarlo
        // via romperebbe la trappola del focus di Radix, che poi lo riprende comunque.
        const activeElement = document.activeElement;
        if (!activeElement?.closest('[role="dialog"], [role="alertdialog"]')) {
            // `preventScroll`: le liste tornando indietro rimettono lo scroll dov'era
            // (`useListScrollRestoration`), e il focus sul contenitore non deve riportarle in cima.
            mainRef.current?.focus({ preventScroll: true });
        }

        const announcer = announcerRef.current;
        if (!announcer) {
            return;
        }

        // Svuotata subito: se la pagina nuova ha lo stesso titolo della vecchia, un testo
        // identico non verrebbe riletto.
        announcer.textContent = "";

        // Il titolo non è pronto quando cambia il percorso: la pagina può essere un chunk
        // ancora da scaricare, e le schede lo scrivono solo quando arrivano i dati ("Report",
        // poi "Report #5 - Mario Rossi"). Si aspetta che resti fermo per un attimo, e che sia
        // un titolo vero e non il solo nome dell'app, ma non oltre `titleMaxWait`.
        const startedAt = Date.now();
        let settleTimer: ReturnType<typeof setTimeout> | undefined;

        const stop = () => {
            observer.disconnect();
            clearTimeout(settleTimer);
            clearTimeout(deadlineTimer);
        };

        const announce = () => {
            stop();
            announcer.textContent = readPageTitle() ?? document.title;
        };

        const scheduleAnnounce = () => {
            clearTimeout(settleTimer);
            settleTimer = setTimeout(() => {
                if (readPageTitle() !== null || Date.now() - startedAt >= titleMaxWait) {
                    announce();
                }
            }, titleSettleDelay);
        };

        // Dichiarati dopo le funzioni che li usano: nessuna delle due gira prima di qui.
        const observer = new MutationObserver(scheduleAnnounce);
        observer.observe(document.head, { subtree: true, childList: true, characterData: true });
        const deadlineTimer = setTimeout(announce, titleMaxWait);
        scheduleAnnounce();

        return stop;
    }, [pathname]);

    return { mainRef, announcerRef };
};

export const MainLayout = () => {
    useUpdateWatcher();
    const { pathname } = useLocation();
    const { mainRef, announcerRef } = useRouteChangeFocus(pathname);

    return (
        // Qui e non in App.tsx: i tooltip dell'app stanno dentro il layout, e il provider in
        // cima all'albero portava il codice dei tooltip (Radix + posizionamento) anche nella
        // pagina di login, che non ne usa nessuno.
        <TooltipProvider>
            <SidebarProvider defaultOpen>
                {/* Primo elemento focusabile della pagina: senza di lui, chi naviga da tastiera
                    attraversa le nove voci della barra laterale a ogni cambio di pagina prima di
                    arrivare alla tabella. Invisibile finché non riceve il focus. */}
                <a
                    href="#contenuto-principale"
                    className="sr-only z-50 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:outline-2 focus:outline-offset-2 focus:outline-focus-ring"
                >
                    Vai al contenuto
                </a>

                <MainSidebar />
                <SidebarInset className="h-svh overflow-hidden">
                    {/* Stesso passo orizzontale del `p-3` di <main>: con `px-2` il pulsante del menu
                        e il badge utente stavano 4px più vicini al bordo dello schermo del contenuto
                        sotto, e su mobile — dove le schede toccano i due bordi — lo scalino si vedeva. */}
                    <header className="flex h-13 items-center justify-between border-b bg-card px-3">
                        <SidebarTrigger />
                        <div className="flex items-center gap-2">
                            {/* La ricerca sta qui e non in una pagina: vale per tutta l'app, e
                                Ctrl+K la apre da qualunque punto. */}
                            <GlobalSearch />
                            {/* Non si vede: è solo l'elenco che "?" apre. */}
                            <ShortcutsLegend />
                            <NotificationsMenu />
                            {/* <ModeToggle /> */}
                            <UserBadge />
                        </div>
                    </header>
                    {/* `tabIndex={-1}`: il link "Vai al contenuto" e il cambio pagina ci portano il
                        focus, e un elemento non focusabile lo ignorerebbe. Senza contorno: è un
                        contenitore, non un controllo, e un bordo blu attorno a tutta la pagina a ogni
                        navigazione sembrerebbe un errore. */}
                    <main
                        ref={mainRef}
                        id="contenuto-principale"
                        tabIndex={-1}
                        className="relative flex min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto p-3 focus:outline-none"
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
                        {/* Un confine d'errore anche qui, attorno alla sola pagina: prima c'era solo quello
                            in App.tsx, sopra tutto, e il crash di una pagina faceva sparire anche barra
                            laterale e intestazione, lasciando la card d'errore da sola. Così la
                            navigazione resta e si può andare altrove. `key` sul percorso: cambiando
                            pagina dalla barra laterale il confine riparte da zero, invece di restare
                            sull'errore della pagina di prima. Quello in App.tsx resta per i crash del
                            layout stesso. */}
                        <AppErrorBoundary key={pathname}>
                            <Suspense
                                fallback={
                                    <LoadingPage className="absolute inset-3 z-10 rounded-2xl bg-background/70 backdrop-blur-sm" />
                                }
                            >
                                <Outlet />
                            </Suspense>
                        </AppErrorBoundary>
                    </main>
                </SidebarInset>
                {/* Fuori da `<main>`: la regione deve esistere prima che il testo cambi, e la
                    pagina dentro `<main>` si smonta e rimonta a ogni navigazione. */}
                <div ref={announcerRef} aria-live="polite" aria-atomic="true" className="sr-only" />
            </SidebarProvider>
        </TooltipProvider>
    );
};
