# Sentinel Flight Recorder

## Track

Track 2: Trading Infra

## One-Liner

Sentinel is the safety control plane that lets any MCP-speaking trading agent prove it can trade safely before it gets execution rights — with deterministic policy enforcement and Merkle-sealed receipts for every decision.

## Live Demo

https://sentinel-flight-recorder.vercel.app

## Project Description (Submission Structure)

### 1. Idea

Autonomous trading agents can call exchange tools faster than a human can inspect them, but the model that proposes a trade should not also be the final authority that approves it. Sentinel Flight Recorder is an MCP-native control plane placed between an agent and Bitget Agent Hub. It converts supported execution calls into normalized intents, evaluates them with deterministic policy, then allows, repairs, or blocks them before forwarding.

The policy covers per-trade risk, leverage, required stop loss, allowed symbols, price deviation, slippage, duplicate calls, total exposure, daily loss, consecutive losses, transfers, and withdrawals. Qwen translates natural-language mandates into policy overrides and explains decisions. It cannot enable transfers and it never performs final authorization. Every decision receives content-addressed hashes and the benchmark receipts are committed under one reproducible Merkle root.

### 2. Progress

The main engineering challenge was separating probabilistic interpretation from deterministic authorization. We solved it by limiting Qwen to policy compilation and explanation while keeping execution decisions in a testable JavaScript risk engine. The second challenge was MCP safety: Agent Hub exposes read/write annotations, so Sentinel passes only tools explicitly marked read-only, maps supported execution shapes, and fails closed for unannotated or unsupported writes. The third challenge was verifiable evidence; deterministic paper IDs and timestamps now make the 20-case receipt bundle and Merkle root reproducible across runs.

Completed:

- standards-compliant newline-delimited stdio MCP proxy
- official Agent Hub `tools/list` annotation handling
- adapters for futures place/modify/leverage, spot place, transfer, and withdraw
- deterministic policy engine, paper executor, receipts, and Merkle benchmark
- Qwen policy compiler/explainer with deterministic fallback
- public cockpit, REST examples, automated tests, CI, and frozen usage evidence

Current limitations and next steps:

- paper execution is the default; no real funds are needed or used for the submission
- batch orders are blocked until each member can be independently evaluated
- unsupported Agent Hub write tools fail closed rather than receiving partial protection
- stale-data and price-deviation checks require market context supplied with the guarded call
- next work is trusted market-data enrichment, additional write-tool adapters, and persistent receipt storage

Stack and APIs: Node.js 20+ ESM, MCP JSON-RPC over stdio, Bitget Agent Hub / `bitget-mcp-server`, Alibaba Qwen `qwen3.6-plus`, Vercel Functions, GitHub Actions, and vanilla HTML/CSS/JavaScript.

### 3. Materials

- GitHub: https://github.com/dmetagame/sentinel-flight-recorder
- Live demo: https://sentinel-flight-recorder.vercel.app
- Reproducible usage record: https://github.com/dmetagame/sentinel-flight-recorder/tree/main/evidence/benchmark
- CI: https://github.com/dmetagame/sentinel-flight-recorder/actions/workflows/ci.yml
- Installation and integration: https://github.com/dmetagame/sentinel-flight-recorder#install-and-verify

### 4. AI Trading Thoughts (Optional)

Agentic trading needs a separation of duties similar to mature financial infrastructure: models can perceive, propose, and explain, while deterministic systems authorize and record. MCP makes that boundary portable across agents, and machine-readable read/write annotations let safety middleware adapt without depending only on tool names. The next useful Agent Hub primitive would be a standard pre-execution context containing fresh market data, account exposure, and declared risk so control planes can verify every write consistently.

## Short Project Description (192 Words)

Sentinel Flight Recorder is an MCP-native execution-control plane for autonomous trading agents. It is a stdio MCP server that drops between any MCP-speaking agent and Bitget Agent Hub-compatible execution tools, then inspects supported write calls against a deterministic policy engine before they can reach the exchange. Annotated read-only MCP tools pass through with receipts; unsupported writes fail closed.

Sentinel enforces per-trade risk, leverage caps, mandatory stop loss, allowed symbols, stale market data, slippage, duplicate orders, daily-loss circuit breakers, portfolio exposure caps, and transfer/withdraw blocking. Qwen can compile natural-language risk mandates into policy JSON and explain decisions in plain language, but final authorization is always deterministic code — Qwen never decides whether a trade executes.

Every gate decision produces a flight-recorder receipt with `policyHash`, `intentHash`, `decisionHash`, `executionHash`, and `receiptHash`, summarized into a Merkle root that makes a bench run referenceable as a tamper-evident batch. A 20-scenario adversarial benchmark sends prompt-injection leverage escalations, missing stops, transfer attempts, stale data, withdrawal attempts, and duplicate orders through the gate. Current pass rate: 20/20.

