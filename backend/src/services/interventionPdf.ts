import pdfmake from "pdfmake";
import {
    buildCustomerSummaryHeader,
    buildCustomerSummaryInfoSection,
    dualFieldRow,
    loadImageDataUrl,
    pdfStyles,
    sectionBarRow,
    tableLayout,
} from "./pdf/shared";

export type InterventionType = "consegna_materiale" | "intervento_sede" | "intervento_remoto";
export type InterventionStatus = "programmato" | "in_lavorazione" | "completato";

export type InterventionPrintData = {
    id: number;
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
    labLogoUrl: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    collaboratorName: string;
    type: InterventionType;
    status: InterventionStatus;
    /** Resta NULL finché l'intervento è solo programmato: il lavoro non è ancora stato svolto. */
    description: string | null;
    /** Valorizzato solo per gli interventi in sede o da remoto. */
    problem: string | null;
    /** Annotazioni libere: facoltative sempre, quindi la sezione può non esserci. */
    note: string | null;
    interventionDateLabel: string | null;
    startTime: string | null;
    endTime: string | null;
    createdAtLabel: string;
};

export type CustomerInterventionSummaryItem = {
    id: number;
    createdAtLabel: string;
    type: InterventionType;
    status: InterventionStatus;
    description: string | null;
    scheduleLabel: string | null;
};

export type CustomerInterventionsPrintData = {
    customerId: number;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
    labLogoUrl: string;
    rangeLabel?: string;
    interventionCount: number;
    interventions: CustomerInterventionSummaryItem[];
};

export const formatInterventionType = (value: InterventionType) => {
    if (value === "consegna_materiale") {
        return "Consegna materiale";
    }

    if (value === "intervento_sede") {
        return "Intervento in sede";
    }

    return "Intervento da remoto";
};

const formatInterventionStatus = (value: InterventionStatus) => {
    if (value === "in_lavorazione") {
        return "In lavorazione";
    }

    if (value === "completato") {
        return "Completato";
    }

    return "Programmato";
};

const formatTime = (value: string | null) => (value ? value.slice(0, 5) : "-");

const descriptionLabel = (type: InterventionType) =>
    type === "consegna_materiale" ? "Materiali consegnati" : "Assistenza effettuata";

const parseTimeToMinutes = (value: string | null) => {
    if (!value) {
        return null;
    }

    const [hours, minutes] = value.split(":").map(Number);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return null;
    }

    return hours * 60 + minutes;
};

const formatHoursWorked = (startTime: string | null, endTime: string | null) => {
    const start = parseTimeToMinutes(startTime);
    const end = parseTimeToMinutes(endTime);

    if (start == null || end == null || end <= start) {
        return null;
    }

    return ((end - start) / 60).toFixed(2).replace(".", ",");
};

const buildHeader = (intervention: InterventionPrintData, logoDataUrl: string | null) => ({
    columns: [
        logoDataUrl ? { width: 56, image: logoDataUrl, fit: [52, 52] } : { width: 56, text: "" },
        {
            width: "*",
            alignment: "right",
            stack: [
                { text: intervention.labName, style: "brandName", alignment: "right" },
                {
                    text: `${intervention.labAddress}\n${intervention.labEmail}\n${intervention.labPhone}`,
                    style: "brandInfo",
                    alignment: "right",
                },
            ],
        },
    ],
    columnGap: 12,
    margin: [0, 0, 0, 12],
});

const buildCustomerSection = (intervention: InterventionPrintData) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("CLIENTE", 4),
            dualFieldRow("Cliente", intervention.customerName, "Telefono", intervention.customerPhone),
            dualFieldRow("Email", intervention.customerEmail || "-", "Collaboratore", intervention.collaboratorName),
        ],
    },
    layout: tableLayout,
    margin: [0, 0, 0, 8],
});

const buildActivitySection = (intervention: InterventionPrintData) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("REPORT ATTIVITÀ", 4),
            dualFieldRow(
                "Codice",
                `#${intervention.id}`,
                "Data",
                intervention.interventionDateLabel ?? intervention.createdAtLabel
            ),
            dualFieldRow(
                "Tipologia",
                formatInterventionType(intervention.type),
                "Stato",
                formatInterventionStatus(intervention.status)
            ),
            // Il problema riscontrato esiste solo per gli interventi in sede o da remoto.
            ...(intervention.problem
                ? [
                      [{ text: "Problema riscontrato", style: "label", colSpan: 4, margin: [0, 4, 0, 2] }, {}, {}, {}],
                      [{ text: intervention.problem, style: "value", colSpan: 4, margin: [0, 0, 0, 4] }, {}, {}, {}],
                  ]
                : []),
            [
                { text: descriptionLabel(intervention.type), style: "label", colSpan: 4, margin: [0, 4, 0, 2] },
                {},
                {},
                {},
            ],
            [{ text: intervention.description ?? "-", style: "value", colSpan: 4, margin: [0, 0, 0, 4] }, {}, {}, {}],
        ],
    },
    layout: tableLayout,
    margin: [0, 0, 0, 8],
});

const buildTechnicianHoursSection = (intervention: InterventionPrintData) => {
    if (intervention.type === "consegna_materiale") {
        return null;
    }

    const scheduleLabel = intervention.interventionDateLabel
        ? `${intervention.interventionDateLabel} ${formatTime(intervention.startTime)} - ${formatTime(intervention.endTime)}`
        : "-";
    const hoursWorked = formatHoursWorked(intervention.startTime, intervention.endTime);

    return {
        table: {
            widths: [180, "*"],
            body: [
                sectionBarRow("ORE TECNICI", 2),
                [
                    { text: "Tecnico", style: "label" },
                    { text: "Orario", style: "label" },
                ],
                [
                    { text: intervention.collaboratorName, style: "value" },
                    { text: scheduleLabel, style: "value" },
                ],
                ...(hoursWorked
                    ? [
                          [
                              { text: "Ore lavorate", style: "label" },
                              { text: hoursWorked, style: "value" },
                          ],
                      ]
                    : []),
            ],
        },
        layout: tableLayout,
        margin: [0, 0, 0, 8],
    };
};

