import fs from "node:fs";
import path from "node:path";

interface FormDataEntry {
  name: string;
  value: string | Buffer | fs.ReadStream;
  filename?: string;
}

export class FormData {
  private entries: FormDataEntry[] = [];
  private readonly boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;

  append(name: string, value: string | Buffer | fs.ReadStream, options?: { filename?: string }) {
    this.entries.push({ name,
      value,
      filename: options?.filename });
  }

  getHeaders() {
    return {
      "Content-Type": `multipart/form-data; boundary=${this.boundary}`
    };
  }

  getBody() {
    const chunks: Buffer[] = [];

    for (const entry of this.entries) {
      chunks.push(Buffer.from(`--${this.boundary}\r\n`));

      if (entry.filename !== undefined) {
        chunks.push(
          Buffer.from(
            `Content-Disposition: form-data; name="${entry.name}"; filename="${entry.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
          )
        );
      } else {
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="${entry.name}"\r\n\r\n`));
      }

      chunks.push(this.readValue(entry.value));
      chunks.push(Buffer.from("\r\n"));
    }

    chunks.push(Buffer.from(`--${this.boundary}--\r\n`));

    return Buffer.concat(chunks);
  }

  private readValue(value: string | Buffer | fs.ReadStream) {
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
}

export function createFormDataStream(zipPath: string, channel?: string) {
  const formData = new FormData();
  formData.append("upload", zipPath, { filename: path.basename(zipPath) });
  if (channel) {
    formData.append("channel", channel);
  }
  return formData;
}
