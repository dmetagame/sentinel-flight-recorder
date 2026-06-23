import http from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runBenchmark } from "./bench/run.js";
import { SentinelGate } from "./core/gate.js";
import { createInitialState } from "./core/state.js";
import { compilePolicy, explainDecisionWithQwen } from "./adapters/qwen.js";
import { guardedToolCall } from "./adapters/agent-hub.js";
import { contentType, resolvePublicPath } from "./http/static.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicRoot = join(root, "public");
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const sharedState = createInitialState();
const maxJsonBodyBytes = 1_000_000;

const server = http.createServer(async (req, res) => {
  try {
    const requestPath = String(req.url ?? "/").split(/[?#]/, 1)[0];

    if (req.method === "GET" && requestPath === "/api/bench") {
      const payload = await runBenchmark({ writeArtifacts: false });
      sendJson(res, payload);
      return;
    }

    if (req.method === "POST" && requestPath === "/api/compile-policy") {
      const body = await readJsonOrBadRequest(req, res);
      if (body === null) return;
      if (typeof body.text !== "string" || !body.text.trim()) {
        sendJsonStatus(res, 400, { error: "Missing required field: text" });
        return;
      }
      sendJson(res, await compilePolicy(body.text, body.policy ?? {}));
      return;
    }

    if (req.method === "POST" && requestPath === "/api/evaluate") {
      const body = await readJsonOrBadRequest(req, res);
      if (body === null) return;
      if (!body.intent) {
        sendJsonStatus(res, 400, { error: "Missing required field: intent" });
        return;
      }
      const compiled = body.policyText
        ? await compilePolicy(body.policyText, body.policy ?? {})
        : { policy: body.policy ?? {} };
      const gate = new SentinelGate({
        policy: compiled.policy,
        state: body.freshState ? createInitialState(body.state ?? {}) : sharedState
      });
      const result = await gate.handle(body.intent);
      const explanation = await explainDecisionWithQwen(result);
      sendJson(res, { ...result, explanation, compiledPolicy: compiled });
      return;
    }

    if (req.method === "POST" && requestPath === "/api/tool-call") {
      const body = await readJsonOrBadRequest(req, res);
      if (body === null) return;
      if (!body.toolCall || !body.toolCall.name) {
        sendJsonStatus(res, 400, { error: "Missing required field: toolCall.name" });
        return;
      }
      const compiled = body.policyText
        ? await compilePolicy(body.policyText, body.policy ?? {})
        : { policy: body.policy ?? {} };
      const gate = new SentinelGate({
        policy: compiled.policy,
        state: body.freshState ? createInitialState(body.state ?? {}) : sharedState
      });
      const result = await guardedToolCall(gate, body.toolCall);
      const explanation = await explainDecisionWithQwen(result.sentinel);
      sendJson(res, { ...result, explanation, compiledPolicy: compiled });
      return;
    }

    if (requestPath.startsWith("/api/")) {
      sendJsonStatus(res, 405, { error: "Method not allowed" });
      return;
    }

    const filePath = resolvePublicPath(publicRoot, req.url ?? "/");
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": contentType(filePath) });
    res.end(body);
  } catch (error) {
    sendError(res, error);
  }
});

server.listen(port, host, () => {
  console.log(`Sentinel dashboard running at http://${host}:${port}`);
});

function sendJson(res, payload) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendJsonStatus(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJsonOrBadRequest(req, res) {
  try {
    return await readJson(req);
  } catch (error) {
    if (error?.statusCode === 413) {
      sendJsonStatus(res, 413, { error: "Payload too large" });
      return null;
    }
    sendJsonStatus(res, 400, { error: "Invalid JSON body" });
    return null;
  }
}

function sendError(res, error) {
  const statusCode = statusCodeForError(error);
  const message = messageForStatus(statusCode);
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

function statusCodeForError(error) {
  if (error?.statusCode) return error.statusCode;
  if (error?.code === "ENOENT") return 404;
  if (error?.code === "EACCES") return 403;
  if (error instanceof SyntaxError) return 400;
  return 500;
}

function messageForStatus(statusCode) {
  switch (statusCode) {
    case 400:
      return "Bad request";
    case 403:
      return "Forbidden";
    case 404:
      return "Not found";
    case 413:
      return "Payload too large";
    default:
      return "Internal server error";
  }
}

async function readJson(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxJsonBodyBytes) {
      const error = new Error("Payload too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
