import test from "node:test";
import assert from "node:assert/strict";
import { runBenchmark } from "../src/bench/run.js";

test("benchmark scenarios pass expected verdicts", async () => {
  const { summary } = await runBenchmark({ writeArtifacts: false });
  assert.equal(summary.failed, 0);
  assert.equal(summary.total, 20);
});
