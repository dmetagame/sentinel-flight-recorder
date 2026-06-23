import test from "node:test";
import assert from "node:assert/strict";
import benchHandler from "../api/bench.js";
import compilePolicyHandler from "../api/compile-policy.js";
import toolCallHandler from "../api/tool-call.js";

test("serverless bench endpoint returns benchmark summary", async () => {
  const res = createResponse();
  await benchHandler({ method: "GET" }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.summary.total, 20);
  assert.equal(res.body.summary.failed, 0);
});

test("serverless compile-policy endpoint uses deterministic fallback without key", async () => {
  const res = createResponse();
  await compilePolicyHandler({
    method: "POST",
    body: {
      text: "Trade BTC and ETH only. Risk at most 0.5% per position. Use maximum 3x leverage."
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.policy.trade.maxRiskPct, 0.5);
  assert.equal(res.body.policy.trade.maxLeverage, 3);
});

test("serverless tool-call endpoint blocks unsafe transfer", async () => {
  const res = createResponse();
  await toolCallHandler({
    method: "POST",
    body: {
      freshState: true,
      policyText: "Trade BTC and ETH only. Risk at most 1% per position. Use maximum 5x leverage.",
      toolCall: {
        id: "api-transfer",
        agentId: "agent",
        name: "transfer",
        arguments: {
          coin: "USDT",
          amount: "1000"
        }
      }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.blocked, true);
  assert.equal(res.body.sentinel.decision.verdict, "block");
});

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}
