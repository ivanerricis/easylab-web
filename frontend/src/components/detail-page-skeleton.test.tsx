import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DetailPageSkeleton, { detailSkeletonVariantForPath } from "./detail-page-skeleton";
import { renderWithProviders } from "@/test/render";

describe("detailSkeletonVariantForPath", () => {
    it("sceglie la forma dall'indirizzo", () => {
        expect(detailSkeletonVariantForPath("/reports/3174")).toBe("report");
        expect(detailSkeletonVariantForPath("/interventions/8012")).toBe("intervention");
        expect(detailSkeletonVariantForPath("/clients/5")).toBe("person");
        expect(detailSkeletonVariantForPath("/clients/5/interventions")).toBe("person");
        expect(detailSkeletonVariantForPath("/collaborators/2")).toBe("person");
        expect(detailSkeletonVariantForPath("/technicians/2")).toBe("person");
    });
});

describe("DetailPageSkeleton", () => {
    it.each(["report", "intervention", "person"] as const)("la forma %s è uno stato di caricamento", (variant) => {
        renderWithProviders(<DetailPageSkeleton variant={variant} />);

        const status = screen.getByRole("status");
        expect(status).toHaveAttribute("aria-busy", "true");
        expect(status).toHaveTextContent("Caricamento in corso");
    });
});
