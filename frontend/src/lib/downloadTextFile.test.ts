import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadTextFile } from "./downloadTextFile";

/** jsdom non ha `Blob.text()`: si legge con `FileReader`. */
const readBlob = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });

describe("downloadTextFile", () => {
    const createObjectURL = vi.fn();
    const revokeObjectURL = vi.fn();
    let click: ReturnType<typeof vi.spyOn>;
    let clicked: { download: string; href: string } | null;

    beforeEach(() => {
        vi.useFakeTimers();
        clicked = null;
        createObjectURL.mockReturnValue("blob:test-url");
        // jsdom non implementa questi due metodi.
        Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
        Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
        click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            clicked = { download: this.download, href: this.href };
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        click.mockRestore();
    });

    it("crea un Blob di testo con il contenuto e lo scarica con il nome dato", async () => {
        downloadTextFile("codici.txt", "riga 1\nriga 2");

        expect(clicked).toEqual({ download: "codici.txt", href: "blob:test-url" });
        const blob = createObjectURL.mock.calls[0][0] as Blob;
        expect(blob.type).toBe("text/plain;charset=utf-8");
        vi.useRealTimers();
        expect(await readBlob(blob)).toBe("riga 1\nriga 2");
    });

    it("toglie il link dalla pagina e revoca l'URL dopo il clic", () => {
        downloadTextFile("codici.txt", "x");

        expect(document.querySelector("a[download]")).toBeNull();
        vi.runAllTimers();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
    });
});
