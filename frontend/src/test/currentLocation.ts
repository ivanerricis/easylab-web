import { screen } from "@testing-library/react";

/** L'indirizzo scritto da `LocationProbe`, con i parametri già decodificati. */
export const currentLocation = () => {
    const [pathname, query = ""] = (screen.getByTestId("location").textContent ?? "").split("?");

    return { pathname, params: Object.fromEntries(new URLSearchParams(query)) };
};
