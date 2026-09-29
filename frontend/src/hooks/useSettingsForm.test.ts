import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

import { useSettingsForm } from "./useSettingsForm";

/** Il DTO del server ha un campo in più di sola lettura, come quelli veri ("password già impostata"). */
type Dto = { host: string; port: number; passwordSet: boolean };
type Form = { host: string; port: number; password: string };
type Field = "host" | "port";

const toForm = (dto: Dto): Form => ({ host: dto.host, port: dto.port, password: "" });
const defaultValues: Form = { host: "", port: 0, password: "" };
const messages = { loadError: "Caricamento fallito", saveError: "Salvataggio fallito", saved: "Salvato" };
const serverDto: Dto = { host: "smtp.example.com", port: 587, passwordSet: true };

/**
 * Un errore del server senza messaggio suo, come arriva da axios: il toast deve usare il testo
 * di ripiego del pannello (vedi `getApiErrorMessage`).
 */
const serverError = () =>
    Object.assign(new Error("Request failed with status code 500"), {
        isAxiosError: true,
        response: { status: 500, data: {} },
    });

/** Una promise che il test risolve quando vuole, per vedere gli stati intermedi. */
const createDeferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

type HookOptions = Partial<Parameters<typeof useSettingsForm<Dto, Form, Field>>[0]>;

const renderSettingsForm = (options: HookOptions = {}) =>
    renderHook((props: HookOptions) =>
        useSettingsForm<Dto, Form, Field>({
            load: () => Promise.resolve(serverDto),
            save: (values) => Promise.resolve({ host: values.host.trim(), port: values.port, passwordSet: true }),
            toForm,
            defaultValues,
            messages,
            ...options,
            ...props,
        })
    );

/** Aspetta la fine del caricamento iniziale. */
const renderLoaded = async (options: HookOptions = {}) => {
    const rendered = renderSettingsForm(options);
    await waitFor(() => expect(rendered.result.current.data).not.toBeNull());
    return rendered;
};

