import pdfmake from "pdfmake";
import { dualFieldRow, loadLogoDataUrl, sectionBarRow, tableLayout, wrapPdfDocument } from "./pdf/shared";
import type { ContractStatus, ContractType } from "../db/schema";
import { formatContractStatus, formatContractType } from "./contractLabels";

/**
 * "Preventivo" è un contratto in bozza: non ancora accettato dal cliente. Ogni altro stato
 * (attivo, annullato, scaduto) è un "Contratto".
 */
export type ContractDocumentKind = "quote" | "contract";

export type ContractPrintData = {
    id: number;
    kind: ContractDocumentKind;
    /** Lo stato effettivo (compreso `expired`). */
    status: ContractStatus;
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
    issuedAtLabel: string;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    customerCity: string | null;
    providerName: string;
    providerContact: string | null;
    providerEmail: string;
    providerPhone: string;
    type: ContractType;
    device: string;
    termLabel: string;
    startDateLabel: string;
    endDateLabel: string;
    note: string | null;
    /** Solo per i contratti di assistenza. */
    assistance: {
        assistanceTypeLabel: string;
        /** "10 h al mese" oppure "Ore illimitate". */
        includedHoursLabel: string;
        coveredInterventionTypes: string[];
    } | null;
    /** Vuoto = la sezione del riepilogo ore non compare. */
    monthlyHours: { monthLabel: string; usedHoursLabel: string; usageLabel: string }[];
};

const brandColor = "#2A75B9";
const alertColor = "#B3261E";

const buildHeader = (contract: ContractPrintData, logoDataUrl: string | null) => ({
    columns: [
        {
            width: "*",
            columns: [
                logoDataUrl ? { width: 56, image: logoDataUrl, fit: [52, 52] } : { width: 56, text: "" },
                {
                    width: "*",
                    stack: [
                        { text: contract.labName, style: "brandName" },
                        {
                            text: `${contract.labAddress}\n${contract.labEmail}\n${contract.labPhone}`,
                            style: "brandInfo",
                        },
                    ],
                },
            ],
        },
        {
            width: "auto",
            table: {
                widths: [140],
                body: [
                    [
                        {
                            stack: [
                                {
                                    text: `${contract.kind === "quote" ? "Preventivo" : "Contratto"} #${contract.id}`,
                                    style: "metaTitle",
                                    alignment: "right",
                                },
                                { text: `Emesso il ${contract.issuedAtLabel}`, style: "metaDate", alignment: "right" },
                            ],
                        },
                    ],
                ],
            },
            layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => brandColor,
                vLineColor: () => brandColor,
                paddingLeft: () => 8,
                paddingRight: () => 8,
                paddingTop: () => 4,
                paddingBottom: () => 4,
            },
        },
    ],
    columnGap: 12,
    margin: [0, 0, 0, 10],
});

/** Riga ben visibile sotto l'intestazione per un contratto annullato o scaduto. */
const buildStatusBanner = (contract: ContractPrintData) => {
    if (contract.kind !== "contract" || (contract.status !== "cancelled" && contract.status !== "expired")) {
        return null;
    }

    return {
        text: contract.status === "cancelled" ? "CONTRATTO ANNULLATO" : "CONTRATTO SCADUTO",
        bold: true,
        fontSize: 14,
        color: alertColor,
        alignment: "center",
        margin: [0, 0, 0, 10],
    };
};

const singleValueRow = (label: string, value: string) => [
    { text: label, style: "label" },
    { text: value, style: "value", colSpan: 3 },
    {},
    {},
];

const buildCustomerSection = (contract: ContractPrintData) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("CLIENTE", 4),
            dualFieldRow("Cliente", contract.customerName, "Telefono", contract.customerPhone || "-"),
            dualFieldRow("Email", contract.customerEmail || "-", "Città", contract.customerCity || "-"),
        ],
    },
    layout: tableLayout,
    margin: [0, 0, 0, 8],
});

const buildProviderSection = (contract: ContractPrintData) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("FORNITORE", 4),
            dualFieldRow("Fornitore", contract.providerName, "Referente", contract.providerContact || "-"),
            dualFieldRow("Email", contract.providerEmail, "Telefono", contract.providerPhone),
        ],
    },
    layout: tableLayout,
    margin: [0, 0, 0, 8],
});

const buildContractDataSection = (contract: ContractPrintData) => {
    const isQuote = contract.kind === "quote";

    return {
        table: {
            widths: [90, "*", 90, "*"],
            body: [
                sectionBarRow(isQuote ? "DATI DEL PREVENTIVO" : "DATI DEL CONTRATTO", 4),
                dualFieldRow("Codice", `#${contract.id}`, "Tipo", formatContractType(contract.type)),
                singleValueRow("Dispositivo", contract.device),
                isQuote
                    ? dualFieldRow(
                          "Decorrenza proposta",
                          contract.startDateLabel,
                          "Durata proposta",
                          contract.termLabel
                      )
                    : dualFieldRow("Stato", formatContractStatus(contract.status), "Durata", contract.termLabel),
                ...(isQuote
                    ? []
                    : [
                          singleValueRow(
                              "Periodo di validità",
                              `dal ${contract.startDateLabel} al ${contract.endDateLabel}`
                          ),
                      ]),
            ],
        },
        layout: tableLayout,
        margin: [0, 0, 0, 8],
    };
};

