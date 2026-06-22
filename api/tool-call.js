import { SentinelGate } from "../src/core/gate.js";
import { createInitialState } from "../src/core/state.js";
import { compilePolicy, explainDecisionWithQwen } from "../src/adapters/qwen.js";
import { guardedToolCall } from "../src/adapters/agent-hub.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body;
  try {
    body = parseBody(req.body);
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  if (!body || typeof body !== "object" || !body.toolCall || !body.toolCall.name) {
    res.status(400).json({ error: "Missing required field: toolCall.name" });
    return;
  }

  const compiled = body.policyText
    ? await compilePolicy(body.policyText, body.policy ?? {})
    : { policy: body.policy ?? {} };
  const gate = new SentinelGate({
    policy: compiled.policy,
    state: createInitialState(body.state ?? {})
  });
  const result = await guardedToolCall(gate, body.toolCall);
  const explanation = await explainDecisionWithQwen(result.sentinel);
  res.status(200).json({ ...result, explanation, compiledPolicy: compiled });
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") return body.trim() ? JSON.parse(body) : {};
  return body;
}
