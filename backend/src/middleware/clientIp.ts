import type { Request } from "express";

/**
 * IP reale del client, usato dal limitatore dei tentativi di login.
 *
 * `req.ip` da solo non basta una volta esposti su internet: Express lo ricava da
 * `X-Forwarded-For`, un header che chiunque può inviare. Con `trust proxy` impostato a
 * `true` Express si fidava di tutta la catena e prendeva l'entry più a sinistra, quindi
 * bastava mandare un `X-Forwarded-For` diverso a ogni tentativo per avere login illimitati.
 *
 * Il traffico pubblico arriva esclusivamente da Cloudflare Tunnel — l'origine non è
 * raggiungibile in altro modo, non essendoci né port forward né porte pubblicate — e
 * Cloudflare *sovrascrive* `CF-Connecting-IP` con l'IP reale del client, scartando
 * qualunque valore inviato dal chiamante. È l'unico anello della catena che un
 * attaccante non può falsificare, ed è affidabile proprio perché non esiste un percorso
 * alternativo per raggiungere il backend scavalcando Cloudflare.
 *
 * L'unica eccezione prevista è l'accesso d'emergenza dalla LAN, e passa dalla porta 8080 di
 * nginx, che su quella porta sostituisce l'header con l'indirizzo che vede davvero
 * (frontend/nginx.conf). Il ragionamento qui sopra resta quindi vero anche in quel caso.
 */
export const getClientIp = (req: Request): string => {
    const cloudflareIp = req.get("cf-connecting-ip")?.trim();

    if (cloudflareIp) {
        return cloudflareIp;
    }

    return req.ip ?? "unknown";
};
