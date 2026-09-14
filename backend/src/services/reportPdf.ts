import pdfmake from "pdfmake";
import {
    buildCustomerSummaryHeader,
    buildCustomerSummaryInfoSection,
    dualFieldRow,
    loadLogoDataUrl,
    pdfStyles,
    sectionBarCell,
    sectionBarRow,
    tableLayout,
} from "./pdf/shared";

/** Altezza A4 in punti, come la usa pdfmake. */
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 14;

/** Righe vuote di "Lavoro eseguito": alte quanto basta per scriverci a mano. */
const WORK_ROW_COUNT = 4;
const WORK_ROW_MIN_HEIGHT = 12;
const WORK_ROW_TARGET_HEIGHT = 18;

/**
 * Padding verticale delle righe: e' la leva con cui lo spazio che avanza viene
 * ridistribuito su tutte le sezioni invece di gonfiare solo "Lavoro eseguito".
 */
const ROW_PADDING_MIN = 2.5;
const ROW_PADDING_MAX = 8;

const CONTENT_END_ID = "reportContentEnd";

type MeasuredNode = {
    id?: string;
    startPosition?: { top: number; pageNumber: number };
};

type MeasureCallback = (top: number, pageNumber: number) => void;

export type ReportPrintData = {
    id: number;
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
    customerName: string;
    customerPhone: string;
    deviceName: string;
    issueDescription: string;
    serviceDescription: string | null;
    note: string;
    password: string;
    dataBackup: boolean;
    charger: boolean;
    alerted: boolean;
    totalPrice: number;
    createdAtLabel: string;
};

export type CustomerReportSummaryItem = {
    id: number;
    createdAtLabel: string;
    deviceName: string;
    issueDescription: string;
    closed: boolean;
    alerted: boolean;
    paymentMethod: "non_paid" | "cash" | "card";
    totalPrice: number;
};

export type CustomerReportsPrintData = {
    customerId: number;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
    rangeLabel?: string;
    reportCount: number;
    reports: CustomerReportSummaryItem[];
};

const yesNo = (value: boolean) => (value ? "Si" : "No");

const formatPaymentMethod = (value: CustomerReportSummaryItem["paymentMethod"]) => {
    if (value === "cash") {
        return "Contanti";
    }

    if (value === "card") {
        return "Carta";
    }

    return "Non pagato";
};

const formatEuro = (value: number) =>
    new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);

const formatOptionalEuro = (value: number) => (Number.isFinite(value) && value > 0 ? formatEuro(value) : "");

// Il report singolo stampa due copie sulla stessa pagina: serve un passo piu' stretto
// delle tabelle di resoconto, poi allargato quanto serve per riempire il foglio.
const reportTableLayout = (rowPadding: number) => ({
    ...tableLayout,
    paddingTop: () => rowPadding,
    paddingBottom: () => rowPadding,
});

// Le righe da compilare a mano: font minimo cosi' l'altezza naturale non fa da pavimento
// e la loro altezza resta governata da `heights`.
const emptyCell = () => ({ text: "", fontSize: 1, margin: [0, 0, 0, 0] });

const buildFilledCell = (value: string) => ({
    text: value,
    alignment: "center" as const,
    bold: true,
    margin: [0, 13, 0, 13],
});

const cashIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2A75B9" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M5 10.5h1" />
    <path d="M18 13.5h1" />
</svg>`;

const cardIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2A75B9" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
    <path d="M6 14h4" />
    <path d="M6 16h2.5" />
</svg>`;

const euroIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2A75B9" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.5 6.8a6.6 6.6 0 1 0 0 10.4" />
    <path d="M4.5 10.5h9.5" />
    <path d="M4.5 13.5h8.5" />
</svg>`;

const fullWidthRow = (text: string, style: string, margin: number[]) => [
    { text, style, colSpan: 4, margin },
    {},
    {},
    {},
];

const buildReportMetaBlock = (report: ReportPrintData) => ({
    table: {
        widths: [120],
        body: [
            [
                {
                    stack: [
                        { text: `Report #${report.id}`, style: "metaTitle", alignment: "right" },
                        { text: report.createdAtLabel, style: "metaDate", alignment: "right" },
                    ],
                },
            ],
        ],
    },
    layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => "#2A75B9",
        vLineColor: () => "#2A75B9",
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 4,
        paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 0],
});

