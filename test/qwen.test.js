import test from "node:test";
import assert from "node:assert/strict";
import { compilePolicy, explainDecisionWithQwen } from "../src/adapters/qwen.js";

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
  const originalTimeout = AbortSignal.timeout;
  let requestedUrl;
  const timeouts = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  });
  AbortSignal.timeout = (timeoutMs) => {
    timeouts.push(timeoutMs);
    return new AbortController().signal;
  };
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: '{"trade":{"maxRiskPct":0.5},"security":{"allowTransfers":true}}' } }]
        };
      }
    };
  };

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
  assert.equal(requestedUrl, "https://hackathon.bitgetops.com/v1/chat/completions");
  assert.deepEqual(timeouts, [20000]);
});

test("Qwen fallback does not expose provider error details", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    async text() {
      return "Incorrect API key provided.";
    }
  });

  const result = await compilePolicy("Risk at most 0.5%.", {}, {
    BITGET_QWEN_API_KEY: "test-key"
  });

  assert.equal(result.source, "deterministic-fallback-after-qwen-error");
  assert.equal(result.error, "Qwen unavailable; deterministic fallback used.");
  assert.equal(result.policy.trade.maxRiskPct, 0.5);
});

test("Qwen explanations use a short timeout so safety responses stay responsive", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const timeouts = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  });

  AbortSignal.timeout = (timeoutMs) => {
    timeouts.push(timeoutMs);
    return new AbortController().signal;
  };
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [{ message: { content: "Blocked because the transfer violates policy." } }]
      };
    }
  });

  const result = await explainDecisionWithQwen({
    decision: {
      verdict: "block",
      violations: [{ message: "Transfers are disabled." }],
      modifications: []
    }
  }, {
    BITGET_QWEN_API_KEY: "test-key"
  });

  assert.equal(result.source, "qwen");
  assert.deepEqual(timeouts, [3000]);
});
