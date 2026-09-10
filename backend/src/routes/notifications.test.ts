import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../services/notificationManager", () => ({
    getActiveNotifications: vi.fn(),
    dismissNotification: vi.fn(),
}));

import { dismissNotification, getActiveNotifications } from "../services/notificationManager";
import notificationsRouter from "./notifications";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/notifications", notificationsRouter);
    app.use(errorHandler);
    return app;
};

describe("notifications router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("restituisce le notifiche attive", async () => {
        vi.mocked(getActiveNotifications).mockResolvedValue([
            { id: 1, severity: "warning", message: "Backup non riuscito", dedupeKey: "backup-failed" },
        ] as never);

        const response = await request(buildApp()).get("/api/notifications");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
    });

    it("chiude una notifica e risponde 204", async () => {
        vi.mocked(dismissNotification).mockResolvedValue(undefined as never);

        const response = await request(buildApp()).post("/api/notifications/1/dismiss");

        expect(response.status).toBe(204);
        expect(dismissNotification).toHaveBeenCalledWith(1);
    });

    it("rifiuta un id non numerico", async () => {
        const response = await request(buildApp()).post("/api/notifications/abc/dismiss");

        expect(response.status).toBe(400);
        expect(dismissNotification).not.toHaveBeenCalled();
    });

    it("propaga un errore imprevisto all'errorHandler", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(getActiveNotifications).mockRejectedValue(new Error("db down"));

        const response = await request(buildApp()).get("/api/notifications");

        expect(response.status).toBe(500);
    });
});
