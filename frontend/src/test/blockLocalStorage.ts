/**
 * Simula i dati del sito bloccati: il browser lancia `SecurityError` già leggendo
 * `window.localStorage`, prima di qualunque `getItem`. Restituisce la funzione che rimette
 * il localStorage di jsdom.
 */
export const blockLocalStorage = () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

    Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: () => {
            throw new DOMException("The operation is insecure.", "SecurityError");
        },
    });

    return () => {
        if (descriptor) {
            Object.defineProperty(window, "localStorage", descriptor);
        }
    };
};
