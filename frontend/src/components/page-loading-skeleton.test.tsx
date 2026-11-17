import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PageLoadingSkeleton from "./page-loading-skeleton";
import { renderWithProviders } from "@/test/render";

describe("PageLoadingSkeleton", () => {
    it.each(["/contracts/5", "/providers/2", "/clients/1"])("%s mostra lo scheletro di dettaglio", (pathname) => {
        renderWithProviders(<PageLoadingSkeleton pathname={pathname} />);

        expect(screen.getByRole("status")).toHaveTextContent("Caricamento della pagina");
        // Lo scheletro di dettaglio ha la freccia dell'intestazione, quello delle liste no.
        expect(document.querySelector(".-ml-2")).not.toBeNull();
    });

    it.each(["/contracts", "/providers"])("%s (lista) resta sullo scheletro delle liste", (pathname) => {
        renderWithProviders(<PageLoadingSkeleton pathname={pathname} />);

        expect(screen.getByRole("status")).toHaveTextContent("Caricamento della pagina");
        expect(document.querySelector(".-ml-2")).toBeNull();
    });
});
