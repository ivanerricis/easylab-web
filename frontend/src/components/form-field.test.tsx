import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FormField from "@/components/form-field";
import FormSection from "@/components/dialogs/form-section";
import { fieldProps } from "@/lib/formField";

describe("FormField", () => {
    it("lega etichetta, asterisco ed errore al controllo, con l'etichetta grande dei dialoghi", () => {
        render(
            <FormField id="name" label="Nome" required error="Obbligatorio" className="gap-1 lg:col-span-2">
                <input {...fieldProps("name", { error: "Obbligatorio", required: true })} />
            </FormField>
        );

        const input = screen.getByLabelText(/Nome/);
        expect(input).toHaveAccessibleDescription("Obbligatorio");
        expect(screen.getByText("(obbligatorio)")).toBeInTheDocument();
        expect(screen.getByText("Nome", { selector: "label" })).toHaveClass("text-lg");
        // Le classi del chiamante arrivano al contenitore: sono la spaziatura e la colonna.
        expect(input.parentElement).toHaveClass("grid", "gap-1", "lg:col-span-2");
    });

    it("senza errore non disegna il messaggio, e senza required niente asterisco", () => {
        render(
            <FormField id="note" label="Note">
                <textarea id="note" />
            </FormField>
        );

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.queryByText("(obbligatorio)")).not.toBeInTheDocument();
    });

    it("nelle Impostazioni: etichetta piccola, errore nello stesso blocco del controllo, nota sotto", () => {
        render(
            <FormField
                id="port"
                label="Porta"
                error="Porta non valida"
                labelSize="sm"
                groupControlAndError
                description="Di solito 445"
            >
                <input {...fieldProps("port", { error: "Porta non valida" })} />
            </FormField>
        );

        const label = screen.getByText("Porta", { selector: "label" });
        // Con `text-sm` sopra `text-lg` tailwind-merge toglieva il `leading-none` di `Label`.
        expect(label).not.toHaveClass("text-lg");
        expect(label).toHaveClass("leading-none");

        const input = screen.getByLabelText("Porta");
        const block = input.parentElement;
        expect(block).toContainElement(screen.getByRole("alert"));
        // Due soli figli del contenitore prima della nota: etichetta e blocco, come vuole
        // la subgrid di `SettingsField`.
        expect(block?.parentElement?.children).toHaveLength(3);
        expect(block?.nextElementSibling).toHaveTextContent("Di solito 445");
    });
});

describe("FormSection", () => {
    it("mostra il titolo e perde il riquadro su telefono solo se richiesto", () => {
        const { rerender } = render(
            <FormSection title="Anagrafica">
                <p>campi</p>
            </FormSection>
        );

        const section = screen.getByRole("heading", { name: "Anagrafica" }).parentElement;
        expect(section).toHaveClass("rounded-md", "border", "p-4");
        expect(section).not.toHaveClass("max-sm:border-x-0");

        rerender(
            <FormSection title="Anagrafica" flatOnMobile>
                <p>campi</p>
            </FormSection>
        );
        expect(screen.getByRole("heading", { name: "Anagrafica" }).parentElement).toHaveClass("max-sm:border-x-0");
    });
});
