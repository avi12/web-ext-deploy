import fs from "node:fs";
type FormDataValue = string | Buffer | fs.ReadStream;
interface FormDataEntry {
    name: string;
    value: FormDataValue;
    filename?: string;
}
export declare function buildFormData(entries: FormDataEntry[]): {
    headers: {
        "Content-Type": string;
    };
    body: Buffer<ArrayBuffer>;
};
export {};
//# sourceMappingURL=form-data.d.ts.map