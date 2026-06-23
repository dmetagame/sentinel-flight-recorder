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

test("Qwen overrides preserve stricter unspecified base-policy fields", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [{ message: { content: '{"trade":{"maxRiskPct":0.5},"security":{"allowTransfers":true}}' } }]
      };
    }
  });

  const result = await compilePolicy("Risk at most 0.5%.", {
    trade: { maxLeverage: 2 },
    portfolio: { maxDailyLossPct: 1 }
  }, {
    BITGET_QWEN_API_KEY: "test-key"
  });

  assert.equal(result.source, "qwen");
  assert.equal(result.policy.trade.maxRiskPct, 0.5);
  assert.equal(result.policy.trade.maxLeverage, 2);
  assert.equal(result.policy.portfolio.maxDailyLossPct, 1);
  assert.equal(result.policy.security.allowTransfers, false);
});
