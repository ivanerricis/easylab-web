import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EntityDetailGate from "./entity-detail-gate";
import { renderWithProviders } from "@/test/render";

const notFound = {
    title: "Report non trovato",
    description: "Il report che cerchi non esiste, oppure è stato eliminato.",
    backTo: "/reports",
    backLabel: "Vai ai report",
};

describe("EntityDetailGate", () => {
    /** "Non trovato" vince anche su un caricamento in corso: il motivo resta scritto. */
    it("mostra 'non trovato' con la strada per uscire, anche durante un caricamento", () => {
        renderWithProviders(<EntityDetailGate isNotFound isLoading notFound={notFound} unavailableLabel="Nessuno." />);

        expect(screen.getByRole("heading", { name: "Report non trovato" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Vai ai report" })).toHaveAttribute("href", "/reports");
        expect(screen.queryByText("Caricamento in corso")).not.toBeInTheDocument();
    });

    it("durante il caricamento mostra l'indicatore a tutta pagina", () => {
        renderWithProviders(
            <EntityDetailGate
                isNotFound={false}
                isLoading
                notFound={notFound}
                unavailableLabel="Report non disponibile."
            />
        );

        expect(screen.getByRole("status")).toHaveTextContent("Caricamento in corso");
        expect(screen.queryByText("Report non disponibile.")).not.toBeInTheDocument();
    });

    it("a caricamento finito senza dati dice che la scheda non è disponibile", () => {
        renderWithProviders(
            <EntityDetailGate
                isNotFound={false}
                isLoading={false}
                notFound={notFound}
                unavailableLabel="Report non disponibile."
            />
        );

        expect(screen.getByText("Report non disponibile.")).toBeInTheDocument();
        expect(screen.queryByText("Caricamento in corso")).not.toBeInTheDocument();
    });

    /** Cliente, collaboratore e tecnico non hanno un testo "non disponibile": resta il caricamento. */
    it("senza testo 'non disponibile' resta sul caricamento", () => {
        renderWithProviders(<EntityDetailGate isNotFound={false} isLoading={false} notFound={notFound} />);

        expect(screen.getByRole("status")).toHaveTextContent("Caricamento in corso");
    });
});
