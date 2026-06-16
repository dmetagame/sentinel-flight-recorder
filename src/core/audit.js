import { sha256, stableStringify } from "./hash.js";

export function createReceipt({ intent, decision, policy, execution, now = Date.now() }) {
  const base = {
    schema: "sentinel.flight_receipt.v1",
    timestamp: new Date(now).toISOString(),
    agentId: intent.agentId ?? "unknown-agent",
    intentId: intent.id ?? null,
    verdict: decision.verdict,
    policyHash: sha256(policy),
    intentHash: sha256(intent),
    decisionHash: sha256({
      verdict: decision.verdict,
      intent: decision.intent,
      violations: decision.violations,
      modifications: decision.modifications
    }),
    executionHash: execution ? sha256(execution) : null,
    decision,
    execution
  };

  return {
    ...base,
    receiptHash: sha256(stableStringify(base))
  };
}
