/** La misura massima del lato lungo del logo, in pixel: sui PDF sta in una casella di 52 pt. */
const maxLogoSide = 256;

/** Il tetto dei caratteri del data URL: sotto quello che il server accetta (90.000). */
const maxLogoLength = 80_000;

const loadImage = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Il file scelto non è un'immagine leggibile"));
        };
        image.src = url;
    });

/**
 * Dal file scelto al data URL del logo: ridotto a 256 px sul lato lungo e salvato come PNG, che
 * tiene la trasparenza. Se il PNG è ancora troppo pesante (una fotografia) passa a JPEG su fondo
 * bianco, abbassando la qualità finché ci sta. Rifiuta ciò che non è PNG o JPEG.
 */
export const logoFileToDataUrl = async (file: File): Promise<string> => {
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
        throw new Error("Il logo deve essere un'immagine PNG o JPEG");
    }

    const image = await loadImage(file);
    const scale = Math.min(1, maxLogoSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");

    if (!context) {
        throw new Error("Impossibile elaborare l'immagine");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = canvas.toDataURL("image/png");

    if (png.length <= maxLogoLength) {
        return png;
    }

    // Il JPEG non ha trasparenza: sotto l'immagine un fondo bianco, come la carta del PDF.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (const quality of [0.9, 0.8, 0.7, 0.5]) {
        const jpeg = canvas.toDataURL("image/jpeg", quality);

        if (jpeg.length <= maxLogoLength) {
            return jpeg;
        }
    }

    throw new Error("Il logo è troppo pesante: scegli un'immagine più semplice");
};
