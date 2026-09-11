import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

import CreateCollaboratorDialog from "./createCollaboratorDialog";
import CreateCustomerDialog from "./createCustomerDialog";
import CreateIssueDialog from "./createIssueDialog";
import CreateTechnicianDialog from "./createTechnicianDialog";
import { renderWithProviders } from "@/test/render";

const save = () => userEvent.click(screen.getByRole("button", { name: "Salva" }));

beforeEach(() => {
    vi.clearAllMocks();
});

describe("CreateCustomerDialog", () => {
    it("consegna tutti i campi compilati", async () => {
        const onSubmit = vi.fn();
        const onOpenChange = vi.fn();
        renderWithProviders(<CreateCustomerDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

        await userEvent.type(screen.getByLabelText(/^Nome/), "Mario");
        await userEvent.type(screen.getByLabelText("Cognome"), "Rossi");
        await userEvent.type(screen.getByLabelText("Telefono 2"), "06 123456");
        await userEvent.type(screen.getByLabelText("Email"), "mario@example.com");
        await userEvent.type(screen.getByLabelText("Località"), "Roma");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({
                firstName: "Mario",
                lastName: "Rossi",
                phoneNumber: "",
                phoneNumberSecondary: "06 123456",
                email: "mario@example.com",
                city: "Roma",
            });
        });
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(toastSuccess).toHaveBeenCalledWith("Cliente creato con successo");
    });

    /** Un cliente che non si può richiamare è inutile al banco: basta uno dei due numeri. */
    it("pretende il nome e almeno un telefono, segnalandoli insieme", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateCustomerDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await save();

        const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
        expect(alerts).toEqual([
            "Il nome non può essere vuoto",
            "Serve almeno un numero di telefono, il primo o il secondo",
        ]);
        expect(screen.getByLabelText(/^Nome/)).toHaveFocus();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("toglie l'errore dal campo appena lo si corregge", async () => {
        renderWithProviders(<CreateCustomerDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />);
        await save();

        await userEvent.type(screen.getByLabelText(/^Nome/), "M");

        expect(screen.getAllByRole("alert")).toHaveLength(1);
        expect(screen.getByLabelText(/^Nome/)).toBeValid();
    });

    /**
     * La validazione nativa del browser è spenta nei dialoghi: l'email la controlla il
     * dialogo, con la stessa regola di `type="email"`, e l'errore va sotto il campo.
     */
    it("rifiuta un'email non valida sotto il campo, ma la lascia facoltativa", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateCustomerDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await userEvent.type(screen.getByLabelText(/^Nome/), "Mario");
        await userEvent.type(screen.getByLabelText(/Telefono 1/), "333");
        await userEvent.type(screen.getByLabelText("Email"), "mario@");
        await save();

        expect(screen.getByRole("alert")).toHaveTextContent("Indirizzo email non valido");
        expect(screen.getByLabelText("Email")).toHaveFocus();
        expect(onSubmit).not.toHaveBeenCalled();

        await userEvent.clear(screen.getByLabelText("Email"));
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ email: "" }));
        });
    });

    it("in modifica parte dai valori del cliente, trasformando i null in vuoti", async () => {
        renderWithProviders(
            <CreateCustomerDialog
                open
                mode="edit"
                onOpenChange={() => {}}
                initialValues={{
                    id: 1,
                    firstName: "Mario",
                    lastName: null,
                    phoneNumber: "333",
                    phoneNumberSecondary: null,
                    email: null,
                    city: "Roma",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: null,
                }}
            />
        );

        expect(screen.getByRole("dialog", { name: "Modifica cliente" })).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByLabelText(/^Nome/)).toHaveValue("Mario");
        });
        expect(screen.getByLabelText("Cognome")).toHaveValue("");
        expect(screen.getByLabelText("Località")).toHaveValue("Roma");
    });

    it("se il salvataggio fallisce resta aperto con l'errore del server", async () => {
        const onOpenChange = vi.fn();
        const onSubmit = vi.fn().mockRejectedValue(new Error("Cliente già esistente"));
        renderWithProviders(<CreateCustomerDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

        await userEvent.type(screen.getByLabelText(/^Nome/), "Mario");
        await userEvent.type(screen.getByLabelText(/Telefono 1/), "333");
        await save();

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Cliente già esistente");
        });
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled();
    });
});

describe("CreateTechnicianDialog", () => {
    it("pretende nome e cognome, con il focus sul primo mancante", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateTechnicianDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await userEvent.type(screen.getByLabelText(/^Nome/), "Anna");
        await save();

        expect(screen.getByRole("alert")).toHaveTextContent("Il cognome non può essere vuoto");
        expect(screen.getByLabelText(/^Cognome/)).toHaveFocus();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("consegna i campi, partita IVA compresa", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateTechnicianDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await userEvent.type(screen.getByLabelText(/^Nome/), "Anna");
        await userEvent.type(screen.getByLabelText(/^Cognome/), "Verdi");
        await userEvent.type(screen.getByLabelText("Partita IVA"), "IT123");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({
                firstName: "Anna",
                lastName: "Verdi",
                phoneNumber: "",
                vatNumber: "IT123",
            });
        });
        expect(toastSuccess).toHaveBeenCalledWith("Tecnico creato con successo");
    });
});

describe("CreateCollaboratorDialog", () => {
    it("pretende solo il nome", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateCollaboratorDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await save();
        expect(screen.getByRole("alert")).toHaveTextContent("Il nome non può essere vuoto");

        await userEvent.type(screen.getByLabelText(/^Nome/), "Luca");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({ firstName: "Luca", lastName: "", phoneNumber: "" });
        });
    });
});

describe("CreateIssueDialog", () => {
    it("pretende la descrizione", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateIssueDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await save();
        expect(screen.getByRole("alert")).toHaveTextContent("Inserire una descrizione per il problema");

        await userEvent.type(screen.getByLabelText(/Descrizione/), "Schermo rotto");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({ description: "Schermo rotto" });
        });
    });

    it("chiude senza salvare quando nessuno gestisce l'invio", async () => {
        const onOpenChange = vi.fn();
        renderWithProviders(<CreateIssueDialog open onOpenChange={onOpenChange} />);

        await userEvent.type(screen.getByLabelText(/Descrizione/), "Schermo rotto");
        await save();

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(toastSuccess).not.toHaveBeenCalled();
    });
});