const buildHeader = (report: ReportPrintData, logoDataUrl: string | null, compact = false) => ({
    columns: compact
        ? [
              {
                  width: "*",
                  text: "",
              },
              {
                  width: "auto",
                  ...buildReportMetaBlock(report),
              },
          ]
        : [
              {
                  width: "*",
                  columns: [
                      ...(logoDataUrl
                          ? [{ width: 56, image: logoDataUrl, fit: [52, 52], margin: [0, 0, 0, 0] }]
                          : [{ width: 56, text: "" }]),
                      {
                          width: "*",
                          stack: [
                              { text: report.labName, style: "brandName" },
                              {
                                  text: `${report.labAddress}\n${report.labEmail}\n${report.labPhone}`,
                                  style: "brandInfo",
                              },
                          ],
                          margin: [0, 0, 0, 0],
                      },
                  ],
              },
              {
                  width: "auto",
                  ...buildReportMetaBlock(report),
              },
          ],
    columnGap: 12,
    margin: [0, 0, 0, 5],
});

type ReportsTableCell = {
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

const buildCustomerReportsTable = (reports: CustomerReportSummaryItem[]) => {
    const body: ReportsTableCell[][] = [
        sectionBarRow("RESOCONTO REPORT", 7),
        [
            { text: "#", style: "summaryHeader" },
            { text: "Data", style: "summaryHeader" },
            { text: "Dispositivo", style: "summaryHeader" },
            { text: "Problema", style: "summaryHeader" },
            { text: "Stato", style: "summaryHeader" },
            { text: "Pagamento", style: "summaryHeader" },
            { text: "Totale", style: "summaryHeader" },
        ],
    ];

    if (reports.length === 0) {
        body.push([
            { text: "Nessun report disponibile", colSpan: 7, alignment: "center", italics: true, margin: [0, 8, 0, 8] },
            {},
            {},
            {},
            {},
            {},
            {},
        ]);
    } else {
        for (const report of reports) {
            body.push([
                { text: String(report.id), alignment: "center", bold: true },
                { text: report.createdAtLabel, alignment: "center" },
                { text: report.deviceName, bold: true },
                { text: report.issueDescription, fontSize: 8.5 },
                { text: report.closed ? "Chiuso" : "Aperto", alignment: "center" },
                { text: formatPaymentMethod(report.paymentMethod), alignment: "center" },
                { text: formatEuro(report.totalPrice), alignment: "right", bold: true },
            ]);
        }

        const totalAmount = reports.reduce((sum, report) => sum + report.totalPrice, 0);
        body.push([
            { text: "Totale complessivo", colSpan: 6, alignment: "right", bold: true, fillColor: "#F4F8FD" },
            {},
            {},
            {},
            {},
            {},
            { text: formatEuro(totalAmount), alignment: "right", bold: true, fillColor: "#F4F8FD" },
        ]);
    }

    return {
        table: {
            // Barra di sezione + intestazione colonne: entrambe si ripetono a ogni pagina.
            headerRows: 2,
            widths: [28, 56, 92, "*", 56, 68, 68],
            body,
        },
        layout: tableLayout,
    };
};

const sectionMargin = (compact: boolean) => (compact ? [0, 0, 0, 4] : [0, 0, 0, 5]);

const buildCustomerSection = (report: ReportPrintData, rowPadding: number, compact = false) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("CLIENTE", 4),
            dualFieldRow("Cliente", report.customerName, "Telefono", report.customerPhone),
        ],
    },
    layout: reportTableLayout(rowPadding),
    margin: sectionMargin(compact),
});

const buildDeviceSection = (report: ReportPrintData, rowPadding: number, compact = false) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("DISPOSITIVO", 4),
            dualFieldRow("Dispositivo", report.deviceName, "Password", report.password),
            dualFieldRow("Backup dati", yesNo(report.dataBackup), "Alimentatore", yesNo(report.charger)),
        ],
    },
    layout: reportTableLayout(rowPadding),
    margin: sectionMargin(compact),
});

const buildDetailsSection = (report: ReportPrintData, rowPadding: number, compact = false) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("DETTAGLI", 4),
            fullWidthRow("Problema riscontrato", "label", [0, 1, 0, 0]),
            fullWidthRow(report.issueDescription, "value", [0, 0, 0, 1]),
            fullWidthRow("Note", "label", [0, 1, 0, 0]),
            fullWidthRow(report.note, "value", [0, 0, 0, 1]),
        ],
    },
    layout: reportTableLayout(rowPadding),
    margin: sectionMargin(compact),
});

// Avvertenza sui tempi di ritiro: va solo sulla copia che resta al cliente.
const buildRetentionNoticeSection = () => ({
    text: "I dispositivi vanno ritirati dal cliente entro 60gg dalla consegna (anche quelli non riparati), dopo tale termine il laboratorio non risponde di eventuali smarrimenti degli stessi.",
    style: "fineprint",
    margin: [0, 0, 0, 4],
});

