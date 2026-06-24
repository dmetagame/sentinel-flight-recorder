# Sentinel Flight Recorder

[![CI](https://github.com/dmetagame/sentinel-flight-recorder/actions/workflows/ci.yml/badge.svg)](https://github.com/dmetagame/sentinel-flight-recorder/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-5eead4)
![Track](https://img.shields.io/badge/Bitget%20Hackathon-Track%202%20Trading%20Infra-7dd3fc)
![Bench](https://img.shields.io/badge/bench-20%2F20%20passing-3DD68C)
![Mode](https://img.shields.io/badge/execution-paper--safe-fbbf24)

Sentinel is an MCP-native execution-control plane for autonomous trading agents. It sits as a stdio MCP server between the agent and a Bitget Agent Hub-compatible upstream, inspects supported execution calls against a deterministic policy engine, and emits a Merkle-sealed receipt for every decision. Read-only tools from any annotated MCP upstream can pass through with receipts; unmapped write tools fail closed until an adapter is added.

**Live cockpit:** https://sentinel-flight-recorder.vercel.app

```text
agent  ───►  Sentinel (MCP server)  ───►  Bitget Agent Hub / compatible upstream
                  │
                  ├── deterministic policy gate
                  ├── idempotency guard
                  ├── flight-recorder receipts (allow / modify / block)
                  └── Merkle root over the batch
```

## Install and verify

```bash
git clone https://github.com/dmetagame/sentinel-flight-recorder.git
cd sentinel-flight-recorder
npm ci
npm test
npm run bench
npm run dev
```

Open http://127.0.0.1:8787. The runtime itself uses only Node.js built-ins; the development dependencies generate brand assets.

## Put it in front of Bitget Agent Hub

Add Sentinel to your Claude Desktop / Cursor / Cline MCP config:

```json
{
  "mcpServers": {
    "sentinel": {
      "command": "node",
      "args": ["/absolute/path/to/sentinel-flight-recorder/src/mcp-proxy.js"],
      "env": {
        "SENTINEL_UPSTREAM_COMMAND": "npx",
        "SENTINEL_UPSTREAM_ARGS": "-y bitget-mcp-server --modules spot,futures,account",
        "BITGET_API_KEY": "your-api-key",
        "BITGET_SECRET_KEY": "your-secret-key",
        "BITGET_PASSPHRASE": "your-passphrase"
      }
    }
  }
}
```

The agent calls `tools/list` and sees the official Agent Hub catalog with each description prefixed `[Sentinel guarded]`. Every `tools/call` is routed through the policy gate. Tools explicitly marked `readOnlyHint: true` pass through with a receipt. Mapped execution calls are allowed, rewritten, or blocked. Any write tool without a safe adapter is blocked by default.

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

- [`evidence/benchmark/flight-receipts.jsonl`](evidence/benchmark/flight-receipts.jsonl) — one JSON line per decision with `policyHash`, `intentHash`, `decisionHash`, `executionHash`, `receiptHash`
- [`evidence/benchmark/bench-report.md`](evidence/benchmark/bench-report.md) — pass/fail per scenario and reproduction command
- [`evidence/benchmark/receipt-merkle-root.txt`](evidence/benchmark/receipt-merkle-root.txt) — Merkle root over the batch
- [`evidence/benchmark/anchor-tx.json`](evidence/benchmark/anchor-tx.json) — BSC testnet anchor for the current root

The tracked benchmark is deterministic. Its Merkle root is `8e45148733c5dce6b21642ce4d419491a5a9a647b61fb58c2fcd0810895de261`; rerunning `npm run bench` reproduces the same evidence.

## On-chain anchor

The current Merkle root is published on **BSC testnet** as a self-send tx whose calldata is the 32-byte root. That makes the bench-run evidence cryptographically referenceable from outside this repo.

- Tx: `0x3121857e2e10986e7e0be2c45a01c4481656485b76946270f1a34b0c0e7cd810`
- Explorer: https://testnet.bscscan.com/tx/0x3121857e2e10986e7e0be2c45a01c4481656485b76946270f1a34b0c0e7cd810

```bash
export SENTINEL_ANCHOR_PRIVATE_KEY=0x...      # funded BSC testnet wallet
npm run anchor
```

The script writes `evidence/benchmark/anchor-tx.json` with the tx hash, block number, and BscScan link. The cockpit's `/api/receipts` endpoint surfaces the anchor alongside the receipts.

## Receipts API

```bash
curl http://127.0.0.1:8787/api/receipts?limit=20
```

Returns the bench receipts plus the Merkle root and anchor tx record. Works identically on the deployed Vercel site.

## Why this is Track 2 (Trading Infra)

Bitget Agent Hub exposes execution tools. Sentinel is the missing safety layer those tools need before an autonomous agent can be trusted with them:

- pre-trade policy enforcement (risk, leverage, stop-loss, slippage, allowed symbols)
- duplicate-order and stale-data protection
- daily-loss and consecutive-loss circuit breakers
- transfer and withdraw blocking by default
- adversarial benchmark with reproducible Merkle-rooted evidence
- one-line MCP integration for MCP-speaking agents in the Bitget ecosystem

This is not a trading bot. It is infrastructure any trading bot can plug into.

## Agent Hub tool coverage

`src/adapters/agent-hub.js` maps these Bitget tool shapes into Sentinel intents:

| Tool | Mapped intent | Default policy |
|---|---|---|
| `futures_place_order` | `place_order` | risk + leverage + SL + slippage + duplicate checks |
| `futures_modify_order` | `modify_order` | same as place_order |
| `futures_set_leverage` | `set_leverage` | capped to `policy.trade.maxLeverage` |
| `spot_place_order` | `place_order` | blocked when the policy requires an atomic stop loss |
| `transfer` (`account_transfer` alias) | `transfer` | blocked unless `policy.security.allowTransfers` |
| `withdraw` | `withdraw` | blocked by default |

Read-only status comes from the upstream MCP tool annotation. Unmapped write tools, missing annotations, and batch orders fail closed instead of bypassing policy.

## MCP proxy in front of an upstream

Point Sentinel at the official Bitget Agent Hub MCP server:

```bash
export SENTINEL_UPSTREAM_COMMAND="npx"
export SENTINEL_UPSTREAM_ARGS="-y bitget-mcp-server --modules spot,futures,account --read-only"
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

Set `BITGET_QWEN_API_KEY` to enable live calls. The Bitget-issued hackathon key must use `BITGET_QWEN_BASE_URL=https://hackathon.bitgetops.com/v1`; it will not authenticate against the direct Alibaba Cloud DashScope endpoint. Without a valid key, Sentinel uses a deterministic fallback parser so the demo is reproducible.

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
  mcp/                  standards-compliant stdio framing + local tools
  bench/                20-scenario adversarial benchmark
api/                    Vercel function shims around the core
public/                 vanilla HTML/JS cockpit
fixtures/               fake upstream MCP for end-to-end demos
evidence/benchmark/     tracked reproducible receipts, report, and Merkle root
docs/                   SETUP, DEPLOYMENT, DEMO_SCRIPT
```

## Docs

- [docs/SETUP.md](docs/SETUP.md) — Qwen and local config
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel deploy notes
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — narrated demo flow
- [SUBMISSION.md](SUBMISSION.md) — hackathon submission text
