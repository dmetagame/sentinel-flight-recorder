# Sentinel Flight Recorder

[![CI](https://github.com/dmetagame/sentinel-flight-recorder/actions/workflows/ci.yml/badge.svg)](https://github.com/dmetagame/sentinel-flight-recorder/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-5eead4)
![Track](https://img.shields.io/badge/Bitget%20Hackathon-Track%202%20Trading%20Infra-7dd3fc)
![Bench](https://img.shields.io/badge/bench-20%2F20%20passing-3DD68C)
![Mode](https://img.shields.io/badge/execution-paper--safe-fbbf24)

Sentinel is an MCP-native execution-control plane for autonomous trading agents. It sits as a stdio MCP server between the agent and any upstream tool catalog (Bitget Agent Hub, a paper executor, a Bitget testnet MCP, etc.), inspects every execution call against a deterministic policy engine, and emits a Merkle-sealed receipt for every decision.

**Live cockpit:** https://sentinel-flight-recorder.vercel.app

```text
agent  ───►  Sentinel (MCP server)  ───►  upstream tool catalog
                  │
                  ├── deterministic policy gate
                  ├── idempotency guard
                  ├── flight-recorder receipts (allow / modify / block)
                  └── Merkle root over the batch
```

## Drop it in front of any agent in 30 seconds

Add Sentinel to your Claude Desktop / Cursor / Cline MCP config:

```json
{
  "mcpServers": {
    "sentinel": {
      "command": "node",
      "args": ["/absolute/path/to/sentinel-flight-recorder/src/mcp-proxy.js"],
      "env": {
        "SENTINEL_UPSTREAM_COMMAND": "node",
        "SENTINEL_UPSTREAM_ARGS": "fixtures/fake-mcp-upstream.js"
      }
    }
  }
}
```

That's the whole integration. The agent calls `tools/list` and sees the upstream catalog (with each description prefixed `[Sentinel guarded]`). Every `tools/call` is routed through the policy gate. Read-only calls pass through. Execution calls are allowed, rewritten, or blocked, and every decision is hashed into a receipt you can audit later.

Run without an upstream and Sentinel falls back to a built-in tool catalog so you can demo the gate on its own.

## What the benchmark proves

```bash
npm test           # unit + adapter tests
npm run bench      # 20-scenario adversarial benchmark
npm run demo       # narrated walk-through of allow / modify / block
npm run dev        # local cockpit on http://127.0.0.1:8787
```

`npm run bench` runs 20 adversarial intents through the gate:

| Outcome | Count | Examples |
|---|---:|---|
| Allowed | 2 | Reasonable BTC trade, read-only call |
| Modified | 3 | Missing stop-loss repaired, oversized risk resized, 50x leverage capped |
| Blocked | 15 | Stale market data, transfer attempt, daily-loss circuit breaker, withdraw, duplicate order, unsupported symbol, excessive slippage, portfolio exposure cap, short on long-only mandate, consecutive-loss cooldown, malformed orders, … |

Every run writes:

- `artifacts/flight-receipts.jsonl` — one JSON line per decision with `policyHash`, `intentHash`, `decisionHash`, `executionHash`, `receiptHash`
- `artifacts/bench-report.md` — pass/fail per scenario
- `artifacts/receipt-merkle-root.txt` — Merkle root over the batch

The current root in this repo is `cd344723c76f61085c9d9047a522468fc2f5cd08bf4d14f4ea3efe339aabfbfa`. A demo run can be referenced as that tamper-evident batch.

## Why this is Track 2 (Trading Infra)

Bitget Agent Hub exposes execution tools. Sentinel is the missing safety layer those tools need before an autonomous agent can be trusted with them:

- pre-trade policy enforcement (risk, leverage, stop-loss, slippage, allowed symbols)
- duplicate-order and stale-data protection
- daily-loss and consecutive-loss circuit breakers
- transfer and withdraw blocking by default
- adversarial benchmark with reproducible Merkle-rooted evidence
- one-line MCP integration for any agent in the ecosystem

This is not a trading bot. It is infrastructure any trading bot can plug into.

## Agent Hub tool coverage

`src/adapters/agent-hub.js` maps these Bitget tool shapes into Sentinel intents:

| Tool | Mapped intent | Default policy |
|---|---|---|
| `futures_place_order` | `place_order` | risk + leverage + SL + slippage + duplicate checks |
| `futures_modify_order` | `modify_order` | same as place_order |
| `futures_set_leverage` | `set_leverage` | capped to `policy.trade.maxLeverage` |
| `spot_place_order` | `place_order` | risk + slippage + duplicate checks |
| `account_transfer` | `transfer` | blocked unless `policy.security.allowTransfers` |
| `withdraw` | `withdraw` | blocked by default |

Anything outside this set is treated as read-only and passes straight through.

## MCP proxy in front of an upstream

Point Sentinel at any stdio MCP server (a Bitget Agent Hub MCP, a Bitget testnet MCP, the bundled fake upstream, anything):

```bash
export SENTINEL_UPSTREAM_COMMAND="node"
export SENTINEL_UPSTREAM_ARGS="fixtures/fake-mcp-upstream.js"
npm run mcp:proxy
```

Sentinel will:

1. Spawn the upstream and proxy `initialize` + `tools/list`
2. Prefix every upstream tool description with `[Sentinel guarded]`
3. Route every `tools/call` through the gate
4. Forward only allowed (and possibly rewritten) calls
5. Emit one stderr line per call: `[sentinel] verdict=… tool=… receipt=…`

Stdout stays pure MCP framing so the proxy is invisible to compliant clients.

## Qwen role

Qwen handles natural-language → policy compilation and human-readable explanations, **not** authorization.

- Qwen may convert a mandate like *"trade only BTC and ETH, max 5x leverage, stop trading after 3% daily loss"* into policy JSON.
- Qwen may explain *why* an action was blocked or modified.
- Qwen never decides whether a trade executes — that is always deterministic JavaScript.

Set `BITGET_QWEN_API_KEY` to enable live calls. Without a key, Sentinel uses a deterministic fallback parser so the demo is reproducible.

## Demo flow

1. Reasonable BTC trade → `allow`
2. ETH order without stop loss → `modify` (deterministic stop inserted)
3. Oversized position → `modify` (resized to 1% account risk)
4. 50x leverage instruction → `modify` (capped) or `block`
5. Duplicated order → `block`
6. Transfer attempt → `block`
7. Daily-loss breach → circuit breaker `block`
8. Cockpit shows every decision, receipt hash, and Merkle root

## Security posture

- Paper execution mode by default — no real funds required to demo
- Transfers and withdrawals blocked unless policy explicitly enables them
- Qwen never authorizes execution; deterministic engine is the final gate
- Exchange credentials live in environment, never in the frontend
- Receipts are content-addressed; tampering breaks the Merkle root

## Repo layout

```
src/
  mcp-proxy.js          stdio MCP entrypoint
  server.js             dashboard + REST cockpit
  core/                 gate, policy, risk, hash, merkle, audit, state
  adapters/             agent-hub, qwen, paper-executor, upstream-mcp
  mcp/                  stdio framing + known-tools fallback
  bench/                20-scenario adversarial benchmark
api/                    Vercel function shims around the core
public/                 vanilla HTML/JS cockpit
fixtures/               fake upstream MCP for end-to-end demos
artifacts/              bench output (receipts.jsonl, report.md, merkle root)
docs/                   SETUP, DEPLOYMENT, DEMO_SCRIPT
```

## Docs

- [docs/SETUP.md](docs/SETUP.md) — Qwen and local config
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel deploy notes
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — narrated demo flow
- [SUBMISSION.md](SUBMISSION.md) — hackathon submission text