const buildWorkSection = (report: ReportPrintData, rowHeight: number, rowPadding: number) => {
    const serviceDescription = report.serviceDescription?.trim();

    // Se l'intervento ha gia' una descrizione scritta in digitale, va stampata: le righe
    // vuote servono solo quando manca, per lasciare spazio da compilare a mano.
    const bodyRows = serviceDescription
        ? [
              [{ text: serviceDescription, rowSpan: WORK_ROW_COUNT, fontSize: 9, margin: [2, 2, 2, 2] }],
              ...Array.from({ length: WORK_ROW_COUNT - 1 }, () => [{}]),
          ]
        : Array.from({ length: WORK_ROW_COUNT }, () => [emptyCell()]);

    return {
        table: {
            widths: ["*"],
            // La prima riga e' la barra di sezione, le altre restano vuote da compilare a mano.
            heights: (row: number) => (row === 0 ? "auto" : rowHeight),
            body: [sectionBarRow("LAVORO ESEGUITO", 1), ...bodyRows],
        },
        layout: reportTableLayout(rowPadding),
        margin: [0, 0, 0, 5],
    };
};

const boxedTable = (title: string, cell: object, rowPadding: number) => ({
    table: {
        widths: ["*"],
        heights: (row: number) => (row === 0 ? "auto" : 42),
        body: [sectionBarRow(title, 1), [cell]],
    },
    layout: reportTableLayout(rowPadding),
});

const paymentIconCell = (iconSvg: string, label: string) => ({
    stack: [
        { svg: iconSvg, width: 26, height: 26, alignment: "center", margin: [0, 1, 0, 2] },
        { text: label, style: "paymentLabel", alignment: "center" },
    ],
});

const buildAmountCell = (report: ReportPrintData) => ({
    columns: [
        // Icona ancorata al bordo sinistro, importo centrato nello spazio restante.
        { width: 26, stack: [{ svg: euroIconSvg, width: 26, height: 26 }] },
        {
            width: "*",
            text: formatOptionalEuro(report.totalPrice),
            bold: true,
            alignment: "center",
            margin: [0, 6, 0, 0],
        },
    ],
    margin: [0, 8, 0, 8],
});

// Il riquadro in basso a sinistra tiene due voci: "completato" resta da spuntare a
// mano, "avvisato" arriva dal report. Sono una tabella sola a due colonne, non due riquadri
// affiancati, cosi' barra di sezione e riga sotto condividono altezza e bordi — come fa
// gia' "PAGAMENTO" con le sue due caselle.
const buildWorkAndAlertBox = (report: ReportPrintData, rowPadding: number) => ({
    table: {
        widths: ["*", "*"],
        heights: (row: number) => (row === 0 ? "auto" : 42),
        // "COMPLETATO" e non "LAVORO ESEGUITO": a 10,5 pt quest'ultimo misura 91,3 pt
        // contro i ~79 di mezza casella, andrebbe a capo e la barra su due righe alzerebbe
        // questo riquadro rispetto a quelle di "IMPORTO" e "PAGAMENTO".
        body: [
            [sectionBarCell("COMPLETATO"), sectionBarCell("AVVISATO")],
            [buildFilledCell(""), buildFilledCell(report.alerted ? yesNo(report.alerted) : "")],
        ],
    },
    layout: reportTableLayout(rowPadding),
});

const buildNotesAndPaymentSection = (report: ReportPrintData, rowPadding: number) => ({
    columns: [
        {
            width: "33%",
            ...buildWorkAndAlertBox(report, rowPadding),
        },
        {
            width: "33%",
            ...boxedTable("IMPORTO", buildAmountCell(report), rowPadding),
        },
        {
            width: "34%",
            table: {
                widths: ["*", "*"],
                heights: (row: number) => (row === 0 ? "auto" : 42),
                body: [
                    sectionBarRow("PAGAMENTO", 2),
                    [paymentIconCell(cashIconSvg, "Contanti"), paymentIconCell(cardIconSvg, "Carta")],
                ],
            },
            layout: reportTableLayout(rowPadding),
        },
    ],
    columnGap: 10,
});

