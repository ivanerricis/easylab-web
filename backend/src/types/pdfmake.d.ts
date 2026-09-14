declare module "pdfmake" {
    const pdfmake: {
        addFonts(fonts: Record<string, Record<string, string>>): void;
        setUrlAccessPolicy(callback: (url: string) => boolean): void;
        setLocalAccessPolicy(callback: (filePath: string) => boolean): void;
        createPdf(
            docDefinition: any,
            options?: any
        ): {
            getBuffer(): Promise<Buffer>;
            getStream(): Promise<NodeJS.ReadableStream>;
            getBase64(): Promise<string>;
            getDataUrl(): Promise<string>;
        };
    };

    export default pdfmake;
}
