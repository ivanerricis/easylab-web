import type { ReportTechnicianDto } from "@/types/dtos";
import { api } from "./client";

export const createReportTechnician = async (payload: ReportTechnicianDto) =>
    (await api.post<ReportTechnicianDto>("/report-technicians", payload)).data;

export const updateReportTechnician = async (reportId: number, technicianId: number, price: number) =>
    (await api.put<ReportTechnicianDto>(`/report-technicians/${reportId}/${technicianId}`, { price })).data;

export const deleteReportTechnician = async (reportId: number, technicianId: number) =>
    (await api.delete<ReportTechnicianDto>(`/report-technicians/${reportId}/${technicianId}`)).data;
