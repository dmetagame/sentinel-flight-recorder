import test from "node:test";
import assert from "node:assert/strict";
import { SentinelGate } from "../src/core/gate.js";
import { guardedToolCall, toolCallToIntent } from "../src/adapters/agent-hub.js";

const now = Date.parse("2026-06-16T12:00:00.000Z");

test("maps Bitget Agent Hub futures orders to Sentinel intents", () => {
  const intent = toolCallToIntent({
    id: "tool-1",
    agentId: "agent",
    name: "futures_place_order",
    arguments: {
      orders: [
        {
          symbol: "BTCUSDT",
          side: "buy",
          orderType: "market",
          size: "0.01",
          price: "100000",
          presetStopLossPrice: "98000",
          leverage: "3"
        }
      ]
    }
  });

  assert.equal(intent.type, "place_order");
  assert.equal(intent.symbol, "BTCUSDT");
  assert.equal(intent.stopLossPrice, 98000);
});

test("does not coerce an unknown order side to buy", () => {
  const intent = toolCallToIntent({
    id: "tool-side",
    agentId: "agent",
    name: "futures_place_order",
    arguments: {
      orders: [{ symbol: "BTCUSDT", side: "invalid", orderType: "market", size: "0.01", price: "100000" }]
    }
  });

  assert.equal(intent.side, "invalid");
});

test("guards an unsafe Agent Hub transfer call", async () => {
  const gate = new SentinelGate({ now: () => now });
  const response = await guardedToolCall(gate, {
    id: "tool-2",
    agentId: "agent",
    name: "transfer",
    arguments: {
      asset: "USDT",
      amount: "1000"
    }
  });

  assert.equal(response.ok, false);
  assert.equal(response.blocked, true);
  assert.equal(response.sentinel.decision.violations[0].code, "TRANSFER_BLOCKED");
});

test("fails closed for an unmapped Agent Hub write tool", async () => {
  const gate = new SentinelGate({ now: () => now });
  let forwarded = false;
  const response = await guardedToolCall(gate, {
    id: "tool-3",
    agentId: "agent",
    name: "futures_cancel_orders",
    arguments: { symbol: "BTCUSDT", cancelAll: true }
  }, async () => {
    forwarded = true;
  });

  assert.equal(response.blocked, true);
  assert.equal(forwarded, false);
  assert.equal(response.sentinel.decision.violations[0].code, "UNSUPPORTED_WRITE_TOOL");
});

test("verified read-only tools pass through with a receipt", async () => {
  const gate = new SentinelGate({ now: () => now });
  const response = await guardedToolCall(gate, {
    id: "tool-4",
    agentId: "agent",
    name: "futures_get_ticker",
    arguments: { symbol: "BTCUSDT" }
  }, async (toolCall) => ({ echoed: toolCall.name }), { readOnly: true });

  assert.equal(response.ok, true);
  assert.equal(response.sentinel.decision.verdict, "allow");
  assert.equal(response.upstream.echoed, "futures_get_ticker");
  assert.ok(response.sentinel.receipt.receiptHash);
});

test("rewrites modified futures order fields before forwarding", async () => {
  const gate = new SentinelGate({ now: () => now });
  let forwarded;
  const response = await guardedToolCall(gate, {
    id: "tool-5",
    agentId: "agent",
    name: "futures_modify_order",
    arguments: {
      symbol: "ETHUSDT",
      newSize: "1",
      newPrice: "4000",
      _sentinel: { side: "buy", market: { markPrice: 4000, timestamp: now - 1_000 } }
    }
  }, async (toolCall) => {
    forwarded = toolCall;
    return { ok: true };
  });

  assert.equal(response.modified, true);
  assert.equal(forwarded.arguments.newPresetStopLossPrice, "3920");
  assert.equal("_sentinel" in forwarded.arguments, false);
});

test("blocks batch orders until every order can be independently gated", async () => {
  const gate = new SentinelGate({ now: () => now });
  const response = await guardedToolCall(gate, {
    id: "tool-6",
    agentId: "agent",
    name: "futures_place_order",
    arguments: { orders: [{ symbol: "BTCUSDT" }, { symbol: "ETHUSDT" }] }
  });

  assert.equal(response.blocked, true);
  assert.equal(response.sentinel.decision.violations[0].code, "BATCH_ORDER_UNSUPPORTED");
});
