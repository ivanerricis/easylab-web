import { useLocation } from "react-router-dom";

/**
 * Scrive l'indirizzo corrente del router nella pagina, per i test che controllano cosa una
 * pagina scrive nell'indirizzo (filtri, ricerca, pagina: vedi `useListUrlState`).
 */
export const LocationProbe = () => {
    const { pathname, search } = useLocation();

    return <output data-testid="location">{`${pathname}${search}`}</output>;
};
