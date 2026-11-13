import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ColumnVisibilityMenu from "./column-visibility-menu";

const columns = [
    { key: "id", header: "ID" },
    { key: "customer", header: "Cliente", hideable: false },
    { key: "device", header: "Dispositivo" },
    { key: "actions", header: "Azioni" },
];

const renderMenu = (props: Partial<Parameters<typeof ColumnVisibilityMenu>[0]> = {}) => {
    const handlers = {
        onColumnVisibleChange: vi.fn(),
        onShowAll: vi.fn(),
        onColumnMoveBy: vi.fn(),
        onResetOrder: vi.fn(),
    };

    render(<ColumnVisibilityMenu columns={columns} hiddenColumnKeys={[]} {...handlers} {...props} />);

    return handlers;
};

const openMenu = () => userEvent.click(screen.getByRole("button", { name: /^Colonne/ }));

describe("ColumnVisibilityMenu: ordine delle colonne", () => {
    it("elenca le voci nell'ordine ricevuto, senza le azioni", async () => {
        renderMenu();
        await openMenu();

        expect(screen.getAllByRole("menuitemcheckbox").map((item) => item.textContent)).toEqual([
            "ID",
            "Cliente",
            "Dispositivo",
        ]);
    });

    it("sposta una voce con le frecce senza toccare la spunta, e il menu resta aperto", async () => {
        const { onColumnMoveBy, onColumnVisibleChange } = renderMenu();

        await openMenu();
        await userEvent.click(screen.getByRole("menuitem", { name: "Sposta Cliente giù" }));
        await userEvent.click(screen.getByRole("menuitem", { name: "Sposta Cliente su" }));

        expect(onColumnMoveBy).toHaveBeenNthCalledWith(1, "customer", 1);
        expect(onColumnMoveBy).toHaveBeenNthCalledWith(2, "customer", -1);
        expect(onColumnVisibleChange).not.toHaveBeenCalled();
        expect(screen.getByRole("menuitemcheckbox", { name: "Dispositivo" })).toBeInTheDocument();
    });

    it("la freccia su della prima voce e quella giù dell'ultima sono disabilitate", async () => {
        const { onColumnMoveBy } = renderMenu();

        await openMenu();

        expect(screen.getByRole("menuitem", { name: "Sposta ID su" })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("menuitem", { name: "Sposta Dispositivo giù" })).toHaveAttribute(
            "aria-disabled",
            "true"
        );
        expect(screen.getByRole("menuitem", { name: "Sposta ID giù" })).not.toHaveAttribute("aria-disabled");

        await userEvent.click(screen.getByRole("menuitem", { name: "Sposta ID su" }));
        expect(onColumnMoveBy).not.toHaveBeenCalled();
    });

    it("le frecce si raggiungono da tastiera", async () => {
        const { onColumnMoveBy } = renderMenu();

        await openMenu();
        screen.getByRole("menuitem", { name: "Sposta ID giù" }).focus();
        await userEvent.keyboard("{Enter}");

        expect(onColumnMoveBy).toHaveBeenCalledWith("id", 1);
    });

    it("'Ripristina ordine' è disabilitata finché l'ordine è quello predefinito", async () => {
        const { onResetOrder } = renderMenu({ isCustomOrder: false });

        await openMenu();
        await userEvent.click(screen.getByRole("menuitem", { name: "Ripristina ordine" }));

        expect(screen.getByRole("menuitem", { name: "Ripristina ordine" })).toHaveAttribute("aria-disabled", "true");
        expect(onResetOrder).not.toHaveBeenCalled();
    });

    it("'Ripristina ordine' chiama onResetOrder con un ordine personalizzato", async () => {
        const { onResetOrder } = renderMenu({ isCustomOrder: true });

        await openMenu();
        await userEvent.click(screen.getByRole("menuitem", { name: "Ripristina ordine" }));

        expect(onResetOrder).toHaveBeenCalledTimes(1);
    });

    it("senza le props dell'ordine il menu non mostra frecce né ripristino", async () => {
        render(
            <ColumnVisibilityMenu
                columns={columns}
                hiddenColumnKeys={[]}
                onColumnVisibleChange={vi.fn()}
                onShowAll={vi.fn()}
            />
        );
        await openMenu();

        expect(screen.queryByRole("menuitem", { name: /Sposta/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Ripristina ordine" })).not.toBeInTheDocument();
    });
});