const createSectionedReportPdfBuffer = async (report: ReportPrintData, logoDataUrl: string | null) => {
    const copyBlock = (rowPadding: number, compact: boolean) => [
        buildHeader(report, logoDataUrl, compact),
        buildCustomerSection(report, rowPadding, compact),
        buildDeviceSection(report, rowPadding, compact),
        buildDetailsSection(report, rowPadding, compact),
        ...(compact ? [] : [buildRetentionNoticeSection()]),
    ];

    const buildDocumentDefinition = (workRowHeight: number, rowPadding: number, onMeasure?: MeasureCallback) => ({
        pageSize: "A4",
        pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN],
        defaultStyle: {
            font: "Roboto",
            fontSize: 10,
            color: "#111111",
        },
        // Mai forzare interruzioni: l'hook serve solo a leggere dove finisce il contenuto.
        pageBreakBefore: (currentNode: MeasuredNode) => {
            if (currentNode.id === CONTENT_END_ID && currentNode.startPosition) {
                onMeasure?.(currentNode.startPosition.top, currentNode.startPosition.pageNumber);
            }

            return false;
        },
        content: [
            ...copyBlock(rowPadding, false),
            {
                canvas: [
                    {
                        type: "line",
                        x1: 0,
                        y1: 0,
                        x2: 555,
                        y2: 0,
                        lineWidth: 1,
                        dash: { length: 4, space: 3 },
                    },
                ],
                margin: [0, 6, 0, 8],
            },
            ...copyBlock(rowPadding, true),
            buildWorkSection(report, workRowHeight, rowPadding),
            buildNotesAndPaymentSection(report, rowPadding),
            // Sentinella invisibile: la sua posizione di partenza e' la fine del contenuto.
            // Solo nella passata di misura: nel PDF finale il contenuto arriva a filo pagina
            // e questo nodo, per quanto minuscolo, aprirebbe una seconda pagina vuota.
            ...(onMeasure ? [{ id: CONTENT_END_ID, text: " ", fontSize: 1, margin: [0, 0, 0, 0] }] : []),
        ],
        styles: pdfStyles,
    });

    // Impagina una volta e restituisce dove finisce il contenuto (null se sborda di pagina).
    const measureContentBottom = async (workRowHeight: number, rowPadding: number) => {
        let bottom: number | null = null;
        await pdfmake
            .createPdf(
                buildDocumentDefinition(workRowHeight, rowPadding, (top, pageNumber) => {
                    bottom = pageNumber === 1 ? top : null;
                })
            )
            .getBuffer();

        return bottom as number | null;
    };

    // Righe di lavoro all'altezza voluta: quello che avanza va allargato sul resto.
    const baseBottom = await measureContentBottom(WORK_ROW_TARGET_HEIGHT, ROW_PADDING_MIN);

    let workRowHeight = WORK_ROW_MIN_HEIGHT;
    let rowPadding = ROW_PADDING_MIN;

    if (baseBottom !== null) {
        workRowHeight = WORK_ROW_TARGET_HEIGHT;
        // Un punto di margine perche' un arrotondamento non spinga l'ultima riga oltre il bordo.
        const slack = PAGE_HEIGHT - PAGE_MARGIN - baseBottom - 1;

        if (slack > 0) {
            // Quanto costa un punto di padding va misurato, non stimato: dipende da quante
            // righe ci sono e da quali hanno un'altezza fissa che se lo assorbe. La sonda
            // toglie padding invece di aggiungerne: cosi' non puo' sforare di pagina e
            // restituire null proprio quando il foglio e' quasi pieno.
            const probeBottom = await measureContentBottom(WORK_ROW_TARGET_HEIGHT, ROW_PADDING_MIN - 1);
            const costPerPaddingPoint = probeBottom === null ? 0 : baseBottom - probeBottom;

            if (costPerPaddingPoint > 0) {
                const wanted = slack / costPerPaddingPoint;
                rowPadding = ROW_PADDING_MIN + Math.min(wanted, ROW_PADDING_MAX - ROW_PADDING_MIN);
            }

            // Se il padding da solo non basta (o e' arrivato al tetto), il resto lo
            // assorbono le righe di "Lavoro eseguito".
            const leftover = slack - (rowPadding - ROW_PADDING_MIN) * costPerPaddingPoint;

            if (leftover > 0) {
                workRowHeight += leftover / WORK_ROW_COUNT;
            }
        }
    }

    return await pdfmake.createPdf(buildDocumentDefinition(workRowHeight, rowPadding)).getBuffer();
};

export const createReportPdfBuffer = async (report: ReportPrintData) => {
    const logoDataUrl = await loadLogoDataUrl();

    return await createSectionedReportPdfBuffer(report, logoDataUrl);
};

export const createCustomerReportsPdfBuffer = async (customer: CustomerReportsPrintData) => {
    const logoDataUrl = await loadLogoDataUrl();

    const documentDefinition = {
        pageSize: "A4",
        pageMargins: [14, 14, 14, 14],
        defaultStyle: {
            font: "Roboto",
            fontSize: 10,
            color: "#111111",
        },
        content: [
            buildCustomerSummaryHeader(customer, logoDataUrl, `${customer.reportCount} report`),
            buildCustomerSummaryInfoSection(customer),
            buildCustomerReportsTable(customer.reports),
        ],
        styles: pdfStyles,
    };

    const pdfDocument = pdfmake.createPdf(documentDefinition);

    return await pdfDocument.getBuffer();
};
