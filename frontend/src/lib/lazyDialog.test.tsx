import { render, renderHook, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { lazyWithPrefetch, useHasBeenOpen } from "./lazyDialog";

const Dialog = () => <p>Dialogo</p>;

describe("lazyWithPrefetch", () => {
    /** Il prefetch e l'apertura devono condividere la stessa richiesta, non farne due. */
    it("il prefetch e il componente usano una richiesta sola", async () => {
        const load = vi.fn().mockResolvedValue({ default: Dialog });
        const { Component, prefetch } = lazyWithPrefetch(load);

        prefetch();
        prefetch();
        render(
            <Suspense fallback={null}>
                <Component />
            </Suspense>
        );

        expect(await screen.findByText("Dialogo")).toBeInTheDocument();
        expect(load).toHaveBeenCalledTimes(1);
    });

    /** Una richiesta fallita (rete assente) non resta in memoria: la successiva riprova. */
    it("dopo un errore la richiesta successiva riprova", async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error("rete")).mockResolvedValue({ default: Dialog });
        const { prefetch } = lazyWithPrefetch(load);

        prefetch();
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        await Promise.resolve();
        prefetch();

        expect(load).toHaveBeenCalledTimes(2);
    });
});

describe("useHasBeenOpen", () => {
    it("resta vero dopo la chiusura, così l'animazione di uscita non si perde", () => {
        const { result, rerender } = renderHook(({ open }) => useHasBeenOpen(open), {
            initialProps: { open: false },
        });
        expect(result.current).toBe(false);

        rerender({ open: true });
        expect(result.current).toBe(true);

        rerender({ open: false });
        expect(result.current).toBe(true);
    });
});
