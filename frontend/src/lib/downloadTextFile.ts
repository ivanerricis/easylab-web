/**
 * Scarica un testo generato nel browser come file. Tutti gli altri download dell'app sono URL
 * del server; qui il contenuto (i codici di recupero) non deve mai passare dalla rete, quindi
 * si costruisce un Blob locale.
 */
export const downloadTextFile = (fileName: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.hidden = true;
    document.body.appendChild(anchor);

    try {
        anchor.click();
    } finally {
        anchor.remove();
        // Il download parte in modo asincrono: revocare subito lo farebbe fallire in alcuni browser.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
};
