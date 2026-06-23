import { stdin, stdout } from "node:process";
import { encodeMessage, McpMessageBuffer } from "../src/mcp/framing.js";

const buffer = new McpMessageBuffer((message) => {
  console.error(`fake-message:${message.method}`);
  if (!Object.prototype.hasOwnProperty.call(message, "id")) {
    return;
  }

  if (message.method === "initialize") {
    send(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "fake-upstream", version: "0.0.0" }
    });
    return;
  }

  if (message.method === "tools/list") {
    send(message.id, {
      tools: [
        {
          name: "futures_place_order",
          description: "Fake futures order",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: false, destructiveHint: true }
        },
        {
          name: "futures_modify_order",
          description: "Fake futures order modification",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: false, destructiveHint: true }
        },
        {
          name: "futures_cancel_orders",
          description: "Unsupported fake write tool",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: false, destructiveHint: true }
        },
        {
          name: "transfer",
          description: "Fake account transfer",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: false, destructiveHint: true }
        },
        {
          name: "futures_get_ticker",
          description: "Fake read-only ticker",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: true, destructiveHint: false }
        }
      ]
    });
    return;
  }

  if (message.method === "tools/call") {
    send(message.id, {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            echoed: message.params
          })
        }
      ]
    });
    return;
  }

  stdout.write(encodeMessage({
    jsonrpc: "2.0",
    id: message.id,
    error: {
      code: -32601,
      message: `Unsupported method ${message.method}`
    }
  }));
});

console.error("fake-start");
stdin.on("data", (chunk) => {
  console.error(`fake-data:${chunk.length}`);
  buffer.push(chunk);
});
setInterval(() => {}, 1_000_000);
stdin.resume();

function send(id, result) {
  stdout.write(encodeMessage({ jsonrpc: "2.0", id, result }));
}
