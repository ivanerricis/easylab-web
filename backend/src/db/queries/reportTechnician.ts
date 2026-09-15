import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { reportTechnicianTable } from "../schema";
import type { NewReportTechnician, UpdateReportTechnician } from "../types";

// Solo scritture: il tecnico di un report si legge insieme al report (`getReportDetailById`).
// Le letture che stavano qui — l'intera tabella, e una riga per coppia report-tecnico — non
// avevano più chiamanti e sono state tolte il 2026-09-15, con le loro rotte GET.

export const createReportTechnician = (data: NewReportTechnician) =>
    db.insert(reportTechnicianTable).values(data).returning();

export const updateReportTechnicianByIds = (reportId: number, technicianId: number, data: UpdateReportTechnician) =>
    db
        .update(reportTechnicianTable)
        .set(data)
        .where(and(eq(reportTechnicianTable.reportId, reportId), eq(reportTechnicianTable.technicianId, technicianId)))
        .returning();

export const deleteReportTechnicianByIds = (reportId: number, technicianId: number) =>
    db
        .delete(reportTechnicianTable)
        .where(and(eq(reportTechnicianTable.reportId, reportId), eq(reportTechnicianTable.technicianId, technicianId)))
        .returning();
