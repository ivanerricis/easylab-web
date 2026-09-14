import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { InterventionDto, ReportDto } from "@/types/dtos";
import { collaboratorInterventionColumns, collaboratorReportColumns } from "./collaborator-detail-columns";

/**
 * Le celle delle due tabelle della scheda collaboratore, rese da sole. La pagina ha i suoi
 * test, ma non mostra mai tutte le varianti di una cella: qui si fissano quelle.
 */
const intervention: InterventionDto = {
    id: 12,
    type: "intervento_sede",
    description: "Sostituito l'alimentatore",
    status: "in_lavorazione",
    interventionDate: "2026-09-14",
    startTime: "13:00:00",
    endTime: "14:30:00",
    customerId: 3,
    collaboratorId: 5,
    customer: "Mario Rossi",
    customerPhone: null,
    collaborator: "Anna",
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: null,
};

const report = {
    id: 40,
    customer: "Mario Rossi",
    customerPhone: "333123456",
    device: "iPhone 13",
    issue: "Altro",
    issueDescription: "Non si accende dopo la caduta",
    closed: false,
    createdAt: "2026-09-10T08:00:00.000Z",
} as ReportDto;

const renderCell = <Row,>(columns: { key: string; render: (row: Row) => unknown }[], key: string, row: Row) => {
    const column = columns.find((item) => item.key === key);

    if (!column) {
        throw new Error(`Colonna ${key} assente`);
    }

    return renderWithProviders(<div data-testid="cella">{column.render(row) as React.ReactNode}</div>);
};

const cell = () => screen.getByTestId("cella");

describe("colonne degli interventi del collaboratore", () => {
    it("Data/Orario: data e orario, con l'orario tenuto su una riga", () => {
        renderCell(collaboratorInterventionColumns, "schedule", intervention);

        expect(cell()).toHaveTextContent("14/09/2026 13:00-14:30");
        // In mezza scheda su mobile andava a capo sul trattino: l'orario non si spezza.
        expect(screen.getByText("13:00-14:30")).toHaveClass("whitespace-nowrap");
    });

    it("Data/Orario: senza orario mostra solo la data", () => {
        renderCell(collaboratorInterventionColumns, "schedule", { ...intervention, endTime: null });

        expect(cell()).toHaveTextContent(/^14\/09\/2026$/);
    });

    it("Data/Orario: senza data un trattino", () => {
        renderCell(collaboratorInterventionColumns, "schedule", { ...intervention, interventionDate: null });

        expect(cell()).toHaveTextContent(/^-$/);
    });

    it("il tipo in parole, e un trattino al posto del telefono mancante", () => {
        const { unmount } = renderCell(collaboratorInterventionColumns, "type", intervention);
        expect(cell()).toHaveTextContent("Intervento in sede");
        unmount();

        renderCell(collaboratorInterventionColumns, "customerPhone", intervention);
        expect(cell()).toHaveTextContent(/^-$/);
    });

    it("lo stato si legge in parole", () => {
        renderCell(collaboratorInterventionColumns, "status", intervention);

        expect(cell()).toHaveTextContent("In lavorazione");
    });

    it("la colonna Azioni è vuota: i pulsanti li aggiunge la pagina", () => {
        renderCell(collaboratorInterventionColumns, "actions", intervention);

        expect(cell()).toBeEmptyDOMElement();
    });
});

describe("colonne dei report del collaboratore", () => {
    /** Non solo il colore della riga: chi non distingue verde e rosso deve poterlo leggere. */
    it("lo stato si legge in parole", () => {
        const { unmount } = renderCell(collaboratorReportColumns, "closed", report);
        expect(cell()).toHaveTextContent("Aperto");
        unmount();

        renderCell(collaboratorReportColumns, "closed", { ...report, closed: true });
        expect(cell()).toHaveTextContent("Chiuso");
    });

    it("il difetto mostra la voce del catalogo", () => {
        renderCell(collaboratorReportColumns, "issue", report);

        expect(cell()).toHaveTextContent("Altro");
    });

    it("telefono e data di creazione", () => {
        const { unmount } = renderCell(collaboratorReportColumns, "customerPhone", { ...report, customerPhone: null });
        expect(cell()).toHaveTextContent(/^-$/);
        unmount();

        renderCell(collaboratorReportColumns, "createdAt", report);
        expect(cell()).toHaveTextContent(/^10\/09\/2026/);
    });
});
