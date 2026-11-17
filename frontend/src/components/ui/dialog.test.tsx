import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

describe("DialogContent: pulsante di chiusura", () => {
    it("si chiama 'Chiudi' una volta sola, senza un tooltip che lo ripeta", () => {
        render(
            <Dialog open>
                <DialogContent>
                    <DialogTitle>Titolo</DialogTitle>
                    <DialogDescription>Descrizione</DialogDescription>
                </DialogContent>
            </Dialog>
        );

        expect(screen.getAllByRole("button", { name: "Chiudi" })).toHaveLength(1);
        expect(screen.getAllByText("Chiudi")).toHaveLength(1);
    });
});
