import fs from "node:fs";
import path from "node:path";

const settingsDir = path.join(process.cwd(), "data");

const stores = new Set<{ invalidate: () => void }>();

type JsonSettingsStoreOptions<T> = {
    /** Nome del file dentro `data/`. */
    fileName: string;
    defaults: T;
    /** Riporta a valori validi quello che c'è nel file. Se lancia, il file è illeggibile. */
    sanitize: (input: Partial<T>) => T;
    /**
     * Se scrivere subito i default quando il file non esiste. I log no: lì il default vale finché
     * nessuno lo cambia, invece di aggiungere una scrittura alla prima riga di log del giorno.
     */
    persistDefaults?: boolean;
};

/**
 * Un file di impostazioni JSON in `data/`, con la sua cache in memoria.
 *
 * Dati azienda, email, backup e conservazione dei log avevano quattro copie dello stesso codice
 * (cache, lettura, scrittura, invalidazione), e le copie avevano un difetto in comune: *qualunque*
 * errore di lettura — anche un file presente ma con un valore fuori regola, come una porta SMTP
 * non valida — faceva ripartire dai default e li scriveva sopra il file, cancellando in silenzio
 * tutto il resto (password cifrate comprese). Qui il file si riscrive con i default solo quando
 * non esiste. Se esiste ma non si legge, i default valgono in memoria, il file resta com'è per
 * poterlo correggere, e il log lo dice; il primo salvataggio dall'interfaccia lo sostituisce.
 */
export const createJsonSettingsStore = <T>({
    fileName,
    defaults,
    sanitize,
    persistDefaults = true,
}: JsonSettingsStoreOptions<T>) => {
    const filePath = path.join(settingsDir, fileName);
    let cached: T | null = null;

    const save = async (state: T) => {
        await fs.promises.mkdir(settingsDir, { recursive: true });
        await fs.promises.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
        cached = state;
    };

    const readFromDisk = async (): Promise<T> => {
        let raw: string;

        try {
            raw = await fs.promises.readFile(filePath, "utf-8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                console.warn(`Impostazioni ${fileName} non leggibili, uso i valori predefiniti:`, error);
                return { ...defaults };
            }

            const state = { ...defaults };

            if (persistDefaults) {
                await save(state);
            }

            return state;
        }

        try {
            return sanitize(JSON.parse(raw) as Partial<T>);
        } catch (error) {
            console.warn(
                `Impostazioni ${fileName} non valide, uso i valori predefiniti senza riscrivere il file:`,
                error
            );
            return { ...defaults };
        }
    };

    const store = {
        /** Lo stato corrente: lo stesso oggetto a ogni chiamata, finché non cambia la cache. */
        load: async (): Promise<T> => {
            cached ??= await readFromDisk();
            return cached;
        },
        /** Scrive il file e aggiorna la cache. */
        save,
        /** Il file è cambiato sotto la cache (un ripristino): la prossima lettura torna al disco. */
        invalidate: () => {
            cached = null;
        },
    };

    stores.add(store);

    return store;
};

/**
 * Dopo un ripristino i file di `data/` sono stati riscritti da fuori: svuota le cache di tutti gli
 * archivi, anche di quelli aggiunti in futuro, invece di elencarli uno per uno nel ripristino.
 */
export const invalidateJsonSettingsCaches = () => {
    for (const store of stores) {
        store.invalidate();
    }
};