describe("useSettingsForm", () => {
    beforeEach(() => {
        toastError.mockClear();
        toastSuccess.mockClear();
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("carica il DTO nel modulo e nei valori salvati, senza modifiche in sospeso", async () => {
        const load = createDeferred<Dto>();
        const { result } = renderSettingsForm({ load: () => load.promise });

        await waitFor(() => expect(result.current.isLoading).toBe(true));
        expect(result.current.formValues).toEqual(defaultValues);

        await act(async () => load.resolve(serverDto));

        expect(result.current.isLoading).toBe(false);
        expect(result.current.data).toEqual(serverDto);
        expect(result.current.formValues).toEqual(toForm(serverDto));
        expect(result.current.savedValues).toEqual(toForm(serverDto));
        expect(result.current.isDirty).toBe(false);
    });

    it("se il caricamento fallisce avvisa e lascia i valori di partenza", async () => {
        const { result } = renderSettingsForm({ load: () => Promise.reject(serverError()) });

        await waitFor(() => expect(toastError).toHaveBeenCalledWith("Caricamento fallito"));
        expect(result.current.isLoading).toBe(false);
        expect(result.current.data).toBeNull();
        expect(result.current.formValues).toEqual(defaultValues);
    });

    it("carica una volta sola anche se `load` cambia a ogni render", async () => {
        const load = vi.fn(() => Promise.resolve(serverDto));
        const { rerender } = await renderLoaded({ load });

        rerender({ load: vi.fn(() => Promise.resolve(serverDto)) });
        rerender({});

        expect(load).toHaveBeenCalledTimes(1);
    });

    it("segnala le modifiche non salvate alla pagina, e `false` allo smontaggio", async () => {
        const onDirtyChange = vi.fn();
        const { result, unmount } = await renderLoaded({ onDirtyChange });

        expect(onDirtyChange).toHaveBeenLastCalledWith(false);

        act(() => result.current.setFormValues((prev) => ({ ...prev, host: "altro.example.com" })));
        expect(result.current.isDirty).toBe(true);
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);

        // Riscrivere il valore di prima riporta il modulo "pulito": il confronto è per valore.
        act(() => result.current.setFormValues((prev) => ({ ...prev, host: serverDto.host })));
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);

        act(() => result.current.setFormValues((prev) => ({ ...prev, host: "altro.example.com" })));
        onDirtyChange.mockClear();
        unmount();
        expect(onDirtyChange).toHaveBeenCalledExactlyOnceWith(false);
    });

    it("usa il confronto dato, per le password che contano come modifica appena scritte", async () => {
        const { result } = await renderLoaded({
            isDirty: (current, saved) => current.password !== "" || current.host !== saved.host,
        });

        act(() => result.current.setFormValues((prev) => ({ ...prev, password: "segreta" })));
        expect(result.current.isDirty).toBe(true);
    });

    it("con errori di validazione li mostra, mette a fuoco il primo e non salva", async () => {
        for (const id of ["host", "port"]) {
            const input = document.createElement("input");
            input.id = id;
            document.body.append(input);
        }

        const save = vi.fn();
        const validate = vi.fn((values: Form, data: Dto | null) => ({
            port: values.port > 0 ? undefined : "Porta non valida",
            host: data?.passwordSet ? "Host rifiutato" : undefined,
        }));
        const { result } = await renderLoaded({ save, validate, fieldOrder: ["host", "port"] });

        act(() => result.current.setFormValues((prev) => ({ ...prev, port: 0 })));
        await act(() => result.current.handleSave());

        // La validazione riceve anche l'ultimo DTO: alcune regole dipendono da lì.
        expect(validate).toHaveBeenCalledWith({ ...toForm(serverDto), port: 0 }, serverDto);
        expect(result.current.errors).toEqual({ host: "Host rifiutato", port: "Porta non valida" });
        expect(document.activeElement?.id).toBe("host");
        expect(save).not.toHaveBeenCalled();
        expect(toastSuccess).not.toHaveBeenCalled();
    });

    it("salva, riallinea il modulo alla risposta del server e avvisa", async () => {
        const save = createDeferred<Dto>();
        const saveSpy = vi.fn(() => save.promise);
        const { result } = await renderLoaded({ save: saveSpy, validate: () => ({}) });

        act(() => {
            result.current.setErrors({ host: "vecchio errore" });
            result.current.setFormValues((prev) => ({ ...prev, host: "  nuovo.example.com  " }));
        });

        let saving!: Promise<void>;
        act(() => {
            saving = result.current.handleSave();
        });

        expect(result.current.isSaving).toBe(true);
        // Un secondo clic mentre salva non parte.
        await act(() => result.current.handleSave());
        expect(saveSpy).toHaveBeenCalledTimes(1);
        expect(saveSpy).toHaveBeenCalledWith({ ...toForm(serverDto), host: "  nuovo.example.com  " });
        // Una validazione riuscita toglie gli errori del tentativo precedente.
        expect(result.current.errors).toEqual({});

        await act(async () => {
            save.resolve({ host: "nuovo.example.com", port: 587, passwordSet: true });
            await saving;
        });

        expect(result.current.isSaving).toBe(false);
        // Il valore ripulito dal server, non quello con gli spazi: il modulo non resta "modificato".
        expect(result.current.formValues.host).toBe("nuovo.example.com");
        expect(result.current.isDirty).toBe(false);
        expect(toastSuccess).toHaveBeenCalledExactlyOnceWith("Salvato");
    });

    it("se il salvataggio fallisce avvisa e lascia il modulo com'era", async () => {
        const { result } = await renderLoaded({ save: () => Promise.reject(serverError()) });

        act(() => result.current.setFormValues((prev) => ({ ...prev, host: "nuovo.example.com" })));
        await act(() => result.current.handleSave());

        expect(toastError).toHaveBeenCalledExactlyOnceWith("Salvataggio fallito");
        expect(toastSuccess).not.toHaveBeenCalled();
        expect(result.current.isSaving).toBe(false);
        expect(result.current.formValues.host).toBe("nuovo.example.com");
        expect(result.current.isDirty).toBe(true);
    });

    it("non salva mentre sta ancora caricando", async () => {
        const save = vi.fn();
        const { result } = renderSettingsForm({ load: () => new Promise(() => {}), save });

        await waitFor(() => expect(result.current.isLoading).toBe(true));
        await act(() => result.current.handleSave());

        expect(save).not.toHaveBeenCalled();
    });

    it("`setData` aggiorna i valori salvati senza toccare il modulo", async () => {
        const { result } = await renderLoaded();

        act(() => result.current.setData({ ...serverDto, host: "da.backup.example.com" }));

        expect(result.current.formValues.host).toBe(serverDto.host);
        expect(result.current.savedValues.host).toBe("da.backup.example.com");
        expect(result.current.isDirty).toBe(true);
    });
});
