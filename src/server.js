import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { runBenchmark } from "./bench/run.js";
import { SentinelGate } from "./core/gate.js";
import { createInitialState } from "./core/state.js";
import { compilePolicy, explainDecisionWithQwen } from "./adapters/qwen.js";
import { guardedToolCall } from "./adapters/agent-hub.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicRoot = join(root, "public");
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const sharedState = createInitialState();

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/bench") {
      const payload = await runBenchmark({ writeArtifacts: false });
      sendJson(res, payload);
      return;
    }

    if (req.method === "POST" && req.url === "/api/compile-policy") {
      const body = await readJson(req);
      sendJson(res, await compilePolicy(body.text ?? "", body.policy ?? {}));
      return;
    }

    if (req.method === "POST" && req.url === "/api/evaluate") {
      const body = await readJson(req);
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

    if (req.method === "POST" && req.url === "/api/tool-call") {
      const body = await readJson(req);
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

    const filePath = req.url === "/" ? "index.html" : req.url.slice(1);
    const body = await readFile(join(publicRoot, filePath));
    res.writeHead(200, { "content-type": contentType(filePath) });
    res.end(body);
  } catch (error) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end(error.message);
  }
});

server.listen(port, host, () => {
  console.log(`Sentinel dashboard running at http://${host}:${port}`);
});

function sendJson(res, payload) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function contentType(path) {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "text/plain; charset=utf-8";
  }
}
