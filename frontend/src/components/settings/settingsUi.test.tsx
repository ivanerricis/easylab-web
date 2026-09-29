import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsCard } from "./settingsUi";

describe("SettingsCard", () => {
    /** Da `div` lo screen reader non trovava le sezioni delle Impostazioni navigando per titoli. */
    it("il titolo è un h2, con lo stesso aspetto di prima", () => {
        render(<SettingsCard title="Backup">contenuto</SettingsCard>);

        const heading = screen.getByRole("heading", { level: 2, name: "Backup" });
        expect(heading).toHaveAttribute("data-slot", "card-title");
        expect(heading).toHaveClass("text-lg", "font-semibold");
    });
});
