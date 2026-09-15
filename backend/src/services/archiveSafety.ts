/**
 * Un archivio di backup da ripristinare deve contenere solo file e cartelle.
 *
 * tar ricrea anche i collegamenti che trova nell'archivio, e il ripristino poi copia la cartella
 * `data/` sopra quella dell'app. Un archivio preparato con `data/logo/logo.png` che punta a
 * `data/secret.key` faceva servire la chiave dei segreti su /assets/logo.jpg, che è pubblico
 * perché serve alla pagina di login: `getLogoFile` controlla il nome scritto in `meta.json`, ma
 * il file con quel nome poteva essere un collegamento a qualunque altra cosa.
 *
 * I controlli sono due, e servono entrambi:
 * - prima di estrarre, sull'elenco di `tar -tv`: un collegamento non deve nemmeno arrivare sul
 *   disco, perché un file estratto *dopo* un collegamento a una cartella verrebbe scritto dentro
 *   la cartella puntata, fuori da quella di estrazione;
 * - dopo l'estrazione, con `lstat` su tutto quello che è uscito: non dipende da come una
 *   particolare versione di tar formatta l'elenco.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * La prima voce dell'elenco `tar -tv` che non è un file o una cartella semplici, o null.
 *
 * Il primo carattere è il tipo, come in `ls -l`: `-` file, `d` cartella, `l` collegamento
 * simbolico, `h` collegamento fisico per GNU tar. Busybox, il tar dell'immagine di produzione,
 * scrive invece i collegamenti fisici come file (`-rw-r--r-- … copia.sql -> dump.sql`, verificato
 * con busybox 1.37), da qui il controllo sulla freccia. GNU usa ` link to `.
 */
export const findUnsafeTarEntry = (listing: string): string | null => {
    for (const line of listing.split("\n")) {
        const entry = line.trimEnd();

        if (!entry) {
            continue;
        }

        const type = entry[0];

        if ((type !== "-" && type !== "d") || entry.includes(" -> ") || entry.includes(" link to ")) {
            return entry;
        }
    }

    return null;
};

/** Il percorso della prima voce che non è un file o una cartella, o con più di un nome. */
export const findNonPlainEntry = async (directory: string): Promise<string | null> => {
    const entries = await fs.promises.readdir(directory, { recursive: true, withFileTypes: true });

    for (const entry of entries) {
        const entryPath = path.join(entry.parentPath, entry.name);
        const stats = await fs.promises.lstat(entryPath);

        if (stats.isDirectory()) {
            continue;
        }

        // `nlink > 1`: un collegamento fisico, cioè lo stesso file raggiungibile anche da fuori.
        if (!stats.isFile() || stats.nlink > 1) {
            return path.relative(directory, entryPath);
        }
    }

    return null;
};
