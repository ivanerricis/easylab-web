import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BusyGuardProvider } from "@/components/busy-guard-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

type ProvidersOptions = {
    /** L'URL da cui parte il router, es. "/clients/3". */
    route?: string;
    /**
     * Il pattern della rotta che monta il componente, es. "/clients/:id": serve alle pagine
     * che leggono i parametri con `useParams`. Senza, il componente è montato fuori da
     * `<Routes>` e `useParams` restituisce un oggetto vuoto.
     */
    path?: string;
};

/**
 * Monta un componente dentro gli stessi provider che `App.tsx` mette intorno a ogni pagina:
 * senza `TooltipProvider` qualunque pulsante con tooltip fa fallire il render, senza router
 * falliscono `useNavigate` e `Link`, e il blocco a schermo delle operazioni lunghe passa da
 * `BusyGuardProvider`.
 *
 * Tema e autenticazione restano fuori di proposito: i test che ne dipendono li forniscono
 * esplicitamente, con il valore che serve a quel test.
 */
export const renderWithProviders = (
    ui: ReactElement,
    { route = "/", path, ...options }: ProvidersOptions & Omit<RenderOptions, "wrapper"> = {}
) => {
    const Wrapper = ({ children }: { children: ReactNode }) => (
        <BusyGuardProvider>
            <TooltipProvider>
                <MemoryRouter initialEntries={[route]}>
                    {path ? (
                        <Routes>
                            <Route path={path} element={children} />
                            <Route path="*" element={null} />
                        </Routes>
                    ) : (
                        children
                    )}
                </MemoryRouter>
            </TooltipProvider>
        </BusyGuardProvider>
    );

    return render(ui, { wrapper: Wrapper, ...options });
};
