import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useGoBack } from "./useGoBack";
import { LocationProbe } from "@/test/locationProbe";
import { render } from "@testing-library/react";

const BackButton = () => {
    const goBack = useGoBack("/reports");

    return <button onClick={goBack}>Indietro</button>;
};

const OpenDetail = () => {
    const navigate = useNavigate();

    return <button onClick={() => navigate("/reports/5")}>Apri</button>;
};

const renderAt = (route: string) =>
    render(
        <MemoryRouter initialEntries={[route]}>
            <Routes>
                <Route path="/reports/:id" element={<BackButton />} />
                <Route path="*" element={<OpenDetail />} />
            </Routes>
            <LocationProbe />
        </MemoryRouter>
    );

describe("useGoBack", () => {
    it("torna alla pagina precedente quando c'è", async () => {
        renderAt("/reports?q=rossi");

        await userEvent.click(screen.getByRole("button", { name: "Apri" }));
        await userEvent.click(screen.getByRole("button", { name: "Indietro" }));

        expect(screen.getByTestId("location")).toHaveTextContent("/reports?q=rossi");
    });

    /** Una scheda aperta in un'altra scheda del browser, o da un link: non c'è un "prima". */
    it("porta all'elenco quando la scheda è la prima pagina aperta", async () => {
        renderAt("/reports/5");

        await userEvent.click(screen.getByRole("button", { name: "Indietro" }));

        expect(screen.getByTestId("location")).toHaveTextContent(/^\/reports$/);
    });
});
