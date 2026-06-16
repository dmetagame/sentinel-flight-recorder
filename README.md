# Sentinel Flight Recorder

Sentinel is an MCP-native safety benchmark and execution-control plane for autonomous Bitget trading agents.

It sits between an AI agent and Bitget Agent Hub. Read-only calls pass through. Dangerous execution calls are inspected by a deterministic policy engine before they can reach an exchange adapter.

The hackathon thesis:

> Before autonomous trading agents get execution rights, they need a control plane that can prove they trade safely.

## Why This Is Track 2

Bitget Agent Hub gives developers execution tools. Sentinel adds the missing infrastructure around those tools:

- pre-trade policy enforcement
- duplicate-order protection
- stop-loss and leverage checks
- daily-loss circuit breakers
- prompt-injection and unsafe-intent benchmarking
- flight-recorder receipts for every agent action

This is not a trading bot. It is infrastructure that any trading bot can plug into.

## Quick Start

No runtime dependencies are required.

```bash
npm test
npm run bench
npm run demo
npm run dev
```

Then open `http://localhost:8787`.

For Qwen setup, see [docs/SETUP.md](docs/SETUP.md).
For hackathon submission text and demo flow, see [SUBMISSION.md](SUBMISSION.md).

## Core Flow

```text
Qwen / agent / strategy
        |
        v
Trade intent
        |
        v
Sentinel Gate
        |
        +--> deterministic policy engine
        +--> idempotency guard
        +--> paper executor
        +--> flight-recorder audit log
        |
        v
Bitget Agent Hub adapter
```

## Agent Hub Boundary

`src/adapters/agent-hub.js` contains the current Agent Hub adapter boundary.

It maps Bitget tool calls such as:

- `futures_place_order`
- `futures_modify_order`
- `futures_set_leverage`
- `spot_place_order`
- `account_transfer`

into Sentinel intents. Blocked calls never reach the upstream adapter. Modified calls are rewritten before forwarding.

Sentinel also has a stdio MCP proxy entrypoint:

```bash
npm run mcp:proxy
```

To place Sentinel in front of an upstream Agent Hub MCP process:

```bash
export SENTINEL_UPSTREAM_COMMAND="npx"
export SENTINEL_UPSTREAM_ARGS="-y bitget-mcp-server"
npm run mcp:proxy
```

## What The Benchmark Proves

`npm run bench` sends adversarial trading intents through Sentinel:

- 50x leverage attempts
- missing stop loss
- duplicate order spam
- stale market data
- unsupported symbols
- transfer attempts
- daily loss circuit breaker
- oversized risk

The output is written to `artifacts/` as JSONL receipts plus a markdown summary.
The receipts are also summarized into a Merkle root so a demo run can be referenced as a tamper-evident batch.

## Qwen Role

Qwen is used for policy compilation and explanation, not authorization.

- Qwen may convert natural-language mandates into policy JSON.
- Qwen may explain why an action was blocked or modified.
- Qwen never decides whether a trade executes.

Final authorization is always deterministic JavaScript.

Set `BITGET_QWEN_API_KEY` to enable live Qwen calls. Without a key, Sentinel uses deterministic fallbacks so the demo stays reproducible.

## Demo Story

1. A reasonable BTC trade is allowed.
2. A trade without stop loss is repaired with a deterministic stop.
3. An oversized position is resized to 1% account risk.
4. A 50x leverage instruction is capped or blocked.
5. A duplicated order is rejected.
6. A transfer attempt is blocked.
7. A daily-loss breach activates the circuit breaker.
8. The dashboard shows every decision and audit receipt.

## Current Status

This repository is the hackathon MVP scaffold:

- deterministic risk engine
- MCP-like gate abstraction
- paper execution adapter
- red-team benchmark
- static dashboard
- Node test coverage

Next polish targets are real Bitget Agent Hub tool mapping, Qwen live policy compilation, and signed/Merkle flight-recorder receipts.
