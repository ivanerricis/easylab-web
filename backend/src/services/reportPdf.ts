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
    wrapPdfDocument,
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
    /** Solo nel riepilogo del collaboratore, dove i report sono di clienti diversi. */
    customerName?: string;
};

export type CustomerReportsPrintData = {
    customerId: number;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    subjectLabel?: string;
    /** Aggiunge la colonna "Cliente": il riepilogo del collaboratore elenca clienti diversi. */
    showCustomerColumn?: boolean;
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

const fullWidthRow = (text: string, style: string, margin: number[], fontSize?: number) => [
    { text, style, colSpan: 4, margin, ...(fontSize === undefined ? {} : { fontSize }) },
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

const buildCustomerReportsTable = (reports: CustomerReportSummaryItem[], showCustomerColumn = false) => {
    const columnCount = showCustomerColumn ? 8 : 7;
    // Una cella vuota per ogni colonna coperta da un `colSpan`, come vuole pdfmake.
    const spanFillers = (count: number) => new Array<ReportsTableCell>(count).fill({});
    const body: ReportsTableCell[][] = [
        sectionBarRow("RESOCONTO REPORT", columnCount),
        [
            { text: "#", style: "summaryHeader" },
            { text: "Data", style: "summaryHeader" },
            ...(showCustomerColumn ? [{ text: "Cliente", style: "summaryHeader" }] : []),
            { text: "Dispositivo", style: "summaryHeader" },
            { text: "Problema", style: "summaryHeader" },
            { text: "Stato", style: "summaryHeader" },
            { text: "Pagamento", style: "summaryHeader" },
            { text: "Totale", style: "summaryHeader" },
        ],
    ];

    if (reports.length === 0) {
        body.push([
            {
                text: "Nessun report disponibile",
                colSpan: columnCount,
                alignment: "center",
                italics: true,
                margin: [0, 8, 0, 8],
            },
            ...spanFillers(columnCount - 1),
        ]);
    } else {
        for (const report of reports) {
            body.push([
                { text: String(report.id), alignment: "center", bold: true },
                { text: report.createdAtLabel, alignment: "center" },
                ...(showCustomerColumn ? [{ text: report.customerName ?? "-" }] : []),
                { text: report.deviceName, bold: true },
                { text: report.issueDescription, fontSize: 8.5 },
                { text: report.closed ? "Chiuso" : "Aperto", alignment: "center" },
                { text: formatPaymentMethod(report.paymentMethod), alignment: "center" },
                { text: formatEuro(report.totalPrice), alignment: "right", bold: true },
            ]);
        }

        const totalAmount = reports.reduce((sum, report) => sum + report.totalPrice, 0);
        body.push([
            {
                text: "Totale complessivo",
                colSpan: columnCount - 1,
                alignment: "right",
                bold: true,
                fillColor: "#F4F8FD",
            },
            ...spanFillers(columnCount - 2),
            { text: formatEuro(totalAmount), alignment: "right", bold: true, fillColor: "#F4F8FD" },
        ]);
    }

    return {
        table: {
            // Barra di sezione + intestazione colonne: entrambe si ripetono a ogni pagina.
            headerRows: 2,
            // "#" tiene un id a cinque cifre su una riga. Con la colonna "Cliente" le colonne
            // fisse cedono spazio: il problema resta l'unica elastica, e se le fisse lasciano meno
            // della sua parola più lunga pdfmake la allarga oltre il margine destro.
            widths: showCustomerColumn ? [34, 56, 76, 72, "*", 42, 54, 56] : [34, 56, 92, "*", 56, 68, 68],
            body,
        },
        layout: tableLayout,
    };
};

const sectionMargin = (compact: boolean) => (compact ? [0, 0, 0, 4] : [0, 0, 0, 5]);

const buildCustomerSection = (report: ReportPrintData, rowPadding: number, valueFontSize: number, compact = false) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("CLIENTE", 4),
            dualFieldRow("Cliente", report.customerName, "Telefono", report.customerPhone, valueFontSize),
        ],
    },
    layout: reportTableLayout(rowPadding),
    margin: sectionMargin(compact),
});

