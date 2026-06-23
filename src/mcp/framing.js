export function encodeMessage(message) {
  return Buffer.from(`${JSON.stringify(message)}\n`, "utf8");
}

export class McpMessageBuffer {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);

    while (true) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd === -1) {
        return;
      }

      const line = this.buffer.subarray(0, lineEnd).toString("utf8").replace(/\r$/, "");
      this.buffer = this.buffer.subarray(lineEnd + 1);
      if (line.trim()) {
        this.onMessage(JSON.parse(line));
      }
    }
  }
}
