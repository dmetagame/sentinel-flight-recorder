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

test("guards an unsafe Agent Hub transfer call", async () => {
  const gate = new SentinelGate({ now: () => now });
  const response = await guardedToolCall(gate, {
    id: "tool-2",
    agentId: "agent",
    name: "account_transfer",
    arguments: {
      asset: "USDT",
      amount: "1000"
    }
  });

  assert.equal(response.ok, false);
  assert.equal(response.blocked, true);
  assert.equal(response.sentinel.decision.violations[0].code, "TRANSFER_BLOCKED");
});
