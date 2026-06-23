import test from "node:test";
import assert from "node:assert/strict";
import { runBenchmark } from "../src/bench/run.js";

test("benchmark scenarios pass expected verdicts", async () => {
  const first = await runBenchmark({ writeArtifacts: false });
  const second = await runBenchmark({ writeArtifacts: false });
  assert.equal(first.summary.failed, 0);
  assert.equal(first.summary.total, 20);
  assert.equal(first.summary.receiptMerkleRoot, second.summary.receiptMerkleRoot);
});
