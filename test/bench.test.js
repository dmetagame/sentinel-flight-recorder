import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runBenchmark } from "../src/bench/run.js";

test("benchmark scenarios pass expected verdicts", async () => {
  const first = await runBenchmark({ writeArtifacts: false });
  const second = await runBenchmark({ writeArtifacts: false });
  assert.equal(first.summary.failed, 0);
  assert.equal(first.summary.total, 20);
  assert.equal(first.summary.receiptMerkleRoot, second.summary.receiptMerkleRoot);
});

test("committed anchor matches benchmark Merkle root when present", async () => {
  const root = (await readFile("evidence/benchmark/receipt-merkle-root.txt", "utf8")).trim();
  let anchorRaw;
  try {
    anchorRaw = await readFile("evidence/benchmark/anchor-tx.json", "utf8");
  } catch {
    return;
  }

  const anchor = JSON.parse(anchorRaw);
  assert.equal(anchor.merkleRoot, root);
  assert.equal(anchor.chainId, 97);
  assert.match(anchor.txHash, /^0x[0-9a-fA-F]{64}$/);
  assert.match(anchor.scanner, /^https:\/\/testnet\.bscscan\.com\/tx\/0x[0-9a-fA-F]{64}$/);
});
