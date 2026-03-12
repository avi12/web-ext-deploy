import fs from "node:fs";

type FormDataValue = string | Buffer | fs.ReadStream;

interface FormDataEntry {
  name: string;
  value: FormDataValue;
  filename?: string;
}

function readValue(value: FormDataValue) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof fs.ReadStream) {
    try {
      return fs.readFileSync(value.path);
    } finally {
      if (!value.destroyed) {
        value.destroy();
      }
    }
  }

  return Buffer.from(value, "utf8");
}

export function buildFormData(entries: FormDataEntry[]) {
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
  const chunks: Buffer[] = [];

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
