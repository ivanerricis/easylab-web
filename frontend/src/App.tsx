import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppErrorBoundary from "@/components/app-error-boundary";
import { ThemeProvider } from "./components/theme-provider";
import { AuthProvider } from "./components/auth-provider";
import { BusyGuardProvider } from "@/components/busy-guard-provider";
import RequireAuth from "@/components/require-auth";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import LoadingPage from "./components/loadingPage";
import UnhandledErrorPage from "@/pages/UnhandledErrorPage";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const MainLayout = lazy(() => import("@/pages/MainLayout").then((module) => ({ default: module.MainLayout })));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
const ReportPage = lazy(() => import("./pages/reports/ReportPage"));
const InterventionsPage = lazy(() => import("@/pages/interventions/InterventionsPage"));
const InterventionPage = lazy(() => import("./pages/interventions/InterventionPage"));
const CustomersPage = lazy(() => import("@/pages/customers/CustomersPage"));
const CustomerPage = lazy(() => import("./pages/customers/CustomerPage"));
const CollaboratorsPage = lazy(() => import("@/pages/collaborators/CollaboratorsPage"));
const CollaboratorPage = lazy(() => import("./pages/collaborators/CollaboratorPage"));
const TechnicianPage = lazy(() => import("@/pages/technicians/TechniciansPage"));
const SingleTechnicianPage = lazy(() => import("./pages/technicians/TechnicianPage"));
const DevicesPage = lazy(() => import("@/pages/devices/DevicesPage"));
const IssuesPage = lazy(() => import("@/pages/issues/IssuesPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
export function App() {
    return (
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
            <BusyGuardProvider>
                <TooltipProvider>
                    <BrowserRouter>
                        <AppErrorBoundary>
                            <AuthProvider>
                                <Suspense fallback={<LoadingPage />}>
                                    <Routes>
                                        <Route path="/login" element={<LoginPage />} />
                                        <Route element={<RequireAuth />}>
                                            <Route path="/" element={<MainLayout />}>
                                                <Route index element={<Navigate to="/dashboard" replace />} />
                                                <Route path="dashboard" element={<DashboardPage />} />
                                                <Route path="reports" element={<ReportsPage />} />
                                                <Route path="reports/:id" element={<ReportPage />} />
                                                <Route path="interventions" element={<InterventionsPage />} />
                                                <Route path="interventions/:id" element={<InterventionPage />} />
                                                <Route path="clients" element={<CustomersPage />} />
                                                <Route path="clients/:id" element={<CustomerPage />} />
                                                {/* Stessa pagina, tab degli interventi: vedi `CustomerPage`. */}
                                                <Route path="clients/:id/interventions" element={<CustomerPage />} />
                                                <Route path="collaborators" element={<CollaboratorsPage />} />
                                                <Route path="collaborators/:id" element={<CollaboratorPage />} />
                                                <Route path="technicians" element={<TechnicianPage />} />
                                                <Route path="technicians/:id" element={<SingleTechnicianPage />} />
                                                <Route path="devices" element={<DevicesPage />} />
                                                <Route path="issues" element={<IssuesPage />} />
                                                <Route path="settings" element={<SettingsPage />} />
                                                <Route path="error" element={<UnhandledErrorPage />} />
                                                <Route path="*" element={<Navigate to="/dashboard" replace />} />
                                            </Route>
                                        </Route>
                                    </Routes>
                                </Suspense>
                            </AuthProvider>
                        </AppErrorBoundary>
                    </BrowserRouter>
                </TooltipProvider>
                <Toaster
                    closeButton={true}
                    position="top-center"
                    richColors
                    swipeDirections={["left", "right", "top"]}
                    toastOptions={{
                        classNames: {
                            title: "text-base",
                            description: "text-sm",
                            closeButton: "[&>svg]:h-4 [&>svg]:w-4 w-6! h-6!",
                        },
                    }}
                />
            </BusyGuardProvider>
        </ThemeProvider>
    );
}

export default App;
