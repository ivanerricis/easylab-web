import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePageShortcut } from "./usePageShortcut";
import { setStoredKeyboardShortcutsEnabled } from "@/lib/theme";

const Probe = ({
    shortcutKey,
    onTrigger,
    alwaysActive,
}: {
    shortcutKey: string;
    onTrigger: () => void;
    alwaysActive?: boolean;
}) => {
    usePageShortcut(shortcutKey, onTrigger, { alwaysActive });
    return <input aria-label="Campo" />;
};

beforeEach(() => {
    localStorage.clear();
});

describe("usePageShortcut e la preferenza delle scorciatoie", () => {
    it("scatta con la preferenza predefinita (attive)", () => {
        const onTrigger = vi.fn();
        render(<Probe shortcutKey="n" onTrigger={onTrigger} />);

        fireEvent.keyDown(window, { key: "n" });

        expect(onTrigger).toHaveBeenCalledTimes(1);
    });

    /** La preferenza si legge al tasto: l'interruttore vale subito, senza rimontare la pagina. */
    it("non scatta più appena vengono spente, e riprende appena si riaccendono", () => {
        const onTrigger = vi.fn();
        render(<Probe shortcutKey="n" onTrigger={onTrigger} />);

        setStoredKeyboardShortcutsEnabled(false);
        fireEvent.keyDown(window, { key: "n" });
        expect(onTrigger).not.toHaveBeenCalled();

        setStoredKeyboardShortcutsEnabled(true);
        fireEvent.keyDown(window, { key: "n" });
        expect(onTrigger).toHaveBeenCalledTimes(1);
    });

    /** Il "?" dell'elenco resta: è lì che si scopre dove riaccenderle. */
    it("con alwaysActive scatta anche a scorciatoie spente", () => {
        const onTrigger = vi.fn();
        setStoredKeyboardShortcutsEnabled(false);
        render(<Probe shortcutKey="?" onTrigger={onTrigger} alwaysActive />);

        fireEvent.keyDown(window, { key: "?" });

        expect(onTrigger).toHaveBeenCalledTimes(1);
    });
});
