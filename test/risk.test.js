import test from "node:test";
import assert from "node:assert/strict";
import { SentinelGate } from "../src/core/gate.js";
import { createInitialState } from "../src/core/state.js";
import { mergePolicy } from "../src/core/policy.js";

const now = Date.parse("2026-06-16T12:00:00.000Z");

test("allows a policy-compliant order", async () => {
  const gate = new SentinelGate({ now: () => now });
  const result = await gate.handle({
    type: "place_order",
    symbol: "BTCUSDT",
    side: "buy",
    size: 0.02,
    price: 100_000,
    stopLossPrice: 98_000,
    leverage: 3,
    market: { timestamp: now - 1_000 }
  });

  assert.equal(result.decision.verdict, "allow");
  assert.equal(result.execution.status, "filled");
});

test("repairs missing stop loss", async () => {
  const gate = new SentinelGate({ now: () => now });
  const result = await gate.handle({
    type: "place_order",
    symbol: "ETHUSDT",
    side: "buy",
    size: 1,
    price: 4_000,
    leverage: 2,
    market: { timestamp: now - 1_000 }
  });

  assert.equal(result.decision.verdict, "modify");
  assert.equal(result.decision.intent.stopLossPrice, 3920);
});

test("derives low-priced token stops without rounding onto entry", async () => {
  const gate = new SentinelGate({
    policy: { allowedSymbols: ["DOGEUSDT"] },
    now: () => now
  });
  const result = await gate.handle({
    type: "place_order",
    symbol: "DOGEUSDT",
    side: "buy",
    size: 100,
    price: 0.15,
    leverage: 1,
    market: { markPrice: 0.15, timestamp: now - 1_000 }
  });

  assert.equal(result.decision.verdict, "modify");
  assert.equal(result.decision.intent.stopLossPrice, 0.147);
});

test("blocks daily loss circuit breaker", async () => {
  const gate = new SentinelGate({
    state: createInitialState({ day: { realizedPnlUsd: -350 } }),
    now: () => now
  });
  const result = await gate.handle({
    type: "place_order",
    symbol: "BTCUSDT",
    side: "buy",
    size: 0.01,
    price: 100_000,
    stopLossPrice: 98_000,
    leverage: 3,
    market: { timestamp: now - 1_000 }
  });

  assert.equal(result.decision.verdict, "block");
  assert.equal(result.decision.violations[0].code, "DAILY_LOSS_CIRCUIT_BREAKER");
});

test("blocks duplicate execution intent", async () => {
  const gate = new SentinelGate({ now: () => now });
  const intent = {
    type: "place_order",
    symbol: "BTCUSDT",
    side: "buy",
    size: 0.01,
    price: 100_000,
    stopLossPrice: 98_000,
    leverage: 3,
    market: { timestamp: now - 1_000 }
  };

  await gate.handle({ ...intent, id: "a" });
  const duplicate = await gate.handle({ ...intent, id: "b" });

  assert.equal(duplicate.decision.verdict, "block");
  assert.equal(duplicate.decision.violations[0].code, "DUPLICATE_INTENT");
});

test("blocks malformed orders before execution", async () => {
  const gate = new SentinelGate({ now: () => now });
  const result = await gate.handle({
    type: "place_order",
    symbol: "BTCUSDT",
    side: "buy",
    size: 0,
    price: 100_000,
    stopLossPrice: 98_000,
    leverage: 2,
    market: { timestamp: now - 1_000 }
  });

  assert.equal(result.decision.verdict, "block");
  assert.equal(result.execution, null);
  assert.ok(result.decision.violations.some((item) => item.code === "SIZE_REQUIRED"));
});

test("does not default a missing side to buy", async () => {
  const gate = new SentinelGate({ now: () => now });
  const result = await gate.handle({
    type: "place_order",
    symbol: "BTCUSDT",
    orderType: "market",
    size: 0.01,
    price: 100_000,
    stopLossPrice: 98_000,
    leverage: 2
  });

  assert.equal(result.decision.verdict, "block");
  assert.ok(result.decision.violations.some((item) => item.code === "SIDE_REQUIRED"));
});

test("blocks invalid leverage and wrong-side stop loss", async () => {
  const gate = new SentinelGate({ now: () => now });
  const result = await gate.handle({
    type: "place_order",
    symbol: "BTCUSDT",
    side: "buy",
    orderType: "market",
    size: 0.01,
    price: 100_000,
    stopLossPrice: 102_000,
    leverage: Number.NaN
  });

  assert.equal(result.decision.verdict, "block");
  assert.ok(result.decision.violations.some((item) => item.code === "LEVERAGE_INVALID"));
  assert.ok(result.decision.violations.some((item) => item.code === "STOP_LOSS_INVALID"));
});

test("blocks trading when account equity is not positive", async () => {
  const gate = new SentinelGate({
    state: createInitialState({ account: { equityUsd: 0 } }),
    now: () => now
  });
  const result = await gate.handle({
    type: "place_order",
    symbol: "BTCUSDT",
    side: "buy",
    orderType: "market",
    size: 0.01,
    price: 100_000,
    stopLossPrice: 98_000,
    leverage: 2
  });

  assert.equal(result.decision.verdict, "block");
  assert.ok(result.decision.violations.some((item) => item.code === "ACCOUNT_EQUITY_INVALID"));
});

test("normalizes malformed policy values instead of disabling checks", () => {
  const policy = mergePolicy({
    trade: {
      maxRiskPct: "not-a-number",
      maxLeverage: Number.NaN,
      requireStopLoss: "false",
      allowedSides: ["invalid"]
    },
    data: { maxAgeMs: -1 },
    security: { allowTransfers: "true" },
    allowedSymbols: ["btcusdt", null, "bad symbol"]
  });

  assert.equal(policy.trade.maxRiskPct, 1);
  assert.equal(policy.trade.maxLeverage, 5);
  assert.equal(policy.trade.requireStopLoss, true);
  assert.deepEqual(policy.trade.allowedSides, ["buy", "sell"]);
  assert.equal(policy.data.maxAgeMs, 15_000);
  assert.equal(policy.security.allowTransfers, false);
  assert.deepEqual(policy.allowedSymbols, ["BTCUSDT"]);
});
