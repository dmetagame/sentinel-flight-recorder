import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { encodeMessage, McpMessageBuffer } from "../src/mcp/framing.js";
import { StdioMcpClient } from "../src/adapters/upstream-mcp.js";

test("MCP framing decodes concatenated and split messages", () => {
  const messages = [];
  const buffer = new McpMessageBuffer((message) => messages.push(message));
  const encoded = Buffer.concat([
    encodeMessage({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
    encodeMessage({ jsonrpc: "2.0", id: 2, result: { ok: false } })
  ]);

  buffer.push(encoded.subarray(0, 15));
  buffer.push(encoded.subarray(15));

  assert.equal(messages.length, 2);
  assert.equal(messages[0].id, 1);
  assert.equal(messages[1].id, 2);
});

test("stdio MCP client initializes, lists tools, and calls a fake upstream", { skip: process.env.RUN_STDIO_MCP_TESTS !== "1" }, async () => {
  const fixture = fileURLToPath(new URL("../fixtures/fake-mcp-upstream.js", import.meta.url));
  const client = new StdioMcpClient({
    command: process.execPath,
    args: [fixture],
    timeoutMs: 5_000
  });

  try {
    const init = await client.initialize();
    assert.equal(init.serverInfo.name, "fake-upstream");

    const tools = await client.listTools();
    assert.equal(tools[0].name, "futures_place_order");

    const result = await client.callTool("futures_place_order", { ok: true });
    assert.match(result.content[0].text, /futures_place_order/);
  } finally {
    client.close();
  }
});
