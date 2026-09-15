import { Router } from "express";
import { z } from "zod";
import {
    createReportTechnician,
    deleteReportTechnicianByIds,
    updateReportTechnicianByIds,
} from "../db/queries/reportTechnician";
import { validate } from "./validation";

const reportTechniciansRouter = Router();

const reportTechnicianParamsSchema = z.object({
    reportId: z.coerce.number().int().positive(),
    technicianId: z.coerce.number().int().positive(),
});

const reportTechnicianCreateBodySchema = z
    .object({
        reportId: z.coerce.number().int().positive(),
        technicianId: z.coerce.number().int().positive(),
        price: z.coerce.number().int().min(0).optional(),
    })
    .strict();

const reportTechnicianUpdateBodySchema = z
    .object({
        price: z.coerce.number().int().min(0),
    })
    .strict();

// Nessuna rotta GET: il tecnico di un report arriva con `GET /api/reports/:id`. Le due letture che
// stavano qui (l'intera tabella, e la singola coppia report-tecnico) non avevano più chiamanti.

reportTechniciansRouter.post("/", validate({ body: reportTechnicianCreateBodySchema }), async (req, res) => {
    const createdReportTechnician = await createReportTechnician(req.body);

    res.status(201).json(createdReportTechnician[0]);
});

reportTechniciansRouter.put(
    "/:reportId/:technicianId",
    validate({ params: reportTechnicianParamsSchema, body: reportTechnicianUpdateBodySchema }),
    async (req, res) => {
        const { reportId, technicianId } = req.params as unknown as {
            reportId: number;
            technicianId: number;
        };
        const updatedReportTechnician = await updateReportTechnicianByIds(reportId, technicianId, req.body);

        if (updatedReportTechnician.length === 0) {
            res.status(404).json({ message: "Report technician not found" });
            return;
        }

        res.json(updatedReportTechnician[0]);
    }
);

reportTechniciansRouter.delete(
    "/:reportId/:technicianId",
    validate({ params: reportTechnicianParamsSchema }),
    async (req, res) => {
        const { reportId, technicianId } = req.params as unknown as {
            reportId: number;
            technicianId: number;
        };
        const deletedReportTechnician = await deleteReportTechnicianByIds(reportId, technicianId);

        if (deletedReportTechnician.length === 0) {
            res.status(404).json({ message: "Report technician not found" });
            return;
        }

        res.json(deletedReportTechnician[0]);
    }
);

export default reportTechniciansRouter;
