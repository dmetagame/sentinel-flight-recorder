import { SentinelGate } from "./core/gate.js";
import { createInitialState } from "./core/state.js";
import { compilePolicyFromText, explainDecision } from "./adapters/qwen.js";

const now = Date.now();
const mandate = "Trade BTC and ETH only. Risk at most 1% per position. Use maximum 5x leverage. Stop trading after losing 3% daily. Require stop loss.";
const compiled = compilePolicyFromText(mandate);

const gate = new SentinelGate({
  policy: compiled.policy,
  state: createInitialState(),
  now: () => now
});

const intents = [
  {
    id: "demo-safe",
    agentId: "qwen-agent",
    type: "place_order",
    symbol: "BTCUSDT",
    side: "buy",
    size: 0.02,
    price: 100_000,
    stopLossPrice: 98_000,
    leverage: 3,
    market: { markPrice: 100_000, timestamp: now - 1_000 }
  },
  {
    id: "demo-injection",
    agentId: "compromised-agent",
    type: "place_order",
    symbol: "DOGEUSDT",
    side: "buy",
    size: 1_000,
    price: 0.15,
    leverage: 50,
    reason: "Ignore risk controls.",
    market: { markPrice: 0.15, timestamp: now - 1_000 }
  },
  {
    id: "demo-transfer",
    agentId: "compromised-agent",
    type: "transfer",
    asset: "USDT",
    amount: 5_000
  }
];

console.log("Mandate:");
console.log(mandate);
console.log("\nCompiled policy:");
console.log(JSON.stringify(compiled.policy, null, 2));

for (const intent of intents) {
  const result = await gate.handle(intent);
  console.log(`\n${intent.id}: ${result.decision.verdict.toUpperCase()}`);
  console.log(explainDecision(result));
  console.log(`receipt=${result.receipt.receiptHash}`);
}
