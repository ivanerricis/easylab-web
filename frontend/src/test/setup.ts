// Aggiunge i matcher DOM (toBeInTheDocument, toHaveTextContent, ...) a `expect` di
// vitest, con i relativi tipi.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Smonta i componenti montati fra un test e l'altro: senza, il DOM si accumula e le
// query di testing-library trovano più elementi del previsto.
afterEach(() => {
    cleanup();
});

// jsdom non implementa matchMedia, che il ThemeProvider e l'hook use-mobile interrogano al
// montaggio: senza questo stub qualunque test che monti un componente reale esplode.
if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

// jsdom non implementa la Pointer Events API né lo scorrimento programmatico. I componenti
// Radix (Select, DropdownMenu, Popover) li usano per gestire il trascinamento sul trigger e
// per portare in vista la voce selezionata: senza questi stub un semplice click sul menu
// solleva "target.hasPointerCapture is not a function" e il test fallisce per un motivo che
// non c'entra con quello che sta verificando.
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}

// Anche `elementFromPoint` manca in jsdom. Il calendario (react-big-calendar con `selectable`)
// ascolta ogni `mousedown` del documento e lo chiama per capire se il puntatore è sopra la
// griglia: senza stub, qualunque click in una pagina con il calendario solleva un'eccezione
// non gestita. `null` vuol dire "sopra nessun elemento", cioè nessuna selezione da iniziare.
if (!document.elementFromPoint) {
    document.elementFromPoint = () => null;
}

// Stessa storia per ResizeObserver, che jsdom non implementa: il Tooltip di Radix lo usa
// per misurare la freccia quando il contenuto si apre, quindi senza stub un click su un
// pulsante con tooltip fa fallire il test con "ResizeObserver is not defined".
if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}
