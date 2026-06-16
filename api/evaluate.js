import { SentinelGate } from "../src/core/gate.js";
import { createInitialState } from "../src/core/state.js";
import { compilePolicy, explainDecisionWithQwen } from "../src/adapters/qwen.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = parseBody(req.body);
  const compiled = body.policyText
    ? await compilePolicy(body.policyText, body.policy ?? {})
    : { policy: body.policy ?? {} };
  const gate = new SentinelGate({
    policy: compiled.policy,
    state: createInitialState(body.state ?? {})
  });
  const result = await gate.handle(body.intent);
  const explanation = await explainDecisionWithQwen(result);
  res.status(200).json({ ...result, explanation, compiledPolicy: compiled });
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body);
  return body;
}
