import test from "node:test";
import assert from "node:assert/strict";
import { compilePolicy } from "../src/adapters/qwen.js";

test("compilePolicy falls back deterministically without an API key", async () => {
  const result = await compilePolicy(
    "Trade BTC and ETH only. Risk at most 0.5% per position. Use maximum 3x leverage. Stop trading after losing 2% daily.",
    {},
    {}
  );

  assert.equal(result.source, "deterministic-fallback");
  assert.equal(result.policy.trade.maxRiskPct, 0.5);
  assert.equal(result.policy.trade.maxLeverage, 3);
  assert.deepEqual(result.policy.allowedSymbols, ["BTCUSDT", "ETHUSDT"]);
});
