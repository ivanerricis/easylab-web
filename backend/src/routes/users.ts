import { Router } from "express";
import { z } from "zod";
import {
    adminDisableTwoFactor,
    assertOwnPassword,
    createUser,
    deleteUser,
    listUsers,
    regeneratePassword,
    setUserActive,
} from "../services/authManager";
import { idParamsSchema } from "./crudRouter";
import { validate } from "./validation";

const usersRouter = Router();

const createUserBodySchema = z
    .object({
        username: z.string().trim().min(1).max(50),
    })
    .strict();

usersRouter.get("/", async (_req, res) => {
    res.json(await listUsers());
});

usersRouter.post("/", validate({ body: createUserBodySchema }), async (req, res) => {
    const { username } = req.body as { username: string };

    res.status(201).json(await createUser(username));
});

/**
 * Mai su sé stessi, come "disabilita" ed "elimina". La rotta consegna una password nuova in
 * chiaro senza chiedere quella attuale: sul proprio account significava che una sessione
 * admin rubata bastava a prendersi l'account per sempre, chiudendo fuori il proprietario.
 * Per sé c'è "Cambia password", che la password attuale la chiede.
 */
usersRouter.post("/:id/regenerate-password", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    if (id === req.user!.id) {
        res.status(400).json({ message: 'Per la tua password usa "Cambia password" nelle impostazioni dell\'account' });
        return;
    }

    res.json(await regeneratePassword(id));
});

// Il corpo può mancare del tutto: la password serve solo quando l'admin agisce su di sé.
const disableTwoFactorBodySchema = z
    .object({ password: z.string().min(1).max(512).optional() })
    .strict()
    .optional();

/**
 * Sblocco per il telefono perso senza codici di recupero rimasti.
 *
 * A differenza di "disabilita" ed "elimina" è ammesso anche su sé stessi: togliersi la propria
 * 2FA è l'unico modo che l'admin ha di rientrare senza mettere le mani sulla macchina. Su di
 * sé però chiede la password — il codice no, dato che il telefono è proprio ciò che manca —
 * altrimenti una sessione admin rubata toglierebbe il secondo fattore al suo proprietario.
 */
usersRouter.post(
    "/:id/disable-2fa",
    validate({ params: idParamsSchema, body: disableTwoFactorBodySchema }),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const password = (req.body as { password?: string } | undefined)?.password;

        if (id === req.user!.id) {
            if (!password) {
                res.status(400).json({ message: "Per disattivare la tua verifica in due passaggi serve la password" });
                return;
            }

            await assertOwnPassword(id, password);
        }

        res.json(await adminDisableTwoFactor(id));
    }
);

usersRouter.post("/:id/disable", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    if (id === req.user!.id) {
        res.status(400).json({ message: "Non puoi disabilitare il tuo stesso account" });
        return;
    }

    res.json(await setUserActive(id, false));
});

usersRouter.post("/:id/enable", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    res.json(await setUserActive(id, true));
});

usersRouter.delete("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    if (id === req.user!.id) {
        res.status(400).json({ message: "Non puoi eliminare il tuo stesso account" });
        return;
    }

    await deleteUser(id);
    res.status(204).end();
});

export default usersRouter;
