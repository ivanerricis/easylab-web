import { Router } from "express";
import { validate } from "./validation";
import { idParamsSchema } from "./crudRouter";
import { dismissNotification, getActiveNotifications } from "../services/notificationManager";

const notificationsRouter = Router();

// Niente try/catch → next: Express 5 passa da sé all'errorHandler gli errori delle funzioni
// async, come in tutte le altre rotte (CHANGELOG del 2026-08-05).
notificationsRouter.get("/", async (_req, res) => {
    res.json(await getActiveNotifications());
});

// Chiusura condivisa: vale per tutti gli utenti. Idempotente, così due schede aperte
// sulla stessa notifica non si scambiano un 404.
notificationsRouter.post("/:id/dismiss", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    await dismissNotification(id);
    res.status(204).end();
});

export default notificationsRouter;
