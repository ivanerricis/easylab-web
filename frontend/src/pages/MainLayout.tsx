import { useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import LoadingPage from "@/components/loadingPage";
// import { ModeToggle } from "@/components/mode-toggle"
import { NotificationsMenu } from "@/components/notifications-menu";
import { UserBadge } from "@/components/user-badge";
import MainSidebar from "@/components/main-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useUpdateWatcher } from "@/hooks/useUpdateWatcher";

export const MainLayout = () => {
    const { pathname } = useLocation();
    const hasMountedRef = useRef(false);
    const transitionTimerRef = useRef<number | null>(null);
    const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);

    useUpdateWatcher();

    useLayoutEffect(() => {
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            return;
        }

        setIsRouteTransitioning(true);

        if (transitionTimerRef.current != null) {
            window.clearTimeout(transitionTimerRef.current);
        }

        transitionTimerRef.current = window.setTimeout(() => {
            setIsRouteTransitioning(false);
            transitionTimerRef.current = null;
        }, 150);

        return () => {
            if (transitionTimerRef.current != null) {
                window.clearTimeout(transitionTimerRef.current);
                transitionTimerRef.current = null;
            }
        };
    }, [pathname]);

    return (
        <SidebarProvider defaultOpen>
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
                <main className="relative flex min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto p-3">
                    <Outlet />
                    {isRouteTransitioning ? (
                        <LoadingPage className="absolute inset-3 z-10 rounded-2xl bg-background/70 backdrop-blur-sm" />
                    ) : null}
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
};