/**
 * Sezione a sé e non una riga dentro "REPORT ATTIVITA": le note sono di natura diversa dal
 * problema e dal lavoro svolto — accordi col cliente, promemoria — e il cliente che firma il
 * foglio deve poterle distinguere a colpo d'occhio. Quando non ci sono la sezione sparisce,
 * come già fa il problema riscontrato: una barra "NOTE" seguita dal vuoto è peggio che niente.
 */
const buildNotesSection = (intervention: InterventionPrintData) => {
    if (!intervention.note) {
        return null;
    }

    return {
        table: {
            widths: ["*"],
            body: [sectionBarRow("NOTE", 1), [{ text: intervention.note, style: "value", margin: [0, 2, 0, 2] }]],
        },
        layout: tableLayout,
        margin: [0, 0, 0, 8],
    };
};

const buildLegalNoticeSection = () => ({
    stack: [
        {
            text: "I dati del ricevente verranno trattati in base alla normativa europea UE 2016/679 del 27 aprile 2016 (GDPR).",
            style: "fineprint",
        },
        {
            text: "Si dichiara che i lavori sono stati eseguiti ed i materiali installati nel rispetto delle vigenti normative tecniche.",
            style: "fineprint",
            margin: [0, 2, 0, 0],
        },
    ],
    margin: [0, 4, 0, 0],
});

const buildSignatureSection = () => ({
    columns: [
        {
            width: "*",
            text: "",
        },
        {
            width: 220,
            stack: [
                { text: "Firma del cliente", style: "sectionTitle", alignment: "center", margin: [0, 0, 0, 28] },
                {
                    canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 1, lineColor: "#111" }],
                },
            ],
        },
    ],
    margin: [0, 24, 0, 0],
});

type SummaryTableCell = {
    text?: string;
    style?: string;
    colSpan?: number;
    alignment?: "left" | "center" | "right";
    italics?: boolean;
    bold?: boolean;
    fontSize?: number;
    margin?: number[];
    fillColor?: string;
};

const buildCustomerInterventionsTable = (interventions: CustomerInterventionSummaryItem[]) => {
    const body: SummaryTableCell[][] = [
        sectionBarRow("RESOCONTO INTERVENTI", 6),
        [
            { text: "#", style: "summaryHeader" },
            { text: "Creato il", style: "summaryHeader" },
            { text: "Tipo", style: "summaryHeader" },
            { text: "Descrizione", style: "summaryHeader" },
            { text: "Data/Orario", style: "summaryHeader" },
            { text: "Stato", style: "summaryHeader" },
        ],
    ];

    if (interventions.length === 0) {
        body.push([
            {
                text: "Nessun intervento disponibile",
                colSpan: 6,
                alignment: "center",
                italics: true,
                margin: [0, 8, 0, 8],
            },
            {},
            {},
            {},
            {},
            {},
        ]);
    } else {
        for (const intervention of interventions) {
            body.push([
                { text: String(intervention.id), alignment: "center", bold: true },
                { text: intervention.createdAtLabel, alignment: "center" },
                { text: formatInterventionType(intervention.type), bold: true },
                { text: intervention.description ?? "-", fontSize: 8.5 },
                { text: intervention.scheduleLabel ?? "-", alignment: "center" },
                { text: formatInterventionStatus(intervention.status), alignment: "center" },
            ]);
        }
    }

    return {
        table: {
            // Barra di sezione + intestazione colonne: entrambe si ripetono a ogni pagina.
            headerRows: 2,
            widths: [22, 56, 76, "*", 100, 62],
            body,
        },
        layout: tableLayout,
    };
};

export const createInterventionPdfBuffer = async (intervention: InterventionPrintData) => {
    const logoDataUrl = await loadImageDataUrl(intervention.labLogoUrl);
    const hoursSection = buildTechnicianHoursSection(intervention);
    const notesSection = buildNotesSection(intervention);

    const documentDefinition = {
        pageSize: "A4",
        pageMargins: [14, 14, 14, 14],
        defaultStyle: {
            font: "Roboto",
            fontSize: 10,
            color: "#111111",
        },
        content: [
            buildHeader(intervention, logoDataUrl),
            buildCustomerSection(intervention),
            buildActivitySection(intervention),
            ...(hoursSection ? [hoursSection] : []),
            ...(notesSection ? [notesSection] : []),
            buildLegalNoticeSection(),
            buildSignatureSection(),
        ],
        styles: pdfStyles,
    };

    const pdfDocument = pdfmake.createPdf(documentDefinition);

    return await pdfDocument.getBuffer();
};

export const createCustomerInterventionsPdfBuffer = async (customer: CustomerInterventionsPrintData) => {
    const logoDataUrl = await loadImageDataUrl(customer.labLogoUrl);

    const documentDefinition = {
        pageSize: "A4",
        pageMargins: [14, 14, 14, 14],
        defaultStyle: {
            font: "Roboto",
            fontSize: 10,
            color: "#111111",
        },
        content: [
            buildCustomerSummaryHeader(customer, logoDataUrl, `${customer.interventionCount} interventi`),
            buildCustomerSummaryInfoSection(customer),
            buildCustomerInterventionsTable(customer.interventions),
        ],
        styles: pdfStyles,
    };

    const pdfDocument = pdfmake.createPdf(documentDefinition);

    return await pdfDocument.getBuffer();
};
