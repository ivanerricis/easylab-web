import { Navigate, Outlet, useLocation } from "react-router-dom";
import LoadingPage from "@/components/loadingPage";
import { useAuth } from "@/components/use-auth";
import ForcePasswordChangePage from "@/pages/auth/ForcePasswordChangePage";
import ForceTwoFactorSetupPage from "@/pages/auth/ForceTwoFactorSetupPage";

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
        return <ForcePasswordChangePage />;
    }

    // Dopo il cambio password: la configurazione della 2FA chiede la password nuova.
    if (user.twoFactorSetupRequired) {
        return <ForceTwoFactorSetupPage />;
    }

    return <Outlet />;
};

export default RequireAuth;