const buildDeviceSection = (report: ReportPrintData, rowPadding: number, valueFontSize: number, compact = false) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("DISPOSITIVO", 4),
            dualFieldRow("Dispositivo", report.deviceName, "Password", report.password, valueFontSize),
            dualFieldRow("Backup dati", yesNo(report.dataBackup), "Alimentatore", yesNo(report.charger), valueFontSize),
        ],
    },
    layout: reportTableLayout(rowPadding),
    margin: sectionMargin(compact),
});

const buildDetailsSection = (report: ReportPrintData, rowPadding: number, valueFontSize: number, compact = false) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("DETTAGLI", 4),
            fullWidthRow("Problema riscontrato", "label", [0, 1, 0, 0]),
            fullWidthRow(report.issueDescription, "value", [0, 0, 0, 1], valueFontSize),
            fullWidthRow("Note", "label", [0, 1, 0, 0]),
            fullWidthRow(report.note, "value", [0, 0, 0, 1], valueFontSize),
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

/**
 * Come si impagina la ricevuta: altezza delle righe da compilare a mano, padding delle righe e
 * corpo dei valori (nomi, dispositivo, password, problema, note).
 */
type ReceiptLayout = {
    workRowHeight: number;
    rowPadding: number;
    valueFontSize: number;
};

const buildReceiptDefinition = (
    report: ReportPrintData,
    logoDataUrl: string | null,
    { workRowHeight, rowPadding, valueFontSize }: ReceiptLayout,
    onMeasure?: MeasureCallback
) => {
    const copyBlock = (compact: boolean) => [
        buildHeader(report, logoDataUrl, compact),
        buildCustomerSection(report, rowPadding, valueFontSize, compact),
        buildDeviceSection(report, rowPadding, valueFontSize, compact),
        buildDetailsSection(report, rowPadding, valueFontSize, compact),
        ...(compact ? [] : [buildRetentionNoticeSection()]),
    ];

    return {
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
            ...copyBlock(false),
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
            ...copyBlock(true),
            buildWorkSection(report, workRowHeight, rowPadding),
            buildNotesAndPaymentSection(report, rowPadding),
            // Sentinella invisibile: la sua posizione di partenza e' la fine del contenuto.
            // Solo nella passata di misura: nel PDF finale il contenuto arriva a filo pagina
            // e questo nodo, per quanto minuscolo, aprirebbe una seconda pagina vuota.
            ...(onMeasure ? [{ id: CONTENT_END_ID, text: " ", fontSize: 1, margin: [0, 0, 0, 0] }] : []),
        ],
        styles: pdfStyles,
    };
};

/**
 * Impagina una volta e restituisce dove finisce il contenuto (null se sborda dal primo foglio).
 * Esportata per il test che tiene d'occhio `PADDING_COST_PER_POINT`.
 */
export const measureReceiptContentBottom = async (
    report: ReportPrintData,
    logoDataUrl: string | null,
    layout: ReceiptLayout
): Promise<number | null> => {
    let bottom: number | null = null;
    await pdfmake
        .createPdf(
            buildReceiptDefinition(report, logoDataUrl, layout, (top, pageNumber) => {
                bottom = pageNumber === 1 ? top : null;
            })
        )
        .getBuffer();

    return bottom;
};

/**
 * Quanti punti di altezza costa un punto di padding su tutte le righe della ricevuta: 27 righe
 * che crescono col padding, due punti ciascuna (sopra e sotto).
 *
 * Prima si misurava a ogni stampa con un'impaginazione di prova in più (una "sonda" con un punto
 * di padding in meno), e una ricevuta costava tre impaginazioni invece di due. Su tutte le
 * varianti provate il risultato è sempre stato 54 — logo o no, testi corti o lunghi, con o senza
 * descrizione del lavoro — perché dipende da quante righe ha la struttura, non da cosa c'è
 * scritto. Il test con pdfmake vero (`reportPdf.render.test.ts`) lo rimisura su più varianti: se
 * l'impaginato cambia, è lui a dire di aggiornare questo numero.
 */
