import { Suspense, lazy } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import LoadingPage from "@/components/loadingPage";
import { useAuth } from "@/components/use-auth";

// Caricate solo quando servono: le vede chi ha una password generata o deve ancora configurare
// la 2FA, cioè quasi mai. Importate qui in modo diretto finivano nel pacchetto iniziale di ogni
// utente, insieme ai dialoghi della 2FA (campo del codice, codici di recupero) che si portano dietro.
const ForcePasswordChangePage = lazy(() => import("@/pages/auth/ForcePasswordChangePage"));
const ForceTwoFactorSetupPage = lazy(() => import("@/pages/auth/ForceTwoFactorSetupPage"));

const RequireAuth = () => {
    const { user, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return <LoadingPage className="h-svh" />;
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    if (user.mustChangePassword) {
        return (
            <Suspense fallback={<LoadingPage className="h-svh" />}>
                <ForcePasswordChangePage />
            </Suspense>
        );
    }

    // Dopo il cambio password: la configurazione della 2FA chiede la password nuova.
    if (user.twoFactorSetupRequired) {
        return (
            <Suspense fallback={<LoadingPage className="h-svh" />}>
                <ForceTwoFactorSetupPage />
            </Suspense>
        );
    }

    return <Outlet />;
};

export default RequireAuth;
