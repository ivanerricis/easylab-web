import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./app-error-boundary";

/**
 * React stampa comunque l'errore intercettato su console.error: senza questo silenziatore
 * l'output dei test è pieno di stack trace attesi e i problemi veri si perdono.
 */
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    consoleErrorSpy.mockRestore();
});

const Exploding = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
        throw new Error("errore di rendering");
    }

    return <p>Contenuto applicativo</p>;
};

describe("AppErrorBoundary", () => {
    it("mostra i figli quando non ci sono errori", () => {
        render(
            <AppErrorBoundary>
                <Exploding shouldThrow={false} />
            </AppErrorBoundary>
        );

        expect(screen.getByText("Contenuto applicativo")).toBeInTheDocument();
    });

    it("mostra la pagina di errore quando un figlio esplode in rendering", () => {
        render(
            <AppErrorBoundary>
                <Exploding shouldThrow />
            </AppErrorBoundary>
        );

        expect(screen.getByText(/Si è verificato un errore inatteso/i)).toBeInTheDocument();
        expect(screen.queryByText("Contenuto applicativo")).not.toBeInTheDocument();
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    /**
     * "Riprova" deve azzerare lo stato del boundary, non ricaricare la pagina: se il
     * reset non avvenisse, l'utente resterebbe bloccato sulla schermata di errore anche
     * dopo che la causa è stata rimossa.
     */
    it("il pulsante Riprova rimonta i figli", async () => {
        const user = userEvent.setup();

        const Harness = () => {
            const [shouldThrow, setShouldThrow] = useState(true);

            return (
                <>
                    <button onClick={() => setShouldThrow(false)}>Risolvi</button>
                    <AppErrorBoundary>
                        <Exploding shouldThrow={shouldThrow} />
                    </AppErrorBoundary>
                </>
            );
        };

        render(<Harness />);

        expect(screen.getByText(/Si è verificato un errore inatteso/i)).toBeInTheDocument();

        // Rimuove la causa dell'errore, poi chiede al boundary di riprovare.
        await user.click(screen.getByRole("button", { name: "Risolvi" }));
        await user.click(screen.getByRole("button", { name: /Riprova/i }));

        expect(screen.getByText("Contenuto applicativo")).toBeInTheDocument();
    });
});