Sentinel is not a trading bot. It is the safety infrastructure a Bitget Agent Hub-style trading agent can plug into in 30 seconds.

Word count: 192

## Why This Fits Track 2

- It is infrastructure for other AI trading agents, not a standalone strategy
- It speaks MCP, so any compliant agent (Claude Desktop, Cursor, Cline, custom) can adopt it with a one-line config change
- It maps directly to Bitget Agent Hub tool shapes (`futures_place_order`, `futures_modify_order`, `futures_set_leverage`, `spot_place_order`, `transfer`, `withdraw`)
- It solves a real pain point: autonomous agents will make unsafe execution calls and most teams have no paper trail to figure out what happened
- It produces verifiable evidence: 20/20 adversarial scenarios passing, plus per-decision receipts hashed into a Merkle root

## Core Features

- Stdio MCP server that proxies Bitget Agent Hub-compatible tools and annotated read-only MCP tools
- Deterministic policy engine (final authorization, always)
- Qwen policy compiler + explainer with reproducible fallback
- Agent Hub tool-call adapter for the 6 Bitget execution tools
- Paper execution mode by default
- 20-scenario adversarial red-team benchmark
- Flight-recorder receipts with content-addressed hashes
- Merkle-rooted batch evidence
- Cockpit dashboard for judges and operators

## 30-Second Adoption

Add to any MCP client config (Claude Desktop shown):

```json
{
  "mcpServers": {
    "sentinel": {
      "command": "node",
      "args": ["/abs/path/to/sentinel-flight-recorder/src/mcp-proxy.js"],
      "env": {
        "SENTINEL_UPSTREAM_COMMAND": "npx",
        "SENTINEL_UPSTREAM_ARGS": "-y bitget-mcp-server --modules spot,futures,account --read-only"
      }
    }
  }
}
```

Restart the client. The agent now sees the upstream's tools, each prefixed `[Sentinel guarded]`. Every execution call gets gated and receipted.

## Demo Commands

```bash
npm test
npm run bench
npm run demo
npm run dev
```

Local cockpit at http://127.0.0.1:8787.

Stdio MCP proxy:

```bash
npm run mcp:proxy
```

Proxy in front of Bitget Agent Hub:

```bash
export SENTINEL_UPSTREAM_COMMAND="npx"
export SENTINEL_UPSTREAM_ARGS="-y bitget-mcp-server --modules spot,futures,account --read-only"
npm run mcp:proxy
```

## Demo Video Flow

1. Open the cockpit and walk the architecture: agent → Sentinel → upstream
2. Show benchmark summary: 20/20 adversarial cases passing, Merkle root highlighted
3. Compile a natural-language mandate using Qwen (or deterministic fallback)
4. Run a safe BTC order → `allow`
5. Run an ETH order without stop loss → `modify` with deterministic stop
6. Run a prompt-injection 50x leverage instruction → `modify` (capped) or `block`
7. Run a transfer attempt → hard `block`
8. Open a receipt: show `policyHash`, `intentHash`, `decisionHash`, `receiptHash`, Merkle root
9. Close on MCP proxy stderr stream showing live verdicts from a real client

## Evidence

Generated by `npm run bench`:

- `evidence/benchmark/bench-report.md` — 20/20 pass rate, per-scenario verdict table
- `evidence/benchmark/flight-receipts.jsonl` — one JSON line per decision
- `evidence/benchmark/receipt-merkle-root.txt` — reproducible Merkle root: `8e45148733c5dce6b21642ce4d419491a5a9a647b61fb58c2fcd0810895de261`
- Optional `evidence/benchmark/anchor-tx.json` — BSC testnet anchor tx for the Merkle root if you run `npm run anchor`

The receipts are also served live at `GET /api/receipts` so the cockpit and any external auditor can pull the evidence with the Merkle root and optional on-chain anchor in one response.

Benchmark coverage (20 scenarios across 11 categories):

- reasonable compliant trade
- missing stop loss → repaired
- oversized risk → resized
- prompt-injection leverage escalation
- unsupported symbol
- stale market data
- excessive slippage
- transfer attempt
- daily loss circuit breaker
- portfolio exposure cap
- duplicate order
- malformed missing-symbol order
- zero-size order
- negative price
- price far away from market
- long-only mandate drift (short side)
- consecutive-loss cooldown
- explicit leverage-change attempt
- withdrawal attempt
- read-only call pass-through

## Security Position

- No real funds required. Paper execution is the default.
- Transfers and withdrawals blocked unless policy explicitly opts in.
- Qwen never authorizes execution.
- Deterministic policy engine is the final gate.
- Exchange credentials must live in environment, never in the frontend.

## Differentiation

Most hackathon trading agents answer: *"What should I trade?"*

Sentinel answers: *"Can this agent be trusted with execution tools?"*

That makes Sentinel complementary to every Track 1 trading bot and directly useful as Track 2 infrastructure for the entire Bitget Agent Hub ecosystem.
