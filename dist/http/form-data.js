import fs from "node:fs";
function readValue(value) {
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (value instanceof fs.ReadStream) {
        return fs.readFileSync(value.path);
    }
    if (fs.existsSync(value)) {
        return fs.readFileSync(value);
    }
    return Buffer.from(value);
}
export function buildFormData(entries) {
    const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
    const chunks = [];
    for (const entry of entries) {
        const disposition = `Content-Disposition: form-data; name="${entry.name}"`;
        const fileHeader = entry.filename !== undefined
            ? `${disposition}; filename="${entry.filename}"\r\nContent-Type: application/octet-stream`
            : disposition;
        chunks.push(Buffer.from(`--${boundary}\r\n${fileHeader}\r\n\r\n`));
        chunks.push(readValue(entry.value));
        chunks.push(Buffer.from("\r\n"));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return {
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: Buffer.concat(chunks)
    };
}