const buildAssistanceSection = (contract: ContractPrintData) => {
    if (!contract.assistance) {
        return null;
    }

    const { assistanceTypeLabel, includedHoursLabel, coveredInterventionTypes } = contract.assistance;

    return {
        table: {
            widths: [90, "*", 90, "*"],
            body: [
                sectionBarRow("PACCHETTO DI ASSISTENZA", 4),
                dualFieldRow("Assistenza", assistanceTypeLabel, "Ore incluse", includedHoursLabel),
                singleValueRow("Interventi coperti", coveredInterventionTypes.join(", ") || "-"),
                [
                    {
                        text: "Le ore valgono per mese di calendario e non si riportano al mese successivo",
                        style: "fineprint",
                        colSpan: 4,
                    },
                    {},
                    {},
                    {},
                ],
            ],
        },
        layout: tableLayout,
        margin: [0, 0, 0, 8],
    };
};

const buildHoursSection = (contract: ContractPrintData) => {
    // Un preventivo non ha storico: la rotta non lo passa, ma il documento non dipende da questo.
    if (contract.kind === "quote" || contract.monthlyHours.length === 0) {
        return null;
    }

    const includedLabel = contract.assistance?.includedHoursLabel ?? "-";

    return {
        table: {
            // Barra di sezione + intestazione colonne: si ripetono a ogni pagina.
            headerRows: 2,
            widths: ["*", 90, 100, 70],
            body: [
                sectionBarRow("RIEPILOGO ORE", 4),
                [
                    { text: "Mese", style: "summaryHeader" },
                    { text: "Ore usate", style: "summaryHeader", alignment: "right" },
                    { text: "Ore incluse", style: "summaryHeader", alignment: "right" },
                    { text: "Utilizzo", style: "summaryHeader", alignment: "right" },
                ],
                ...contract.monthlyHours.map((entry) => [
                    { text: entry.monthLabel },
                    { text: entry.usedHoursLabel, alignment: "right" },
                    { text: includedLabel, alignment: "right" },
                    { text: entry.usageLabel, alignment: "right" },
                ]),
            ],
        },
        layout: tableLayout,
        margin: [0, 0, 0, 8],
    };
};

const buildNotesSection = (contract: ContractPrintData) => {
    if (!contract.note) {
        return null;
    }

    return {
        table: {
            widths: ["*"],
            body: [sectionBarRow("NOTE", 1), [{ text: contract.note, style: "value", margin: [0, 2, 0, 2] }]],
        },
        layout: tableLayout,
        margin: [0, 0, 0, 8],
    };
};

const buildLegalNoticeSection = (contract: ContractPrintData) => ({
    stack: [
        {
            text: "I dati del cliente verranno trattati in base alla normativa europea UE 2016/679 del 27 aprile 2016 (GDPR).",
            style: "fineprint",
        },
        ...(contract.kind === "quote"
            ? [
                  {
                      text: "Il presente documento è un preventivo e non costituisce contratto fino all'accettazione.",
                      style: "fineprint",
                      margin: [0, 2, 0, 0],
                  },
              ]
            : []),
    ],
    margin: [0, 4, 0, 0],
});

// Copia di quella di interventionPdf.ts, che non la esporta: i due documenti possono divergere.
const buildSignatureBlock = (label: string) => ({
    width: 220,
    stack: [
        { text: label, style: "sectionTitle", alignment: "center", margin: [0, 0, 0, 28] },
        {
            canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 1, lineColor: "#111" }],
        },
    ],
});

const buildSignatureSection = (contract: ContractPrintData) => {
    const isQuote = contract.kind === "quote";

    return {
        columns: [
            { width: "*", text: "" },
            buildSignatureBlock(isQuote ? "Per il laboratorio" : "Firma del laboratorio"),
            buildSignatureBlock(isQuote ? "Per accettazione (il cliente)" : "Firma del cliente"),
        ],
        columnGap: 24,
        margin: [0, 24, 0, 0],
        // Le firme non si spezzano fra due pagine.
        unbreakable: true,
    };
};

export const createContractPdfBuffer = async (contract: ContractPrintData) => {
    const logoDataUrl = await loadLogoDataUrl();
    const banner = buildStatusBanner(contract);
    const assistanceSection = buildAssistanceSection(contract);
    const hoursSection = buildHoursSection(contract);
    const notesSection = buildNotesSection(contract);

    const documentDefinition = wrapPdfDocument(
        [
            buildHeader(contract, logoDataUrl),
            ...(banner ? [banner] : []),
            buildCustomerSection(contract),
            buildProviderSection(contract),
            buildContractDataSection(contract),
            ...(assistanceSection ? [assistanceSection] : []),
            ...(hoursSection ? [hoursSection] : []),
            ...(notesSection ? [notesSection] : []),
            buildLegalNoticeSection(contract),
            buildSignatureSection(contract),
        ],
        [14, 14, 14, 24],
        { pageNumbers: true, watermark: contract.kind === "quote" ? "PREVENTIVO" : undefined }
    );

    const pdfDocument = pdfmake.createPdf(documentDefinition);

    return await pdfDocument.getBuffer();
};
