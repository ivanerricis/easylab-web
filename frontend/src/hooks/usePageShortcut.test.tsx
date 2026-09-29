import { fireEvent, render, screen } from "@testing-library/react";
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

describe("usePageShortcut: quando il tasto resta senza effetto", () => {
    /** Un contenitore qualunque, con dentro un elemento che prende il focus. */
    const renderWith = (content: string, alwaysActive = false) => {
        const onTrigger = vi.fn();
        const { container } = render(<Probe shortcutKey="n" onTrigger={onTrigger} alwaysActive={alwaysActive} />);
        const host = document.createElement("div");
        host.innerHTML = content;
        container.appendChild(host);

        return { onTrigger, focus: (selector: string) => host.querySelector<HTMLElement>(selector)!.focus() };
    };

    it("scatta solo col tasto giusto, senza Ctrl, Cmd o Alt, e blocca l'azione predefinita", () => {
        const onTrigger = vi.fn();
        render(<Probe shortcutKey="n" onTrigger={onTrigger} />);

        fireEvent.keyDown(window, { key: "m" });
        fireEvent.keyDown(window, { key: "N" });
        fireEvent.keyDown(window, { key: "n", ctrlKey: true });
        fireEvent.keyDown(window, { key: "n", metaKey: true });
        fireEvent.keyDown(window, { key: "n", altKey: true });
        expect(onTrigger).not.toHaveBeenCalled();

        const event = new KeyboardEvent("keydown", { key: "n", cancelable: true });
        window.dispatchEvent(event);
        expect(onTrigger).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it.each([
        ["un campo", '<input id="target" />'],
        ["un'area di testo", '<textarea id="target"></textarea>'],
        ["una tendina nativa", '<select id="target"><option>a</option></select>'],
    ])("non scatta mentre si scrive in %s", (_, content) => {
        const { onTrigger, focus } = renderWith(content);
        focus("#target");

        fireEvent.keyDown(document.activeElement!, { key: "n" });

        expect(onTrigger).not.toHaveBeenCalled();
    });

    it("non scatta in un elemento modificabile", () => {
        const { onTrigger, focus } = renderWith('<div id="target" tabindex="0"></div>');
        const target = document.getElementById("target")!;
        // jsdom non calcola `isContentEditable` da `contenteditable`: lo si imposta a mano.
        Object.defineProperty(target, "isContentEditable", { value: true });
        focus("#target");

        fireEvent.keyDown(target, { key: "n" });

        expect(onTrigger).not.toHaveBeenCalled();
    });

    it.each(["dialog", "menu", "listbox"])("non scatta col focus dentro un elemento role=%s", (role) => {
        const { onTrigger, focus } = renderWith(
            `<div role="${role}"><div><button id="target">Voce</button></div></div>`
        );
        focus("#target");

        fireEvent.keyDown(document.activeElement!, { key: "n" });

        expect(onTrigger).not.toHaveBeenCalled();
    });

    /** Il blocco vale anche per il "?": in un dialogo quella lettera la si sta scrivendo. */
    it("con alwaysActive resta comunque bloccato mentre si scrive o dentro un dialogo", () => {
        const { onTrigger, focus } = renderWith('<div role="dialog"><button id="in-dialog">Ok</button></div>', true);
        setStoredKeyboardShortcutsEnabled(false);

        focus("#in-dialog");
        fireEvent.keyDown(document.activeElement!, { key: "n" });
        screen.getByLabelText("Campo").focus();
        fireEvent.keyDown(document.activeElement!, { key: "n" });

        expect(onTrigger).not.toHaveBeenCalled();
    });

    /** Il tooltip compare passandoci sopra e non prende il focus: non deve spegnere le scorciatoie. */
    it("scatta col focus su un pulsante fuori dagli strati, anche dentro un tooltip", () => {
        const { onTrigger, focus } = renderWith('<div role="tooltip"><button id="target">Aiuto</button></div>');
        focus("#target");

        fireEvent.keyDown(document.activeElement!, { key: "n" });

        expect(onTrigger).toHaveBeenCalledTimes(1);
    });

    it("smontata la pagina, il tasto non fa più niente", () => {
        const onTrigger = vi.fn();
        const { unmount } = render(<Probe shortcutKey="n" onTrigger={onTrigger} />);

        unmount();
        fireEvent.keyDown(window, { key: "n" });

        expect(onTrigger).not.toHaveBeenCalled();
    });
});
