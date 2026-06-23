import { stdin, stdout } from "node:process";
import { encodeMessage, McpMessageBuffer } from "./mcp/framing.js";
import { localToolList } from "./mcp/known-tools.js";
import { SentinelGate } from "./core/gate.js";
import { createInitialState } from "./core/state.js";
import { mergePolicy } from "./core/policy.js";
import { guardedToolCall } from "./adapters/agent-hub.js";
import { createMcpNextTool, createUpstreamFromEnv } from "./adapters/upstream-mcp.js";

const policy = mergePolicy();
const state = createInitialState();
const gate = new SentinelGate({ policy, state });
const upstream = createUpstreamFromEnv();
let upstreamInitialized = false;
let upstreamTools = null;

const buffer = new McpMessageBuffer((message) => {
  handleMessage(message).catch((error) => {
    if (Object.prototype.hasOwnProperty.call(message, "id")) {
      sendError(message.id, -32603, error.message);
    }
  });
});

stdin.on("data", (chunk) => buffer.push(chunk));
stdin.on("end", () => upstream?.close());
process.on("SIGINT", () => {
  upstream?.close();
  process.exit(0);
});

async function handleMessage(message) {
  if (!Object.prototype.hasOwnProperty.call(message, "id")) {
    return;
  }

  if (message.method === "initialize") {
    sendResult(message.id, {
      protocolVersion: message.params?.protocolVersion ?? "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "sentinel-flight-recorder",
        version: "0.1.0"
      }
    });
    return;
  }

  if (message.method === "ping") {
    sendResult(message.id, {});
    return;
  }

  if (message.method === "tools/list") {
    sendResult(message.id, { tools: await getTools() });
    return;
  }

  if (message.method === "tools/call") {
    const params = message.params ?? {};
    const result = await callGuardedTool({
      id: params.id,
      agentId: "mcp-client",
      name: params.name,
      arguments: params.arguments ?? {}
    });
    logVerdict(params.name, result);
    sendResult(message.id, asMcpToolResult(result));
    return;
  }

  sendError(message.id, -32601, `Unsupported method: ${message.method}`);
}

async function getTools() {
  if (!upstream) {
    return localToolList();
  }

  const tools = await getUpstreamTools();
  return tools.map((tool) => ({
    ...tool,
    description: `[Sentinel guarded] ${tool.description ?? ""}`.trim()
  }));
}

async function callGuardedTool(toolCall) {
  if (!upstream) {
    return guardedToolCall(gate, toolCall);
  }

  const tools = await getUpstreamTools();
  const metadata = tools.find((tool) => tool.name === toolCall.name);
  return guardedToolCall(
    gate,
    toolCall,
    createMcpNextTool(upstream),
    { readOnly: metadata?.annotations?.readOnlyHint === true }
  );
}

async function ensureUpstream() {
  if (!upstream || upstreamInitialized) {
    return;
  }

  await upstream.initialize();
  upstreamInitialized = true;
}

async function getUpstreamTools() {
  await ensureUpstream();
  if (!upstreamTools) {
    upstreamTools = await upstream.listTools();
  }
  return upstreamTools;
}

function asMcpToolResult(result) {
  const isBlocked = result.blocked === true;
  const sentinel = result.sentinel;
  return {
    isError: isBlocked,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sentinel: sentinel ? {
            verdict: sentinel.decision.verdict,
            violations: sentinel.decision.violations,
            modifications: sentinel.decision.modifications,
            receiptHash: sentinel.receipt.receiptHash
          } : null,
          upstream: result.upstream ?? null
        }, null, 2)
      }
    ]
  };
}

function sendResult(id, result) {
  stdout.write(encodeMessage({ jsonrpc: "2.0", id, result }));
}

function sendError(id, code, message) {
  stdout.write(encodeMessage({ jsonrpc: "2.0", id, error: { code, message } }));
}

function logVerdict(toolName, result) {
  if (!result?.sentinel) {
    process.stderr.write(`[sentinel] verdict=passthrough tool=${toolName}\n`);
    return;
  }
  const verdict = result.sentinel.decision?.verdict ?? "unknown";
  const receipt = result.sentinel.receipt?.receiptHash?.slice(0, 12) ?? "-";
  const violations = result.sentinel.decision?.violations ?? [];
  const codes = violations.map((v) => v.code).filter(Boolean).join(",");
  const tail = codes ? ` codes=${codes}` : "";
  process.stderr.write(`[sentinel] verdict=${verdict} tool=${toolName} receipt=${receipt}${tail}\n`);
}