export const PADDING_COST_PER_POINT = 54;

/**
 * Il corpo dei valori, dal normale (quello dello stile "value") a scendere: si riduce solo se la
 * ricevuta non entra in un foglio, cosa che succede con i campi di testo pieni fino al limite
 * dell'API (problema e note a 255 caratteri entrambi). Sotto 8,5 punti la ricevuta smetterebbe
 * di essere comoda da leggere per chi la ritira.
 */
const VALUE_FONT_SIZES = [pdfStyles.value.fontSize, 10.5, 9.5, 8.5];

/** Distribuisce lo spazio che avanza: prima sul padding di tutte le righe, poi sulle righe a mano. */
const fillPage = (layout: ReceiptLayout, contentBottom: number): ReceiptLayout => {
    // Un punto di margine perche' un arrotondamento non spinga l'ultima riga oltre il bordo.
    const slack = PAGE_HEIGHT - PAGE_MARGIN - contentBottom - 1;

    if (slack <= 0) {
        return layout;
    }

    const extraPadding = Math.min(slack / PADDING_COST_PER_POINT, ROW_PADDING_MAX - layout.rowPadding);
    const leftover = slack - extraPadding * PADDING_COST_PER_POINT;

    return {
        ...layout,
        rowPadding: layout.rowPadding + extraPadding,
        workRowHeight: layout.workRowHeight + (leftover > 0 ? leftover / WORK_ROW_COUNT : 0),
    };
};

/**
 * Sceglie l'impaginazione. Il caso di tutti i giorni costa una sola misura: il contenuto sta nel
 * foglio con le righe a mano all'altezza voluta, e lo spazio che avanza si ridistribuisce.
 * Altrimenti si prova, in quest'ordine, ad abbassare le righe a mano e poi a ridurre il testo, un
 * gradino alla volta: prima la ricevuta usciva su due pagine.
 */
const planReceiptLayout = async (report: ReportPrintData, logoDataUrl: string | null): Promise<ReceiptLayout> => {
    const attempts: ReceiptLayout[] = [
        { workRowHeight: WORK_ROW_TARGET_HEIGHT, rowPadding: ROW_PADDING_MIN, valueFontSize: VALUE_FONT_SIZES[0] },
        ...VALUE_FONT_SIZES.map((valueFontSize) => ({
            workRowHeight: WORK_ROW_MIN_HEIGHT,
            rowPadding: ROW_PADDING_MIN,
            valueFontSize,
        })),
    ];

    for (const layout of attempts) {
        const contentBottom = await measureReceiptContentBottom(report, logoDataUrl, layout);

        if (contentBottom !== null) {
            return fillPage(layout, contentBottom);
        }
    }

    // Non entra nemmeno al minimo: succede solo con testi oltre i limiti che l'API accetta.
    return attempts[attempts.length - 1];
};

const createSectionedReportPdfBuffer = async (report: ReportPrintData, logoDataUrl: string | null) => {
    const layout = await planReceiptLayout(report, logoDataUrl);

    return await pdfmake.createPdf(buildReceiptDefinition(report, logoDataUrl, layout)).getBuffer();
};

export const createReportPdfBuffer = async (report: ReportPrintData) => {
    const logoDataUrl = await loadLogoDataUrl();

    return await createSectionedReportPdfBuffer(report, logoDataUrl);
};

export const createCustomerReportsPdfBuffer = async (customer: CustomerReportsPrintData) => {
    const logoDataUrl = await loadLogoDataUrl();

    const documentDefinition = wrapPdfDocument([
        buildCustomerSummaryHeader(customer, logoDataUrl, `${customer.reportCount} report`),
        buildCustomerSummaryInfoSection(customer),
        buildCustomerReportsTable(customer.reports, customer.showCustomerColumn),
    ]);

    const pdfDocument = pdfmake.createPdf(documentDefinition);

    return await pdfDocument.getBuffer();
};
