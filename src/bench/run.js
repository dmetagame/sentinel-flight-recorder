import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SentinelGate } from "../core/gate.js";
import { createInitialState } from "../core/state.js";
import { mergePolicy } from "../core/policy.js";
import { merkleRoot } from "../core/merkle.js";
import { PaperExecutor } from "../adapters/paper-executor.js";
import { scenarios, BENCHMARK_NOW } from "./scenarios.js";

export async function runBenchmark({ writeArtifacts = true } = {}) {
  const outputs = [];

  for (const scenario of scenarios) {
    const state = createInitialState(scenario.statePatch ?? {});
    const gate = new SentinelGate({
      policy: mergePolicy(scenario.policyPatch ?? {}),
      state,
      now: () => BENCHMARK_NOW,
      executor: new PaperExecutor({
        state,
        now: () => BENCHMARK_NOW,
        idFactory: (intent, sequence) => `bench_${intent.id ?? "intent"}_${sequence}`
      })
    });

    if (scenario.duplicateOfPrevious) {
      await gate.handle({
        ...scenario.intent,
        id: "s11-prime"
      });
    }

    const result = await gate.handle(scenario.intent);
    outputs.push({
      scenario: scenario.name,
      category: scenario.category,
      threat: scenario.threat,
      story: scenario.story,
      expected: scenario.expected,
      actual: result.decision.verdict,
      passed: result.decision.verdict === scenario.expected,
      result
    });
  }

  const summary = summarize(outputs);

  if (writeArtifacts) {
    await writeBenchmarkArtifacts(outputs, summary);
  }

  return { outputs, summary };
}

export function summarize(outputs) {
  const total = outputs.length;
  const passed = outputs.filter((item) => item.passed).length;
  const blocked = outputs.filter((item) => item.actual === "block").length;
  const modified = outputs.filter((item) => item.actual === "modify").length;
  const allowed = outputs.filter((item) => item.actual === "allow").length;

  return {
    total,
    passed,
    failed: total - passed,
    passRate: total ? passed / total : 0,
    blocked,
    modified,
    allowed,
    receiptMerkleRoot: merkleRoot(outputs.map((item) => item.result.receipt.receiptHash))
  };
}

async function writeBenchmarkArtifacts(outputs, summary) {
  const root = join(fileURLToPath(new URL("../..", import.meta.url)), "evidence", "benchmark");
  await mkdir(root, { recursive: true });

  const receipts = outputs.map((item) => JSON.stringify(item.result.receipt)).join("\n");
  await writeFile(join(root, "flight-receipts.jsonl"), `${receipts}\n`);
  await writeFile(join(root, "receipt-merkle-root.txt"), `${summary.receiptMerkleRoot}\n`);

  const report = [
    "# Sentinel Bench Report",
    "",
    `- Total scenarios: ${summary.total}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    `- Pass rate: ${(summary.passRate * 100).toFixed(1)}%`,
    `- Allowed: ${summary.allowed}`,
    `- Modified: ${summary.modified}`,
    `- Blocked: ${summary.blocked}`,
    `- Receipt Merkle root: \`${summary.receiptMerkleRoot}\``,
    `- Benchmark clock: \`${new Date(BENCHMARK_NOW).toISOString()}\``,
    "- Reproduce: `npm run bench`",
    "",
    "| Scenario | Expected | Actual | Result |",
    "|---|---:|---:|---|",
    ...outputs.map((item) => {
      return `| ${item.scenario} | ${item.expected} | ${item.actual} | ${item.passed ? "PASS" : "FAIL"} |`;
    }),
    ""
  ].join("\n");

  await writeFile(join(root, "bench-report.md"), report);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outputs, summary } = await runBenchmark();
  for (const item of outputs) {
    const status = item.passed ? "PASS" : "FAIL";
    console.log(`${status} ${item.scenario}: expected=${item.expected} actual=${item.actual}`);
  }
  console.log(JSON.stringify(summary, null, 2));
}
