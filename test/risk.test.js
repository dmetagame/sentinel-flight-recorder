import test from "node:test";
import assert from "node:assert/strict";
import { SentinelGate } from "../src/core/gate.js";
import { createInitialState } from "../src/core/state.js";

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
