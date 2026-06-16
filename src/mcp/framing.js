export function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  return Buffer.concat([header, body]);
}

export class McpMessageBuffer {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);

    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const length = readContentLength(header);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;

      if (this.buffer.length < bodyEnd) {
        return;
      }

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.subarray(bodyEnd);
      this.onMessage(JSON.parse(body));
    }
  }
}

function readContentLength(header) {
  const line = header
    .split("\r\n")
    .find((item) => item.toLowerCase().startsWith("content-length:"));

  if (!line) {
    throw new Error("MCP message missing Content-Length header.");
  }

  const value = Number(line.split(":")[1]?.trim());
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid Content-Length header: ${line}`);
  }

  return value;
}
