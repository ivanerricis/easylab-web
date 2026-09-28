import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { brandLogoUrl } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
    /** Di norma il logo del laboratorio; le impostazioni ci aggiungono `?v=` per l'anteprima. */
    src?: string;
    alt: string;
    className?: string;
};

/**
 * Il logo del laboratorio, con un segnaposto se l'immagine non arriva.
 *
 * Quando il logo non è stato impostato il backend risponde già con un'immagine neutra
 * (`backend/public/logo-placeholder.png`). Ma se la richiesta fallisce — backend spento o non
 * ancora partito, un file rimosso a mano — il browser disegnava l'icona dell'immagine rotta,
 * proprio nel punto più in vista della pagina di accesso e della barra laterale. Qui al suo
 * posto c'è lo stesso disegno del segnaposto del backend, così i due casi si vedono uguali.
 *
 * Riempie il contenitore: dimensioni, bordo e angoli li decide chi lo usa.
 */
const BrandLogo = ({ src = brandLogoUrl, alt, className }: BrandLogoProps) => {
    // Legato all'indirizzo e non a un booleano: un logo appena caricato dalle impostazioni
    // cambia `src`, e deve riprovare invece di restare sul segnaposto.
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    if (failedSrc === src) {
        return (
            <div
                role={alt ? "img" : undefined}
                aria-label={alt || undefined}
                aria-hidden={alt ? undefined : true}
                className={cn("flex size-full items-center justify-center bg-muted text-muted-foreground", className)}
            >
                <ImageIcon className="size-1/2" strokeWidth={1.5} />
            </div>
        );
    }

    return <img src={src} alt={alt} onError={() => setFailedSrc(src)} className={cn("size-full", className)} />;
};

export default BrandLogo;
