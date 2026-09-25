/**
 * Il marchio del laboratorio: logo, nome e sottotitolo. Stava scritto a mano nella barra
 * laterale, e la pagina di accesso diceva un'altra cosa ("EasyLab", il nome del prodotto, senza
 * logo): chi entrava vedeva due nomi diversi prima e dopo il login. Il titolo delle schede del
 * browser resta invece sul nome del prodotto (`useDocumentTitle`).
 */
export const brandName = "FutureOffice";
export const brandSubtitle = "Laboratorio";

/** Il logo è servito dal backend senza autenticazione, quindi si vede anche prima del login. */
export const brandLogoUrl: string = import.meta.env.VITE_LOGO_URL ?? "http://localhost:3000/assets/logo.jpg";
