export declare function getFullPath(file: string): string;
export declare function getIsFileExists(file: string): boolean;
export declare function getCorrectZip(zipName: string): string;
export declare function getExtJson(zip: string): Promise<{
    name: string;
    version: string;
    default_locale?: string;
}>;
//# sourceMappingURL=zip.d.ts.map