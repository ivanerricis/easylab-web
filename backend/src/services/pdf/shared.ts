import path from "node:path";
import pdfmake from "pdfmake";

/**
 * Parti comuni ai PDF di report e interventi: font, palette, primitive di tabella e il
 * frontespizio dei riepiloghi per cliente.
 *
 * Prima ognuno dei due generatori aveva la propria copia identica di tutto questo, e i
 * token grafici (il blu #2A75B9, i corpi carattere) comparivano quattro volte fra i blocchi
 * `styles`. È la duplicazione che costa di più fra quelle rimaste: un cambio di colore o di
 * logo richiedeva quattro modifiche coordinate, e dimenticarne una non rompe niente in
 * compilazione — produce un PDF sbagliato in mano al cliente.
 */

const pdfmakeRoot = path.dirname(require.resolve("pdfmake/package.json"));

const fontDescriptors = {
    Roboto: {
        normal: path.join(pdfmakeRoot, "fonts", "Roboto", "Roboto-Regular.ttf"),
        bold: path.join(pdfmakeRoot, "fonts", "Roboto", "Roboto-Medium.ttf"),
        italics: path.join(pdfmakeRoot, "fonts", "Roboto", "Roboto-Italic.ttf"),
        bolditalics: path.join(pdfmakeRoot, "fonts", "Roboto", "Roboto-MediumItalic.ttf"),
    },
};

// Registrazione globale in pdfmake: va fatta una volta sola, e importare questo modulo la
// garantisce a chiunque generi un PDF.
pdfmake.addFonts(fontDescriptors);

const brandColor = "#2A75B9";
const mutedColor = "#555555";

/**
 * Stili condivisi da tutti i documenti. È un sovrainsieme: pdfmake risolve gli stili per
 * nome quando incontra `style: "..."`, quindi le voci non usate da un documento non
 * costano nulla, mentre tenerle insieme fa sì che il blu del marchio sia una costante
 * invece di dieci letterali sparsi.
 */
export const pdfStyles = {
    brandName: {
        fontSize: 15,
        bold: true,
        color: brandColor,
    },
    brandInfo: {
        fontSize: 10.5,
        lineHeight: 1.25,
    },
    metaTitle: {
        fontSize: 13,
        bold: true,
        color: brandColor,
    },
    metaDate: {
        fontSize: 10.5,
    },
    sectionTitle: {
        fontSize: 11,
        bold: true,
        color: brandColor,
    },
    sectionBar: {
        fontSize: 10.5,
        bold: true,
        color: brandColor,
    },
    label: {
        fontSize: 9,
        color: mutedColor,
    },
    value: {
        fontSize: 11.75,
        bold: true,
    },
    summaryHeader: {
        fontSize: 9,
        bold: true,
        color: brandColor,
    },
    paymentLabel: {
        fontSize: 9,
        color: mutedColor,
    },
    fineprint: {
        fontSize: 7.5,
        italics: true,
        color: mutedColor,
    },
};

export const tableLayout = {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => "#111",
    vLineColor: () => "#111",
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => 4,
    paddingBottom: () => 4,
};

export const sectionBarCell = (title: string, colSpan?: number) => ({
    text: title,
    style: "sectionBar",
    alignment: "center",
    fillColor: "#E7ECF3",
    ...(colSpan == null ? {} : { colSpan }),
});

export const sectionBarRow = (title: string, colSpan: number) => {
    const row = new Array(colSpan).fill({});
    row[0] = sectionBarCell(title, colSpan);
    return row;
};

export const dualFieldRow = (label1: string, value1: string, label2: string, value2: string) => [
    { text: label1, style: "label" },
    { text: value1, style: "value" },
    { text: label2, style: "label" },
    { text: value2, style: "value" },
];

export type LoadedImage = {
    content: Buffer;
    contentType: string;
};

// Il logo serve in due forme diverse: i PDF lo vogliono incorporato come data URL,
// le email come allegato inline (i client di posta bloccano le immagini `data:`).
// Lo scaricamento è lo stesso, quindi sta qui una volta sola.
export const loadImage = async (imageUrl: string): Promise<LoadedImage | null> => {
    try {
        const response = await fetch(imageUrl);

        if (!response.ok) {
            return null;
        }

        return {
            content: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get("content-type") ?? "image/png",
        };
    } catch {
        return null;
    }
};

export const loadImageDataUrl = async (imageUrl: string) => {
    const image = await loadImage(imageUrl);

    if (!image) {
        return null;
    }

    return `data:${image.contentType};base64,${image.content.toString("base64")}`;
};

/** I campi che i riepiloghi per cliente hanno in comune, qualunque cosa elenchino. */
export type CustomerSummaryHeaderData = {
    customerId: number;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
    rangeLabel?: string;
};

const buildCustomerSummaryMetaBlock = (customer: CustomerSummaryHeaderData, countLabel: string) => ({
    table: {
        widths: [140],
        body: [
            [
                {
                    stack: [
                        { text: `Cliente #${customer.customerId}`, style: "metaTitle", alignment: "right" },
                        ...(customer.rangeLabel
                            ? [{ text: customer.rangeLabel, style: "metaDate", alignment: "right" as const }]
                            : []),
                        { text: countLabel, style: "metaDate", alignment: "right" },
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
    margin: [0, 0, 0, 0],
});

/**
 * @param countLabel Riga in basso nel riquadro a destra ("12 report", "12 interventi"):
 *   è l'unica cosa che cambia fra i due riepiloghi.
 */
export const buildCustomerSummaryHeader = (
    customer: CustomerSummaryHeaderData,
    logoDataUrl: string | null,
    countLabel: string
) => ({
    columns: [
        {
            width: "*",
            columns: [
                ...(logoDataUrl
                    ? [{ width: 56, image: logoDataUrl, fit: [52, 52], margin: [0, 0, 0, 0] }]
                    : [{ width: 56, text: "" }]),
                {
                    width: "*",
                    stack: [
                        { text: customer.labName, style: "brandName" },
                        {
                            text: `${customer.labAddress}\n${customer.labEmail}\n${customer.labPhone}`,
                            style: "brandInfo",
                        },
                    ],
                    margin: [0, 0, 0, 0],
                },
            ],
        },
        {
            width: "auto",
            ...buildCustomerSummaryMetaBlock(customer, countLabel),
        },
    ],
    columnGap: 12,
    margin: [0, 0, 0, 8],
});

export const buildCustomerSummaryInfoSection = (customer: CustomerSummaryHeaderData) => ({
    table: {
        widths: [90, "*", 90, "*"],
        body: [
            sectionBarRow("CLIENTE", 4),
            dualFieldRow("Cliente", customer.customerName, "Telefono", customer.customerPhone),
            // L'email prende tutta la riga: e' un token che non va a capo e in mezza
            // colonna costringerebbe la tabella a sforare il margine destro.
            // Il conteggio delle voci e' gia' nel riquadro in alto.
            [
                { text: "Email", style: "label" },
                { text: customer.customerEmail || "-", style: "value", colSpan: 3 },
                {},
                {},
            ],
        ],
    },
    layout: tableLayout,
    margin: [0, 0, 0, 8],
});
